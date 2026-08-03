import assert from "node:assert/strict";
import test from "node:test";

import { collectPaginatedRows } from "../lib/touchlineArena/paginated-read.ts";

test("collects all 584 players instead of stopping at the first 500", async () => {
  const source = Array.from({ length: 584 }, (_, index) => `player-${index + 1}`);
  const requestedRanges: Array<[number, number]> = [];

  const result = await collectPaginatedRows(async (from, to) => {
    requestedRanges.push([from, to]);
    return source.slice(from, to + 1);
  });

  assert.deepEqual(result, source);
  assert.deepEqual(requestedRanges, [[0, 499], [500, 999]]);
});

test("rejects an invalid page size before reading", async () => {
  await assert.rejects(
    collectPaginatedRows(async () => [], 0),
    /TL_PAGINATED_READ_INVALID_PAGE_SIZE/,
  );
});
