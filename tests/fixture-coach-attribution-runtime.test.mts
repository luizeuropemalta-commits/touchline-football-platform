import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { clearFootballDataCache } from "../lib/football-data/cache.ts";
import { sanitizeProviderPayloadForPersistence } from "../lib/football-data/provider-payload-sanitize.ts";
import { selectPostMatchRechecks } from "../lib/football-data/live-sync-cadence.ts";

const root = new URL("../", import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return next(new URL("tests/fixtures/server-only.mts", root).href, context);
  return next(specifier.startsWith("@/") ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { SportmonksFootballProvider } = await import("../lib/football-data/providers/sportmonks.ts");

test("actual provider imports fixture coaches through one existing guarded request and old fixtures remain recheckable", async () => {
  const priorFetch = globalThis.fetch;
  const keys = ["SPORTMONKS_API_TOKEN", "SPORTMONKS_BASE_URL"] as const;
  const prior = keys.map(key => process.env[key]);
  let calls = 0;
  try {
    clearFootballDataCache();
    process.env.SPORTMONKS_API_TOKEN = "synthetic-fixture-attribution-test";
    process.env.SPORTMONKS_BASE_URL = "https://sportmonks.invalid/v3/football";
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "sportmonks.invalid", "no provider or remote service is permitted");
      assert.equal(url.pathname, "/v3/football/fixtures/901");
      assert.ok(url.searchParams.get("include")?.split(";").includes("coaches"));
      calls++;
      return Response.json({ data: { id: 901, league_id: 8, season_id: 701,
        starting_at: "2026-08-01 15:00:00", state: { name: "Full Time" },
        participants: [{ id: 10, name: "Synthetic A", meta: { location: "home" } }, { id: 11, name: "Synthetic B", meta: { location: "away" } }],
        coaches: [{ id: 101, meta: { fixture_id: 901, coach_id: 101, participant_id: 10 } }, { id: 102, meta: { fixture_id: 901, coach_id: 102, participant_id: 11 } }],
      } });
    };
    const response = await new SportmonksFootballProvider().getFixtureFantasyFeed("901");
    assert.equal(response.ok, true);
    if (!response.ok || !response.data) throw new Error("synthetic response missing");
    const persisted = sanitizeProviderPayloadForPersistence(response.data);
    assert.equal(persisted.fixture.coachAttribution?.status, "complete");
    assert.deepEqual(persisted.fixture.coachAttribution?.assignments.map(a => a.coachProviderId), ["101", "102"]);
    assert.equal(persisted.fixture.source.raw, undefined);
    assert.equal(calls, 1, "attribution requires no standalone coaches request");
    const now = Date.parse("2026-10-27T18:00:00Z");
    assert.deepEqual(selectPostMatchRechecks([persisted.fixture], new Map([["901", "2026-10-25T18:00:00Z"]]), now), ["901"]);
    assert.deepEqual(selectPostMatchRechecks([persisted.fixture], new Map([["901", "2026-10-25T18:00:00Z"]]), now,
      new Map([["901", "2026-10-27T17:59:00Z"]])), [], "the recovery path retains attempt backoff");
  } finally {
    globalThis.fetch = priorFetch;
    keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
    clearFootballDataCache();
  }
});
