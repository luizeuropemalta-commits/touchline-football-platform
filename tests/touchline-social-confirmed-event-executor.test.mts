import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertTouchlineConfirmedEventQaBoundary,
  runTouchlineConfirmedEventRunner,
  runTouchlineConfirmedEventScheduler,
} from "../scripts/qa/run-touchline-social-confirmed-event-executor.mts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";
const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;

function rpcResult(data: unknown) {
  return Promise.resolve({ data, error: null });
}

test("043 executor boundary accepts only the canonical QA project and host", () => {
  const valid = {
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    TOUCHLINE_QA_BASE_URL: "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), TOUCHLINE_LIVE_SYNC_SECRET: "r".repeat(40),
    VERCEL_ENV: "preview",
  };
  assert.equal(assertTouchlineConfirmedEventQaBoundary(valid).projectRef, "xgxbwqxjssxxuihuwmgy");
  assert.throws(() => assertTouchlineConfirmedEventQaBoundary({ ...valid, VERCEL_ENV: "production" }),
    /QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineConfirmedEventQaBoundary({ ...valid, TOUCHLINE_QA_BASE_URL: "https://touchline.com.br" }),
    /QA_BOUNDARY_MISMATCH/);
});

test("scheduler binds exact fixture+event identities to Goal, Own Goal, Hat-trick and Red Card jobs", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === "touchline_social_043_claim_cycle") return rpcResult({ outcome: "claimed", leaseToken: UUID_A });
    if (name === "touchline_social_043_renew_cycle") return rpcResult({ outcome: "renewed" });
    if (name === "touchline_social_043_enqueue_job") return rpcResult({ outcome: "queued", jobId: UUID_B });
    if (name === "touchline_social_043_complete_cycle") return rpcResult({ outcome: "success" });
    throw new Error(`unexpected ${name}`);
  } };
  const common = { fixtureId: "19722192", teamId: null, firstObservedAt: "2026-08-31T18:40:00Z",
    startsAt: "2026-08-31T18:00:00Z", inputChecksum: SHA_A,
    sourceRevisionManifest: { "fixture-provider:19722192": 2 }, sourceRevisionChecksum: SHA_B } as const;
  const result = await runTouchlineConfirmedEventScheduler({
    admin: admin as never, base: new URL("https://qa.example.test"), renderSecret: "r".repeat(40),
    explicitFixtureId: "19722192", explicitEventId: "90001",
    discover: async () => [
      { ...common, eventId: "90001", contentType: "GOAL_CONFIRMED" },
      { ...common, eventId: "90002", contentType: "RED_CARD_CONFIRMED" },
      { ...common, eventId: "90003", contentType: "HAT_TRICK_HERO" },
    ],
  });
  assert.deepEqual(result, { outcome: "success", processed: 3 });
  const enqueues = calls.filter((call) => call.name === "touchline_social_043_enqueue_job");
  assert.deepEqual(enqueues.map((call) => call.args.p_event_provider_id), ["90001", "90002", "90003"]);
  assert.deepEqual(enqueues.map((call) => call.args.p_template_version),
    ["touchline-goal-event-feed-v1", "touchline-red-card-confirmed-story-v1", "touchline-hat-trick-feed-v1"]);
});

test("runner transports event identity and completes only the claimed immutable draft", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === "touchline_social_043_claim_cycle") return rpcResult({ outcome: "claimed", leaseToken: UUID_A });
    if (name === "touchline_social_043_claim_job") return rpcResult({ outcome: "claimed", jobId: UUID_B,
      leaseToken: UUID_C, fixtureId: "19722192", eventId: "90001", contentType: "GOAL_CONFIRMED",
      templateVersion: "touchline-goal-event-feed-v1", inputChecksum: SHA_A,
      sourceRevisionChecksum: SHA_B });
    if (name === "touchline_social_043_renew_cycle" || name === "touchline_social_043_renew_job") {
      return rpcResult({ outcome: "renewed" });
    }
    if (name === "touchline_social_043_complete_job" || name === "touchline_social_043_complete_cycle") {
      return rpcResult({ outcome: "completed" });
    }
    throw new Error(`unexpected ${name}`);
  } };
  const draftId = "44444444-4444-4444-8444-444444444444";
  const result = await runTouchlineConfirmedEventRunner({ admin: admin as never, generate: async (job) => {
    assert.equal(job.fixtureId, "19722192"); assert.equal(job.eventId, "90001");
    assert.equal(job.contentType, "GOAL_CONFIRMED"); return draftId;
  } });
  assert.equal(result.outcome, "completed");
  const completion = calls.find((call) => call.name === "touchline_social_043_complete_job");
  assert.equal(completion?.args.p_generated_draft_id, draftId);
  assert.equal(completion?.args.p_outcome, "COMPLETED");
});

test("043 Admin and migration keep exact event approval server-attested and outbound disabled", () => {
  const page = readFileSync("app/(app)/admin/social-publications/page.tsx", "utf8");
  const route = readFileSync("app/api/admin/social-publications/review/route.ts", "utf8");
  const migration = readFileSync("supabase/qa/043_touchline_qa_social_confirmed_events.sql", "utf8");
  assert.match(page, /touchline_social_confirmed_event_executor_cycles/);
  assert.match(page, /touchline_social_confirmed_event_generation_jobs/);
  assert.match(page, /MATCH EVENTS 043/);
  assert.match(route, /readTouchlineSocialConfirmedEventDraft/);
  assert.match(route, /touchline_social_043_issue_review_intent/);
  assert.match(route, /touchline_social_043_approve/);
  assert.match(route, /await admin\.rpc\(intentRpc/);
  assert.match(route, /await supabase\.rpc\(rpcName/);
  assert.match(migration, /grant execute on function public\.touchline_social_043_issue_review_intent\([^)]+\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.touchline_social_043_issue_review_intent\([^)]+\) to authenticated/);
  assert.match(migration, /TL_SOCIAL_CONFIRMED_EVENT_DISPATCH_DISABLED/);
  assert.doesNotMatch(migration, /graph\.facebook|instagram\.com|Meta access token|fetch\s*\(/i);
});
