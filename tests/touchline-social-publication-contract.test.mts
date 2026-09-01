import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import sharp from "sharp";

import {
  approveTouchlineSocialArtwork,
  approveTouchlineSocialCaption,
  checksumTouchlineSocialArtifact,
  createTouchlineSocialPublicationDraft,
  planTouchlineInstagramDispatch,
  TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
  TOUCHLINE_SOCIAL_DESTINATION,
  touchlineSocialArtifactObjectKey,
  touchlineSocialDispatchIdempotencyKey,
  verifyTouchlineSocialStoredArtifact,
  type TouchlineSocialArtifactLocator,
  type TouchlineSocialArtifactReader,
  type TouchlineSocialPublicationDraft,
  type TouchlineSocialStoredArtifact,
} from "../lib/touchlineArena/social-publication-contract.ts";

const SOURCE_CHECKSUM = `sha256:${"a".repeat(64)}`;
const SOURCE_REVISION_MANIFEST = Object.freeze({ "fixture-provider:19722189": 1 });
const SOURCE_REVISION_CHECKSUM = `sha256:${"b".repeat(64)}`;
const INPUT_CHECKSUM = SOURCE_CHECKSUM;
const FEED_PNG_BYTES = new Uint8Array(await sharp({
  create: { width: 1080, height: 1350, channels: 4, background: "#071711" },
}).png().toBuffer());
const STORY_JPEG_BYTES = new Uint8Array(await sharp({
  create: { width: 1080, height: 1920, channels: 3, background: "#071711" },
}).jpeg({ quality: 90 }).toBuffer());

type DraftOverrides = Record<string, unknown>;

async function createDraft(overrides: DraftOverrides = {}) {
  const fixtureId = String(overrides.fixtureId ?? "19722189");
  const teamId = overrides.teamId === null ? null : String(overrides.teamId ?? "9");
  const eventId = overrides.eventId === null || overrides.eventId === undefined
    ? null : String(overrides.eventId);
  const contentType = (overrides.contentType ?? "LINEUP") as "LINEUP" | "MATCH_PREVIEW" | "FULL_TIME" | "FINAL_SCORE" | "GOAL_CONFIRMED" | "RED_CARD_CONFIRMED";
  const placement = (overrides.placement ?? "INSTAGRAM_FEED") as "INSTAGRAM_FEED" | "INSTAGRAM_STORY";
  const locale = (overrides.locale ?? "en-GB") as "en-GB" | "pt-BR";
  const revision = Number(overrides.revision ?? 1);
  const templateVersion = String(overrides.templateVersion ?? "touchline-lineup-feed-v1");
  const sourceVersion = String(overrides.sourceVersion ?? "fixture-feed-v1");
  const artifactMimeType = (overrides.artifactMimeType ?? "image/png") as "image/png" | "image/jpeg";
  const artifactBytes = (overrides.artifactBytes ?? FEED_PNG_BYTES) as Uint8Array;
  const artifactChecksum = checksumTouchlineSocialArtifact(artifactBytes);
  const defaultLocator: TouchlineSocialArtifactLocator = Object.freeze({
    storageProvider: "SUPABASE_STORAGE",
    bucket: TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
    objectKey: touchlineSocialArtifactObjectKey({
      fixtureId,
      teamId,
      eventId,
      contentType,
      placement,
      locale,
      revision,
      templateVersion,
      sourceVersion,
      artifactChecksum,
      artifactMimeType,
    }),
    etag: '"etag-0001"',
  });
  return createTouchlineSocialPublicationDraft({
    fixtureId,
    teamId,
    eventId,
    contentType,
    placement,
    locale,
    revision,
    renderPath: contentType === "LINEUP"
      ? `/visual-qa/social-lineup?fixtureId=${fixtureId}&teamId=${teamId}&locale=${locale}&revision=${revision}`
      : contentType === "MATCH_PREVIEW"
        ? `/visual-qa/social-match-preview?fixtureId=${fixtureId}&locale=${locale}&revision=${revision}`
        : contentType === "FULL_TIME"
          ? `/visual-qa/social-full-time?fixtureId=${fixtureId}&locale=${locale}&revision=${revision}`
          : contentType === "FINAL_SCORE"
            ? `/visual-qa/social-final-score?fixtureId=${fixtureId}&locale=${locale}&revision=${revision}`
            : `/visual-qa/social-confirmed-event?fixtureId=${fixtureId}&eventId=${eventId}&locale=${locale}&revision=${revision}`,
    caption: "Official line-up. COMING SOON • CURRENTLY IN TESTING",
    firstObservedAt: "2026-08-28T18:30:00.000Z",
    sourceSnapshotAt: "2026-08-28T18:31:00.000Z",
    templateVersion,
    sourceVersion,
    sourceChecksum: SOURCE_CHECKSUM,
    sourceRevisionManifest: SOURCE_REVISION_MANIFEST,
    sourceRevisionChecksum: SOURCE_REVISION_CHECKSUM,
    inputChecksum: INPUT_CHECKSUM,
    artifactMimeType,
    artifactBytes,
    artifactLocator: defaultLocator,
    generatedAt: "2026-08-30T02:00:00.000Z",
    ...overrides,
  } as Parameters<typeof createTouchlineSocialPublicationDraft>[0]);
}

function approve(created: Awaited<ReturnType<typeof createDraft>>) {
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error(created.reason);
  const artwork = approveTouchlineSocialArtwork(created.draft, {
    expectedArtifactChecksum: created.draft.artifactChecksum,
    expectedManifestChecksum: created.draft.manifestChecksum,
    approvedAt: "2026-08-30T02:10:00.000Z",
    approvedBy: "owner-art-review",
  });
  assert.equal(artwork.ok, true);
  if (!artwork.ok) throw new Error(artwork.reason);
  assert.equal(artwork.draft.approvalState, "APPROVAL_REQUIRED");
  const caption = approveTouchlineSocialCaption(artwork.draft, {
    expectedCaptionChecksum: artwork.draft.captionChecksum,
    expectedManifestChecksum: artwork.draft.manifestChecksum,
    approvedAt: "2026-08-30T02:11:00.000Z",
    approvedBy: "owner-caption-review",
  });
  assert.equal(caption.ok, true);
  if (!caption.ok) throw new Error(caption.reason);
  return caption.draft;
}

function exactReader(
  draft: TouchlineSocialPublicationDraft,
  stored: Partial<TouchlineSocialStoredArtifact> = {},
): TouchlineSocialArtifactReader {
  return {
    async readExact(locator) {
      assert.deepEqual(locator, draft.artifactLocator);
      return {
        locator: draft.artifactLocator,
        contentType: draft.artifactMimeType,
        bytes: draft.placement === "INSTAGRAM_STORY" ? STORY_JPEG_BYTES : FEED_PNG_BYTES,
        ...stored,
      };
    },
  };
}

test("feed drafts persist a canonical immutable 1080x1350 locator", async () => {
  const result = await createDraft();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.width, 1080);
  assert.equal(result.draft.height, 1350);
  assert.equal(result.draft.approvalState, "APPROVAL_REQUIRED");
  assert.equal(result.draft.generationLatencyMs, 113400000);
  assert.match(result.draft.artifactChecksum, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.draft.captionChecksum, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.draft.manifestChecksum, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.draft.artifactByteLength, FEED_PNG_BYTES.byteLength);
  assert.equal(result.draft.artifactLocator.bucket, "touchline-social-drafts");
  assert.match(result.draft.artifactLocator.objectKey, new RegExp(`${result.draft.artifactChecksum.slice(7)}\\.png$`));
  assert.equal(Object.isFrozen(result.draft), true);
  assert.equal(Object.isFrozen(result.draft.artifactLocator), true);
  assert.equal(Object.isFrozen(result.draft.sourceRevisionManifest), true);
});

test("draft generation chronology is monotonic and auditable", async () => {
  assert.deepEqual(await createDraft({
    firstObservedAt: "2026-08-28T18:32:00.000Z",
  }), { ok: false, reason: "INVALID_GENERATION_TIMELINE" });
  assert.deepEqual(await createDraft({
    generatedAt: "2026-08-28T18:30:30.000Z",
  }), { ok: false, reason: "INVALID_GENERATION_TIMELINE" });
});

test("approval media verifier reads and re-hashes the exact stored object", async () => {
  const created = await createDraft();
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.deepEqual(await verifyTouchlineSocialStoredArtifact({
    artifactReader: exactReader(created.draft),
    artifactLocator: created.draft.artifactLocator,
    artifactMimeType: created.draft.artifactMimeType,
    artifactByteLength: created.draft.artifactByteLength,
    artifactChecksum: created.draft.artifactChecksum,
    width: created.draft.width,
    height: created.draft.height,
  }), { ok: true, artifactChecksum: created.draft.artifactChecksum });
});

test("story JPEG drafts fully decode at exactly 1080x1920", async () => {
  const result = await createDraft({
    contentType: "FINAL_SCORE",
    placement: "INSTAGRAM_STORY",
    teamId: null,
    artifactMimeType: "image/jpeg",
    artifactBytes: STORY_JPEG_BYTES,
    caption: "Full-time. COMING SOON • CURRENTLY IN TESTING",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.width, 1080);
  assert.equal(result.draft.height, 1920);
  assert.match(result.draft.artifactLocator.objectKey, /\.jpg$/);
});

test("042 Full Time Feed uses an exact fixture-scoped identity", async () => {
  const result = await createDraft({
    contentType: "FULL_TIME",
    placement: "INSTAGRAM_FEED",
    teamId: null,
    templateVersion: "touchline-full-time-feed-v1",
    sourceVersion: "touchline-final-result-v1",
    caption: "Full Time. COMING SOON • CURRENTLY IN TESTING",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.renderPath,
    "/visual-qa/social-full-time?fixtureId=19722189&locale=en-GB&revision=1");
  assert.equal(result.draft.height, 1350);
  assert.equal(result.draft.teamId, null);
});

test("043 confirmed event Stories require an exact immutable event identity", async () => {
  const result = await createDraft({
    contentType: "GOAL_CONFIRMED", placement: "INSTAGRAM_STORY", teamId: null,
    eventId: "90001", templateVersion: "touchline-goal-confirmed-story-v1",
    sourceVersion: "touchline-confirmed-event-v1", artifactMimeType: "image/jpeg",
    artifactBytes: STORY_JPEG_BYTES, caption: "Goal confirmed. COMING SOON • CURRENTLY IN TESTING",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.eventId, "90001");
  assert.equal(result.draft.height, 1920);
  assert.equal(result.draft.teamId, null);
  assert.match(result.draft.publicationKey, /GOAL_CONFIRMED:19722189:90001:/);
  assert.match(result.draft.artifactLocator.objectKey, /goal_confirmed\/19722189\/90001\//);
  assert.deepEqual(await createDraft({ contentType: "GOAL_CONFIRMED", placement: "INSTAGRAM_STORY",
    teamId: null, eventId: null, artifactMimeType: "image/jpeg", artifactBytes: STORY_JPEG_BYTES }),
  { ok: false, reason: "CONFIRMED_EVENT_ID_REQUIRED" });
});

test("draft media validation rejects signature-only, truncated, wrong-sized and MIME-swapped files", async () => {
  const signatureOnly = FEED_PNG_BYTES.slice(0, 32);
  const truncated = FEED_PNG_BYTES.slice(0, Math.max(64, FEED_PNG_BYTES.byteLength - 8));
  const wrongSize = new Uint8Array(await sharp({
    create: { width: 1080, height: 1349, channels: 4, background: "#071711" },
  }).png().toBuffer());
  assert.deepEqual(await createDraft({ artifactBytes: signatureOnly }), {
    ok: false,
    reason: "FINAL_ARTIFACT_MEDIA_INVALID",
  });
  assert.deepEqual(await createDraft({ artifactBytes: truncated }), {
    ok: false,
    reason: "FINAL_ARTIFACT_MEDIA_INVALID",
  });
  assert.deepEqual(await createDraft({ artifactBytes: wrongSize }), {
    ok: false,
    reason: "FINAL_ARTIFACT_MEDIA_INVALID",
  });
  assert.deepEqual(await createDraft({
    artifactMimeType: "image/jpeg",
    artifactBytes: FEED_PNG_BYTES,
  }), { ok: false, reason: "FINAL_ARTIFACT_MEDIA_INVALID" });
});

test("draft identity and locator fail closed on mismatched render or object identity", async () => {
  assert.equal((await createDraft({ teamId: null })).ok, false);
  assert.equal((await createDraft({ sourceChecksum: "sha256:abc" })).ok, false);
  assert.equal((await createDraft({ inputChecksum: "sha256:abc" })).ok, false);
  assert.deepEqual(await createDraft({ inputChecksum: `sha256:${"b".repeat(64)}` }), {
    ok: false,
    reason: "LINEUP_SOURCE_IDENTITY_MISMATCH",
  });
  assert.equal((await createDraft({ revision: 0 })).ok, false);
  assert.deepEqual(await createDraft({
    renderPath: "/visual-qa/social-lineup?fixtureId=19722189&teamId=10&locale=en-GB&revision=1",
  }), { ok: false, reason: "RENDER_IDENTITY_MISMATCH" });
  assert.deepEqual(await createDraft({
    artifactLocator: {
      storageProvider: "SUPABASE_STORAGE",
      bucket: TOUCHLINE_SOCIAL_ARTIFACT_BUCKET,
      objectKey: "mutable/latest.png",
      etag: '"etag-0001"',
    },
  }), { ok: false, reason: "ARTIFACT_LOCATOR_INVALID" });
});

test("locale, source version and revision produce distinct publication and object identities", async () => {
  const baseline = await createDraft();
  const locale = await createDraft({ locale: "pt-BR" });
  const version = await createDraft({ sourceVersion: "fixture-feed-v2" });
  const revision = await createDraft({ revision: 2 });
  for (const candidate of [baseline, locale, version, revision]) assert.equal(candidate.ok, true);
  if (!baseline.ok || !locale.ok || !version.ok || !revision.ok) return;
  assert.equal(new Set([
    baseline.draft.publicationKey,
    locale.draft.publicationKey,
    version.draft.publicationKey,
    revision.draft.publicationKey,
  ]).size, 4);
  assert.equal(new Set([
    baseline.draft.artifactLocator.objectKey,
    locale.draft.artifactLocator.objectKey,
    version.draft.artifactLocator.objectKey,
    revision.draft.artifactLocator.objectKey,
  ]).size, 4);
});

test("artwork and caption require separate exact approvals before a revision is dispatchable", async () => {
  const created = await createDraft();
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.deepEqual(approveTouchlineSocialArtwork(created.draft, {
    expectedArtifactChecksum: `sha256:${"0".repeat(64)}`,
    expectedManifestChecksum: created.draft.manifestChecksum,
    approvedAt: "2026-08-30T02:10:00.000Z",
    approvedBy: "owner-review",
  }), { ok: false, reason: "STALE_ARTIFACT" });
  assert.deepEqual(approveTouchlineSocialCaption(created.draft, {
    expectedCaptionChecksum: `sha256:${"0".repeat(64)}`,
    expectedManifestChecksum: created.draft.manifestChecksum,
    approvedAt: "2026-08-30T02:10:00.000Z",
    approvedBy: "owner-review",
  }), { ok: false, reason: "STALE_CAPTION" });
  assert.deepEqual(approveTouchlineSocialArtwork(created.draft, {
    expectedArtifactChecksum: created.draft.artifactChecksum,
    expectedManifestChecksum: `sha256:${"0".repeat(64)}`,
    approvedAt: "2026-08-30T02:10:00.000Z",
    approvedBy: "owner-review",
  }), { ok: false, reason: "STALE_MANIFEST" });
  const approved = approve(created);
  assert.equal(approved.artworkApprovalState, "APPROVED");
  assert.equal(approved.captionApprovalState, "APPROVED");
  assert.equal(approved.approvedArtifactChecksum, approved.artifactChecksum);
  assert.equal(approved.approvedCaptionChecksum, approved.captionChecksum);
  assert.equal(approved.approvedManifestChecksum, approved.manifestChecksum);
  assert.deepEqual(approveTouchlineSocialArtwork(approved, {
    expectedArtifactChecksum: approved.artifactChecksum,
    expectedManifestChecksum: approved.manifestChecksum,
    approvedAt: "2026-08-30T02:11:00.000Z",
    approvedBy: "owner-review",
  }), { ok: false, reason: "ARTWORK_ALREADY_APPROVED" });
});

test("an artwork-only or caption-only review remains fail-closed", async () => {
  const created = await createDraft();
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const artwork = approveTouchlineSocialArtwork(created.draft, {
    expectedArtifactChecksum: created.draft.artifactChecksum,
    expectedManifestChecksum: created.draft.manifestChecksum,
    approvedAt: "2026-08-30T02:10:00.000Z",
    approvedBy: "owner-art-review",
  });
  assert.equal(artwork.ok, true);
  if (!artwork.ok) return;
  assert.equal(artwork.draft.approvalState, "APPROVAL_REQUIRED");
  assert.deepEqual(await planTouchlineInstagramDispatch({
    draft: artwork.draft,
    connection: { state: "CONFIGURED", connectionId: TOUCHLINE_SOCIAL_DESTINATION },
    artifactReader: exactReader(artwork.draft),
  }), { ready: false, reason: "APPROVAL_REQUIRED" });

  const caption = approveTouchlineSocialCaption(created.draft, {
    expectedCaptionChecksum: created.draft.captionChecksum,
    expectedManifestChecksum: created.draft.manifestChecksum,
    approvedAt: "2026-08-30T02:10:00.000Z",
    approvedBy: "owner-caption-review",
  });
  assert.equal(caption.ok, true);
  if (!caption.ok) return;
  assert.equal(caption.draft.approvalState, "APPROVAL_REQUIRED");
});

test("dispatch reads the exact immutable object, fully decodes and re-hashes it", async () => {
  const created = await createDraft();
  const approved = approve(created);
  const first = await planTouchlineInstagramDispatch({
    draft: approved,
    connection: { state: "CONFIGURED", connectionId: TOUCHLINE_SOCIAL_DESTINATION },
    artifactReader: exactReader(approved),
  });
  const repeated = await planTouchlineInstagramDispatch({
    draft: approved,
    connection: { state: "CONFIGURED", connectionId: TOUCHLINE_SOCIAL_DESTINATION },
    artifactReader: exactReader(approved),
  });
  assert.equal(first.ready, true);
  assert.deepEqual(repeated, first);
  if (!first.ready) return;
  assert.match(first.plan.idempotencyKey, /^sha256:[a-f0-9]{64}$/);
  const canonicalSqlInput = [
    approved.publicationKey,
    approved.manifestChecksum,
    approved.artifactChecksum,
    approved.captionChecksum,
    approved.artifactLocator.bucket,
    approved.artifactLocator.objectKey,
    TOUCHLINE_SOCIAL_DESTINATION,
  ].join(":");
  assert.equal(first.plan.idempotencyKey, `sha256:${createHash("sha256").update(canonicalSqlInput, "utf8").digest("hex")}`);
  assert.equal(first.plan.idempotencyKey, touchlineSocialDispatchIdempotencyKey({
    publicationKey: approved.publicationKey,
    manifestChecksum: approved.manifestChecksum,
    artifactChecksum: approved.artifactChecksum,
    captionChecksum: approved.captionChecksum,
    artifactBucket: approved.artifactLocator.bucket,
    artifactObjectKey: approved.artifactLocator.objectKey,
    destinationKey: TOUCHLINE_SOCIAL_DESTINATION,
  }));
  assert.deepEqual(first.plan.artifactLocator, approved.artifactLocator);
  assert.equal(first.plan.artifactChecksum, approved.artifactChecksum);
  assert.equal("renderPath" in first.plan, false);
});

test("dispatch fails closed for a missing key, changed ETag, changed bytes and truncated media", async () => {
  const created = await createDraft();
  const approved = approve(created);
  const missing = await planTouchlineInstagramDispatch({
    draft: approved,
    connection: { state: "CONFIGURED", connectionId: TOUCHLINE_SOCIAL_DESTINATION },
    artifactReader: { async readExact() { throw new Error("content-addressed key not found"); } },
  });
  assert.deepEqual(missing, { ready: false, reason: "ARTIFACT_STORAGE_READ_FAILED" });

  const changedLocator = await planTouchlineInstagramDispatch({
    draft: approved,
    connection: { state: "CONFIGURED", connectionId: TOUCHLINE_SOCIAL_DESTINATION },
    artifactReader: exactReader(approved, {
      locator: { ...approved.artifactLocator, etag: "etag-replaced" },
    }),
  });
  assert.deepEqual(changedLocator, { ready: false, reason: "ARTIFACT_LOCATOR_MISMATCH" });

  const changedBytes = new Uint8Array(await sharp({
    create: { width: 1080, height: 1350, channels: 4, background: "#17311f" },
  }).png().toBuffer());
  const stale = await planTouchlineInstagramDispatch({
    draft: approved,
    connection: { state: "CONFIGURED", connectionId: TOUCHLINE_SOCIAL_DESTINATION },
    artifactReader: exactReader(approved, { bytes: changedBytes }),
  });
  assert.equal(stale.ready, false);
  if (!stale.ready) assert.ok(["FINAL_ARTIFACT_MEDIA_INVALID", "STALE_ARTIFACT"].includes(stale.reason));

  const truncated = await planTouchlineInstagramDispatch({
    draft: approved,
    connection: { state: "CONFIGURED", connectionId: TOUCHLINE_SOCIAL_DESTINATION },
    artifactReader: exactReader(approved, { bytes: FEED_PNG_BYTES.slice(0, -8) }),
  });
  assert.deepEqual(truncated, { ready: false, reason: "FINAL_ARTIFACT_MEDIA_INVALID" });
});

test("a different content-addressed key cannot replace the approved object", async () => {
  const created = await createDraft();
  const approved = approve(created);
  const versions = new Map<string, TouchlineSocialStoredArtifact>();
  const locatorKey = (locator: TouchlineSocialArtifactLocator) => [
    locator.bucket,
    locator.objectKey,
  ].join("|");
  versions.set(locatorKey(approved.artifactLocator), {
    locator: approved.artifactLocator,
    contentType: approved.artifactMimeType,
    bytes: FEED_PNG_BYTES,
  });
  const replacementBytes = new Uint8Array(await sharp({
    create: { width: 1080, height: 1350, channels: 4, background: "#17311f" },
  }).png().toBuffer());
  const replacementChecksum = checksumTouchlineSocialArtifact(replacementBytes);
  const replacement = {
    ...approved.artifactLocator,
    objectKey: touchlineSocialArtifactObjectKey({
      fixtureId: approved.fixtureId,
      teamId: approved.teamId,
      contentType: approved.contentType,
      placement: approved.placement,
      locale: approved.locale,
      revision: approved.revision,
      templateVersion: approved.templateVersion,
      sourceVersion: approved.sourceVersion,
      artifactChecksum: replacementChecksum,
      artifactMimeType: approved.artifactMimeType,
    }),
    etag: '"etag-0002"',
  } as const;
  versions.set(locatorKey(replacement), {
    locator: replacement,
    contentType: approved.artifactMimeType,
    bytes: replacementBytes,
  });
  const reader: TouchlineSocialArtifactReader = {
    async readExact(locator) {
      const found = versions.get(locatorKey(locator));
      if (!found) throw new Error("exact content-addressed key not found");
      return found;
    },
  };
  const result = await planTouchlineInstagramDispatch({
    draft: approved,
    connection: { state: "CONFIGURED", connectionId: TOUCHLINE_SOCIAL_DESTINATION },
    artifactReader: reader,
  });
  assert.equal(result.ready, true);
  if (result.ready) assert.deepEqual(result.plan.artifactLocator, approved.artifactLocator);
});

test("planning short-circuits approval/connection and has no outbound implementation", async () => {
  const created = await createDraft();
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const reader: TouchlineSocialArtifactReader = {
    async readExact() { throw new Error("must not read"); },
  };
  assert.deepEqual(await planTouchlineInstagramDispatch({
    draft: created.draft,
    connection: { state: "NOT_CONFIGURED" },
    artifactReader: reader,
  }), { ready: false, reason: "APPROVAL_REQUIRED" });
  const approved = approve(created);
  assert.deepEqual(await planTouchlineInstagramDispatch({
    draft: approved,
    connection: { state: "NOT_CONFIGURED" },
    artifactReader: reader,
  }), { ready: false, reason: "INSTAGRAM_NOT_CONFIGURED" });

  const source = readFileSync(new URL("../lib/touchlineArena/social-publication-contract.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /access[_-]?token|client[_-]?secret|graph\.facebook|graph\.instagram|fetch\(/i);
  assert.doesNotMatch(source, /currentArtifactChecksum/);
  assert.match(source, /Planning only: no Meta request exists/);
  assert.match(source, /readExact/);
  assert.match(source, /raw\(\)\.toBuffer/);
});
