import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTouchlineClubFeedQaBoundary,
  runTouchlineClubSocialRunner,
  runTouchlineClubSocialScheduler,
} from "../scripts/qa/run-touchline-social-club-feed-executor.mts";

const SCHEDULER = "11111111-1111-4111-8111-111111111111";
const RUNNER = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";
const JOB_LEASE = "44444444-4444-4444-8444-444444444444";
const DRAFT = "55555555-5555-4555-8555-555555555555";
const SHA = `sha256:${"a".repeat(64)}`;

test("045 scheduler is idempotent through the durable enqueue RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = { async rpc(name: string, args: Record<string, unknown>) {
    calls.push({ name, args });
    if (name === "touchline_social_045_claim_cycle") return { data: { outcome: "claimed", leaseToken: SCHEDULER }, error: null };
    if (name === "touchline_social_045_renew_cycle") return { data: { outcome: "renewed" }, error: null };
    if (name === "touchline_social_045_enqueue_job") return { data: { outcome: "queued", jobId: JOB }, error: null };
    if (name === "touchline_social_045_expire_posts") return { data: { outcome: "completed", deleted: 0 }, error: null };
    if (name === "touchline_social_045_complete_cycle") return { data: { outcome: "completed" }, error: null };
    return { data: null, error: new Error(name) };
  } } as never;
  const result = await runTouchlineClubSocialScheduler({ admin, discover: async () => [{
    draftId: DRAFT, targetTeamIds: ["15", "19"], timelineCopy: "Full Time: Aston Villa 1–2 Arsenal.",
    timelineCopyChecksum: SHA,
  }] });
  assert.deepEqual(result, { outcome: "success", processed: 1, expired: 0 });
  assert.equal(calls.filter((call) => call.name === "touchline_social_045_enqueue_job").length, 1);
  assert.equal(calls.at(-1)?.args.p_outcome, "SUCCESS");
});

test("045 runner creates one first-party post and never calls an outbound adapter", async () => {
  const calls: string[] = [];
  let claimed = false;
  const admin = { async rpc(name: string) {
    calls.push(name);
    if (name === "touchline_social_045_claim_cycle") return { data: { outcome: "claimed", leaseToken: RUNNER }, error: null };
    if (name === "touchline_social_045_renew_cycle") return { data: { outcome: "renewed" }, error: null };
    if (name === "touchline_social_045_claim_job") {
      if (claimed) return { data: { outcome: "empty" }, error: null };
      claimed = true;
      return { data: { outcome: "claimed", jobId: JOB, leaseToken: JOB_LEASE, draftId: DRAFT }, error: null };
    }
    if (name === "touchline_social_045_renew_job") return { data: { outcome: "renewed" }, error: null };
    if (name === "touchline_social_045_complete_job") return { data: { outcome: "published", postId: DRAFT }, error: null };
    if (name === "touchline_social_045_complete_cycle") return { data: { outcome: "completed" }, error: null };
    return { data: null, error: new Error(name) };
  } } as never;
  assert.deepEqual(await runTouchlineClubSocialRunner({ admin }), { outcome: "success", processed: 1 });
  assert.equal(calls.filter((name) => name === "touchline_social_045_complete_job").length, 1);
  assert.equal(calls.some((name) => /dispatch|instagram|meta/i.test(name)), false);
});

test("045 executable boundary is explicit QA-only and disabled by default", () => {
  const valid = {
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40),
    TOUCHLINE_SOCIAL_CLUB_FEED_EXECUTOR_ENABLED: "true",
    VERCEL_ENV: "preview",
  };
  assert.equal(assertTouchlineClubFeedQaBoundary(valid).projectRef, "xgxbwqxjssxxuihuwmgy");
  assert.throws(() => assertTouchlineClubFeedQaBoundary({ ...valid,
    TOUCHLINE_SOCIAL_CLUB_FEED_EXECUTOR_ENABLED: "false",
  }), /TL_CLUB_FEED_EXECUTOR_QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineClubFeedQaBoundary({ ...valid, VERCEL_ENV: "production" }),
    /TL_CLUB_FEED_EXECUTOR_QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineClubFeedQaBoundary({ ...valid,
    SUPABASE_URL: "https://wrong-project.supabase.co",
  }), /TL_CLUB_FEED_EXECUTOR_QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineClubFeedQaBoundary({ ...valid,
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.attacker.example",
  }), /TL_CLUB_FEED_EXECUTOR_QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineClubFeedQaBoundary({ ...valid,
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co.evil.example",
  }), /TL_CLUB_FEED_EXECUTOR_QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineClubFeedQaBoundary({ ...valid,
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co/redirect",
  }), /TL_CLUB_FEED_EXECUTOR_QA_BOUNDARY_MISMATCH/);
});
