import { existsSync } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const nextTypesRoot = resolve(".next/types");
const numberedCopyPattern = /^(.*)\s+\d+(\.[^.]+)$/;

async function removeNumberedCopies(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      removed += await removeNumberedCopies(entryPath);
      continue;
    }
    if (!entry.isFile()) continue;

    const match = entry.name.match(numberedCopyPattern);
    if (!match) continue;
    const canonicalPath = join(directory, `${match[1]}${match[2]}`);
    if (!existsSync(canonicalPath)) continue;

    await unlink(entryPath);
    removed += 1;
  }
  return removed;
}

const removed = await removeNumberedCopies(nextTypesRoot);
if (removed > 0) console.log(`Removed ${removed} duplicate Next type artifact${removed === 1 ? "" : "s"}.`);
