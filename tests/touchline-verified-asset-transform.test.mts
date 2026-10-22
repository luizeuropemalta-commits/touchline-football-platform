import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { planAssetBackup } from '../scripts/local/verified-asset-backup.mjs';
import { transformVerifiedAssets } from '../scripts/local/verified-asset-transform.mjs';

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'touchline-transform-safety-')));
  console.log(`preserved synthetic transform evidence: ${root}`);
  const source = join(root, 'source');
  await mkdir(source);
  const files = [join(source, 'a'), join(source, 'b')];
  for (const [index, file] of files.entries()) await writeFile(file, `original-${index}`, { flag: 'wx' });
  return { root, source, files, plan: await planAssetBackup(source, files), backupRoot: join(root, 'backup') };
}

test('subset only and verified backup precedes transformer; noop writes nothing', async () => {
  const f = await fixture();
  const noop = await transformVerifiedAssets({ ...f, changedPaths: [], transform: () => { throw Error('must not run'); } });
  assert.equal(noop.status, 'NOOP');
  await assert.rejects(lstat(f.backupRoot), { code: 'ENOENT' });
  const result = await transformVerifiedAssets({ ...f, changedPaths: [f.files[0]], transform: async (bytes, entry) => {
    const receipt = JSON.parse(await readFile(join(f.backupRoot, 'manifest.json'), 'utf8'));
    assert.equal(receipt.status, 'BACKUP_VERIFIED');
    assert.equal(receipt.entries.length, 1);
    assert.equal(await readFile(receipt.entries[0].backup, 'utf8'), 'original-0');
    assert.equal(await readFile(entry.path, 'utf8'), 'original-0');
    entry.path = '/do-not-use-transformer-mutation';
    return Buffer.from(`${bytes}-updated`);
  } });
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.skipped, [f.files[1]]);
  assert.equal(await readFile(f.files[0], 'utf8'), 'original-0-updated');
  assert.equal(await readFile(f.files[1], 'utf8'), 'original-1');
  assert.ok((await readdir(f.backupRoot)).includes('0001-completed.json'));
});

test('backup failure prevents transformation and source writes', async () => {
  const f = await fixture();
  await mkdir(f.backupRoot);
  let calls = 0;
  await assert.rejects(transformVerifiedAssets({ ...f, changedPaths: f.files, transform: () => { calls++; return Buffer.from('bad'); } }), { code: 'EEXIST' });
  assert.equal(calls, 0);
  assert.equal(await readFile(f.files[0], 'utf8'), 'original-0');
  assert.equal(await readFile(f.files[1], 'utf8'), 'original-1');
});

test('WIP divergence after backup refuses publication and preserves staged output', async () => {
  const f = await fixture();
  await assert.rejects(transformVerifiedAssets({ ...f, changedPaths: [f.files[0]], transform: async () => {
    await writeFile(f.files[0], 'user-WIP');
    return Buffer.from('candidate');
  } }), /source diverged/);
  assert.equal(await readFile(f.files[0], 'utf8'), 'user-WIP');
  const failure = JSON.parse(await readFile(join(f.backupRoot, 'transform-failure.json'), 'utf8'));
  assert.deepEqual(failure.completed, []);
  assert.equal(failure.publicationAttempted, false);
  assert.equal(await readFile(failure.staged[0], 'utf8'), 'candidate');
  assert.equal(await readFile(join(f.backupRoot, '0001.backup'), 'utf8'), 'original-0');
});

test('second transform failure preserves first completion and pending source with receipts', async () => {
  const f = await fixture();
  await assert.rejects(transformVerifiedAssets({ ...f, changedPaths: f.files, transform: async (bytes, entry) => {
    if (entry.path === f.files[1]) throw Error('synthetic second failure');
    return Buffer.from(`${bytes}-updated`);
  } }), /synthetic second failure/);
  const failure = JSON.parse(await readFile(join(f.backupRoot, 'transform-failure.json'), 'utf8'));
  assert.equal(failure.completed.length, 1);
  assert.deepEqual(failure.pending, [f.files[1]]);
  assert.equal(await readFile(f.files[0], 'utf8'), 'original-0-updated');
  assert.equal(await readFile(f.files[1], 'utf8'), 'original-1');
  assert.equal(await readFile(join(f.backupRoot, '0001.backup'), 'utf8'), 'original-0');
  assert.equal(await readFile(join(f.backupRoot, '0002.backup'), 'utf8'), 'original-1');
  assert.ok((await readdir(f.backupRoot)).includes('0001-completed.json'));
  await assert.rejects(lstat(join(f.backupRoot, 'transform-result.json')), { code: 'ENOENT' });
});

test('unknown callback failures retain cause, partial receipts and untouched pending source', async () => {
  for (const thrown of [null, undefined, 'synthetic string failure']) {
    const f = await fixture();
    let failureError;
    await assert.rejects(transformVerifiedAssets({ ...f, changedPaths: f.files, transform: async (bytes, entry) => {
      if (entry.path === f.files[1]) throw thrown;
      return Buffer.from(`${bytes}-updated`);
    } }), error => {
      assert.ok(error instanceof Error);
      assert.equal(error.cause, thrown);
      assert.equal(error.message, String(thrown));
      assert.equal(error.partial.completed.length, 1);
      failureError = error;
      return true;
    });
    const report = JSON.parse(await readFile(join(f.backupRoot, 'transform-failure.json'), 'utf8'));
    assert.deepEqual(report, failureError.partial);
    assert.deepEqual(report.pending, [f.files[1]]);
    assert.equal(await readFile(f.files[0], 'utf8'), 'original-0-updated');
    assert.equal(await readFile(f.files[1], 'utf8'), 'original-1');
    assert.ok((await readdir(f.backupRoot)).includes('0001-completed.json'));
    assert.equal(await readFile(join(f.backupRoot, '0002.backup'), 'utf8'), 'original-1');
  }
});

test('report collision preserves original unknown failure and normalized report error', async () => {
  const f = await fixture();
  await assert.rejects(transformVerifiedAssets({ ...f, changedPaths: f.files, transform: async (bytes, entry) => {
    if (entry.path === f.files[1]) {
      await writeFile(join(f.backupRoot, 'transform-failure.json'), 'report-sentinel', { flag: 'wx' });
      throw null;
    }
    return Buffer.from(`${bytes}-updated`);
  } }), error => {
    assert.equal(error.cause, null);
    assert.ok(error.reportError instanceof Error);
    assert.equal(error.reportError.cause.code, 'EEXIST');
    assert.equal(error.partial.completed.length, 1);
    return true;
  });
  assert.equal(await readFile(join(f.backupRoot, 'transform-failure.json'), 'utf8'), 'report-sentinel');
  assert.equal(await readFile(f.files[1], 'utf8'), 'original-1');
});
