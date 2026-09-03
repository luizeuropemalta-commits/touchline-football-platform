import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  discoverTouchlineSocialRankingCandidates,
  type TouchlineSocialRankingContentType,
} from "./touchline-social-ranking-candidates.mts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const STABLE_QA_HOST = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const RENEW_TIMEOUT_MS = 15_000;
const HEARTBEAT_MS = 30_000;
const WORKER_TIMEOUT_MS = 120_000;
const RANKING_CONTENT_TYPES = Object.freeze([
  "GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL",
  "GAMEWEEK_HERO", "TOP_PERFORMER",
] as const);
const TEMPLATE_VERSION = "touchline-social-ranking-feed-v1";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

export function assertTouchlineRankingQaBoundary(environment = process.env) {
  const projectRef = environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF?.trim() ?? "";
  const supabaseUrl = new URL(environment.SUPABASE_URL?.trim()
    || environment.NEXT_PUBLIC_SUPABASE_URL?.trim() || "invalid://missing");
  const base = new URL(environment.TOUCHLINE_QA_BASE_URL?.trim() || "invalid://missing");
  const serviceRole = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const renderSecret = environment.TOUCHLINE_LIVE_SYNC_SECRET?.trim() ?? "";
  if (environment.VERCEL_ENV === "production" || projectRef !== QA_PROJECT_REF
    || supabaseUrl.hostname.split(".", 1)[0] !== QA_PROJECT_REF
    || base.protocol !== "https:" || base.hostname !== STABLE_QA_HOST
    || serviceRole.length < 32 || renderSecret.length < 32) {
    throw new Error("TL_RANKING_EXECUTOR_QA_BOUNDARY_MISMATCH");
  }
  return { projectRef, supabaseUrl: supabaseUrl.toString(), base, serviceRole, renderSecret };
}

function safeCode(error: unknown, fallback: string) {
  return (error instanceof Error ? error.message.split(":", 1)[0] : fallback)
    .replace(/[^A-Z0-9_:-]/gi, "_").toUpperCase().slice(0, 160);
}

async function withDeadline<T>(request: PromiseLike<T>, timeoutCode: string) {
  const abortable = request as unknown as { abortSignal?: (signal: AbortSignal) => PromiseLike<T> };
  const controller = new AbortController();
  const pending = typeof abortable.abortSignal === "function" ? abortable.abortSignal(controller.signal) : request;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(pending),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error(timeoutCode)); }, RENEW_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function claimCycle(admin: SupabaseClient, component: "SCHEDULER" | "RUNNER") {
  const { data, error } = await admin.rpc("touchline_social_044_claim_cycle", { p_component: component });
  const payload = data as Record<string, unknown> | null;
  const outcome = String(payload?.outcome ?? "");
  if (error) throw new Error(`TL_RANKING_${component}_CLAIM_FAILED`);
  if (["busy", "cooldown", "recovered_timeout"].includes(outcome)) return { outcome } as const;
  const leaseToken = String(payload?.leaseToken ?? "");
  if (outcome !== "claimed" || !UUID.test(leaseToken)) throw new Error(`TL_RANKING_${component}_CLAIM_INVALID`);
  return { outcome: "claimed" as const, leaseToken };
}

async function renewCycle(admin: SupabaseClient, component: "SCHEDULER" | "RUNNER", leaseToken: string) {
  const result = await withDeadline(admin.rpc("touchline_social_044_renew_cycle", {
    p_component: component, p_lease_token: leaseToken,
  }), `TL_RANKING_${component}_RENEW_TIMEOUT`);
  if (result.error || (result.data as Record<string, unknown> | null)?.outcome !== "renewed") {
    throw new Error(`TL_RANKING_${component}_RENEW_FAILED`);
  }
}

async function completeCycle(admin: SupabaseClient, component: "SCHEDULER" | "RUNNER",
  leaseToken: string, outcome: "SUCCESS" | "FAILURE", count: number, errorCode: string | null) {
  const { error } = await admin.rpc("touchline_social_044_complete_cycle", {
    p_component: component, p_lease_token: leaseToken, p_outcome: outcome,
    p_error_code: errorCode, p_items_processed: count,
  });
  if (error) throw new Error(`TL_RANKING_${component}_COMPLETE_FAILED`);
}

function heartbeat(admin: SupabaseClient, component: "SCHEDULER" | "RUNNER", leaseToken: string) {
  let failure: Error | null = null;
  let inflight: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (failure || inflight) return;
    inflight = renewCycle(admin, component, leaseToken)
      .catch((error) => { failure = error instanceof Error ? error : new Error("TL_RANKING_RENEW_FAILED"); })
      .finally(() => { inflight = null; });
  }, HEARTBEAT_MS);
  timer.unref?.();
  return {
    assert() { if (failure) throw failure; },
    async stop() { clearInterval(timer); if (inflight) await inflight; if (failure) throw failure; },
  };
}

export async function runTouchlineRankingScheduler(input: Readonly<{
  admin: SupabaseClient;
  base: URL;
  renderSecret: string;
  explicitContentType?: string | null;
  explicitFixtureId?: string | null;
  explicitScopeId?: string | null;
  explicitPlayerId?: string | null;
  discover?: typeof discoverTouchlineSocialRankingCandidates;
}>) {
  const claim = await claimCycle(input.admin, "SCHEDULER");
  if (claim.outcome !== "claimed") return { outcome: claim.outcome, processed: 0 } as const;
  const pulse = heartbeat(input.admin, "SCHEDULER", claim.leaseToken);
  let processed = 0;
  try {
    const candidates = await (input.discover ?? discoverTouchlineSocialRankingCandidates)({
      admin: input.admin, base: input.base, renderSecret: input.renderSecret,
      explicitContentType: input.explicitContentType,
      explicitFixtureId: input.explicitFixtureId, explicitScopeId: input.explicitScopeId,
      explicitPlayerId: input.explicitPlayerId,
    });
    pulse.assert();
    for (const candidate of candidates) {
      await renewCycle(input.admin, "SCHEDULER", claim.leaseToken);
      const { data, error } = await input.admin.rpc("touchline_social_044_enqueue_job", {
        p_scheduler_lease_token: claim.leaseToken,
        p_fixture_provider_id: candidate.fixtureId,
        p_scope_provider_id: candidate.scopeId,
        p_subject_player_provider_id: candidate.playerId,
        p_content_type: candidate.contentType,
        p_template_version: TEMPLATE_VERSION,
        p_first_observed_at: candidate.firstObservedAt,
        p_starts_at: candidate.startsAt,
        p_input_checksum: candidate.inputChecksum,
        p_source_revision_manifest: candidate.sourceRevisionManifest,
        p_source_revision_checksum: candidate.sourceRevisionChecksum,
      });
      if (error || !UUID.test(String((data as Record<string, unknown> | null)?.jobId ?? ""))) {
        throw new Error("TL_RANKING_SCHEDULER_ENQUEUE_FAILED");
      }
      processed += 1;
    }
    await pulse.stop();
    await completeCycle(input.admin, "SCHEDULER", claim.leaseToken, "SUCCESS", processed, null);
    return { outcome: "success", processed } as const;
  } catch (error) {
    const code = safeCode(error, "TL_RANKING_SCHEDULER_FAILED");
    await pulse.stop().catch(() => undefined);
    await completeCycle(input.admin, "SCHEDULER", claim.leaseToken, "FAILURE", processed, code).catch(() => undefined);
    throw new Error(code);
  }
}

type ClaimedJob = Readonly<{
  jobId: string;
  leaseToken: string;
  fixtureId: string;
  scopeId: string | null;
  playerId: string | null;
  contentType: TouchlineSocialRankingContentType;
  templateVersion: string;
  inputChecksum: string;
  sourceRevisionChecksum: string;
}>;

async function claimJob(admin: SupabaseClient, runnerLeaseToken: string): Promise<ClaimedJob | null> {
  const { data, error } = await admin.rpc("touchline_social_044_claim_job", { p_runner_lease_token: runnerLeaseToken });
  const payload = data as Record<string, unknown> | null;
  if (error) throw new Error("TL_RANKING_RUNNER_JOB_CLAIM_FAILED");
  if (payload?.outcome === "empty") return null;
  const job = {
    jobId: String(payload?.jobId ?? ""), leaseToken: String(payload?.leaseToken ?? ""),
    fixtureId: String(payload?.fixtureId ?? ""),
    scopeId: payload?.scopeId == null ? null : String(payload.scopeId),
    playerId: payload?.playerId == null ? null : String(payload.playerId),
    contentType: String(payload?.contentType ?? "") as TouchlineSocialRankingContentType,
    templateVersion: String(payload?.templateVersion ?? ""), inputChecksum: String(payload?.inputChecksum ?? ""),
    sourceRevisionChecksum: String(payload?.sourceRevisionChecksum ?? ""),
  };
  if (payload?.outcome !== "claimed" || !UUID.test(job.jobId) || !UUID.test(job.leaseToken)
    || !/^[1-9]\d{0,19}$/.test(job.fixtureId)
    || !RANKING_CONTENT_TYPES.includes(job.contentType)
    || (["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "GAMEWEEK_HERO"].includes(job.contentType)
      !== Boolean(job.scopeId))
    || (["GAMEWEEK_HERO", "TOP_PERFORMER"].includes(job.contentType)
      !== Boolean(job.playerId))
    || (job.scopeId !== null && !/^[1-9]\d{0,19}$/.test(job.scopeId))
    || (job.playerId !== null && !/^[1-9]\d{0,19}$/.test(job.playerId))
    || TEMPLATE_VERSION !== job.templateVersion
    || !SHA256.test(job.inputChecksum) || !SHA256.test(job.sourceRevisionChecksum)) {
    throw new Error("TL_RANKING_RUNNER_JOB_CLAIM_INVALID");
  }
  return job;
}

async function renewJob(admin: SupabaseClient, runnerLeaseToken: string, job: ClaimedJob) {
  const result = await withDeadline(admin.rpc("touchline_social_044_renew_job", {
    p_runner_lease_token: runnerLeaseToken, p_job_id: job.jobId, p_job_lease_token: job.leaseToken,
  }), "TL_RANKING_RUNNER_JOB_RENEW_TIMEOUT");
  if (result.error || (result.data as Record<string, unknown> | null)?.outcome !== "renewed") {
    throw new Error("TL_RANKING_RUNNER_JOB_RENEW_FAILED");
  }
}

async function completeJob(admin: SupabaseClient, runnerLeaseToken: string, job: ClaimedJob,
  outcome: "COMPLETED" | "REVIEW_REQUIRED" | "RETRY", reason: string, draftId: string | null) {
  const { error } = await admin.rpc("touchline_social_044_complete_job", {
    p_runner_lease_token: runnerLeaseToken, p_job_id: job.jobId,
    p_job_lease_token: job.leaseToken, p_outcome: outcome, p_reason_code: reason,
    p_generated_draft_id: draftId,
  });
  if (error) throw new Error("TL_RANKING_RUNNER_JOB_COMPLETE_FAILED");
}

async function generate(job: ClaimedJob) {
  const generator = fileURLToPath(new URL("./generate-touchline-social-ranking-draft.mts", import.meta.url));
  const child = spawn(process.execPath, ["--experimental-strip-types", generator,
    `--fixture-id=${job.fixtureId}`,
    ...(job.scopeId ? [`--scope-id=${job.scopeId}`] : []),
    ...(job.playerId ? [`--player-id=${job.playerId}`] : []),
    `--content-type=${job.contentType}`,
    `--expected-input-checksum=${job.inputChecksum}`,
    `--expected-source-revision-checksum=${job.sourceRevisionChecksum}`], {
    cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout?.on("data", (chunk) => { stdout = `${stdout}${String(chunk)}`.slice(-16_384); });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, WORKER_TIMEOUT_MS);
  timeout.unref?.();
  const code = await new Promise<number>((resolve) => {
    child.once("error", () => resolve(1)); child.once("exit", (value) => resolve(value ?? 1));
  });
  clearTimeout(timeout);
  if (timedOut) throw new Error("TL_RANKING_GENERATOR_TIMEOUT");
  if (code !== 0) throw new Error("TL_RANKING_GENERATOR_FAILED");
  const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
  const draftId = String(payload.draftId ?? "");
  if (payload.outcome !== "generated" || !UUID.test(draftId)
    || payload.sourceChecksum !== job.inputChecksum
    || payload.sourceRevisionChecksum !== job.sourceRevisionChecksum) {
    throw new Error("TL_RANKING_GENERATOR_RESULT_INVALID");
  }
  return draftId;
}

export async function runTouchlineRankingRunner(input: Readonly<{
  admin: SupabaseClient;
  generate?: typeof generate;
}>) {
  const claim = await claimCycle(input.admin, "RUNNER");
  if (claim.outcome !== "claimed") return { outcome: claim.outcome, processed: 0 } as const;
  let job: ClaimedJob | null = null;
  let pulse: ReturnType<typeof heartbeat> | null = null;
  try {
    job = await claimJob(input.admin, claim.leaseToken);
    if (!job) {
      await completeCycle(input.admin, "RUNNER", claim.leaseToken, "SUCCESS", 0, null);
      return { outcome: "empty", processed: 0 } as const;
    }
    pulse = heartbeat(input.admin, "RUNNER", claim.leaseToken);
    const draftId = await (input.generate ?? generate)(job);
    pulse.assert();
    await renewCycle(input.admin, "RUNNER", claim.leaseToken);
    await renewJob(input.admin, claim.leaseToken, job);
    await pulse.stop();
    await completeJob(input.admin, claim.leaseToken, job, "COMPLETED", "IMMUTABLE_DRAFT_READY", draftId);
    await completeCycle(input.admin, "RUNNER", claim.leaseToken, "SUCCESS", 1, null);
    return { outcome: "completed", processed: 1, jobId: job.jobId, draftId } as const;
  } catch (error) {
    const code = safeCode(error, "TL_RANKING_RUNNER_FAILED");
    await pulse?.stop().catch(() => undefined);
    if (job) await completeJob(input.admin, claim.leaseToken, job, "RETRY", code, null).catch(() => undefined);
    await completeCycle(input.admin, "RUNNER", claim.leaseToken, "FAILURE", 0, code).catch(() => undefined);
    throw new Error(code);
  }
}

async function main() {
  const mode = argument("mode");
  if (!["scheduler", "runner"].includes(mode ?? "")) throw new Error("TL_RANKING_EXECUTOR_MODE_INVALID");
  const boundary = assertTouchlineRankingQaBoundary();
  const admin = createClient(boundary.supabaseUrl, boundary.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = mode === "scheduler"
    ? await runTouchlineRankingScheduler({ admin, base: boundary.base,
      renderSecret: boundary.renderSecret, explicitContentType: argument("content-type"),
      explicitFixtureId: argument("fixture-id"), explicitScopeId: argument("scope-id"),
      explicitPlayerId: argument("player-id") })
    : await runTouchlineRankingRunner({ admin });
  process.stdout.write(`${JSON.stringify({ service: `touchline-ranking-${mode}`,
    projectRef: boundary.projectRef, host: boundary.base.hostname, ...result })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ service: "touchline-ranking-043",
      outcome: "failure", code: safeCode(error, "TL_RANKING_EXECUTOR_FATAL") })}\n`);
    process.exitCode = 1;
  });
}
