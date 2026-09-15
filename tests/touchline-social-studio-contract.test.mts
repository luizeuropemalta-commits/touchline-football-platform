import assert from "node:assert/strict";
import test from "node:test";
import { STUDIO_CATALOG, STUDIO_SURFACES, studioRecordKey } from "../lib/touchlineArena/social-studio-catalog.ts";
import { applyStudioAction, emptyStudioDocument, parseStudioAction, resolveStudioSchedule, studioDeliveryDisposition, studioDeliveryKey, studioProvenanceCurrent, studioSameOrigin, studioStatus, validateStudioMedia, validateStudioProvenance, type StudioAction, type StudioMedia } from "../lib/touchlineArena/social-studio-contract.ts";
import { studioUserCanReview, studioRequestHandler } from "../lib/touchlineArena/social-studio-request.ts";

const now = Date.parse("2026-09-14T12:00:00Z");
const checksum = `sha256:${"a".repeat(64)}`;
const identity = `sha256:${"b".repeat(64)}`;
const reviewSessionId = "b2c1fa0d-ab0c-4fb1-887a-a5ec75165430";
const media: StudioMedia = {
  artId: "MATCH_PREVIEW", version: "v1", placement: "FEED", filePath: "artifacts/social-studio/test.mp4", sha256: checksum,
  objectKey: `v1/MATCH_PREVIEW/FEED/${"a".repeat(64)}.mp4`, byteSize: 1024, etag: '"test-etag"',
  width: 1080, height: 1350, durationSeconds: 6, caption: "Texto de teste de contrato, não conteúdo publicável.",
  verification: { reportPath: "artifacts/social-studio/test-report.json", reportSha256: checksum },
  provenance: { source: "test-fixture-only", fetchedAt: "2026-09-14T11:00:00Z", asOf: "2026-09-14T10:00:00Z", validUntil: "2026-09-15T00:00:00Z", competitionId: "test-league", seasonId: "test-season", fixtureIds: ["test-fixture"], teamIds: ["test-home", "test-away"], playerIds: ["test-player"], snapshotPath: "artifacts/social-studio/test-data.json", snapshotSha256: checksum },
};
const base = { requestId: "a2c1fa0d-ab0c-4fb1-887a-a5ec75165430", artId: "MATCH_PREVIEW", platform: "INSTAGRAM", placement: "FEED", expectedRevision: 0 } as const;
const plan: StudioAction = { ...base, action: "save-plan", selected: true, schedule: { localDateTime: "2026-09-16T12:00", timeZone: "Europe/Malta", occurrence: "earlier" } };
const approval: StudioAction = { ...base, action: "approve-artwork", mediaIdentity: identity, reviewSessionId };

test("advancing server time expires a previously valid sample at the boundary and invalid dates fail closed", () => {
  const expiry = Date.parse(media.provenance.validUntil);
  assert.equal(studioProvenanceCurrent(media.provenance, expiry - 1), true);
  assert.equal(studioProvenanceCurrent(media.provenance, expiry), false);
  assert.equal(studioProvenanceCurrent(media.provenance, expiry + 1), false);
  assert.equal(studioProvenanceCurrent(media.provenance, Number.NaN), false);
  for (const changed of [{ asOf: "invalid" }, { fetchedAt: "invalid" }, { validUntil: "invalid" }, { fetchedAt: "2026-09-14T13:00:00Z" }]) {
    assert.equal(studioProvenanceCurrent({ ...media.provenance, ...changed }, now), false);
  }
  const artwork = applyStudioAction(emptyStudioDocument(), approval, { identity, manifest: media }, now);
  const approved = applyStudioAction(artwork, { ...approval, action: "approve-caption" }, { identity, manifest: media }, now);
  const state = (time: number) => studioStatus(identity, approved, studioProvenanceCurrent(media.provenance, time) ? null : "EXPIRED");
  assert.equal(state(expiry - 1), "APROVADO");
  assert.equal(state(expiry), "BLOQUEADO");
  assert.ok(approved.reviews[identity]?.artworkApprovedAt, "Historical approval remains intact");
});

test("catalogue covers five blocks, 19 distinct types and all five independent surfaces", () => {
  assert.equal(STUDIO_CATALOG.length, 19);
  assert.equal(new Set(STUDIO_CATALOG.map((art) => art.id)).size, 19);
  assert.deepEqual([...new Set(STUDIO_CATALOG.map((art) => art.block))], [1, 2, 3, 4, 5]);
  assert.equal(STUDIO_CATALOG.some((art) => art.id === "PLAYER_DUEL"), false);
  assert.equal(STUDIO_SURFACES.length, 5);
  assert.equal(STUDIO_CATALOG.find((art) => art.id === "MATCH_PREVIEW")?.internal, "BOTH_CLUBS");
  assert.deepEqual(STUDIO_CATALOG.filter((art) => art.trigger === "OFFICIAL_EVENT").map((art) => art.id), ["GOAL_CONFIRMED", "OWN_GOAL", "HAT_TRICK_HERO", "RED_CARD_CONFIRMED", "FULL_TIME"]);
});

test("approving a version is independent from caption, new version, plan and publication permission", () => {
  const initial = emptyStudioDocument();
  assert.equal(studioStatus(null, initial), "EM_PRODUCAO");
  assert.equal(studioStatus(identity, initial), "EM_REVISAO");
  const art = applyStudioAction(initial, approval, { identity, manifest: media }, now);
  assert.equal(art.reviews[identity]?.artworkApprovedAt, "2026-09-14T12:00:00.000Z");
  assert.equal(studioStatus(identity, art), "EM_REVISAO");
  const both = applyStudioAction(art, { ...approval, action: "approve-caption" }, { identity, manifest: media }, now);
  assert.equal(studioStatus(identity, both), "APROVADO");
  assert.equal(studioStatus(checksum, both), "EM_REVISAO");
  assert.equal(studioStatus(identity, both, "bad bytes"), "BLOQUEADO");
  assert.equal(both.permission, "PAUSED");
  assert.equal(both.outbound, "DISABLED");
  assert.equal(both.selected, false);
  assert.deepEqual(initial.reviews, {});
  assert.throws(() => applyStudioAction(initial, approval, null, now), /CURRENT_VIDEO_REQUIRED/);
  assert.throws(() => applyStudioAction(initial, { ...approval, mediaIdentity: checksum }, { identity, manifest: media }, now), /CURRENT_VIDEO_REQUIRED/);
});

test("plan persists explicit UTC and preserves approval without activating dispatch", () => {
  const approved = applyStudioAction(emptyStudioDocument(), approval, { identity, manifest: media }, now);
  const result = applyStudioAction(approved, plan, null, now);
  assert.equal(result.schedule?.utc, "2026-09-16T10:00:00.000Z");
  assert.equal(result.selected, true);
  assert.equal(result.permission, "PAUSED");
  assert.equal(result.outbound, "DISABLED");
  assert.deepEqual(result.reviews, approved.reviews);
  assert.equal(applyStudioAction(result, { ...plan, schedule: null }, null, now).schedule, null);
});

test("event triggers reject estimated schedules and unresolved internal fanout stays blocked", () => {
  assert.throws(() => applyStudioAction(emptyStudioDocument(), { ...plan, artId: "GOAL_CONFIRMED" }, null, now), /OFFICIAL_EVENT_HAS_NO_CLOCK_SCHEDULE/);
  assert.throws(() => applyStudioAction(emptyStudioDocument(), { ...plan, artId: "LEAGUE_TABLE_FINAL", platform: "CLUB", placement: "CLUB_FEED" }, null, now), /SURFACE_NOT_ALLOWED/);
  assert.throws(() => studioRecordKey("MATCH_PREVIEW", "CLUB", "STORY"), /INVALID_SURFACE/);
});

test("scheduling handles Malta DST gaps and repeated hours, fractional offset zones, invalid dates and past time", () => {
  const earlyYear = Date.parse("2026-01-01T00:00:00Z");
  const schedule = (localDateTime: string, timeZone = "Europe/Malta", occurrence: "earlier" | "later" = "earlier") => resolveStudioSchedule({ localDateTime, timeZone, occurrence }, earlyYear);
  assert.throws(() => schedule("2026-03-29T02:30"), /NONEXISTENT_LOCAL_TIME/);
  assert.equal(schedule("2026-10-25T02:30").utc, "2026-10-25T00:30:00.000Z");
  assert.equal(schedule("2026-10-25T02:30", "Europe/Malta", "later").utc, "2026-10-25T01:30:00.000Z");
  assert.equal(schedule("2026-09-16T12:00", "Asia/Kathmandu").utc, "2026-09-16T06:15:00.000Z");
  assert.equal(schedule("2026-09-16T12:00", "America/Sao_Paulo").utc, "2026-09-16T15:00:00.000Z");
  assert.throws(() => schedule("2026-02-30T12:00"), /INVALID_SCHEDULE/);
  assert.throws(() => schedule("2026-09-16T12:00", "Invalid/Zone"), /INVALID_TIME_ZONE/);
  assert.throws(() => schedule("2025-12-31T23:59", "UTC"), /SCHEDULE_IN_PAST/);
  assert.throws(() => schedule("2026-01-01T00:00", "UTC"), /SCHEDULE_IN_PAST/);
});

test("private media contract rejects static files, wrong crops, unknown types and missing provenance", () => {
  assert.equal(validateStudioMedia(media), media);
  for (const changed of [{ filePath: "public/social-studio/test.mp4" }, { filePath: "artifacts/social-studio/../secrets.mp4" }, { filePath: "artifacts/social-studio/test.png" }, { objectKey: `v1/MATCH_PREVIEW/FEED/${"b".repeat(64)}.mp4` }, { objectKey: "../secret.mp4" }, { byteSize: 0 }, { etag: "" }, { width: 900 }, { placement: "STORY" }, { caption: "" }, { durationSeconds: 0 }, { artId: "PLAYER_DUEL" }]) {
    assert.throws(() => validateStudioMedia({ ...media, ...changed } as StudioMedia), /INVALID_VIDEO_MANIFEST/);
  }
  assert.throws(() => validateStudioProvenance(media, Date.parse("2026-09-16T00:00:00Z")), /FACTUAL_SNAPSHOT_EXPIRED/);
  assert.throws(() => applyStudioAction(emptyStudioDocument(), approval, { identity, manifest: media }, Date.parse("2026-09-16T00:00:00Z")), /FACTUAL_SNAPSHOT_EXPIRED/);
});

test("delivery identity separates platform, account and placement; unknown responses reconcile before retry", () => {
  const target = { platform: "INSTAGRAM", accountId: "account-1", placement: "FEED" } as const;
  const key = studioDeliveryKey("fixture-1-goal-2", target);
  assert.notEqual(key, studioDeliveryKey("fixture-1-goal-2", { ...target, placement: "STORY" }));
  assert.notEqual(key, studioDeliveryKey("fixture-1-goal-2", { ...target, accountId: "account-2" }));
  assert.notEqual(key, studioDeliveryKey("fixture-1-goal-2", { ...target, platform: "FACEBOOK" }));
  assert.equal(studioDeliveryDisposition({ ...target, state: "CONFIRMED", error: null }), "DO_NOT_REPEAT");
  assert.equal(studioDeliveryDisposition({ ...target, state: "UNKNOWN", error: "timeout" }), "RECONCILE_FIRST");
  assert.equal(studioDeliveryDisposition({ ...target, state: "FAILED", error: "Story failed" }), "REVIEW_ERROR_BEFORE_RETRY");
  assert.throws(() => studioDeliveryKey("event", { ...target, accountId: "" }), /INVALID_DELIVERY_TARGET/);
});

test("owner authorization requires verified owner email AND server app metadata", () => {
  const owner = (email?: string | null) => email === "owner@example.test";
  assert.equal(studioUserCanReview(null, owner), false);
  assert.equal(studioUserCanReview({ id: "owner", email: "owner@example.test" }, owner), false);
  assert.equal(studioUserCanReview({ id: "customer", email: "customer@example.test", app_metadata: { touchline_arena_access_v1: true } }, owner), false);
  assert.equal(studioUserCanReview({ id: "owner", email: "owner@example.test", app_metadata: { touchline_arena_access_v1: true } }, owner), true);
});

test("request parser rejects forged approvals, malformed inputs and fabricated publication actions", () => {
  assert.deepEqual(parseStudioAction(plan), plan);
  for (const value of [null, [], {}, { ...approval, reviewSessionId: "forged" }, { ...approval, mediaIdentity: "test" }, { ...plan, action: "publish" }, { ...plan, expectedRevision: -1 }, { ...plan, platform: "CLUBOWNER" }, { ...plan, schedule: {} }]) assert.throws(() => parseStudioAction(value));
});

test("POST enforces origin and owner before mutation and reports persistence failure, concurrency and validation errors", async () => {
  let saves = 0;
  const build = (authorized = true, error?: string) => studioRequestHandler({ authorize: async () => authorized ? "verified-owner-id" : null, save: async (action, actorId) => {
    saves++;
    assert.equal(actorId, "verified-owner-id");
    if (error) throw new Error(error);
    return { record_key: "MATCH_PREVIEW:INSTAGRAM:FEED", revision: 1, document: applyStudioAction(emptyStudioDocument(), action, null, now), updated_at: "2026-09-14T12:00:00Z" };
  } });
  const request = (body: unknown = plan, origin: string | null = "https://qa.example.test") => new Request("https://qa.example.test/api/admin/social-publications/studio", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await build()(request(plan, "https://evil.example.test"))).status, 403);
  assert.equal((await build()(request(plan, null))).status, 403);
  assert.equal((await build(false)(request())).status, 403);
  assert.equal((await build()(request({ ...plan, action: "publish" }))).status, 400);
  assert.equal(saves, 0);
  assert.equal((await build(true, "PERSISTENCE_UNAVAILABLE")(request())).status, 503);
  assert.equal((await build(true, "REVISION_CONFLICT")(request())).status, 409);
  const success = await build()(request());
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "private, no-store");
  assert.equal((await success.json()).record.document.permission, "PAUSED");
  assert.equal(studioSameOrigin(request()), true);
});
