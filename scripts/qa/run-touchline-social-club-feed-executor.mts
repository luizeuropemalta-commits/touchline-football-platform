import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { discoverTouchlineClubSocialFanoutCandidates } from "./touchline-social-club-feed-candidates.mts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEASE_HEARTBEAT_MS = 30_000;
const RPC_TIMEOUT_MS = 15_000;
const RUNNER_LIMIT = 100;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

export function assertTouchlineClubFeedQaBoundary(environment = process.env) {
  const projectRef = environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF?.trim() ?? "";
  const supabaseUrl = new URL(environment.SUPABASE_URL?.trim()
    || environment.NEXT_PUBLIC_SUPABASE_URL?.trim() || "invalid://missing");
  const exactQaHost = `${QA_PROJECT_REF}.supabase.co`;
  const serviceRole = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (environment.VERCEL_ENV === "production"
    || environment.TOUCHLINE_SOCIAL_CLUB_FEED_EXECUTOR_ENABLED !== "true"
    || projectRef !== QA_PROJECT_REF
    || supabaseUrl.protocol !== "https:"
    || supabaseUrl.hostname !== exactQaHost
    || supabaseUrl.port !== ""
    || supabaseUrl.username !== ""
    || supabaseUrl.password !== ""
    || supabaseUrl.pathname !== "/"
    || supabaseUrl.search !== ""
    || supabaseUrl.hash !== ""
    || serviceRole.length < 32) {
    throw new Error("TL_CLUB_FEED_EXECUTOR_QA_BOUNDARY_MISMATCH");
  }
  return { projectRef, supabaseUrl: supabaseUrl.toString(), serviceRole };
}

function safeCode(error: unknown, fallback: string) {
  const value = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_:-]{1,160}$/.test(value) ? value : fallback;
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

async function claimCycle(admin: SupabaseClient, component: "SCHEDULER" | "RUNNER") {
  const { data, error } = await withTimeout(admin.rpc("touchline_social_045_claim_cycle", { p_component: component }),
    "TL_CLUB_FEED_CYCLE_CLAIM_TIMEOUT");
  const payload = data as Record<string, unknown> | null;
  if (error) throw new Error("TL_CLUB_FEED_CYCLE_CLAIM_FAILED");
  if (payload?.outcome !== "claimed") return { outcome: String(payload?.outcome ?? "skipped") } as const;
  const leaseToken = String(payload.leaseToken ?? "");
  if (!UUID.test(leaseToken)) throw new Error("TL_CLUB_FEED_CYCLE_CLAIM_INVALID");
  return { outcome: "claimed" as const, leaseToken };
}

async function renewCycle(admin: SupabaseClient, component: "SCHEDULER" | "RUNNER", token: string) {
  const result = await withTimeout(admin.rpc("touchline_social_045_renew_cycle", {
    p_component: component, p_lease_token: token,
  }), "TL_CLUB_FEED_CYCLE_RENEW_TIMEOUT");
  if (result.error || (result.data as Record<string, unknown> | null)?.outcome !== "renewed") {
    throw new Error("TL_CLUB_FEED_CYCLE_RENEW_FAILED");
  }
}

async function completeCycle(admin: SupabaseClient, component: "SCHEDULER" | "RUNNER", token: string,
  outcome: "SUCCESS" | "FAILURE", items: number, errorCode: string | null) {
  const { error } = await withTimeout(admin.rpc("touchline_social_045_complete_cycle", {
    p_component: component, p_lease_token: token, p_outcome: outcome,
    p_error_code: errorCode, p_items: items,
  }), "TL_CLUB_FEED_CYCLE_COMPLETE_TIMEOUT");
  if (error) throw new Error("TL_CLUB_FEED_CYCLE_COMPLETE_FAILED");
}

function heartbeat(admin: SupabaseClient, component: "SCHEDULER" | "RUNNER", token: string) {
  let stopped = false;
  let failure: Error | null = null;
  let inflight: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (stopped || failure || inflight) return;
    inflight = renewCycle(admin, component, token)
      .catch((error) => { failure = error instanceof Error ? error : new Error("TL_CLUB_FEED_CYCLE_RENEW_FAILED"); })
      .finally(() => { inflight = null; });
  }, LEASE_HEARTBEAT_MS);
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

async function renewJob(admin: SupabaseClient, runnerLeaseToken: string, jobId: string, jobLeaseToken: string) {
  const result = await withTimeout(admin.rpc("touchline_social_045_renew_job", {
    p_runner_lease_token: runnerLeaseToken, p_job_id: jobId, p_job_lease_token: jobLeaseToken,
  }), "TL_CLUB_FEED_JOB_RENEW_TIMEOUT");
  if (result.error || (result.data as Record<string, unknown> | null)?.outcome !== "renewed") {
    throw new Error("TL_CLUB_FEED_JOB_RENEW_FAILED");
  }
}

async function completeJob(admin: SupabaseClient, runnerLeaseToken: string, jobId: string, jobLeaseToken: string) {
  const completion = await withTimeout(admin.rpc("touchline_social_045_complete_job", {
    p_runner_lease_token: runnerLeaseToken, p_job_id: jobId, p_job_lease_token: jobLeaseToken,
    p_outcome: "PUBLISHED", p_reason_code: "CLUB_FEED_PUBLISHED",
  }), "TL_CLUB_FEED_JOB_COMPLETE_TIMEOUT");
  if (completion.error || (completion.data as Record<string, unknown> | null)?.outcome !== "published") {
    throw new Error("TL_CLUB_FEED_JOB_COMPLETE_FAILED");
  }
}

export async function runTouchlineClubSocialScheduler(input: Readonly<{
  admin: SupabaseClient;
  explicitDraftId?: string | null;
  discover?: typeof discoverTouchlineClubSocialFanoutCandidates;
}>) {
  const claim = await claimCycle(input.admin, "SCHEDULER");
  if (claim.outcome !== "claimed") return { outcome: claim.outcome, processed: 0 } as const;
  const pulse = heartbeat(input.admin, "SCHEDULER", claim.leaseToken);
  let processed = 0;
  let expired = 0;
  try {
    const candidates = await (input.discover ?? discoverTouchlineClubSocialFanoutCandidates)({
      admin: input.admin, explicitDraftId: input.explicitDraftId,
    });
    pulse.assert();
    for (const candidate of candidates) {
      await renewCycle(input.admin, "SCHEDULER", claim.leaseToken);
      const { data, error } = await input.admin.rpc("touchline_social_045_enqueue_job", {
        p_scheduler_lease_token: claim.leaseToken,
        p_draft_id: candidate.draftId,
        p_target_team_ids: candidate.targetTeamIds,
        p_timeline_copy: candidate.timelineCopy,
        p_timeline_copy_checksum: candidate.timelineCopyChecksum,
      });
      if (error || !UUID.test(String((data as Record<string, unknown> | null)?.jobId ?? ""))) {
        throw new Error("TL_CLUB_FEED_ENQUEUE_FAILED");
      }
      processed += 1;
    }
    await renewCycle(input.admin, "SCHEDULER", claim.leaseToken);
    const retention = await withTimeout(input.admin.rpc("touchline_social_045_expire_posts", {
      p_run_id: randomUUID(), p_limit: 100,
    }), "TL_CLUB_FEED_RETENTION_TIMEOUT");
    const retentionPayload = retention.data as Record<string, unknown> | null;
    if (retention.error || !["completed", "busy"].includes(String(retentionPayload?.outcome ?? ""))) {
      throw new Error("TL_CLUB_FEED_RETENTION_FAILED");
    }
    expired = Number(retentionPayload?.deleted ?? 0);
    if (!Number.isInteger(expired) || expired < 0 || expired > 100) throw new Error("TL_CLUB_FEED_RETENTION_INVALID");
    await pulse.stop();
    await completeCycle(input.admin, "SCHEDULER", claim.leaseToken, "SUCCESS", processed, null);
    return { outcome: "success", processed, expired } as const;
  } catch (error) {
    const code = safeCode(error, "TL_CLUB_FEED_SCHEDULER_FAILED");
    await pulse.stop().catch(() => undefined);
    await completeCycle(input.admin, "SCHEDULER", claim.leaseToken, "FAILURE", processed, code).catch(() => undefined);
    throw new Error(code);
  }
}

export async function runTouchlineClubSocialRunner(input: Readonly<{ admin: SupabaseClient }>) {
  const claim = await claimCycle(input.admin, "RUNNER");
  if (claim.outcome !== "claimed") return { outcome: claim.outcome, processed: 0 } as const;
  const pulse = heartbeat(input.admin, "RUNNER", claim.leaseToken);
  let processed = 0;
  try {
    while (processed < RUNNER_LIMIT) {
      pulse.assert();
      await renewCycle(input.admin, "RUNNER", claim.leaseToken);
      const { data, error } = await input.admin.rpc("touchline_social_045_claim_job", {
        p_runner_lease_token: claim.leaseToken,
      });
      const job = data as Record<string, unknown> | null;
      if (error) throw new Error("TL_CLUB_FEED_JOB_CLAIM_FAILED");
      if (job?.outcome === "empty") break;
      if (job?.outcome === "review_required") { processed += 1; continue; }
      const jobId = String(job?.jobId ?? "");
      const jobLease = String(job?.leaseToken ?? "");
      if (job?.outcome !== "claimed" || !UUID.test(jobId) || !UUID.test(jobLease)) {
        throw new Error("TL_CLUB_FEED_JOB_CLAIM_INVALID");
      }
      await renewJob(input.admin, claim.leaseToken, jobId, jobLease);
      await completeJob(input.admin, claim.leaseToken, jobId, jobLease);
      processed += 1;
    }
    await pulse.stop();
    await completeCycle(input.admin, "RUNNER", claim.leaseToken, "SUCCESS", processed, null);
    return { outcome: "success", processed } as const;
  } catch (error) {
    const code = safeCode(error, "TL_CLUB_FEED_RUNNER_FAILED");
    await pulse.stop().catch(() => undefined);
    await completeCycle(input.admin, "RUNNER", claim.leaseToken, "FAILURE", processed, code).catch(() => undefined);
    throw new Error(code);
  }
}

async function main() {
  const mode = argument("mode");
  if (!["scheduler", "runner"].includes(mode ?? "")) throw new Error("TL_CLUB_FEED_EXECUTOR_MODE_INVALID");
  const boundary = assertTouchlineClubFeedQaBoundary();
  const admin = createClient(boundary.supabaseUrl, boundary.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = mode === "scheduler"
    ? await runTouchlineClubSocialScheduler({ admin, explicitDraftId: argument("draft-id") })
    : await runTouchlineClubSocialRunner({ admin });
  process.stdout.write(`${JSON.stringify({ service: `touchline-club-feed-${mode}`,
    projectRef: boundary.projectRef, ...result, outbound: "disabled" })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ service: "touchline-club-feed-045",
      outcome: "failure", code: safeCode(error, "TL_CLUB_FEED_EXECUTOR_FATAL") })}\n`);
    process.exitCode = 1;
  });
}
