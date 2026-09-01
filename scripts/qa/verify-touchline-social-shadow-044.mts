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

if (BIN === "/" || basename(BIN) !== "bin") throw new Error("TL_SOCIAL_SHADOW_PG_BIN_REQUIRED");

function command(executable: string, args: string[], options: { env?: NodeJS.ProcessEnv; expectedExit?: number } = {}) {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: ROOT, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === (options.expectedExit ?? 0)
      ? resolvePromise(output.trim())
      : reject(new Error(`TL_SOCIAL_SHADOW_044_COMMAND_FAILED:${basename(executable)}:${code}\n${output}`)));
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

const root = mkdtempSync(join("/tmp", "tls044-"));
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket);
const port = await freePort();
const database = `touchline_social_shadow_039_ranking_044_${process.pid}`.toLowerCase();
const postgres = join(BIN, "postgres");
const pgCtl = join(BIN, "pg_ctl");
const psql = join(BIN, "psql");
let started = false;
const environment = () => ({
  PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: database,
  PGOPTIONS: `-c touchline.shadow_039_ack=LOCAL_EMPTY_CLUSTER_ONLY -c touchline.shadow_039_database=${database}`,
});
const sql = (value: string, expectedExit = 0) => command(
  psql, ["-v", "ON_ERROR_STOP=1", "-At", "-c", value], { env: environment(), expectedExit },
);
const file = (value: string, expectedExit = 0) => command(
  psql, ["-v", "ON_ERROR_STOP=1", "-f", resolve(ROOT, value)], { env: environment(), expectedExit },
);
const json = (value: string) => JSON.parse(value.split("\n").filter(Boolean).at(-1) ?? "{}") as Record<string, unknown>;

try {
  const version = await command(postgres, ["--version"]);
  if (!EXPECTED_VERSION.test(version)) throw new Error(`TL_SOCIAL_SHADOW_044_VERSION_MISMATCH:${version}`);
  await command(join(BIN, "initdb"), ["-D", data, "--auth-local=trust", "--auth-host=trust", "--no-locale", "--encoding=UTF8"]);
  await command(pgCtl, ["-D", data, "-o", `-h 127.0.0.1 -p ${port} -k ${socket}`, "-w", "start"]);
  started = true;
  await command(join(BIN, "createdb"), [database], { env: { PGHOST: "127.0.0.1", PGPORT: String(port) } });
  await file("supabase/tests/039_shadow_local_bootstrap.sql");
  await file("supabase/qa/039_touchline_qa_social_approval_outbox.sql");
  await file("supabase/qa/040_touchline_qa_social_draft_executor.sql");
  await file("supabase/qa/041_touchline_qa_social_match_preview.sql");
  await file("supabase/qa/042_touchline_qa_social_final_result.sql");
  await file("supabase/qa/043_touchline_qa_social_confirmed_events.sql");
  const frozen043Guard = await sql("select pg_catalog.pg_get_functiondef('public.touchline_social_guard_executor_draft_approval()'::regprocedure)");
  await file("supabase/qa/044_touchline_qa_social_ranking_family.sql");

  const second = await file("supabase/qa/044_touchline_qa_social_ranking_family.sql", 3);
  if (!second.includes("TL_SOCIAL_RANKING_044_SCHEMA_PRECONDITION_FAILED")) {
    throw new Error("TL_SOCIAL_SHADOW_044_SECOND_APPLY_NOT_FAIL_CLOSED");
  }
  const security = await sql([
    "select",
    "has_table_privilege('service_role','public.touchline_social_ranking_generation_jobs','select')::int || '|' ||",
    "has_table_privilege('authenticated','public.touchline_social_ranking_generation_jobs','select')::int || '|' ||",
    "has_function_privilege('service_role','public.touchline_social_044_issue_review_intent(uuid,text,text,text,text,text,uuid)','execute')::int || '|' ||",
    "has_function_privilege('authenticated','public.touchline_social_044_issue_review_intent(uuid,text,text,text,text,text,uuid)','execute')::int || '|' ||",
    "has_function_privilege('authenticated','public.touchline_social_044_approve(uuid,uuid,text,text,text,text,text,uuid)','execute')::int",
  ].join(" "));
  if (security.trim() !== "1|0|1|0|1") throw new Error(`TL_SOCIAL_SHADOW_044_SECURITY_FAILED:${security}`);
  const directIntent = await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_044_issue_review_intent(gen_random_uuid(),'ARTWORK','${SHA_B}','${SHA_C}','${SHA_A}','${SHA_D}','${OWNER_ID}'::uuid)`, 1);
  if (!/permission denied/i.test(directIntent)) throw new Error("TL_SOCIAL_SHADOW_044_AUTHENTICATED_INTENT_NOT_BLOCKED");

  const source = json(await sql("select public.touchline_social_read_source_revision(array['card-ranking:touchline-england','round:2'])"));
  const revisionChecksum = String(source.checksum ?? "");
  const manifest = JSON.stringify(source.manifest);
  if (!/^sha256:[0-9a-f]{64}$/.test(revisionChecksum)) throw new Error("TL_SOCIAL_SHADOW_044_SOURCE_REVISION_INVALID");

  const scheduler = json(await sql("select public.touchline_social_044_claim_cycle('SCHEDULER')"));
  const schedulerLease = String(scheduler.leaseToken ?? "");
  if (scheduler.outcome !== "claimed") throw new Error("TL_SOCIAL_SHADOW_044_SCHEDULER_CLAIM_FAILED");
  const invalidLatePreview = await sql(`select public.touchline_social_044_enqueue_job('${schedulerLease}'::uuid,'19722192','2',null,'GAMEWEEK_RANKING_PREVIEW','touchline-social-ranking-feed-v1','2026-08-31T18:01:00Z','2026-08-31T18:00:00Z','${SHA_A}','${manifest}'::jsonb,'${revisionChecksum}')`, 1);
  if (!invalidLatePreview.includes("TL_SOCIAL_RANKING_JOB_INPUT_INVALID")) {
    throw new Error("TL_SOCIAL_SHADOW_044_LATE_PREVIEW_NOT_BLOCKED");
  }
  const invalidLateDuel = await sql(`select public.touchline_social_044_enqueue_job('${schedulerLease}'::uuid,'19722192',null,null,'PLAYER_DUEL','touchline-social-ranking-feed-v1','2026-08-31T18:01:00Z','2026-08-31T18:00:00Z','${SHA_A}','${manifest}'::jsonb,'${revisionChecksum}')`, 1);
  if (!invalidLateDuel.includes("TL_SOCIAL_RANKING_JOB_INPUT_INVALID")) {
    throw new Error("TL_SOCIAL_SHADOW_044_LATE_DUEL_NOT_BLOCKED");
  }
  const invalidEarlyFinal = await sql(`select public.touchline_social_044_enqueue_job('${schedulerLease}'::uuid,'19722192','2',null,'GAMEWEEK_RANKING_FINAL','touchline-social-ranking-feed-v1','2026-08-31T17:59:00Z','2026-08-31T18:00:00Z','${SHA_A}','${manifest}'::jsonb,'${revisionChecksum}')`, 1);
  if (!invalidEarlyFinal.includes("TL_SOCIAL_RANKING_JOB_INPUT_INVALID")) {
    throw new Error("TL_SOCIAL_SHADOW_044_EARLY_FINAL_NOT_BLOCKED");
  }
  const enqueue = `select public.touchline_social_044_enqueue_job('${schedulerLease}'::uuid,'19722192','2',null,'GAMEWEEK_RANKING_PREVIEW','touchline-social-ranking-feed-v1','2026-08-31T17:00:00Z','2026-08-31T18:00:00Z','${SHA_A}','${manifest}'::jsonb,'${revisionChecksum}')`;
  await Promise.all([sql(enqueue), sql(enqueue)]);
  if ((await sql("select count(*) from public.touchline_social_ranking_generation_jobs")).trim() !== "1") {
    throw new Error("TL_SOCIAL_SHADOW_044_JOB_IDEMPOTENCY_FAILED");
  }
  await sql(`select public.touchline_social_044_complete_cycle('SCHEDULER','${schedulerLease}'::uuid,'SUCCESS',null,1)`);

  const runner = json(await sql("select public.touchline_social_044_claim_cycle('RUNNER')"));
  const runnerLease = String(runner.leaseToken ?? "");
  const job = json(await sql(`select public.touchline_social_044_claim_job('${runnerLease}'::uuid)`));
  const jobId = String(job.jobId ?? "");
  const jobLease = String(job.leaseToken ?? "");
  if (job.outcome !== "claimed" || job.scopeId !== "2" || job.playerId !== null
    || job.contentType !== "GAMEWEEK_RANKING_PREVIEW") throw new Error("TL_SOCIAL_SHADOW_044_JOB_CLAIM_FAILED");

  const publicationKey = "instagram:INSTAGRAM_FEED:GAMEWEEK_RANKING_PREVIEW:2:gameweek:en-GB:tv=touchline-social-ranking-feed-v1:sv=touchline-social-ranking-family-v1:r=1";
  const objectKey = `instagram/instagram_feed/gameweek_ranking_preview/2/gameweek/en-GB/tv=touchline-social-ranking-feed-v1/sv=touchline-social-ranking-family-v1/r=1/${"b".repeat(64)}.png`;
  const payload = JSON.stringify({ publication_key: publicationKey, fixture_provider_id: "19722192",
    team_provider_id: null, event_provider_id: null, scope_provider_id: "2",
    subject_player_provider_id: null, content_type: "GAMEWEEK_RANKING_PREVIEW",
    placement: "INSTAGRAM_FEED", locale: "en-GB", revision: 1,
    render_path: "/visual-qa/social-ranking?contentType=GAMEWEEK_RANKING_PREVIEW&fixtureId=19722192&scopeId=2&locale=en-GB&revision=1",
    width: 1080, height: 1350, caption: "Gameweek 2 ranking preview. COMING SOON • CURRENTLY IN TESTING",
    first_observed_at: "2026-08-31T17:00:00Z", source_snapshot_at: "2026-08-31T17:00:00Z",
    generated_at: "2026-08-31T18:00:10Z", template_version: "touchline-social-ranking-feed-v1",
    source_version: "touchline-social-ranking-family-v1", source_checksum: SHA_A,
    source_revision_manifest: source.manifest, source_revision_checksum: revisionChecksum, input_checksum: SHA_A,
    artifact_content_type: "image/png", artifact_byte_length: 1000,
    artifact_storage_provider: "SUPABASE_STORAGE", artifact_storage_bucket: "touchline-social-drafts",
    artifact_storage_key: objectKey, artifact_etag: null,
    manifest_checksum: SHA_C, artifact_checksum: SHA_B, caption_checksum: SHA_D });
  const created = json(await sql(`select public.touchline_social_044_create_draft('${payload.replaceAll("'", "''")}'::jsonb)`));
  const draftId = String(created.draftId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw new Error("TL_SOCIAL_SHADOW_044_DRAFT_CREATE_FAILED");
  const immutable = await sql(`select set_config('touchline.social_transition','approve_artwork',false); update public.touchline_social_publication_drafts set scope_provider_id='3' where id='${draftId}'::uuid`, 1);
  if (!immutable.includes("TL_SOCIAL_RANKING_DRAFT_SCOPE_IMMUTABLE")) throw new Error("TL_SOCIAL_SHADOW_044_SCOPE_MUTABLE");
  await sql(`select public.touchline_social_044_complete_job('${runnerLease}'::uuid,'${jobId}'::uuid,'${jobLease}'::uuid,'COMPLETED','IMMUTABLE_DRAFT_READY','${draftId}'::uuid)`);
  await sql(`select public.touchline_social_044_complete_cycle('RUNNER','${runnerLease}'::uuid,'SUCCESS',null,1)`);

  const artworkIntent = json(await sql(`set role service_role; select public.touchline_social_044_issue_review_intent('${draftId}'::uuid,'ARTWORK','${SHA_B}','${SHA_C}','${SHA_A}','${revisionChecksum}','${OWNER_ID}'::uuid)`));
  const captionIntent = json(await sql(`set role service_role; select public.touchline_social_044_issue_review_intent('${draftId}'::uuid,'CAPTION','${SHA_D}','${SHA_C}','${SHA_A}','${revisionChecksum}','${OWNER_ID}'::uuid)`));
  await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_044_approve('${String(artworkIntent.intentId)}'::uuid,'${draftId}'::uuid,'ARTWORK','${SHA_B}','${SHA_C}','${SHA_A}','${revisionChecksum}','${OWNER_ID}'::uuid)`);
  await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_044_approve('${String(captionIntent.intentId)}'::uuid,'${draftId}'::uuid,'CAPTION','${SHA_D}','${SHA_C}','${SHA_A}','${revisionChecksum}','${OWNER_ID}'::uuid)`);
  const approval = await sql(`select approval_state || '|' || artwork_approval_state || '|' || caption_approval_state from public.touchline_social_publication_drafts where id='${draftId}'::uuid`);
  if (approval.trim() !== "APPROVED|APPROVED|APPROVED") throw new Error(`TL_SOCIAL_SHADOW_044_APPROVAL_FAILED:${approval}`);
  const outbound = await sql(`set role authenticated; set request.jwt.claim.sub='${OWNER_ID}'; select public.touchline_social_044_enqueue_dispatch('${draftId}'::uuid)`, 1);
  if (!/TL_SOCIAL_RANKING_DISPATCH_DISABLED|permission denied/i.test(outbound)) {
    throw new Error("TL_SOCIAL_SHADOW_044_OUTBOUND_NOT_FAIL_CLOSED");
  }
  const direct = await sql("update public.touchline_social_ranking_generation_jobs set reason_code='BYPASS'", 1);
  if (!direct.includes("TL_SOCIAL_RANKING_JOB_RPC_REQUIRED")) throw new Error("TL_SOCIAL_SHADOW_044_DIRECT_MUTATION_NOT_BLOCKED");
  const rollbackGuard = await file("supabase/qa/044_touchline_qa_social_ranking_family_rollback.sql", 3);
  if (!rollbackGuard.includes("TL_SOCIAL_044_ROLLBACK_NONEMPTY")) throw new Error("TL_SOCIAL_SHADOW_044_ROLLBACK_GUARD_FAILED");

  await sql("truncate table public.touchline_social_ranking_review_intents, public.touchline_social_ranking_generation_jobs, public.touchline_social_ranking_executor_cycles, public.touchline_social_publication_drafts cascade");
  await file("supabase/qa/044_touchline_qa_social_ranking_family_rollback.sql");
  const state = await sql([
    "select",
    "(pg_catalog.to_regclass('public.touchline_social_ranking_generation_jobs') is null)::int || '|' ||",
    "(pg_catalog.to_regclass('public.touchline_social_confirmed_event_generation_jobs') is not null)::int || '|' ||",
    "(exists(select 1 from pg_catalog.pg_attribute where attrelid='public.touchline_social_publication_drafts'::regclass and attname='event_provider_id' and not attisdropped))::int || '|' ||",
    "(not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.touchline_social_publication_drafts'::regclass and attname='scope_provider_id' and not attisdropped))::int",
  ].join(" "));
  if (state.trim() !== "1|1|1|1") throw new Error(`TL_SOCIAL_SHADOW_044_ROLLBACK_STATE_INVALID:${state}`);
  const restored = await sql("select pg_catalog.pg_get_functiondef('public.touchline_social_guard_executor_draft_approval()'::regprocedure)");
  if (restored.replace(/\s+/g, "") !== frozen043Guard.replace(/\s+/g, "")) {
    throw new Error("TL_SOCIAL_SHADOW_044_ROLLBACK_043_GUARD_NOT_EQUIVALENT");
  }

  process.stdout.write(`${JSON.stringify({ postgresVersion: version, secondApply: "FAIL_CLOSED",
    rlsAndGrants: "PASS", authenticatedIntent: "FAIL_CLOSED", idempotency: "PASS",
    previewBeforeKickoff: "PASS", latePreview: "FAIL_CLOSED", lateDuel: "FAIL_CLOSED",
    earlyFinal: "FAIL_CLOSED",
    exactDraftCompletion: "PASS", identityImmutable: "PASS", separateOwnerApprovals: "PASS",
    priorAuthorities: "PRESERVED", directMutation: "FAIL_CLOSED", outbound: "FAIL_CLOSED",
    rollbackNonEmpty: "FAIL_CLOSED", rollbackRestores043: "PASS",
    sharedQaWrites: 0, productionWrites: 0 })}\n`);
} finally {
  if (started) await command(pgCtl, ["-D", data, "-m", "immediate", "stop"]).catch(() => undefined);
  rmSync(root, { recursive: true, force: true });
}
