import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Result = { data: unknown; error: unknown };
const source = readFileSync(new URL("../lib/football-data/fixture-schedule-store.ts", import.meta.url), "utf8");
const moduleExports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: moduleExports,
  require(name: string) {
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => null };
    if (name === "@/lib/touchlineArena/live-coaches") return { touchlineCompetitionCoachAssignments: () => [] };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
const read = moduleExports.readPublicCompetitionFixtures as (options?: Record<string, unknown>) => Promise<Array<{providerId: string}>>;
const fixture = { provider: "sportmonks", provider_fixture_id: "123", competition_id: "comp", starts_at: "2026-10-24T15:00:00Z", status: "Not Started", home_club_id: "home", away_club_id: "away", season_id: "season", round_id: "round" };
function client(overrides: Record<string, Partial<Result>> = {}) {
  const tables: Record<string, unknown> = {
    football_competitions: { id: "comp" }, football_fixtures: [fixture],
    football_clubs: [{ id: "home", provider_team_id: "1", name: "Home" }, { id: "away", provider_team_id: "2", name: "Away" }],
    football_seasons: [{ id: "season", provider_season_id: "2026" }],
    football_rounds: [{ id: "round", provider_round_id: "7", name: "7" }],
  };
  const calls: string[] = [];
  return { calls, from(table: string) {
    calls.push(table); assert.ok(table in tables);
    const result = { data: tables[table], error: null, ...overrides[table] };
    return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      gte() { return this; }, lte() { return this; }, in() { return this; },
      maybeSingle: () => Promise.resolve(result),
      then(resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve(result).then(resolve, reject); },
    };
  } };
}

test("strict schedule preserves valid reads and distinguishes a real empty result", async () => {
  for (const strictRead of [false, true]) {
    assert.equal((await read({ providedAdmin: client(), strictRead }))[0]?.providerId, "123");
    const empty = client({ football_fixtures: { data: [] } });
    assert.equal((await read({ providedAdmin: empty, strictRead })).length, 0);
    assert.deepEqual(empty.calls, ["football_competitions", "football_fixtures"]);
  }
});

test("strict schedule rejects unavailable storage and relational failures while default stays compatible", async () => {
  assert.equal((await read()).length, 0);
  await assert.rejects(read({ strictRead: true }), /FIXTURE_SCHEDULE_UNAVAILABLE/);
  const failures = [
    { football_competitions: { error: { message: "private failure" } } },
    { football_competitions: { data: null } },
    { football_fixtures: { error: { message: "private failure" } } },
    { football_fixtures: { data: null } },
    ...["football_clubs", "football_seasons", "football_rounds"].map(table => ({ [table]: { error: { message: "private failure" } } })),
  ];
  for (const failure of failures) {
    assert.equal((await read({ providedAdmin: client(failure) })).length, 0);
    await assert.rejects(read({ providedAdmin: client(failure), strictRead: true }), /^Error: FIXTURE_SCHEDULE_UNAVAILABLE$/);
  }
});

test("strict schedule cannot certify malformed or partially mapped fixtures as empty/complete", async () => {
  const failures = [
    { football_fixtures: { data: [null] } },
    { football_clubs: { data: [null] } },
    { football_fixtures: { data: [{ ...fixture, provider_fixture_id: "qa-not-official" }] } },
    { football_fixtures: { data: [fixture, { ...fixture, provider_fixture_id: "qa-not-official" }] } },
    { football_fixtures: { data: [fixture, fixture] } },
    { football_fixtures: { data: [{ ...fixture, away_club_id: "home" }] } },
    { football_fixtures: { data: [{ ...fixture, starts_at: "invalid" }] } },
    { football_fixtures: { data: [{ ...fixture, home_score: -1 }] } },
    ...["football_clubs", "football_seasons", "football_rounds"].map(table => ({ [table]: { data: [] } })),
  ];
  for (const failure of failures) await assert.rejects(read({ providedAdmin: client(failure), strictRead: true }), /FIXTURE_SCHEDULE_UNAVAILABLE/);
  // Existing public consumers retain their historical partial-filter behavior.
  assert.equal((await read({ providedAdmin: client({ football_fixtures: { data: [fixture, { ...fixture, provider_fixture_id: "qa-not-official" }] } }) })).length, 1);
});

test("strict scores reject fractions, unsafe integers and malformed representations without truncating", async () => {
  for (const score of [0.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1.5", "1e2", "", "0x10", "9007199254740992", "9".repeat(400), true, {}, []]) {
    for (const field of ["home_score", "away_score"]) {
      await assert.rejects(read({ providedAdmin: client({ football_fixtures: { data: [{ ...fixture, [field]: score }] } }), strictRead: true }), /FIXTURE_SCHEDULE_UNAVAILABLE/);
    }
  }
  for (const score of [null, undefined, 0, 2, "0", "12"]) {
    assert.equal((await read({ providedAdmin: client({ football_fixtures: { data: [{ ...fixture, home_score: score, away_score: score }] } }), strictRead: true })).length, 1);
  }
});

test("ClubOwner preserves unavailable seed rather than replacing it with a valid-looking empty schedule", () => {
  const page = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
  const fantasy = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  assert.match(page, /readPersistedLiveRailWithin\(\)/);
  assert.match(page, /initialLiveFixtures = liveRail\?\.fixtures \?\? null/);
  assert.doesNotMatch(fantasy, /initialLiveFixtures\s*=\s*\[\]/);
});
