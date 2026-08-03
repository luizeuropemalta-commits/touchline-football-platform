import assert from "node:assert/strict";
import test from "node:test";

import {
  clearFootballDataCache,
  footballDataCacheSnapshot,
  withFootballDataCache,
} from "../lib/football-data/cache.ts";

test("coalesces concurrent provider loads for the same cache key", async () => {
  clearFootballDataCache();
  let loadCount = 0;
  let release!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });
  const loader = async () => {
    loadCount += 1;
    return pending;
  };

  const first = withFootballDataCache("live", ["fixture", 1], loader, 60);
  const second = withFootballDataCache("live", ["fixture", 1], loader, 60);
  release("ready");

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(loadCount, 1);
  assert.deepEqual(firstResult, { value: "ready", cached: false });
  assert.deepEqual(secondResult, { value: "ready", cached: true });
  assert.equal(footballDataCacheSnapshot().inFlight, 0);
});

test("bounds the in-memory provider cache", async () => {
  clearFootballDataCache();
  const previousLimit = process.env.FOOTBALL_DATA_CACHE_MAX_ENTRIES;
  process.env.FOOTBALL_DATA_CACHE_MAX_ENTRIES = "2";

  try {
    await withFootballDataCache("live", ["fixture", 1], async () => "one", 60);
    await withFootballDataCache("live", ["fixture", 2], async () => "two", 60);
    await withFootballDataCache("live", ["fixture", 3], async () => "three", 60);
    assert.equal(footballDataCacheSnapshot().size, 2);
  } finally {
    if (previousLimit === undefined) delete process.env.FOOTBALL_DATA_CACHE_MAX_ENTRIES;
    else process.env.FOOTBALL_DATA_CACHE_MAX_ENTRIES = previousLimit;
    clearFootballDataCache();
  }
});

test("stores only values accepted by the cache policy and preserves their fetch time", async () => {
  clearFootballDataCache();
  const successfulFetchTime = "2026-07-28T10:00:00.000Z";
  let loadCount = 0;
  const loader = async () => {
    loadCount += 1;
    return loadCount === 1
      ? { ok: false, status: 429, fetchedAt: "2026-07-28T09:59:00.000Z" }
      : { ok: true, status: 200, fetchedAt: successfulFetchTime };
  };
  const successfulResponse = (value: Awaited<ReturnType<typeof loader>>) => value.ok;

  const rejected = await withFootballDataCache("live", ["fixture", 4], loader, 60, successfulResponse);
  assert.equal(rejected.value.status, 429);
  assert.equal(rejected.cached, false);
  assert.equal(footballDataCacheSnapshot().size, 0);

  const loaded = await withFootballDataCache("live", ["fixture", 4], loader, 60, successfulResponse);
  const cached = await withFootballDataCache("live", ["fixture", 4], loader, 60, successfulResponse);

  assert.equal(loadCount, 2);
  assert.equal(loaded.cached, false);
  assert.equal(cached.cached, true);
  assert.equal(cached.value.fetchedAt, successfulFetchTime);
  assert.equal(footballDataCacheSnapshot().size, 1);
  clearFootballDataCache();
});
