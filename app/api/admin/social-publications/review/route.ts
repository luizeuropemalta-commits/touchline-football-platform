import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { touchlineSocialExecutorHealth } from "@/lib/touchlineArena/social-draft-executor-health";
import { readTouchlineSocialLineupDraft } from "@/lib/touchlineArena/social-lineup-draft-server";
import { readTouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";
import { readTouchlineSocialFinalScoreDraft } from "@/lib/touchlineArena/social-final-score-draft-server";
import { readTouchlineSocialConfirmedEventDraft } from "@/lib/touchlineArena/social-confirmed-event-draft-server";
import { readTouchlineSocialRankingFamilyDraft } from "@/lib/touchlineArena/social-ranking-family-draft-server";
import {
  assertTouchlineSocialQaRuntime,
  createTouchlineSocialArtifactStorageFromEnvironment,
} from "@/lib/touchlineArena/social-artifact-storage-server";
import { verifyTouchlineSocialStoredArtifact } from "@/lib/touchlineArena/social-publication-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const RANKING_CONTENT_TYPES = [
  "GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL",
  "GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO",
] as const;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTouchlineSocialQaRuntime();
  } catch {
    return response({ error: "Social review is restricted to the verified QA runtime." }, 404);
  }
  if (!sameOrigin(request)) return response({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return response({ error: "Protected social review is not configured." }, 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email) || !user?.id) {
    return response({ error: "Owner access required." }, 403);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const draftId = typeof body?.draftId === "string" ? body.draftId.toLowerCase() : "";
  const expectedChecksum = typeof body?.expectedChecksum === "string" ? body.expectedChecksum : "";
  const expectedManifestChecksum = typeof body?.expectedManifestChecksum === "string" ? body.expectedManifestChecksum : "";
  if (
    !UUID.test(draftId)
    || !SHA256.test(expectedChecksum)
    || !SHA256.test(expectedManifestChecksum)
    || !["approve-artwork", "approve-caption"].includes(action)
  ) return response({ error: "A valid immutable draft review is required." }, 400);

  const { data: draft, error: draftError } = await admin
    .from("touchline_social_publication_drafts")
    .select("id,fixture_provider_id,team_provider_id,event_provider_id,scope_provider_id,subject_player_provider_id,content_type,template_version,source_version,source_checksum,source_revision_manifest,source_revision_checksum,input_checksum,source_snapshot_at,approval_state,artwork_approval_state,caption_approval_state,artifact_checksum,caption_checksum,manifest_checksum,artifact_storage_provider,artifact_storage_bucket,artifact_storage_key,artifact_etag,artifact_content_type,artifact_byte_length,width,height")
    .eq("id", draftId)
    .maybeSingle();
  if (draftError) {
    const missing = /does not exist|schema cache|Could not find the table/i.test(draftError.message);
    return response({ error: missing ? "The approval-only social outbox is not applied in QA yet." : "The social draft could not be read." }, missing ? 503 : 500);
  }
  if (!draft || draft.approval_state === "CANCELLED") return response({ error: "The draft is not reviewable." }, 409);
  if (draft.manifest_checksum !== expectedManifestChecksum) return response({ error: "The draft manifest changed; review the current revision again." }, 409);

  const artwork = action === "approve-artwork";
  const currentChecksum = artwork ? draft.artifact_checksum : draft.caption_checksum;
  const currentState = artwork ? draft.artwork_approval_state : draft.caption_approval_state;
  if (currentChecksum !== expectedChecksum) return response({ error: "The reviewed content changed; review the current revision again." }, 409);
  if (currentState === "APPROVED") return response({ error: artwork ? "Artwork is already approved." : "Caption is already approved." }, 409);
  if (!["LINEUP", "MATCH_PREVIEW", "FULL_TIME", "FINAL_SCORE", "GOAL_CONFIRMED", "RED_CARD_CONFIRMED",
    ...RANKING_CONTENT_TYPES].includes(String(draft.content_type))) {
    return response({ error: "This content type is not enabled for approval yet." }, 409);
  }
  const sourceIsCurrent = async () => {
    const rankingType = RANKING_CONTENT_TYPES.find((value) => value === draft.content_type);
    const currentSource = rankingType
      ? await readTouchlineSocialRankingFamilyDraft({
        contentType: rankingType,
        fixtureId: draft.fixture_provider_id,
        scopeId: typeof draft.scope_provider_id === "string" ? draft.scope_provider_id : null,
        playerId: typeof draft.subject_player_provider_id === "string" ? draft.subject_player_provider_id : null,
      })
      : draft.content_type === "MATCH_PREVIEW"
      ? await readTouchlineSocialMatchPreviewDraft({ fixtureId: draft.fixture_provider_id })
      : draft.content_type === "GOAL_CONFIRMED" || draft.content_type === "RED_CARD_CONFIRMED"
        ? await readTouchlineSocialConfirmedEventDraft(
          draft.fixture_provider_id,
          String(draft.event_provider_id ?? ""),
        )
      : draft.content_type === "FULL_TIME" || draft.content_type === "FINAL_SCORE"
        ? await readTouchlineSocialFinalScoreDraft(draft.fixture_provider_id)
        : typeof draft.team_provider_id === "string"
        ? await readTouchlineSocialLineupDraft({
          fixtureId: draft.fixture_provider_id,
          teamId: draft.team_provider_id,
        })
        : null;
    if (!currentSource) return false;
    return currentSource.ok
      && currentSource.data.sourceVersion === draft.source_version
      && currentSource.data.sourceChecksum === draft.source_checksum
      && currentSource.data.sourceRevisionChecksum === draft.source_revision_checksum
      && currentSource.data.sourceChecksum === draft.input_checksum;
  };
  if (!await sourceIsCurrent()) {
    return response({ error: "The canonical match data changed; generate and review the current revision." }, 409);
  }
  if (draft.content_type === "LINEUP") {
    const { data: generation, error: generationError } = await admin
      .from("touchline_social_generation_reviews")
      .select("review_state,generated_draft_id")
      .eq("fixture_provider_id", draft.fixture_provider_id)
      .eq("team_provider_id", draft.team_provider_id)
      .eq("content_type", "LINEUP")
      .eq("template_version", draft.template_version)
      .maybeSingle();
    if (generationError) return response({ error: "The current generation state could not be verified." }, 500);
    if (generation?.review_state !== "GENERATED" || generation.generated_draft_id !== draft.id) {
      return response({ error: "A newer or blocked official team sheet invalidated this draft." }, 409);
    }
    const { data: executorCycles, error: executorCyclesError } = await admin
      .from("touchline_social_executor_cycles")
      .select("component,lease_token,lease_expires_at,next_eligible_at,consecutive_failures,run_count,completed_count,timeout_recovery_count,last_started_at,last_completed_at,last_success_at,last_failure_at,last_outcome,last_error_code,last_items_processed")
      .in("component", ["SCHEDULER", "RUNNER"]);
    const executorHealth = touchlineSocialExecutorHealth(executorCycles ?? []);
    if (executorCyclesError || !executorHealth.operational) {
      return response({ error: "The automatic DRAFT executor is not healthy; approval remains blocked." }, 409);
    }
    const { data: generationJob, error: generationJobError } = await admin
      .from("touchline_social_generation_jobs")
      .select("id")
      .eq("fixture_provider_id", draft.fixture_provider_id)
      .eq("team_provider_id", draft.team_provider_id)
      .eq("content_type", "LINEUP")
      .eq("template_version", draft.template_version)
      .eq("input_checksum", draft.input_checksum)
      .eq("source_revision_checksum", draft.source_revision_checksum)
      .eq("job_state", "COMPLETED")
      .eq("generated_draft_id", draft.id)
      .maybeSingle();
    if (generationJobError || !generationJob) {
      return response({ error: "The exact automatic DRAFT job is not complete; approval remains blocked." }, 409);
    }
    const { data: cycle, error: cycleError } = await admin
      .from("touchline_social_generation_cycles")
      .select("lease_token,consecutive_failures,last_completed_at,last_outcome")
      .eq("lease_name", "lineup-draft-watcher")
      .maybeSingle();
    const lastCompletedAt = Date.parse(String(cycle?.last_completed_at ?? ""));
    if (cycleError
      || cycle?.lease_token
      || cycle?.last_outcome !== "SUCCESS"
      || Number(cycle?.consecutive_failures ?? 1) !== 0
      || !Number.isFinite(lastCompletedAt)
      || Date.now() - lastCompletedAt > 120_000) {
      return response({ error: "The automatic source verifier is not healthy; approval remains blocked." }, 409);
    }
  }

  if (artwork) {
    const contentType = draft.artifact_content_type === "image/png" || draft.artifact_content_type === "image/jpeg"
      ? draft.artifact_content_type
      : null;
    const height = draft.height === 1350 || draft.height === 1920 ? draft.height : null;
    if (draft.artifact_storage_provider !== "SUPABASE_STORAGE"
      || draft.artifact_storage_bucket !== "touchline-social-drafts"
      || typeof draft.artifact_storage_key !== "string"
      || (draft.artifact_etag !== null && typeof draft.artifact_etag !== "string")
      || !contentType
      || draft.width !== 1080
      || !height
      || !Number.isSafeInteger(Number(draft.artifact_byte_length))) {
      return response({ error: "The immutable artwork identity is invalid." }, 409);
    }
    let storage;
    try {
      storage = createTouchlineSocialArtifactStorageFromEnvironment();
    } catch {
      return response({ error: "The QA artwork boundary is not configured safely." }, 503);
    }
    if (!storage) return response({ error: "Private artwork verification is not configured." }, 503);
    const verified = await verifyTouchlineSocialStoredArtifact({
      artifactReader: storage,
      artifactLocator: {
        storageProvider: "SUPABASE_STORAGE",
        bucket: "touchline-social-drafts",
        objectKey: draft.artifact_storage_key,
        etag: draft.artifact_etag,
      },
      artifactMimeType: contentType,
      artifactByteLength: Number(draft.artifact_byte_length),
      artifactChecksum: draft.artifact_checksum,
      width: 1080,
      height,
    });
    if (!verified.ok) {
      return response({ error: "The exact private artwork could not be verified. Approval remains blocked." }, 409);
    }
  }

  // Re-read after the potentially slower private-byte verification. The DB
  // intent then locks the exact persisted fixture revision and current
  // generation before the owner consumes the one-use capability.
  if (!await sourceIsCurrent()) {
    return response({ error: "The canonical match data changed during review; approval remains blocked." }, 409);
  }

  const intentRpc = draft.content_type === "MATCH_PREVIEW"
    ? "touchline_social_041_issue_review_intent"
    : RANKING_CONTENT_TYPES.includes(draft.content_type as typeof RANKING_CONTENT_TYPES[number])
      ? "touchline_social_044_issue_review_intent"
    : draft.content_type === "GOAL_CONFIRMED" || draft.content_type === "RED_CARD_CONFIRMED"
      ? "touchline_social_043_issue_review_intent"
    : draft.content_type === "FULL_TIME" || draft.content_type === "FINAL_SCORE"
      ? "touchline_social_042_issue_review_intent"
      : "touchline_social_issue_review_intent";
  // Intent issuance is a server-side attestation after the private artifact
  // bytes and current semantic revision have been reverified. Authenticated
  // callers can consume their owner-bound one-use intent, but cannot mint it.
  // This also preserves the frozen 039/040 LINEUP service-role boundary.
  const { data: intentData, error: intentError } = await admin.rpc(intentRpc, {
    p_draft_id: draftId,
    p_review_kind: artwork ? "ARTWORK" : "CAPTION",
    p_expected_content_checksum: expectedChecksum,
    p_expected_manifest_checksum: expectedManifestChecksum,
    p_expected_source_checksum: draft.source_checksum,
    p_expected_source_revision_checksum: draft.source_revision_checksum,
    p_actor_id: user.id,
  });
  const intentId = String((intentData as { intentId?: unknown } | null)?.intentId ?? "").toLowerCase();
  if (intentError || !UUID.test(intentId)) {
    return response({ error: "The current review attestation was rejected." }, 409);
  }

  const independentApproval = draft.content_type === "MATCH_PREVIEW"
    || draft.content_type === "FULL_TIME" || draft.content_type === "FINAL_SCORE"
    || draft.content_type === "GOAL_CONFIRMED" || draft.content_type === "RED_CARD_CONFIRMED"
    || RANKING_CONTENT_TYPES.includes(draft.content_type as typeof RANKING_CONTENT_TYPES[number]);
  const rpcName = draft.content_type === "MATCH_PREVIEW"
    ? "touchline_social_041_approve"
    : RANKING_CONTENT_TYPES.includes(draft.content_type as typeof RANKING_CONTENT_TYPES[number])
      ? "touchline_social_044_approve"
    : draft.content_type === "GOAL_CONFIRMED" || draft.content_type === "RED_CARD_CONFIRMED"
      ? "touchline_social_043_approve"
    : draft.content_type === "FULL_TIME" || draft.content_type === "FINAL_SCORE"
      ? "touchline_social_042_approve"
      : artwork ? "touchline_social_approve_artwork" : "touchline_social_approve_caption";
  const rpcArgs = independentApproval ? {
    p_intent_id: intentId,
    p_draft_id: draftId,
    p_review_kind: artwork ? "ARTWORK" : "CAPTION",
    p_expected_content_checksum: expectedChecksum,
    p_expected_manifest_checksum: expectedManifestChecksum,
    p_expected_source_checksum: draft.source_checksum,
    p_expected_source_revision_checksum: draft.source_revision_checksum,
    p_actor_id: user.id,
  } : artwork ? {
    p_intent_id: intentId,
    p_draft_id: draftId,
    p_expected_artifact_checksum: expectedChecksum,
    p_expected_manifest_checksum: expectedManifestChecksum,
    p_expected_source_checksum: draft.source_checksum,
    p_expected_source_revision_checksum: draft.source_revision_checksum,
    p_approved_by: user.id,
  } : {
    p_intent_id: intentId,
    p_draft_id: draftId,
    p_expected_caption_checksum: expectedChecksum,
    p_expected_manifest_checksum: expectedManifestChecksum,
    p_expected_source_checksum: draft.source_checksum,
    p_expected_source_revision_checksum: draft.source_revision_checksum,
    p_approved_by: user.id,
  };
  const { data, error } = await supabase.rpc(rpcName, rpcArgs);
  if (error) return response({ error: "The immutable review transition was rejected." }, 409);
  return response({ ok: true, review: artwork ? "ARTWORK" : "CAPTION", result: data });
}
