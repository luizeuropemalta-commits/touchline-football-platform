import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { strictSportmonksId } from "../lib/football-data/sportmonks-season-topscorers.ts";
import { resolveGoldenBootPremierStageScope } from "../lib/touchlineArena/golden-boot-stage-scope.ts";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";

const source = (path: string) => stripTypeScriptTypes(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
const uuid = "00000000-0000-4000-8000-000000000008";
const seasonUuid = "00000000-0000-4000-8000-000000028083";
const owner = { email: "owner@synthetic.test", app_metadata: { touchline_arena_access_v1: true } };
const evidence = { ok: true, provider: "sportmonks", fetchedAt: "2026-10-01T00:00:00Z", cached: true, raw: "secret-raw", data: {
  requestedSeasonId: "28083", coverage: "complete", scopeStatus: "unavailable", reason: "secret-error", pagesRead: 1, fetchedAt: "2026-10-01T00:00:00Z",
  rows: [{ providerRecordId: "1", providerPlayerId: "10", providerTeamId: "9", leagueId: "8", seasonId: "28083", stageId: null, goals: 3, raw: "secret-row" }],
} };
function fakeClock() {
  let now = Date.parse("2026-10-01T01:00:00Z"), id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    runtime: { Date: class extends Date { static now() { return now; } }, setTimeout: (callback: () => void, delay: number) => { timers.set(++id, { at: now + delay, callback }); return id; }, clearTimeout: (key: number) => timers.delete(key) },
    async advance(ms: number) { now += ms; for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.callback(); } await flush(); },
    jump(ms: number) { now += ms; }, flush, pending: () => timers.size,
  };
}

test("integrated stage timeout and top timeout share at most fifteen seconds and observe late failures", async () => {
  const clock = fakeClock(); let stageReject!: (x: unknown) => void, topReject!: (x: unknown) => void;
  let budget = 0, done = false;
  const h = scenario({ runtime: clock.runtime,
    stageRead: () => new Promise((_yes, no) => { stageReject = no; }),
    topRead: params => { budget = params.totalBudgetMs; return new Promise((_yes, no) => { topReject = no; }); },
  });
  const result = h.run().then(value => { done = true; return value; }); await clock.flush();
  await clock.advance(2999); assert.equal(budget, 0); assert.equal(done, false);
  await clock.advance(1); assert.equal(budget, 12000);
  stageReject(new Error("late private stage")); await clock.flush();
  await clock.advance(11999); assert.equal(done, false);
  await clock.advance(1); assert.equal((await result).body.reason, "provider-budget-exhausted");
  topReject(new Error("late private top")); await clock.flush(); assert.equal(clock.pending(), 0);
});

test("elapsed stage work reduces remaining top budget and expired deadline starts no top read", async () => {
  for (const elapsed of [7000, 15000]) {
    const clock = fakeClock(); let budget = 0;
    const h = scenario({ runtime: clock.runtime, stageRead: async () => { clock.jump(elapsed); return { ok: false }; }, topRead: async params => { budget = params.totalBudgetMs; return evidence; } });
    const result = await h.run();
    assert.equal(budget, elapsed === 7000 ? 8000 : 0);
    if (elapsed === 15000) { assert.equal(result.body.reason, "provider-budget-exhausted"); assert.ok(!h.calls.includes("provider:get")); }
    assert.equal(clock.pending(), 0);
  }
});

test("independent stage sample declares truncation without granting award authority", async () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: String(i + 1), typeId: "223", leagueId: "8", seasonId: "28083" }));
  const result = await scenario({ stageRead: async () => ({ ok: true, fetchedAt: evidence.fetchedAt, data: { requestedSeasonId: "28083", leagueId: "8", coverage: "complete", fetchedAt: evidence.fetchedAt, rows } }) }).run();
  assert.equal(result.body.independentStageEvidence.listTruncated, true);
  assert.equal(result.body.independentStageEvidence.count, 21);
  assert.equal(result.body.independentStageEvidence.stages.length, 20);
  assert.equal(result.body.publicAwardEligible, false);
});
function scenario(options: { user?: unknown; qa?: string; ref?: string; production?: boolean; competitions?: unknown[]; seasons?: unknown[]; providerResult?: unknown; dbError?: boolean; providerThrows?: boolean; adminMissing?: boolean; authThrows?: boolean; runtime?: Record<string, unknown>; stageRead?: () => Promise<unknown>; topRead?: (params: { totalBudgetMs: number }) => Promise<unknown> } = {}) {
  const calls: string[] = [];
  const admin = { from(table: string) {
    calls.push(`read:${table}`);
    const filters: Array<[string, unknown]> = [];
    const query = {
      select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; }, limit(value: number) { assert.equal(value, 2); return query; },
      then(resolve: (value: unknown) => unknown) {
        if (table === "football_competitions") {
          assert.deepEqual(filters, [["provider", "sportmonks"], ["provider_competition_id", "8"]]);
          return Promise.resolve({ data: options.competitions ?? [{ id: uuid, provider_competition_id: "8" }], error: options.dbError ? { message: "secret-db" } : null }).then(resolve);
        }
        assert.equal(table, "football_seasons");
        assert.deepEqual(filters, [["provider", "sportmonks"], ["competition_id", uuid], ["is_current", true]]);
        return Promise.resolve({ data: options.seasons ?? [{ id: seasonUuid, provider_season_id: "28083", competition_id: uuid, is_current: true }], error: null }).then(resolve);
      },
    }; return query;
  } };
  const provider = { getSeasonStages: async (params: unknown) => {
    if (options.stageRead) return options.stageRead();
    assert.deepEqual(JSON.parse(JSON.stringify(params)), { seasonId: "28083", leagueId: "8", totalBudgetMs: 3000 });
    return { ok: true, fetchedAt: evidence.fetchedAt, data: { requestedSeasonId: "28083", leagueId: "8", coverage: "complete", fetchedAt: evidence.fetchedAt, rows: [{ id: "1", typeId: "223", leagueId: "8", seasonId: "28083", raw: "secret-stage" }] } };
  }, getSeasonTopScorers: async (params: unknown) => {
    calls.push("provider:get");
    if (options.topRead) return options.topRead(params as { totalBudgetMs: number });
    assert.equal(JSON.stringify(params), JSON.stringify({ seasonId: "28083", totalBudgetMs: 12_000, maxPages: 10 }));
    if (options.providerThrows) throw new Error("secret-provider");
    return options.providerResult ?? evidence;
  } };
  const helperPath = "lib/football-data/golden-boot-diagnostic.ts";
  const helper = existsSync(new URL(`../${helperPath}`, import.meta.url))
    ? runInNewContext(`${source(helperPath)}\nreadGoldenBootDiagnostic;`, { strictSportmonksId, resolveGoldenBootPremierStageScope, setTimeout, clearTimeout, ...options.runtime })
    : () => assert.fail("diagnostic helper is not implemented");
  const GET = runInNewContext(`${source("app/api/football-data/provider-diagnostic/route.ts")}\nGET;`, {
    process: { env: { TOUCHLINE_QA_SUPABASE_PROJECT_REF: options.ref ?? "xgxbwqxjssxxuihuwmgy", VERCEL_ENV: options.production ? "production" : "preview" } },
    NextResponse: { json: (body: unknown, init?: { status?: number; headers?: object }) => ({ body, status: init?.status ?? 200, headers: init?.headers ?? {} }) },
    createClient: async () => { calls.push("auth:client"); return { auth: { getUser: async () => { calls.push("auth:user"); if (options.authThrows) throw new Error("secret-auth"); return { data: { user: options.user === undefined ? owner : options.user } }; } } }; },
    hasTouchLineArenaAccess,
    isOwnerEmail: (email: string) => email === owner.email,
    inspectTouchlineIsolatedPreviewEnvironment: () => ({ status: options.qa ?? "qa" }),
    createAdminClient: () => { calls.push("admin"); return options.adminMissing ? null : admin; },
    createFootballDataProvider: () => { calls.push("provider:create"); return provider; },
    readGoldenBootDiagnostic: helper,
  });
  return { calls, run: () => GET({ nextUrl: new URL("https://qa.invalid/api/football-data/provider-diagnostic?scope=golden-boot&seasonId=999&maxPages=99&totalBudgetMs=999999") }) };
}

test("diagnostic resolves fresh independent stage scope without granting a public award", async () => {
  const clock = fakeClock();
  const fetchedAt = new Date(clock.runtime.Date.now()).toISOString();
  const stageEvidence = { ok: true, provider: "sportmonks", fetchedAt, data: {
    requestedSeasonId: "28083", leagueId: "8", coverage: "complete", fetchedAt,
    rows: [{ id: "123", typeId: "223", leagueId: "8", seasonId: "28083" }],
  } };
  const result = await scenario({ runtime: clock.runtime, stageRead: async () => stageEvidence }).run();
  assert.equal(result.body.stageAuthority, "canonical-season-stage");
  assert.deepEqual(JSON.parse(JSON.stringify(result.body.stageScope)), {
    authority: "canonical-season-stage", leagueId: "8", seasonId: "28083", stageId: "123",
  });
  assert.equal(result.body.stageScopeExpiresAt, new Date(Date.parse(fetchedAt) + 60_000).toISOString());
  assert.equal(result.body.publicAwardEligible, false);
  await clock.advance(60_001);
  const expired = await scenario({ runtime: clock.runtime, stageRead: async () => stageEvidence }).run();
  assert.equal(expired.body.stageAuthority, "unavailable");
  assert.equal(expired.body.stageScope, null);
  assert.equal(expired.body.stageScopeExpiresAt, null);
  const lateClock = fakeClock();
  const olderFetch = new Date(lateClock.runtime.Date.now() - 59_000).toISOString();
  const late = await scenario({ runtime: lateClock.runtime,
    stageRead: async () => ({ ...stageEvidence, fetchedAt: olderFetch, data: { ...stageEvidence.data, fetchedAt: olderFetch } }),
    topRead: async () => { lateClock.jump(2_000); return evidence; },
  }).run();
  assert.equal(late.body.stageAuthority, "unavailable", "Stage expiry during top-scorer read must revoke authority");
  assert.equal(late.body.stageScopeExpiresAt, null);
});

test("owner-only Golden Boot diagnostic resolves its canonical season and emits only private allowlisted evidence", async () => {
  const h = scenario();
  const result = await h.run();
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(result.body.stageAuthority, "unavailable");
  assert.equal(result.body.independentStageEvidence.state, "available");
  assert.equal(result.body.independentStageEvidence.count, 1);
  assert.ok(!JSON.stringify(result.body).includes("secret-stage"));
  assert.equal(result.body.publicAwardEligible, false);
  assert.equal(result.body.seasonProviderId, "28083");
  assert.equal(result.body.rowCount, 1);
  assert.equal(result.body.missingAssociationCount, 1);
  assert.equal(JSON.stringify(result.body).includes("secret"), false);
  assert.deepEqual(h.calls.slice(0, 2), ["auth:client", "auth:user"]);
  assert.equal(h.calls.filter(value => value === "provider:get").length, 1);
});

test("anonymous, customer, non-owner admin and owner without access never construct admin/provider", async () => {
  for (const user of [null, { ...owner, email: "customer@synthetic.test" }, { ...owner, email: "admin@synthetic.test" }, { ...owner, app_metadata: {} }]) {
    const h = scenario({ user });
    const result = await h.run();
    assert.equal(result.status, 401);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.deepEqual(h.calls, ["auth:client", "auth:user"]);
  }
});

test("authentication transport failures are denied without leaking errors or starting work", async () => {
  const h = scenario({ authThrows: true });
  const result = await h.run();
  assert.equal(result.status, 401);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.deepEqual(h.calls, ["auth:client", "auth:user"]);
  assert.equal(JSON.stringify(result.body).includes("secret"), false);
});

test("new diagnostic refuses Production, non-QA and incorrect QA project before admin/provider work", async () => {
  for (const options of [{ production: true }, { qa: "inactive" }, { qa: "active" }, { qa: "invalid" }, { ref: "wrong-project" }]) {
    const h = scenario(options);
    const result = await h.run();
    assert.equal(result.status, 403);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.deepEqual(h.calls, ["auth:client", "auth:user"]);
  }
});

test("absent, ambiguous or invalid canonical competition/season causes zero provider calls", async () => {
  const validCompetition = { id: uuid, provider_competition_id: "8" };
  const validSeason = { id: seasonUuid, provider_season_id: "28083", competition_id: uuid, is_current: true };
  for (const options of [
    { adminMissing: true }, { dbError: true },
    { competitions: [] }, { competitions: [validCompetition, validCompetition] },
    { competitions: [{ ...validCompetition, provider_competition_id: "9" }] },
    { competitions: [{ ...validCompetition, id: "not-canonical" }] },
    { seasons: [] }, { seasons: [validSeason, validSeason] },
    { seasons: [{ ...validSeason, provider_season_id: "../arbitrary" }] },
    { seasons: [{ ...validSeason, competition_id: "other" }] },
    { seasons: [{ ...validSeason, is_current: false }] },
  ]) {
    const h = scenario(options);
    const result = await h.run();
    assert.equal(result.status, 502);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(h.calls.some(call => call.startsWith("provider:")), false);
    assert.equal(JSON.stringify(result.body).includes("secret"), false);
  }
});

test("provider errors and malformed evidence never expose raw messages or partial leaders", async () => {
  for (const options of [
    { providerThrows: true },
    { providerResult: { ok: false, error: { code: "rate_limited", message: "secret-token-url", status: 429 } } },
    { providerResult: { ...evidence, data: { ...evidence.data, requestedSeasonId: "wrong-season" } } },
    { providerResult: { ...evidence, data: { ...evidence.data, coverage: "partial" } } },
    { providerResult: { ...evidence, data: { ...evidence.data, fetchedAt: "invalid" } } },
  ]) {
    const result = await scenario(options).run();
    assert.equal(result.status, 502);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(result.body.stageAuthority, "unavailable");
    assert.equal(result.body.publicAwardEligible, false);
    assert.equal(JSON.stringify(result.body).includes("secret"), false);
    assert.equal("sample" in result.body, false);
    assert.equal("leaders" in result.body, false);
  }
});

test("diagnostic samples and observed stages are bounded and never grant stage authority", async () => {
  const rows = Array.from({ length: 16 }, (_, n) => ({ ...evidence.data.rows[0], stageId: String(n + 1), providerPlayerId: String(n + 1) }));
  const result = await scenario({ providerResult: { ...evidence, data: { ...evidence.data, scopeStatus: "complete", rows } } }).run();
  assert.equal(result.status, 200);
  assert.equal(result.body.sample.length, 5);
  assert.equal(result.body.observedStageIds.length, 10);
  assert.equal(result.body.observedStageCount, 16);
  assert.equal(result.body.publicAwardEligible, false);
  assert.equal(result.body.stageAuthority, "unavailable");
  assert.equal("leaders" in result.body, false);
  assert.deepEqual(Object.keys(result.body.sample[0]).sort(), ["goals", "leagueId", "providerPlayerId", "providerTeamId", "seasonId", "stageId"]);
  const invalid = await scenario({ providerResult: { ...evidence, data: { ...evidence.data, rows: [{ ...rows[0], providerPlayerId: "9".repeat(21), stageId: "secret-stage" }] } } }).run();
  assert.equal(invalid.body.sample[0].providerPlayerId, null);
  assert.equal(invalid.body.sample[0].stageId, null);
  assert.equal(JSON.stringify(invalid.body).includes("secret"), false);
});
