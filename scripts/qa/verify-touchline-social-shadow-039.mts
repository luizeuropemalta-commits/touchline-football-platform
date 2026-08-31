import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "../..");
const configuredBin = process.env.TL_SOCIAL_SHADOW_PG_BIN?.trim() ?? "";
const BIN = resolve(configuredBin || "/");
const EXPECTED_VERSION = /^postgres \(PostgreSQL\) 17\.11(?: \(Postgres\.app\))?$/;
const ACK = "LOCAL_EMPTY_CLUSTER_ONLY";
const OWNER_ID = "60277b78-1e65-4e2e-89f0-67e7b819ed24";

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
      if (code !== expected) reject(new Error(`TL_SOCIAL_SHADOW_COMMAND_FAILED:${basename(executable)}:${code}\n${output}`));
      else resolvePromise(output.trim());
    });
  });
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

// Keep the Unix-domain socket path below PostgreSQL's 103-byte macOS limit.
const SHADOW_TMP_ROOT = "/tmp";
const root = mkdtempSync(join(SHADOW_TMP_ROOT, "tls039-"));
const data = join(root, "data");
const socket = join(root, "socket");
const postgres = join(BIN, "postgres");
const initdb = join(BIN, "initdb");
const pgCtl = join(BIN, "pg_ctl");
const createdb = join(BIN, "createdb");
const psql = join(BIN, "psql");
const port = await ephemeralPort();
let started = false;

function databaseName(label: string) {
  return `touchline_social_shadow_039_${label}_${process.pid}`.toLowerCase();
}

function databaseEnv(database: string): NodeJS.ProcessEnv {
  return {
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGDATABASE: database,
    PGOPTIONS: `-c touchline.shadow_039_ack=${ACK} -c touchline.shadow_039_database=${database}`,
  };
}

async function psqlFile(database: string, file: string, expectedExit = 0) {
  return command(psql, ["-v", "ON_ERROR_STOP=1", "-f", resolve(ROOT, file)], {
    env: databaseEnv(database),
    expectedExit,
    capture: true,
  });
}

async function psqlText(database: string, sql: string, expectedExit = 0) {
  return command(psql, ["-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    env: databaseEnv(database),
    expectedExit,
    capture: true,
  });
}

async function psqlTextWithApplication(database: string, sql: string, applicationName: string) {
  return command(psql, ["-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    env: { ...databaseEnv(database), PGAPPNAME: applicationName },
    capture: true,
  });
}

async function waitForSqlAssertion(
  database: string,
  sql: string,
  predicate: (value: string) => boolean,
  label: string,
  timeoutMs = 3_000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = "";
  while (Date.now() < deadline) {
    lastValue = (await psqlText(database, sql)).trim();
    if (predicate(lastValue)) return lastValue;
    await new Promise<void>((resolvePromise) => globalThis.setTimeout(resolvePromise, 25));
  }
  throw new Error(`TL_SOCIAL_SHADOW_ASSERTION_TIMEOUT:${label}:${lastValue}`);
}

try {
  const version = await command(postgres, ["--version"], { capture: true });
  if (!EXPECTED_VERSION.test(version)) throw new Error(`TL_SOCIAL_SHADOW_POSTGRES_VERSION_MISMATCH:${version}`);
  mkdirSync(socket);
  await command(initdb, ["-D", data, "--auth-local=trust", "--auth-host=trust", "--no-locale", "--encoding=UTF8"], { capture: true });
  await command(pgCtl, ["-D", data, "-o", `-h 127.0.0.1 -p ${port} -k ${socket}`, "-w", "start"], { capture: true });
  started = true;

  const concurrencyDatabase = databaseName("concurrency");
  const rollbackDatabase = databaseName("rollback");
  const rollbackAuditDatabase = databaseName("rollback_audit_guard");
  const rollbackBucketDatabase = databaseName("rollback_bucket_guard");
  for (const database of [
    concurrencyDatabase,
    rollbackDatabase,
    rollbackAuditDatabase,
    rollbackBucketDatabase,
  ]) {
    await command(createdb, [database], { env: { PGHOST: "127.0.0.1", PGPORT: String(port) }, capture: true });
    await psqlFile(database, "supabase/tests/039_shadow_local_bootstrap.sql");
    await psqlFile(database, "supabase/qa/039_touchline_qa_social_approval_outbox.sql");
    await psqlFile(database, "supabase/tests/039_shadow_retry_verification.sql");
    await psqlFile(database, "supabase/tests/039_shadow_semantic_revision_verification.sql");
  }

  const secondApply = await psqlFile(
    rollbackDatabase,
    "supabase/qa/039_touchline_qa_social_approval_outbox.sql",
    3,
  );
  if (!secondApply.includes("TL_SOCIAL_039_REQUIRES_FRESH_SCHEMA")) {
    throw new Error("TL_SOCIAL_SHADOW_SECOND_APPLY_DID_NOT_FAIL_CLOSED");
  }

  await psqlFile(concurrencyDatabase, "supabase/tests/039_shadow_concurrency_setup.sql");
  const fixtureIdentity = (await psqlText(
    concurrencyDatabase,
    "select draft_id || '|' || artwork_intent_id || '|' || caption_intent_id || '|' || source_revision_checksum from public.shadow_039_concurrency_fixture limit 1",
  )).trim().split("|");
  const [draftId, artworkIntentId, captionIntentId, sourceRevisionChecksum] = fixtureIdentity;
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw new Error("TL_SOCIAL_SHADOW_CONCURRENCY_DRAFT_INVALID");
  if (!/^[0-9a-f-]{36}$/i.test(artworkIntentId) || !/^[0-9a-f-]{36}$/i.test(captionIntentId)) {
    throw new Error("TL_SOCIAL_SHADOW_CONCURRENCY_INTENT_INVALID");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(sourceRevisionChecksum)) {
    throw new Error("TL_SOCIAL_SHADOW_SOURCE_REVISION_INVALID");
  }
  const approvalPrefix = [
    "set role authenticated",
    `set request.jwt.claim.sub = '${OWNER_ID}'`,
  ];
  const artworkApprovalSql = [...approvalPrefix,
    `select public.touchline_social_approve_artwork('${artworkIntentId}'::uuid, '${draftId}'::uuid, 'sha256:${"2".repeat(64)}', 'sha256:${"3".repeat(64)}', 'sha256:${"1".repeat(64)}', '${sourceRevisionChecksum}', '${OWNER_ID}'::uuid)`,
  ].join("; ");
  const captionApprovalSql = [...approvalPrefix,
    `select public.touchline_social_approve_caption('${captionIntentId}'::uuid, '${draftId}'::uuid, 'sha256:${"4".repeat(64)}', 'sha256:${"3".repeat(64)}', 'sha256:${"1".repeat(64)}', '${sourceRevisionChecksum}', '${OWNER_ID}'::uuid)`,
  ].join("; ");
  await Promise.all([
    psqlText(concurrencyDatabase, artworkApprovalSql),
    psqlText(concurrencyDatabase, captionApprovalSql),
  ]);
  const approvalState = await psqlText(
    concurrencyDatabase,
    `select approval_state || '|' || artwork_approval_state || '|' || caption_approval_state from public.touchline_social_publication_drafts where id = '${draftId}'::uuid`,
  );
  if (approvalState.trim() !== "APPROVED|APPROVED|APPROVED") {
    throw new Error(`TL_SOCIAL_SHADOW_REAL_APPROVAL_CONCURRENCY_FAILED:${approvalState}`);
  }
  const enqueueSql = [
    "set role authenticated",
    `set request.jwt.claim.sub = '${OWNER_ID}'`,
    `select public.touchline_social_enqueue_dispatch('${draftId}'::uuid, 'TOUCHLINE_OFFICIAL_INSTAGRAM')`,
  ].join("; ");
  const [first, second] = await Promise.all([
    psqlText(concurrencyDatabase, enqueueSql),
    psqlText(concurrencyDatabase, enqueueSql),
  ]);
  const attemptCount = await psqlText(
    concurrencyDatabase,
    `select count(*) from public.touchline_social_dispatch_attempts where draft_id = '${draftId}'::uuid`,
  );
  if (attemptCount.trim() !== "1"
    || ![first, second].some((result) => result.includes('"outcome": "created"'))
    || ![first, second].some((result) => result.includes('"outcome": "already_pending"'))) {
    throw new Error(`TL_SOCIAL_SHADOW_REAL_CONCURRENCY_FAILED:${attemptCount}:${first}:${second}`);
  }

  const attemptIdentity = (await psqlText(
    concurrencyDatabase,
    `select id || '|' || idempotency_key from public.touchline_social_dispatch_attempts where draft_id = '${draftId}'::uuid`,
  )).trim().split("|");
  const [attemptId, attemptIdempotencyKey] = attemptIdentity;
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)
    || !/^sha256:[0-9a-f]{64}$/.test(attemptIdempotencyKey)) {
    throw new Error("TL_SOCIAL_SHADOW_ATTEMPT_IDENTITY_INVALID");
  }
  // A third session owns only the draft row. Enqueue must therefore acquire
  // its own source+generation advisory prefix before it waits on the draft;
  // claim must then acquire source and wait on enqueue's generation lock.
  // This proves the RPC order without pre-acquiring advisory locks on behalf
  // of either callable RPC.
  const draftBlockerApplication = `tl039_draft_blocker_${process.pid}`;
  const enqueueApplication = `tl039_enqueue_order_${process.pid}`;
  const claimApplication = `tl039_claim_order_${process.pid}`;
  const draftBlockerSql = [
    "set statement_timeout = '90s'",
    "begin",
    `select 1 from public.touchline_social_publication_drafts where id = '${draftId}'::uuid for update`,
    "select pg_sleep(60)",
    "rollback",
  ].join("; ");
  const enqueueFirstSql = [
    "set statement_timeout = '8s'",
    "begin",
    "set role authenticated",
    `set request.jwt.claim.sub = '${OWNER_ID}'`,
    `select public.touchline_social_enqueue_dispatch('${draftId}'::uuid, 'TOUCHLINE_OFFICIAL_INSTAGRAM')`,
    "rollback",
  ].join("; ");
  const claimWhileDraftLockedSql = [
    "set statement_timeout = '8s'",
    "set role service_role",
    "begin",
    `select public.touchline_social_claim_dispatch('${attemptId}'::uuid, '${attemptIdempotencyKey}')`,
    "rollback",
  ].join("; ");
  const draftBlockerCompletion = psqlTextWithApplication(
    concurrencyDatabase, draftBlockerSql, draftBlockerApplication,
  ).then(
    (output) => ({ outcome: "completed" as const, output }),
    (error: unknown) => ({ outcome: "cancelled" as const, output: String(error) }),
  );
  const blockerState = await waitForSqlAssertion(
    concurrencyDatabase,
    [
      "select activity.pid::text || '|' || coalesce(activity.wait_event_type, '') || '|' || coalesce(activity.wait_event, '')",
      "from pg_catalog.pg_stat_activity activity",
      `where activity.application_name = '${draftBlockerApplication}'`,
    ].join(" "),
    (value) => {
      const [, waitType, waitEvent] = value.split("|");
      return waitType === "Timeout" && waitEvent === "PgSleep";
    },
    "DRAFT_BLOCKER_DID_NOT_ACQUIRE_ROW_BEFORE_SLEEP",
  );
  const blockerPid = Number(blockerState.split("|")[0]);
  if (!Number.isSafeInteger(blockerPid) || blockerPid <= 0) {
    throw new Error(`TL_SOCIAL_SHADOW_DRAFT_BLOCKER_PID_INVALID:${blockerState}`);
  }
  const enqueueCompletion = psqlTextWithApplication(concurrencyDatabase, enqueueFirstSql, enqueueApplication);
  const enqueueLockState = await waitForSqlAssertion(
    concurrencyDatabase,
    [
      "select activity.pid::text || '|' || coalesce(activity.wait_event_type, '') || '|' || coalesce(activity.wait_event, '') || '|'",
      "|| (select count(*) from pg_catalog.pg_locks lock where lock.pid = activity.pid and lock.locktype = 'advisory' and lock.granted and lock.mode = 'ShareLock'",
      "and lock.classid::bigint = ((pg_catalog.hashtextextended('touchline-social-source-revision', 0) >> 32) & 4294967295)",
      "and lock.objid::bigint = (pg_catalog.hashtextextended('touchline-social-source-revision', 0) & 4294967295) and lock.objsubid = 1)::text || '|'",
      "|| (select count(*) from pg_catalog.pg_locks lock where lock.pid = activity.pid and lock.locktype = 'advisory' and lock.granted and lock.mode = 'ExclusiveLock'",
      "and lock.classid::bigint = ((pg_catalog.hashtextextended('touchline-social-generation:19722192:19:touchline-lineup-feed-v1', 0) >> 32) & 4294967295)",
      "and lock.objid::bigint = (pg_catalog.hashtextextended('touchline-social-generation:19722192:19:touchline-lineup-feed-v1', 0) & 4294967295) and lock.objsubid = 1)::text || '|'",
      "|| (select count(*) from pg_catalog.pg_locks lock where lock.pid = activity.pid and lock.locktype = 'advisory' and lock.granted and lock.mode = 'ExclusiveLock'",
      `and lock.classid::bigint = ((pg_catalog.hashtextextended('touchline-social-draft:${draftId}', 0) >> 32) & 4294967295)`,
      `and lock.objid::bigint = (pg_catalog.hashtextextended('touchline-social-draft:${draftId}', 0) & 4294967295) and lock.objsubid = 1)::text || '|'`,
      "|| (select count(*) from pg_catalog.pg_locks lock where lock.pid = activity.pid and lock.locktype <> 'advisory' and not lock.granted)::text",
      "from pg_catalog.pg_stat_activity activity",
      `where activity.application_name = '${enqueueApplication}'`,
    ].join(" "),
    (value) => {
      const [, waitType, , sourceGranted, generationGranted, draftGranted, waitingRowLocks] = value.split("|");
      return waitType === "Lock"
        && sourceGranted === "1"
        && generationGranted === "1"
        && draftGranted === "1"
        && Number(waitingRowLocks) >= 1;
    },
    "ENQUEUE_DID_NOT_HOLD_SOURCE_GENERATION_BEFORE_DRAFT",
  );
  const claimCompletion = psqlTextWithApplication(concurrencyDatabase, claimWhileDraftLockedSql, claimApplication);
  const claimLockState = await waitForSqlAssertion(
    concurrencyDatabase,
    [
      "select activity.pid::text || '|' || coalesce(activity.wait_event_type, '') || '|' || coalesce(activity.wait_event, '') || '|'",
      "|| (select count(*) from pg_catalog.pg_locks lock where lock.pid = activity.pid and lock.locktype = 'advisory' and lock.granted and lock.mode = 'ShareLock'",
      "and lock.classid::bigint = ((pg_catalog.hashtextextended('touchline-social-source-revision', 0) >> 32) & 4294967295)",
      "and lock.objid::bigint = (pg_catalog.hashtextextended('touchline-social-source-revision', 0) & 4294967295) and lock.objsubid = 1)::text || '|'",
      "|| (select count(*) from pg_catalog.pg_locks lock where lock.pid = activity.pid and lock.locktype = 'advisory' and not lock.granted and lock.mode = 'ExclusiveLock'",
      "and lock.classid::bigint = ((pg_catalog.hashtextextended('touchline-social-generation:19722192:19:touchline-lineup-feed-v1', 0) >> 32) & 4294967295)",
      "and lock.objid::bigint = (pg_catalog.hashtextextended('touchline-social-generation:19722192:19:touchline-lineup-feed-v1', 0) & 4294967295) and lock.objsubid = 1)::text || '|'",
      "|| (select count(*) from pg_catalog.pg_locks lock where lock.pid = activity.pid and lock.locktype = 'advisory' and lock.granted",
      `and lock.classid::bigint = ((pg_catalog.hashtextextended('touchline-social-draft:${draftId}', 0) >> 32) & 4294967295)`,
      `and lock.objid::bigint = (pg_catalog.hashtextextended('touchline-social-draft:${draftId}', 0) & 4294967295) and lock.objsubid = 1)::text`,
      "from pg_catalog.pg_stat_activity activity",
      `where activity.application_name = '${claimApplication}'`,
    ].join(" "),
    (value) => {
      const [, waitType, , sourceGranted, generationWaiting, draftGranted] = value.split("|");
      return waitType === "Lock"
        && sourceGranted === "1"
        && generationWaiting === "1"
        && draftGranted === "0";
    },
    "CLAIM_DID_NOT_WAIT_FOR_GENERATION_AFTER_SOURCE",
  );
  const blockerCancelled = await psqlText(concurrencyDatabase, `select pg_catalog.pg_cancel_backend(${blockerPid})`);
  if (blockerCancelled.trim() !== "t") throw new Error("TL_SOCIAL_SHADOW_DRAFT_BLOCKER_CANCEL_FAILED");
  const [blockerResult] = await Promise.all([
    draftBlockerCompletion,
    enqueueCompletion,
    claimCompletion,
  ]);
  if (blockerResult.outcome !== "cancelled" || !blockerResult.output.includes("canceling statement due to user request")) {
    throw new Error(`TL_SOCIAL_SHADOW_DRAFT_BLOCKER_RELEASE_NOT_PROVEN:${blockerResult.outcome}`);
  }
  if (!enqueueLockState || !claimLockState) throw new Error("TL_SOCIAL_SHADOW_LOCK_OBSERVATION_EMPTY");
  const postLockOrderState = await psqlText(
    concurrencyDatabase,
    `select state || '|' || count(*) over () from public.touchline_social_dispatch_attempts where draft_id = '${draftId}'::uuid`,
  );
  if (postLockOrderState.trim() !== "PENDING|1") {
    throw new Error(`TL_SOCIAL_SHADOW_LOCK_ORDER_RACE_FAILED:${postLockOrderState}`);
  }

  await psqlText(concurrencyDatabase, [
    "update public.football_players",
    "set display_name = 'Unrelated Player Updated'",
    "where id = '20000000-0000-4000-8000-000000000002'::uuid",
  ].join(" "));
  const unrelatedSourceState = await psqlText(concurrencyDatabase, [
    "select review.review_state || '|' || attempt.state",
    "from public.touchline_social_generation_reviews review",
    "join public.touchline_social_dispatch_attempts attempt on attempt.draft_id = $q$" + draftId + "$q$::uuid",
    "where review.fixture_provider_id = '19722192' and review.team_provider_id = '19'",
  ].join(" "));
  if (unrelatedSourceState.trim() !== "GENERATED|PENDING") {
    throw new Error(`TL_SOCIAL_SHADOW_UNRELATED_SOURCE_INVALIDATED_DRAFT:${unrelatedSourceState}`);
  }

  // The renderer is fixture-season-bound. Even a second row incorrectly
  // marked current for the same competition is not a dependency of this
  // draft, so changing it must not invalidate the canonical fixture-season
  // manifest. This is the regression for competition-wide current-season
  // selection leaking into approved social bytes.
  await psqlText(concurrencyDatabase, [
    "update public.football_seasons",
    "set name = 'Unrelated Current Season Updated'",
    "where id = '22000000-0000-4000-8000-000000000002'::uuid",
  ].join(" "));
  const unrelatedSeasonState = await psqlText(concurrencyDatabase, [
    "select review.review_state || '|' || attempt.state",
    "from public.touchline_social_generation_reviews review",
    "join public.touchline_social_dispatch_attempts attempt on attempt.draft_id = $q$" + draftId + "$q$::uuid",
    "where review.fixture_provider_id = '19722192' and review.team_provider_id = '19'",
  ].join(" "));
  if (unrelatedSeasonState.trim() !== "GENERATED|PENDING") {
    throw new Error(`TL_SOCIAL_SHADOW_UNRELATED_SEASON_INVALIDATED_DRAFT:${unrelatedSeasonState}`);
  }

  const sourceClaimRaceSql = [
    "set role service_role",
    [
      "do $$",
      "declare v_attempt public.touchline_social_dispatch_attempts%rowtype;",
      "begin",
      `select * into v_attempt from public.touchline_social_dispatch_attempts where draft_id = '${draftId}'::uuid;`,
      "begin",
      "perform public.touchline_social_claim_dispatch(v_attempt.id, v_attempt.idempotency_key);",
      "exception when others then",
      "if sqlerrm not in ('TL_SOCIAL_GENERATION_NOT_CURRENT', 'TL_SOCIAL_DISPATCH_NOT_PENDING') then raise; end if;",
      "end;",
      "end;",
      "$$",
    ].join(" "),
  ].join("; ");
  const sourceCorrectionSql = [
    "set role service_role",
    "update public.football_fantasy_fixture_feeds set events_payload = '[{\"type\":\"goal\",\"minute\":90}]'::jsonb where provider = 'sportmonks' and provider_fixture_id = '19722192'",
  ].join("; ");
  await Promise.all([
    psqlText(concurrencyDatabase, sourceClaimRaceSql),
    psqlText(concurrencyDatabase, sourceCorrectionSql),
  ]);
  const sourceRaceState = await psqlText(concurrencyDatabase, [
    "select review.review_state || '|' || attempt.state",
    "from public.touchline_social_generation_reviews review",
    "join public.touchline_social_dispatch_attempts attempt on attempt.draft_id = $q$" + draftId + "$q$::uuid",
    "where review.fixture_provider_id = '19722192' and review.team_provider_id = '19'",
  ].join(" "));
  if (!/^REVIEW_REQUIRED\|(INVALIDATED|DELIVERY_UNKNOWN)$/.test(sourceRaceState.trim())) {
    throw new Error(`TL_SOCIAL_SHADOW_SOURCE_CLAIM_RACE_FAILED:${sourceRaceState}`);
  }

  await psqlText(rollbackDatabase, "delete from storage.buckets where id = 'touchline-social-drafts'");
  await psqlFile(rollbackDatabase, "supabase/qa/039_touchline_qa_social_approval_outbox_rollback.sql");
  const remaining = await psqlText(rollbackDatabase, [
    "select count(*) from pg_catalog.pg_class relation",
    "join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace",
    "where namespace.nspname = 'public' and relation.relname like 'touchline_social_%'",
  ].join(" "));
  if (remaining.trim() !== "0") throw new Error(`TL_SOCIAL_SHADOW_ROLLBACK_INCOMPLETE:${remaining}`);

  await psqlFile(rollbackAuditDatabase, "supabase/tests/039_shadow_concurrency_setup.sql");
  const rollbackAuditIdentity = (await psqlText(
    rollbackAuditDatabase,
    "select draft_id || '|' || artwork_intent_id || '|' || caption_intent_id || '|' || source_revision_checksum from public.shadow_039_concurrency_fixture limit 1",
  )).trim().split("|");
  const [rollbackAuditDraftId, rollbackArtworkIntentId, rollbackCaptionIntentId, rollbackSourceRevisionChecksum] = rollbackAuditIdentity;
  await Promise.all([
    psqlText(rollbackAuditDatabase, [
      "set role authenticated",
      `set request.jwt.claim.sub = '${OWNER_ID}'`,
      `select public.touchline_social_approve_artwork('${rollbackArtworkIntentId}'::uuid, '${rollbackAuditDraftId}'::uuid, 'sha256:${"2".repeat(64)}', 'sha256:${"3".repeat(64)}', 'sha256:${"1".repeat(64)}', '${rollbackSourceRevisionChecksum}', '${OWNER_ID}'::uuid)`,
    ].join("; ")),
    psqlText(rollbackAuditDatabase, [
      "set role authenticated",
      `set request.jwt.claim.sub = '${OWNER_ID}'`,
      `select public.touchline_social_approve_caption('${rollbackCaptionIntentId}'::uuid, '${rollbackAuditDraftId}'::uuid, 'sha256:${"4".repeat(64)}', 'sha256:${"3".repeat(64)}', 'sha256:${"1".repeat(64)}', '${rollbackSourceRevisionChecksum}', '${OWNER_ID}'::uuid)`,
    ].join("; ")),
  ]);
  await psqlText(rollbackAuditDatabase, [
    "set role authenticated",
    `set request.jwt.claim.sub = '${OWNER_ID}'`,
    `select public.touchline_social_enqueue_dispatch('${rollbackAuditDraftId}'::uuid, 'TOUCHLINE_OFFICIAL_INSTAGRAM')`,
  ].join("; "));
  const rollbackAuditAttemptId = (await psqlText(
    rollbackAuditDatabase,
    `select id from public.touchline_social_dispatch_attempts where draft_id = '${rollbackAuditDraftId}'::uuid`,
  )).trim();
  if (!/^[0-9a-f-]{36}$/i.test(rollbackAuditAttemptId)) {
    throw new Error("TL_SOCIAL_SHADOW_ROLLBACK_AUDIT_ATTEMPT_INVALID");
  }
  // Isolate the audit/outbox OR-guard. The shared setup also records watcher
  // cycle and generation-review evidence; remove only those two ancillary
  // rows in this disposable database, with their immutable triggers restored
  // immediately afterwards, so rollback can fail only because the real draft,
  // its two review intents, and its dispatch attempt remain.
  await psqlText(rollbackAuditDatabase, [
    "alter table public.touchline_social_generation_reviews disable trigger touchline_social_generation_reviews_guard",
    "delete from public.touchline_social_generation_reviews",
    "alter table public.touchline_social_generation_reviews enable trigger touchline_social_generation_reviews_guard",
    "alter table public.touchline_social_generation_cycles disable trigger touchline_social_generation_cycles_guard",
    "delete from public.touchline_social_generation_cycles",
    "alter table public.touchline_social_generation_cycles enable trigger touchline_social_generation_cycles_guard",
  ].join("; "));
  const rollbackAncillaryState = await psqlText(rollbackAuditDatabase, [
    "select (select count(*) from public.touchline_social_generation_reviews)::text || '|'",
    "|| (select count(*) from public.touchline_social_generation_cycles)::text",
  ].join(" "));
  if (rollbackAncillaryState.trim() !== "0|0") {
    throw new Error(`TL_SOCIAL_SHADOW_ROLLBACK_AUDIT_NOT_ISOLATED:${rollbackAncillaryState}`);
  }
  await psqlText(rollbackAuditDatabase, "delete from storage.buckets where id = 'touchline-social-drafts'");
  const auditGuardFailure = await psqlFile(
    rollbackAuditDatabase,
    "supabase/qa/039_touchline_qa_social_approval_outbox_rollback.sql",
    3,
  );
  if (!auditGuardFailure.includes("TL_SOCIAL_ROLLBACK_REQUIRES_EMPTY_AUDIT_OUTBOX")) {
    throw new Error("TL_SOCIAL_SHADOW_ROLLBACK_AUDIT_GUARD_NOT_ENFORCED");
  }
  const auditGuardState = await psqlText(rollbackAuditDatabase, [
    `select draft.id::text || '|'`,
    `|| (select count(*) from public.touchline_social_review_intents intent where intent.draft_id = draft.id)::text || '|'`,
    `|| attempt.id::text || '|'`,
    `|| (to_regprocedure('public.touchline_social_enqueue_dispatch(uuid,text)') is not null)::int::text`,
    `from public.touchline_social_publication_drafts draft`,
    `join public.touchline_social_dispatch_attempts attempt on attempt.draft_id = draft.id`,
    `where draft.id = '${rollbackAuditDraftId}'::uuid and attempt.id = '${rollbackAuditAttemptId}'::uuid`,
  ].join(" "));
  if (auditGuardState.trim() !== `${rollbackAuditDraftId}|2|${rollbackAuditAttemptId}|1`) {
    throw new Error(`TL_SOCIAL_SHADOW_ROLLBACK_AUDIT_GUARD_MUTATED_STATE:${auditGuardState}`);
  }

  const bucketGuardFailure = await psqlFile(
    rollbackBucketDatabase,
    "supabase/qa/039_touchline_qa_social_approval_outbox_rollback.sql",
    3,
  );
  if (!bucketGuardFailure.includes("TL_SOCIAL_ROLLBACK_REQUIRES_STORAGE_BUCKET_REMOVED_VIA_API")) {
    throw new Error("TL_SOCIAL_SHADOW_ROLLBACK_BUCKET_GUARD_NOT_ENFORCED");
  }
  const bucketGuardState = await psqlText(rollbackBucketDatabase, [
    "select (to_regclass('public.touchline_social_publication_drafts') is not null)::int || '|' || count(*)",
    "from storage.buckets where id = 'touchline-social-drafts'",
  ].join(" "));
  if (bucketGuardState.trim() !== "1|1") {
    throw new Error(`TL_SOCIAL_SHADOW_ROLLBACK_BUCKET_GUARD_MUTATED_STATE:${bucketGuardState}`);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    postgresVersion: version,
    port,
    databases: [concurrencyDatabase, rollbackDatabase, rollbackAuditDatabase, rollbackBucketDatabase],
    retryAssertions: "PASS",
    secondApply: "FAIL_CLOSED",
    realApprovalConcurrency: "PASS",
    realEnqueueConcurrency: "PASS",
    enqueueClaimLockOrder: "PASS",
    semanticDependencyTriggers: "PASS",
    unrelatedSourceIsolation: "PASS",
    fixtureSeasonIsolation: "PASS",
    sourceClaimRace: "PASS",
    rollback: "PASS",
    rollbackAuditGuard: "FAIL_CLOSED",
    rollbackBucketGuard: "FAIL_CLOSED",
  }, null, 2) + "\n");
} finally {
  if (started) {
    await command(pgCtl, ["-D", data, "-m", "fast", "-w", "stop"], { capture: true }).catch(() => "");
  }
  if (!root.startsWith(`${SHADOW_TMP_ROOT}/tls039-`)) {
    throw new Error("TL_SOCIAL_SHADOW_TEMP_ROOT_INVALID");
  }
  rmSync(root, { recursive: true, force: true });
}
