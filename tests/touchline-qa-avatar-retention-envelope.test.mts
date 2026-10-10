import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {buildQaAvatarRetentionEnvelope,QA,SOURCES,PREDECESSOR_VERSION,PREDECESSOR_SHA256} from "../scripts/build-qa-avatar-retention-envelope.mjs";
import {buildQaAvatarInstallation} from "../scripts/build-qa-avatar-installation.mjs";
import {buildQaAvatarHistoryEnvelope} from "../scripts/build-qa-avatar-history-envelope.mjs";
const runtime=process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const {PGlite}=runtime?await import(pathToFileURL(runtime).href):{PGlite:null};
test("retention envelope pins three exact bodies, QA and rollback; commit only changes terminator",()=>{
 const rehearsal=buildQaAvatarRetentionEnvelope({projectRef:QA});
 const committed=buildQaAvatarRetentionEnvelope({projectRef:QA,commit:true});
 assert.equal(committed.sql,rehearsal.sql.replace(/rollback;\n$/,"commit;\n"));
 assert.equal(rehearsal.payloads.length,3);
 for(const p of rehearsal.payloads) {
  const source=readFileSync(new URL(`../supabase/migrations/${p.version}_${p.name}.sql`,import.meta.url),"utf8");
  assert.equal(p.payload,source.replace(/^begin;\n/m,"").slice(0,-"commit;\n".length));
 }
 assert.throws(()=>buildQaAvatarRetentionEnvelope({projectRef:"other"}),/Exact QA/);
 assert.throws(()=>buildQaAvatarRetentionEnvelope({projectRef:QA,readSource:()=>"tampered"}),/source drift/);
 assert.equal(rehearsal.metadata.executes,false); assert.equal(rehearsal.metadata.retries,false);
});
async function fixture() {
 const db=new PGlite();
 try {
  await db.exec(`create role qa_executor login nosuperuser createrole createdb bypassrls;
   create role anon; create role authenticated; create role service_role bypassrls;
   grant create on database postgres to qa_executor; grant create on schema public to qa_executor;
   set session authorization qa_executor;
   create schema auth; create table auth.users(id uuid primary key,deleted_at timestamptz);
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create table public.users(id uuid primary key references auth.users(id),avatar_url text,full_name text);
   alter table public.users enable row level security;
   create table public.touchline_qa_fixture_runs(id uuid primary key);
   create table public.touchline_user_arena_state(user_id uuid);
   create schema cron; create table cron.job(active boolean not null);
   create table public.football_data_sync_runs(status text,started_at timestamptz);
   create function public.touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
    if $1 is distinct from '${QA}' then raise exception 'TARGET'; end if; end$$;
   create schema supabase_migrations;
   create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,
    created_by text,idempotency_key text unique,rollback text[]);`);
  await db.exec(readFileSync(new URL("../supabase/qa/003_touchline_qa_owner_scenario.sql",import.meta.url),"utf8"));
  await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000001',null);
   insert into public.users values('00000000-0000-4000-8000-000000000001','/synthetic.webp','Synthetic');
   insert into public.touchline_qa_fixture_runs values('00000000-0000-4000-8000-000000000002');
   insert into public.touchline_qa_owner_scenarios(run_id,user_id,project_ref,fixture_version,status)
   values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','${QA}','synthetic','applied');`);
  await db.exec(buildQaAvatarInstallation({projectRef:QA,executorRole:"qa_executor"}).sql.replace(/rollback;\n$/,"commit;\n"));
  await db.exec("set session authorization postgres");
  await db.exec(`insert into touchline_avatar_private.account_operations(actor_id,generation,fenced_through_generation)
   values('00000000-0000-4000-8000-000000000001',2,1);
   insert into touchline_avatar_private.operations(actor_id,operation_id,expected_revision,base_generation,generation,state,terminal_at)
   values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',0,0,1,'fenced',now()-interval '6 minutes');`);
  return db;
 } catch(error) {try {await db.close();} catch(closeError) {throw new AggregateError([error,closeError]);} throw error;}
}
test("last history failure rolls all three DDL and prior two history inserts back; success/retry and preservation guards",{skip:!runtime},async()=>{
 const db=await fixture();
 try {
  const rehearsal=buildQaAvatarRetentionEnvelope({projectRef:QA});
  const committed=buildQaAvatarRetentionEnvelope({projectRef:QA,commit:true});
  const versions=SOURCES.map(s=>s[0]);
  const snapshot=async()=>(await db.query(`select (select jsonb_agg(to_jsonb(u) order by id) from public.users u) users,
   (select jsonb_agg(to_jsonb(o) order by actor_id,operation_id) from touchline_avatar_private.operations o) operations,
   (select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proowner,p.proacl::text) order by p.oid)
     from pg_proc p where pronamespace='touchline_avatar_private'::regnamespace and proowner='touchline_avatar_writer'::regrole) helpers`)).rows;
  const baseline=await snapshot();
  const unchanged=async()=>{
   assert.deepEqual(await snapshot(),baseline);
   assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version=any($1::text[])",[versions])).rows[0].n,0);
   assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='touchline_avatar_private'::regnamespace and relname like 'retention_%'")).rows[0].n,0);
   assert.equal((await db.query("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname like '%qa_avatar_retention%'")).rows[0].n,0);
  };
  await assert.rejects(db.exec(rehearsal.sql),/PREDECESSOR_DRIFT/); await db.exec("rollback"); await unchanged();
  const predecessor=buildQaAvatarHistoryEnvelope({projectRef:QA,version:PREDECESSOR_VERSION});
  assert.equal(predecessor.metadata.payloadSha256,PREDECESSOR_SHA256);
  await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",[PREDECESSOR_VERSION,predecessor.metadata.name,[predecessor.payload]]);
  await db.exec("insert into cron.job values(true)");
  await assert.rejects(db.exec(rehearsal.sql),/CRON_ACTIVE/); await db.exec("rollback"); await unchanged();
  await db.exec("update cron.job set active=false; insert into public.football_data_sync_runs values('running',now())");
  await assert.rejects(db.exec(rehearsal.sql),/SYNC_ACTIVE/); await db.exec("rollback"); await unchanged();
  await db.exec("update public.football_data_sync_runs set status='completed'");
  await db.exec("create table touchline_avatar_private.retention_candidates(dummy integer)");
  await assert.rejects(db.exec(rehearsal.sql),/EXISTING_RESOURCE/); await db.exec("rollback");
  await db.exec("drop table touchline_avatar_private.retention_candidates");
  await db.exec(rehearsal.sql); await unchanged();
  // Fault after all DDL and the first two INSERTs, without rewriting payload SQL.
  await db.exec(`create function supabase_migrations.reject_last_retention() returns trigger language plpgsql as $$begin
   if new.version='${versions[2]}' then raise exception 'DELIBERATE_LAST_HISTORY_FAILURE'; end if; return new; end$$;
   create trigger reject_last_retention before insert on supabase_migrations.schema_migrations
   for each row execute function supabase_migrations.reject_last_retention();`);
  await assert.rejects(db.exec(committed.sql),/DELIBERATE_LAST_HISTORY_FAILURE/); await db.exec("rollback"); await unchanged();
  await db.exec("drop trigger reject_last_retention on supabase_migrations.schema_migrations");
  // Data drift introduced only in disposable envelope transport is detected.
  await assert.rejects(db.exec(rehearsal.sql.replace("create temporary table retention_postimages", "update public.users set full_name='Injected';\ncreate temporary table retention_postimages")),/EXISTING_DATA_CHANGED/);
  await db.exec("rollback"); await unchanged();
  await db.exec(committed.sql); assert.deepEqual(await snapshot(),baseline);
  for(const p of committed.payloads) assert.deepEqual((await db.query("select statements from supabase_migrations.schema_migrations where version=$1",[p.version])).rows[0].statements,[p.payload]);
  assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='touchline_avatar_private'::regnamespace and relkind='r' and relname like 'retention_%' and relrowsecurity")).rows[0].n,4);
  await assert.rejects(db.exec(committed.sql),/ALREADY_APPLIED_RECONCILE/); await db.exec("rollback");
  assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version=any($1::text[])",[versions])).rows[0].n,3);
 } finally {await db.close();}
});
