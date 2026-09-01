import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertTouchlineMatchPreviewQaBoundary,
  runTouchlineMatchPreviewRunner,
  runTouchlineMatchPreviewScheduler,
} from "../scripts/qa/run-touchline-social-match-preview-executor.mts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";
const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;

function rpcResult(data: unknown) {
  return Promise.resolve({ data, error: null });
}

test("041 executor boundary accepts only the canonical QA project and host", () => {
  const valid = {
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    TOUCHLINE_QA_BASE_URL: "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40),
    TOUCHLINE_LIVE_SYNC_SECRET: "r".repeat(40),
    VERCEL_ENV: "preview",
  };
  assert.equal(assertTouchlineMatchPreviewQaBoundary(valid).projectRef, "xgxbwqxjssxxuihuwmgy");
  assert.throws(() => assertTouchlineMatchPreviewQaBoundary({ ...valid, VERCEL_ENV: "production" }),
    /QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineMatchPreviewQaBoundary({ ...valid, TOUCHLINE_QA_BASE_URL: "https:\/\/touchline.com.br" }),
    /QA_BOUNDARY_MISMATCH/);
});

test("scheduler enqueues exactly one immutable MATCH_PREVIEW candidate", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "touchline_social_041_claim_cycle") return rpcResult({ outcome: "claimed", leaseToken: UUID_A });
      if (name === "touchline_social_041_renew_cycle") return rpcResult({ outcome: "renewed" });
      if (name === "touchline_social_041_enqueue_job") return rpcResult({ outcome: "queued", jobId: UUID_B });
      if (name === "touchline_social_041_complete_cycle") return rpcResult({ outcome: "success" });
      throw new Error(`unexpected ${name}`);
    },
  };
  const result = await runTouchlineMatchPreviewScheduler({
    admin: admin as never,
    base: new URL("https://qa.example.test"),
    renderSecret: "r".repeat(40),
    explicitFixtureId: "19722192",
    discover: async () => [{
      contentType: "MATCH_PREVIEW", fixtureId: "19722192", teamId: null,
      firstObservedAt: "2026-08-01T20:00:00.000Z", startsAt: "2026-08-31T18:00:00.000Z",
      inputChecksum: SHA_A, sourceRevisionManifest: { "fixture-provider:19722192": 7 },
      sourceRevisionChecksum: SHA_B,
    }],
  });
  assert.deepEqual(result, { outcome: "success", processed: 1, queued: 1 });
  const enqueues = calls.filter((call) => call.name === "touchline_social_041_enqueue_job");
  assert.equal(enqueues.length, 1);
  assert.equal(enqueues[0]?.args.p_fixture_provider_id, "19722192");
  assert.equal(enqueues[0]?.args.p_input_checksum, SHA_A);
  assert.equal(Object.hasOwn(enqueues[0]?.args ?? {}, "p_team_provider_id"), false);
});

test("runner binds the generated DRAFT to the exact claimed source revision", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "touchline_social_041_claim_cycle") return rpcResult({ outcome: "claimed", leaseToken: UUID_A });
      if (name === "touchline_social_041_claim_job") return rpcResult({
        outcome: "claimed", jobId: UUID_B, leaseToken: UUID_C, fixtureId: "19722192",
        inputChecksum: SHA_A, sourceRevisionChecksum: SHA_B,
      });
      if (name === "touchline_social_041_renew_cycle" || name === "touchline_social_041_renew_job") {
        return rpcResult({ outcome: "renewed" });
      }
      if (name === "touchline_social_041_complete_job" || name === "touchline_social_041_complete_cycle") {
        return rpcResult({ outcome: "completed" });
      }
      throw new Error(`unexpected ${name}`);
    },
  };
  const result = await runTouchlineMatchPreviewRunner({
    admin: admin as never,
    generate: async (job) => {
      assert.equal(job.fixtureId, "19722192");
      assert.equal(job.inputChecksum, SHA_A);
      assert.equal(job.sourceRevisionChecksum, SHA_B);
      return "44444444-4444-4444-8444-444444444444";
    },
  });
  assert.equal(result.outcome, "completed");
  const completion = calls.find((call) => call.name === "touchline_social_041_complete_job");
  assert.equal(completion?.args.p_generated_draft_id, "44444444-4444-4444-8444-444444444444");
  assert.equal(completion?.args.p_outcome, "COMPLETED");
});

test("041 migration is isolated, fail-closed and has no outbound implementation", () => {
  const migration = readFileSync("supabase/qa/041_touchline_qa_social_match_preview.sql", "utf8");
  const rollback = readFileSync("supabase/qa/041_touchline_qa_social_match_preview_rollback.sql", "utf8");
  assert.match(migration, /content_type in \('LINEUP', 'FINAL_SCORE', 'MATCH_PREVIEW'\)/);
  assert.match(migration, /touchline_social_match_preview_executor_cycles/);
  assert.match(migration, /touchline_social_match_preview_generation_jobs/);
  assert.match(migration, /touchline_social_041_assert_approval_gate/);
  assert.match(migration, /touchline_social_source_revision_is_current/);
  assert.match(migration, /CANONICAL_SOURCE_REVISION_CHANGED/);
  assert.equal((migration.match(/touchline-social-041-generation:' \|\| v_lookup_fixture_provider_id \|\| ':' \|\| v_lookup_template_version/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /touchline-social-041-generation:' \|\| p_draft_id/);
  assert.match(migration, /force row level security/gi);
  assert.match(migration, /team_provider_id is null/);
  assert.doesNotMatch(migration, /graph\.facebook|instagram\.com|Meta access token|fetch\s*\(/i);
  assert.match(rollback, /ROLLBACK_NONEMPTY/);
  assert.match(rollback, /content_type in \('LINEUP', 'FINAL_SCORE'\)/);
  assert.match(rollback, /pg_advisory_xact_lock\([\s\S]*?pg_catalog\.hashtextextended\('touchline-social-source-revision'/);
  assert.match(rollback, /lock table public\.touchline_social_match_preview_executor_cycles,[\s\S]*in access exclusive mode/);
  assert.match(rollback, /lock table public\.touchline_social_publication_drafts in share row exclusive mode/);
});

test("Admin routes MATCH_PREVIEW through its own atomic review authority", () => {
  const route = readFileSync("app/api/admin/social-publications/review/route.ts", "utf8");
  const page = readFileSync("app/(app)/admin/social-publications/page.tsx", "utf8");
  const proxy = readFileSync("proxy.ts", "utf8");
  const migration = readFileSync("supabase/qa/041_touchline_qa_social_match_preview.sql", "utf8");
  assert.match(route, /readTouchlineSocialMatchPreviewDraft/);
  assert.match(route, /touchline_social_041_issue_review_intent/);
  assert.match(route, /touchline_social_041_approve/);
  assert.match(route, /await admin\.rpc\(intentRpc/);
  assert.doesNotMatch(route, /await supabase\.rpc\(intentRpc/);
  assert.match(route, /const \{ data, error \} = await supabase\.rpc\(rpcName/);
  assert.match(migration, /grant execute on function public\.touchline_social_041_issue_review_intent\([^)]+\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.touchline_social_041_issue_review_intent\([^)]+\) to authenticated/);
  assert.match(proxy, /"\/visual-qa\/social-match-preview"/);
  assert.match(page, /touchline_social_match_preview_executor_cycles/);
  assert.match(page, /touchline_social_match_preview_generation_jobs/);
  assert.match(page, /MATCH PREVIEW 041/);
});

test("frozen 039 and 040 migration sources are not rewritten by 041", () => {
  const migration041 = readFileSync("supabase/qa/041_touchline_qa_social_match_preview.sql", "utf8");
  assert.doesNotMatch(migration041, /drop table public\.touchline_social_executor_cycles/);
  assert.doesNotMatch(migration041, /alter table public\.touchline_social_generation_jobs/);
  assert.match(migration041, /039 and 040 remain the LINEUP authority/);
  assert.match(migration041, /preserving its LINEUP branch/);
  assert.doesNotMatch(migration041, /remain byte-for-byte owned by 040/);
});
