import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

import { clearFootballDataCache } from "../lib/football-data/cache.ts";
import type {
  FootballDataProvider,
  TouchlineCompetition,
  TouchlineFixture,
  TouchlineSeason,
} from "../lib/football-data/types.ts";
import { selectArenaFixtureRound } from "../lib/touchlineArena/arena-fixture-round.ts";

const repositoryRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, repositoryRoot).href, context);
    return nextResolve(specifier, context);
  },
});

const { SportmonksFootballProvider } = await import("../lib/football-data/providers/sportmonks.ts");
const { syncSportmonksFixtureSchedule } = await import("../lib/football-data/fixture-schedule-sync.ts");

const FIXTURE_IDS = [
  "19722203", "19722202", "19722199", "19722200", "19722201",
  "19722198", "19722196", "19722197", "19722195", "19722194",
];

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function rawFixture(id: string, index: number) {
  return {
    id: Number(id),
    league_id: 8,
    season_id: 28083,
    starting_at_timestamp: 1_787_000_000 + index,
    state: { name: "Not Started" },
    participants: [
      { id: 1_000 + index * 2, name: id === "19722198" ? "Brentford FC" : `Home ${index}`, meta: { location: "home" } },
      { id: 1_001 + index * 2, name: id === "19722198" ? "Tottenham Hotspur" : `Away ${index}`, meta: { location: "away" } },
    ],
    scores: [],
  };
}

test("Sportmonks fixture window scopes league 8 before collecting every page and cannot reuse date cache", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTMONKS_API_TOKEN;
  const originalBaseUrl = process.env.SPORTMONKS_BASE_URL;
  const requests: URL[] = [];
  clearFootballDataCache();
  process.env.SPORTMONKS_API_TOKEN = "fixture-window-test-token";
  process.env.SPORTMONKS_BASE_URL = "https://api.sportmonks.test/v3/football";
  globalThis.fetch = (async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    if (url.pathname.includes("/fixtures/date/")) {
      return jsonResponse({ data: FIXTURE_IDS.filter((id) => id !== "19722198").map(rawFixture) });
    }
    const page = Number(url.searchParams.get("page"));
    const data = FIXTURE_IDS.slice(page === 1 ? 0 : 5, page === 1 ? 5 : 10).map(rawFixture);
    return jsonResponse({
      data,
      pagination: { current_page: page, has_more: page === 1 },
    });
  }) as typeof fetch;

  try {
    const provider = new SportmonksFootballProvider();
    const historicalDateRead = await provider.getFixturesByDate({ date: "2026-08-22", timezone: "Europe/London" });
    assert.equal(historicalDateRead.ok, true);
    if (historicalDateRead.ok) assert.equal(historicalDateRead.data.length, 9);

    const result = await provider.getFixturesBetween({
      fromDate: "2026-08-21",
      throughDate: "2026-08-24",
      competitionId: "8",
      timezone: "Europe/London",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.length, 10);
    assert.ok(result.data.some((fixture) => fixture.providerId === "19722198"));
    assert.ok(result.data.every((fixture) => fixture.provider === "sportmonks" && fixture.competitionId === "8"));

    const windowRequests = requests.filter((url) => url.pathname.includes("/fixtures/between/2026-08-21/2026-08-24"));
    assert.deepEqual(windowRequests.map((url) => Number(url.searchParams.get("page"))), [1, 2]);
    assert.ok(windowRequests.every((url) => url.searchParams.get("filters") === "fixtureLeagues:8"));
    assert.ok(windowRequests.every((url) => url.searchParams.get("include") === "participants;scores;league;season;state"));
    assert.ok(windowRequests.every((url) => url.searchParams.get("timezone") === "Europe/London"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = originalToken;
    if (originalBaseUrl === undefined) delete process.env.SPORTMONKS_BASE_URL;
    else process.env.SPORTMONKS_BASE_URL = originalBaseUrl;
    clearFootballDataCache();
  }
});

test("fixture schedule sync persists all ten provider fixtures without any manual completion", async () => {
  const fixtures: TouchlineFixture[] = FIXTURE_IDS.map((providerId, index) => ({
    id: `sportmonks:${providerId}`,
    providerId,
    provider: "sportmonks",
    competitionId: "8",
    seasonId: "28083",
    startsAt: `2026-08-${String(21 + Math.floor(index / 4)).padStart(2, "0")}T12:00:00.000Z`,
    status: "Not Started",
    homeTeam: { id: `sportmonks:${1_000 + index * 2}`, providerId: String(1_000 + index * 2), provider: "sportmonks", name: index === 5 ? "Brentford FC" : `Home ${index}`, source: { provider: "sportmonks", providerId: String(1_000 + index * 2) } },
    awayTeam: { id: `sportmonks:${1_001 + index * 2}`, providerId: String(1_001 + index * 2), provider: "sportmonks", name: index === 5 ? "Tottenham Hotspur" : `Away ${index}`, source: { provider: "sportmonks", providerId: String(1_001 + index * 2) } },
    source: { provider: "sportmonks", providerId },
  }));
  const competition: TouchlineCompetition = { id: "sportmonks:8", providerId: "8", provider: "sportmonks", name: "Premier League", source: { provider: "sportmonks", providerId: "8" } };
  const season: TouchlineSeason = { id: "sportmonks:28083", providerId: "28083", provider: "sportmonks", name: "2026/27", competitionId: "8", source: { provider: "sportmonks", providerId: "28083" } };
  let betweenParams: unknown;
  let stored: TouchlineFixture[] = [];
  const provider = {
    name: "sportmonks",
    getCompetitionById: async () => ({ ok: true, provider: "sportmonks", data: competition, fetchedAt: "2026-08-20T00:00:00.000Z" }),
    getFixturesBetween: async (params: unknown) => {
      betweenParams = params;
      return { ok: true, provider: "sportmonks", data: fixtures, fetchedAt: "2026-08-20T00:00:00.000Z" };
    },
    getSeasonById: async () => ({ ok: true, provider: "sportmonks", data: season, fetchedAt: "2026-08-20T00:00:00.000Z" }),
  } as unknown as FootballDataProvider;
  const admin = {
    from(table: string) {
      assert.equal(table, "football_data_sync_runs");
      return {
        insert() { return { select() { return { single: async () => ({ data: { id: "sync-run" }, error: null }) }; } }; },
        update() { return { eq: async () => ({ error: null }) }; },
      };
    },
  };

  const result = await syncSportmonksFixtureSchedule(admin as never, {
    competitionId: "8",
    fromDate: "2026-08-21",
    throughDate: "2026-08-24",
  }, {
    provider,
    persistSchedule: async (_admin, input) => {
      stored = input.fixtures;
      return { stored: true, fixturesStored: input.fixtures.length };
    },
  });

  assert.deepEqual(betweenParams, {
    fromDate: "2026-08-21",
    throughDate: "2026-08-24",
    competitionId: "8",
    timezone: "Europe/London",
  });
  assert.equal(result.ok, true);
  assert.equal(result.fixturesFetched, 10);
  assert.equal(result.fixturesStored, 10);
  assert.equal(stored.length, 10);
  const brentfordTottenham = stored.find((fixture) => fixture.providerId === "19722198");
  assert.equal(brentfordTottenham?.provider, "sportmonks");
  assert.equal(brentfordTottenham?.homeTeam?.name, "Brentford FC");
  assert.equal(brentfordTottenham?.awayTeam?.name, "Tottenham Hotspur");
  const arenaRound = selectArenaFixtureRound(stored, Date.parse("2026-08-20T00:00:00.000Z"));
  assert.equal(arenaRound.length, 10);
  assert.equal(new Set(arenaRound.flatMap((fixture) => [fixture.homeTeam?.providerId, fixture.awayTeam?.providerId])).size, 20);
});

test("the fixture sync contains no manual opening-round completion or wrong Sportmonks identity", async () => {
  const source = await readFile(new URL("../lib/football-data/fixture-schedule-sync.ts", import.meta.url), "utf8");
  await assert.rejects(readFile(new URL("../lib/football-data/touchline-official-fixture-completion.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /2645196|completeTouchlineOfficialFixtureSchedule|OWNER_VERIFIED_OPENING_FIXTURE/);
});
