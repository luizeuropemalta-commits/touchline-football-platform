import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SOURCE_ROOTS = [
  fileURLToPath(new URL("../app/", import.meta.url)),
  fileURLToPath(new URL("../components/", import.meta.url)),
];

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const INVALID_WEIGHT_CLASS =
  /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)[a-z]+\b/g;

async function sourceFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return sourceFiles(entryPath);
      return SOURCE_EXTENSION.test(entry.name) ? [entryPath] : [];
    }),
  );

  return nested.flat();
}

test("Tailwind font-weight utilities do not contain misspelled suffixes", async () => {
  const files = (await Promise.all(SOURCE_ROOTS.map(sourceFiles))).flat();
  const violations: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, "utf8");
      const matches = source.match(INVALID_WEIGHT_CLASS) ?? [];
      matches.forEach((className) => {
        violations.push(`${path.relative(process.cwd(), file)}: ${className}`);
      });
    }),
  );

  assert.deepEqual(violations.sort(), []);
});
