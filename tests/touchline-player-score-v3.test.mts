import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { inspectTouchlineProductionSyncRuntime } from "../lib/football-data/production-sync-runtime.ts";

import {
  TOUCHLINE_PLAYER_SCORING_V3_VERSION,
  touchLinePlayerFixtureScoreV3,
  touchLinePointsFromSportmonksRating,
} from "../lib/football-data/player-score-engine-v3.ts";

test("player_scoring_v3 has the approved Sportmonks rating boundaries", () => {
  const cases = [
    [5.8, -1], [6.0, 0], [6.4, 0], [6.5, 1], [6.9, 1],
    [7.0, 2], [7.4, 2], [7.5, 3], [7.9, 3], [8.0, 5],
    [8.4, 5], [8.5, 7], [8.9, 7], [9.0, 9], [9.4, 9],
    [9.5, 12], [10.0, 12],
  ] as const;
  assert.equal(TOUCHLINE_PLAYER_SCORING_V3_VERSION, "player_scoring_v3");
  for (const [rating, points] of cases) assert.equal(touchLinePointsFromSportmonksRating(rating), points);
});

test("V3 has one current rating result, never an accumulated live snapshot", () => {
  const first = touchLinePlayerFixtureScoreV3(7.2);
  const current = touchLinePlayerFixtureScoreV3(8.1);
  assert.equal(first.points, 2);
  assert.equal(current.points, 5);
  assert.equal(current.contributions[0]?.points, 5);
});

test("missing rating stays unavailable and never becomes zero", () => {
  const missing = touchLinePlayerFixtureScoreV3(null);
  assert.equal(missing.points, null);
  assert.equal(missing.coverageStatus, "unavailable");
  assert.deepEqual(missing.missingFacts, ["sportmonks-rating"]);
});

test("the protected V3 rebuild route preserves the dedicated QA branch", () => {
  const route = readFileSync(new URL("../app/api/football-data/player-season-statistics/sync/route.ts", import.meta.url), "utf8");
  assert.match(route, /inspectTouchlineIsolatedPreviewEnvironment\(\)\.status === "qa"/);
  assert.match(route, /TOUCHLINE_QA_SUPABASE_PROJECT_REF === QA_PROJECT_REF/);
});

const productionEnvironment = {
  VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM",
  VERCEL_ORG_ID: "team_P1d7YNrmUObvbJJTJRlGcXoz", TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED: "true",
  SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: "https://touchline.com.br",
};

function rebuildRoute(environment: Record<string, string | undefined>, owner = false, scorerOk = true) {
  const calls: string[] = [];
  const source = stripTypeScriptTypes(readFileSync(new URL("../app/api/football-data/player-season-statistics/sync/route.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  const post = runInNewContext(`${source}\nPOST;`, {
    process: { env: environment },
    inspectTouchlineProductionSyncRuntime,
    inspectTouchlineIsolatedPreviewEnvironment: () => ({ status: environment.VERCEL_ENV === "preview" ? "qa" : "inactive" }),
    NextResponse: { json: (body: unknown, options: { status: number }) => ({ body, status: options.status }) },
    createClient: async () => { calls.push("auth-client"); return { auth: { getUser: async () => ({ data: { user: owner ? { email: "owner@example.test" } : null } }) } }; },
    hasTouchLineArenaAccess: (user: unknown) => Boolean(user), isOwnerEmail: () => owner,
    createAdminClient: () => { calls.push("admin-client"); return {}; },
    syncTouchLinePlayerSeasonStatistics: async () => { calls.push("scorer"); return { ok: scorerOk }; },
  }) as (request: unknown) => Promise<{ status: number }>;
  return { calls, run: () => post({ headers: { get: () => null } }) };
}

test("explicit bound Production rebuild reaches scoring only after owner authentication", async () => {
  const allowed = rebuildRoute(productionEnvironment, true);
  assert.equal((await allowed.run()).status, 200);
  assert.deepEqual(allowed.calls, ["auth-client", "admin-client", "scorer"]);
});

test("Production rebuild remains authenticated and reports scoring failure", async () => {
  const denied = rebuildRoute(productionEnvironment);
  assert.equal((await denied.run()).status, 401);
  assert.deepEqual(denied.calls, ["auth-client"]);
  const failed = rebuildRoute(productionEnvironment, true, false);
  assert.equal((await failed.run()).status, 500);
});

for (const change of [
  { TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED: undefined },
  { SUPABASE_URL: "https://wrong.supabase.co" },
  { VERCEL_ENV: "development" },
  { TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" },
]) test(`rebuild runtime rejection precedes all clients: ${JSON.stringify(change)}`, async () => {
  const denied = rebuildRoute({ ...productionEnvironment, ...change }, true);
  assert.equal((await denied.run()).status, 403);
  assert.deepEqual(denied.calls, []);
});

test("dedicated QA rebuild still reaches scoring without Production activation", async () => {
  const qa = rebuildRoute({ VERCEL_ENV: "preview", TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy" }, true);
  assert.equal((await qa.run()).status, 200);
  assert.deepEqual(qa.calls, ["auth-client", "admin-client", "scorer"]);
});

test("V2 ranking history cannot become an active product read model", () => {
  const reader = readFileSync(new URL("../lib/touchlineArena/card-ranking-server.ts", import.meta.url), "utf8");
  const catalog = readFileSync(new URL("../lib/touchlineArena/ranked-card-catalog-server.ts", import.meta.url), "utf8");
  assert.match(reader, /record\.scoring_version !== "player_scoring_v3"/);
  assert.doesNotMatch(reader, /record\.scoring_version !== "player_scoring_v2"/);
  assert.match(catalog, /state\.scoringVersion !== "player_scoring_v3"/);
  assert.match(catalog, /touchline_player_fixture_score_settlements/);
  assert.doesNotMatch(catalog, /football_player_fixture_statistics/);
});
