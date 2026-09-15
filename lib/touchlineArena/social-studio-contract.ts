import { STUDIO_CATALOG, studioRecordKey, studioSurfacesForArt, type StudioPlacement, type StudioPlatform } from "./social-studio-catalog.ts";

export type StudioMedia = {
  artId: string; version: string; placement: StudioPlacement;
  filePath: string; sha256: string; width: number; height: number; durationSeconds: number; caption: string;
  objectKey: string; byteSize: number; etag: string;
  captions?: { INSTAGRAM?: string; FACEBOOK?: string };
  verification: { reportPath: string; reportSha256: string };
  provenance: {
    source: string; fetchedAt: string; asOf: string; validUntil: string; competitionId: string; seasonId: string;
    fixtureIds: string[]; teamIds: string[]; playerIds: string[]; snapshotPath: string; snapshotSha256: string;
  };
};
export type StudioSchedule = { localDateTime: string; timeZone: string; utc: string; occurrence: "earlier" | "later" };
export type StudioReview = { artworkApprovedAt?: string; captionApprovedAt?: string; version: string; sha256: string; decision?: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED"; reason?: string; decidedAt?: string };
export type StudioAutomation = { mode: "PAUSED" | "OFFICIAL_EVENT" | "SCHEDULED"; maxAttempts: number; retryDelayMinutes: number };
export type StudioDocument = { outbound: "DISABLED"; permission: "PAUSED"; selected: boolean; schedule: StudioSchedule | null; reviews: Record<string, StudioReview>; automation?: StudioAutomation; retryRequests?: Record<string, { requestedAt: string; reason: string; deliveryRevision: number }> };
export type StudioRecord = { record_key: string; revision: number; document: StudioDocument; updated_at: string };
export type StudioAction = {
  requestId: string; artId: string; platform: StudioPlatform; placement: StudioPlacement; expectedRevision: number;
} & ({ action: "save-plan"; selected: boolean; schedule: { localDateTime: string; timeZone: string; occurrence: "earlier" | "later" } | null; automation?: StudioAutomation }
  | { action: "approve-artwork" | "approve-caption"; mediaIdentity: string; reviewSessionId: string; reason?: string }
  | { action: "reject-artwork" | "request-revision"; mediaIdentity: string; reason: string }
  | { action: "request-retry"; deliveryId: string; expectedDeliveryRevision: number; reason: string });

export const emptyStudioDocument = (): StudioDocument => ({ outbound: "DISABLED", permission: "PAUSED", selected: false, schedule: null, reviews: {} });
export const STUDIO_SHA = /^sha256:[a-f0-9]{64}$/;
export const STUDIO_REVIEW_BUCKET = "touchline-social-studio-review" as const;
export const STUDIO_REVIEW_MAX_BYTES = 40 * 1024 * 1024;
export const defaultStudioAutomation = (): StudioAutomation => ({ mode: "PAUSED", maxAttempts: 3, retryDelayMinutes: 15 });
export function studioCaption(media: Pick<StudioMedia, "caption" | "captions">, platform: StudioPlatform) {
  return platform === "CLUB" ? media.caption : media.captions?.[platform] ?? media.caption;
}

export function validateStudioMedia(media: StudioMedia) {
  const objectMatch = media.objectKey?.match(/^v1\/([A-Z][A-Z0-9_]{1,79})\/(FEED|STORY|CLUB_FEED)\/([a-f0-9]{64})\.mp4$/);
  if (!STUDIO_CATALOG.some((art) => art.id === media.artId && studioSurfacesForArt(art).some((surface) => surface.placement === media.placement))
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(media.version)
    || !["FEED", "STORY", "CLUB_FEED"].includes(media.placement)
    || !/^artifacts\/social-studio\/[a-zA-Z0-9/_-]+\.mp4$/.test(media.filePath)
    || !STUDIO_SHA.test(media.sha256)
    || !objectMatch || objectMatch[1] !== media.artId || objectMatch[2] !== media.placement || `sha256:${objectMatch[3]}` !== media.sha256
    || !Number.isSafeInteger(media.byteSize) || media.byteSize < 32 || media.byteSize > STUDIO_REVIEW_MAX_BYTES
    || typeof media.etag !== "string" || media.etag.length < 1 || media.etag.length > 256 || /[\u0000-\u001f\u007f]/.test(media.etag)
    || media.width !== 1080 || media.height !== (media.placement === "STORY" ? 1920 : 1350)
    || !Number.isFinite(media.durationSeconds) || media.durationSeconds < 1 || media.durationSeconds > 60
    || !media.caption.trim() || media.caption.length > 2200
    || (media.captions !== undefined && (!media.captions || typeof media.captions !== "object" || Object.entries(media.captions).some(([platform, caption]) => !["INSTAGRAM", "FACEBOOK"].includes(platform) || typeof caption !== "string" || !caption.trim() || caption.length > 2200)))
    || !/^artifacts\/social-studio\/[a-zA-Z0-9/_-]+\.json$/.test(media.verification?.reportPath ?? "")
    || !STUDIO_SHA.test(media.verification?.reportSha256 ?? "")
    || !/^artifacts\/social-studio\/[a-zA-Z0-9/_-]+\.json$/.test(media.provenance?.snapshotPath ?? "")
    || !STUDIO_SHA.test(media.provenance?.snapshotSha256 ?? "")
    || !media.provenance?.source.trim() || !media.provenance.competitionId.trim() || !media.provenance.seasonId.trim()
    || ![media.provenance.fetchedAt, media.provenance.asOf, media.provenance.validUntil].every((date) => Number.isFinite(Date.parse(date)))
    || ![media.provenance.fixtureIds, media.provenance.teamIds, media.provenance.playerIds].every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string" && id.trim()))) {
    throw new Error("INVALID_VIDEO_MANIFEST");
  }
  return media;
}

export function studioProvenanceCurrent(provenance: Pick<StudioMedia["provenance"], "fetchedAt" | "asOf" | "validUntil">, now: number) {
  const fetched = Date.parse(provenance.fetchedAt), asOf = Date.parse(provenance.asOf), until = Date.parse(provenance.validUntil);
  return [fetched, asOf, until, now].every(Number.isFinite)
    && asOf <= fetched && fetched <= now && until > fetched && until > now;
}

export function validateStudioProvenance(media: StudioMedia, now: number) {
  if (!studioProvenanceCurrent(media.provenance, now)) throw new Error("FACTUAL_SNAPSHOT_EXPIRED_OR_INVALID");
}

/** Resolve local wall time explicitly. DST gaps fail; repeated hours require the selected occurrence. */
export function resolveStudioSchedule(input: { localDateTime: string; timeZone: string; occurrence: "earlier" | "later" }, now: number): StudioSchedule {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.localDateTime) || !["earlier", "later"].includes(input.occurrence)) throw new Error("INVALID_SCHEDULE");
  const wall = Date.parse(`${input.localDateTime}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== input.localDateTime || wall > now + 730 * 86400000) throw new Error("INVALID_SCHEDULE");
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); } catch { throw new Error("INVALID_TIME_ZONE"); }
  const localString = (epoch: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(epoch).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  const offsets = new Set<number>();
  for (const delta of [-48, -24, 0, 24, 48]) {
    const sample = wall + delta * 3600000;
    offsets.add(Date.parse(`${localString(sample)}:00Z`) - sample);
  }
  const candidates = [...offsets].map((offset) => wall - offset).filter((epoch) => localString(epoch) === input.localDateTime).sort((a, b) => a - b);
  if (!candidates.length) throw new Error("NONEXISTENT_LOCAL_TIME");
  const instant = input.occurrence === "later" ? candidates[candidates.length - 1]! : candidates[0]!;
  if (instant <= now) throw new Error("SCHEDULE_IN_PAST");
  return { ...input, utc: new Date(instant).toISOString() };
}

export function parseStudioAction(body: unknown): StudioAction {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_REQUEST");
  const value = body as Record<string, unknown>;
  if (typeof value.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.requestId)
    || typeof value.artId !== "string" || typeof value.platform !== "string" || typeof value.placement !== "string"
    || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) throw new Error("INVALID_REQUEST");
  studioRecordKey(value.artId, value.platform as StudioPlatform, value.placement as StudioPlacement);
  if (value.action === "save-plan") {
    if (typeof value.selected !== "boolean" || (value.schedule !== null && (typeof value.schedule !== "object" || !value.schedule))) throw new Error("INVALID_REQUEST");
    if (value.schedule) {
      const schedule = value.schedule as Record<string, unknown>;
      if (typeof schedule.localDateTime !== "string" || typeof schedule.timeZone !== "string" || !["earlier", "later"].includes(String(schedule.occurrence))) throw new Error("INVALID_SCHEDULE");
    }
    if (value.automation !== undefined) validateStudioAutomation(value.automation);
  } else if (["approve-artwork", "approve-caption"].includes(String(value.action))) {
    if (typeof value.mediaIdentity !== "string" || !STUDIO_SHA.test(value.mediaIdentity)
      || typeof value.reviewSessionId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.reviewSessionId)) throw new Error("VIDEO_REVIEW_REQUIRED");
    if (value.reason !== undefined) validateStudioReason(value.reason);
  } else if (["reject-artwork", "request-revision"].includes(String(value.action))) {
    if (typeof value.mediaIdentity !== "string" || !STUDIO_SHA.test(value.mediaIdentity)) throw new Error("CURRENT_VIDEO_REQUIRED");
    validateStudioReason(value.reason);
  } else if (value.action === "request-retry") {
    if (typeof value.deliveryId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.deliveryId)
      || !Number.isSafeInteger(value.expectedDeliveryRevision) || Number(value.expectedDeliveryRevision) < 0) throw new Error("INVALID_DELIVERY_TARGET");
    validateStudioReason(value.reason);
  } else throw new Error("INVALID_ACTION");
  return value as StudioAction;
}

export function validateStudioReason(reason: unknown): asserts reason is string {
  if (typeof reason !== "string" || reason.trim().length < 10 || reason.length > 1000) throw new Error("REVIEW_REASON_REQUIRED");
}

export function validateStudioAutomation(value: unknown): asserts value is StudioAutomation {
  if (!value || typeof value !== "object") throw new Error("INVALID_AUTOMATION");
  const config = value as Record<string, unknown>;
  if (!["PAUSED", "OFFICIAL_EVENT", "SCHEDULED"].includes(String(config.mode))
    || !Number.isInteger(config.maxAttempts) || Number(config.maxAttempts) < 1 || Number(config.maxAttempts) > 10
    || !Number.isInteger(config.retryDelayMinutes) || Number(config.retryDelayMinutes) < 1 || Number(config.retryDelayMinutes) > 1440) throw new Error("INVALID_AUTOMATION");
}

export function studioReviewApproved(review: StudioReview | undefined) {
  return !!review?.artworkApprovedAt && !!review.captionApprovedAt && !["REJECTED", "CHANGES_REQUESTED"].includes(review.decision ?? "");
}

export function applyStudioAction(document: StudioDocument, action: StudioAction, media: { identity: string; manifest: StudioMedia } | null, now: number, delivery?: StudioDeliveryAttempt | null): StudioDocument {
  studioRecordKey(action.artId, action.platform, action.placement);
  const next = structuredClone(document);
  next.outbound = "DISABLED";
  next.permission = "PAUSED";
  if (action.action === "save-plan") {
    const art = STUDIO_CATALOG.find((item) => item.id === action.artId)!;
    if (art.trigger === "OFFICIAL_EVENT" && action.schedule !== null) throw new Error("OFFICIAL_EVENT_HAS_NO_CLOCK_SCHEDULE");
    if (action.platform === "CLUB" && art.internal === "PENDING" && action.selected) throw new Error("INTERNAL_DESTINATION_PENDING");
    next.selected = action.selected;
    next.schedule = action.schedule ? resolveStudioSchedule(action.schedule, now) : null;
    const automation = action.automation ?? next.automation ?? defaultStudioAutomation();
    validateStudioAutomation(automation);
    if ((automation.mode === "OFFICIAL_EVENT" && art.trigger !== "OFFICIAL_EVENT")
      || (automation.mode === "SCHEDULED" && (art.trigger !== "OWNER_SCHEDULE" || !next.schedule))) throw new Error("AUTOMATION_TRIGGER_MISMATCH");
    next.automation = { ...automation };
  } else if (action.action === "request-retry") {
    validateStudioReason(action.reason);
    validateStudioRetry(delivery ?? null, action, document, now);
    next.retryRequests ??= {};
    next.retryRequests[action.deliveryId] = { requestedAt: new Date(now).toISOString(), reason: action.reason.trim(), deliveryRevision: action.expectedDeliveryRevision };
  } else {
    if (!media || media.identity !== action.mediaIdentity || media.manifest.artId !== action.artId || media.manifest.placement !== action.placement) throw new Error("CURRENT_VIDEO_REQUIRED");
    validateStudioMedia(media.manifest);
    const review = next.reviews[media.identity] ?? { version: media.manifest.version, sha256: media.manifest.sha256 };
    if (action.action === "reject-artwork" || action.action === "request-revision") {
      validateStudioReason(action.reason);
      delete review.artworkApprovedAt;
      delete review.captionApprovedAt;
      review.decision = action.action === "reject-artwork" ? "REJECTED" : "CHANGES_REQUESTED";
      review.reason = action.reason.trim();
      review.decidedAt = new Date(now).toISOString();
    } else {
      validateStudioProvenance(media.manifest, now);
      if (action.reason !== undefined) { validateStudioReason(action.reason); review.reason = action.reason.trim(); }
      if (action.action === "approve-artwork") review.artworkApprovedAt ??= new Date(now).toISOString();
      else review.captionApprovedAt ??= new Date(now).toISOString();
      delete review.decision;
      if (studioReviewApproved(review)) review.decision = "APPROVED";
      review.decidedAt = new Date(now).toISOString();
    }
    next.reviews[media.identity] = review;
  }
  return next;
}

export function studioStatus(mediaIdentity: string | null, document: StudioDocument, mediaError?: string | null): "EM_PRODUCAO" | "EM_REVISAO" | "APROVADO" | "BLOQUEADO" {
  if (mediaError) return "BLOQUEADO";
  if (!mediaIdentity) return "EM_PRODUCAO";
  const review = document.reviews[mediaIdentity];
  return review?.decision === "REJECTED" ? "BLOQUEADO" : studioReviewApproved(review) ? "APROVADO" : "EM_REVISAO";
}

export type StudioDeliveryAttempt = {
  id: string; record_key: string; instance_id: string; platform: StudioPlatform; account_id: string; placement: StudioPlacement;
  media_identity: string; revision: number; state: "PENDING" | "CONFIRMED" | "FAILED" | "UNKNOWN"; receipt_id: string | null;
  error: string | null; retryable: boolean; source_current: boolean; source_valid_until: string; attempt_count: number;
  last_attempt_at: string | null; retry_requested_at: string | null;
};

export function validateStudioRetry(delivery: StudioDeliveryAttempt | null, action: Extract<StudioAction, { action: "request-retry" }>, document: StudioDocument, now: number) {
  if (!delivery || delivery.id !== action.deliveryId || delivery.record_key !== studioRecordKey(action.artId, action.platform, action.placement)
    || delivery.platform !== action.platform || delivery.placement !== action.placement || !delivery.account_id.trim()) throw new Error("INVALID_DELIVERY_TARGET");
  if (delivery.revision !== action.expectedDeliveryRevision) throw new Error("REVISION_CONFLICT");
  if (delivery.state !== "FAILED" || delivery.receipt_id || !delivery.retryable || delivery.retry_requested_at) throw new Error("DELIVERY_NOT_RETRYABLE");
  if (!delivery.source_current || !Number.isFinite(Date.parse(delivery.source_valid_until)) || Date.parse(delivery.source_valid_until) <= now) throw new Error("DELIVERY_SOURCE_NOT_CURRENT");
  if (!studioReviewApproved(document.reviews[delivery.media_identity])) throw new Error("CURRENT_APPROVAL_REQUIRED");
}

export function studioSameOrigin(request: Request) {
  try { return request.headers.get("origin") !== null && new URL(request.headers.get("origin")!).origin === new URL(request.url).origin; } catch { return false; }
}

export type StudioDelivery = { platform: StudioPlatform; accountId: string; placement: StudioPlacement; state: "PENDING" | "CONFIRMED" | "FAILED" | "UNKNOWN"; error: string | null };
export function studioDeliveryKey(instanceId: string, target: Pick<StudioDelivery, "platform" | "accountId" | "placement">) {
  if (!instanceId.trim() || !target.accountId.trim() || !["INSTAGRAM", "FACEBOOK", "CLUB"].includes(target.platform)
    || (target.platform === "CLUB" ? target.placement !== "CLUB_FEED" : !["FEED", "STORY"].includes(target.placement))) throw new Error("INVALID_DELIVERY_TARGET");
  return JSON.stringify([instanceId, target.platform, target.accountId, target.placement]);
}
export function studioDeliveryDisposition(delivery: StudioDelivery) {
  return delivery.state === "CONFIRMED" ? "DO_NOT_REPEAT" : delivery.state === "UNKNOWN" ? "RECONCILE_FIRST" : delivery.state === "FAILED" ? "REVIEW_ERROR_BEFORE_RETRY" : "WAIT_FOR_INTEGRATION";
}
