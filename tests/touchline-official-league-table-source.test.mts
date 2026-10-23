import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  resolveTouchlineOfficialLeagueTable,
  TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT,
  TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
  type TouchlineOfficialLeagueTable,
} from "../lib/football-data/official-league-table.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";

const COMPETITION = "00000000-0000-4000-8000-000000000008";
const SEASON = "00000000-0000-4000-8000-000000028083";
const UPDATED_AT = "2026-10-23T08:00:00.000Z";
const id = (index: number) => `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`;
type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
type Query = {
  table: string;
  columns: string | null;
  filters: [string, unknown][];
  orders: [string, { ascending: boolean }][];
  limit: number | null;
  single: boolean;
};
type Scenario = {
  clubs?: unknown;
  fixtures?: unknown;
  seasons?: unknown;
  competition?: unknown;
  errorTable?: string;
  secondSeason?: string;
  noAdmin?: boolean;
};

function clubs(): Row[] {
  assert.equal(TOUCHLINE_ENGLAND_CLUBS.length, 20);
  return TOUCHLINE_ENGLAND_CLUBS.map((club, index) => ({
    id: id(index),
    provider_team_id: club.teamId,
    name: `Canonical club ${index + 1}`,
    short_code: "UNTRUSTED",
    logo_url: "/untrusted-logo.png",
    source_updated_at: UPDATED_AT,
    private_payload: "DO_NOT_PUBLISH_PRIVATE_CLUB_PAYLOAD",
  }));
}

function fixture(overrides: Row = {}): Row {
  return {
    provider_fixture_id: "19400001",
    season_id: SEASON,
    status: "Finished",
    home_club_id: id(0),
    away_club_id: id(1),
    home_score: 2,
    away_score: 0,
    starts_at: "2026-10-22T19:00:00.000Z",
    source_updated_at: UPDATED_AT,
    private_payload: "DO_NOT_PUBLISH_PRIVATE_FIXTURE_PAYLOAD",
    ...overrides,
  };
}

// Evaluate the real server module with only its transport/cache dependencies
// replaced. The public resolver and trusted club registry remain real.
const serverSource = stripTypeScriptTypes(
  readFileSync(new URL("../lib/football-data/official-league-table-server.ts", import.meta.url), "utf8"),
).replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");

function harness(scenario: Scenario = {}) {
  const queries: Query[] = [];
  const executions: string[] = [];
  const cacheCalls: { keys: string[]; options: { revalidate: number; tags: string[] } }[] = [];
  const cachedResults = new Map<string, Promise<TouchlineOfficialLeagueTable>>();
  let factoryCalls = 0;
  let seasonReads = 0;
  const admin = {
    from(table: string) {
      assert.ok([
        "football_competitions", "football_seasons", "football_clubs", "football_fixtures",
      ].includes(table), `unexpected table read: ${table}`);
      const record: Query = { table, columns: null, filters: [], orders: [], limit: null, single: false };
      queries.push(record);
      const query = {
        select(columns: string) { record.columns = columns; return query; },
        eq(key: string, value: unknown) { record.filters.push([key, value]); return query; },
        order(key: string, options: { ascending: boolean }) { record.orders.push([key, { ascending: options.ascending }]); return query; },
        limit(value: number) { record.limit = value; return query; },
        maybeSingle() { record.single = true; return query; },
        then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
          executions.push(table);
          if (table === "football_clubs" || table === "football_fixtures") {
            // Both requests must have been constructed before either resolves:
            // a serial clubs->fixtures waterfall fails this assertion.
            assert.equal(queries.filter((entry) => entry.table === "football_clubs").length, 1);
            assert.equal(queries.filter((entry) => entry.table === "football_fixtures").length, 1);
          }
          if (table === scenario.errorTable) {
            return Promise.resolve({ data: null, error: { message: "DO_NOT_PUBLISH_PRIVATE_ERROR" } }).then(resolve, reject);
          }
          let data: unknown;
          switch (table) {
            case "football_competitions":
              data = "competition" in scenario ? scenario.competition : { id: COMPETITION };
              break;
            case "football_seasons":
              seasonReads += 1;
              data = "seasons" in scenario ? scenario.seasons : [{
                id: seasonReads > 1 && scenario.secondSeason ? scenario.secondSeason : SEASON,
                provider_season_id: "28083",
                name: "2026/2027",
                source_updated_at: UPDATED_AT,
                private_payload: "DO_NOT_PUBLISH_PRIVATE_SEASON_PAYLOAD",
              }];
              break;
            case "football_clubs": data = "clubs" in scenario ? scenario.clubs : clubs(); break;
            case "football_fixtures": data = "fixtures" in scenario ? scenario.fixtures : [fixture()]; break;
            default: assert.fail(`unexpected table: ${table}`);
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const load = runInNewContext(`${serverSource}\nloadTouchlineOfficialLeagueTable;`, {
    TOUCHLINE_ENGLAND_CLUBS,
    TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT,
    TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
    resolveTouchlineOfficialLeagueTable,
    createAdminClient: () => { factoryCalls += 1; return scenario.noAdmin ? null : admin; },
    unstable_cache: (callback: () => Promise<TouchlineOfficialLeagueTable>, keys: string[], options: { revalidate: number; tags: string[] }) => {
      cacheCalls.push({ keys: [...keys], options: { ...options, tags: [...options.tags] } });
      return () => {
        const key = JSON.stringify(keys);
        if (!cachedResults.has(key)) cachedResults.set(key, callback());
        return cachedResults.get(key)!;
      };
    },
    revalidateTag: () => assert.fail("a public loader must not revalidate or mutate cache state"),
    fetch: () => assert.fail("a public loader must not call a provider"),
  }) as (request?: { providedAdmin?: typeof admin; includeLiveProjectionSource?: boolean }) => Promise<TouchlineOfficialLeagueTable>;
  return { admin, load, queries, executions, cacheCalls, get factoryCalls() { return factoryCalls; } };
}

function assertReadContract(queries: readonly Query[]) {
  const scopeQueries = [
    { table: "football_competitions", columns: "id", filters: [["provider", "sportmonks"], ["provider_competition_id", "8"]], orders: [], limit: null, single: true },
    { table: "football_seasons", columns: "id,provider_season_id,name,source_updated_at", filters: [["competition_id", COMPETITION], ["is_current", true]], orders: [], limit: null, single: false },
  ];
  assert.deepEqual(queries, [
    ...scopeQueries,
    ...scopeQueries,
    { table: "football_clubs", columns: "id,provider_team_id,name,short_code,logo_url,source_updated_at", filters: [["provider", "sportmonks"], ["competition_id", COMPETITION]], orders: [["name", { ascending: true }]], limit: null, single: false },
    { table: "football_fixtures", columns: "provider_fixture_id,season_id,status,home_club_id,away_club_id,home_score,away_score,starts_at,source_updated_at", filters: [["provider", "sportmonks"], ["competition_id", COMPETITION], ["season_id", SEASON]], orders: [["starts_at", { ascending: true }]], limit: 401, single: false },
  ]);
}

function assertNoSource(table: TouchlineOfficialLeagueTable) {
  assert.equal(Object.hasOwn(table, "liveProjectionSource"), false);
  assert.equal(table.liveProjectionSource, undefined);
}

test("the real loader adds the same complete public facts without an extra query or private DB fields", async () => {
  const run = harness({ fixtures: [fixture({ home_score: "2", away_score: "0" })] });
  const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
  assert.equal(table.state, "ready");
  assert.equal(run.factoryCalls, 0);
  assert.equal(run.cacheCalls.length, 0);
  assertReadContract(run.queries);
  assert.equal(run.executions.length, 6);
  const source = table.liveProjectionSource;
  assert.ok(source);
  assert.deepEqual(Object.keys(source).sort(), ["competitionProviderId", "fixtures", "season", "teams"]);
  assert.equal(source.competitionProviderId, "8");
  assert.equal(source.season, table.season);
  assert.equal(source.season.id, SEASON);
  assert.equal(source.season.providerSeasonId, "28083");
  assert.equal(source.teams.length, 20);
  assert.equal(new Set(source.teams.map((team) => team.clubId)).size, 20);
  assert.equal(new Set(source.teams.map((team) => team.providerTeamId)).size, 20);
  assert.equal(source.teams[0].clubId, id(0));
  assert.equal(source.teams[0].name, "Canonical club 1");
  assert.equal(source.teams[0].slug, TOUCHLINE_ENGLAND_CLUBS[0].slug);
  assert.equal(source.teams[0].logoUrl, TOUCHLINE_ENGLAND_CLUBS[0].logoUrl);
  assert.equal(source.teams[0].shortCode, TOUCHLINE_ENGLAND_CLUBS[0].shortCode);
  assert.deepEqual(Object.keys(source.season).sort(), ["id", "name", "providerSeasonId", "sourceUpdatedAt"]);
  assert.deepEqual(Object.keys(source.teams[0]).sort(), ["clubId", "logoUrl", "name", "providerTeamId", "shortCode", "slug", "sourceUpdatedAt"]);
  assert.deepEqual(JSON.parse(JSON.stringify(source.fixtures)), [{
    provider: "sportmonks", providerFixtureId: "19400001", seasonId: SEASON,
    status: "Finished", homeClubId: id(0), awayClubId: id(1), homeScore: 2, awayScore: 0,
    startsAt: "2026-10-22T19:00:00.000Z", sourceUpdatedAt: UPDATED_AT,
  }]);
  const withoutSource = Object.fromEntries(Object.entries(table).filter(([key]) => key !== "liveProjectionSource"));
  assert.deepEqual(withoutSource, resolveTouchlineOfficialLeagueTable(source));
  assert.doesNotMatch(JSON.stringify(table), /DO_NOT_PUBLISH|private_payload|UNTRUSTED|untrusted-logo/);
});

test("an actual empty fixture read keeps the neutral table and an empty live baseline", async () => {
  const run = harness({ fixtures: [] });
  const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
  assert.equal(table.state, "pending_no_final");
  assert.equal(table.liveProjectionSource?.fixtures.length, 0);
  assert.equal(table.liveProjectionSource?.teams.length, 20);
  assert.equal(table.rows.length, 20);
  assert.ok(table.rows.every((row) => row.points === 0 && row.sportsRank === 1));
  assertReadContract(run.queries);
});

test("a scheduled canonical fixture remains available for a later live update without invented scores", async () => {
  const run = harness({ fixtures: [fixture({ status: "Not Started", home_score: null, away_score: null })] });
  const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
  assert.equal(table.state, "pending_no_final");
  assert.equal(table.liveProjectionSource?.fixtures[0].status, "Not Started");
  assert.equal(table.liveProjectionSource?.fixtures[0].homeScore, null);
  assert.equal(table.liveProjectionSource?.fixtures[0].awayScore, null);
  assert.equal(table.coverage.completedFixtures, 0);
});

test("partial final results do not receive a live baseline", async () => {
  const run = harness({ fixtures: [fixture(), fixture()] });
  const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
  assert.equal(table.state, "partial");
  assert.equal(table.reason, "duplicate-fixture-observed");
  assertNoSource(table);
});

test("duplicate scheduled identities cannot become a baseline even when the table remains pending", async () => {
  const pending = fixture({ status: "Not Started", home_score: null, away_score: null });
  const run = harness({ fixtures: [pending, pending] });
  const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
  assert.equal(table.state, "pending_no_final");
  assertNoSource(table);
});

test("the existing 400-fixture boundary permits a complete baseline and excludes overflow", async () => {
  for (const count of [400, 401]) {
    const run = harness({ fixtures: Array.from({ length: count }, (_, index) => fixture({
      provider_fixture_id: String(19400001 + index), status: "Not Started", home_score: null, away_score: null,
    })) });
    const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
    assert.equal(table.state, "pending_no_final");
    if (count === 400) assert.equal(table.liveProjectionSource?.fixtures.length, 400);
    else assertNoSource(table);
    assertReadContract(run.queries);
  }
});

test("club count, canonical/provider duplicates and unresolved presentation fail closed", async () => {
  const sourceClubs = clubs();
  const invalidClubSets = [
    sourceClubs.slice(0, 19),
    sourceClubs.map((club, index) => index === 1 ? { ...club, id: sourceClubs[0].id } : club),
    sourceClubs.map((club, index) => index === 1 ? { ...club, provider_team_id: sourceClubs[0].provider_team_id } : club),
    sourceClubs.map((club, index) => index === 1 ? { ...club, provider_team_id: "unknown-provider-club" } : club),
  ];
  for (const invalidClubs of invalidClubSets) {
    const run = harness({ clubs: invalidClubs });
    const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
    assert.equal(table.state, "integrity_error");
    assertNoSource(table);
  }
});

test("discarded club rows do not silently authorize an apparently complete baseline", async () => {
  for (const discarded of [null, { id: "malformed-club" }]) {
    const run = harness({ clubs: [...clubs(), discarded] });
    const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
    assert.equal(table.state, "ready");
    assertNoSource(table);
  }
});

test("missing fixture identities, discarded rows and non-array reads are not an empty authoritative baseline", async () => {
  for (const malformed of [[fixture({ provider_fixture_id: " " })], [null], null, {}]) {
    const run = harness({ fixtures: malformed });
    const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
    assert.equal(table.state, "pending_no_final");
    assertNoSource(table);
  }
});

test("out-of-season fixture data cannot enter the public baseline even when the resolver filters it", async () => {
  const run = harness({ fixtures: [fixture({ season_id: "previous-season" })] });
  const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
  assert.equal(table.state, "pending_no_final");
  assert.equal(table.coverage.fixturesInSeason, 0);
  assertNoSource(table);
  assertReadContract(run.queries);
});

test("unmapped or same-club fixtures preserve integrity errors and expose no baseline", async () => {
  for (const homeClubId of [null, "unknown-club", id(1)]) {
    const run = harness({ fixtures: [fixture({ home_club_id: homeClubId })] });
    const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
    assert.equal(table.state, "integrity_error");
    assert.equal(table.reason, "fixture-club-mismatch");
    assertNoSource(table);
  }
});

test("query failures retain unavailable states without leaking database error details", async () => {
  for (const [errorTable, expectedQueries, reason] of [
    ["football_competitions", 1, "competition-query-failed"],
    ["football_seasons", 2, "season-query-failed"],
    ["football_clubs", 6, "league-table-query-failed"],
    ["football_fixtures", 6, "league-table-query-failed"],
  ] as const) {
    const run = harness({ errorTable });
    const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
    assert.equal(table.state, "unavailable");
    assert.equal(table.reason, reason);
    assert.equal(run.queries.length, expectedQueries);
    assertNoSource(table);
    assert.doesNotMatch(JSON.stringify(table), /DO_NOT_PUBLISH|private_payload/);
  }
});

test("missing competition or ambiguous season never starts the club/fixture reads", async () => {
  for (const scenario of [
    { competition: null },
    { seasons: [] },
    { seasons: [
      { id: SEASON, provider_season_id: "28083", name: "2026/2027" },
      { id: "another-season", provider_season_id: "28084", name: "2027/2028" },
    ] },
  ]) {
    const run = harness(scenario);
    const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
    assert.equal(table.state, "integrity_error");
    assertNoSource(table);
    assert.ok(run.queries.every((query) => query.table !== "football_clubs" && query.table !== "football_fixtures"));
  }
});

test("a season change between scope reads cannot publish a mixed-scope baseline", async () => {
  const run = harness({ secondSeason: "next-season" });
  const table = await run.load({ providedAdmin: run.admin, includeLiveProjectionSource: true });
  assert.equal(table.state, "integrity_error");
  assert.equal(table.season?.id, "next-season");
  assert.equal(run.queries.length, 4);
  assertNoSource(table);
});

test("the production cache path versions only the DTO key and retains its cadence, tag and query count", async () => {
  const run = harness();
  const table = await run.load({ includeLiveProjectionSource: true });
  assert.equal(table.state, "ready");
  assert.ok(table.liveProjectionSource);
  assert.equal(run.factoryCalls, 2);
  assertReadContract(run.queries);
  assert.deepEqual(run.cacheCalls, [{
    keys: ["touchline-official-league-table-v5", "8", SEASON],
    options: { revalidate: 10, tags: [`touchline-official-league-table:8:${SEASON}`] },
  }]);
});

test("default and explicit opt-out injected reads keep the original DTO without the fixture baseline", async () => {
  for (const includeLiveProjectionSource of [undefined, false]) {
    const run = harness();
    const table = includeLiveProjectionSource === undefined
      ? await run.load({ providedAdmin: run.admin })
      : await run.load({ providedAdmin: run.admin, includeLiveProjectionSource });
    assert.equal(table.state, "ready");
    assert.equal(table.rows.length, 20);
    assert.equal(table.coverage.completedFixtures, 1);
    assertNoSource(table);
    assertReadContract(run.queries);
    assert.equal(run.factoryCalls, 0);
    assert.equal(run.cacheCalls.length, 0);
  }
});

test("cached opt-in and opt-out calls never leak or remove the shared baseline in either order", async () => {
  for (const choices of [[undefined, true, false, true], [true, undefined, false, true]]) {
    const run = harness();
    let firstOptIn: TouchlineOfficialLeagueTable | null = null;
    let serializedBaseline: string | null = null;
    for (const includeLiveProjectionSource of choices) {
      const table = includeLiveProjectionSource === undefined
        ? await run.load()
        : await run.load({ includeLiveProjectionSource });
      assert.equal(table.state, "ready");
      if (includeLiveProjectionSource === true) {
        assert.ok(table.liveProjectionSource);
        if (firstOptIn) {
          assert.equal(table, firstOptIn, "opt-out must not mutate or replace the cached DTO");
          assert.equal(JSON.stringify(table.liveProjectionSource), serializedBaseline);
        } else {
          firstOptIn = table;
          serializedBaseline = JSON.stringify(table.liveProjectionSource);
        }
      } else {
        assertNoSource(table);
        if (firstOptIn) {
          assert.notEqual(table, firstOptIn);
          assert.equal(table.rows, firstOptIn.rows);
          assert.equal(table.coverage, firstOptIn.coverage);
          assert.ok(firstOptIn.liveProjectionSource, "omitting the response field must retain the cached field");
        }
      }
    }
    assert.ok(firstOptIn);
    assert.equal(run.cacheCalls.length, 4);
    assert.equal(new Set(run.cacheCalls.map((call) => JSON.stringify(call.keys))).size, 1);
    assert.deepEqual(run.cacheCalls[0].keys, ["touchline-official-league-table-v5", "8", SEASON]);
    // One full load followed by three existing current-scope checks; the
    // optional response projection must never trigger another fixture read.
    assert.equal(run.queries.length, 12);
    assert.equal(run.queries.filter((query) => query.table === "football_clubs").length, 1);
    assert.equal(run.queries.filter((query) => query.table === "football_fixtures").length, 1);
    assert.equal(run.factoryCalls, 5);
    assertReadContract(run.queries.slice(0, 6));
  }
});

test("the direct ClubHub caller opts in without changing mirror or invalid-source reads", async () => {
  const pageSource = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const helperSource = pageSource.match(/async function loadClubHubLeagueTable\([\s\S]*?(?=\nfunction ClubHubDeferredSection\()/)?.[0];
  assert.ok(helperSource, "the actual ClubHub source boundary must remain testable");
  const directCalls: unknown[] = [];
  const mirrorCalls: unknown[][] = [];
  const directResult = { source: "direct" };
  const mirrorResult = { source: "mirror" };
  const execute = runInNewContext(`${stripTypeScriptTypes(helperSource)}\nloadClubHubLeagueTable;`, {
    loadTouchlineOfficialLeagueTable: (options: unknown) => { directCalls.push(options); return directResult; },
    loadTouchlineQaMirroredLeagueTable: (...args: unknown[]) => { mirrorCalls.push(args); return mirrorResult; },
  }) as (club: { teamId: string }, source: string, mirror: Promise<unknown> | null) => Promise<unknown>;
  const mirrorPromise = Promise.resolve(mirrorResult);
  assert.equal(await execute({ teamId: "19" }, "direct", null), directResult);
  assert.equal(await execute({ teamId: "19" }, "qa-mirror", mirrorPromise), mirrorResult);
  assert.equal(await execute({ teamId: "19" }, "invalid", mirrorPromise), mirrorResult);
  assert.equal(directCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(directCalls)), [{ includeLiveProjectionSource: true }]);
  assert.deepEqual(mirrorCalls, [["19", mirrorPromise], ["19", mirrorPromise]]);
});

test("an unavailable admin cannot produce a public live baseline or perform a read", async () => {
  const run = harness({ noAdmin: true });
  const table = await run.load();
  assert.equal(table.state, "unavailable");
  assert.equal(table.reason, "supabase-admin-unavailable");
  assert.equal(run.queries.length, 0);
  assert.equal(run.cacheCalls.length, 0);
  assertNoSource(table);
});
