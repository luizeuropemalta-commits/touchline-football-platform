import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { touchlineSocialWorkerCycleTimeoutMs } from "../../lib/touchlineArena/social-lineup-worker-budget.ts";

const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const STABLE_QA_HOST = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const BASE_DELAY_MS = 10_000;
const MAX_DELAY_MS = 60_000;
const WORKER_TIMEOUT_MS = touchlineSocialWorkerCycleTimeoutMs();
const WORKER_TERMINATION_GRACE_MS = 5_000;

export function touchlineSocialWatcherDelayMs(consecutiveFailures: number) {
  if (!Number.isSafeInteger(consecutiveFailures) || consecutiveFailures < 0) {
    throw new Error("TL_SOCIAL_WATCH_FAILURE_COUNT_INVALID");
  }
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (2 ** Math.min(consecutiveFailures, 3)));
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`TL_SOCIAL_WATCH_ENV_MISSING:${name}`);
  return value;
}

function assertQaBoundary() {
  const projectRef = required("TOUCHLINE_QA_SUPABASE_PROJECT_REF");
  const supabaseUrl = new URL(process.env.SUPABASE_URL?.trim() || required("NEXT_PUBLIC_SUPABASE_URL"));
  const baseUrl = new URL(required("TOUCHLINE_QA_BASE_URL"));
  if (process.env.VERCEL_ENV === "production"
    || projectRef !== QA_PROJECT_REF
    || supabaseUrl.hostname.split(".", 1)[0] !== QA_PROJECT_REF
    || baseUrl.protocol !== "https:"
    || baseUrl.hostname !== STABLE_QA_HOST) {
    throw new Error("TL_SOCIAL_WATCH_QA_BOUNDARY_MISMATCH");
  }
  required("SUPABASE_SERVICE_ROLE_KEY");
  const renderSecret = required("TOUCHLINE_LIVE_SYNC_SECRET");
  if (renderSecret.length < 32) throw new Error("TL_SOCIAL_WATCH_RENDER_SECRET_INVALID");
}

function safeLog(event: string, fields: Record<string, unknown> = {}) {
  process.stdout.write(`${JSON.stringify({
    at: new Date().toISOString(),
    service: "touchline-social-lineup-watch",
    event,
    ...fields,
  })}\n`);
}

export async function runTouchlineSocialWatcher() {
  assertQaBoundary();
  const workerPath = fileURLToPath(new URL("./generate-touchline-social-lineup-drafts.mts", import.meta.url));
  let stopping = false;
  let child: ChildProcess | null = null;
  let consecutiveFailures = 0;
  let resolveStopped: (() => void) | null = null;
  const stopped = new Promise<void>((resolve) => { resolveStopped = resolve; });

  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    if (child && child.exitCode === null) child.kill(signal);
    safeLog("stopping", { signal });
    resolveStopped?.();
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  const execute = async () => {
    if (stopping || child) return;
    const startedAt = Date.now();
    child = spawn(process.execPath, ["--experimental-strip-types", workerPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    let timedOut = false;
    const exitCode = await new Promise<number>((resolve) => {
      let settled = false;
      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(code);
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        safeLog("worker_timeout", { timeoutMs: WORKER_TIMEOUT_MS });
        child?.kill("SIGTERM");
        setTimeout(() => {
          if (child && child.exitCode === null) child.kill("SIGKILL");
        }, WORKER_TERMINATION_GRACE_MS).unref();
      }, WORKER_TIMEOUT_MS);
      timeout.unref();
      child!.once("error", () => finish(1));
      child!.once("exit", (code) => finish(code ?? 1));
    });
    child = null;
    if (stopping) return;
    if (exitCode === 0) consecutiveFailures = 0;
    else consecutiveFailures += 1;
    const nextDelayMs = touchlineSocialWatcherDelayMs(consecutiveFailures);
    safeLog(exitCode === 0 && !timedOut ? "cycle_completed" : "cycle_failed", {
      exitCode,
      timedOut,
      durationMs: Date.now() - startedAt,
      nextDelayMs,
      consecutiveFailures,
    });
  };

  safeLog("started", { pollIntervalMs: BASE_DELAY_MS, stableQaHost: STABLE_QA_HOST });
  while (!stopping) {
    await execute();
    if (stopping) break;
    const delayMs = touchlineSocialWatcherDelayMs(consecutiveFailures);
    await Promise.race([
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
      stopped,
    ]);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTouchlineSocialWatcher().catch((error) => {
    safeLog("fatal", { code: error instanceof Error ? error.message : "TL_SOCIAL_WATCH_FATAL" });
    process.exitCode = 1;
  });
}
