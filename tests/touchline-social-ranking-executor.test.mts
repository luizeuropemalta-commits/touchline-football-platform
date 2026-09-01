import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertTouchlineRankingQaBoundary,
  runTouchlineRankingRunner,
  runTouchlineRankingScheduler,
} from "../scripts/qa/run-touchline-social-ranking-executor.mts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";
const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;

function rpcResult(data: unknown) {
  return Promise.resolve({ data, error: null });
}

test("044 executor boundary accepts only canonical QA", () => {
  const valid = {
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    TOUCHLINE_QA_BASE_URL: "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), TOUCHLINE_LIVE_SYNC_SECRET: "r".repeat(40),
    VERCEL_ENV: "preview",
  };
  assert.equal(assertTouchlineRankingQaBoundary(valid).projectRef, "xgxbwqxjssxxuihuwmgy");
  assert.throws(() => assertTouchlineRankingQaBoundary({ ...valid, VERCEL_ENV: "production" }),
    /QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineRankingQaBoundary({ ...valid,
    TOUCHLINE_QA_BASE_URL: "https://touchline.com.br" }), /QA_BOUNDARY_MISMATCH/);
});

test("scheduler binds nullable scope and subject identities exactly", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === "touchline_social_044_claim_cycle") return rpcResult({ outcome: "claimed", leaseToken: UUID_A });
    if (name === "touchline_social_044_renew_cycle") return rpcResult({ outcome: "renewed" });
    if (name === "touchline_social_044_enqueue_job") return rpcResult({ outcome: "queued", jobId: UUID_B });
    if (name === "touchline_social_044_complete_cycle") return rpcResult({ outcome: "success" });
    throw new Error(`unexpected ${name}`);
  } };
  const common = { fixtureId: "19722192", firstObservedAt: "2026-08-31T17:40:00Z",
    startsAt: "2026-08-31T18:00:00Z", inputChecksum: SHA_A,
    sourceRevisionManifest: { "fixture-provider:19722192": 2 }, sourceRevisionChecksum: SHA_B } as const;
  const result = await runTouchlineRankingScheduler({
    admin: admin as never, base: new URL("https://qa.example.test"), renderSecret: "r".repeat(40),
    explicitContentType: "GAMEWEEK_RANKING_PREVIEW", explicitFixtureId: "19722192", explicitScopeId: "2",
    discover: async () => [
      { ...common, contentType: "GAMEWEEK_RANKING_PREVIEW", scopeId: "2", playerId: null },
      { ...common, contentType: "TOP_PERFORMER", scopeId: null, playerId: "1001" },
    ],
  });
  assert.deepEqual(result, { outcome: "success", processed: 2 });
  const enqueues = calls.filter((call) => call.name === "touchline_social_044_enqueue_job");
  assert.deepEqual(enqueues.map((call) => call.args.p_scope_provider_id), ["2", null]);
  assert.deepEqual(enqueues.map((call) => call.args.p_subject_player_provider_id), [null, "1001"]);
  assert.ok(enqueues.every((call) => call.args.p_template_version === "touchline-social-ranking-feed-v1"));
});

test("runner transports exact gameweek hero identity", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === "touchline_social_044_claim_cycle") return rpcResult({ outcome: "claimed", leaseToken: UUID_A });
    if (name === "touchline_social_044_claim_job") return rpcResult({ outcome: "claimed", jobId: UUID_B,
      leaseToken: UUID_C, fixtureId: "19722192", scopeId: "2", playerId: "1001",
      contentType: "GAMEWEEK_HERO", templateVersion: "touchline-social-ranking-feed-v1",
      inputChecksum: SHA_A, sourceRevisionChecksum: SHA_B });
    if (name === "touchline_social_044_renew_cycle" || name === "touchline_social_044_renew_job") {
      return rpcResult({ outcome: "renewed" });
    }
    if (name === "touchline_social_044_complete_job" || name === "touchline_social_044_complete_cycle") {
      return rpcResult({ outcome: "completed" });
    }
    throw new Error(`unexpected ${name}`);
  } };
  const draftId = "44444444-4444-4444-8444-444444444444";
  const result = await runTouchlineRankingRunner({ admin: admin as never, generate: async (job) => {
    assert.equal(job.scopeId, "2"); assert.equal(job.playerId, "1001");
    assert.equal(job.contentType, "GAMEWEEK_HERO"); return draftId;
  } });
  assert.equal(result.outcome, "completed");
  const completion = calls.find((call) => call.name === "touchline_social_044_complete_job");
  assert.equal(completion?.args.p_generated_draft_id, draftId);
});

test("044 preserves prior approval routing, server-only intent and disabled outbound", () => {
  const migration = readFileSync("supabase/qa/044_touchline_qa_social_ranking_family.sql", "utf8");
  assert.match(migration, /perform public\.touchline_social_043_assert_approval_gate\(new\.id\)/);
  assert.match(migration, /perform public\.touchline_social_042_assert_approval_gate\(new\.id\)/);
  assert.match(migration, /perform public\.touchline_social_041_assert_approval_gate\(new\.id\)/);
  assert.match(migration, /grant execute on function public\.touchline_social_044_issue_review_intent\([^)]+\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.touchline_social_044_issue_review_intent\([^)]+\) to authenticated/);
  assert.match(migration, /TL_SOCIAL_RANKING_DISPATCH_DISABLED/);
  assert.doesNotMatch(migration, /graph\.facebook|instagram\.com|Meta access token|fetch\s*\(/i);
});
