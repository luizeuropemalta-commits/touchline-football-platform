import { constants } from 'node:fs';
import { lstat, open, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve, relative, dirname, sep, join } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};

async function rejectSymlinkPath(path) {
  let current = resolve(path);
  while (true) {
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`symlink forbidden: ${current}`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

async function regularBytes(path) {
  await rejectSymlinkPath(path);
  if (!(await lstat(path)).isFile()) throw new Error(`regular file required: ${path}`);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new Error(`regular file required: ${path}`);
    return await handle.readFile();
  } finally { await handle.close(); }
}

function absolute(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('absolute path required');
  return resolve(path);
}

export async function planAssetBackup(sourceRoot, files) {
  const root = absolute(sourceRoot);
  await rejectSymlinkPath(root);
  if (!(await lstat(root)).isDirectory()) throw new Error('source root must be directory');
  if (!Array.isArray(files) || files.length === 0) throw new Error('explicit nonempty files required');
  const entries = [];
  const seen = new Set();
  for (const file of files) {
    const path = absolute(file);
    if (path === root || !inside(root, path) || seen.has(path)) throw new Error('invalid or duplicate source');
    seen.add(path);
    const bytes = await regularBytes(path);
    entries.push({ path, size: bytes.length, sha256: hash(bytes) });
  }
  return { sourceRoot: root, entries };
}

function snapshotPlan(plan) {
  const root = absolute(plan.sourceRoot);
  if (!Array.isArray(plan.entries) || !plan.entries.length) throw new Error('invalid backup destination or plan');
  // Own only primitive copies before yielding: callers may mutate the original plan.
  const entries = plan.entries.map(entry => ({ path: entry.path, size: entry.size, sha256: entry.sha256 }));
  const seen = new Set();
  for (const entry of entries) {
    if (absolute(entry.path) !== entry.path || !inside(root, entry.path) || entry.path === root || seen.has(entry.path)
        || !Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.sha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('invalid source entry');
    seen.add(entry.path);
  }
  return { sourceRoot: root, entries };
}

export async function verifyAssetSources(plan) {
  const snapshot = snapshotPlan(plan);
  for (const entry of snapshot.entries) {
    const bytes = await regularBytes(entry.path);
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) throw new Error(`source diverged: ${entry.path}`);
  }
}

// Local exclusive execution is required; this is not a concurrent filesystem transaction.
// Failure preserves all partial backup files. No original is ever written or restored.
export async function createVerifiedAssetBackup(plan, backupRoot) {
  const snapshot = snapshotPlan(plan);
  const root = snapshot.sourceRoot;
  const output = absolute(backupRoot);
  if (inside(root, output)) throw new Error('invalid backup destination or plan');
  await rejectSymlinkPath(root);
  await rejectSymlinkPath(dirname(output));
  await mkdir(output, { recursive: false });
  const completed = [];
  for (const [index, entry] of snapshot.entries.entries()) {
    const bytes = await regularBytes(entry.path);
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) throw new Error(`source diverged: ${entry.path}`);
    const backup = join(output, `${String(index + 1).padStart(4, '0')}.backup`);
    await writeFile(backup, bytes, { flag: 'wx' });
    const copied = await regularBytes(backup);
    if (copied.length !== entry.size || hash(copied) !== entry.sha256) throw new Error(`backup verification failed: ${backup}`);
    completed.push({ ...entry, backup });
  }
  await verifyAssetSources(snapshot);
  // Recheck every copy before issuing the receipt, not only immediately after writing it.
  for (const entry of completed) {
    const bytes = await regularBytes(entry.backup);
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) throw new Error(`backup diverged: ${entry.backup}`);
  }
  const manifest = { status: 'BACKUP_VERIFIED', sourceRoot: root, entries: completed };
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}
