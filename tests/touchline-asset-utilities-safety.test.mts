import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, mkdir, writeFile, readFile, lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runNormalizer, parseAssetWriteOptions } from '../scripts/normalize-touchline-card-template-boxes.mjs';
import { runRepair } from '../scripts/repair-touchline-card-assets.mjs';

const modules = ['normalize-touchline-card-template-boxes.mjs', 'repair-touchline-card-assets.mjs'].map(name => new URL(`../scripts/${name}`, import.meta.url));

test('both utilities import without filesystem effects or sharp, and reject invalid CLI before sharp', async () => {
  for (const scriptUrl of modules) {
    assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs'; import promises from 'node:fs/promises';
      import { syncBuiltinESMExports, registerHooks } from 'node:module';
      for (const obj of [fs, promises]) for (const key of ['readFile','writeFile','mkdir','readdir','readdirSync']) if (key in obj) obj[key] = () => { throw Error('unexpected IO'); };
      syncBuiltinESMExports();
      registerHooks({resolve(s,c,next) { if(s === 'sharp') throw Error('unexpected sharp'); return next(s,c); }});
      await import(${JSON.stringify(scriptUrl.href)});
    `], { encoding: 'utf8' }), '');
    for (const args of [[], ['--confirm-one-off-asset-write'], ['--backup-root=/new'], ['--confirm-one-off-asset-write', '--backup-root=relative'], ['--confirm-one-off-asset-write', '--backup-root=/a', '--backup-root=/b']]) {
      assert.throws(() => execFileSync(process.execPath, [fileURLToPath(scriptUrl), ...args], { stdio: 'pipe' }), error => {
        assert.equal(error.status, 1);
        assert.match(error.stderr.toString(), /Require .*--backup-root/);
        return true;
      });
    }
  }
  assert.deepEqual(parseAssetWriteOptions(['--confirm-one-off-asset-write', '--backup-root=/a=b']), { backupRoot: '/a=b' });
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'touchline-utilities-wiring-')));
  console.log(`preserved utility evidence: ${root}`);
  const sourceRoot = join(root, 'source'); await mkdir(sourceRoot);
  const files = ['change', 'skip', 'change-two'].map(name => ({ filePath: join(sourceRoot, name), tier: 'ruby-red' }));
  for (const item of files) await writeFile(item.filePath, item.filePath.endsWith('skip') ? 'skip' : 'change', { flag: 'wx' });
  return { sourceRoot, files, backupRoot: join(root, 'backup') };
}

for (const [name, run] of [['normalizer', runNormalizer], ['repair', runRepair]]) {
  test(`${name} real wiring completes discovery, backs up exact subset and keeps skipped source`, async () => {
    const f = await fixture();
    let analyzed = 0;
    const result = await run({ ...f, analyze: async bytes => { analyzed++; return bytes.toString() === 'change'; }, transform: async bytes => {
      assert.equal(analyzed, 3);
      const receipt = JSON.parse(await readFile(join(f.backupRoot, 'manifest.json'), 'utf8'));
      assert.equal(receipt.status, 'BACKUP_VERIFIED'); assert.equal(receipt.entries.length, 2);
      assert.ok(receipt.entries.every(entry => !entry.path.endsWith('skip')));
      return Buffer.from(`${bytes}-updated`);
    } });
    assert.equal(result.completed.length, 2);
    assert.equal(await readFile(f.files[1].filePath, 'utf8'), 'skip');
  });

  test(`${name} no-op and discovery error never transform or reserve backup`, async () => {
    const f = await fixture();
    const transform = () => { throw Error('unexpected transform'); };
    assert.equal((await run({ ...f, analyze: async () => false, transform })).status, 'NOOP');
    await assert.rejects(lstat(f.backupRoot), { code: 'ENOENT' });
    let analyzed = 0;
    await assert.rejects(run({ ...f, analyze: async () => { if (++analyzed === 3) throw Error('analysis failure'); return true; }, transform }), /analysis failure/);
    await assert.rejects(lstat(f.backupRoot), { code: 'ENOENT' });
    assert.equal(await readFile(f.files[0].filePath, 'utf8'), 'change');
  });

  test(`${name} discovery WIP divergence and backup failure stop before transform`, async () => {
    const f = await fixture();
    let calls = 0;
    const transform = () => { calls++; return Buffer.from('bad'); };
    await assert.rejects(run({ ...f, analyze: async (bytes, item) => { if (item.filePath === f.files[0].filePath) await writeFile(item.filePath, 'user-WIP'); return true; }, transform }), /source diverged/);
    assert.equal(calls, 0);
    await mkdir(f.backupRoot);
    await assert.rejects(run({ ...f, analyze: async () => true, transform }), { code: 'EEXIST' });
    assert.equal(calls, 0);
    assert.equal(await readFile(f.files[0].filePath, 'utf8'), 'user-WIP');
    assert.deepEqual(await readdir(f.backupRoot), []);
  });

  test(`${name} partial callback failure is recorded without rollback`, async () => {
    const f = await fixture(); let count = 0;
    await assert.rejects(run({ ...f, analyze: async bytes => bytes.toString() === 'change', transform: async bytes => { if (++count === 2) throw null; return Buffer.from(`${bytes}-updated`); } }), /null/);
    const report = JSON.parse(await readFile(join(f.backupRoot, 'transform-failure.json'), 'utf8'));
    assert.equal(report.completed.length, 1);
    assert.deepEqual(report.pending, [f.files[2].filePath]);
    assert.equal(await readFile(f.files[0].filePath, 'utf8'), 'change-updated');
    assert.equal(await readFile(f.files[2].filePath, 'utf8'), 'change');
  });
}

test('pixel thresholds and rendering operations remain present; all writes delegated', async () => {
  const normalizer = await readFile(modules[0], 'utf8');
  const repair = await readFile(modules[1], 'utf8');
  assert.match(normalizer, /ALPHA_THRESHOLD = 8/);
  assert.match(normalizer, /resize\(target.width, target.height, \{ fit: "fill", kernel: "lanczos3" \}\)/);
  assert.match(repair, /greenPct > 0\.1/);
  assert.match(repair, /png\(\{ compressionLevel: 9, adaptiveFiltering: true \}\)/);
  assert.doesNotMatch(normalizer + repair, /writeFile\(|\.toFile\(/);
});
