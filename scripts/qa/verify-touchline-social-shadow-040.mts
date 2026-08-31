import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "../..");
const configuredBin = process.env.TL_SOCIAL_SHADOW_PG_BIN?.trim() ?? "";
const BIN = resolve(configuredBin || "/");
const EXPECTED_VERSION = /^postgres \(PostgreSQL\) 17\.11(?: \(Postgres\.app\))?$/;
const ACK = "LOCAL_EMPTY_CLUSTER_ONLY";

if (!configuredBin || BIN === "/" || basename(BIN) !== "bin") {
  throw new Error("TL_SOCIAL_SHADOW_PG_BIN_REQUIRED");
}

function command(executable: string, args: string[], options: {
  env?: NodeJS.ProcessEnv;
  expectedExit?: number;
  capture?: boolean;
} = {}) {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: ROOT,
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    if (options.capture) {
      child.stdout?.on("data", (chunk) => { output += String(chunk); });
      child.stderr?.on("data", (chunk) => { output += String(chunk); });
    }
    child.once("error", reject);
    child.once("exit", (code) => {
      const expected = options.expectedExit ?? 0;
      if (code !== expected) {
        reject(new Error(`TL_SOCIAL_SHADOW_040_COMMAND_FAILED:${basename(executable)}:${code}\n${output}`));
      } else resolvePromise(output.trim());
    });
  });
}

function startCapturedCommand(executable: string, args: string[], options: {
  env?: NodeJS.ProcessEnv;
}) {
  const child = spawn(executable, args, {
    cwd: ROOT,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += String(chunk); });
  child.stderr?.on("data", (chunk) => { output += String(chunk); });
  const completed = new Promise<{ code: number | null; output: string }>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise({ code, output }));
  });
  return { child, completed, output: () => output };
}

async function ephemeralPort() {
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePromise(port));
    });
  });
}

const SHADOW_TMP_ROOT = "/tmp";
const root = mkdtempSync(join(SHADOW_TMP_ROOT, "tls040-"));
const data = join(root, "data");
const socket = join(root, "socket");
const postgres = join(BIN, "postgres");
const initdb = join(BIN, "initdb");
const pgCtl = join(BIN, "pg_ctl");
const createdb = join(BIN, "createdb");
const psql = join(BIN, "psql");
const port = await ephemeralPort();
const database = `touchline_social_shadow_039_executor_${process.pid}`.toLowerCase();
let started = false;

function databaseEnv(): NodeJS.ProcessEnv {
  return {
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGDATABASE: database,
    PGOPTIONS: `-c touchline.shadow_039_ack=${ACK} -c touchline.shadow_039_database=${database}`,
  };
}

async function psqlFile(file: string, expectedExit = 0) {
  return command(psql, ["-v", "ON_ERROR_STOP=1", "-f", resolve(ROOT, file)], {
    env: databaseEnv(),
    expectedExit,
    capture: true,
  });
}

async function psqlText(sql: string, expectedExit = 0) {
  return command(psql, ["-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    env: databaseEnv(),
    expectedExit,
    capture: true,
  });
}

async function waitForSqlValue(sql: string, expected: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let observed = "";
  while (Date.now() < deadline) {
    observed = (await psqlText(sql)).trim();
    if (observed === expected) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(`TL_SOCIAL_SHADOW_040_WAIT_TIMEOUT:${expected}:${observed}`);
}

async function waitForCapturedOutput(
  process: ReturnType<typeof startCapturedCommand>,
  expected: string,
  timeoutMs = 5_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.output().includes(expected)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(`TL_SOCIAL_SHADOW_040_PROCESS_WAIT_TIMEOUT:${expected}:${process.output()}`);
}

function jsonResult(output: string) {
  const line = output.split("\n").map((value) => value.trim()).filter(Boolean).at(-1) ?? "";
  return JSON.parse(line) as Record<string, unknown>;
}

try {
  const version = await command(postgres, ["--version"], { capture: true });
  if (!EXPECTED_VERSION.test(version)) {
    throw new Error(`TL_SOCIAL_SHADOW_040_POSTGRES_VERSION_MISMATCH:${version}`);
  }
  mkdirSync(socket);
  await command(initdb, [
    "-D", data, "--auth-local=trust", "--auth-host=trust", "--no-locale", "--encoding=UTF8",
  ], { capture: true });
  await command(pgCtl, [
    "-D", data, "-o", `-h 127.0.0.1 -p ${port} -k ${socket}`, "-w", "start",
  ], { capture: true });
  started = true;
  await command(createdb, [database], {
    env: { PGHOST: "127.0.0.1", PGPORT: String(port) },
    capture: true,
  });
  await psqlFile("supabase/tests/039_shadow_local_bootstrap.sql");
  await psqlFile("supabase/qa/039_touchline_qa_social_approval_outbox.sql");
  await psqlFile("supabase/tests/039_shadow_concurrency_setup.sql");
  await psqlFile("supabase/qa/040_touchline_qa_social_draft_executor.sql");

  const secondApply = await psqlFile("supabase/qa/040_touchline_qa_social_draft_executor.sql", 3);
  if (!secondApply.includes("TL_SOCIAL_EXECUTOR_040_SCHEMA_PRECONDITION_FAILED")) {
    throw new Error("TL_SOCIAL_SHADOW_040_SECOND_APPLY_NOT_FAIL_CLOSED");
  }

  const grantState = await psqlText([
    "select",
    "(has_table_privilege('service_role', 'public.touchline_social_generation_jobs', 'select'))::int || '|' ||",
    "(has_table_privilege('authenticated', 'public.touchline_social_generation_jobs', 'select'))::int || '|' ||",
    "(has_function_privilege('service_role', 'public.touchline_social_claim_generation_job(uuid)', 'execute'))::int || '|' ||",
    "(has_function_privilege('authenticated', 'public.touchline_social_claim_generation_job(uuid)', 'execute'))::int || '|' ||",
    "(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace",
    " where n.nspname='public' and c.relname in ('touchline_social_generation_jobs','touchline_social_executor_cycles')",
    " and c.relrowsecurity and c.relforcerowsecurity)::text",
  ].join(" "));
  if (grantState.trim() !== "1|0|1|0|2") {
    throw new Error(`TL_SOCIAL_SHADOW_040_GRANTS_RLS_FAILED:${grantState}`);
  }

  const schedulerClaimOutput = await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('SCHEDULER')",
  ].join("; "));
  const schedulerClaim = jsonResult(schedulerClaimOutput);
  const schedulerLease = String(schedulerClaim.leaseToken ?? "");
  if (schedulerClaim.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(schedulerLease)) {
    throw new Error("TL_SOCIAL_SHADOW_040_SCHEDULER_CLAIM_FAILED");
  }
  const concurrentSchedulerClaim = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('SCHEDULER')",
  ].join("; ")));
  if (concurrentSchedulerClaim.outcome !== "busy") {
    throw new Error("TL_SOCIAL_SHADOW_040_SCHEDULER_SINGLE_FLIGHT_FAILED");
  }

  const runtimeLockHolder = startCapturedCommand(psql, [
    "-v", "ON_ERROR_STOP=1", "-At", "-c", [
      "begin",
      "lock table public.touchline_social_executor_cycles in share row exclusive mode",
      "select pg_sleep(2)",
      "lock table public.touchline_social_generation_jobs in share row exclusive mode",
      "commit",
    ].join("; "),
  ], { env: databaseEnv() });
  await waitForSqlValue([
    "select count(*)::text from pg_catalog.pg_locks",
    "where relation='public.touchline_social_executor_cycles'::regclass",
    "and mode='ShareRowExclusiveLock' and granted",
  ].join(" "), "1");
  const concurrentRollback = startCapturedCommand(psql, [
    "-v", "ON_ERROR_STOP=1", "-f",
    resolve(ROOT, "supabase/qa/040_touchline_qa_social_draft_executor_rollback.sql"),
  ], { env: databaseEnv() });
  await waitForSqlValue([
    "with waiting as (select pid from pg_catalog.pg_locks",
    "where relation='public.touchline_social_executor_cycles'::regclass",
    "and mode='AccessExclusiveLock' and not granted)",
    "select (select count(*) from waiting)::text || '|' ||",
    "(select count(*) from pg_catalog.pg_locks job_lock join waiting using (pid)",
    "where job_lock.relation='public.touchline_social_generation_jobs'::regclass)::text",
  ].join(" "), "1|0");
  const lockHolderResult = await runtimeLockHolder.completed;
  if (lockHolderResult.code !== 0) {
    throw new Error(`TL_SOCIAL_SHADOW_040_RUNTIME_LOCK_HOLDER_FAILED:${lockHolderResult.output}`);
  }
  const concurrentRollbackResult = await concurrentRollback.completed;
  if (concurrentRollbackResult.code !== 3
    || !concurrentRollbackResult.output.includes("TL_SOCIAL_EXECUTOR_040_ROLLBACK_ACTIVE_LEASE")) {
    throw new Error(
      `TL_SOCIAL_SHADOW_040_ROLLBACK_TWO_SESSION_FAILED:${concurrentRollbackResult.code}:${concurrentRollbackResult.output}`,
    );
  }

  const sourceIdentity = (await psqlText([
    "select review.first_observed_at::text || '|' || review.input_checksum || '|' ||",
    "review.source_revision_manifest::text || '|' || review.source_revision_checksum || '|' || draft.id::text",
    "from public.touchline_social_generation_reviews review",
    "join public.touchline_social_publication_drafts draft on draft.id=review.generated_draft_id",
    "where review.fixture_provider_id='19722192' and review.team_provider_id='19'",
  ].join(" "))).trim().split("|");
  const [firstObservedAt, inputChecksum, sourceManifest, sourceRevisionChecksum, draftId] = sourceIdentity;
  if (!/^sha256:[0-9a-f]{64}$/.test(inputChecksum)
    || !/^sha256:[0-9a-f]{64}$/.test(sourceRevisionChecksum)
    || !/^[0-9a-f-]{36}$/i.test(draftId)) {
    throw new Error("TL_SOCIAL_SHADOW_040_SOURCE_IDENTITY_INVALID");
  }
  const enqueueSql = (leaseToken: string, teamId = "19") => [
    "set role service_role",
    [
      "select public.touchline_social_enqueue_generation_job(",
      `'${leaseToken}'::uuid, '19722192', '${teamId}', 'touchline-lineup-feed-v1',`,
      `'${firstObservedAt}'::timestamptz, clock_timestamp() + interval '1 hour', '${inputChecksum}',`,
      `$manifest$${sourceManifest}$manifest$::jsonb, '${sourceRevisionChecksum}')`,
    ].join(" "),
  ].join("; ");
  const enqueueResults = await Promise.all([
    psqlText(enqueueSql(schedulerLease)),
    psqlText(enqueueSql(schedulerLease)),
  ]);
  if (enqueueResults.some((output) => !/"jobId"/.test(output))) {
    throw new Error("TL_SOCIAL_SHADOW_040_ENQUEUE_RESULT_INVALID");
  }
  const idempotentCount = await psqlText([
    "select count(*) from public.touchline_social_generation_jobs",
    "where fixture_provider_id='19722192' and team_provider_id='19'",
  ].join(" "));
  if (idempotentCount.trim() !== "1") {
    throw new Error(`TL_SOCIAL_SHADOW_040_ENQUEUE_NOT_IDEMPOTENT:${idempotentCount}`);
  }
  const retryEnqueue = jsonResult(await psqlText([
    "set role service_role",
    [
      "select public.touchline_social_enqueue_generation_job(",
      `'${schedulerLease}'::uuid, '19722192', '20', 'touchline-lineup-feed-v1',`,
      `'${firstObservedAt}'::timestamptz, clock_timestamp() + interval '2 hours', '${inputChecksum}',`,
      `$manifest$${sourceManifest}$manifest$::jsonb, '${sourceRevisionChecksum}')`,
    ].join(" "),
  ].join("; ")));
  if (retryEnqueue.outcome !== "queued" || !/^[0-9a-f-]{36}$/i.test(String(retryEnqueue.jobId ?? ""))) {
    throw new Error("TL_SOCIAL_SHADOW_040_RETRY_JOB_ENQUEUE_FAILED");
  }
  await psqlText([
    "set role service_role",
    `select public.touchline_social_complete_executor_cycle('SCHEDULER','${schedulerLease}'::uuid,'SUCCESS',null,2)`,
  ].join("; "));

  const runnerClaim = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('RUNNER')",
  ].join("; ")));
  const runnerLease = String(runnerClaim.leaseToken ?? "");
  if (runnerClaim.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(runnerLease)) {
    throw new Error("TL_SOCIAL_SHADOW_040_RUNNER_CLAIM_FAILED");
  }
  const runnerBusy = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('RUNNER')",
  ].join("; ")));
  if (runnerBusy.outcome !== "busy") throw new Error("TL_SOCIAL_SHADOW_040_RUNNER_SINGLE_FLIGHT_FAILED");

  const jobClaim = jsonResult(await psqlText([
    "set role service_role",
    `select public.touchline_social_claim_generation_job('${runnerLease}'::uuid)`,
  ].join("; ")));
  const jobId = String(jobClaim.jobId ?? "");
  const jobLease = String(jobClaim.leaseToken ?? "");
  if (jobClaim.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(jobId) || !/^[0-9a-f-]{36}$/i.test(jobLease)) {
    throw new Error("TL_SOCIAL_SHADOW_040_JOB_CLAIM_FAILED");
  }
  await psqlText([
    "set role service_role",
    `select public.touchline_social_renew_executor_cycle('RUNNER','${runnerLease}'::uuid)`,
    `select public.touchline_social_renew_generation_job('${runnerLease}'::uuid,'${jobId}'::uuid,'${jobLease}'::uuid)`,
  ].join("; "));
  await psqlText([
    "set role service_role",
    [
      "select public.touchline_social_complete_generation_job(",
      `'${runnerLease}'::uuid,'${jobId}'::uuid,'${jobLease}'::uuid,`,
      `'COMPLETED','IMMUTABLE_DRAFT_READY','${draftId}'::uuid)`,
    ].join(" "),
  ].join("; "));
  const completedState = await psqlText([
    "select job_state || '|' || attempt_count::text || '|' || generated_draft_id::text",
    `from public.touchline_social_generation_jobs where id='${jobId}'::uuid`,
  ].join(" "));
  if (completedState.trim() !== `COMPLETED|1|${draftId}`) {
    throw new Error(`TL_SOCIAL_SHADOW_040_JOB_COMPLETION_FAILED:${completedState}`);
  }
  const retryJobClaim = jsonResult(await psqlText([
    "set role service_role",
    `select public.touchline_social_claim_generation_job('${runnerLease}'::uuid)`,
  ].join("; ")));
  const retryJobId = String(retryJobClaim.jobId ?? "");
  const retryJobLease = String(retryJobClaim.leaseToken ?? "");
  if (retryJobClaim.outcome !== "claimed"
    || !/^[0-9a-f-]{36}$/i.test(retryJobId)
    || !/^[0-9a-f-]{36}$/i.test(retryJobLease)) {
    throw new Error("TL_SOCIAL_SHADOW_040_RETRY_JOB_CLAIM_FAILED");
  }
  await psqlText([
    "set role service_role",
    [
      "select public.touchline_social_complete_generation_job(",
      `'${runnerLease}'::uuid,'${retryJobId}'::uuid,'${retryJobLease}'::uuid,`,
      "'RETRY','DETERMINISTIC_RENDER_FAILURE',null)",
    ].join(" "),
  ].join("; "));
  const retryState = await psqlText([
    "select job_state || '|' || attempt_count::text || '|' || reason_code || '|' || last_error_code",
    `from public.touchline_social_generation_jobs where id='${retryJobId}'::uuid`,
  ].join(" "));
  if (retryState.trim() !== "RETRY_WAIT|1|DETERMINISTIC_RENDER_FAILURE|DETERMINISTIC_RENDER_FAILURE") {
    throw new Error(`TL_SOCIAL_SHADOW_040_RETRY_STATE_FAILED:${retryState}`);
  }
  await psqlText([
    "select set_config('touchline.social_executor_transition','recover_job',true)",
    [
      "update public.touchline_social_generation_jobs",
      "set job_state='RUNNING', reason_code='GENERATION_IN_PROGRESS', next_eligible_at=null,",
      `lease_token='${retryJobLease}'::uuid,`,
      "lease_expires_at=clock_timestamp()-interval '1 second',",
      "lease_heartbeat_at=clock_timestamp()-interval '1 minute'",
      `where id='${retryJobId}'::uuid`,
    ].join(" "),
  ].join("; "));
  const expiredJobRecovery = jsonResult(await psqlText([
    "set role service_role",
    `select public.touchline_social_claim_generation_job('${runnerLease}'::uuid)`,
  ].join("; ")));
  if (expiredJobRecovery.outcome !== "empty") {
    throw new Error("TL_SOCIAL_SHADOW_040_EXPIRED_JOB_RECOVERY_CLAIM_FAILED");
  }
  const expiredJobState = await psqlText([
    "select job_state || '|' || reason_code || '|' || last_error_code",
    `from public.touchline_social_generation_jobs where id='${retryJobId}'::uuid`,
  ].join(" "));
  if (expiredJobState.trim() !== "RETRY_WAIT|GENERATION_LEASE_EXPIRED|GENERATION_LEASE_EXPIRED") {
    throw new Error(`TL_SOCIAL_SHADOW_040_EXPIRED_JOB_RECOVERY_FAILED:${expiredJobState}`);
  }
  await psqlText([
    "set role service_role",
    `select public.touchline_social_complete_executor_cycle('RUNNER','${runnerLease}'::uuid,'SUCCESS',null,1)`,
  ].join("; "));

  const ownerId = "60277b78-1e65-4e2e-89f0-67e7b819ed24";
  const artifactChecksum = `sha256:${"2".repeat(64)}`;
  const manifestChecksum = `sha256:${"3".repeat(64)}`;
  const issueArtworkIntent = async () => {
    const issued = jsonResult(await psqlText([
      "set role service_role",
      [
        "select public.touchline_social_issue_review_intent(",
        `'${draftId}'::uuid,'ARTWORK','${artifactChecksum}','${manifestChecksum}',`,
        `'${inputChecksum}','${sourceRevisionChecksum}','${ownerId}'::uuid)`,
      ].join(" "),
    ].join("; ")));
    const intentId = String(issued.intentId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(intentId)) {
      throw new Error("TL_SOCIAL_SHADOW_040_APPROVAL_INTENT_INVALID");
    }
    return intentId;
  };
  const approveArtworkSql = (intentId: string) => [
    "set role authenticated",
    `set request.jwt.claim.sub='${ownerId}'`,
    [
      "select public.touchline_social_approve_artwork(",
      `'${intentId}'::uuid,'${draftId}'::uuid,'${artifactChecksum}','${manifestChecksum}',`,
      `'${inputChecksum}','${sourceRevisionChecksum}','${ownerId}'::uuid)`,
    ].join(" "),
  ].join("; ");
  const claimFreshScheduler = async (failureCode: string) => {
    await psqlText([
      "select set_config('touchline.social_executor_transition','claim',true)",
      "update public.touchline_social_executor_cycles set next_eligible_at='-infinity'::timestamptz where component='SCHEDULER'",
    ].join("; "));
    const claim = jsonResult(await psqlText([
      "set role service_role",
      "select public.touchline_social_claim_executor_cycle('SCHEDULER')",
    ].join("; ")));
    const leaseToken = String(claim.leaseToken ?? "");
    if (claim.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(leaseToken)) {
      throw new Error(failureCode);
    }
    return leaseToken;
  };
  const generationLock = [
    "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(",
    "'touchline-social-generation:19722192:19:touchline-lineup-feed-v1', 0))",
  ].join(" ");
  const runSchedulerApprovalLockOrderRace = async (input: {
    name: string;
    leaseToken: string;
    actorRole: "service_role" | "authenticated";
    operationSql: string;
  }) => {
    const actorSetup = input.actorRole === "authenticated"
      ? [`set role authenticated`, `set request.jwt.claim.sub='${ownerId}'`]
      : ["set role service_role"];
    const approvalSession = startCapturedCommand(psql, [
      "-v", "ON_ERROR_STOP=1", "-At", "-c", [
        "set deadlock_timeout='100ms'",
        "set statement_timeout='5s'",
        ...actorSetup,
        "begin",
        generationLock,
        `select 'TL_040_${input.name}_GENERATION_LOCK_HELD'`,
        "select pg_sleep(0.5)",
        input.operationSql,
        "commit",
      ].join("; "),
    ], { env: databaseEnv() });
    await waitForCapturedOutput(approvalSession, `TL_040_${input.name}_GENERATION_LOCK_HELD`);
    const enqueueSession = startCapturedCommand(psql, [
      "-v", "ON_ERROR_STOP=1", "-At", "-c", [
        "set deadlock_timeout='100ms'",
        "set statement_timeout='5s'",
        enqueueSql(input.leaseToken),
      ].join("; "),
    ], { env: databaseEnv() });
    const [approvalResult, enqueueResult] = await Promise.all([
      approvalSession.completed,
      enqueueSession.completed,
    ]);
    const combined = `${approvalResult.output}\n${enqueueResult.output}`;
    if (combined.includes("deadlock detected")) {
      throw new Error(`TL_SOCIAL_SHADOW_040_${input.name}_DEADLOCK:${combined}`);
    }
    if (approvalResult.code === 0
      || !approvalResult.output.includes("TL_SOCIAL_EXECUTOR_APPROVAL_HEALTH_UNSAFE")) {
      throw new Error(
        `TL_SOCIAL_SHADOW_040_${input.name}_APPROVAL_NOT_FAIL_CLOSED:${approvalResult.code}:${approvalResult.output}`,
      );
    }
    if (enqueueResult.code !== 0 || !enqueueResult.output.includes('"jobId"')) {
      throw new Error(
        `TL_SOCIAL_SHADOW_040_${input.name}_ENQUEUE_FAILED:${enqueueResult.code}:${enqueueResult.output}`,
      );
    }
  };

  const healthRaceIntent = await issueArtworkIntent();
  await psqlText([
    "select set_config('touchline.social_executor_transition','claim',true)",
    "update public.touchline_social_executor_cycles set next_eligible_at='-infinity'::timestamptz where component='SCHEDULER'",
  ].join("; "));
  const unhealthyScheduler = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('SCHEDULER')",
  ].join("; ")));
  const unhealthySchedulerLease = String(unhealthyScheduler.leaseToken ?? "");
  if (unhealthyScheduler.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(unhealthySchedulerLease)) {
    throw new Error("TL_SOCIAL_SHADOW_040_APPROVAL_HEALTH_RACE_CLAIM_FAILED");
  }
  await psqlText([
    "set role service_role",
    `select public.touchline_social_complete_executor_cycle('SCHEDULER','${unhealthySchedulerLease}'::uuid,'FAILURE','DETERMINISTIC_HEALTH_RACE',0)`,
  ].join("; "));
  const healthRaceFailure = await psqlText(approveArtworkSql(healthRaceIntent), 1);
  if (!healthRaceFailure.includes("TL_SOCIAL_EXECUTOR_APPROVAL_HEALTH_UNSAFE")) {
    throw new Error("TL_SOCIAL_SHADOW_040_APPROVAL_HEALTH_RACE_NOT_BLOCKED");
  }
  await psqlText([
    "select set_config('touchline.social_executor_transition','claim',true)",
    "update public.touchline_social_executor_cycles set next_eligible_at='-infinity'::timestamptz where component='SCHEDULER'",
  ].join("; "));
  const restoredScheduler = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('SCHEDULER')",
  ].join("; ")));
  const restoredSchedulerLease = String(restoredScheduler.leaseToken ?? "");
  if (restoredScheduler.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(restoredSchedulerLease)) {
    throw new Error("TL_SOCIAL_SHADOW_040_APPROVAL_HEALTH_RESTORE_CLAIM_FAILED");
  }
  await psqlText([
    "set role service_role",
    `select public.touchline_social_complete_executor_cycle('SCHEDULER','${restoredSchedulerLease}'::uuid,'SUCCESS',null,0)`,
  ].join("; "));

  const jobRaceIntent = await issueArtworkIntent();
  await psqlText([
    "select set_config('touchline.social_executor_transition','complete_job',true)",
    [
      "update public.touchline_social_generation_jobs",
      "set job_state='SUPERSEDED', reason_code='OFFICIAL_SOURCE_REVISION_CHANGED',",
      "generated_draft_id=null, last_error_code='OFFICIAL_SOURCE_REVISION_CHANGED', completed_at=clock_timestamp()",
      `where id='${jobId}'::uuid`,
    ].join(" "),
  ].join("; "));
  const jobRaceFailure = await psqlText(approveArtworkSql(jobRaceIntent), 1);
  if (!jobRaceFailure.includes("TL_SOCIAL_EXECUTOR_APPROVAL_JOB_UNSAFE")) {
    throw new Error("TL_SOCIAL_SHADOW_040_APPROVAL_JOB_RACE_NOT_BLOCKED");
  }
  await psqlText([
    "select set_config('touchline.social_executor_transition','complete_job',true)",
    [
      "update public.touchline_social_generation_jobs",
      "set job_state='COMPLETED', reason_code='IMMUTABLE_DRAFT_READY',",
      `generated_draft_id='${draftId}'::uuid, last_error_code=null, completed_at=clock_timestamp()`,
      `where id='${jobId}'::uuid`,
    ].join(" "),
  ].join("; "));

  const intentRaceSchedulerLease = await claimFreshScheduler(
    "TL_SOCIAL_SHADOW_040_SCHEDULER_INTENT_RACE_CLAIM_FAILED",
  );
  await runSchedulerApprovalLockOrderRace({
    name: "INTENT",
    leaseToken: intentRaceSchedulerLease,
    actorRole: "service_role",
    operationSql: [
      "select public.touchline_social_issue_review_intent(",
      `'${draftId}'::uuid,'ARTWORK','${artifactChecksum}','${manifestChecksum}',`,
      `'${inputChecksum}','${sourceRevisionChecksum}','${ownerId}'::uuid)`,
    ].join(" "),
  });
  await psqlText([
    "set role service_role",
    `select public.touchline_social_complete_executor_cycle('SCHEDULER','${intentRaceSchedulerLease}'::uuid,'SUCCESS',null,1)`,
  ].join("; "));

  const approvalLockOrderIntent = await issueArtworkIntent();
  const approvalRaceSchedulerLease = await claimFreshScheduler(
    "TL_SOCIAL_SHADOW_040_SCHEDULER_APPROVAL_RACE_CLAIM_FAILED",
  );
  await runSchedulerApprovalLockOrderRace({
    name: "APPROVAL",
    leaseToken: approvalRaceSchedulerLease,
    actorRole: "authenticated",
    operationSql: [
      "select public.touchline_social_approve_artwork(",
      `'${approvalLockOrderIntent}'::uuid,'${draftId}'::uuid,'${artifactChecksum}','${manifestChecksum}',`,
      `'${inputChecksum}','${sourceRevisionChecksum}','${ownerId}'::uuid)`,
    ].join(" "),
  });
  await psqlText([
    "set role service_role",
    `select public.touchline_social_complete_executor_cycle('SCHEDULER','${approvalRaceSchedulerLease}'::uuid,'SUCCESS',null,1)`,
  ].join("; "));

  const validIntent = await issueArtworkIntent();
  const approvedArtwork = jsonResult(await psqlText(approveArtworkSql(validIntent)));
  if (approvedArtwork.review !== "ARTWORK" || approvedArtwork.draftId !== draftId) {
    throw new Error("TL_SOCIAL_SHADOW_040_APPROVAL_GATE_VALID_PATH_FAILED");
  }

  const directMutationFailure = await psqlText(
    `update public.touchline_social_generation_jobs set reason_code='BYPASS' where id='${jobId}'::uuid`,
    1,
  );
  if (!directMutationFailure.includes("TL_SOCIAL_GENERATION_JOB_RPC_REQUIRED")) {
    throw new Error("TL_SOCIAL_SHADOW_040_DIRECT_MUTATION_NOT_BLOCKED");
  }

  await psqlText([
    "select set_config('touchline.social_executor_transition','claim',true)",
    "update public.touchline_social_executor_cycles set next_eligible_at='-infinity'::timestamptz where component='SCHEDULER'",
  ].join("; "));
  const recoveryScheduler = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('SCHEDULER')",
  ].join("; ")));
  const recoverySchedulerLease = String(recoveryScheduler.leaseToken ?? "");
  if (recoveryScheduler.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(recoverySchedulerLease)) {
    throw new Error("TL_SOCIAL_SHADOW_040_RECOVERY_SCHEDULER_CLAIM_FAILED");
  }
  await psqlText([
    "select set_config('touchline.social_executor_transition','renew',true)",
    "update public.touchline_social_executor_cycles set lease_expires_at=clock_timestamp()-interval '1 second' where component='SCHEDULER'",
  ].join("; "));
  const recoveredTimeout = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('SCHEDULER')",
  ].join("; ")));
  if (recoveredTimeout.outcome !== "recovered_timeout") {
    throw new Error("TL_SOCIAL_SHADOW_040_TIMEOUT_RECOVERY_FAILED");
  }
  const recoveryState = await psqlText([
    "select last_outcome || '|' || last_error_code || '|' || timeout_recovery_count::text",
    "from public.touchline_social_executor_cycles where component='SCHEDULER'",
  ].join(" "));
  if (recoveryState.trim() !== "FAILURE|SCHEDULER_LEASE_EXPIRED|1") {
    throw new Error(`TL_SOCIAL_SHADOW_040_TIMEOUT_OBSERVABILITY_FAILED:${recoveryState}`);
  }
  const staleSchedulerCleanup = await psqlText(
    `select public.touchline_social_complete_executor_cycle('SCHEDULER','${recoverySchedulerLease}'::uuid,'FAILURE','TL_SOCIAL_SCHEDULER_RENEW_TIMEOUT',0)`,
    1,
  );
  if (!staleSchedulerCleanup.includes("TL_SOCIAL_EXECUTOR_LEASE_INVALID")) {
    throw new Error("TL_SOCIAL_SHADOW_040_STALE_SCHEDULER_CLEANUP_NOT_FENCED");
  }

  await psqlText([
    "select set_config('touchline.social_executor_transition','claim',true)",
    "update public.touchline_social_executor_cycles set next_eligible_at='-infinity'::timestamptz where component='RUNNER'",
  ].join("; "));
  const recoveryRunner = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('RUNNER')",
  ].join("; ")));
  const recoveryRunnerLease = String(recoveryRunner.leaseToken ?? "");
  if (recoveryRunner.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(recoveryRunnerLease)) {
    throw new Error("TL_SOCIAL_SHADOW_040_RECOVERY_RUNNER_CLAIM_FAILED");
  }
  await psqlText([
    "select set_config('touchline.social_executor_transition','renew',true)",
    "update public.touchline_social_executor_cycles set lease_expires_at=clock_timestamp()-interval '1 second' where component='RUNNER'",
  ].join("; "));
  const recoveredRunnerTimeout = jsonResult(await psqlText([
    "set role service_role",
    "select public.touchline_social_claim_executor_cycle('RUNNER')",
  ].join("; ")));
  if (recoveredRunnerTimeout.outcome !== "recovered_timeout") {
    throw new Error("TL_SOCIAL_SHADOW_040_RUNNER_TIMEOUT_RECOVERY_FAILED");
  }
  const staleRunnerCleanup = await psqlText(
    `select public.touchline_social_complete_executor_cycle('RUNNER','${recoveryRunnerLease}'::uuid,'FAILURE','TL_SOCIAL_RUNNER_RENEW_TIMEOUT',0)`,
    1,
  );
  if (!staleRunnerCleanup.includes("TL_SOCIAL_EXECUTOR_LEASE_INVALID")) {
    throw new Error("TL_SOCIAL_SHADOW_040_STALE_RUNNER_CLEANUP_NOT_FENCED");
  }

  const rollbackGuard = await psqlFile(
    "supabase/qa/040_touchline_qa_social_draft_executor_rollback.sql",
    3,
  );
  if (!rollbackGuard.includes("TL_SOCIAL_EXECUTOR_040_ROLLBACK_REQUIRES_EMPTY_AUDIT_TABLES")) {
    throw new Error("TL_SOCIAL_SHADOW_040_ROLLBACK_GUARD_FAILED");
  }
  await psqlText([
    "alter table public.touchline_social_generation_jobs disable trigger touchline_social_generation_jobs_guard",
    "alter table public.touchline_social_executor_cycles disable trigger touchline_social_executor_cycles_guard",
    "truncate table public.touchline_social_generation_jobs, public.touchline_social_executor_cycles",
  ].join("; "));
  await psqlFile("supabase/qa/040_touchline_qa_social_draft_executor_rollback.sql");
  const rollbackState = await psqlText([
    "select (to_regclass('public.touchline_social_generation_jobs') is null)::int || '|' ||",
    "(to_regclass('public.touchline_social_executor_cycles') is null)::int || '|' ||",
    "(to_regclass('public.touchline_social_publication_drafts') is not null)::int",
  ].join(" "));
  if (rollbackState.trim() !== "1|1|1") {
    throw new Error(`TL_SOCIAL_SHADOW_040_ROLLBACK_INCOMPLETE:${rollbackState}`);
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    postgresVersion: version,
    database,
    port,
    migrationSecondApply: "FAIL_CLOSED",
    rlsAndGrants: "PASS",
    schedulerSingleFlight: "PASS",
    rollbackTwoSessionLockOrder: "PASS",
    schedulerEnqueueIntentLockOrder: "PASS",
    schedulerEnqueueApprovalLockOrder: "PASS",
    queueIdempotency: "PASS",
    runnerSingleFlight: "PASS",
    leaseRenewal: "PASS",
    exactDraftCompletion: "PASS",
    approvalIntentHealthRace: "FAIL_CLOSED",
    approvalIntentJobRace: "FAIL_CLOSED",
    boundedRetry: "PASS",
    expiredJobRecovery: "PASS",
    directMutation: "FAIL_CLOSED",
    timeoutRecovery: "PASS",
    staleSchedulerCleanup: "FAIL_CLOSED",
    staleRunnerCleanup: "FAIL_CLOSED",
    rollbackWithAudit: "FAIL_CLOSED",
    emptyRollback: "PASS",
  }, null, 2)}\n`);
} finally {
  if (started) {
    await command(pgCtl, ["-D", data, "-m", "fast", "-w", "stop"], { capture: true }).catch(() => "");
  }
  if (!root.startsWith(`${SHADOW_TMP_ROOT}/tls040-`)) {
    throw new Error("TL_SOCIAL_SHADOW_040_TEMP_ROOT_INVALID");
  }
  rmSync(root, { recursive: true, force: true });
}
