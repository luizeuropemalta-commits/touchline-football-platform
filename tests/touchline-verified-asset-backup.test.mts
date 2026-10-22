import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, symlink, lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { planAssetBackup, createVerifiedAssetBackup, verifyAssetSources } from '../scripts/local/verified-asset-backup.mjs';

test('backup and verification snapshot primitive entries before callers mutate their plan', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'touchline-backup-plan-mutation-')));
  console.log(`preserved mutation evidence: ${temp}`);
  const source = join(temp, 'source');
  await mkdir(source);
  const original = join(source, 'original');
  const outside = join(temp, 'outside');
  await writeFile(original, 'original', { flag: 'wx' });
  await writeFile(outside, 'outside-sentinel', { flag: 'wx' });
  for (const mode of ['empty', 'replace', 'fields']) {
    const plan = await planAssetBackup(source, [original]);
    const expected = structuredClone(plan);
    const output = join(temp, mode);
    const pending = createVerifiedAssetBackup(plan, output);
    if (mode === 'empty') plan.entries.length = 0;
    if (mode === 'replace') plan.entries = [{ path: outside, size: 16, sha256: '0'.repeat(64) }];
    if (mode === 'fields') Object.assign(plan.entries[0], { path: outside, size: 16, sha256: '0'.repeat(64) });
    plan.sourceRoot = temp;
    const receipt = await pending;
    assert.equal(receipt.entries.length, 1);
    assert.equal(receipt.sourceRoot, source);
    assert.deepEqual(receipt.entries.map(({ backup, ...entry }) => entry), expected.entries);
    assert.equal(await readFile(receipt.entries[0].backup, 'utf8'), 'original');
    assert.equal(await readFile(outside, 'utf8'), 'outside-sentinel');
  }
  // Invalid original digest cannot become valid by mutation after verification starts.
  for (const mode of ['empty', 'fields']) {
    const plan = await planAssetBackup(source, [original]);
    const validHash = plan.entries[0].sha256;
    plan.entries[0].sha256 = '0'.repeat(64);
    const pending = verifyAssetSources(plan);
    if (mode === 'empty') plan.entries.length = 0;
    else plan.entries[0].sha256 = validHash;
    await assert.rejects(pending, /source diverged/);
  }
  const validPlan = await planAssetBackup(source, [original]);
  const verifying = verifyAssetSources(validPlan);
  Object.assign(validPlan.entries[0], { path: outside, size: 0, sha256: '0'.repeat(64) });
  await verifying;
});

test('verified backup preserves originals and publishes receipt only after copies match', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'touchline-backup-safety-')));
  console.log(`preserved synthetic backup evidence: ${temp}`);
  const source = join(temp, 'source');
  await mkdir(source);
  const a = join(source, 'a.bin'), b = join(source, 'b.bin');
  await writeFile(a, 'original-A', { flag: 'wx' });
  await writeFile(b, 'original-B', { flag: 'wx' });
  const plan = await planAssetBackup(source, [a, b]);
  const output = join(temp, 'backup');
  const receipt = await createVerifiedAssetBackup(plan, output);
  assert.equal(receipt.status, 'BACKUP_VERIFIED');
  assert.equal(receipt.entries.length, 2);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')), receipt);
  for (const entry of receipt.entries) assert.deepEqual(await readFile(entry.backup), await readFile(entry.path));
  await verifyAssetSources(plan);
  await assert.rejects(createVerifiedAssetBackup(plan, output), { code: 'EEXIST' });
  await assert.rejects(createVerifiedAssetBackup(plan, join(source, 'nested')), /invalid backup/);
  await assert.rejects(lstat(join(source, 'nested')), { code: 'ENOENT' });
  const link = join(temp, 'link');
  await symlink(output, link);
  await assert.rejects(createVerifiedAssetBackup(plan, link), { code: 'EEXIST' });
  const dangling = join(temp, 'dangling');
  await symlink(join(temp, 'absent'), dangling);
  await assert.rejects(createVerifiedAssetBackup(plan, dangling), { code: 'EEXIST' });
  await assert.rejects(createVerifiedAssetBackup(plan, join(link, 'child')), /symlink forbidden/);
  const sourceLink = join(source, 'source-link');
  await symlink(a, sourceLink);
  await assert.rejects(planAssetBackup(source, [sourceLink]), /symlink forbidden/);
  await assert.rejects(planAssetBackup(source, [source]), /invalid or duplicate/);
  await assert.rejects(planAssetBackup(source, [a, a]), /invalid or duplicate/);
  await assert.rejects(planAssetBackup(source, []), /nonempty/);
  const subdir = join(source, 'dir');
  await mkdir(subdir);
  await assert.rejects(planAssetBackup(source, [subdir]), /regular file required/);

  // Divergence of second source after planning must preserve first partial copy,
  // never issue a complete receipt, and never restore or overwrite that source.
  await writeFile(b, 'user-WIP-B');
  const partial = join(temp, 'partial');
  await assert.rejects(createVerifiedAssetBackup(plan, partial), /source diverged/);
  assert.deepEqual(await readdir(partial), ['0001.backup']);
  assert.equal(await readFile(join(partial, '0001.backup'), 'utf8'), 'original-A');
  assert.equal(await readFile(b, 'utf8'), 'user-WIP-B');
  assert.equal(await readFile(a, 'utf8'), 'original-A');
  assert.equal(await readFile(receipt.entries[1].backup, 'utf8'), 'original-B');
  await assert.rejects(verifyAssetSources(plan), /source diverged/);
});
