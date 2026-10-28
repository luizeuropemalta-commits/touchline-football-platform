import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/football-data/fixture-schedule-store.ts", import.meta.url), "utf8");
const exports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, require(name: string) {
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => assert.fail("Use the supplied read-only client") };
    if (name === "@/lib/touchlineArena/coach-catalogue-server") return { readCompetitionCoachAssignments: async () => assert.fail("Read-only fixture queries must not reconcile coach assignments") };
    throw new Error(name);
  },
});
const read = exports.readPublicCompetitionFixtures as (options: Record<string, unknown>) => Promise<Array<{ providerId: string; seasonId: string }>>;
const readTarget = exports.readCurrentPublicCompetitionSeasonTarget as (options: Record<string, unknown>) => Promise<{ storageSeasonId: string; admissionScope: { competitionId: string; seasonId: string } } | null>;
const storageSeasonId = "11111111-1111-4111-8111-111111111111";
const readScope = exports.readCurrentPublicCompetitionAdmissionScope as (options: Record<string, unknown>) => Promise<unknown>;

test("admission scope reads the unique canonical current season, never a fixture's historical season", async () => {
  const filters: unknown[] = [];
  let reads = 0;
  let response: { data: unknown; error: unknown } = { data: { id: storageSeasonId, provider_season_id: "26000" }, error: null };
  const query = {
    select(columns: string) { assert.match(columns, /^id,provider_season_id,/); assert.match(columns, /football_competitions!inner/); return query; },
    eq(key: string, value: unknown) { filters.push([key, value]); return query; },
    maybeSingle: async () => { reads++; return response; },
  };
  const providedAdmin = { from(table: string) { assert.equal(table, "football_seasons"); return query; } };
  assert.deepEqual(JSON.parse(JSON.stringify(await readScope({ providedAdmin }))), { competitionId: "8", seasonId: "26000" });
  assert.deepEqual(filters, [["provider", "sportmonks"], ["is_current", true],
    ["football_competitions.provider", "sportmonks"], ["football_competitions.provider_competition_id", "8"]]);
  for (const failure of [{ data: null, error: null }, { data: { id: storageSeasonId, provider_season_id: "" }, error: null },
    { data: { id: "26000", provider_season_id: "26000" }, error: null },
    { data: null, error: { message: "multiple current seasons or private failure" } }]) {
    response = failure;
    assert.equal(await readScope({ providedAdmin }), null);
  }
  const before = reads;
  assert.equal(await readScope({ providedAdmin, isActive: () => false }), null);
  assert.equal(reads, before, "Expired SSR reads cannot start a canonical lookup");
});
const rows = Array.from({ length: 505 }, (_, index) => ({ provider: "sportmonks", provider_fixture_id: String(10000 + index),
  competition_id: "competition", season_id: index < 300 ? "old" : "current", round_id: "round",
  starts_at: index < 300 ? "2025-10-01T12:00:00Z" : "2026-10-25T12:00:00Z", status: "Full Time",
  home_score: 2, away_score: 1, home_club_id: "home", away_club_id: "away" }));

function client(options: { failOffset?: number; duplicateSecondPage?: boolean; afterPage?: () => void; serverCap?: number; emptySecondPage?: boolean; changeCount?: boolean } = {}) {
  const pages: Array<[number, number]> = [];
  const orders: string[][] = [];
  const relationSizes: number[] = [];
  return { pages, orders, relationSizes, from(table: string) {
    let start = 0, end = 99, season: unknown, lower = "", upper = "9999", ids: unknown[] = [];
    const order: string[] = [];
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { if (key === "season_id") season = value; return query; },
      order(key: string) { order.push(key); return query; },
      limit(limit: number) { end = limit - 1; return query; },
      range(from: number, to: number) { start = from; end = to; return query; },
      gte(_key: string, value: string) { lower = value; return query; },
      lte(_key: string, value: string) { upper = value; return query; },
      in(_key: string, values: unknown[]) { ids = values; relationSizes.push(values.length); return query; },
      maybeSingle: async () => ({ data: { id: "competition" }, error: null }),
      then(resolve: (value: unknown) => unknown) {
        let data: unknown, count: number | null = null;
        if (table === "football_fixtures") {
          pages.push([start, end]); orders.push(order);
          if (start === options.failOffset) return Promise.resolve(resolve({ data: null, error: { message: "private" } }));
          const filtered = rows.filter(row => (!season || row.season_id === season) && row.starts_at >= lower && row.starts_at <= upper);
          count = filtered.length + (start && options.changeCount ? 1 : 0);
          data = filtered.slice(start, Math.min(end + 1, start + (options.serverCap ?? Infinity)));
          if (start && options.duplicateSecondPage) data = [rows[0]];
          if (start && options.emptySecondPage) data = [];
          options.afterPage?.();
        } else if (table === "football_clubs") data = [
          { id: "home", provider_team_id: "1", name: "Home" }, { id: "away", provider_team_id: "2", name: "Away" },
        ];
        else if (table === "football_seasons") data = [
          { id: "old", provider_season_id: "25000" }, { id: "current", provider_season_id: "26000" },
        ].filter(row => ids.includes(row.id));
        else if (table === "football_rounds") data = [{ id: "round", provider_round_id: "1", name: "1" }];
        else assert.fail(`Unexpected table ${table}`);
        return Promise.resolve(resolve({ data, error: null, count }));
      },
    };
    return query;
  } };
}

test("explicit archive reads every page and season beyond fixture 240; legacy reads remain bounded", async () => {
  const db = client();
  const archive = await read({ providedAdmin: db, includeHistorical: true, readAllPages: true });
  assert.equal(archive.length, 505);
  assert.equal(archive.at(-1)?.providerId, "10504");
  assert.deepEqual(new Set(archive.map(row => row.seasonId)), new Set(["25000", "26000"]));
  assert.deepEqual(db.pages, [[0, 239], [240, 479], [480, 719]]);
  assert.ok(db.orders.every(order => order.join() === "starts_at,provider_fixture_id"), "stable tie-break across equal kickoff times");
  assert.ok(db.relationSizes.every(size => size <= 240), "hydrate relations per page");
  const legacy = client();
  assert.equal((await read({ providedAdmin: legacy, includeHistorical: true, limit: 100 })).length, 100);
  assert.deepEqual(legacy.pages, [[0, 99]]);
});

test("archive pages preserve explicitly requested season and time scope", async () => {
  const db = client();
  const archive = await read({ providedAdmin: db, includeHistorical: true, readAllPages: true, limit: 50,
    seasonId: "current", from: "2026-01-01T00:00:00Z", through: "2026-12-31T00:00:00Z" });
  assert.equal(archive.length, 205);
  assert.ok(archive.every(row => row.seasonId === "26000"));
  assert.equal(db.pages.length, 5);
});

for (const failure of [{ failOffset: 240 }, { duplicateSecondPage: true }, { emptySecondPage: true }, { changeCount: true }]) {
  test(`archive never presents a failed or repeated page as complete: ${JSON.stringify(failure)}`, async () => {
    assert.equal((await read({ providedAdmin: client(failure), includeHistorical: true, readAllPages: true })).length, 0);
    await assert.rejects(read({ providedAdmin: client(failure), includeHistorical: true, readAllPages: true, strictRead: true }), /FIXTURE_SCHEDULE_UNAVAILABLE/);
  });
}

test("SSR cancellation prevents starting the next archive page and exposes no partial archive", async () => {
  let active = true;
  const db = client({ afterPage: () => { active = false; } });
  assert.equal((await read({ providedAdmin: db, includeHistorical: true, readAllPages: true, isActive: () => active })).length, 0);
  assert.equal(db.pages.length, 1);
});

test("a Data API cap below requested page size cannot truncate the archive", async () => {
  const db = client({ serverCap: 100 });
  assert.equal((await read({ providedAdmin: db, includeHistorical: true, readAllPages: true })).length, 505);
  assert.deepEqual(db.pages.map(page => page[0]), [0, 100, 200, 300, 400, 500]);
});


test("season target binds internal UUID and public scope in one lookup, with public projection isolation", async () => {
  let reads = 0;
  const filters: Array<[string, unknown]> = [];
  const query = {
    select(columns: string) { assert.match(columns, /^id,provider_season_id,/); return query; },
    eq(key: string, value: unknown) { filters.push([key, value]); return query; },
    maybeSingle: async () => { reads++; return { data: { id: storageSeasonId, provider_season_id: "26000" }, error: null }; },
  };
  const providedAdmin = { from(table: string) { assert.equal(table, "football_seasons"); return query; } };
  const target = await readTarget({ providedAdmin });
  assert.deepEqual(JSON.parse(JSON.stringify(target)), { storageSeasonId, admissionScope: { competitionId: "8", seasonId: "26000" } });
  assert.equal(reads, 1, "target cannot independently resolve storage and provider seasons");
  assert.deepEqual(filters, [["provider", "sportmonks"], ["is_current", true],
    ["football_competitions.provider", "sportmonks"], ["football_competitions.provider_competition_id", "8"]]);
  const publicScope = await readScope({ providedAdmin });
  assert.equal(reads, 2, "public wrapper uses exactly one lookup per invocation");
  assert.deepEqual(JSON.parse(JSON.stringify(publicScope)), { competitionId: "8", seasonId: "26000" });
  assert.ok(!JSON.stringify(publicScope).includes(storageSeasonId), "internal UUID must not cross the public wrapper");
});

test("season target rejects missing, malformed, multiple and failed rows without fallback queries", async () => {
  for (const response of [
    { data: null, error: null },
    { data: { provider_season_id: "26000" }, error: null },
    { data: { id: "current", provider_season_id: "26000" }, error: null },
    { data: { id: ` ${storageSeasonId}`, provider_season_id: "26000" }, error: null },
    { data: { id: storageSeasonId, provider_season_id: "" }, error: null },
    { data: [{ id: storageSeasonId, provider_season_id: "26000" }], error: null },
    { data: { id: storageSeasonId, provider_season_id: "26000" }, error: { code: "PGRST116" } },
  ]) {
    let reads = 0;
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => { reads++; return response; } };
    const providedAdmin = { from: () => query };
    assert.equal(await readTarget({ providedAdmin }), null);
    assert.equal(await readScope({ providedAdmin }), null);
    assert.equal(reads, 2, "each failed invocation performs at most its single canonical query");
  }
});

test("season target cancellation fences both query admission and a late successful receipt", async () => {
  let active = false, reads = 0;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => {
    reads++; active = false;
    return { data: { id: storageSeasonId, provider_season_id: "26000" }, error: null };
  } };
  const providedAdmin = { from: () => query };
  assert.equal(await readTarget({ providedAdmin, isActive: () => active }), null);
  assert.equal(reads, 0);
  active = true;
  assert.equal(await readTarget({ providedAdmin, isActive: () => active }), null);
  assert.equal(reads, 1);
});
