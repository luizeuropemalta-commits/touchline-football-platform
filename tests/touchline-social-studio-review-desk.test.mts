import assert from "node:assert/strict";
import test from "node:test";
import { applyStudioAction, defaultStudioAutomation, emptyStudioDocument, parseStudioAction, studioCaption, studioStatus, validateStudioMedia, validateStudioRetry, type StudioAction, type StudioDeliveryAttempt, type StudioMedia } from "../lib/touchlineArena/social-studio-contract.ts";
import { studioEyesApproved, studioEyesSeal } from "../lib/touchlineArena/social-studio-desk.ts";
import { STUDIO_CATALOG } from "../lib/touchlineArena/social-studio-catalog.ts";
import { studioMediaIdentity } from "../lib/touchlineArena/social-studio-artifact.ts";

const now = Date.parse("2026-09-15T12:00:00Z");
const hash = `sha256:${"a".repeat(64)}`;
const reviewSessionId = "b2c1fa0d-ab0c-4fb1-887a-a5ec75165430";
const base = { requestId: "a2c1fa0d-ab0c-4fb1-887a-a5ec75165430", artId: "MATCH_PREVIEW", platform: "INSTAGRAM", placement: "FEED", expectedRevision: 0 };
const media: StudioMedia = {
  artId: "MATCH_PREVIEW", version: "test-v1", placement: "FEED", filePath: "artifacts/social-studio/test.mp4", sha256: hash,
  objectKey: `v1/MATCH_PREVIEW/FEED/${"a".repeat(64)}.mp4`, byteSize: 1024, etag: '"test-etag"',
  width: 1080, height: 1350, durationSeconds: 6, caption: "Test fixture only, never publish.",
  verification: { reportPath: "artifacts/social-studio/report.json", reportSha256: hash },
  provenance: { source: "test-fixture", fetchedAt: "2026-09-15T10:00:00Z", asOf: "2026-09-15T09:00:00Z", validUntil: "2026-09-16T00:00:00Z", competitionId: "test-league", seasonId: "test-season", fixtureIds: ["test-fixture"], teamIds: ["test-home", "test-away"], playerIds: ["test-home-player", "test-away-player"], snapshotPath: "artifacts/social-studio/snapshot.json", snapshotSha256: hash },
};

test("rejection and revision requests preserve version and reason while withdrawing current approval", () => {
  const document = emptyStudioDocument();
  document.reviews[hash] = { version: "test-v1", sha256: hash, artworkApprovedAt: "2026-09-15T11:00:00Z", captionApprovedAt: "2026-09-15T11:00:00Z" };
  for (const action of ["reject-artwork", "request-revision"]) {
    const request = parseStudioAction({ ...base, action, mediaIdentity: hash, reason: "O nome e o escudo precisam de revisão." });
    const result = applyStudioAction(document, request, { identity: hash, manifest: media }, now);
    assert.equal(result.reviews[hash]?.reason, "O nome e o escudo precisam de revisão.");
    assert.equal(result.reviews[hash]?.version, "test-v1");
    assert.equal(result.reviews[hash]?.decision, action === "reject-artwork" ? "REJECTED" : "CHANGES_REQUESTED");
    assert.equal(result.reviews[hash]?.artworkApprovedAt, undefined);
    assert.equal(result.reviews[hash]?.captionApprovedAt, undefined);
    assert.notEqual(studioStatus(hash, result), "APROVADO");
    assert.equal(result.permission, "PAUSED");
    assert.equal(result.outbound, "DISABLED");
    assert.equal(studioStatus(hash, document), "APROVADO", "previous revision remains unchanged in the immutable history snapshot");
  }
});

test("decisions require a reason and the exact immutable version; stale candidates can be rejected but never approved", () => {
  const action = { ...base, action: "request-revision", mediaIdentity: hash, reason: "Corrigir o resultado desta partida." };
  for (const reason of [undefined, "curto", " ".repeat(50), "a".repeat(1001)]) assert.throws(() => parseStudioAction({ ...action, reason }), /REVIEW_REASON_REQUIRED/);
  const expired = { ...media, provenance: { ...media.provenance, validUntil: "2026-09-15T11:00:00Z" } };
  const requested = applyStudioAction(emptyStudioDocument(), parseStudioAction(action), { identity: hash, manifest: expired }, now);
  assert.equal(requested.reviews[hash]?.decision, "CHANGES_REQUESTED");
  assert.throws(() => applyStudioAction(requested, parseStudioAction({ ...base, action: "approve-artwork", mediaIdentity: hash, reviewSessionId }), { identity: hash, manifest: expired }, now), /FACTUAL_SNAPSHOT_EXPIRED_OR_INVALID/);
  assert.throws(() => applyStudioAction(requested, parseStudioAction(action), { identity: `sha256:${"b".repeat(64)}`, manifest: media }, now), /CURRENT_VIDEO_REQUIRED/);
  assert.equal(studioStatus(`sha256:${"b".repeat(64)}`, requested), "EM_REVISAO", "a new version cannot inherit the prior decision");
  const approved = applyStudioAction(emptyStudioDocument(), parseStudioAction({ ...base, action: "approve-artwork", mediaIdentity: hash, reviewSessionId, reason: "Composição e nomes conferidos nesta versão." }), { identity: hash, manifest: media }, now);
  assert.equal(approved.reviews[hash]?.reason, "Composição e nomes conferidos nesta versão.");
});

test("captions are platform-specific and content-addressed; malformed captions cannot be approved", () => {
  const variant = { ...media, captions: { INSTAGRAM: "Legenda Instagram de teste.", FACEBOOK: "Legenda Facebook de teste." } };
  assert.equal(studioCaption(variant, "INSTAGRAM"), variant.captions.INSTAGRAM);
  assert.equal(studioCaption(variant, "FACEBOOK"), variant.captions.FACEBOOK);
  assert.equal(studioCaption(variant, "CLUB"), media.caption);
  assert.notEqual(studioMediaIdentity(variant), studioMediaIdentity(media));
  assert.notEqual(studioMediaIdentity(variant), studioMediaIdentity({ ...variant, captions: { ...variant.captions, FACEBOOK: "Outra versão de teste." } }));
  for (const captions of [{ INSTAGRAM: " " }, { FACEBOOK: "x".repeat(2201) }, { OTHER: "no" }, { INSTAGRAM: 3 }]) assert.throws(() => validateStudioMedia({ ...media, captions } as StudioMedia), /INVALID_VIDEO_MANIFEST/);
});

test("Olhos binds independent composition and loop evidence to exact artifact and placement", () => {
  const evidence = { artifactSha256: hash, placement: "FEED", composition: "PASS", loop: "PASS", reviewer: "Test-only reviewer", reviewedAt: "2026-09-15T11:00:00Z", reason: "Contract fixture, not a real approval." };
  assert.equal(studioEyesApproved(studioEyesSeal(evidence, media, now)), true);
  for (const invalid of [undefined, null, { ...evidence, placement: "STORY" }, { ...evidence, artifactSha256: "changed" }, { ...evidence, loop: "PENDING" }, { ...evidence, composition: "FAIL" }, { ...evidence, reviewer: "" }, { ...evidence, reviewedAt: "2026-09-16T12:00:00Z" }]) assert.equal(studioEyesApproved(studioEyesSeal(invalid, media, now)), false);
  assert.equal(studioEyesApproved(studioEyesSeal(evidence, { ...media, placement: "STORY" }, now)), false, "Feed seal cannot approve a missing Story");
  for (const invalidSession of [undefined, "", "forged", "b2c1fa0d-ab0c-1fb1-887a-a5ec75165430"]) assert.throws(() => parseStudioAction({ ...base, action: "approve-artwork", mediaIdentity: hash, reviewSessionId: invalidSession }), /VIDEO_REVIEW_REQUIRED/);
});

test("automation is a paused plan with bounded retries and a type-compatible trigger", () => {
  assert.equal(defaultStudioAutomation().mode, "PAUSED");
  const schedule = { localDateTime: "2026-09-16T12:00", timeZone: "Europe/Malta", occurrence: "earlier" };
  const action = parseStudioAction({ ...base, action: "save-plan", selected: true, schedule, automation: { mode: "SCHEDULED", maxAttempts: 3, retryDelayMinutes: 15 } });
  const result = applyStudioAction(emptyStudioDocument(), action, null, now);
  assert.equal(result.automation?.mode, "SCHEDULED");
  assert.equal(result.permission, "PAUSED"); assert.equal(result.outbound, "DISABLED");
  for (const automation of [{ mode: "ACTIVE", maxAttempts: 3, retryDelayMinutes: 15 }, { mode: "PAUSED", maxAttempts: 0, retryDelayMinutes: 15 }, { mode: "PAUSED", maxAttempts: 11, retryDelayMinutes: 15 }, { mode: "PAUSED", maxAttempts: 3, retryDelayMinutes: 1441 }]) assert.throws(() => parseStudioAction({ ...action, automation }), /INVALID_AUTOMATION/);
  assert.throws(() => applyStudioAction(emptyStudioDocument(), parseStudioAction({ ...action, schedule: null }), null, now), /AUTOMATION_TRIGGER_MISMATCH/);
  assert.throws(() => applyStudioAction(emptyStudioDocument(), parseStudioAction({ ...action, automation: { mode: "OFFICIAL_EVENT", maxAttempts: 3, retryDelayMinutes: 15 } }), null, now), /AUTOMATION_TRIGGER_MISMATCH/);
  const goal = applyStudioAction(emptyStudioDocument(), parseStudioAction({ ...action, artId: "GOAL_CONFIRMED", schedule: null, automation: { mode: "OFFICIAL_EVENT", maxAttempts: 3, retryDelayMinutes: 15 } }), null, now);
  assert.equal(goal.automation?.mode, "OFFICIAL_EVENT"); assert.equal(goal.outbound, "DISABLED");
});

test("retry targets a single failed delivery; confirmed, uncertain, expired or unapproved versions stay blocked", () => {
  const delivery: StudioDeliveryAttempt = { id: "d2c1fa0d-ab0c-4fb1-887a-a5ec75165430", record_key: "MATCH_PREVIEW:INSTAGRAM:STORY", instance_id: "test-instance", platform: "INSTAGRAM", placement: "STORY", account_id: "test-account", media_identity: hash, revision: 4, state: "FAILED", receipt_id: null, error: "Test-only failure", retryable: true, source_current: true, source_valid_until: "2026-09-16T00:00:00Z", attempt_count: 1, last_attempt_at: "2026-09-15T11:00:00Z", retry_requested_at: null };
  const action = parseStudioAction({ ...base, placement: "STORY", action: "request-retry", deliveryId: delivery.id, expectedDeliveryRevision: 4, reason: "Falha transitória reconciliada neste destino." }) as Extract<StudioAction, { action: "request-retry" }>;
  const document = emptyStudioDocument();
  document.reviews[hash] = { version: "test-v1", sha256: hash, artworkApprovedAt: "2026-09-15T10:00:00Z", captionApprovedAt: "2026-09-15T10:00:00Z" };
  const result = applyStudioAction(document, action, null, now, delivery);
  assert.deepEqual(Object.keys(result.retryRequests!), [delivery.id]);
  assert.equal(delivery.state, "FAILED"); assert.equal(delivery.error, "Test-only failure");
  assert.equal(result.outbound, "DISABLED"); assert.equal(result.permission, "PAUSED");
  for (const changed of [{ state: "CONFIRMED", receipt_id: "confirmed" }, { state: "UNKNOWN" }, { receipt_id: "uncertain-receipt" }, { retryable: false }, { retry_requested_at: "2026-09-15T11:00:00Z" }]) assert.throws(() => validateStudioRetry({ ...delivery, ...changed } as StudioDeliveryAttempt, action, document, now), /DELIVERY_NOT_RETRYABLE/);
  for (const changed of [{ source_current: false }, { source_valid_until: "2026-09-15T10:00:00Z" }]) assert.throws(() => validateStudioRetry({ ...delivery, ...changed }, action, document, now), /DELIVERY_SOURCE_NOT_CURRENT/);
  for (const changed of [{ record_key: "MATCH_PREVIEW:INSTAGRAM:FEED", placement: "FEED" }, { platform: "FACEBOOK" }, { account_id: " " }, { id: "other" }]) assert.throws(() => validateStudioRetry({ ...delivery, ...changed } as StudioDeliveryAttempt, action, document, now), /INVALID_DELIVERY_TARGET/);
  assert.throws(() => validateStudioRetry({ ...delivery, revision: 5 }, action, document, now), /REVISION_CONFLICT/);
  assert.throws(() => validateStudioRetry(delivery, action, emptyStudioDocument(), now), /CURRENT_APPROVAL_REQUIRED/);
});

test("weekly leaders and XI are distinct from cumulative crown and XI", () => {
  const byId = (id: string) => STUDIO_CATALOG.find((art) => art.id === id)!;
  assert.match(byId("GAMEWEEK_TOP_CARD").metric, /somente da rodada/);
  assert.match(byId("OVERALL_LEADER").metric, /acumulado/);
  assert.match(byId("GAMEWEEK_XI_COACH").metric, /da rodada/);
  assert.match(byId("SEASON_XI_COACH").metric, /Acumulado/);
  assert.equal(byId("GAMEWEEK_XI_COACH").internal, "PENDING");
});
