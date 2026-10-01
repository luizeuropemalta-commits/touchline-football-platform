import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { strictSportmonksId } from "../lib/football-data/sportmonks-season-topscorers.ts";
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
function scenario(options: { user?: unknown; qa?: string; ref?: string; production?: boolean; competitions?: unknown[]; seasons?: unknown[]; providerResult?: unknown; dbError?: boolean; providerThrows?: boolean; adminMissing?: boolean; authThrows?: boolean } = {}) {
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
  const provider = { getSeasonTopScorers: async (params: unknown) => {
    calls.push("provider:get");
    assert.equal(JSON.stringify(params), JSON.stringify({ seasonId: "28083", totalBudgetMs: 12_000, maxPages: 10 }));
    if (options.providerThrows) throw new Error("secret-provider");
    return options.providerResult ?? evidence;
  } };
  const helperPath = "lib/football-data/golden-boot-diagnostic.ts";
  const helper = existsSync(new URL(`../${helperPath}`, import.meta.url))
    ? runInNewContext(`${source(helperPath)}\nreadGoldenBootDiagnostic;`, { strictSportmonksId })
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

test("owner-only Golden Boot diagnostic resolves its canonical season and emits only private allowlisted evidence", async () => {
  const h = scenario();
  const result = await h.run();
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(result.body.stageAuthority, "unavailable");
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
