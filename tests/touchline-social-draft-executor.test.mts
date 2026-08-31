import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  TOUCHLINE_SOCIAL_EXECUTOR_HEALTH_MAX_AGE_MS,
  touchlineSocialExecutorHealth,
  type TouchlineSocialExecutorCycleRow,
} from "../lib/touchlineArena/social-draft-executor-health.ts";
import { runTouchlineSocialDraftQueueOnce } from "../scripts/qa/run-touchline-social-lineup-draft-queue.mts";
import {
  assertTouchlineSocialSchedulerQaBoundary,
  runTouchlineSocialDraftScheduler,
} from "../scripts/qa/schedule-touchline-social-lineup-drafts.mts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/qa/040_touchline_qa_social_draft_executor.sql");
const rollback = source("supabase/qa/040_touchline_qa_social_draft_executor_rollback.sql");
const scheduler = source("scripts/qa/schedule-touchline-social-lineup-drafts.mts");
const runner = source("scripts/qa/run-touchline-social-lineup-draft-queue.mts");
const generator = source("scripts/qa/generate-touchline-social-lineup-drafts.mts");
const packageJson = source("package.json");
const shadow = source("scripts/qa/verify-touchline-social-shadow-040.mts");

const schedulerLease = "11111111-1111-4111-8111-111111111111";
const runnerLease = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const checksum = `sha256:${"a".repeat(64)}`;
const sourceChecksum = `sha256:${"b".repeat(64)}`;

function cycle(
  component: "SCHEDULER" | "RUNNER",
  overrides: Partial<TouchlineSocialExecutorCycleRow> = {},
): TouchlineSocialExecutorCycleRow {
  return {
    component,
    lease_token: null,
    lease_expires_at: null,
    next_eligible_at: "2026-08-31T10:00:10.000Z",
    consecutive_failures: 0,
    run_count: 1,
    completed_count: 1,
    timeout_recovery_count: 0,
    last_started_at: "2026-08-31T10:00:00.000Z",
    last_completed_at: "2026-08-31T10:00:01.000Z",
    last_success_at: "2026-08-31T10:00:01.000Z",
    last_failure_at: null,
    last_outcome: "SUCCESS",
    last_error_code: null,
    last_items_processed: 1,
    ...overrides,
  };
}

test("040 is an isolated QA-only DRAFT queue with fenced service-role RPCs", () => {
  assert.match(migration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(migration, /touchline_social_executor_cycles/);
  assert.match(migration, /touchline_social_generation_jobs/);
  assert.match(migration, /job_state in \('PENDING', 'RUNNING', 'RETRY_WAIT', 'COMPLETED', 'REVIEW_REQUIRED', 'SUPERSEDED'\)/);
  assert.match(migration, /unique \([\s\S]*fixture_provider_id,[\s\S]*team_provider_id,[\s\S]*input_checksum,[\s\S]*source_revision_checksum/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /touchline_social_source_revision_is_current/);
  assert.match(migration, /lease_heartbeat_at/);
  assert.match(migration, /GENERATION_LEASE_EXPIRED/);
  assert.match(migration, /GENERATION_RETRY_EXHAUSTED/);
  assert.match(migration, /touchline_social_assert_executor_approval_gate/);
  assert.match(migration, /touchline_social_040_review_intent_gate/);
  assert.match(migration, /touchline_social_040_draft_approval_gate/);
  assert.match(migration, /order by component\s+for share/);
  assert.match(migration, /job_state <> 'COMPLETED'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /grant execute on function public\.touchline_social_claim_executor_cycle\(text\) to service_role/);
  assert.match(migration, /revoke all on function public\.touchline_social_claim_executor_cycle\(text\)[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(migration, /touchline_social_(?:enqueue_dispatch|claim_dispatch|complete_dispatch)/);
  assert.doesNotMatch(migration, /graph\.facebook|instagram.*(?:token|password)/i);
  assert.match(rollback, /TL_SOCIAL_EXECUTOR_040_ROLLBACK_REQUIRES_EMPTY_AUDIT_TABLES/);
  assert.match(rollback, /touchline_social_generation_jobs/);
  assert.match(rollback, /touchline_social_executor_cycles/);
  assert.match(rollback, /TL_SOCIAL_EXECUTOR_040_ROLLBACK_ACTIVE_LEASE/);
  assert.ok(
    rollback.indexOf("lock table public.touchline_social_executor_cycles")
      < rollback.indexOf("lock table public.touchline_social_generation_jobs"),
    "rollback must lock executor cycles before generation jobs",
  );
  const enqueueStart = migration.indexOf("create or replace function public.touchline_social_enqueue_generation_job");
  const enqueueEnd = migration.indexOf("create or replace function public.touchline_social_claim_generation_job", enqueueStart);
  const enqueue = migration.slice(enqueueStart, enqueueEnd);
  const sourceLock = enqueue.indexOf("touchline-social-source-revision");
  const generationLock = enqueue.indexOf("touchline-social-generation:");
  const schedulerLock = enqueue.indexOf("touchline-social-executor:SCHEDULER");
  assert.ok(
    sourceLock >= 0 && sourceLock < generationLock && generationLock < schedulerLock,
    "enqueue must acquire source, generation and scheduler locks in the canonical order",
  );
});

test("scheduler and request paths never import a browser renderer", () => {
  assert.doesNotMatch(scheduler, /playwright|chromium\.launch|generate-touchline-social-lineup-drafts/);
  assert.match(runner, /spawn\(process\.execPath/);
  assert.match(runner, /generate-touchline-social-lineup-drafts\.mts/);
  assert.match(generator, /import \{ chromium \} from "@playwright\/test"/);
  const roots = [
    new URL("../app", import.meta.url).pathname,
    new URL("../lib", import.meta.url).pathname,
  ];
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(?:ts|tsx|mts)$/.test(name)) files.push(path);
    }
  };
  roots.forEach(walk);
  const requestSources = files.map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(requestSources, /(?:schedule-touchline-social-lineup-drafts|run-touchline-social-lineup-draft-queue|generate-touchline-social-lineup-drafts)/);
  assert.match(scheduler, /SCHEDULER_RENEW_TIMEOUT_MS\s*=\s*15_000/);
  assert.match(scheduler, /AbortController/);
  assert.match(scheduler, /TL_SOCIAL_SCHEDULER_RENEW_TIMEOUT/);
});

test("QA boundary accepts only the exact non-Production project and stable host", () => {
  const valid = {
    TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
    SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    TOUCHLINE_QA_BASE_URL: "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(32),
    TOUCHLINE_LIVE_SYNC_SECRET: "r".repeat(32),
    VERCEL_ENV: "preview",
  };
  const accepted = assertTouchlineSocialSchedulerQaBoundary(valid);
  assert.equal(accepted.projectRef, "xgxbwqxjssxxuihuwmgy");
  for (const invalid of [
    { ...valid, VERCEL_ENV: "production" },
    { ...valid, TOUCHLINE_QA_SUPABASE_PROJECT_REF: "wrong" },
    { ...valid, SUPABASE_URL: "https://wrong.supabase.co" },
    { ...valid, TOUCHLINE_QA_BASE_URL: "https://touchline.com.br" },
    { ...valid, SUPABASE_SERVICE_ROLE_KEY: "short" },
    { ...valid, TOUCHLINE_LIVE_SYNC_SECRET: "short" },
  ]) {
    assert.throws(() => assertTouchlineSocialSchedulerQaBoundary(invalid), /TL_SOCIAL_SCHEDULER_QA_BOUNDARY_MISMATCH/);
  }
});

test("executor health exposes never-run, running, backoff, stale and healthy deterministically", () => {
  const now = Date.parse("2026-08-31T10:01:00.000Z");
  assert.deepEqual(touchlineSocialExecutorHealth([], now), {
    scheduler: "never-run", runner: "never-run", operational: false,
  });
  assert.deepEqual(touchlineSocialExecutorHealth([
    cycle("SCHEDULER"), cycle("RUNNER"),
  ], now), { scheduler: "healthy", runner: "healthy", operational: true });
  assert.equal(touchlineSocialExecutorHealth([
    cycle("SCHEDULER", {
      lease_token: schedulerLease,
      lease_expires_at: "2026-08-31T10:02:00.000Z",
    }),
    cycle("RUNNER"),
  ], now).scheduler, "running");
  assert.equal(touchlineSocialExecutorHealth([
    cycle("SCHEDULER", {
      consecutive_failures: 2,
      last_outcome: "FAILURE",
      last_error_code: "SCHEDULER_FAILED",
      next_eligible_at: "2026-08-31T10:02:00.000Z",
    }),
    cycle("RUNNER"),
  ], now).scheduler, "backoff");
  assert.equal(touchlineSocialExecutorHealth([
    cycle("SCHEDULER", { last_completed_at: "2026-08-31T09:00:00.000Z" }),
    cycle("RUNNER"),
  ], now).scheduler, "stale");
  assert.equal(TOUCHLINE_SOCIAL_EXECUTOR_HEALTH_MAX_AGE_MS, 180_000);
});

test("scheduler queues READY sources and records incomplete sources fail-closed", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "touchline_social_claim_executor_cycle") {
        return { data: { outcome: "claimed", leaseToken: schedulerLease }, error: null };
      }
      if (name === "touchline_social_renew_executor_cycle") return { data: { outcome: "renewed" }, error: null };
      if (name === "touchline_social_enqueue_generation_job") return { data: { outcome: "queued", jobId }, error: null };
      if (name === "touchline_social_claim_generation") {
        return { data: { outcome: "claimed", leaseToken: runnerLease }, error: null };
      }
      if (name === "touchline_social_complete_generation") return { data: { outcome: "review_required" }, error: null };
      if (name === "touchline_social_complete_executor_cycle") return { data: { outcome: "success" }, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  const result = await runTouchlineSocialDraftScheduler({
    admin: admin as never,
    base: new URL("https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app"),
    renderSecret: "r".repeat(32),
    discover: async () => [{
      fixtureId: "19722192",
      teamId: "19",
      firstObservedAt: "2026-08-31T13:30:00.000Z",
      startsAt: "2026-08-31T14:00:00.000Z",
      inputChecksum: checksum,
      sourceRevisionManifest: { "fixture-provider:19722192": 7 },
      sourceRevisionChecksum: sourceChecksum,
      sourceReadiness: "READY",
    }, {
      fixtureId: "19722192",
      teamId: "20",
      firstObservedAt: "2026-08-31T13:30:00.000Z",
      startsAt: "2026-08-31T14:00:00.000Z",
      inputChecksum: checksum,
      sourceRevisionManifest: { "fixture-provider:19722192": 7 },
      sourceRevisionChecksum: sourceChecksum,
      sourceReadiness: "REVIEW_REQUIRED",
      sourceReasonCode: "CARD_PUBLICATION_INCOMPLETE",
    }],
  });
  assert.deepEqual(result, { outcome: "success", processed: 2, queued: 1, reviewRequired: 1 });
  assert.deepEqual(calls.map((call) => call.name), [
    "touchline_social_claim_executor_cycle",
    "touchline_social_renew_executor_cycle",
    "touchline_social_enqueue_generation_job",
    "touchline_social_renew_executor_cycle",
    "touchline_social_claim_generation",
    "touchline_social_complete_generation",
    "touchline_social_complete_executor_cycle",
  ]);
  assert.equal(calls.at(-1)?.args.p_outcome, "SUCCESS");
});

test("scheduler heartbeats through discovery beyond two minutes and keeps a competitor busy", async () => {
  let virtualNow = 0;
  let leaseExpiresAt = 0;
  let renewCount = 0;
  let claimCount = 0;
  let releaseDiscovery: (() => void) | null = null;
  const renewedTwice = new Promise<void>((resolve) => { releaseDiscovery = resolve; });
  const admin = {
    async rpc(name: string) {
      if (name === "touchline_social_claim_executor_cycle") {
        claimCount += 1;
        if (claimCount === 1) {
          leaseExpiresAt = virtualNow + 120_000;
          return { data: { outcome: "claimed", leaseToken: schedulerLease }, error: null };
        }
        return {
          data: virtualNow < leaseExpiresAt
            ? { outcome: "busy", leaseExpiresAt }
            : { outcome: "claimed", leaseToken: "55555555-5555-4555-8555-555555555555" },
          error: null,
        };
      }
      if (name === "touchline_social_renew_executor_cycle") {
        virtualNow += 70_000;
        leaseExpiresAt = virtualNow + 120_000;
        renewCount += 1;
        if (renewCount >= 2) releaseDiscovery?.();
        return { data: { outcome: "renewed" }, error: null };
      }
      if (name === "touchline_social_complete_executor_cycle") {
        return { data: { outcome: "success" }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  const result = await runTouchlineSocialDraftScheduler({
    admin: admin as never,
    base: new URL("https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app"),
    renderSecret: "r".repeat(32),
    heartbeatIntervalMs: 1,
    discover: async () => {
      await renewedTwice;
      assert.ok(virtualNow > 120_000, "discovery must outlive the original two-minute lease");
      const competitor = await admin.rpc("touchline_social_claim_executor_cycle");
      assert.equal((competitor.data as { outcome?: string }).outcome, "busy");
      return [];
    },
  });
  assert.deepEqual(result, { outcome: "success", processed: 0, queued: 0, reviewRequired: 0 });
  assert.ok(renewCount >= 2);
});

test("scheduler renewal deadline fails closed and permits timeout recovery without enqueue", async () => {
  let virtualNow = 0;
  let activeLease: string | null = null;
  let leaseExpiresAt = 0;
  let enqueueCount = 0;
  let completion: Record<string, unknown> | null = null;
  let staleCompletionRejected = false;
  let recoveredByCompetitor = false;
  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "touchline_social_claim_executor_cycle") {
        if (activeLease && leaseExpiresAt > virtualNow) {
          return { data: { outcome: "busy", leaseExpiresAt }, error: null };
        }
        if (activeLease && leaseExpiresAt <= virtualNow) {
          activeLease = null;
          recoveredByCompetitor = true;
          return {
            data: { outcome: "recovered_timeout", nextEligibleAt: virtualNow + 20_000 },
            error: null,
          };
        }
        activeLease = schedulerLease;
        leaseExpiresAt = virtualNow + 120_000;
        return { data: { outcome: "claimed", leaseToken: schedulerLease }, error: null };
      }
      if (name === "touchline_social_renew_executor_cycle") {
        return new Promise(() => {});
      }
      if (name === "touchline_social_enqueue_generation_job") {
        enqueueCount += 1;
        return { data: { outcome: "queued", jobId }, error: null };
      }
      if (name === "touchline_social_complete_executor_cycle") {
        completion = args;
        if (activeLease !== args.p_lease_token || leaseExpiresAt <= virtualNow) {
          staleCompletionRejected = true;
          return { data: null, error: { message: "TL_SOCIAL_EXECUTOR_FENCE_LOST" } };
        }
        activeLease = null;
        return { data: { outcome: "failure" }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  const startedAt = Date.now();
  await assert.rejects(() => runTouchlineSocialDraftScheduler({
    admin: admin as never,
    base: new URL("https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app"),
    renderSecret: "r".repeat(32),
    heartbeatIntervalMs: 1,
    heartbeatRenewTimeoutMs: 10,
    discover: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      virtualNow = leaseExpiresAt + 1;
      const competitor = await admin.rpc("touchline_social_claim_executor_cycle", {});
      assert.equal((competitor.data as { outcome?: string }).outcome, "recovered_timeout");
      return [{
        fixtureId: "19722192",
        teamId: "19",
        firstObservedAt: "2026-08-31T13:30:00.000Z",
        startsAt: "2026-08-31T14:00:00.000Z",
        inputChecksum: checksum,
        sourceRevisionManifest: { "fixture-provider:19722192": 7 },
        sourceRevisionChecksum: sourceChecksum,
        sourceReadiness: "READY" as const,
      }];
    },
  }), /TL_SOCIAL_SCHEDULER_RENEW_TIMEOUT/);
  assert.ok(Date.now() - startedAt < 1_000, "a stuck renewal must have a bounded deadline");
  assert.equal(recoveredByCompetitor, true);
  assert.equal(enqueueCount, 0, "a stale scheduler must not enqueue after renewal timeout");
  assert.equal(staleCompletionRejected, true, "old scheduler cleanup must be rejected after recovery");
  assert.equal(completion?.p_outcome, "FAILURE");
  assert.equal(completion?.p_error_code, "TL_SOCIAL_SCHEDULER_RENEW_TIMEOUT");
});

test("scheduler failure is bounded and runner single-flight never starts a browser while busy", async () => {
  const completions: Record<string, unknown>[] = [];
  const schedulerAdmin = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "touchline_social_claim_executor_cycle") {
        return { data: { outcome: "claimed", leaseToken: schedulerLease }, error: null };
      }
      if (name === "touchline_social_complete_executor_cycle") {
        completions.push(args);
        return { data: { outcome: "failure" }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  await assert.rejects(() => runTouchlineSocialDraftScheduler({
    admin: schedulerAdmin as never,
    base: new URL("https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app"),
    renderSecret: "r".repeat(32),
    discover: async () => { throw new Error("TL_SOCIAL_SOURCE_UNAVAILABLE:secret-never-logged"); },
  }), /TL_SOCIAL_SOURCE_UNAVAILABLE/);
  assert.equal(completions[0]?.p_outcome, "FAILURE");
  assert.equal(completions[0]?.p_error_code, "TL_SOCIAL_SOURCE_UNAVAILABLE");

  const runnerAdmin = {
    async rpc(name: string) {
      assert.equal(name, "touchline_social_claim_executor_cycle");
      return { data: { outcome: "busy" }, error: null };
    },
  };
  assert.deepEqual(await runTouchlineSocialDraftQueueOnce({ admin: runnerAdmin as never }), {
    outcome: "busy", processed: 0,
  });
});

test("runner records exact completion and bounded retry without a real browser", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const makeAdmin = () => ({
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "touchline_social_claim_executor_cycle") {
        return { data: { outcome: "claimed", leaseToken: runnerLease }, error: null };
      }
      if (name === "touchline_social_claim_generation_job") {
        return { data: {
          outcome: "claimed",
          jobId,
          leaseToken: schedulerLease,
          fixtureId: "19722192",
          teamId: "19",
          inputChecksum: checksum,
          sourceRevisionChecksum: sourceChecksum,
        }, error: null };
      }
      if (name === "touchline_social_renew_executor_cycle"
        || name === "touchline_social_renew_generation_job") {
        return { data: { outcome: "renewed" }, error: null };
      }
      if (name === "touchline_social_complete_generation_job"
        || name === "touchline_social_complete_executor_cycle") {
        return { data: { outcome: "completed" }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  });
  const completed = await runTouchlineSocialDraftQueueOnce({
    admin: makeAdmin() as never,
    generate: async (_job, heartbeat) => { await heartbeat(); },
    resolve: async () => ({
      outcome: "COMPLETED",
      reason: "IMMUTABLE_DRAFT_READY",
      draftId: "44444444-4444-4444-8444-444444444444",
    }),
  });
  assert.equal(completed.outcome, "completed");
  assert.equal(calls.find((call) => call.name === "touchline_social_complete_generation_job")?.args.p_outcome, "COMPLETED");
  assert.equal(calls.findLast((call) => call.name === "touchline_social_complete_executor_cycle")?.args.p_outcome, "SUCCESS");

  calls.length = 0;
  await assert.rejects(() => runTouchlineSocialDraftQueueOnce({
    admin: makeAdmin() as never,
    generate: async () => { throw new Error("TL_SOCIAL_RENDER_FAILED:detail-not-persisted"); },
  }), /TL_SOCIAL_RENDER_FAILED/);
  assert.equal(calls.find((call) => call.name === "touchline_social_complete_generation_job")?.args.p_outcome, "RETRY");
  assert.equal(calls.find((call) => call.name === "touchline_social_complete_generation_job")?.args.p_reason_code, "TL_SOCIAL_RENDER_FAILED");
  assert.equal(calls.findLast((call) => call.name === "touchline_social_complete_executor_cycle")?.args.p_outcome, "FAILURE");
});

test("runner and job renewal deadlines fail closed when either RPC never resolves", async () => {
  const runCase = async (stuckRpc: "touchline_social_renew_executor_cycle" | "touchline_social_renew_generation_job") => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let virtualNow = 0;
    let activeRunnerLease: string | null = null;
    let runnerLeaseExpiresAt = 0;
    let staleJobCompletionRejected = false;
    let staleRunnerCompletionRejected = false;
    const admin = {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        if (name === "touchline_social_claim_executor_cycle") {
          if (activeRunnerLease && runnerLeaseExpiresAt > virtualNow) {
            return { data: { outcome: "busy", leaseExpiresAt: runnerLeaseExpiresAt }, error: null };
          }
          if (activeRunnerLease && runnerLeaseExpiresAt <= virtualNow) {
            activeRunnerLease = null;
            return { data: { outcome: "recovered_timeout" }, error: null };
          }
          activeRunnerLease = runnerLease;
          runnerLeaseExpiresAt = virtualNow + 120_000;
          return { data: { outcome: "claimed", leaseToken: runnerLease }, error: null };
        }
        if (name === "touchline_social_claim_generation_job") {
          return { data: {
            outcome: "claimed",
            jobId,
            leaseToken: schedulerLease,
            fixtureId: "19722192",
            teamId: "19",
            inputChecksum: checksum,
            sourceRevisionChecksum: sourceChecksum,
          }, error: null };
        }
        if (name === stuckRpc) return new Promise(() => {});
        if (name === "touchline_social_renew_executor_cycle") {
          if (activeRunnerLease !== args.p_lease_token || runnerLeaseExpiresAt <= virtualNow) {
            return { data: null, error: { message: "TL_SOCIAL_EXECUTOR_FENCE_LOST" } };
          }
          runnerLeaseExpiresAt = virtualNow + 120_000;
          return { data: { outcome: "renewed" }, error: null };
        }
        if (name === "touchline_social_renew_generation_job") {
          return { data: { outcome: "renewed" }, error: null };
        }
        if (name === "touchline_social_complete_generation_job") {
          if (activeRunnerLease !== args.p_runner_lease_token || runnerLeaseExpiresAt <= virtualNow) {
            staleJobCompletionRejected = true;
            return { data: null, error: { message: "TL_SOCIAL_RUNNER_FENCE_LOST" } };
          }
          return { data: { outcome: "completed" }, error: null };
        }
        if (name === "touchline_social_complete_executor_cycle") {
          if (activeRunnerLease !== args.p_lease_token || runnerLeaseExpiresAt <= virtualNow) {
            staleRunnerCompletionRejected = true;
            return { data: null, error: { message: "TL_SOCIAL_EXECUTOR_FENCE_LOST" } };
          }
          activeRunnerLease = null;
          return { data: { outcome: "completed" }, error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
      },
    };
    const expected = stuckRpc === "touchline_social_renew_executor_cycle"
      ? "TL_SOCIAL_RUNNER_RENEW_TIMEOUT"
      : "TL_SOCIAL_RUNNER_JOB_RENEW_TIMEOUT";
    const startedAt = Date.now();
    await assert.rejects(() => runTouchlineSocialDraftQueueOnce({
      admin: admin as never,
      heartbeatRenewTimeoutMs: 10,
      generate: async (_job, heartbeat) => {
        const renewal = heartbeat();
        await new Promise((resolve) => setTimeout(resolve, 5));
        virtualNow = runnerLeaseExpiresAt + 1;
        const competitor = await admin.rpc("touchline_social_claim_executor_cycle", { p_component: "RUNNER" });
        assert.equal((competitor.data as { outcome?: string }).outcome, "recovered_timeout");
        await renewal;
      },
    }), new RegExp(expected));
    assert.ok(Date.now() - startedAt < 1_000, "a stuck runner heartbeat must be bounded");
    assert.equal(staleJobCompletionRejected, true, "old job cleanup must be rejected after recovery");
    assert.equal(staleRunnerCompletionRejected, true, "old runner cleanup must be rejected after recovery");
    assert.equal(
      calls.find((call) => call.name === "touchline_social_complete_generation_job")?.args.p_reason_code,
      expected,
    );
    assert.equal(
      calls.findLast((call) => call.name === "touchline_social_complete_executor_cycle")?.args.p_error_code,
      expected,
    );
  };
  await runCase("touchline_social_renew_executor_cycle");
  await runCase("touchline_social_renew_generation_job");
});

test("runner fences exact source, renews leases, times out and never dispatches", () => {
  assert.match(runner, /--expected-input-checksum=\$\{job\.inputChecksum\}/);
  assert.match(runner, /--expected-source-revision-checksum=\$\{job\.sourceRevisionChecksum\}/);
  assert.match(runner, /HEARTBEAT_INTERVAL_MS = 30_000/);
  assert.match(runner, /HEARTBEAT_RENEW_TIMEOUT_MS = 15_000/);
  assert.match(runner, /AbortController/);
  assert.match(runner, /TL_SOCIAL_RUNNER_RENEW_TIMEOUT/);
  assert.match(runner, /TL_SOCIAL_RUNNER_JOB_RENEW_TIMEOUT/);
  assert.match(runner, /touchline_social_renew_executor_cycle/);
  assert.match(runner, /touchline_social_renew_generation_job/);
  assert.match(runner, /touchlineSocialWorkerCycleTimeoutMs\(1\)/);
  assert.match(runner, /child\.kill\("SIGTERM"\)/);
  assert.match(runner, /child\.kill\("SIGKILL"\)/);
  assert.match(runner, /stdio: \["ignore", "ignore", "ignore"\]/);
  assert.match(runner, /"RETRY"/);
  assert.doesNotMatch(runner, /touchline_social_(?:enqueue_dispatch|claim_dispatch|complete_dispatch)/);
  assert.doesNotMatch(runner, /graph\.facebook|instagram.*(?:token|password)/i);
});

test("shadow verifier exercises migrations, races, recovery and conservative rollback", () => {
  assert.match(packageJson, /"verify:social-shadow-040"/);
  for (const evidence of [
    "schedulerSingleFlight",
    "queueIdempotency",
    "runnerSingleFlight",
    "leaseRenewal",
    "exactDraftCompletion",
    "boundedRetry",
    "expiredJobRecovery",
    "directMutation",
    "timeoutRecovery",
    "staleSchedulerCleanup",
    "staleRunnerCleanup",
    "rollbackWithAudit",
    "rollbackTwoSessionLockOrder",
    "schedulerEnqueueIntentLockOrder",
    "schedulerEnqueueApprovalLockOrder",
    "approvalIntentHealthRace",
    "approvalIntentJobRace",
    "emptyRollback",
  ]) assert.match(shadow, new RegExp(evidence));
});
