import "server-only";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertTouchlineSocialQaRuntime } from "./social-artifact-storage-server";
import { studioMediaIdentity, verifyStudioArtifact } from "./social-studio-artifact";
import { STUDIO_CATALOG, studioRecordKey, studioSurfacesForArt, type StudioPlacement } from "./social-studio-catalog";
import { emptyStudioDocument, studioProvenanceCurrent, validateStudioMedia, type StudioAction, type StudioDeliveryAttempt, type StudioMedia, type StudioRecord } from "./social-studio-contract";
import { studioEyesApproved, studioEyesSeal, type StudioEyesSeal } from "./social-studio-desk";
import { STUDIO_MEDIA } from "./social-studio-media";
import { studioUserCanReview } from "./social-studio-request";
import { orchestrateStudioSave, prepareStudioSourceCheckedAction, type StudioSaveReceipt } from "./social-studio-save";
import { STUDIO_OFFICIAL_SOURCE_BLOCK, verifyStudioOfficialSource } from "./social-studio-source-gate-server";
import { validateStudioOfficialDeclaration } from "./social-studio-source-gate";
import { createStudioReviewStorageFromEnvironment } from "./social-studio-storage-server";

export type StudioMediaView = { identity: string; version: string; sha256: string; width: number; height: number; durationSeconds: number; caption: string; captions?: StudioMedia["captions"]; provenance: Omit<StudioMedia["provenance"], "snapshotPath">; url: string; previewAvailable: boolean; reviewReady: boolean; eyes: StudioEyesSeal };
export type StudioSnapshot = {
  records: StudioRecord[];
  media: Record<string, { current: StudioMediaView | null; error: string | null }>;
  writable: boolean; persistenceError: string | null;
  history: { record_key: string; action: string; revision: number; created_at: string; document: StudioRecord["document"] }[];
  deliveries: StudioDeliveryAttempt[];
  serverTime: string;
  sourceIntegrationError: string;
};

export async function authorizeStudio() {
  const session = await createClient();
  if (!session) return null;
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !studioUserCanReview(user, isOwnerEmail)) return null;
  return user!.id;
}

export function currentStudioMedia(artId: string, placement: StudioPlacement) {
  const art = STUDIO_CATALOG.find((item) => item.id === artId);
  if (!art || !studioSurfacesForArt(art).some((surface) => surface.placement === placement)) return null;
  return STUDIO_MEDIA.filter((media) => media.artId === artId && media.placement === placement).at(-1) ?? null;
}

export function studioMediaView(media: StudioMedia, inspection?: { previewAvailable?: boolean; loopReviewed: boolean; eyes: StudioEyesSeal }): StudioMediaView {
  const { snapshotPath: _snapshotPath, ...provenance } = media.provenance;
  void _snapshotPath;
  return { identity: studioMediaIdentity(media), version: media.version, sha256: media.sha256,
    width: media.width, height: media.height, durationSeconds: media.durationSeconds, caption: media.caption, captions: media.captions, provenance,
    previewAvailable: !!inspection?.previewAvailable, reviewReady: !!inspection?.loopReviewed && studioEyesApproved(inspection.eyes),
    eyes: inspection?.eyes ?? studioEyesSeal(null, media, Date.now()),
    url: `/api/admin/social-publications/studio/video?artId=${encodeURIComponent(media.artId)}&placement=${media.placement}&identity=${encodeURIComponent(studioMediaIdentity(media))}` };
}

function persistenceMessage(error: { message: string; code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /schema cache|does not exist|Could not find/i.test(error?.message ?? "")
    ? "Persistência do Studio indisponível. Confira a instalação autorizada da migração e reconcilie o histórico antes de repetir uma alteração sem confirmação."
    : "Não foi possível ler a persistência do Studio. Alterações bloqueadas; tente novamente após verificar o serviço.";
}

export async function readStudioSnapshot(): Promise<StudioSnapshot> {
  const snapshot: StudioSnapshot = { records: [], media: {}, writable: false, persistenceError: null, history: [], deliveries: [], serverTime: new Date().toISOString(), sourceIntegrationError: STUDIO_OFFICIAL_SOURCE_BLOCK };
  let previewStorage: ReturnType<typeof createStudioReviewStorageFromEnvironment> = null;
  try { previewStorage = createStudioReviewStorageFromEnvironment(); } catch { /* QA boundary remains fail-closed below. */ }
  for (const art of STUDIO_CATALOG) for (const placement of new Set(studioSurfacesForArt(art).map((surface) => surface.placement))) {
    const media = currentStudioMedia(art.id, placement);
    if (!media) { snapshot.media[`${art.id}:${placement}`] = { current: null, error: null }; continue; }
    try {
      validateStudioMedia(media);
      validateStudioOfficialDeclaration(media);
      snapshot.media[`${art.id}:${placement}`] = { current: studioMediaView(media), error: "Candidato registrado; vídeo ainda não verificado." };
      if (!previewStorage) throw new Error("TL_STUDIO_STORAGE_UNAVAILABLE");
      await previewStorage.probeExact(media);
      const view = studioMediaView(media, { previewAvailable: true, loopReviewed: false, eyes: studioEyesSeal(null, media, Date.now()) });
      const issues = [!studioProvenanceCurrent(media.provenance, Date.now()) ? "Dados da amostra expirados." : "", STUDIO_OFFICIAL_SOURCE_BLOCK].filter(Boolean);
      snapshot.media[`${art.id}:${placement}`] = { current: view, error: issues.join(" ") };
    } catch {
      snapshot.media[`${art.id}:${placement}`] = { current: snapshot.media[`${art.id}:${placement}`]?.current ?? null, error: "O vídeo privado registrado não está disponível ou não corresponde ao manifesto imutável. Aprovação bloqueada." };
    }
  }
  try { assertTouchlineSocialQaRuntime(); } catch {
    snapshot.persistenceError = "Revisão persistente restrita ao ambiente QA verificado. Nenhuma publicação está habilitada.";
    return snapshot;
  }
  const admin = createAdminClient();
  if (!admin) { snapshot.persistenceError = "Persistência protegida não configurada."; return snapshot; }
  const capabilities = await admin.rpc("touchline_social_studio_capabilities");
  if (capabilities.error || capabilities.data?.schemaVersion !== 3 || capabilities.data?.reviewEvidence !== "SERVER_TIMED") { snapshot.persistenceError = "Mesa de revisão segura ainda não instalada no QA. Aprovações exigem evidência de reprodução medida pelo servidor; confira o histórico antes de repetir pedidos sem confirmação."; return snapshot; }
  const [records, history, deliveries] = await Promise.all([
    admin.from("touchline_social_studio_records").select("record_key,revision,document,updated_at").limit(200),
    admin.from("touchline_social_studio_history").select("record_key,action,revision,created_at,document").order("created_at", { ascending: false }).limit(100),
    admin.from("touchline_social_studio_deliveries").select("id,record_key,instance_id,platform,account_id,placement,media_identity,revision,state,receipt_id,error,retryable,source_current,source_valid_until,attempt_count,last_attempt_at,retry_requested_at").order("last_attempt_at", { ascending: false, nullsFirst: false }).limit(200),
  ]);
  if (records.error || history.error || deliveries.error) { snapshot.persistenceError = persistenceMessage(records.error ?? history.error ?? deliveries.error); return snapshot; }
  const keys = new Set(STUDIO_CATALOG.flatMap((art) => studioSurfacesForArt(art).map((surface) => studioRecordKey(art.id, surface.platform, surface.placement))));
  snapshot.records = (records.data ?? []).filter((row) => keys.has(row.record_key)) as StudioRecord[];
  snapshot.history = history.data ?? [];
  snapshot.deliveries = (deliveries.data ?? []).filter((row) => keys.has(row.record_key)) as StudioDeliveryAttempt[];
  snapshot.writable = true;
  return snapshot;
}

export async function saveStudioAction(action: StudioAction, actorId: string) {
  assertTouchlineSocialQaRuntime();
  const admin = createAdminClient();
  if (!admin) throw new Error("PERSISTENCE_UNAVAILABLE");
  return orchestrateStudioSave(action, actorId, {
    findReceipt: async (requestId) => {
      const receipt = await admin.from("touchline_social_studio_history")
        .select("request_id,record_key,actor_id,request_checksum,action,revision,document,created_at")
        .eq("request_id", requestId).maybeSingle();
      if (receipt.error) throw new Error("PERSISTENCE_UNAVAILABLE");
      return receipt.data as StudioSaveReceipt | null;
    },
    prepareDocument: async ({ recordKey }) => {
      const stored = await admin.from("touchline_social_studio_records").select("record_key,revision,document,updated_at").eq("record_key", recordKey).maybeSingle();
      if (stored.error) throw new Error("PERSISTENCE_UNAVAILABLE");
      let delivery: StudioDeliveryAttempt | null = null;
      if (action.action === "request-retry") {
        const result = await admin.from("touchline_social_studio_deliveries").select("*").eq("id", action.deliveryId).maybeSingle();
        if (result.error) throw new Error("PERSISTENCE_UNAVAILABLE");
        delivery = result.data as StudioDeliveryAttempt | null;
      }
      // A retry revalidates its own immutable version, never an unrelated newer Feed/Story.
      const manifest = action.action === "request-retry"
        ? STUDIO_MEDIA.find(item => item.artId === action.artId && item.placement === action.placement && studioMediaIdentity(item) === delivery?.media_identity) ?? null
        : currentStudioMedia(action.artId, action.placement);
      const media = action.action === "save-plan" || !manifest ? null : { identity: studioMediaIdentity(manifest), manifest };
      return prepareStudioSourceCheckedAction(stored.data?.document ?? emptyStudioDocument(), action, media, delivery, Date.now(), {
        verifyArtifact: (candidate, now) => verifyStudioArtifact(candidate, process.cwd(), now),
        verifySource: verifyStudioOfficialSource,
      });
    },
    commit: async (document, { recordKey, requestChecksum }) => {
      // The transaction retains its revision fence and resolves any concurrent request-ID race.
      const result = await admin.rpc("touchline_social_studio_save_v3", {
        p_record_key: recordKey, p_expected_revision: action.expectedRevision, p_document: document,
        p_actor_id: actorId, p_request_id: action.requestId, p_request_checksum: requestChecksum, p_action: action.action,
        p_delivery_id: action.action === "request-retry" ? action.deliveryId : null,
        p_expected_delivery_revision: action.action === "request-retry" ? action.expectedDeliveryRevision : null,
        p_review_session_id: action.action === "approve-artwork" || action.action === "approve-caption" ? action.reviewSessionId : null,
        p_review_media_identity: action.action === "approve-artwork" || action.action === "approve-caption" ? action.mediaIdentity : null,
      });
      if (result.error) {
        if (result.error.code === "40001") throw new Error("REVISION_CONFLICT");
        if (result.error.code === "22023" && /TL_STUDIO_SERVER_REVIEW_REQUIRED/.test(result.error.message)) throw new Error("REVIEW_EVIDENCE_REQUIRED");
        if (result.error.code === "22023" && action.action === "request-retry") throw new Error("DELIVERY_NOT_RETRYABLE");
        if (result.error.code === "22023") throw new Error("INVALID_STUDIO_MUTATION");
        throw new Error("PERSISTENCE_UNAVAILABLE");
      }
      return result.data as StudioRecord;
    },
  });
}

export async function startStudioReviewEvidence(input: { sessionId: string; artId: string; platform: string; placement: StudioPlacement; mediaIdentity: string; expectedRevision: number }, actorId: string) {
  assertTouchlineSocialQaRuntime();
  const media = currentStudioMedia(input.artId, input.placement);
  if (!media || studioMediaIdentity(media) !== input.mediaIdentity) throw new Error("CURRENT_VIDEO_REQUIRED");
  const storage = createStudioReviewStorageFromEnvironment();
  if (!storage) throw new Error("REVIEW_SESSION_UNAVAILABLE");
  await storage.readExact(media);
  const recordKey = studioRecordKey(input.artId, input.platform as never, input.placement);
  const admin = createAdminClient();
  if (!admin) throw new Error("PERSISTENCE_UNAVAILABLE");
  const result = await admin.rpc("touchline_social_studio_review_start", {
    p_session_id: input.sessionId, p_actor_id: actorId, p_record_key: recordKey,
    p_record_revision: input.expectedRevision, p_media_identity: input.mediaIdentity, p_media_duration_seconds: media.durationSeconds,
  });
  if (result.error) throw new Error("REVIEW_SESSION_UNAVAILABLE");
  return result.data as { id: string; completed_loops: number };
}

export async function tickStudioReviewEvidence(sessionId: string, actorId: string) {
  assertTouchlineSocialQaRuntime();
  const admin = createAdminClient();
  if (!admin) throw new Error("PERSISTENCE_UNAVAILABLE");
  const result = await admin.rpc("touchline_social_studio_review_tick", { p_session_id: sessionId, p_actor_id: actorId });
  if (result.error) throw new Error("REVIEW_SESSION_UNAVAILABLE");
  return result.data as { id: string; completed_loops: number };
}

export async function invalidateStudioReviewEvidence(sessionId: string, actorId: string) {
  assertTouchlineSocialQaRuntime();
  const admin = createAdminClient();
  if (!admin) throw new Error("PERSISTENCE_UNAVAILABLE");
  const result = await admin.rpc("touchline_social_studio_review_invalidate", { p_session_id: sessionId, p_actor_id: actorId });
  if (result.error) throw new Error("REVIEW_SESSION_UNAVAILABLE");
}
