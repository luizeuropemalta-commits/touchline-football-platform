import { constants } from 'node:fs';
import { open, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, basename, join } from 'node:path';
import { createVerifiedAssetBackup, verifyAssetSources } from './verified-asset-backup.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function caughtError(value) {
  // Always own the wrapper: even a frozen Error thrown by a callback is safe.
  let message = 'Unknown thrown value';
  try { message = value instanceof Error ? String(value.message) : String(value); } catch { /* keep safe fallback */ }
  return new Error(message, { cause: value });
}
async function readRegular(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`regular file required: ${path}`);
    return { bytes: await handle.readFile(), mode: stat.mode & 0o777 };
  } finally { await handle.close(); }
}

// Exclusive local execution required. No automatic cleanup or restoration.
// changedPaths must come from a completed discovery pass, not a streaming selector.
export async function transformVerifiedAssets({ plan, changedPaths, backupRoot, transform }) {
  const snapshot = { sourceRoot: plan.sourceRoot, entries: plan.entries.map(entry => ({ path: entry.path, size: entry.size, sha256: entry.sha256 })) };
  const paths = [...changedPaths];
  if (typeof transform !== 'function' || new Set(paths).size !== paths.length) throw new Error('invalid transform or duplicate selection');
  const selected = paths.map(path => {
    const matches = snapshot.entries.filter(entry => entry.path === path);
    if (matches.length !== 1) throw new Error('selection must be an explicit subset of the plan');
    return matches[0];
  });
  const subset = { sourceRoot: snapshot.sourceRoot, entries: selected };
  if (!selected.length) return { status: 'NOOP', completed: [], skipped: snapshot.entries.map(entry => entry.path) };
  await createVerifiedAssetBackup(subset, backupRoot);
  const completed = [];
  const staged = [];
  let current = null;
  let publicationAttempted = false;
  const report = () => ({ completed: [...completed], pending: selected.filter(entry => !completed.some(done => done.path === entry.path)).map(entry => entry.path), staged: [...staged], current, publicationAttempted });
  try {
    for (const [index, entry] of selected.entries()) {
      current = entry.path;
      publicationAttempted = false;
      await verifyAssetSources({ sourceRoot: subset.sourceRoot, entries: [entry] });
      const original = await readRegular(entry.path);
      if (original.bytes.length !== entry.size || digest(original.bytes) !== entry.sha256) throw new Error(`source diverged: ${entry.path}`);
      // The transformer receives copies, never the internal backup plan.
      const result = await transform(Buffer.from(original.bytes), { ...entry });
      if (!Buffer.isBuffer(result)) throw new Error('transform must return a Buffer');
      const output = Buffer.from(result);
      const afterHash = digest(output);
      const temporary = join(dirname(entry.path), `.${basename(entry.path)}.touchline-${randomUUID()}.tmp`);
      await writeFile(temporary, output, { flag: 'wx', mode: original.mode });
      staged.push(temporary);
      const stagedBytes = (await readRegular(temporary)).bytes;
      if (stagedBytes.length !== output.length || digest(stagedBytes) !== afterHash) throw new Error('staged output diverged');
      await writeFile(join(backupRoot, `${String(index + 1).padStart(4, '0')}-prepared.json`), JSON.stringify({ path: entry.path, temporary, beforeHash: entry.sha256, afterHash }), { flag: 'wx' });
      await verifyAssetSources({ sourceRoot: subset.sourceRoot, entries: [entry] });
      publicationAttempted = true;
      await rename(temporary, entry.path);
      const actual = (await readRegular(entry.path)).bytes;
      if (actual.length !== output.length || digest(actual) !== afterHash) throw new Error('published output verification failed');
      const done = { path: entry.path, beforeHash: entry.sha256, afterHash };
      completed.push(done);
      await writeFile(join(backupRoot, `${String(index + 1).padStart(4, '0')}-completed.json`), JSON.stringify(done), { flag: 'wx' });
    }
    const result = { status: 'COMPLETED', ...report(), backupManifest: join(backupRoot, 'manifest.json'), skipped: snapshot.entries.filter(entry => !paths.includes(entry.path)).map(entry => entry.path) };
    await writeFile(join(backupRoot, 'transform-result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
    return result;
  } catch (caught) {
    const error = caughtError(caught);
    const failure = { status: 'FAILED', ...report(), message: String(error.message), backupManifest: join(backupRoot, 'manifest.json') };
    try { await writeFile(join(backupRoot, 'transform-failure.json'), JSON.stringify(failure, null, 2), { flag: 'wx' }); }
    catch (caughtReportError) { error.reportError = caughtError(caughtReportError); }
    error.partial = failure;
    throw error;
  }
}
