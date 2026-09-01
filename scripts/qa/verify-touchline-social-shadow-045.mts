import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "../..");
const BIN = resolve(process.env.TL_SOCIAL_SHADOW_PG_BIN?.trim() || "/");
const EXPECTED_VERSION = /^postgres \(PostgreSQL\) 17\.11(?: \(Postgres\.app\))?$/;
const OWNER_ID = "60277b78-1e65-4e2e-89f0-67e7b819ed24";
const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;
const SHA_D = `sha256:${"d".repeat(64)}`;
const TIMELINE_COPY = "Gameweek 2 ranking preview. Who comes out on top?";
const TIMELINE_COPY_CHECKSUM = `sha256:${createHash("sha256").update(
  `touchline-club-social-copy-v1\n${TIMELINE_COPY}`, "utf8",
).digest("hex")}`;

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
      : reject(new Error(`TL_SOCIAL_SHADOW_045_COMMAND_FAILED:${basename(executable)}:${code}\n${output}`)));
  });
}

async function freePort() {
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const value = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePromise(value));
    });
  });
}

const root = mkdtempSync(join("/tmp", "tls045-"));
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket);
const port = await freePort();
const database = `touchline_social_shadow_039_club_feed_045_${process.pid}`.toLowerCase();
const postgres = join(BIN, "postgres");
const pgCtl = join(BIN, "pg_ctl");
const psql = join(BIN, "psql");
let started = false;
const environment = () => ({
  PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: database,
  PGOPTIONS: `-c touchline.shadow_039_ack=LOCAL_EMPTY_CLUSTER_ONLY -c touchline.shadow_039_database=${database}`,
});
const sql = (value: string, expectedExit = 0) => command(psql, ["-v", "ON_ERROR_STOP=1", "-At", "-c", value], {
  env: environment(), expectedExit,
});
const file = (value: string, expectedExit = 0) => command(psql, ["-v", "ON_ERROR_STOP=1", "-f", resolve(ROOT, value)], {
  env: environment(), expectedExit,
});
const json = (value: string) => JSON.parse(value.split("\n").filter(Boolean).at(-1) ?? "{}") as Record<string, unknown>;

try {
  const version = await command(postgres, ["--version"]);
  if (!EXPECTED_VERSION.test(version)) throw new Error(`TL_SOCIAL_SHADOW_045_VERSION_MISMATCH:${version}`);
  await command(join(BIN, "initdb"), ["-D", data, "--auth-local=trust", "--auth-host=trust", "--no-locale", "--encoding=UTF8"]);
  await command(pgCtl, ["-D", data, "-o", `-h 127.0.0.1 -p ${port} -k ${socket}`, "-w", "start"]);
  started = true;
  await command(join(BIN, "createdb"), [database], { env: { PGHOST: "127.0.0.1", PGPORT: String(port) } });
  await file("supabase/tests/039_shadow_local_bootstrap.sql");
  for (const migration of ["039_touchline_qa_social_approval_outbox", "040_touchline_qa_social_draft_executor",
    "041_touchline_qa_social_match_preview", "042_touchline_qa_social_final_result",
    "043_touchline_qa_social_confirmed_events", "044_touchline_qa_social_ranking_family"]) {
    await file(`supabase/qa/${migration}.sql`);
  }
  const frozen044 = await sql("select pg_catalog.pg_get_functiondef('public.touchline_social_044_approve(uuid,uuid,text,text,text,text,text,uuid)'::regprocedure)");
  await file("supabase/qa/045_touchline_qa_club_social_feed.sql");
  const second = await file("supabase/qa/045_touchline_qa_club_social_feed.sql", 3);
  if (!second.includes("TL_SOCIAL_CLUB_FEED_045_SCHEMA_PRECONDITION_FAILED")) throw new Error("TL_SOCIAL_SHADOW_045_SECOND_APPLY_NOT_FAIL_CLOSED");

  const competitionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const seasonId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const roundId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const fixtureId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await sql(`insert into public.football_competitions(id,provider,provider_competition_id,name) values ('${competitionId}','sportmonks','8','Premier League');
    insert into public.football_seasons(id,provider,competition_id,provider_season_id,is_current,name) values ('${seasonId}','sportmonks','${competitionId}','25582',true,'2026/27');
    insert into public.football_rounds(id,provider,season_id,name) values ('${roundId}','sportmonks','${seasonId}','Gameweek 2');
    insert into public.football_clubs(id,provider,competition_id,provider_team_id,name)
      select ('00000000-0000-4000-8000-' || lpad(team_id::text,12,'0'))::uuid,'sportmonks','${competitionId}',team_id::text,'Club '||team_id
      from generate_series(1,20) team_id;
    insert into public.football_fixtures(id,provider,provider_fixture_id,competition_id,season_id,round_id,home_club_id,away_club_id,starts_at,status)
      values ('${fixtureId}','sportmonks','19722192','${competitionId}','${seasonId}','${roundId}',
        '00000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000019','2026-08-31T18:00:00Z','scheduled')`);

  const source = json(await sql("select public.touchline_social_read_source_revision(array['card-ranking:touchline-england','round:2'])"));
  const sourceRevisionChecksum = String(source.checksum ?? "");
  const sourceManifest = JSON.stringify(source.manifest);
  const scheduler044 = json(await sql("select public.touchline_social_044_claim_cycle('SCHEDULER')"));
  const scheduler044Lease = String(scheduler044.leaseToken ?? "");
  await sql(`select public.touchline_social_044_enqueue_job('${scheduler044Lease}'::uuid,'19722192','2',null,'GAMEWEEK_RANKING_PREVIEW','touchline-social-ranking-feed-v1','2026-08-31T17:00:00Z','2026-08-31T18:00:00Z','${SHA_A}','${sourceManifest}'::jsonb,'${sourceRevisionChecksum}')`);
  await sql(`select public.touchline_social_044_complete_cycle('SCHEDULER','${scheduler044Lease}'::uuid,'SUCCESS',null,1)`);
  const runner044 = json(await sql("select public.touchline_social_044_claim_cycle('RUNNER')"));
  const runner044Lease = String(runner044.leaseToken ?? "");
  const job044 = json(await sql(`select public.touchline_social_044_claim_job('${runner044Lease}'::uuid)`));
  const job044Id = String(job044.jobId ?? "");
  const job044Lease = String(job044.leaseToken ?? "");
  const publicationKey = "instagram:INSTAGRAM_FEED:GAMEWEEK_RANKING_PREVIEW:2:gameweek:en-GB:tv=touchline-social-ranking-feed-v1:sv=touchline-social-ranking-family-v1:r=1";
  const objectKey = `instagram/instagram_feed/gameweek_ranking_preview/2/gameweek/en-GB/tv=touchline-social-ranking-feed-v1/sv=touchline-social-ranking-family-v1/r=1/${"b".repeat(64)}.png`;
  const payload = JSON.stringify({ publication_key: publicationKey,fixture_provider_id:"19722192",team_provider_id:null,
    event_provider_id:null,scope_provider_id:"2",subject_player_provider_id:null,content_type:"GAMEWEEK_RANKING_PREVIEW",
    placement:"INSTAGRAM_FEED",locale:"en-GB",revision:1,
    render_path:"/visual-qa/social-ranking?contentType=GAMEWEEK_RANKING_PREVIEW&fixtureId=19722192&scopeId=2&locale=en-GB&revision=1",
    width:1080,height:1350,caption:"Gameweek 2 ranking preview. Who comes out on top? COMING SOON • CURRENTLY IN TESTING",
    first_observed_at:"2026-08-31T17:00:00Z",source_snapshot_at:"2026-08-31T17:00:00Z",generated_at:"2026-08-31T17:01:00Z",
    template_version:"touchline-social-ranking-feed-v1",source_version:"touchline-social-ranking-family-v1",
    source_checksum:SHA_A,source_revision_manifest:source.manifest,source_revision_checksum:sourceRevisionChecksum,input_checksum:SHA_A,
    artifact_content_type:"image/png",artifact_byte_length:1000,artifact_storage_provider:"SUPABASE_STORAGE",
    artifact_storage_bucket:"touchline-social-drafts",artifact_storage_key:objectKey,artifact_etag:null,
    manifest_checksum:SHA_C,artifact_checksum:SHA_B,caption_checksum:SHA_D });
  const draft = json(await sql(`select public.touchline_social_044_create_draft('${payload.replaceAll("'", "''")}'::jsonb)`));
  const draftId = String(draft.draftId ?? "");
  await sql(`select public.touchline_social_044_complete_job('${runner044Lease}'::uuid,'${job044Id}'::uuid,'${job044Lease}'::uuid,'COMPLETED','IMMUTABLE_DRAFT_READY','${draftId}'::uuid)`);
  await sql(`select public.touchline_social_044_complete_cycle('RUNNER','${runner044Lease}'::uuid,'SUCCESS',null,1)`);
  const artIntent = json(await sql(`set role service_role; select public.touchline_social_044_issue_review_intent('${draftId}'::uuid,'ARTWORK','${SHA_B}','${SHA_C}','${SHA_A}','${sourceRevisionChecksum}','${OWNER_ID}'::uuid)`));
  const copyIntent = json(await sql(`set role service_role; select public.touchline_social_044_issue_review_intent('${draftId}'::uuid,'CAPTION','${SHA_D}','${SHA_C}','${SHA_A}','${sourceRevisionChecksum}','${OWNER_ID}'::uuid)`));
  await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_044_approve('${String(artIntent.intentId)}'::uuid,'${draftId}'::uuid,'ARTWORK','${SHA_B}','${SHA_C}','${SHA_A}','${sourceRevisionChecksum}','${OWNER_ID}'::uuid)`);
  await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_044_approve('${String(copyIntent.intentId)}'::uuid,'${draftId}'::uuid,'CAPTION','${SHA_D}','${SHA_C}','${SHA_A}','${sourceRevisionChecksum}','${OWNER_ID}'::uuid)`);

  const security = await sql([
    "select",
    "has_table_privilege('anon','public.touchline_club_social_posts','select')::int || '|' ||",
    "has_table_privilege('authenticated','public.touchline_club_social_posts','select')::int || '|' ||",
    "has_table_privilege('service_role','public.touchline_club_social_posts','insert,update,delete')::int || '|' ||",
    "has_function_privilege('service_role','public.touchline_social_045_read_feed(text,integer,timestamptz,uuid)','execute')::int || '|' ||",
    "has_function_privilege('service_role','public.touchline_social_045_admin_status()','execute')::int || '|' ||",
    "has_function_privilege('authenticated','public.touchline_social_045_enqueue_job(uuid,uuid,text[],text,text)','execute')::int",
  ].join(" "));
  if (security.trim() !== "0|0|0|1|1|0") throw new Error(`TL_SOCIAL_SHADOW_045_SECURITY_FAILED:${security}`);
  const denied = await sql("set role authenticated; select public.touchline_social_045_read_feed('15',6,null,null)",1);
  if (!/permission denied/i.test(denied)) throw new Error("TL_SOCIAL_SHADOW_045_AUTHENTICATED_READ_NOT_BLOCKED");
  const adminDenied = await sql("set role authenticated; select public.touchline_social_045_admin_status()",1);
  if (!/permission denied/i.test(adminDenied)) throw new Error("TL_SOCIAL_SHADOW_045_AUTHENTICATED_ADMIN_STATUS_NOT_BLOCKED");

  const scheduler045 = json(await sql("set role service_role; select public.touchline_social_045_claim_cycle('SCHEDULER')"));
  const scheduler045Lease = String(scheduler045.leaseToken ?? "");
  const teamIds = `{${Array.from({length:20},(_,index)=>index+1).join(",")}}`;
  const enqueue = `set role service_role; select public.touchline_social_045_enqueue_job('${scheduler045Lease}'::uuid,'${draftId}'::uuid,'${teamIds}'::text[],'${TIMELINE_COPY}','${TIMELINE_COPY_CHECKSUM}')`;
  await Promise.all([sql(enqueue),sql(enqueue)]);
  if ((await sql("select count(*) from public.touchline_club_social_fanout_jobs")).trim() !== "1") throw new Error("TL_SOCIAL_SHADOW_045_JOB_IDEMPOTENCY_FAILED");
  await sql(`set role service_role; select public.touchline_social_045_complete_cycle('SCHEDULER','${scheduler045Lease}'::uuid,'SUCCESS',null,1)`);
  const runner045 = json(await sql("set role service_role; select public.touchline_social_045_claim_cycle('RUNNER')"));
  const runner045Lease = String(runner045.leaseToken ?? "");
  const job045 = json(await sql(`set role service_role; select public.touchline_social_045_claim_job('${runner045Lease}'::uuid)`));
  const published = json(await sql(`set role service_role; select public.touchline_social_045_complete_job('${runner045Lease}'::uuid,'${String(job045.jobId)}'::uuid,'${String(job045.leaseToken)}'::uuid,'PUBLISHED','CLUB_FEED_PUBLISHED')`));
  if (published.outcome !== "published" || published.fanoutCount !== 20) throw new Error("TL_SOCIAL_SHADOW_045_FANOUT_FAILED");
  const publishedPostId = String(published.postId ?? "");
  await sql(`set role service_role; select public.touchline_social_045_complete_cycle('RUNNER','${runner045Lease}'::uuid,'SUCCESS',null,1)`);
  const feed = json(await sql("set role service_role; select public.touchline_social_045_read_feed('15',6,null,null)"));
  if (!Array.isArray(feed.items) || feed.items.length !== 1) throw new Error("TL_SOCIAL_SHADOW_045_FEED_READ_FAILED");
  const adminStatus = json(await sql("set role service_role; select public.touchline_social_045_admin_status()"));
  if (!Array.isArray(adminStatus.cycles) || adminStatus.cycles.length !== 2
    || !Array.isArray(adminStatus.jobs) || adminStatus.jobs.length !== 1
    || adminStatus.jobCount !== 1 || !Array.isArray(adminStatus.posts)
    || adminStatus.posts.length !== 1 || adminStatus.postCount !== 1
    || adminStatus.tombstoneCount !== 0) {
    throw new Error("TL_SOCIAL_SHADOW_045_ADMIN_STATUS_FAILED");
  }
  const invariants = await sql("select (select count(*) from public.touchline_club_social_posts) || '|' || (select count(*) from public.touchline_club_social_post_clubs) || '|' || (select count(*) from storage.objects)");
  if (invariants.trim() !== "1|20|0") throw new Error(`TL_SOCIAL_SHADOW_045_REFERENCE_INVARIANT_FAILED:${invariants}`);
  const rollbackGuard = await file("supabase/qa/045_touchline_qa_club_social_feed_rollback.sql",3);
  if (!rollbackGuard.includes("TL_SOCIAL_045_ROLLBACK_NONEMPTY")) throw new Error("TL_SOCIAL_SHADOW_045_ROLLBACK_GUARD_FAILED");

  await sql("update public.touchline_club_social_posts set published_at=expiry_clock.now_at-interval '15 days',expires_at=expiry_clock.now_at-interval '1 day' from (select clock_timestamp() as now_at) expiry_clock");
  const expired = json(await sql("set role service_role; select public.touchline_social_045_expire_posts(gen_random_uuid(),100)"));
  if (expired.deleted !== 1 || (await sql("select count(*) from public.touchline_club_social_posts")).trim() !== "0"
    || (await sql("select count(*) from public.touchline_club_social_tombstones where deletion_reason='RETENTION_EXPIRED'")).trim() !== "1") {
    throw new Error("TL_SOCIAL_SHADOW_045_RETENTION_FAILED");
  }
  const archivedJob = await sql(`select job_state||'|'||reason_code||'|'||archived_post_id::text||'|'||(generated_post_id is null)::int from public.touchline_club_social_fanout_jobs where id='${String(job045.jobId)}'`);
  if (archivedJob.trim() !== `ARCHIVED|RETENTION_EXPIRED|${publishedPostId}|1`) throw new Error("TL_SOCIAL_SHADOW_045_JOB_ARCHIVE_FAILED");
  const tombstoneShape = await sql("select (not (to_jsonb(t) ? 'timeline_copy'))::int from public.touchline_club_social_tombstones t limit 1");
  if (tombstoneShape.trim() !== "1") throw new Error("TL_SOCIAL_SHADOW_045_TOMBSTONE_CONTENT_LEAK");

  await sql(`update public.touchline_club_social_fanout_jobs set job_state='RUNNING',reason_code='RUNNER_CLAIMED',attempt_count=1,
    next_eligible_at=null,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()-interval '1 second',
    lease_heartbeat_at=clock_timestamp()-interval '2 minutes',generated_post_id=null,archived_post_id=null,
    last_error_code=null,completed_at=null where id='${String(job045.jobId)}'`);
  const recoveryRunner = json(await sql("set role service_role; select public.touchline_social_045_claim_cycle('RUNNER')"));
  const recoveryRunnerLease = String(recoveryRunner.leaseToken ?? "");
  const recoveryClaim = json(await sql(`set role service_role; select public.touchline_social_045_claim_job('${recoveryRunnerLease}'::uuid)`));
  if (recoveryClaim.outcome !== "empty" || (await sql(`select job_state||'|'||reason_code from public.touchline_club_social_fanout_jobs where id='${String(job045.jobId)}'`)).trim() !== "RETRY_WAIT|FANOUT_LEASE_EXPIRED") {
    throw new Error("TL_SOCIAL_SHADOW_045_EXPIRED_JOB_RECOVERY_FAILED");
  }
  await sql(`set role service_role; select public.touchline_social_045_complete_cycle('RUNNER','${recoveryRunnerLease}'::uuid,'SUCCESS',null,0)`);

  const rollbackNonEmpty = await file("supabase/qa/045_touchline_qa_club_social_feed_rollback.sql",3);
  if (!rollbackNonEmpty.includes("TL_SOCIAL_045_ROLLBACK_NONEMPTY")) throw new Error("TL_SOCIAL_SHADOW_045_ROLLBACK_NONEMPTY_NOT_ENFORCED");

  await sql("truncate table public.touchline_club_social_fanout_jobs,public.touchline_club_social_post_clubs,public.touchline_club_social_posts,public.touchline_club_social_tombstones cascade");
  await file("supabase/qa/045_touchline_qa_club_social_feed_rollback.sql");
  const restored = await sql("select pg_catalog.pg_get_functiondef('public.touchline_social_044_approve(uuid,uuid,text,text,text,text,text,uuid)'::regprocedure)");
  if (restored.replace(/\s+/g,"") !== frozen044.replace(/\s+/g,"")) throw new Error("TL_SOCIAL_SHADOW_045_044_NOT_PRESERVED");
  if ((await sql("select (pg_catalog.to_regclass('public.touchline_club_social_posts') is null)::int || '|' || (pg_catalog.to_regclass('public.touchline_social_ranking_generation_jobs') is not null)::int")).trim() !== "1|1") {
    throw new Error("TL_SOCIAL_SHADOW_045_ROLLBACK_STATE_INVALID");
  }

  process.stdout.write(`${JSON.stringify({postgresVersion:version,secondApply:"FAIL_CLOSED",rlsAndGrants:"PASS",
    authenticatedRead:"FAIL_CLOSED",jobIdempotency:"PASS",fanoutReferences:20,mediaByteCopies:0,
    boundedRead:"PASS",adminTelemetryRpc:"PASS",retention14Days:"PASS",minimalTombstone:"PASS",jobArchive:"PASS",
    expiredJobRecovery:"PASS",rollbackNonEmpty:"FAIL_CLOSED",
    rollbackRestores044:"PASS",outbound:"DISABLED",sharedQaWrites:0,productionWrites:0})}\n`);
} finally {
  if (started) await command(pgCtl,["-D",data,"-m","immediate","stop"]).catch(()=>undefined);
  rmSync(root,{recursive:true,force:true});
}
