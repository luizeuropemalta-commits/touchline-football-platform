import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createTouchlineSocialArtifactStorageCore } from "../../lib/touchlineArena/social-artifact-storage-core.ts";
import {
  touchlineSocialAutoDeliveryIdempotencyKey,
  type TouchlineSocialTemplateIdentity,
} from "../../lib/touchlineArena/social-template-policy-contract.ts";
import { readTouchlineSocialTemplateRegistry } from "../../lib/touchlineArena/social-template-policy-server.ts";
import { verifyTouchlineSocialStoredArtifact } from "../../lib/touchlineArena/social-publication-contract.ts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const RPC_TIMEOUT_MS = 15_000;
const HEARTBEAT_MS = 30_000;

type CycleComponent = "REGISTRY" | "EVALUATOR";
type DraftRow = Readonly<{
  id: string;
  revision: number;
  content_type: string;
  placement: string;
  locale: string;
  width: number;
  height: number;
  template_version: string;
  source_revision_checksum: string;
  manifest_checksum: string;
  artifact_checksum: string;
  caption_checksum: string;
  artifact_storage_provider: string;
  artifact_storage_bucket: string;
  artifact_storage_key: string;
  artifact_etag: string | null;
  artifact_content_type: string;
  artifact_byte_length: number;
  approval_state: string;
  created_at: string;
}>;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

export function assertTouchlineTemplatePolicyQaBoundary(environment = process.env) {
  const projectRef = environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF?.trim() ?? "";
  const supabaseUrl = new URL(environment.SUPABASE_URL?.trim()
    || environment.NEXT_PUBLIC_SUPABASE_URL?.trim() || "invalid://missing");
  const serviceRole = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (environment.VERCEL_ENV === "production"
    || environment.TOUCHLINE_SOCIAL_TEMPLATE_POLICY_EXECUTOR_ENABLED !== "true"
    || projectRef !== QA_PROJECT_REF
    || supabaseUrl.toString() !== `https://${QA_PROJECT_REF}.supabase.co/`
    || serviceRole.length < 32) {
    throw new Error("TL_SOCIAL_TEMPLATE_POLICY_QA_BOUNDARY_MISMATCH");
  }
  return { projectRef, supabaseUrl: supabaseUrl.toString(), serviceRole };
}

function safeCode(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_:-]{1,160}$/.test(code) ? code : fallback;
}

async function withTimeout<T>(operation: PromiseLike<T>, code: string) {
  const abortable = operation as unknown as { abortSignal?: (signal: AbortSignal) => PromiseLike<T> };
  const controller = new AbortController();
  const pending = typeof abortable.abortSignal === "function" ? abortable.abortSignal(controller.signal) : operation;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve(pending),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error(code)); }, RPC_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function claimCycle(admin: SupabaseClient, component: CycleComponent) {
  const { data, error } = await withTimeout(admin.rpc("touchline_social_046_claim_cycle", { p_component: component }),
    "TL_SOCIAL_TEMPLATE_POLICY_CYCLE_CLAIM_TIMEOUT");
  const payload = data as Record<string, unknown> | null;
  if (error) throw new Error("TL_SOCIAL_TEMPLATE_POLICY_CYCLE_CLAIM_FAILED");
  if (payload?.outcome !== "claimed") return { outcome: String(payload?.outcome ?? "skipped") } as const;
  const leaseToken = String(payload.leaseToken ?? "");
  if (!UUID.test(leaseToken)) throw new Error("TL_SOCIAL_TEMPLATE_POLICY_CYCLE_CLAIM_INVALID");
  return { outcome: "claimed" as const, leaseToken };
}

async function renewCycle(admin: SupabaseClient, component: CycleComponent, token: string) {
  const { data, error } = await withTimeout(admin.rpc("touchline_social_046_renew_cycle", {
    p_component: component, p_lease_token: token,
  }), "TL_SOCIAL_TEMPLATE_POLICY_CYCLE_RENEW_TIMEOUT");
  if (error || (data as Record<string, unknown> | null)?.outcome !== "renewed") {
    throw new Error("TL_SOCIAL_TEMPLATE_POLICY_CYCLE_RENEW_FAILED");
  }
}

async function completeCycle(admin: SupabaseClient, component: CycleComponent, token: string,
  outcome: "SUCCESS" | "FAILURE", items: number, errorCode: string | null) {
  const { error } = await withTimeout(admin.rpc("touchline_social_046_complete_cycle", {
    p_component: component, p_lease_token: token, p_outcome: outcome,
    p_error_code: errorCode, p_items: items,
  }), "TL_SOCIAL_TEMPLATE_POLICY_CYCLE_COMPLETE_TIMEOUT");
  if (error) throw new Error("TL_SOCIAL_TEMPLATE_POLICY_CYCLE_COMPLETE_FAILED");
}

function heartbeat(admin: SupabaseClient, component: CycleComponent, token: string) {
  let stopped = false;
  let failure: Error | null = null;
  let inflight: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (stopped || failure || inflight) return;
    inflight = renewCycle(admin, component, token)
      .catch((error) => { failure = error instanceof Error ? error : new Error("TL_SOCIAL_TEMPLATE_POLICY_CYCLE_RENEW_FAILED"); })
      .finally(() => { inflight = null; });
  }, HEARTBEAT_MS);
  timer.unref?.();
  return {
    assert() { if (failure) throw failure; },
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (inflight) await inflight;
      if (failure) throw failure;
    },
  };
}

function templateForDraft(registry: readonly TouchlineSocialTemplateIdentity[], draft: DraftRow) {
  return registry.find((template) => template.contentType === draft.content_type
    && template.placement === draft.placement && template.locale === draft.locale
    && template.width === draft.width && template.height === draft.height
    && template.templateVersion === draft.template_version) ?? null;
}

async function readDrafts(admin: SupabaseClient, approvedOnly: boolean) {
  let query = admin.from("touchline_social_publication_drafts")
    .select("id,revision,content_type,placement,locale,width,height,template_version,source_revision_checksum,manifest_checksum,artifact_checksum,caption_checksum,artifact_storage_provider,artifact_storage_bucket,artifact_storage_key,artifact_etag,artifact_content_type,artifact_byte_length,approval_state,created_at")
    .neq("approval_state", "CANCELLED")
    .order("created_at", { ascending: false })
    .range(0, 499);
  if (approvedOnly) query = query.eq("approval_state", "APPROVED");
  const { data, error } = await withTimeout(query.returns<DraftRow[]>(), "TL_SOCIAL_TEMPLATE_POLICY_DRAFT_READ_TIMEOUT");
  if (error) throw new Error("TL_SOCIAL_TEMPLATE_POLICY_DRAFT_READ_FAILED");
  return data ?? [];
}

export async function runTouchlineTemplateRegistry(input: Readonly<{
  admin: SupabaseClient;
  projectRoot?: string;
  registry?: readonly TouchlineSocialTemplateIdentity[];
}>) {
  const claim = await claimCycle(input.admin, "REGISTRY");
  if (claim.outcome !== "claimed") return { outcome: claim.outcome, processed: 0 } as const;
  const pulse = heartbeat(input.admin, "REGISTRY", claim.leaseToken);
  let processed = 0;
  try {
    const registry = input.registry ?? await readTouchlineSocialTemplateRegistry(input.projectRoot);
    const drafts = await readDrafts(input.admin, true);
    for (const template of registry) {
      pulse.assert();
      const exemplar = drafts.find((draft) => templateForDraft([template], draft));
      if (!exemplar) continue;
      await renewCycle(input.admin, "REGISTRY", claim.leaseToken);
      const { error } = await input.admin.rpc("touchline_social_046_register_template", {
        p_template: template, p_exemplar_draft_id: exemplar.id,
      });
      if (error) throw new Error("TL_SOCIAL_TEMPLATE_POLICY_REGISTER_FAILED");
      processed += 1;
    }
    await pulse.stop();
    await completeCycle(input.admin, "REGISTRY", claim.leaseToken, "SUCCESS", processed, null);
    return { outcome: "success", processed } as const;
  } catch (error) {
    const code = safeCode(error, "TL_SOCIAL_TEMPLATE_POLICY_REGISTRY_FAILED");
    await pulse.stop().catch(() => undefined);
    await completeCycle(input.admin, "REGISTRY", claim.leaseToken, "FAILURE", processed, code).catch(() => undefined);
    throw new Error(code);
  }
}

export async function runTouchlineTemplateEvaluator(input: Readonly<{
  admin: SupabaseClient;
  artifactReader: ReturnType<typeof createTouchlineSocialArtifactStorageCore>;
  projectRoot?: string;
  registry?: readonly TouchlineSocialTemplateIdentity[];
  verifyArtifact?: typeof verifyTouchlineSocialStoredArtifact;
}>) {
  const claim = await claimCycle(input.admin, "EVALUATOR");
  if (claim.outcome !== "claimed") return { outcome: claim.outcome, processed: 0 } as const;
  const pulse = heartbeat(input.admin, "EVALUATOR", claim.leaseToken);
  let processed = 0;
  try {
    const registry = input.registry ?? await readTouchlineSocialTemplateRegistry(input.projectRoot);
    const drafts = await readDrafts(input.admin, false);
    for (const draft of drafts) {
      pulse.assert();
      const template = templateForDraft(registry, draft);
      if (!template) continue;
      const contentType = draft.artifact_content_type === "image/png" || draft.artifact_content_type === "image/jpeg"
        ? draft.artifact_content_type : null;
      const height = draft.height === 1350 || draft.height === 1920 ? draft.height : null;
      if (!contentType || draft.artifact_storage_provider !== "SUPABASE_STORAGE"
        || draft.artifact_storage_bucket !== "touchline-social-drafts" || !height
        || !Number.isSafeInteger(draft.artifact_byte_length) || !SHA256.test(draft.artifact_checksum)) {
        continue;
      }
      const verified = await (input.verifyArtifact ?? verifyTouchlineSocialStoredArtifact)({
        artifactReader: input.artifactReader,
        artifactLocator: {
          storageProvider: "SUPABASE_STORAGE", bucket: "touchline-social-drafts",
          objectKey: draft.artifact_storage_key, etag: draft.artifact_etag,
        },
        artifactMimeType: contentType, artifactByteLength: draft.artifact_byte_length,
        artifactChecksum: draft.artifact_checksum, width: 1080, height,
      });
      if (!verified.ok) continue;
      await renewCycle(input.admin, "EVALUATOR", claim.leaseToken);
      const idempotencyKey = touchlineSocialAutoDeliveryIdempotencyKey({
        draftId: draft.id, draftRevision: draft.revision,
        templateIdentityChecksum: template.templateIdentityChecksum,
        sourceRevisionChecksum: draft.source_revision_checksum,
        manifestChecksum: draft.manifest_checksum, artifactChecksum: draft.artifact_checksum,
        captionChecksum: draft.caption_checksum,
      });
      const { error } = await input.admin.rpc("touchline_social_046_evaluate_draft", {
        p_draft_id: draft.id, p_rehashed_artifact_checksum: verified.artifactChecksum,
        p_idempotency_key: idempotencyKey, p_eligible_at: null, p_scheduled_at: null,
      });
      if (error && !/TL_SOCIAL_TEMPLATE_NOT_REGISTERED/.test(error.message)) {
        throw new Error("TL_SOCIAL_TEMPLATE_POLICY_EVALUATE_FAILED");
      }
      processed += error ? 0 : 1;
    }
    await input.admin.rpc("touchline_social_046_reconcile_candidates", { p_limit: 100 });
    await pulse.stop();
    await completeCycle(input.admin, "EVALUATOR", claim.leaseToken, "SUCCESS", processed, null);
    return { outcome: "success", processed, outbound: "disabled" } as const;
  } catch (error) {
    const code = safeCode(error, "TL_SOCIAL_TEMPLATE_POLICY_EVALUATOR_FAILED");
    await pulse.stop().catch(() => undefined);
    await completeCycle(input.admin, "EVALUATOR", claim.leaseToken, "FAILURE", processed, code).catch(() => undefined);
    throw new Error(code);
  }
}

async function main() {
  const mode = argument("mode");
  if (!(["registry", "evaluator"] as const).includes(mode as never)) {
    throw new Error("TL_SOCIAL_TEMPLATE_POLICY_MODE_INVALID");
  }
  const boundary = assertTouchlineTemplatePolicyQaBoundary();
  const admin = createClient(boundary.supabaseUrl, boundary.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = mode === "registry"
    ? await runTouchlineTemplateRegistry({ admin })
    : await runTouchlineTemplateEvaluator({
      admin,
      artifactReader: createTouchlineSocialArtifactStorageCore({
        supabaseUrl: boundary.supabaseUrl, serviceRoleKey: boundary.serviceRole,
      }),
    });
  process.stdout.write(`${JSON.stringify({ service: `touchline-social-template-policy-${mode}`,
    projectRef: boundary.projectRef, ...result, outbound: "disabled" })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ service: "touchline-social-template-policy-046",
      outcome: "failure", code: safeCode(error, "TL_SOCIAL_TEMPLATE_POLICY_FATAL") })}\n`);
    process.exitCode = 1;
  });
}
