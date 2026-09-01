import { NextRequest, NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import {
  assertTouchlineSocialQaRuntime,
  createTouchlineSocialArtifactStorageFromEnvironment,
} from "@/lib/touchlineArena/social-artifact-storage-server";
import { verifyTouchlineSocialStoredArtifact } from "@/lib/touchlineArena/social-publication-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const CONTROL_SCOPE = /^(GLOBAL|CONTENT_TYPE:[A-Z][A-Z0-9_]*)$/;

type ReviewTemplate = {
  id: string;
  width: 1080;
  height: 1350 | 1920;
  templateIdentityChecksum: string;
  visualTemplateChecksum: string;
  baseCopyChecksum: string;
  exemplarManifestChecksum: string;
  exemplarArtifactChecksum: string;
  artifactStorageProvider: string;
  artifactStorageBucket: string;
  artifactStorageKey: string;
  artifactEtag: string | null;
  artifactContentType: "image/png" | "image/jpeg";
  artifactByteLength: number;
  state: string;
  artworkTemplateApprovalState: string;
  captionTemplateApprovalState: string;
};

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}

export async function POST(request: NextRequest) {
  try { assertTouchlineSocialQaRuntime(); } catch {
    return response({ error: "Template policy is restricted to the verified QA runtime." }, 404);
  }
  if (!sameOrigin(request)) return response({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return response({ error: "Protected template policy is not configured." }, 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email) || !user?.id) {
    return response({ error: "Owner access required." }, 403);
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (action === "set-delivery-control") {
    const scopeKey = typeof body?.scopeKey === "string" ? body.scopeKey : "";
    const killSwitchEngaged = body?.killSwitchEngaged;
    const dailyQuota = body?.dailyQuota;
    const minimumGapSeconds = body?.minimumGapSeconds;
    if (!CONTROL_SCOPE.test(scopeKey) || typeof killSwitchEngaged !== "boolean"
      || !(dailyQuota === null || (Number.isInteger(dailyQuota) && Number(dailyQuota) >= 1 && Number(dailyQuota) <= 1_000))
      || !(minimumGapSeconds === null || (Number.isInteger(minimumGapSeconds) && Number(minimumGapSeconds) >= 0 && Number(minimumGapSeconds) <= 86_400))) {
      return response({ error: "A valid delivery control is required." }, 400);
    }
    const { data: controlResult, error: controlError } = await supabase.rpc("touchline_social_046_set_delivery_control", {
      p_scope_key: scopeKey,
      p_kill_switch_engaged: killSwitchEngaged,
      p_daily_quota: dailyQuota,
      p_minimum_gap_seconds: minimumGapSeconds,
      p_actor_id: user.id,
      p_reason_code: killSwitchEngaged ? "OWNER_ENGAGED_KILL_SWITCH" : "OWNER_RELEASED_KILL_SWITCH",
    });
    if (controlError) return response({ error: "The delivery control transition was rejected." }, 409);
    return response({ ok: true, result: controlResult });
  }
  const templateId = typeof body?.templateId === "string" ? body.templateId.toLowerCase() : "";
  const expectedIdentityChecksum = typeof body?.expectedIdentityChecksum === "string" ? body.expectedIdentityChecksum : "";
  const expectedContentChecksum = typeof body?.expectedContentChecksum === "string" ? body.expectedContentChecksum : "";
  if (!UUID.test(templateId) || !SHA256.test(expectedIdentityChecksum)) {
    return response({ error: "A valid immutable template identity is required." }, 400);
  }
  const { data, error } = await admin.rpc("touchline_social_046_read_template_for_review", {
    p_template_id: templateId,
  });
  const template = data as ReviewTemplate | null;
  if (error || !template || template.id !== templateId
    || template.templateIdentityChecksum !== expectedIdentityChecksum) {
    return response({ error: "The current template identity could not be verified." }, 409);
  }

  if (["approve-template-artwork", "approve-template-caption"].includes(action)) {
    const artwork = action === "approve-template-artwork";
    const canonicalContentChecksum = artwork ? template.visualTemplateChecksum : template.baseCopyChecksum;
    if (!SHA256.test(expectedContentChecksum) || expectedContentChecksum !== canonicalContentChecksum) {
      return response({ error: "The reviewed template content changed." }, 409);
    }
    if (artwork) {
      if (template.artifactStorageProvider !== "SUPABASE_STORAGE"
        || template.artifactStorageBucket !== "touchline-social-drafts"
        || ![1350, 1920].includes(template.height)
        || !Number.isSafeInteger(template.artifactByteLength)) {
        return response({ error: "The template exemplar artwork identity is invalid." }, 409);
      }
      const storage = createTouchlineSocialArtifactStorageFromEnvironment();
      if (!storage) return response({ error: "Private artwork verification is unavailable." }, 503);
      const verified = await verifyTouchlineSocialStoredArtifact({
        artifactReader: storage,
        artifactLocator: {
          storageProvider: "SUPABASE_STORAGE", bucket: "touchline-social-drafts",
          objectKey: template.artifactStorageKey, etag: template.artifactEtag,
        },
        artifactMimeType: template.artifactContentType,
        artifactByteLength: template.artifactByteLength,
        artifactChecksum: template.exemplarArtifactChecksum,
        width: 1080,
        height: template.height,
      });
      if (!verified.ok) return response({ error: "The exact template artwork bytes could not be verified." }, 409);
    }
    const reviewKind = artwork ? "ARTWORK" : "CAPTION";
    const { data: intentData, error: intentError } = await admin.rpc("touchline_social_046_issue_template_intent", {
      p_template_id: templateId,
      p_review_kind: reviewKind,
      p_expected_template_identity_checksum: expectedIdentityChecksum,
      p_expected_content_checksum: expectedContentChecksum,
      p_expected_exemplar_manifest_checksum: template.exemplarManifestChecksum,
      p_actor_id: user.id,
    });
    const intentId = String((intentData as { intentId?: unknown } | null)?.intentId ?? "");
    if (intentError || !UUID.test(intentId)) return response({ error: "Template review attestation was rejected." }, 409);
    const { data: approval, error: approvalError } = await supabase.rpc("touchline_social_046_approve_template", {
      p_intent_id: intentId,
      p_template_id: templateId,
      p_review_kind: reviewKind,
      p_expected_template_identity_checksum: expectedIdentityChecksum,
      p_expected_content_checksum: expectedContentChecksum,
      p_expected_exemplar_manifest_checksum: template.exemplarManifestChecksum,
      p_actor_id: user.id,
    });
    if (approvalError) return response({ error: "The immutable template approval was rejected." }, 409);
    return response({ ok: true, result: approval });
  }

  const targetState = action === "enable-auto-publish" ? "AUTO_PUBLISH_ENABLED"
    : action === "pause-template" ? "PAUSED"
    : action === "revoke-template" ? "REVOKED" : null;
  if (!targetState) return response({ error: "Unsupported template policy action." }, 400);
  const { data: stateResult, error: stateError } = await supabase.rpc("touchline_social_046_set_template_state", {
    p_template_id: templateId,
    p_expected_identity_checksum: expectedIdentityChecksum,
    p_target_state: targetState,
    p_actor_id: user.id,
    p_reason_code: targetState === "AUTO_PUBLISH_ENABLED"
      ? "OWNER_ENABLED_APPROVED_TEMPLATE" : targetState === "PAUSED" ? "OWNER_PAUSED_TEMPLATE" : "OWNER_REVOKED_TEMPLATE",
  });
  if (stateError) return response({ error: "The template state transition was rejected." }, 409);
  return response({ ok: true, result: stateResult });
}
