import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "../..");
const BIN = resolve(process.env.TL_SOCIAL_SHADOW_PG_BIN?.trim() || "/");
const EXPECTED_VERSION = /^postgres \(PostgreSQL\) 17\.11(?: \(Postgres\.app\))?$/;
const ACK = "LOCAL_EMPTY_CLUSTER_ONLY";
const OWNER_ID = "60277b78-1e65-4e2e-89f0-67e7b819ed24";
const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;
const SHA_D = `sha256:${"d".repeat(64)}`;

if (BIN === "/" || basename(BIN) !== "bin") throw new Error("TL_SOCIAL_SHADOW_PG_BIN_REQUIRED");

function command(executable: string, args: string[], options: { env?: NodeJS.ProcessEnv; expectedExit?: number } = {}) {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: ROOT, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === (options.expectedExit ?? 0)
      ? resolvePromise(output.trim())
      : reject(new Error(`TL_SOCIAL_SHADOW_041_COMMAND_FAILED:${basename(executable)}:${code}\n${output}`)));
  });
}

async function port() {
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address(); const value = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePromise(value));
    });
  });
}

const root = mkdtempSync(join("/tmp", "tls041-"));
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket);
const shadowPort = await port();
const database = `touchline_social_shadow_039_match_preview_041_${process.pid}`.toLowerCase();
const postgres = join(BIN, "postgres");
const pgCtl = join(BIN, "pg_ctl");
const psql = join(BIN, "psql");
let started = false;
const environment = () => ({
  PGHOST: "127.0.0.1", PGPORT: String(shadowPort), PGDATABASE: database,
  PGOPTIONS: `-c touchline.shadow_039_ack=${ACK} -c touchline.shadow_039_database=${database}`,
});
const sql = (value: string, expectedExit = 0) => command(psql, ["-v", "ON_ERROR_STOP=1", "-At", "-c", value], { env: environment(), expectedExit });
const file = (value: string, expectedExit = 0) => command(psql, ["-v", "ON_ERROR_STOP=1", "-f", resolve(ROOT, value)], { env: environment(), expectedExit });
const json = (value: string) => JSON.parse(value.split("\n").filter(Boolean).at(-1) ?? "{}") as Record<string, unknown>;

try {
  const version = await command(postgres, ["--version"]);
  if (!EXPECTED_VERSION.test(version)) throw new Error(`TL_SOCIAL_SHADOW_041_VERSION_MISMATCH:${version}`);
  await command(join(BIN, "initdb"), ["-D", data, "--auth-local=trust", "--auth-host=trust", "--no-locale", "--encoding=UTF8"]);
  await command(pgCtl, ["-D", data, "-o", `-h 127.0.0.1 -p ${shadowPort} -k ${socket}`, "-w", "start"]);
  started = true;
  await command(join(BIN, "createdb"), [database], { env: { PGHOST: "127.0.0.1", PGPORT: String(shadowPort) } });
  await file("supabase/tests/039_shadow_local_bootstrap.sql");
  await file("supabase/qa/039_touchline_qa_social_approval_outbox.sql");
  await file("supabase/qa/040_touchline_qa_social_draft_executor.sql");
  const frozen040ApprovalGuard = await sql("select pg_catalog.pg_get_functiondef('public.touchline_social_guard_executor_draft_approval()'::regprocedure)");
  await file("supabase/qa/041_touchline_qa_social_match_preview.sql");
  const combinedApprovalGuard = await sql("select pg_catalog.pg_get_functiondef('public.touchline_social_guard_executor_draft_approval()'::regprocedure)");
  if (!combinedApprovalGuard.includes("new.content_type = 'MATCH_PREVIEW'")
    || !combinedApprovalGuard.includes("touchline_social_assert_executor_approval_gate(new.id)")) {
    throw new Error("TL_SOCIAL_SHADOW_041_LINEUP_APPROVAL_BRANCH_NOT_PRESERVED");
  }
  const second = await file("supabase/qa/041_touchline_qa_social_match_preview.sql", 3);
  if (!second.includes("TL_SOCIAL_MATCH_PREVIEW_041_SCHEMA_PRECONDITION_FAILED")) {
    throw new Error("TL_SOCIAL_SHADOW_041_SECOND_APPLY_NOT_FAIL_CLOSED");
  }

  const security = await sql([
    "select",
    "has_table_privilege('service_role','public.touchline_social_match_preview_generation_jobs','select')::int || '|' ||",
    "has_table_privilege('authenticated','public.touchline_social_match_preview_generation_jobs','select')::int || '|' ||",
    "has_function_privilege('service_role','public.touchline_social_041_claim_job(uuid)','execute')::int || '|' ||",
    "has_function_privilege('authenticated','public.touchline_social_041_claim_job(uuid)','execute')::int || '|' ||",
    "has_function_privilege('service_role','public.touchline_social_041_issue_review_intent(uuid,text,text,text,text,text,uuid)','execute')::int || '|' ||",
    "has_function_privilege('authenticated','public.touchline_social_041_issue_review_intent(uuid,text,text,text,text,text,uuid)','execute')::int || '|' ||",
    "has_function_privilege('service_role','public.touchline_social_issue_review_intent(uuid,text,text,text,text,text,uuid)','execute')::int || '|' ||",
    "has_function_privilege('authenticated','public.touchline_social_issue_review_intent(uuid,text,text,text,text,text,uuid)','execute')::int || '|' ||",
    "(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace",
    "where n.nspname='public' and c.relname like 'touchline_social_match_preview_%'",
    "and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity)::text",
  ].join(" "));
  if (security.trim() !== "1|0|1|0|1|0|1|0|3") throw new Error(`TL_SOCIAL_SHADOW_041_SECURITY_FAILED:${security}`);

  const directIntent = await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_041_issue_review_intent(gen_random_uuid(),'ARTWORK','${SHA_B}','${SHA_C}','${SHA_A}','${SHA_D}','${OWNER_ID}'::uuid)`, 1);
  if (!/permission denied/i.test(directIntent)) {
    throw new Error("TL_SOCIAL_SHADOW_041_AUTHENTICATED_INTENT_NOT_BLOCKED");
  }

  const competitionId = "11111111-aaaa-4111-8111-111111111111";
  const seasonId = "22222222-bbbb-4222-8222-222222222222";
  await sql(`insert into public.football_fixtures(id,provider,provider_fixture_id,competition_id,season_id,status) values
    ('33333333-cccc-4333-8333-333333333333','sportmonks','19722192','${competitionId}','${seasonId}','SCHEDULED'),
    ('44444444-dddd-4444-8444-444444444444','sportmonks','19722193','${competitionId}','${seasonId}','SCHEDULED')`);

  const leagueTableKey = `league-table:${competitionId}`;
  const fixtureAggregateRevision = Number(await sql(`select revision from public.touchline_social_source_revisions where source_key='${leagueTableKey}'`));
  await sql(`insert into public.football_clubs(id,provider,competition_id,provider_team_id,name) values
    ('55555555-eeee-4555-8555-555555555555','sportmonks','${competitionId}','18','Chelsea')`);
  const clubAggregateRevision = Number(await sql(`select revision from public.touchline_social_source_revisions where source_key='${leagueTableKey}'`));
  await sql(`insert into public.football_seasons(id,provider,competition_id,provider_season_id,is_current,name) values
    ('${seasonId}','sportmonks','${competitionId}','2026-27',true,'2026/27')`);
  const seasonAggregateRevision = Number(await sql(`select revision from public.touchline_social_source_revisions where source_key='${leagueTableKey}'`));
  if (!(fixtureAggregateRevision > 0
    && clubAggregateRevision === fixtureAggregateRevision + 1
    && seasonAggregateRevision === clubAggregateRevision + 1)) {
    throw new Error(`TL_SOCIAL_SHADOW_041_AGGREGATE_TRIGGER_COVERAGE_FAILED:${fixtureAggregateRevision}|${clubAggregateRevision}|${seasonAggregateRevision}`);
  }
  const dependencyPlayerId = "66666666-ffff-4666-8666-666666666666";
  await sql(`insert into public.football_players(id,provider,provider_player_id,display_name,current_club_id) values
    ('${dependencyPlayerId}','sportmonks','37685630','Unprojected Member',null)`);
  await sql(`insert into public.football_squad_members(id,provider,player_id,club_id,jersey_number,position,active) values
    ('77777777-aaaa-4777-8777-777777777777','sportmonks','${dependencyPlayerId}',
     '55555555-eeee-4555-8555-555555555555',25,'DEF',true)`);

  const scheduler = json(await sql("select public.touchline_social_041_claim_cycle('SCHEDULER')"));
  const schedulerLease = String(scheduler.leaseToken ?? "");
  if (scheduler.outcome !== "claimed" || !/^[0-9a-f-]{36}$/i.test(schedulerLease)) throw new Error("TL_SOCIAL_SHADOW_041_SCHEDULER_CLAIM_FAILED");
  const busy = json(await sql("select public.touchline_social_041_claim_cycle('SCHEDULER')"));
  if (busy.outcome !== "busy") throw new Error("TL_SOCIAL_SHADOW_041_SINGLE_FLIGHT_FAILED");

  const dependencyPlayerKey = `player:${dependencyPlayerId}`;
  let source = json(await sql(`select public.touchline_social_read_source_revision(array['fixture-provider:19722192','${leagueTableKey}','${dependencyPlayerKey}'])`));
  let revisionChecksum = String(source.checksum ?? "");
  let sourceRevisionManifest = source.manifest;
  let manifest = JSON.stringify(sourceRevisionManifest);
  if (!/^sha256:[0-9a-f]{64}$/.test(revisionChecksum)) throw new Error("TL_SOCIAL_SHADOW_041_SOURCE_REVISION_INVALID");
  const enqueue = `select public.touchline_social_041_enqueue_job('${schedulerLease}'::uuid,'19722192','touchline-match-preview-feed-v1','2026-08-30T18:00:00Z','2026-08-31T18:00:00Z','${SHA_A}','${manifest}'::jsonb,'${revisionChecksum}')`;
  await Promise.all([sql(enqueue), sql(enqueue)]);
  if ((await sql("select count(*) from public.touchline_social_match_preview_generation_jobs")).trim() !== "1") {
    throw new Error("TL_SOCIAL_SHADOW_041_ENQUEUE_IDEMPOTENCY_FAILED");
  }
  await sql(enqueue.replace("2026-08-30T18:00:00Z", "2026-08-30T19:00:00Z"));
  const preservedFirstObserved = await sql("select first_observed_at = '2026-08-30T18:00:00Z'::timestamptz from public.touchline_social_match_preview_generation_jobs");
  if (preservedFirstObserved.trim() !== "t") {
    throw new Error("TL_SOCIAL_SHADOW_041_FIRST_OBSERVED_NOT_PRESERVED");
  }
  await sql("update public.football_fixtures set status='LIVE' where provider_fixture_id='19722193'");
  source = json(await sql(`select public.touchline_social_read_source_revision(array['fixture-provider:19722192','${leagueTableKey}','${dependencyPlayerKey}'])`));
  revisionChecksum = String(source.checksum ?? "");
  sourceRevisionManifest = source.manifest;
  manifest = JSON.stringify(sourceRevisionManifest);
  if (!/^sha256:[0-9a-f]{64}$/.test(revisionChecksum)) {
    throw new Error("TL_SOCIAL_SHADOW_041_REVISED_SOURCE_REVISION_INVALID");
  }
  const revisedEnqueue = `select public.touchline_social_041_enqueue_job('${schedulerLease}'::uuid,'19722192','touchline-match-preview-feed-v1','2026-08-30T20:00:00Z','2026-08-31T18:00:00Z','${SHA_B}','${manifest}'::jsonb,'${revisionChecksum}')`;
  await sql(revisedEnqueue);
  const revisedFirstObserved = await sql([
    "select count(*)::text || '|' ||",
    "count(*) filter (where job_state='SUPERSEDED')::text || '|' ||",
    "count(*) filter (where job_state='PENDING' and first_observed_at='2026-08-30T18:00:00Z'::timestamptz)::text",
    "from public.touchline_social_match_preview_generation_jobs",
    "where fixture_provider_id='19722192' and template_version='touchline-match-preview-feed-v1'",
  ].join(" "));
  if (revisedFirstObserved.trim() !== "2|1|1") {
    throw new Error(`TL_SOCIAL_SHADOW_041_FIRST_OBSERVED_REVISION_RESET:${revisedFirstObserved}`);
  }
  await sql(`select public.touchline_social_041_complete_cycle('SCHEDULER','${schedulerLease}'::uuid,'SUCCESS',null,1)`);

  const runner = json(await sql("select public.touchline_social_041_claim_cycle('RUNNER')"));
  const runnerLease = String(runner.leaseToken ?? "");
  const job = json(await sql(`select public.touchline_social_041_claim_job('${runnerLease}'::uuid)`));
  const jobId = String(job.jobId ?? ""); const jobLease = String(job.leaseToken ?? "");
  if (job.outcome !== "claimed") throw new Error("TL_SOCIAL_SHADOW_041_JOB_CLAIM_FAILED");

  const publicationKey = "instagram:INSTAGRAM_FEED:MATCH_PREVIEW:19722192:fixture:en-GB:tv=touchline-match-preview-feed-v1:sv=touchline-match-preview-feed-v1:r=1";
  const renderPath = "/visual-qa/social-match-preview?fixtureId=19722192&locale=en-GB&revision=1";
  const objectKey = `instagram/instagram_feed/match_preview/19722192/fixture/en-GB/tv=touchline-match-preview-feed-v1/sv=touchline-match-preview-feed-v1/r=1/${"b".repeat(64)}.png`;
  const draftPayload = JSON.stringify({
    publication_key: publicationKey, fixture_provider_id: "19722192", team_provider_id: null,
    content_type: "MATCH_PREVIEW", placement: "INSTAGRAM_FEED", locale: "en-GB", revision: 1,
    render_path: renderPath, width: 1080, height: 1350,
    caption: "Aston Villa v Arsenal. COMING SOON • CURRENTLY IN TESTING",
    first_observed_at: "2026-08-30T18:00:00Z", source_snapshot_at: "2026-08-30T19:00:00Z",
    generated_at: "2026-08-30T19:01:00Z", template_version: "touchline-match-preview-feed-v1",
    source_version: "touchline-match-preview-feed-v1", source_checksum: SHA_B,
    source_revision_manifest: sourceRevisionManifest, source_revision_checksum: revisionChecksum, input_checksum: SHA_B,
    artifact_content_type: "image/png", artifact_byte_length: 1000,
    artifact_storage_provider: "SUPABASE_STORAGE", artifact_storage_bucket: "touchline-social-drafts",
    artifact_storage_key: objectKey, artifact_etag: null,
    manifest_checksum: SHA_C, artifact_checksum: SHA_B, caption_checksum: SHA_D,
  });
  const created = json(await sql(`select public.touchline_social_create_draft('${draftPayload.replaceAll("'", "''")}'::jsonb)`));
  const draftId = String(created.draftId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw new Error("TL_SOCIAL_SHADOW_041_DRAFT_CREATE_FAILED");
  await sql(`select public.touchline_social_041_renew_cycle('RUNNER','${runnerLease}'::uuid)`);
  await sql(`select public.touchline_social_041_renew_job('${runnerLease}'::uuid,'${jobId}'::uuid,'${jobLease}'::uuid)`);
  await sql(`select public.touchline_social_041_complete_job('${runnerLease}'::uuid,'${jobId}'::uuid,'${jobLease}'::uuid,'COMPLETED','IMMUTABLE_DRAFT_READY','${draftId}'::uuid)`);
  await sql(`select public.touchline_social_041_complete_cycle('RUNNER','${runnerLease}'::uuid,'SUCCESS',null,1)`);

  const artworkIntent = json(await sql(`set role service_role; select public.touchline_social_041_issue_review_intent('${draftId}'::uuid,'ARTWORK','${SHA_B}','${SHA_C}','${SHA_B}','${revisionChecksum}','${OWNER_ID}'::uuid)`));
  const captionIntent = json(await sql(`set role service_role; select public.touchline_social_041_issue_review_intent('${draftId}'::uuid,'CAPTION','${SHA_D}','${SHA_C}','${SHA_B}','${revisionChecksum}','${OWNER_ID}'::uuid)`));
  await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_041_approve('${String(artworkIntent.intentId)}'::uuid,'${draftId}'::uuid,'ARTWORK','${SHA_B}','${SHA_C}','${SHA_B}','${revisionChecksum}','${OWNER_ID}'::uuid)`);
  await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_041_approve('${String(captionIntent.intentId)}'::uuid,'${draftId}'::uuid,'CAPTION','${SHA_D}','${SHA_C}','${SHA_B}','${revisionChecksum}','${OWNER_ID}'::uuid)`);
  const approval = await sql(`select approval_state || '|' || artwork_approval_state || '|' || caption_approval_state from public.touchline_social_publication_drafts where id='${draftId}'::uuid`);
  if (approval.trim() !== "APPROVED|APPROVED|APPROVED") throw new Error(`TL_SOCIAL_SHADOW_041_APPROVAL_FAILED:${approval}`);

  const outbound = await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_enqueue_dispatch('${draftId}'::uuid,'TOUCHLINE_OFFICIAL_INSTAGRAM')`, 1);
  if (!outbound.includes("TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED")) {
    throw new Error("TL_SOCIAL_SHADOW_041_OUTBOUND_NOT_FAIL_CLOSED");
  }

  const playerRevisionBefore = Number(await sql(`select revision from public.touchline_social_source_revisions where source_key='${dependencyPlayerKey}'`));
  await sql(`update public.football_players set current_club_id='55555555-eeee-4555-8555-555555555555' where id='${dependencyPlayerId}'`);
  const playerRevisionAfter = Number(await sql(`select revision from public.touchline_social_source_revisions where source_key='${dependencyPlayerKey}'`));
  if (playerRevisionAfter !== playerRevisionBefore + 1) {
    throw new Error(`TL_SOCIAL_SHADOW_041_UNPROJECTED_PLAYER_REVISION_FAILED:${playerRevisionBefore}|${playerRevisionAfter}`);
  }
  const stalePlayer = await sql(`select public.touchline_social_041_assert_approval_gate('${draftId}'::uuid)`, 1);
  if (!stalePlayer.includes("TL_SOCIAL_MATCH_PREVIEW_APPROVAL_DRAFT_INVALID")) {
    throw new Error("TL_SOCIAL_SHADOW_041_UNPROJECTED_PLAYER_CHANGE_NOT_BLOCKED");
  }

  await sql("update public.football_fixtures set status='FINISHED' where provider_fixture_id='19722193'");
  const stale = await sql(`select public.touchline_social_041_assert_approval_gate('${draftId}'::uuid)`, 1);
  if (!stale.includes("TL_SOCIAL_MATCH_PREVIEW_APPROVAL_DRAFT_INVALID")) {
    throw new Error("TL_SOCIAL_SHADOW_041_STALE_SOURCE_NOT_BLOCKED");
  }

  const direct = await sql("update public.touchline_social_match_preview_generation_jobs set reason_code='BYPASS'", 1);
  if (!direct.includes("TL_SOCIAL_MATCH_PREVIEW_JOB_RPC_REQUIRED")) throw new Error("TL_SOCIAL_SHADOW_041_DIRECT_MUTATION_NOT_BLOCKED");
  const rollbackGuard = await file("supabase/qa/041_touchline_qa_social_match_preview_rollback.sql", 3);
  if (!rollbackGuard.includes("TL_SOCIAL_MATCH_PREVIEW_041_ROLLBACK_NONEMPTY")) throw new Error("TL_SOCIAL_SHADOW_041_ROLLBACK_GUARD_FAILED");

  // Rehearse the real rollback after returning the disposable shadow to the
  // required empty state. A test-only pause is injected after the exact
  // rollback locks, then a second session attempts a write. It must wait and
  // fail after the rollback commits; it must never slip between guard/drop.
  await sql("truncate table public.touchline_social_match_preview_review_intents, public.touchline_social_match_preview_generation_jobs, public.touchline_social_match_preview_executor_cycles, public.touchline_social_publication_drafts cascade");
  const rollbackPath = resolve(ROOT, "supabase/qa/041_touchline_qa_social_match_preview_rollback.sql");
  const rollbackSource = readFileSync(rollbackPath, "utf8");
  const lockMarker = "lock table public.touchline_social_publication_drafts in share row exclusive mode;";
  if (rollbackSource.split(lockMarker).length !== 2) throw new Error("TL_SOCIAL_SHADOW_041_ROLLBACK_LOCK_MARKER_INVALID");
  const rollbackWithPause = rollbackSource.replace(lockMarker, `${lockMarker}\nselect pg_catalog.pg_sleep(2);`);
  const rollbackRun = command(psql, ["-v", "ON_ERROR_STOP=1", "-c", rollbackWithPause], { env: environment() });
  const lockDeadline = Date.now() + 5_000;
  let rollbackLockObserved = false;
  while (Date.now() < lockDeadline) {
    const locks = await sql([
      "select count(*) from pg_catalog.pg_locks l",
      "join pg_catalog.pg_class c on c.oid = l.relation",
      "join pg_catalog.pg_namespace n on n.oid = c.relnamespace",
      "where n.nspname='public' and c.relname='touchline_social_match_preview_generation_jobs'",
      "and l.mode='AccessExclusiveLock' and l.granted",
    ].join(" "));
    if (Number(locks.trim()) === 1) { rollbackLockObserved = true; break; }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  if (!rollbackLockObserved) throw new Error("TL_SOCIAL_SHADOW_041_ROLLBACK_LOCK_NOT_OBSERVED");
  const contenderStartedAt = Date.now();
  const contender = sql("insert into public.touchline_social_match_preview_executor_cycles(component) values ('SCHEDULER')", 1);
  const [rollbackOutput, contenderOutput] = await Promise.all([rollbackRun, contender]);
  if (rollbackOutput.includes("ERROR:")
    || !/does not exist|cache lookup failed|relation .* does not exist/i.test(contenderOutput)
    || Date.now() - contenderStartedAt < 1_000) {
    throw new Error("TL_SOCIAL_SHADOW_041_ROLLBACK_RACE_NOT_FAIL_CLOSED");
  }
  const rollbackState = await sql([
    "select",
    "(pg_catalog.to_regclass('public.touchline_social_match_preview_generation_jobs') is null)::int || '|' ||",
    "(pg_catalog.to_regprocedure('public.touchline_social_041_claim_cycle(text)') is null)::int || '|' ||",
    "(pg_catalog.to_regclass('public.touchline_social_generation_jobs') is not null)::int",
  ].join(" "));
  if (rollbackState.trim() !== "1|1|1") throw new Error(`TL_SOCIAL_SHADOW_041_ROLLBACK_STATE_INVALID:${rollbackState}`);
  const restored040ApprovalGuard = await sql("select pg_catalog.pg_get_functiondef('public.touchline_social_guard_executor_draft_approval()'::regprocedure)");
  if (restored040ApprovalGuard.replace(/\s+/g, "") !== frozen040ApprovalGuard.replace(/\s+/g, "")) {
    throw new Error("TL_SOCIAL_SHADOW_041_ROLLBACK_040_GUARD_NOT_SEMANTICALLY_EQUIVALENT");
  }

  process.stdout.write(`${JSON.stringify({ postgresVersion: version, secondApply: "FAIL_CLOSED",
    rlsAndGrants: "PASS", authenticatedIntent: "FAIL_CLOSED", schedulerSingleFlight: "PASS",
    aggregateFixtureClubSeasonTriggers: "PASS", unprojectedMembershipPlayerFence: "PASS",
    enqueueIdempotency: "PASS", firstObservedPreservedAcrossSourceRevisions: "PASS",
    exactDraftCompletion: "PASS", separateOwnerApprovals: "PASS", directMutation: "FAIL_CLOSED",
    unrelatedTableFixtureChangeAfterApproval: "FAIL_CLOSED", outbound: "FAIL_CLOSED",
    rollbackNonEmpty: "FAIL_CLOSED", rollbackConcurrentWrite: "FAIL_CLOSED",
    lineupApprovalBranchPreserved: "PASS", rollbackRestores040GuardSemantics: "PASS",
    rollbackPreserves040: "PASS", sharedQaWrites: 0, productionWrites: 0 })}\n`);
} finally {
  if (started) await command(pgCtl, ["-D", data, "-m", "immediate", "stop"]).catch(() => undefined);
  rmSync(root, { recursive: true, force: true });
}
