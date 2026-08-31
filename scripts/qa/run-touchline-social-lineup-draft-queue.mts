import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { touchlineSocialWorkerCycleTimeoutMs } from "../../lib/touchlineArena/social-lineup-worker-budget.ts";
import { assertTouchlineSocialSchedulerQaBoundary } from "./schedule-touchline-social-lineup-drafts.mts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const TEMPLATE_VERSION = "touchline-lineup-feed-v1";
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_RENEW_TIMEOUT_MS = 15_000;
const TERMINATION_GRACE_MS = 5_000;
const WORKER_TIMEOUT_MS = touchlineSocialWorkerCycleTimeoutMs(1);

type ClaimedJob = Readonly<{
  jobId: string;
  leaseToken: string;
  fixtureId: string;
  teamId: string;
  inputChecksum: string;
  sourceRevisionChecksum: string;
}>;

async function claimRunner(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("touchline_social_claim_executor_cycle", {
    p_component: "RUNNER",
  });
  if (error) throw new Error("TL_SOCIAL_RUNNER_CLAIM_FAILED");
  const result = data as Record<string, unknown> | null;
  const outcome = String(result?.outcome ?? "");
  if (["busy", "cooldown", "recovered_timeout"].includes(outcome)) return { outcome } as const;
  const leaseToken = String(result?.leaseToken ?? "");
  if (outcome !== "claimed" || !UUID.test(leaseToken)) throw new Error("TL_SOCIAL_RUNNER_CLAIM_INVALID");
  return { outcome: "claimed", leaseToken } as const;
}

async function renewWithDeadline(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  timeoutCode: string,
  failureCode: string,
  timeoutMs: number,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("TL_SOCIAL_RUNNER_RENEW_TIMEOUT_INVALID");
  }
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const abortable = request as unknown as {
    abortSignal?: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const pending = typeof abortable.abortSignal === "function"
    ? abortable.abortSignal(controller.signal)
    : request;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error(timeoutCode));
    }, timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([Promise.resolve(pending), deadline]);
    if (error || (data as Record<string, unknown> | null)?.outcome !== "renewed") {
      throw new Error(failureCode);
    }
  } catch (error) {
    if (timedOut || controller.signal.aborted) throw new Error(timeoutCode);
    if (error instanceof Error && error.message === failureCode) throw error;
    throw new Error(failureCode);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function renewRunner(
  admin: SupabaseClient,
  leaseToken: string,
  timeoutMs = HEARTBEAT_RENEW_TIMEOUT_MS,
) {
  await renewWithDeadline(
    admin.rpc("touchline_social_renew_executor_cycle", {
      p_component: "RUNNER",
      p_lease_token: leaseToken,
    }),
    "TL_SOCIAL_RUNNER_RENEW_TIMEOUT",
    "TL_SOCIAL_RUNNER_RENEW_FAILED",
    timeoutMs,
  );
}

async function completeRunner(
  admin: SupabaseClient,
  leaseToken: string,
  outcome: "SUCCESS" | "FAILURE",
  itemsProcessed: number,
  errorCode: string | null,
) {
  const { error } = await admin.rpc("touchline_social_complete_executor_cycle", {
    p_component: "RUNNER",
    p_lease_token: leaseToken,
    p_outcome: outcome,
    p_error_code: errorCode,
    p_items_processed: itemsProcessed,
  });
  if (error) throw new Error("TL_SOCIAL_RUNNER_COMPLETE_FAILED");
}

async function claimJob(admin: SupabaseClient, runnerLeaseToken: string): Promise<ClaimedJob | null> {
  const { data, error } = await admin.rpc("touchline_social_claim_generation_job", {
    p_runner_lease_token: runnerLeaseToken,
  });
  if (error) throw new Error("TL_SOCIAL_RUNNER_JOB_CLAIM_FAILED");
  const result = data as Record<string, unknown> | null;
  if (result?.outcome === "empty") return null;
  const job = {
    jobId: String(result?.jobId ?? ""),
    leaseToken: String(result?.leaseToken ?? ""),
    fixtureId: String(result?.fixtureId ?? ""),
    teamId: String(result?.teamId ?? ""),
    inputChecksum: String(result?.inputChecksum ?? ""),
    sourceRevisionChecksum: String(result?.sourceRevisionChecksum ?? ""),
  };
  if (result?.outcome !== "claimed" || !UUID.test(job.jobId) || !UUID.test(job.leaseToken)
    || !/^[1-9]\d{0,19}$/.test(job.fixtureId) || !/^[1-9]\d{0,19}$/.test(job.teamId)
    || !SHA256.test(job.inputChecksum) || !SHA256.test(job.sourceRevisionChecksum)) {
    throw new Error("TL_SOCIAL_RUNNER_JOB_CLAIM_INVALID");
  }
  return job;
}

async function renewJob(
  admin: SupabaseClient,
  runnerLeaseToken: string,
  job: ClaimedJob,
  timeoutMs = HEARTBEAT_RENEW_TIMEOUT_MS,
) {
  await renewWithDeadline(
    admin.rpc("touchline_social_renew_generation_job", {
      p_runner_lease_token: runnerLeaseToken,
      p_job_id: job.jobId,
      p_job_lease_token: job.leaseToken,
    }),
    "TL_SOCIAL_RUNNER_JOB_RENEW_TIMEOUT",
    "TL_SOCIAL_RUNNER_JOB_RENEW_FAILED",
    timeoutMs,
  );
}

async function completeJob(
  admin: SupabaseClient,
  runnerLeaseToken: string,
  job: ClaimedJob,
  outcome: "COMPLETED" | "REVIEW_REQUIRED" | "RETRY",
  reasonCode: string,
  generatedDraftId: string | null,
) {
  const { error } = await admin.rpc("touchline_social_complete_generation_job", {
    p_runner_lease_token: runnerLeaseToken,
    p_job_id: job.jobId,
    p_job_lease_token: job.leaseToken,
    p_outcome: outcome,
    p_reason_code: reasonCode,
    p_generated_draft_id: generatedDraftId,
  });
  if (error) throw new Error("TL_SOCIAL_RUNNER_JOB_COMPLETE_FAILED");
}

async function runGenerator(job: ClaimedJob, heartbeat: () => Promise<void>) {
  const generatorPath = fileURLToPath(new URL("./generate-touchline-social-lineup-drafts.mts", import.meta.url));
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    generatorPath,
    `--fixture-id=${job.fixtureId}`,
    `--team-id=${job.teamId}`,
    `--expected-input-checksum=${job.inputChecksum}`,
    `--expected-source-revision-checksum=${job.sourceRevisionChecksum}`,
  ], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "ignore", "ignore"],
  });
  let heartbeatFailure: Error | null = null;
  let heartbeatRunning = false;
  const timer = setInterval(() => {
    if (heartbeatRunning || heartbeatFailure) return;
    heartbeatRunning = true;
    heartbeat().catch((error) => {
      heartbeatFailure = error instanceof Error ? error : new Error("TL_SOCIAL_RUNNER_HEARTBEAT_FAILED");
      child.kill("SIGTERM");
    }).finally(() => { heartbeatRunning = false; });
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, TERMINATION_GRACE_MS).unref();
  }, WORKER_TIMEOUT_MS);
  timeout.unref();
  const exitCode = await new Promise<number>((resolve) => {
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
  clearInterval(timer);
  clearTimeout(timeout);
  if (heartbeatFailure) throw heartbeatFailure;
  if (timedOut) throw new Error("TL_SOCIAL_RUNNER_GENERATOR_TIMEOUT");
  if (exitCode !== 0) throw new Error("TL_SOCIAL_RUNNER_GENERATOR_FAILED");
}

async function resolveGenerationOutcome(admin: SupabaseClient, job: ClaimedJob) {
  const { data, error } = await admin
    .from("touchline_social_generation_reviews")
    .select("review_state,reason_code,generated_draft_id,input_checksum,source_revision_checksum")
    .eq("fixture_provider_id", job.fixtureId)
    .eq("team_provider_id", job.teamId)
    .eq("content_type", "LINEUP")
    .eq("template_version", TEMPLATE_VERSION)
    .maybeSingle();
  if (error || !data
    || data.input_checksum !== job.inputChecksum
    || data.source_revision_checksum !== job.sourceRevisionChecksum) {
    return { outcome: "RETRY" as const, reason: "GENERATOR_SOURCE_RESULT_MISMATCH", draftId: null };
  }
  if (data.review_state === "GENERATED" && UUID.test(String(data.generated_draft_id ?? ""))) {
    return { outcome: "COMPLETED" as const, reason: "IMMUTABLE_DRAFT_READY", draftId: String(data.generated_draft_id) };
  }
  if (data.review_state === "REVIEW_REQUIRED") {
    const reason = String(data.reason_code ?? "GENERATION_GATE_FAILED").replace(/[^A-Z0-9_:-]/g, "_").slice(0, 160);
    return { outcome: "REVIEW_REQUIRED" as const, reason, draftId: null };
  }
  return { outcome: "RETRY" as const, reason: "GENERATOR_NO_TERMINAL_RESULT", draftId: null };
}

export async function runTouchlineSocialDraftQueueOnce(input: {
  admin: SupabaseClient;
  generate?: typeof runGenerator;
  resolve?: typeof resolveGenerationOutcome;
  heartbeatRenewTimeoutMs?: number;
}) {
  const runner = await claimRunner(input.admin);
  if (runner.outcome !== "claimed") return { outcome: runner.outcome, processed: 0 } as const;
  let processed = 0;
  let errorCode: string | null = null;
  let claimedJob: ClaimedJob | null = null;
  try {
    claimedJob = await claimJob(input.admin, runner.leaseToken);
    if (!claimedJob) {
      await completeRunner(input.admin, runner.leaseToken, "SUCCESS", 0, null);
      return { outcome: "empty", processed: 0 } as const;
    }
    const job = claimedJob;
    const heartbeatRenewTimeoutMs = input.heartbeatRenewTimeoutMs ?? HEARTBEAT_RENEW_TIMEOUT_MS;
    const heartbeat = async () => {
      await renewRunner(input.admin, runner.leaseToken, heartbeatRenewTimeoutMs);
      await renewJob(input.admin, runner.leaseToken, job, heartbeatRenewTimeoutMs);
    };
    await (input.generate ?? runGenerator)(job, heartbeat);
    await heartbeat();
    const result = await (input.resolve ?? resolveGenerationOutcome)(input.admin, job);
    await completeJob(
      input.admin,
      runner.leaseToken,
      job,
      result.outcome,
      result.reason,
      result.draftId,
    );
    processed = 1;
    await completeRunner(input.admin, runner.leaseToken, "SUCCESS", processed, null);
    return { outcome: result.outcome.toLowerCase(), processed, jobId: job.jobId } as const;
  } catch (error) {
    errorCode = error instanceof Error
      ? error.message.split(":", 1)[0]!.replace(/[^A-Z0-9_:-]/gi, "_").toUpperCase().slice(0, 160)
      : "TL_SOCIAL_RUNNER_FAILED";
    if (claimedJob) {
      await completeJob(
        input.admin,
        runner.leaseToken,
        claimedJob,
        "RETRY",
        errorCode,
        null,
      ).catch(() => {
        // If either fenced lease has already expired, the database claim RPC
        // performs deterministic timeout recovery on the next wake. Never
        // bypass a lost fence merely to record a friendlier error.
      });
    }
    await completeRunner(input.admin, runner.leaseToken, "FAILURE", processed, errorCode).catch(() => {
      // The runner fence may already have been recovered after a heartbeat
      // timeout. Preserve the causal error; the next claimant owns recovery.
    });
    throw new Error(errorCode);
  }
}

export async function runTouchlineSocialDraftQueueFromEnvironment() {
  const boundary = assertTouchlineSocialSchedulerQaBoundary();
  const admin = createClient(boundary.supabaseUrl, boundary.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await runTouchlineSocialDraftQueueOnce({ admin });
  process.stdout.write(`${JSON.stringify({
    service: "touchline-social-draft-runner",
    projectRef: boundary.projectRef,
    host: boundary.base.hostname,
    ...result,
  })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTouchlineSocialDraftQueueFromEnvironment().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      service: "touchline-social-draft-runner",
      outcome: "failure",
      code: error instanceof Error ? error.message : "TL_SOCIAL_RUNNER_FATAL",
    })}\n`);
    process.exitCode = 1;
  });
}
