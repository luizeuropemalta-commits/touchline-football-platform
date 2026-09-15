import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStudioOfficialDeclaration, verifyStudioPublishedSource, type StudioPublishedSourceProof } from "../lib/touchlineArena/social-studio-source-gate.ts";
import { emptyStudioDocument, type StudioAction, type StudioMedia } from "../lib/touchlineArena/social-studio-contract.ts";
import { orchestrateStudioSave, prepareStudioSourceCheckedAction, type StudioSaveReceipt } from "../lib/touchlineArena/social-studio-save.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = `sha256:${"a".repeat(64)}`;
const now = Date.parse("2026-09-15T00:00:00Z");
const media: StudioMedia = {
  artId: "GOAL_CONFIRMED", placement: "FEED", version: "test-only", filePath: "artifacts/social-studio/test/video.mp4", sha256: sha,
  objectKey: `v1/GOAL_CONFIRMED/FEED/${"a".repeat(64)}.mp4`, byteSize: 1024, etag: '"test-etag"',
  width: 1080, height: 1350, durationSeconds: 6, caption: "Test only, not registered or publishable.",
  verification: { reportPath: "artifacts/social-studio/test/probe.json", reportSha256: sha },
  provenance: { source: "PERSISTED_SPORTMONKS_FINAL_MATCH_REVIEW", competitionId: id(1), seasonId: id(2), fixtureIds: [id(3)], teamIds: [id(4), id(5)], playerIds: [id(6)], fetchedAt: "2026-09-14T23:00:00Z", asOf: "2026-09-14T22:00:00Z", validUntil: "2026-09-15T23:00:00Z", snapshotPath: "artifacts/social-studio/test/snapshot.json", snapshotSha256: sha },
};
const snapshot = { ...media.provenance, factualData: { event: { id: "123", source: "sportmonks" } } };
const proof = (): StudioPublishedSourceProof => ({
  binding: { source: media.provenance.source, snapshotSha256: sha, competitionId: id(1), seasonId: id(2), fixtureIds: [id(3)], teamIds: [id(4), id(5)], playerIds: [id(6)] },
  checkedAt: new Date(now).toISOString(), validUntil: media.provenance.validUntil, sourceRevisionChecksum: sha,
  providerIds: Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [id(n), String(n)])),
  publishedPlayerIds: [id(6)], activePlayerClubs: { [id(6)]: id(4) },
});

test("declarations reject local, synthetic, unknown provenance and absent/noncanonical IDs before source reads", async () => {
  for (const source of ["LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED", "local_any_not_published", "SYNTHETIC_RGB_FIXTURE", "UNKNOWN", "sportmonks", "PERSISTED_SPORTMONKS_FINAL_MATCH_REVIEW "]) {
    const candidate = structuredClone(media); candidate.provenance.source = source;
    assert.throws(() => validateStudioOfficialDeclaration(candidate), /OFFICIAL_SOURCE_NOT_ALLOWED/);
    await assert.rejects(verifyStudioPublishedSource(candidate, snapshot, async () => { assert.fail("Bad declarations never reach canonical reads"); }, now), /OFFICIAL_SOURCE_NOT_ALLOWED/);
  }
  for (const changed of [{ fixtureIds: [] }, { teamIds: ["71"] }, { playerIds: ["Bogle"] }, { competitionId: "8" }, { seasonId: "28083" }, { playerIds: [id(6), id(6)] }]) {
    const candidate = structuredClone(media); Object.assign(candidate.provenance, changed);
    assert.throws(() => validateStudioOfficialDeclaration(candidate), /OFFICIAL_SOURCE_IDS_INVALID/);
  }
  const ranking = { ...media, artId: "OVERALL_LEADER" };
  assert.throws(() => validateStudioOfficialDeclaration(ranking), /OFFICIAL_SOURCE_NOT_ALLOWED/);
});

test("canonical source adapter is fail-closed, binds the snapshot and checks official IDs/publication afresh", async () => {
  await assert.rejects(verifyStudioPublishedSource(media, snapshot, null, now), /OFFICIAL_SOURCE_INTEGRATION_REQUIRED/);
  await assert.rejects(verifyStudioPublishedSource(media, snapshot, async () => null, now), /OFFICIAL_SOURCE_UNVERIFIED/);
  await assert.rejects(verifyStudioPublishedSource(media, snapshot, async () => { throw new Error("connection detail must not leak"); }, now), /OFFICIAL_SOURCE_UNVERIFIED/);
  let reads = 0;
  const reader = async () => { reads++; return proof(); };
  await verifyStudioPublishedSource(media, snapshot, reader, now);
  await verifyStudioPublishedSource(media, snapshot, reader, now);
  assert.equal(reads, 2, "No cached boolean publication authority");
  for (const mutate of [
    (p: StudioPublishedSourceProof) => { p.providerIds[id(6)] = "not-official"; },
    (p: StudioPublishedSourceProof) => { delete p.providerIds[id(3)]; },
    (p: StudioPublishedSourceProof) => { p.publishedPlayerIds = []; },
    (p: StudioPublishedSourceProof) => { p.activePlayerClubs[id(6)] = id(20); },
    (p: StudioPublishedSourceProof) => { p.binding.snapshotSha256 = `sha256:${"b".repeat(64)}`; },
    (p: StudioPublishedSourceProof) => { p.binding.seasonId = id(20); },
    (p: StudioPublishedSourceProof) => { p.sourceRevisionChecksum = "unknown"; },
    (p: StudioPublishedSourceProof) => { p.checkedAt = "2026-09-14T00:00:00Z"; },
    (p: StudioPublishedSourceProof) => { p.checkedAt = "2026-09-16T00:00:00Z"; },
    (p: StudioPublishedSourceProof) => { p.validUntil = new Date(now).toISOString(); },
  ]) { const invalid = proof(); mutate(invalid); await assert.rejects(verifyStudioPublishedSource(media, snapshot, async () => invalid, now), /OFFICIAL_SOURCE_UNVERIFIED/); }
  for (const changed of [{ source: "SYNTHETIC_EVENT" }, { fixtureIds: [id(30)] }, { factualData: { lineage: { source: "LOCAL_CANONICAL_REPLAY_NOT_PUBLISHED" } } }]) {
    await assert.rejects(verifyStudioPublishedSource(media, { ...snapshot, ...changed }, reader, now), /OFFICIAL_SOURCE_NOT_ALLOWED|OFFICIAL_SOURCE_SNAPSHOT_MISMATCH/);
  }
  await assert.rejects(verifyStudioPublishedSource(media, snapshot, reader, now + 86400000), /FACTUAL_SNAPSHOT_EXPIRED_OR_INVALID/);
  await assert.rejects(verifyStudioPublishedSource(media, snapshot, reader, now, () => now + 70_000), /OFFICIAL_SOURCE_UNVERIFIED/);
});

test("approval and retry use the actual source-checked preparation only after authenticated receipt recovery", async () => {
  const actor = id(10);
  for (const kind of ["approve-artwork", "approve-caption", "request-retry"] as const) {
    const action: StudioAction = { requestId: id(11), artId: media.artId, platform: "INSTAGRAM", placement: "FEED", expectedRevision: 0,
      ...(kind === "request-retry" ? { action: kind, deliveryId: id(12), expectedDeliveryRevision: 0, reason: "Retry exact failed destination" } : { action: kind, mediaIdentity: sha, reviewSessionId: id(14) }) };
    const document = emptyStudioDocument();
    document.reviews[sha] = { version: media.version, sha256: sha, artworkApprovedAt: new Date(now).toISOString(), captionApprovedAt: new Date(now).toISOString() };
    const delivery = { id: id(12), record_key: "GOAL_CONFIRMED:INSTAGRAM:FEED", instance_id: id(13), platform: "INSTAGRAM" as const, placement: "FEED" as const, account_id: "test-account", media_identity: sha, revision: 0, state: "FAILED" as const, receipt_id: null, error: "Preserved failure", retryable: true, source_current: true, source_valid_until: media.provenance.validUntil, attempt_count: 1, last_attempt_at: null, retry_requested_at: null };
    let checks = 0; let receipt: StudioSaveReceipt | null = null;
    const verified = { identity: sha, manifest: media, snapshot, eyes: { composition: "PASS" as const, loop: "PASS" as const, reviewer: "test-only", reviewedAt: new Date(now).toISOString(), reason: "Test evidence only" } };
    const prepare = (verifySource = async () => { checks++; await verifyStudioPublishedSource(media, snapshot, async () => proof(), now); }) => prepareStudioSourceCheckedAction(document, action, { identity: sha, manifest: media }, delivery, now, { verifyArtifact: async () => verified, verifySource });
    await assert.rejects(prepare(async () => { throw new Error("OFFICIAL_SOURCE_UNVERIFIED"); }), /OFFICIAL_SOURCE_UNVERIFIED/);
    if (kind === "request-retry") await assert.rejects(prepareStudioSourceCheckedAction(document, action, { identity: `sha256:${"b".repeat(64)}`, manifest: media }, delivery, now, { verifyArtifact: async () => verified, verifySource: async () => assert.fail("Wrong version must not reach canonical check") }), /CURRENT_VIDEO_REQUIRED/);
    const deps = { findReceipt: async () => receipt, prepareDocument: () => prepare(), commit: async (saved: typeof document, attempt: { recordKey: string; requestChecksum: string }) => {
      receipt = { request_id: action.requestId, record_key: attempt.recordKey, actor_id: actor, request_checksum: attempt.requestChecksum, action: action.action, revision: 1, document: saved, created_at: new Date(now).toISOString() };
      throw new Error("Lost response after commit");
    } };
    await assert.rejects(orchestrateStudioSave(action, actor, deps), /Lost response/);
    const recovered = await orchestrateStudioSave(action, actor, { ...deps, prepareDocument: async () => { assert.fail("Receipt recovery must not revalidate a now-stale source"); } });
    assert.equal(recovered.document.permission, "PAUSED"); assert.equal(recovered.document.outbound, "DISABLED"); assert.equal(checks, 1);
    await assert.rejects(orchestrateStudioSave(action, id(20), deps), /IDEMPOTENCY_CONFLICT/);
  }
});

test("official source gate protects approval while the preview uses exact private Storage identity", () => {
  const server = readFileSync("lib/touchlineArena/social-studio-server.ts", "utf8");
  const gateServer = readFileSync("lib/touchlineArena/social-studio-source-gate-server.ts", "utf8");
  const publishedReader = readFileSync("lib/touchlineArena/social-studio-published-source-reader-server.ts", "utf8");
  const video = readFileSync("app/api/admin/social-publications/studio/video/route.ts", "utf8");
  assert.match(server, /verifyStudioOfficialSource/);
  assert.match(server, /prepareStudioSourceCheckedAction/);
  assert.match(video, /createSignedPreview\(media, 300\)/);
  assert.doesNotMatch(video, /await inspectStudioArtifact\(|new Uint8Array|Content-Range/);
  assert.match(gateServer, /^import "server-only";/);
  assert.match(gateServer, /media\.artId === "FULL_TIME" \? readStudioPublishedFullTimeSource : null/);
  assert.match(publishedReader, /^import "server-only";/);
  assert.match(publishedReader, /readTouchlineSocialFinalScoreDraft/);
  assert.match(publishedReader, /readTouchlineSocialSourceRevisionCheckpoint/);
  assert.match(publishedReader, /\.eq\("publication_status", "published"\)/);
  assert.doesNotMatch(publishedReader, /insert\(|update\(|upsert\(|delete\(/);
});
