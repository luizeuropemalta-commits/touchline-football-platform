import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

import {
  discoverTouchlineSocialLineupCandidates,
  type TouchlineSocialLineupCandidate,
} from "./touchline-social-lineup-candidates.mts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const STABLE_QA_HOST = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const TEMPLATE_VERSION = "touchline-lineup-feed-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEDULER_HEARTBEAT_INTERVAL_MS = 30_000;
const SCHEDULER_RENEW_TIMEOUT_MS = 15_000;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

export function assertTouchlineSocialSchedulerQaBoundary(environment = process.env) {
  const projectRef = environment.TOUCHLINE_QA_SUPABASE_PROJECT_REF?.trim() ?? "";
  const supabaseUrl = new URL(
    environment.SUPABASE_URL?.trim() || environment.NEXT_PUBLIC_SUPABASE_URL?.trim() || "invalid://missing",
  );
  const base = new URL(environment.TOUCHLINE_QA_BASE_URL?.trim() || "invalid://missing");
  const serviceRole = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const renderSecret = environment.TOUCHLINE_LIVE_SYNC_SECRET?.trim() ?? "";
  if (environment.VERCEL_ENV === "production"
    || projectRef !== QA_PROJECT_REF
    || supabaseUrl.hostname.split(".", 1)[0] !== QA_PROJECT_REF
    || base.protocol !== "https:"
    || base.hostname !== STABLE_QA_HOST
    || serviceRole.length < 32
    || renderSecret.length < 32) {
    throw new Error("TL_SOCIAL_SCHEDULER_QA_BOUNDARY_MISMATCH");
  }
  return { projectRef, supabaseUrl: supabaseUrl.toString(), base, serviceRole, renderSecret };
}

type SchedulerClaim =
  | Readonly<{ outcome: "claimed"; leaseToken: string }>
  | Readonly<{ outcome: "busy" | "cooldown" | "recovered_timeout"; nextEligibleAt?: unknown }>;

async function claimScheduler(admin: SupabaseClient): Promise<SchedulerClaim> {
  const { data, error } = await admin.rpc("touchline_social_claim_executor_cycle", {
    p_component: "SCHEDULER",
  });
  if (error) throw new Error("TL_SOCIAL_SCHEDULER_CLAIM_FAILED");
  const result = data as Record<string, unknown> | null;
  const outcome = String(result?.outcome ?? "");
  if (["busy", "cooldown", "recovered_timeout"].includes(outcome)) {
    return { outcome: outcome as "busy" | "cooldown" | "recovered_timeout", nextEligibleAt: result?.nextEligibleAt };
  }
  const leaseToken = String(result?.leaseToken ?? "");
  if (outcome !== "claimed" || !UUID.test(leaseToken)) {
    throw new Error("TL_SOCIAL_SCHEDULER_CLAIM_INVALID");
  }
  return { outcome: "claimed", leaseToken };
}

async function renewScheduler(
  admin: SupabaseClient,
  leaseToken: string,
  timeoutMs = SCHEDULER_RENEW_TIMEOUT_MS,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("TL_SOCIAL_SCHEDULER_RENEW_TIMEOUT_INVALID");
  }
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const request = admin.rpc("touchline_social_renew_executor_cycle", {
    p_component: "SCHEDULER",
    p_lease_token: leaseToken,
  });
  const abortable = request as unknown as {
    abortSignal?: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const pending = typeof abortable.abortSignal === "function"
    ? abortable.abortSignal(controller.signal)
    : request as unknown as PromiseLike<{ data: unknown; error: unknown }>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("TL_SOCIAL_SCHEDULER_RENEW_TIMEOUT"));
    }, timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([Promise.resolve(pending), deadline]);
    if (error || (data as Record<string, unknown> | null)?.outcome !== "renewed") {
      throw new Error("TL_SOCIAL_SCHEDULER_RENEW_FAILED");
    }
  } catch (error) {
    if (timedOut || controller.signal.aborted) {
      throw new Error("TL_SOCIAL_SCHEDULER_RENEW_TIMEOUT");
    }
    if (error instanceof Error && error.message === "TL_SOCIAL_SCHEDULER_RENEW_FAILED") {
      throw error;
    }
    throw new Error("TL_SOCIAL_SCHEDULER_RENEW_FAILED");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function startSchedulerHeartbeat(
  admin: SupabaseClient,
  leaseToken: string,
  intervalMs = SCHEDULER_HEARTBEAT_INTERVAL_MS,
  renewTimeoutMs = SCHEDULER_RENEW_TIMEOUT_MS,
) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 60_000) {
    throw new Error("TL_SOCIAL_SCHEDULER_HEARTBEAT_INTERVAL_INVALID");
  }
  let stopped = false;
  let failure: Error | null = null;
  let inFlight: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (stopped || failure || inFlight) return;
    inFlight = renewScheduler(admin, leaseToken, renewTimeoutMs)
      .catch((error) => {
        failure = error instanceof Error
          ? error
          : new Error("TL_SOCIAL_SCHEDULER_RENEW_FAILED");
      })
      .finally(() => { inFlight = null; });
  }, intervalMs);
  timer.unref?.();
  return {
    assertHealthy() {
      if (failure) throw failure;
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (inFlight) await inFlight;
      if (failure) throw failure;
    },
  };
}

async function completeScheduler(
  admin: SupabaseClient,
  leaseToken: string,
  outcome: "SUCCESS" | "FAILURE",
  itemsProcessed: number,
  errorCode: string | null,
) {
  const { error } = await admin.rpc("touchline_social_complete_executor_cycle", {
    p_component: "SCHEDULER",
    p_lease_token: leaseToken,
    p_outcome: outcome,
    p_error_code: errorCode,
    p_items_processed: itemsProcessed,
  });
  if (error) throw new Error("TL_SOCIAL_SCHEDULER_COMPLETE_FAILED");
}

async function recordReviewRequired(admin: SupabaseClient, candidate: TouchlineSocialLineupCandidate) {
  const claim = await admin.rpc("touchline_social_claim_generation", {
    p_fixture_provider_id: candidate.fixtureId,
    p_team_provider_id: candidate.teamId,
    p_template_version: TEMPLATE_VERSION,
    p_first_observed_at: candidate.firstObservedAt,
    p_input_checksum: candidate.inputChecksum,
    p_source_revision_manifest: candidate.sourceRevisionManifest,
    p_source_revision_checksum: candidate.sourceRevisionChecksum,
  });
  if (claim.error) throw new Error("TL_SOCIAL_SCHEDULER_REVIEW_CLAIM_FAILED");
  const claimResult = claim.data as Record<string, unknown> | null;
  const outcome = String(claimResult?.outcome ?? "");
  if (["busy", "cooldown", "noop_current"].includes(outcome)) return outcome;
  const leaseToken = String(claimResult?.leaseToken ?? "");
  if (outcome !== "claimed" || !UUID.test(leaseToken)) {
    throw new Error("TL_SOCIAL_SCHEDULER_REVIEW_CLAIM_INVALID");
  }
  const completed = await admin.rpc("touchline_social_complete_generation", {
    p_fixture_provider_id: candidate.fixtureId,
    p_team_provider_id: candidate.teamId,
    p_template_version: TEMPLATE_VERSION,
    p_lease_token: leaseToken,
    p_review_state: "REVIEW_REQUIRED",
    p_reason_code: candidate.sourceReasonCode ?? "OFFICIAL_SOURCE_NOT_READY",
    p_generated_draft_id: null,
    p_source_version: null,
    p_source_checksum: null,
  });
  if (completed.error) throw new Error("TL_SOCIAL_SCHEDULER_REVIEW_COMPLETE_FAILED");
  return "review_required";
}

async function enqueueCandidate(
  admin: SupabaseClient,
  leaseToken: string,
  candidate: TouchlineSocialLineupCandidate,
) {
  const { data, error } = await admin.rpc("touchline_social_enqueue_generation_job", {
    p_scheduler_lease_token: leaseToken,
    p_fixture_provider_id: candidate.fixtureId,
    p_team_provider_id: candidate.teamId,
    p_template_version: TEMPLATE_VERSION,
    p_first_observed_at: candidate.firstObservedAt,
    p_starts_at: candidate.startsAt,
    p_input_checksum: candidate.inputChecksum,
    p_source_revision_manifest: candidate.sourceRevisionManifest,
    p_source_revision_checksum: candidate.sourceRevisionChecksum,
  });
  const result = data as Record<string, unknown> | null;
  if (error || !UUID.test(String(result?.jobId ?? ""))) {
    throw new Error("TL_SOCIAL_SCHEDULER_ENQUEUE_FAILED");
  }
  return String(result?.outcome ?? "queued");
}

export async function runTouchlineSocialDraftScheduler(input: {
  admin: SupabaseClient;
  base: URL;
  renderSecret: string;
  explicitFixtureId?: string | null;
  explicitTeamId?: string | null;
  discover?: typeof discoverTouchlineSocialLineupCandidates;
  heartbeatIntervalMs?: number;
  heartbeatRenewTimeoutMs?: number;
}) {
  const claim = await claimScheduler(input.admin);
  if (claim.outcome !== "claimed") {
    return { outcome: claim.outcome, processed: 0, queued: 0, reviewRequired: 0 } as const;
  }
  let processed = 0;
  let queued = 0;
  let reviewRequired = 0;
  let failureCode: string | null = null;
  const heartbeat = startSchedulerHeartbeat(
    input.admin,
    claim.leaseToken,
    input.heartbeatIntervalMs,
    input.heartbeatRenewTimeoutMs,
  );
  let heartbeatStopped = false;
  try {
    const candidates = await (input.discover ?? discoverTouchlineSocialLineupCandidates)({
      admin: input.admin,
      base: input.base,
      renderSecret: input.renderSecret,
      explicitFixtureId: input.explicitFixtureId,
      explicitTeamId: input.explicitTeamId,
    });
    heartbeat.assertHealthy();
    for (const candidate of candidates) {
      await renewScheduler(input.admin, claim.leaseToken, input.heartbeatRenewTimeoutMs);
      heartbeat.assertHealthy();
      if (candidate.sourceReadiness === "READY") {
        await enqueueCandidate(input.admin, claim.leaseToken, candidate);
        queued += 1;
      } else {
        await recordReviewRequired(input.admin, candidate);
        reviewRequired += 1;
      }
      processed += 1;
    }
    await heartbeat.stop();
    heartbeatStopped = true;
    await completeScheduler(input.admin, claim.leaseToken, "SUCCESS", processed, null);
    return { outcome: "success", processed, queued, reviewRequired } as const;
  } catch (error) {
    let failure = error;
    if (!heartbeatStopped) {
      try {
        await heartbeat.stop();
      } catch (heartbeatError) {
        failure = heartbeatError;
      }
    }
    failureCode = failure instanceof Error
      ? failure.message.split(":", 1)[0]!.replace(/[^A-Z0-9_:-]/gi, "_").toUpperCase().slice(0, 160)
      : "TL_SOCIAL_SCHEDULER_FAILED";
    await completeScheduler(input.admin, claim.leaseToken, "FAILURE", processed, failureCode).catch(() => {
      // A timed-out heartbeat can outlive its fence. Recovery is owned by the
      // next claimant; a rejected stale completion must never replace the
      // original scheduler error that caused this cleanup path.
    });
    throw new Error(failureCode);
  }
}

export async function runTouchlineSocialDraftSchedulerFromEnvironment() {
  const boundary = assertTouchlineSocialSchedulerQaBoundary();
  const admin = createClient(boundary.supabaseUrl, boundary.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await runTouchlineSocialDraftScheduler({
    admin,
    base: boundary.base,
    renderSecret: boundary.renderSecret,
    explicitFixtureId: argument("fixture-id"),
    explicitTeamId: argument("team-id"),
  });
  process.stdout.write(`${JSON.stringify({
    service: "touchline-social-draft-scheduler",
    projectRef: boundary.projectRef,
    host: boundary.base.hostname,
    ...result,
  })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTouchlineSocialDraftSchedulerFromEnvironment().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      service: "touchline-social-draft-scheduler",
      outcome: "failure",
      code: error instanceof Error ? error.message : "TL_SOCIAL_SCHEDULER_FATAL",
    })}\n`);
    process.exitCode = 1;
  });
}
