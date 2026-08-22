import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const globalLoadingPath = fileURLToPath(new URL("../app/loading.tsx", import.meta.url));

test("global loading status never obscures already-streamed route content", async () => {
  const source = await readFile(globalLoadingPath, "utf8");

  assert.match(source, /pointer-events-none fixed inset-x-0 bottom-5/);
  assert.match(source, /aria-live="polite"/);
  assert.doesNotMatch(source, /fixed inset-0 z-\[100\] grid place-items-center bg-black/);
});
