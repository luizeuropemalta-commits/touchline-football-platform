import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTouchlineFinalResultQaBoundary,
  runTouchlineFinalResultRunner,
  runTouchlineFinalResultScheduler,
} from "../scripts/qa/run-touchline-social-final-result-executor.mts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";
const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;

function rpcResult(data: unknown) {
  return Promise.resolve({ data, error: null });
}

test("042 executor boundary rejects Production and non-canonical hosts", () => {
  const valid = {
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    TOUCHLINE_QA_BASE_URL: "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), TOUCHLINE_LIVE_SYNC_SECRET: "r".repeat(40), VERCEL_ENV: "preview",
  };
  assert.equal(assertTouchlineFinalResultQaBoundary(valid).projectRef, "xgxbwqxjssxxuihuwmgy");
  assert.throws(() => assertTouchlineFinalResultQaBoundary({ ...valid, VERCEL_ENV: "production" }), /QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineFinalResultQaBoundary({ ...valid, TOUCHLINE_QA_BASE_URL: "https://touchline.com.br" }), /QA_BOUNDARY_MISMATCH/);
});

test("scheduler emits one Feed job and one Story job from one source revision", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === "touchline_social_042_claim_cycle") return rpcResult({ outcome: "claimed", leaseToken: UUID_A });
    if (name === "touchline_social_042_renew_cycle") return rpcResult({ outcome: "renewed" });
    if (name === "touchline_social_042_enqueue_job") return rpcResult({ outcome: "queued", jobId: UUID_B });
    if (name === "touchline_social_042_complete_cycle") return rpcResult({ outcome: "success" });
    throw new Error(`unexpected ${name}`);
  } };
  const common = { fixtureId: "19722186", teamId: null, firstObservedAt: "2026-08-30T17:00:00Z",
    startsAt: "2026-08-30T15:00:00Z", inputChecksum: SHA_A,
    sourceRevisionManifest: { "fixture-provider:19722186": 2 }, sourceRevisionChecksum: SHA_B } as const;
  const result = await runTouchlineFinalResultScheduler({
    admin: admin as never, base: new URL("https://qa.example.test"), renderSecret: "r".repeat(40),
    discover: async () => [{ ...common, contentType: "FULL_TIME" }, { ...common, contentType: "FINAL_SCORE" }],
  });
  assert.deepEqual(result, { outcome: "success", processed: 2 });
  const enqueues = calls.filter((call) => call.name === "touchline_social_042_enqueue_job");
  assert.deepEqual(enqueues.map((call) => call.args.p_content_type), ["FULL_TIME", "FINAL_SCORE"]);
  assert.deepEqual(enqueues.map((call) => call.args.p_template_version),
    ["touchline-full-time-feed-v1", "touchline-final-score-story-v1"]);
  assert.ok(enqueues.every((call) => call.args.p_input_checksum === SHA_A
    && call.args.p_source_revision_checksum === SHA_B));
});

test("runner binds exact content/template/source identity to the completed draft", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === "touchline_social_042_claim_cycle") return rpcResult({ outcome: "claimed", leaseToken: UUID_A });
    if (name === "touchline_social_042_claim_job") return rpcResult({ outcome: "claimed", jobId: UUID_B,
      leaseToken: UUID_C, fixtureId: "19722186", contentType: "FINAL_SCORE",
      templateVersion: "touchline-final-score-story-v1", inputChecksum: SHA_A, sourceRevisionChecksum: SHA_B });
    if (name === "touchline_social_042_renew_cycle" || name === "touchline_social_042_renew_job") return rpcResult({ outcome: "renewed" });
    if (name === "touchline_social_042_complete_job" || name === "touchline_social_042_complete_cycle") return rpcResult({ outcome: "completed" });
    throw new Error(`unexpected ${name}`);
  } };
  const draftId = "44444444-4444-4444-8444-444444444444";
  const result = await runTouchlineFinalResultRunner({ admin: admin as never, generate: async (job) => {
    assert.equal(job.contentType, "FINAL_SCORE"); assert.equal(job.templateVersion, "touchline-final-score-story-v1");
    assert.equal(job.inputChecksum, SHA_A); assert.equal(job.sourceRevisionChecksum, SHA_B); return draftId;
  } });
  assert.equal(result.outcome, "completed");
  const completion = calls.find((call) => call.name === "touchline_social_042_complete_job");
  assert.equal(completion?.args.p_generated_draft_id, draftId);
  assert.equal(completion?.args.p_outcome, "COMPLETED");
});
