import assert from "node:assert/strict";
import test from "node:test";

import { upsertTouchLineRowsResiliently } from "../lib/football-data/resilient-batch-upsert.ts";

test("one invalid aggregate is isolated without starving valid fixture owners", async () => {
  const attempts: string[][] = [];
  const rows = ["ethan-pinnock", "nico-gonzalez", "broken-row", "omar-marmoush"];
  const result = await upsertTouchLineRowsResiliently(rows, async (batch) => {
    attempts.push([...batch]);
    return { error: batch.includes("broken-row") ? { message: "invalid aggregate" } : null };
  });

  assert.deepEqual(result.written.sort(), ["ethan-pinnock", "nico-gonzalez", "omar-marmoush"]);
  assert.deepEqual(result.failed, [{ row: "broken-row", error: "invalid aggregate" }]);
  assert.ok(attempts.length > 1);
});

test("healthy batches stay on the single-write fast path and remain idempotent", async () => {
  let writes = 0;
  const writer = async () => {
    writes += 1;
    return { error: null };
  };
  const rows = ["a", "b", "c"];

  assert.deepEqual(await upsertTouchLineRowsResiliently(rows, writer), { written: rows, failed: [] });
  assert.deepEqual(await upsertTouchLineRowsResiliently(rows, writer), { written: rows, failed: [] });
  assert.equal(writes, 2);
});
