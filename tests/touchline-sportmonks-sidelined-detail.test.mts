import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { clearFootballDataCache } from "../lib/football-data/cache.ts";

const root = new URL("../", import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith("@/") ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { SportmonksFootballProvider } = await import("../lib/football-data/providers/sportmonks.ts");

test("Sportmonks fixture maps explicit sidelined category, return date and completed state without extra HTTP", async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.SPORTMONKS_API_TOKEN;
  const previousBase = process.env.SPORTMONKS_BASE_URL;
  let requests = 0;
  clearFootballDataCache();
  process.env.SPORTMONKS_API_TOKEN = "synthetic-private-api-token";
  process.env.SPORTMONKS_BASE_URL = "https://sportmonks.invalid/v3/football";
  globalThis.fetch = async input => {
    requests++;
    const url = new URL(String(input));
    assert.equal(url.pathname, "/v3/football/fixtures/88888");
    assert.ok(url.searchParams.get("include")?.includes("sidelined.type"));
    return new Response(JSON.stringify({ data: {
      id: 88888, league_id: 8, season_id: 28083, starting_at_timestamp: 1_800_000_000,
      state: { name: "Not Started" }, participants: [
        { id: 19, name: "Club A", meta: { location: "home" } },
        { id: 20, name: "Club B", meta: { location: "away" } },
      ], scores: [], lineups: [], formations: [], events: [],
      sidelined: [{ id: 535357, fixture_id: 88888, player_id: 4237085, team_id: 19,
        category: "injury", completed: false, start_date: "2026-10-01", end_date: "2026-10-30",
        type: { id: 561, name: "Achilles tendon problems" },
      }, { id: 535358, fixture_id: 88888, player_id: 4237086, participant_id: 19,
        sideline: { category: "injury", completed: false, start_date: "2026-10-02", end_date: null },
        type: { id: 339, name: "Groin Injury" },
      }, { id: 535359, fixture_id: 88888, player_id: 4237087, participant_id: 19,
        sideline: null, type: { id: 339, name: "Groin Injury" },
      }],
    }, rate_limit: { requested_entity: "Fixture", remaining: 12, resets_in_seconds: 60 } }),
    { headers: { "content-type": "application/json" } });
  };
  try {
    const result = await new SportmonksFootballProvider().getFixtureFantasyFeed("88888");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(requests, 1);
    assert.deepEqual(result.data?.sidelined.map(({ category, completed, startDate, endDate, typeName }) =>
      ({ category, completed, startDate, endDate, typeName })), [{
      category: "injury", completed: false, startDate: "2026-10-01", endDate: "2026-10-30",
      typeName: "Achilles tendon problems",
    }, {
      category: "injury", completed: false, startDate: "2026-10-02", endDate: undefined,
      typeName: "Groin Injury",
    }, {
      category: undefined, completed: undefined, startDate: undefined, endDate: undefined,
      typeName: "Groin Injury",
    }]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = previousToken;
    if (previousBase === undefined) delete process.env.SPORTMONKS_BASE_URL;
    else process.env.SPORTMONKS_BASE_URL = previousBase;
    clearFootballDataCache();
  }
});
