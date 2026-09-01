import assert from "node:assert/strict";
import test from "node:test";

import { buildTouchlineSocialTemplateIdentity } from "../lib/touchlineArena/social-template-policy-contract.ts";
import {
  assertTouchlineTemplatePolicyQaBoundary,
  runTouchlineTemplateEvaluator,
  runTouchlineTemplateRegistry,
} from "../scripts/qa/run-touchline-social-template-policy-executor.mts";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const DRAFT = "22222222-2222-4222-8222-222222222222";
const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;
const TEMPLATE = buildTouchlineSocialTemplateIdentity({
  contentType: "MATCH_PREVIEW",
  placement: "INSTAGRAM_FEED",
  locale: "en-GB",
  width: 1080,
  height: 1350,
  templateVersion: "touchline-match-preview-feed-v1",
  renderedFields: ["fixture", "leaders"],
  visualTemplateChecksum: SHA_A,
  baseCopyChecksum: SHA_B,
  lexiconChecksum: SHA_C,
});

const DRAFT_ROW = {
  id: DRAFT,
  revision: 1,
  content_type: "MATCH_PREVIEW",
  placement: "INSTAGRAM_FEED",
  locale: "en-GB",
  width: 1080,
  height: 1350,
  template_version: "touchline-match-preview-feed-v1",
  source_revision_checksum: SHA_A,
  manifest_checksum: SHA_B,
  artifact_checksum: SHA_C,
  caption_checksum: `sha256:${"d".repeat(64)}`,
  artifact_storage_provider: "SUPABASE_STORAGE",
  artifact_storage_bucket: "touchline-social-drafts",
  artifact_storage_key: `sha256/${"c".repeat(64)}.png`,
  artifact_etag: "etag",
  artifact_content_type: "image/png",
  artifact_byte_length: 100,
  approval_state: "APPROVED",
  created_at: "2026-08-31T20:00:00.000Z",
};

function queryResult(rows: unknown[]) {
  const query = {
    select() { return query; },
    neq() { return query; },
    eq() { return query; },
    order() { return query; },
    range() { return query; },
    returns() { return query; },
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return query;
}

function adminFixture(calls: Array<{ name: string; args: Record<string, unknown> }>) {
  return {
    from(table: string) {
      assert.equal(table, "touchline_social_publication_drafts");
      return queryResult([DRAFT_ROW]);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "touchline_social_046_claim_cycle") return { data: { outcome: "claimed", leaseToken: CYCLE }, error: null };
      if (name === "touchline_social_046_renew_cycle") return { data: { outcome: "renewed" }, error: null };
      if (name === "touchline_social_046_complete_cycle") return { data: { outcome: "completed" }, error: null };
      if (name === "touchline_social_046_register_template") return { data: { outcome: "registered" }, error: null };
      if (name === "touchline_social_046_evaluate_draft") return { data: { outcome: "ready" }, error: null };
      if (name === "touchline_social_046_reconcile_candidates") return { data: { outcome: "reconciled" }, error: null };
      return { data: null, error: new Error(name) };
    },
  };
}

test("046 executor boundary is exact-QA-only and disabled by default", () => {
  const valid = {
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40),
    TOUCHLINE_SOCIAL_TEMPLATE_POLICY_EXECUTOR_ENABLED: "true",
    VERCEL_ENV: "preview",
  };
  assert.equal(assertTouchlineTemplatePolicyQaBoundary(valid).projectRef, "xgxbwqxjssxxuihuwmgy");
  assert.throws(() => assertTouchlineTemplatePolicyQaBoundary({ ...valid,
    TOUCHLINE_SOCIAL_TEMPLATE_POLICY_EXECUTOR_ENABLED: "false",
  }), /TL_SOCIAL_TEMPLATE_POLICY_QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineTemplatePolicyQaBoundary({ ...valid, VERCEL_ENV: "production" }),
    /TL_SOCIAL_TEMPLATE_POLICY_QA_BOUNDARY_MISMATCH/);
  assert.throws(() => assertTouchlineTemplatePolicyQaBoundary({ ...valid,
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co.evil.example",
  }), /TL_SOCIAL_TEMPLATE_POLICY_QA_BOUNDARY_MISMATCH/);
});

test("046 registry stores one exact approved exemplar identity under a fenced cycle", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const result = await runTouchlineTemplateRegistry({
    admin: adminFixture(calls) as never,
    registry: [TEMPLATE],
  });
  assert.deepEqual(result, { outcome: "success", processed: 1 });
  const register = calls.filter((call) => call.name === "touchline_social_046_register_template");
  assert.equal(register.length, 1);
  assert.equal(register[0]?.args.p_exemplar_draft_id, DRAFT);
  assert.deepEqual(register[0]?.args.p_template, TEMPLATE);
  assert.equal(calls.at(-1)?.args.p_outcome, "SUCCESS");
});

test("046 evaluator rehashes immutable bytes, binds item idempotency and never dispatches", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const result = await runTouchlineTemplateEvaluator({
    admin: adminFixture(calls) as never,
    artifactReader: {} as never,
    registry: [TEMPLATE],
    verifyArtifact: (async () => ({ ok: true, artifactChecksum: SHA_C })) as never,
  });
  assert.deepEqual(result, { outcome: "success", processed: 1, outbound: "disabled" });
  const evaluation = calls.find((call) => call.name === "touchline_social_046_evaluate_draft");
  assert.equal(evaluation?.args.p_draft_id, DRAFT);
  assert.equal(evaluation?.args.p_rehashed_artifact_checksum, SHA_C);
  assert.match(String(evaluation?.args.p_idempotency_key), /^sha256:[0-9a-f]{64}$/);
  assert.equal(calls.some((call) => /dispatch|instagram|facebook|meta/i.test(call.name)), false);
  assert.equal(calls.at(-1)?.args.p_outcome, "SUCCESS");
});

test("046 single-flight skip performs no reads, mutation or completion", async () => {
  const calls: string[] = [];
  const admin = {
    from() { throw new Error("unexpected read"); },
    async rpc(name: string) {
      calls.push(name);
      if (name === "touchline_social_046_claim_cycle") return { data: { outcome: "busy" }, error: null };
      throw new Error(`unexpected ${name}`);
    },
  };
  assert.deepEqual(await runTouchlineTemplateRegistry({ admin: admin as never, registry: [TEMPLATE] }),
    { outcome: "busy", processed: 0 });
  assert.deepEqual(calls, ["touchline_social_046_claim_cycle"]);
});
