import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS,
  buildTouchlineSocialTemplateIdentity,
  touchlineSocialAutoDeliveryIdempotencyKey,
} from "../lib/touchlineArena/social-template-policy-contract.ts";
import { readTouchlineSocialTemplateRegistry } from "../lib/touchlineArena/social-template-policy-server.ts";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;

test("046 registry derives immutable identities from the checked-in visual, copy and lexicon sources", async () => {
  const registry = await readTouchlineSocialTemplateRegistry();
  assert.equal(registry.length, TOUCHLINE_SOCIAL_TEMPLATE_DEFINITIONS.length);
  assert.ok(registry.length >= 12);
  assert.equal(new Set(registry.map((item) => `${item.contentType}:${item.placement}:${item.templateVersion}`)).size,
    registry.length);
  for (const identity of registry) {
    assert.match(identity.visualTemplateChecksum, /^sha256:[0-9a-f]{64}$/);
    assert.match(identity.baseCopyChecksum, /^sha256:[0-9a-f]{64}$/);
    assert.match(identity.lexiconChecksum, /^sha256:[0-9a-f]{64}$/);
    assert.match(identity.renderedFieldsChecksum, /^sha256:[0-9a-f]{64}$/);
    assert.match(identity.templateIdentityChecksum, /^sha256:[0-9a-f]{64}$/);
  }
});

test("046 changes identity for visual, copy, lexicon or rendered-field changes", () => {
  const base = {
    contentType: "MATCH_PREVIEW" as const,
    placement: "INSTAGRAM_FEED" as const,
    locale: "en-GB" as const,
    width: 1080 as const,
    height: 1350 as const,
    templateVersion: "touchline-match-preview-feed-v1",
    renderedFields: ["fixture", "leaders"],
    visualTemplateChecksum: SHA_A,
    baseCopyChecksum: SHA_B,
    lexiconChecksum: SHA_C,
  };
  const identity = buildTouchlineSocialTemplateIdentity(base);
  const variants = [
    { ...base, visualTemplateChecksum: SHA_B },
    { ...base, baseCopyChecksum: SHA_C },
    { ...base, lexiconChecksum: SHA_A },
    { ...base, renderedFields: ["fixture", "leaders", "venue"] },
  ].map(buildTouchlineSocialTemplateIdentity);
  for (const variant of variants) assert.notEqual(variant.templateIdentityChecksum, identity.templateIdentityChecksum);
  assert.deepEqual(buildTouchlineSocialTemplateIdentity({ ...base, renderedFields: ["leaders", "fixture", "fixture"] }), identity);
});

test("046 item idempotency binds the exact draft, dynamic revision, template and approved bytes", () => {
  const input = {
    draftId: "11111111-1111-4111-8111-111111111111",
    draftRevision: 2,
    templateIdentityChecksum: SHA_A,
    sourceRevisionChecksum: SHA_B,
    manifestChecksum: SHA_C,
    artifactChecksum: `sha256:${"d".repeat(64)}`,
    captionChecksum: `sha256:${"e".repeat(64)}`,
  };
  const key = touchlineSocialAutoDeliveryIdempotencyKey(input);
  assert.match(key, /^sha256:[0-9a-f]{64}$/);
  assert.equal(touchlineSocialAutoDeliveryIdempotencyKey(input), key);
  assert.notEqual(touchlineSocialAutoDeliveryIdempotencyKey({ ...input, draftRevision: 3 }), key);
  assert.notEqual(touchlineSocialAutoDeliveryIdempotencyKey({ ...input, sourceRevisionChecksum: SHA_C }), key);
  assert.notEqual(touchlineSocialAutoDeliveryIdempotencyKey({ ...input, templateIdentityChecksum: SHA_B }), key);
});

test("046 migration is OWNER-gated, RLS-enforced, fail-closed and outbound-disabled", () => {
  const sql = readFileSync("supabase/qa/046_touchline_qa_social_template_policy.sql", "utf8");
  const rollback = readFileSync("supabase/qa/046_touchline_qa_social_template_policy_rollback.sql", "utf8");
  assert.match(sql, /force row level security/gi);
  assert.match(sql, /TEMPLATE_APPROVAL_REQUIRED/);
  assert.match(sql, /TEMPLATE_APPROVED/);
  assert.match(sql, /AUTO_PUBLISH_ENABLED/);
  assert.match(sql, /touchline_social_require_owner_actor\(p_actor_id\)/);
  assert.match(sql, /grant execute on function public\.touchline_social_046_issue_template_intent\([^)]+\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.touchline_social_046_issue_template_intent\([^)]+\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.touchline_social_046_approve_template\([^)]+\) to authenticated/i);
  assert.match(sql, /revoke all on function public\.touchline_social_046_approve_template\([^)]+\) from public,anon,authenticated,service_role/i);
  assert.match(sql, /v_global\.kill_switch_engaged or v_type\.kill_switch_engaged/i);
  assert.match(sql, /DAILY_QUOTA_EXHAUSTED/);
  assert.match(sql, /DELIVERY_UNKNOWN/);
  assert.match(sql, /outboundMode','DISABLED'/i);
  assert.match(sql, /POLICY_READY_OUTBOUND_DISABLED/);
  assert.doesNotMatch(sql, /graph\.facebook|graph\.instagram|instagram\.com|access[_-]?token|client[_-]?secret|fetch\s*\(/i);
  assert.match(rollback, /TL_SOCIAL_046_ROLLBACK_ACTIVE_LEASE/);
  assert.match(rollback, /TL_SOCIAL_046_ROLLBACK_NONEMPTY/);
  assert.match(rollback, /touchline_social_046_read_template_for_review/);
});

test("046 Admin keeps review attestations server-side and exposes emergency controls without outbound", () => {
  const route = readFileSync("app/api/admin/social-publications/template-policy/route.ts", "utf8");
  const page = readFileSync("app/(app)/admin/social-publications/page.tsx", "utf8");
  const actions = readFileSync("components/touchline/admin/TouchlineSocialTemplatePolicyActions.tsx", "utf8");
  const controls = readFileSync("components/touchline/admin/TouchlineSocialDeliveryControlActions.tsx", "utf8");
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /isOwnerEmail/);
  assert.match(route, /verifyTouchlineSocialStoredArtifact/);
  assert.match(route, /await admin\.rpc\("touchline_social_046_issue_template_intent"/);
  assert.match(route, /await supabase\.rpc\("touchline_social_046_approve_template"/);
  assert.match(route, /touchline_social_046_set_delivery_control/);
  assert.match(page, /touchline_social_046_admin_status/);
  assert.match(page, /OUTBOUND.*DISABLED/si);
  assert.match(actions, /approve-template-artwork/);
  assert.match(actions, /approve-template-caption/);
  assert.match(controls, /set-delivery-control/);
  assert.doesNotMatch(`${route}\n${page}\n${actions}\n${controls}`, /graph\.facebook|graph\.instagram|access[_-]?token|client[_-]?secret/i);
});
