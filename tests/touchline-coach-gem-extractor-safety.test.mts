import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, symlink, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseOutputDirectory, reserveOutputDirectory } from '../scripts/extract-touchline-coach-gems.mjs';

const script = new URL('../scripts/extract-touchline-coach-gems.mjs', import.meta.url);

test('import is side-effect free and preserves seven masks without loading sharp', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports, registerHooks } from 'node:module';
    for (const key of ['mkdir', 'readFile', 'writeFile']) fs[key] = () => { throw Error('unexpected IO: ' + key); };
    syncBuiltinESMExports();
    registerHooks({ resolve(specifier, context, next) { if (specifier === 'sharp') throw Error('unexpected sharp import'); return next(specifier, context); } });
    const { coachGemMasks } = await import(${JSON.stringify(script.href)});
    if (coachGemMasks.length !== 7) throw Error('wrong masks');
  `], { encoding: 'utf8' });
  assert.equal(result, '');
});

test('invalid CLI arguments fail before creating output', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'touchline-gem-cli-safety-'));
  console.log(`preserved synthetic CLI root: ${temp}`);
  for (const args of [[], ['--output-dir'], ['--output-dir', 'relative'], ['--other', join(temp, 'new')], ['--output-dir', join(temp, 'new'), '--output-dir', join(temp, 'other')]]) {
    assert.throws(() => parseOutputDirectory(args), /usage:/);
    assert.throws(() => execFileSync(process.execPath, [fileURLToPath(script), ...args], { cwd: temp, stdio: 'pipe' }), error => {
      assert.equal(error.status, 1);
      assert.match(error.stderr.toString(), /usage:/);
      return true;
    });
  }
  assert.deepEqual(await readdir(temp), []);
});

test('exclusive reservation preserves existing file, directory and links', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'touchline-gem-reservation-safety-'));
  console.log(`preserved synthetic sentinel root: ${temp}`);
  const file = join(temp, 'file');
  const dir = join(temp, 'directory');
  const validLink = join(temp, 'valid-link');
  const dangling = join(temp, 'dangling-link');
  await writeFile(file, 'file-sentinel', { flag: 'wx' });
  await mkdir(dir);
  await writeFile(join(dir, 'sentinel'), 'directory-sentinel', { flag: 'wx' });
  await symlink(dir, validLink);
  await symlink(join(temp, 'absent'), dangling);
  for (const target of [file, dir, validLink, dangling]) {
    await assert.rejects(reserveOutputDirectory(target), { code: 'EEXIST' });
  }
  assert.equal(await readFile(file, 'utf8'), 'file-sentinel');
  assert.equal(await readFile(join(dir, 'sentinel'), 'utf8'), 'directory-sentinel');
  assert.equal((await lstat(validLink)).isSymbolicLink(), true);
  assert.equal((await lstat(dangling)).isSymbolicLink(), true);
  assert.equal(await readlink(validLink), dir);
  assert.equal(await readlink(dangling), join(temp, 'absent'));
  const fresh = join(temp, 'fresh');
  assert.equal(await reserveOutputDirectory(fresh), fresh);
  assert.deepEqual(await readdir(fresh), []);
  await assert.rejects(reserveOutputDirectory(fresh), { code: 'EEXIST' });
  await assert.rejects(reserveOutputDirectory(join(temp, 'missing-parent', 'child')), { code: 'ENOENT' });
  await assert.rejects(lstat(join(temp, 'missing-parent')), { code: 'ENOENT' });
});

test('all image and manifest sinks are exclusive and no historical output or cleanup remains', async () => {
  const source = await readFile(script, 'utf8');
  assert.equal((source.match(/await writeFile\(/g) ?? []).length, 4);
  assert.equal((source.match(/flag: 'wx'/g) ?? []).length, 4);
  assert.doesNotMatch(source, /\.toFile\(|card-review-20260921|recursive: true|\brm\(|\bunlink\(/);
  assert.ok(source.indexOf("await reserveOutputDirectory(parseOutputDirectory(args))") < source.indexOf("await import('sharp')"));
});
