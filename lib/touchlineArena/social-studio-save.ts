import { createHash } from "node:crypto";
import { studioRecordKey } from "./social-studio-catalog.ts";
import { applyStudioAction, validateStudioRetry, type StudioAction, type StudioDeliveryAttempt, type StudioDocument, type StudioMedia, type StudioRecord } from "./social-studio-contract.ts";
import { studioEyesApproved, type StudioEyesSeal } from "./social-studio-desk.ts";

export type StudioSaveReceipt = {
  request_id: string; record_key: string; actor_id: string; request_checksum: string;
  action: StudioAction["action"]; revision: number; document: StudioDocument; created_at: string;
};

export type StudioSaveAttempt = { recordKey: string; requestChecksum: string };

type SourceCheckedMedia = { identity: string; manifest: StudioMedia };
/** Invoked ONLY from prepareDocument, after authenticated receipt recovery. No mutation here. */
export async function prepareStudioSourceCheckedAction(document: StudioDocument, action: StudioAction, media: SourceCheckedMedia | null, delivery: StudioDeliveryAttempt | null, now: number, dependencies: {
  verifyArtifact: (manifest: StudioMedia, now: number) => Promise<SourceCheckedMedia & { snapshot: Record<string, unknown>; eyes: StudioEyesSeal }>;
  verifySource: (manifest: StudioMedia, snapshot: Record<string, unknown>, now: number) => Promise<unknown>;
}): Promise<StudioDocument> {
  if (action.action === "save-plan" || action.action === "reject-artwork" || action.action === "request-revision") return applyStudioAction(document, action, media, now);
  if (action.action === "request-retry") validateStudioRetry(delivery, action, document, now);
  const expectedIdentity = action.action === "request-retry" ? delivery?.media_identity : action.mediaIdentity;
  if (!media || media.identity !== expectedIdentity || media.manifest.artId !== action.artId || media.manifest.placement !== action.placement) throw new Error("CURRENT_VIDEO_REQUIRED");
  const verified = await dependencies.verifyArtifact(media.manifest, now);
  if (verified.identity !== media.identity || !studioEyesApproved(verified.eyes)) throw new Error("EYES_APPROVAL_REQUIRED");
  await dependencies.verifySource(media.manifest, verified.snapshot, now);
  return applyStudioAction(document, action, verified, now, delivery);
}

/** Receipt recovery precedes time-dependent validation; the database still arbitrates every new write. */
export async function orchestrateStudioSave(action: StudioAction, actorId: string, dependencies: {
  findReceipt: (requestId: string) => Promise<StudioSaveReceipt | null>;
  prepareDocument: (attempt: StudioSaveAttempt) => Promise<StudioDocument>;
  commit: (document: StudioDocument, attempt: StudioSaveAttempt) => Promise<StudioRecord>;
}): Promise<StudioRecord> {
  const attempt = {
    recordKey: studioRecordKey(action.artId, action.platform, action.placement),
    requestChecksum: `sha256:${createHash("sha256").update(JSON.stringify(action)).digest("hex")}`,
  };
  const receipt = await dependencies.findReceipt(action.requestId);
  if (receipt) {
    if (receipt.request_id.toLowerCase() !== action.requestId.toLowerCase() || receipt.record_key !== attempt.recordKey
      || receipt.actor_id.toLowerCase() !== actorId.toLowerCase() || receipt.request_checksum !== attempt.requestChecksum
      || receipt.action !== action.action) throw new Error("IDEMPOTENCY_CONFLICT");
    return { record_key: receipt.record_key, revision: receipt.revision, document: receipt.document, updated_at: receipt.created_at };
  }
  const document = await dependencies.prepareDocument(attempt);
  return dependencies.commit(document, attempt);
}
