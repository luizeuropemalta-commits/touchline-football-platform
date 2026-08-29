import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  footballDataFetchJson,
  footballDataTimeoutMs,
} from "../lib/football-data/http.ts";
import {
  readLiveScoreSnapshot,
  resetLiveScoreSnapshotForTests,
  writeLiveScoreSnapshot,
} from "../lib/football-data/live-score-snapshot.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";

const arenaClientSource = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);
const liveScoresRouteSource = readFileSync(
  new URL("../app/api/football-data/fantasy/livescores/route.ts", import.meta.url),
  "utf8",
);
const premierSquadReaderSource = readFileSync(
  new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url),
  "utf8",
);
const sportmonksProviderSource = readFileSync(
  new URL("../lib/football-data/providers/sportmonks.ts", import.meta.url),
  "utf8",
);

function fixture(id: string): TouchlineFixture {
  return {
    id: `sportmonks:${id}`,
    providerId: id,
    provider: "sportmonks",
    name: `Fixture ${id}`,
    source: { provider: "sportmonks", providerId: id },
  };
}

test("provider timeout policy keeps live and interactive reads short", () => {
  const previous = {
    live: process.env.FOOTBALL_DATA_LIVE_TIMEOUT_MS,
    interactive: process.env.FOOTBALL_DATA_INTERACTIVE_TIMEOUT_MS,
    background: process.env.FOOTBALL_DATA_BACKGROUND_TIMEOUT_MS,
  };
  delete process.env.FOOTBALL_DATA_LIVE_TIMEOUT_MS;
  delete process.env.FOOTBALL_DATA_INTERACTIVE_TIMEOUT_MS;
  delete process.env.FOOTBALL_DATA_BACKGROUND_TIMEOUT_MS;

  try {
    assert.equal(footballDataTimeoutMs("live"), 2_000);
    assert.equal(footballDataTimeoutMs("interactive"), 3_000);
    assert.equal(footballDataTimeoutMs("background"), 15_000);
  } finally {
    if (previous.live === undefined) delete process.env.FOOTBALL_DATA_LIVE_TIMEOUT_MS;
    else process.env.FOOTBALL_DATA_LIVE_TIMEOUT_MS = previous.live;
    if (previous.interactive === undefined) delete process.env.FOOTBALL_DATA_INTERACTIVE_TIMEOUT_MS;
    else process.env.FOOTBALL_DATA_INTERACTIVE_TIMEOUT_MS = previous.interactive;
    if (previous.background === undefined) delete process.env.FOOTBALL_DATA_BACKGROUND_TIMEOUT_MS;
    else process.env.FOOTBALL_DATA_BACKGROUND_TIMEOUT_MS = previous.background;
  }
});

test("football data HTTP aborts a slow provider request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  })) as typeof fetch;

  try {
    const startedAt = Date.now();
    const response = await footballDataFetchJson<{ ok: true }>(new URL("https://provider.invalid/live"), {
      provider: "sportmonks",
      timeoutMs: 20,
    });

    assert.equal(response.ok, false);
    assert.equal(response.status, 0);
    assert.match(response.error ?? "", /timed out|abort/i);
    assert.ok(Date.now() - startedAt < 2_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("live score cache atomically replaces coherent snapshots and expires them", () => {
  resetLiveScoreSnapshotForTests();
  writeLiveScoreSnapshot([fixture("1"), fixture("2")], "2026-07-28T10:00:00.000Z");
  const first = readLiveScoreSnapshot({ maxAgeMs: 10_000 });
  assert.deepEqual(first?.fixtures.map((item) => item.providerId), ["1", "2"]);

  writeLiveScoreSnapshot([fixture("3")], "2026-07-28T10:00:01.000Z");
  const replacement = readLiveScoreSnapshot({ maxAgeMs: 10_000 });
  assert.deepEqual(replacement?.fixtures.map((item) => item.providerId), ["3"]);
  assert.equal(readLiveScoreSnapshot({ maxAgeMs: 1, now: (replacement?.storedAt ?? 0) + 2 }), null);

  resetLiveScoreSnapshotForTests();
});

test("Live client preserves only presentation cache while server reads stay persisted-only", () => {
  assert.match(arenaClientSource, /readStoredLiveFixtureSnapshot\(\)/);
  assert.match(arenaClientSource, /readBrowserStorage\("localStorage", ARENA_LIVE_FIXTURE_SNAPSHOT_STORAGE_KEY\)/);
  assert.match(arenaClientSource, /\/football-data\/fixture-schedule/);
  assert.match(arenaClientSource, /void refreshLiveFixtures\(\)/);
  assert.match(arenaClientSource, /function applyPersistedLiveSnapshot/);
  assert.match(arenaClientSource, /canonical-round projection must be selected[\s\S]*?server-side/);
  assert.match(arenaClientSource, /loadClubSquad\(homeClub\)/);
  assert.match(arenaClientSource, /ARENA_LIVE_SNAPSHOT_REQUEST_TIMEOUT_MS/);
  assert.doesNotMatch(arenaClientSource, /params\.set\("refresh", "1"\)|params\.set\("preferSnapshot", "1"\)/);
  assert.doesNotMatch(arenaClientSource, /window\.localStorage|localStorage\.(?:getItem|setItem|removeItem)/);
});

test("live scores and public squads never fall through to Sportmonks", () => {
  assert.match(liveScoresRouteSource, /readPersistedLiveScoreSnapshot/);
  assert.match(liveScoresRouteSource, /readPublicCompetitionFixtures/);
  assert.match(liveScoresRouteSource, /persisted-live-data-unavailable/);
  assert.doesNotMatch(liveScoresRouteSource, /createFootballDataProvider|persistLiveScoreSnapshot|writeLiveScoreSnapshot|readLiveScoreSnapshot|mergeTouchlineLiveFixtureDeltas|new Date\(/);

  assert.match(premierSquadReaderSource, /readPersistedSquadSnapshot\(teamId\)/);
  assert.match(premierSquadReaderSource, /No coherent persisted squad snapshot is available/);
  assert.doesNotMatch(premierSquadReaderSource, /createFootballDataProvider|persistSquadSnapshot|readSnapshotForLiveRefresh|backgroundRefresh|after\(|\.getSquad\(/);
});

test("Sportmonks bounds and parallelizes the two squad requests", () => {
  assert.match(sportmonksProviderSource, /footballDataTimeoutMs\(timeoutProfile\)/);
  assert.match(
    sportmonksProviderSource,
    /const \[request, extendedRequest\] = await Promise\.all\(\[[\s\S]*?"interactive"[\s\S]*?"interactive"[\s\S]*?\]\)/,
  );
});
