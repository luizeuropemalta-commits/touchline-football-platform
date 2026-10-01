import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { stripTypeScriptTypes, registerHooks } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { parseSportmonksStatisticValue } from "../lib/football-data/sportmonks-statistics.ts";

const path = "lib/football-data/fixture-read-diagnostic.ts";
const source = (p: string) => stripTypeScriptTypes(readFileSync(new URL(`../${p}`, import.meta.url), "utf8")).replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
const fixture = "00000000-0000-4000-8000-000000000001", competition = "00000000-0000-4000-8000-000000000008", season = "00000000-0000-4000-8000-000000028083";
const now = Date.parse("2026-10-01T00:00:10Z");
function scenario(change: string = "") {
  const calls: string[] = [];
  const tables: Record<string, unknown[]> = {
    football_competitions: [{ id: competition, provider: "sportmonks", provider_competition_id: "8" }],
    football_seasons: [{ id: season, provider: "sportmonks", provider_season_id: "28083", competition_id: competition, is_current: true }],
    football_fixtures: [{ id: fixture, provider: "sportmonks", provider_fixture_id: "123", competition_id: competition, season_id: season }],
  };
  if (change === "duplicate") tables.football_fixtures.push(tables.football_fixtures[0]);
  if (change === "missing") tables.football_fixtures = [];
  if (change === "competition") tables.football_competitions = [];
  if (change === "season") tables.football_seasons.push(tables.football_seasons[0]);
  if (change === "scope") tables.football_fixtures = [{ ...tables.football_fixtures[0] as object, season_id: fixture }];
  const admin = { from(table: string) { calls.push(table); const filters: unknown[] = []; const q = { select(columns: string) { assert.equal(columns, table === "football_competitions" ? "id,provider,provider_competition_id" : table === "football_seasons" ? "id,provider,provider_season_id,competition_id,is_current" : "id,provider,provider_fixture_id,competition_id,season_id"); return q; }, eq(key: string, value: unknown) { filters.push([key, value]); return q; }, limit(n: number) {
    assert.equal(n, 2);
    assert.deepEqual(filters, table === "football_competitions" ? [["provider", "sportmonks"], ["provider_competition_id", "8"]] : table === "football_seasons" ? [["provider", "sportmonks"], ["competition_id", competition], ["is_current", true]] : [["provider", "sportmonks"], ["id", fixture], ["competition_id", competition], ["season_id", season]]);
    return Promise.resolve({ data: tables[table], error: null }); } }; return q; } };
  const fetchedAt = new Date(now - (change === "stale" ? 30001 : 1000)).toISOString();
  const feed = { fixture: { provider: "sportmonks", providerId: change === "identity" ? "999" : "123", competitionId: "8", seasonId: "28083", status: "finished" }, fetchedAt,
    events: [{ provider: "sportmonks", providerId: "4", fixtureId: "123", playerId: "5", teamId: "6", type: "Goal", status: "recorded", minute: 10, raw: "secret" }],
    lineups: [{ provider: "sportmonks", providerId: "7", fixtureId: "123", playerId: "5", teamId: "6", isStarter: true, statistics: [{ typeId: "118", code: "rating", value: "8.09" }], raw: "secret" }] };
  if (change === "events-duplicate") feed.events.push(feed.events[0]);
  if (change === "stats-duplicate") feed.lineups[0].statistics.push(feed.lineups[0].statistics[0]);
  const helper = existsSync(new URL(`../${path}`, import.meta.url)) ? runInNewContext(`${source(path)}\nreadFixtureDiagnostic;`, { parseSportmonksStatisticValue, Date: class extends Date { static now() { return now; } } }) : () => assert.fail("fixture diagnostic missing");
  return { calls, run: () => helper(admin, fixture, () => ({ getFixtureFantasyFeed: async (id: string, options: unknown) => { calls.push("provider"); assert.equal(id, "123"); assert.equal(JSON.stringify(options), JSON.stringify({ totalBudgetMs: 5000 })); if (change === "failure") throw Error("secret"); return { ok: true, provider: "sportmonks", fetchedAt, cached: true, data: feed, raw: "secret" }; } })) };
}
test("one canonical fixture resolves before one bounded provider read; DTO is private and allowlisted", async () => {
  const h = scenario(); const result = await h.run(); assert.equal(result.ok, true); assert.equal(result.publicScoringAuthority, false); assert.equal(result.fetchAgeMs, 1000); assert.equal(result.cached, true);
  assert.deepEqual(h.calls, ["football_competitions", "football_seasons", "football_fixtures", "provider"]); assert.ok(!JSON.stringify(result).includes("secret")); assert.equal(result.lineups[0].statistics[0].value, 8.09); assert.equal(result.lineups[0].isSubstitute, null); assert.equal(result.statisticalCompleteness, "unverified");
});
test("missing, ambiguous or wrong canonical scope never invokes provider", async () => { for (const mode of ["missing", "competition", "season", "duplicate", "scope"]) { const h = scenario(mode); assert.equal((await h.run()).ok, false); assert.ok(!h.calls.includes("provider")); } });
test("stale, failed, mismatched or duplicate provider evidence fails closed", async () => { for (const mode of ["stale", "failure", "identity", "events-duplicate", "stats-duplicate"]) { const result = await scenario(mode).run(); assert.equal(result.ok, false, mode); assert.ok(!JSON.stringify(result).includes("secret")); } });

test("fixture route enforces owner and the same dedicated QA gates before data access", async () => {
  for (const mode of ["ok", "anonymous", "not-owner", "no-access", "production", "wrong-ref", "not-qa"]) {
    let reads = 0;
    const GET = runInNewContext(`${source("app/api/football-data/provider-diagnostic/route.ts")}\nGET;`, {
      process: { env: { VERCEL_ENV: mode === "production" ? "production" : "preview", TOUCHLINE_QA_SUPABASE_PROJECT_REF: mode === "wrong-ref" ? "wrong" : "xgxbwqxjssxxuihuwmgy" } },
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mode === "anonymous" ? null : { email: "owner@synthetic.test" } } }) } }),
      hasTouchLineArenaAccess: (user: unknown) => !!user && mode !== "no-access", isOwnerEmail: () => mode !== "not-owner",
      inspectTouchlineIsolatedPreviewEnvironment: () => ({ status: mode === "not-qa" ? "invalid" : "qa" }),
      createAdminClient: () => { reads++; return {}; }, createFootballDataProvider: () => assert.fail("route must defer provider construction"),
      readFixtureDiagnostic: async (_admin: unknown, uuid: string) => { assert.equal(uuid, fixture); return { ok: true }; },
      NextResponse: { json: (body: unknown, init: { status: number }) => ({ body, status: init.status }) },
    });
    const result = await GET({ nextUrl: new URL(`https://qa.invalid/api/football-data/provider-diagnostic?scope=fixture&fixtureId=${fixture}`) });
    assert.equal(result.status, mode === "ok" ? 200 : ["anonymous", "not-owner", "no-access"].includes(mode) ? 401 : 403, mode);
    assert.equal(reads, mode === "ok" ? 1 : 0, mode);
  }
});

test("real adapter bounds HTTP attempt, preserves cached evidence, rejects invalid budget before fetch", async () => {
  const root = new URL("../", import.meta.url);
  const hook = registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith("@/") ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context); } });
  const { SportmonksFootballProvider } = await import("../lib/football-data/providers/sportmonks.ts");
  const { clearFootballDataCache } = await import("../lib/football-data/cache.ts");
  const original = globalThis.fetch; let calls = 0; let aborted = false;
  const provider = new SportmonksFootballProvider();
  Object.assign(provider, { token: () => "synthetic", baseUrl: () => "https://sportmonks.invalid/v3/football" });
  clearFootballDataCache();
  try {
    globalThis.fetch = async (_input, init) => { calls++; return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("synthetic abort")); }, { once: true })); };
    const result = await provider.getFixtureFantasyFeed("123", { totalBudgetMs: 20 });
    assert.equal(result.ok, false); assert.equal(calls, 1); assert.equal(aborted, true);
    assert.equal((await provider.getFixtureFantasyFeed("123", { totalBudgetMs: 5001 })).ok, false); assert.equal(calls, 1);
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ data: { id: 123, league_id: 8, season_id: 28083, name: "A vs B", starting_at: "2026-10-01T00:00:00Z" } }), { headers: { "content-type": "application/json" } }); };
    const first = await provider.getFixtureFantasyFeed("123", { totalBudgetMs: 100 });
    const second = await provider.getFixtureFantasyFeed("123", { totalBudgetMs: 100 });
    assert.equal(first.ok, true); assert.equal(second.ok, true); assert.equal(calls, 2);
    if (first.ok && second.ok) { assert.equal(second.cached, true); assert.equal(second.fetchedAt, first.fetchedAt); }
    clearFootballDataCache();
    let release!: (value: Response) => void;
    globalThis.fetch = async (_input, init) => { calls++; if (calls === 3) return new Promise(resolve => { release = resolve; }); return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("diagnostic abort")), { once: true })); };
    const owningRead = provider.getFixtureFantasyFeed("123");
    const boundedRead = await provider.getFixtureFantasyFeed("123", { totalBudgetMs: 10 });
    assert.equal(boundedRead.ok, false); assert.equal(calls, 4, "normal and diagnostic own separate requests");
    release(new Response(JSON.stringify({ data: null }), { headers: { "content-type": "application/json" } }));
    await owningRead;
    clearFootballDataCache();
    let diagnosticRelease!: (value: Response) => void;
    let normalAttempts = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 5) return new Promise(resolve => { diagnosticRelease = resolve; });
      normalAttempts++;
      return new Response(JSON.stringify(normalAttempts === 1 ? { error: "transient" } : { data: null }), { status: normalAttempts === 1 ? 503 : 200, headers: { "content-type": "application/json" } });
    };
    const diagnosticFirst = provider.getFixtureFantasyFeed("123", { totalBudgetMs: 1000 });
    const normalSecond = provider.getFixtureFantasyFeed("123");
    diagnosticRelease(new Response(JSON.stringify({ error: "transient" }), { status: 503, headers: { "content-type": "application/json" } }));
    assert.equal((await diagnosticFirst).ok, false);
    assert.equal((await normalSecond).ok, true, "normal caller retains retries after diagnostic-first transient error");
    assert.equal(normalAttempts, 2); assert.equal(calls, 7);
  } finally { globalThis.fetch = original; clearFootballDataCache(); hook.deregister(); }
});
