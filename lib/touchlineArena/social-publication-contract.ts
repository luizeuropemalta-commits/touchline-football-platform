import { createHash } from "node:crypto";

import sharp from "sharp";

const NUMERIC_ID = /^[1-9]\d{0,19}$/;
const SOURCE_VERSION = /^[A-Za-z0-9._-]{1,160}$/;
const STORAGE_ETAG_CONTROL = /[\u0000-\u001f\u007f]/;
const DISCLOSURE = "COMING SOON • CURRENTLY IN TESTING";
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SOURCE_REVISION_KEY = /^(fixture-provider|fixture-event|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$/;
const ARTIFACT_BUCKET = "touchline-social-drafts";
const SOCIAL_DESTINATION = "TOUCHLINE_OFFICIAL_INSTAGRAM";

export type TouchlineSocialContentType = "LINEUP" | "MATCH_PREVIEW" | "FULL_TIME" | "FINAL_SCORE"
  | "GOAL_CONFIRMED" | "RED_CARD_CONFIRMED"
  | "GAMEWEEK_RANKING_PREVIEW" | "GAMEWEEK_RANKING_FINAL" | "PLAYER_DUEL"
  | "GAMEWEEK_HERO" | "TOP_PERFORMER" | "HAT_TRICK_HERO";
export type TouchlineSocialPlacement = "INSTAGRAM_FEED" | "INSTAGRAM_STORY";
export type TouchlineSocialApprovalState = "APPROVAL_REQUIRED" | "APPROVED";
export type TouchlineSocialReviewState = "APPROVAL_REQUIRED" | "APPROVED";
export type TouchlineSocialArtifactMimeType = "image/png" | "image/jpeg";

export type TouchlineSocialArtifactLocator = Readonly<{
  storageProvider: "SUPABASE_STORAGE";
  bucket: typeof ARTIFACT_BUCKET;
  objectKey: string;
  etag: string | null;
}>;

export type TouchlineSocialStoredArtifact = Readonly<{
  locator: TouchlineSocialArtifactLocator;
  contentType: TouchlineSocialArtifactMimeType;
  bytes: Uint8Array;
}>;

export type TouchlineSocialArtifactReader = Readonly<{
  readExact(locator: TouchlineSocialArtifactLocator): Promise<TouchlineSocialStoredArtifact>;
}>;

export type TouchlineSocialPublicationDraft = Readonly<{
  publicationKey: string;
  fixtureId: string;
  teamId: string | null;
  eventId: string | null;
  scopeId: string | null;
  playerId: string | null;
  contentType: TouchlineSocialContentType;
  placement: TouchlineSocialPlacement;
  locale: "pt-BR" | "en-GB";
  revision: number;
  renderPath: string;
  width: 1080;
  height: 1350 | 1920;
  caption: string;
  disclosure: typeof DISCLOSURE;
  firstObservedAt: string;
  sourceSnapshotAt: string;
  templateVersion: string;
  sourceVersion: string;
  sourceChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
  inputChecksum: string;
  artifactMimeType: TouchlineSocialArtifactMimeType;
  artifactByteLength: number;
  artifactLocator: TouchlineSocialArtifactLocator;
  manifestChecksum: string;
  artifactChecksum: string;
  captionChecksum: string;
  artworkApprovalState: TouchlineSocialReviewState;
  captionApprovalState: TouchlineSocialReviewState;
  approvedArtifactChecksum: string | null;
  artworkApprovedManifestChecksum: string | null;
  artworkApprovedAt: string | null;
  artworkApprovedBy: string | null;
  approvedCaptionChecksum: string | null;
  captionApprovedManifestChecksum: string | null;
  captionApprovedAt: string | null;
  captionApprovedBy: string | null;
  approvedManifestChecksum: string | null;
  generatedAt: string;
  generationLatencyMs: number;
  approvalState: TouchlineSocialApprovalState;
}>;

export type TouchlineInstagramConnection =
  | Readonly<{ state: "NOT_CONFIGURED" }>
  | Readonly<{ state: "CONFIGURED"; connectionId: typeof SOCIAL_DESTINATION }>;

function timestamp(value: string) {
  return Number.isFinite(Date.parse(value));
}

function checksumFor(value: string) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function validSourceRevisionManifest(value: Readonly<Record<string, number>>) {
  const entries = Object.entries(value);
  return entries.length >= 1
    && entries.length <= 128
    && entries.every(([key, revision]) => (
      SOURCE_REVISION_KEY.test(key)
      && Number.isSafeInteger(revision)
      && revision >= 0
    ));
}

export function checksumTouchlineSocialArtifact(value: Uint8Array) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function checksumTouchlineSocialCaption(value: string) {
  return checksumFor(value.trim());
}

/**
 * Canonical cross-layer identity for one approved delivery revision.
 * Keep this ordered identity tuple semantically aligned with
 * public.touchline_social_enqueue_dispatch in QA migration 039. TypeScript
 * and PostgreSQL serialize independently; fixture tests prove parity instead
 * of claiming byte-for-byte source equivalence.
 */
export function touchlineSocialDispatchIdempotencyKey(input: Readonly<{
  publicationKey: string;
  manifestChecksum: string;
  artifactChecksum: string;
  captionChecksum: string;
  artifactBucket: string;
  artifactObjectKey: string;
  destinationKey: typeof SOCIAL_DESTINATION;
}>) {
  return checksumFor([
    input.publicationKey,
    input.manifestChecksum,
    input.artifactChecksum,
    input.captionChecksum,
    input.artifactBucket,
    input.artifactObjectKey,
    input.destinationKey,
  ].join(":"));
}

function artifactExtension(mimeType: TouchlineSocialArtifactMimeType) {
  return mimeType === "image/png" ? "png" : "jpg";
}

export function touchlineSocialArtifactObjectKey(input: Readonly<{
  fixtureId: string;
  teamId: string | null;
  eventId?: string | null;
  scopeId?: string | null;
  playerId?: string | null;
  contentType: TouchlineSocialContentType;
  placement: TouchlineSocialPlacement;
  locale: "pt-BR" | "en-GB";
  revision: number;
  templateVersion: string;
  sourceVersion: string;
  artifactChecksum: string;
  artifactMimeType: TouchlineSocialArtifactMimeType;
}>) {
  return [
    "instagram",
    input.placement.toLowerCase(),
    input.contentType.toLowerCase(),
    input.scopeId ?? input.fixtureId,
    input.playerId ?? input.eventId ?? input.teamId ?? (input.scopeId ? "gameweek" : "fixture"),
    input.locale,
    `tv=${input.templateVersion}`,
    `sv=${input.sourceVersion}`,
    `r=${input.revision}`,
    `${input.artifactChecksum.slice("sha256:".length)}.${artifactExtension(input.artifactMimeType)}`,
  ].join("/");
}

function sameArtifactLocator(
  actual: TouchlineSocialArtifactLocator,
  expected: TouchlineSocialArtifactLocator,
) {
  return actual.storageProvider === expected.storageProvider
    && actual.bucket === expected.bucket
    && actual.objectKey === expected.objectKey
    && (expected.etag === null || actual.etag === expected.etag);
}

async function decodeAndValidateArtifact(input: Readonly<{
  bytes: Uint8Array;
  mimeType: TouchlineSocialArtifactMimeType;
  expectedWidth: 1080;
  expectedHeight: 1350 | 1920;
}>) {
  if (input.bytes.byteLength === 0) return false;
  const terminalBytes = input.mimeType === "image/png"
    ? [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]
    : [0xff, 0xd9];
  if (input.bytes.byteLength < terminalBytes.length
    || !terminalBytes.every((byte, index) => (
      input.bytes[input.bytes.byteLength - terminalBytes.length + index] === byte
    ))) {
    return false;
  }
  try {
    const decoder = sharp(Buffer.from(input.bytes), {
      failOn: "error",
      limitInputPixels: input.expectedWidth * input.expectedHeight,
      sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    const expectedFormat = input.mimeType === "image/png" ? "png" : "jpeg";
    if (metadata.format !== expectedFormat
      || metadata.width !== input.expectedWidth
      || metadata.height !== input.expectedHeight
      || (metadata.pages ?? 1) !== 1) {
      return false;
    }
    const decoded = await decoder.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return decoded.info.width === input.expectedWidth
      && decoded.info.height === input.expectedHeight
      && decoded.data.byteLength === input.expectedWidth * input.expectedHeight * 4;
  } catch {
    return false;
  }
}

function validArtifactLocator(input: Readonly<{
  locator: TouchlineSocialArtifactLocator;
  expectedObjectKey: string;
}>) {
  return input.locator.storageProvider === "SUPABASE_STORAGE"
    && input.locator.bucket === ARTIFACT_BUCKET
    && input.locator.objectKey === input.expectedObjectKey
    && (input.locator.etag === null || (
      input.locator.etag.length >= 1
      && input.locator.etag.length <= 256
      && !STORAGE_ETAG_CONTROL.test(input.locator.etag)
    ));
}

export function touchlineSocialRenderPath(input: Readonly<{
  fixtureId: string;
  teamId: string | null;
  eventId?: string | null;
  scopeId?: string | null;
  playerId?: string | null;
  contentType: TouchlineSocialContentType;
  locale: "pt-BR" | "en-GB";
  revision: number;
}>) {
  const rankingFamily = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL",
    "GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(input.contentType);
  const base = rankingFamily
    ? `/visual-qa/social-ranking?contentType=${input.contentType}&fixtureId=${input.fixtureId}`
      + `${input.scopeId ? `&scopeId=${input.scopeId}` : ""}`
      + `${input.playerId ? `&playerId=${input.playerId}` : ""}`
    : input.contentType === "LINEUP"
    ? `/visual-qa/social-lineup?fixtureId=${input.fixtureId}&teamId=${input.teamId}`
    : input.contentType === "MATCH_PREVIEW"
      ? `/visual-qa/social-match-preview?fixtureId=${input.fixtureId}`
      : input.contentType === "FULL_TIME"
        ? `/visual-qa/social-full-time?fixtureId=${input.fixtureId}`
        : input.contentType === "FINAL_SCORE"
          ? `/visual-qa/social-final-score?fixtureId=${input.fixtureId}`
          : `/visual-qa/social-confirmed-event?fixtureId=${input.fixtureId}&eventId=${input.eventId}`;
  return `${base}&locale=${input.locale}&revision=${input.revision}`;
}

/**
 * Fail-closed draft boundary. Supabase Storage does not expose historical
 * revision retrieval, so identity is the create-only content-addressed key plus
 * the exported SHA-256. ETag is only an optional conditional-read guard.
 * renderPath remains review provenance and is never a dispatch source.
 */
export async function createTouchlineSocialPublicationDraft(input: Readonly<{
  fixtureId: string;
  teamId?: string | null;
  eventId?: string | null;
  scopeId?: string | null;
  playerId?: string | null;
  contentType: TouchlineSocialContentType;
  placement: TouchlineSocialPlacement;
  locale: "pt-BR" | "en-GB";
  revision: number;
  renderPath: string;
  caption: string;
  firstObservedAt: string;
  sourceSnapshotAt: string;
  templateVersion: string;
  sourceVersion: string;
  sourceChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
  inputChecksum: string;
  artifactMimeType: TouchlineSocialArtifactMimeType;
  artifactBytes: Uint8Array;
  artifactLocator: TouchlineSocialArtifactLocator;
  generatedAt: string;
}>) {
  const fixtureId = input.fixtureId.trim();
  const teamId = input.teamId?.trim() || null;
  const eventId = input.eventId?.trim() || null;
  const scopeId = input.scopeId?.trim() || null;
  const playerId = input.playerId?.trim() || null;
  const caption = input.caption.trim();
  const templateVersion = input.templateVersion.trim();
  const sourceVersion = input.sourceVersion.trim();
  const sourceChecksum = input.sourceChecksum.trim();
  const sourceRevisionChecksum = input.sourceRevisionChecksum.trim();
  const inputChecksum = input.inputChecksum.trim();
  if (!NUMERIC_ID.test(fixtureId)) return { ok: false, reason: "INVALID_FIXTURE_ID" } as const;
  if (input.contentType === "LINEUP" && (!teamId || !NUMERIC_ID.test(teamId))) {
    return { ok: false, reason: "LINEUP_TEAM_ID_REQUIRED" } as const;
  }
  if (teamId && !NUMERIC_ID.test(teamId)) return { ok: false, reason: "INVALID_TEAM_ID" } as const;
  const rankingFamily = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL",
    "GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(input.contentType);
  const gameweekScoped = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "GAMEWEEK_HERO"].includes(input.contentType);
  const playerScoped = ["GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(input.contentType);
  if (["MATCH_PREVIEW", "FULL_TIME", "FINAL_SCORE", "GOAL_CONFIRMED", "RED_CARD_CONFIRMED",
    "GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL", "GAMEWEEK_HERO",
    "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(input.contentType) && teamId) {
    return { ok: false, reason: `${input.contentType}_TEAM_ID_FORBIDDEN` } as const;
  }
  const confirmedEvent = input.contentType === "GOAL_CONFIRMED" || input.contentType === "RED_CARD_CONFIRMED";
  if (confirmedEvent && (!eventId || !NUMERIC_ID.test(eventId))) {
    return { ok: false, reason: "CONFIRMED_EVENT_ID_REQUIRED" } as const;
  }
  if (!confirmedEvent && eventId) return { ok: false, reason: "EVENT_ID_FORBIDDEN" } as const;
  if (gameweekScoped !== Boolean(scopeId) || (scopeId && !NUMERIC_ID.test(scopeId))) {
    return { ok: false, reason: "GAMEWEEK_SCOPE_IDENTITY_INVALID" } as const;
  }
  if (playerScoped !== Boolean(playerId) || (playerId && !NUMERIC_ID.test(playerId))) {
    return { ok: false, reason: "RANKING_PLAYER_IDENTITY_INVALID" } as const;
  }
  if (!rankingFamily && (scopeId || playerId)) return { ok: false, reason: "RANKING_SCOPE_FORBIDDEN" } as const;
  if (input.contentType === "MATCH_PREVIEW" && input.placement !== "INSTAGRAM_FEED") {
    return { ok: false, reason: "MATCH_PREVIEW_FEED_REQUIRED" } as const;
  }
  if (input.contentType === "FULL_TIME" && input.placement !== "INSTAGRAM_FEED") {
    return { ok: false, reason: "FULL_TIME_FEED_REQUIRED" } as const;
  }
  if (input.contentType === "FINAL_SCORE" && input.placement !== "INSTAGRAM_STORY") {
    return { ok: false, reason: "FINAL_SCORE_STORY_REQUIRED" } as const;
  }
  if (confirmedEvent && input.placement !== "INSTAGRAM_STORY") {
    return { ok: false, reason: "CONFIRMED_EVENT_STORY_REQUIRED" } as const;
  }
  if (rankingFamily && input.placement !== "INSTAGRAM_FEED") {
    return { ok: false, reason: "RANKING_FAMILY_FEED_REQUIRED" } as const;
  }
  if (!caption || !caption.includes(DISCLOSURE)) return { ok: false, reason: "TESTING_DISCLOSURE_REQUIRED" } as const;
  if (!timestamp(input.firstObservedAt)
    || !timestamp(input.sourceSnapshotAt)
    || !timestamp(input.generatedAt)) {
    return { ok: false, reason: "INVALID_TIMESTAMP" } as const;
  }
  const firstObservedAtMs = Date.parse(input.firstObservedAt);
  const sourceSnapshotAtMs = Date.parse(input.sourceSnapshotAt);
  const generatedAtMs = Date.parse(input.generatedAt);
  if (sourceSnapshotAtMs < firstObservedAtMs || generatedAtMs < sourceSnapshotAtMs) {
    return { ok: false, reason: "INVALID_GENERATION_TIMELINE" } as const;
  }
  const generationLatencyMs = generatedAtMs - firstObservedAtMs;
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    return { ok: false, reason: "INVALID_REVISION" } as const;
  }
  const expectedRenderPath = touchlineSocialRenderPath({
    fixtureId,
    teamId,
    eventId,
    scopeId,
    playerId,
    contentType: input.contentType,
    locale: input.locale,
    revision: input.revision,
  });
  if (input.renderPath !== expectedRenderPath) {
    return { ok: false, reason: "RENDER_IDENTITY_MISMATCH" } as const;
  }
  if (!SOURCE_VERSION.test(templateVersion)
    || !SOURCE_VERSION.test(sourceVersion)
    || !SHA256.test(sourceChecksum)
    || !validSourceRevisionManifest(input.sourceRevisionManifest)
    || !SHA256.test(sourceRevisionChecksum)
    || !SHA256.test(inputChecksum)) {
    return { ok: false, reason: "SOURCE_PROVENANCE_REQUIRED" } as const;
  }
  if (input.contentType === "LINEUP" && inputChecksum !== sourceChecksum) {
    return { ok: false, reason: "LINEUP_SOURCE_IDENTITY_MISMATCH" } as const;
  }
  if (["MATCH_PREVIEW", "FULL_TIME", "FINAL_SCORE", "GOAL_CONFIRMED", "RED_CARD_CONFIRMED",
    "GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL", "GAMEWEEK_HERO",
    "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(input.contentType)
    && inputChecksum !== sourceChecksum) {
    return { ok: false, reason: `${input.contentType}_SOURCE_IDENTITY_MISMATCH` } as const;
  }

  const width = 1080 as const;
  const height = input.placement === "INSTAGRAM_STORY" ? 1920 as const : 1350 as const;
  if (!await decodeAndValidateArtifact({
    bytes: input.artifactBytes,
    mimeType: input.artifactMimeType,
    expectedWidth: width,
    expectedHeight: height,
  })) {
    return { ok: false, reason: "FINAL_ARTIFACT_MEDIA_INVALID" } as const;
  }

  const artifactChecksum = checksumTouchlineSocialArtifact(input.artifactBytes);
  const captionChecksum = checksumTouchlineSocialCaption(caption);
  const expectedObjectKey = touchlineSocialArtifactObjectKey({
    fixtureId,
    teamId,
    eventId,
    scopeId,
    playerId,
    contentType: input.contentType,
    placement: input.placement,
    locale: input.locale,
    revision: input.revision,
    templateVersion,
    sourceVersion,
    artifactChecksum,
    artifactMimeType: input.artifactMimeType,
  });
  if (!validArtifactLocator({ locator: input.artifactLocator, expectedObjectKey })) {
    return { ok: false, reason: "ARTIFACT_LOCATOR_INVALID" } as const;
  }

  const publicationKey = [
    "instagram",
    input.placement,
    input.contentType,
    scopeId ?? fixtureId,
    playerId ?? eventId ?? teamId ?? (scopeId ? "gameweek" : "fixture"),
    input.locale,
    `tv=${templateVersion}`,
    `sv=${sourceVersion}`,
    `r=${input.revision}`,
  ].join(":");
  const manifestChecksum = checksumFor(JSON.stringify({
    publicationKey,
    eventId,
    scopeId,
    playerId,
    renderPath: input.renderPath,
    width,
    height,
    caption,
    firstObservedAt: input.firstObservedAt,
    sourceSnapshotAt: input.sourceSnapshotAt,
    templateVersion,
    sourceVersion,
    sourceChecksum,
    sourceRevisionManifest: input.sourceRevisionManifest,
    sourceRevisionChecksum,
    inputChecksum,
    artifactMimeType: input.artifactMimeType,
    artifactByteLength: input.artifactBytes.byteLength,
    artifactChecksum,
    artifactLocator: input.artifactLocator,
    generatedAt: input.generatedAt,
    generationLatencyMs,
  }));
  return {
    ok: true,
    draft: Object.freeze({
      publicationKey,
      fixtureId,
      teamId,
      eventId,
      scopeId,
      playerId,
      contentType: input.contentType,
      placement: input.placement,
      locale: input.locale,
      revision: input.revision,
      renderPath: input.renderPath,
      width,
      height,
      caption,
      disclosure: DISCLOSURE,
      firstObservedAt: input.firstObservedAt,
      sourceSnapshotAt: input.sourceSnapshotAt,
      templateVersion,
      sourceVersion,
      sourceChecksum,
      sourceRevisionManifest: Object.freeze({ ...input.sourceRevisionManifest }),
      sourceRevisionChecksum,
      inputChecksum,
      artifactMimeType: input.artifactMimeType,
      artifactByteLength: input.artifactBytes.byteLength,
      artifactLocator: Object.freeze({ ...input.artifactLocator }),
      manifestChecksum,
      artifactChecksum,
      captionChecksum,
      artworkApprovalState: "APPROVAL_REQUIRED",
      captionApprovalState: "APPROVAL_REQUIRED",
      approvedArtifactChecksum: null,
      artworkApprovedManifestChecksum: null,
      artworkApprovedAt: null,
      artworkApprovedBy: null,
      approvedCaptionChecksum: null,
      captionApprovedManifestChecksum: null,
      captionApprovedAt: null,
      captionApprovedBy: null,
      approvedManifestChecksum: null,
      generatedAt: input.generatedAt,
      generationLatencyMs,
      approvalState: "APPROVAL_REQUIRED",
    } satisfies TouchlineSocialPublicationDraft),
  } as const;
}

function combinedApprovalState(draft: TouchlineSocialPublicationDraft) {
  const approved = draft.artworkApprovalState === "APPROVED"
    && draft.captionApprovalState === "APPROVED"
    && draft.approvedArtifactChecksum === draft.artifactChecksum
    && draft.approvedCaptionChecksum === draft.captionChecksum
    && draft.artworkApprovedManifestChecksum === draft.manifestChecksum
    && draft.captionApprovedManifestChecksum === draft.manifestChecksum;
  return approved
    ? { approvalState: "APPROVED" as const, approvedManifestChecksum: draft.manifestChecksum }
    : { approvalState: "APPROVAL_REQUIRED" as const, approvedManifestChecksum: null };
}

export function approveTouchlineSocialArtwork(
  draft: TouchlineSocialPublicationDraft,
  approval: Readonly<{
    expectedArtifactChecksum: string;
    expectedManifestChecksum: string;
    approvedAt: string;
    approvedBy: string;
  }>,
) {
  if (draft.approvalState === "APPROVED" || draft.artworkApprovalState === "APPROVED") {
    return { ok: false, reason: "ARTWORK_ALREADY_APPROVED" } as const;
  }
  if (approval.expectedArtifactChecksum !== draft.artifactChecksum) return { ok: false, reason: "STALE_ARTIFACT" } as const;
  if (approval.expectedManifestChecksum !== draft.manifestChecksum) return { ok: false, reason: "STALE_MANIFEST" } as const;
  if (!timestamp(approval.approvedAt) || !approval.approvedBy.trim()) return { ok: false, reason: "INVALID_APPROVAL" } as const;
  const partial = {
    ...draft,
    artworkApprovalState: "APPROVED" as const,
    approvedArtifactChecksum: draft.artifactChecksum,
    artworkApprovedManifestChecksum: draft.manifestChecksum,
    artworkApprovedAt: approval.approvedAt,
    artworkApprovedBy: approval.approvedBy.trim(),
  } satisfies TouchlineSocialPublicationDraft;
  return {
    ok: true,
    draft: Object.freeze({
      ...partial,
      ...combinedApprovalState(partial),
    } satisfies TouchlineSocialPublicationDraft),
  } as const;
}

export function approveTouchlineSocialCaption(
  draft: TouchlineSocialPublicationDraft,
  approval: Readonly<{
    expectedCaptionChecksum: string;
    expectedManifestChecksum: string;
    approvedAt: string;
    approvedBy: string;
  }>,
) {
  if (draft.approvalState === "APPROVED" || draft.captionApprovalState === "APPROVED") {
    return { ok: false, reason: "CAPTION_ALREADY_APPROVED" } as const;
  }
  if (approval.expectedCaptionChecksum !== draft.captionChecksum) return { ok: false, reason: "STALE_CAPTION" } as const;
  if (approval.expectedManifestChecksum !== draft.manifestChecksum) return { ok: false, reason: "STALE_MANIFEST" } as const;
  if (!timestamp(approval.approvedAt) || !approval.approvedBy.trim()) return { ok: false, reason: "INVALID_APPROVAL" } as const;
  const partial = {
    ...draft,
    captionApprovalState: "APPROVED" as const,
    approvedCaptionChecksum: draft.captionChecksum,
    captionApprovedManifestChecksum: draft.manifestChecksum,
    captionApprovedAt: approval.approvedAt,
    captionApprovedBy: approval.approvedBy.trim(),
  } satisfies TouchlineSocialPublicationDraft;
  return {
    ok: true,
    draft: Object.freeze({
      ...partial,
      ...combinedApprovalState(partial),
    } satisfies TouchlineSocialPublicationDraft),
  } as const;
}

/**
 * Planning only: no Meta request exists in this module. The immutable object is
 * read by its content-addressed key, fully decoded, and re-hashed before a
 * dispatch can become ready. A mutable render URL, unretrievable historical
 * revision promise or caller-supplied checksum is never used.
 */
export async function planTouchlineInstagramDispatch(input: Readonly<{
  draft: TouchlineSocialPublicationDraft;
  connection: TouchlineInstagramConnection;
  artifactReader: TouchlineSocialArtifactReader;
}>) {
  if (input.draft.approvalState !== "APPROVED") return { ready: false, reason: "APPROVAL_REQUIRED" } as const;
  if (input.draft.artworkApprovalState !== "APPROVED"
    || input.draft.approvedArtifactChecksum !== input.draft.artifactChecksum
    || input.draft.artworkApprovedManifestChecksum !== input.draft.manifestChecksum) {
    return { ready: false, reason: "ARTWORK_APPROVAL_MISMATCH" } as const;
  }
  if (input.draft.captionApprovalState !== "APPROVED"
    || input.draft.approvedCaptionChecksum !== input.draft.captionChecksum
    || input.draft.captionApprovedManifestChecksum !== input.draft.manifestChecksum) {
    return { ready: false, reason: "CAPTION_APPROVAL_MISMATCH" } as const;
  }
  if (input.draft.approvedManifestChecksum !== input.draft.manifestChecksum) {
    return { ready: false, reason: "APPROVED_MANIFEST_MISMATCH" } as const;
  }
  if (input.connection.state !== "CONFIGURED") return { ready: false, reason: "INSTAGRAM_NOT_CONFIGURED" } as const;
  if (input.connection.connectionId !== SOCIAL_DESTINATION) {
    return { ready: false, reason: "INSTAGRAM_CONNECTION_INVALID" } as const;
  }

  const verified = await verifyTouchlineSocialStoredArtifact({
    artifactReader: input.artifactReader,
    artifactLocator: input.draft.artifactLocator,
    artifactMimeType: input.draft.artifactMimeType,
    artifactByteLength: input.draft.artifactByteLength,
    artifactChecksum: input.draft.artifactChecksum,
    width: input.draft.width,
    height: input.draft.height,
  });
  if (!verified.ok) return { ready: false, reason: verified.reason } as const;

  return {
    ready: true,
    plan: Object.freeze({
      connectionId: input.connection.connectionId,
      publicationKey: input.draft.publicationKey,
      revision: input.draft.revision,
      idempotencyKey: touchlineSocialDispatchIdempotencyKey({
        publicationKey: input.draft.publicationKey,
        manifestChecksum: input.draft.manifestChecksum,
        artifactChecksum: input.draft.artifactChecksum,
        captionChecksum: input.draft.captionChecksum,
        artifactBucket: input.draft.artifactLocator.bucket,
        artifactObjectKey: input.draft.artifactLocator.objectKey,
        destinationKey: SOCIAL_DESTINATION,
      }),
      placement: input.draft.placement,
      artifactChecksum: input.draft.artifactChecksum,
      manifestChecksum: input.draft.manifestChecksum,
      artifactLocator: input.draft.artifactLocator,
      caption: input.draft.caption,
    }),
  } as const;
}

/**
 * Approval and delivery share the exact same immutable-media verification.
 * The approved SHA is derived from the bytes fetched through the server-only
 * Storage adapter; a signed preview URL is never treated as proof.
 */
export async function verifyTouchlineSocialStoredArtifact(input: Readonly<{
  artifactReader: TouchlineSocialArtifactReader;
  artifactLocator: TouchlineSocialArtifactLocator;
  artifactMimeType: TouchlineSocialArtifactMimeType;
  artifactByteLength: number;
  artifactChecksum: string;
  width: 1080;
  height: 1350 | 1920;
}>) {
  let stored: TouchlineSocialStoredArtifact;
  try {
    stored = await input.artifactReader.readExact(input.artifactLocator);
  } catch {
    return { ok: false, reason: "ARTIFACT_STORAGE_READ_FAILED" } as const;
  }
  if (!sameArtifactLocator(stored.locator, input.artifactLocator)) {
    return { ok: false, reason: "ARTIFACT_LOCATOR_MISMATCH" } as const;
  }
  if (stored.contentType !== input.artifactMimeType
    || stored.bytes.byteLength !== input.artifactByteLength
    || !await decodeAndValidateArtifact({
      bytes: stored.bytes,
      mimeType: stored.contentType,
      expectedWidth: input.width,
      expectedHeight: input.height,
    })) {
    return { ok: false, reason: "FINAL_ARTIFACT_MEDIA_INVALID" } as const;
  }
  const rehashedArtifactChecksum = checksumTouchlineSocialArtifact(stored.bytes);
  if (rehashedArtifactChecksum !== input.artifactChecksum) {
    return { ok: false, reason: "STALE_ARTIFACT" } as const;
  }
  return { ok: true, artifactChecksum: rehashedArtifactChecksum } as const;
}

export const TOUCHLINE_SOCIAL_ARTIFACT_BUCKET = ARTIFACT_BUCKET;
export const TOUCHLINE_SOCIAL_DESTINATION = SOCIAL_DESTINATION;
export const TOUCHLINE_SOCIAL_TESTING_DISCLOSURE = DISCLOSURE;
