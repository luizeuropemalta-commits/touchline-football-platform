import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { buildQaAvatarHistoryEnvelope, PREDECESSORS, unwrapAvatarTransaction } from "../scripts/build-qa-avatar-history-envelope.mjs";
import { buildQaAvatarInstallation, QA_PROJECT_REF, sha256 } from "../scripts/build-qa-avatar-installation.mjs";

const version = "20261008000000"; // Disposable test identity, not a release version assignment.
test("history envelope preserves exact payload and changes only outer terminal statement for commit", () => {
  const rehearsal = buildQaAvatarHistoryEnvelope({projectRef:QA_PROJECT_REF,version});
  const committed = buildQaAvatarHistoryEnvelope({projectRef:QA_PROJECT_REF,version,commit:true});
  assert.equal(committed.sql,rehearsal.sql.replace(/rollback;\n$/,"commit;\n"));
  assert.equal(rehearsal.payload,unwrapAvatarTransaction(buildQaAvatarInstallation({projectRef:QA_PROJECT_REF}).sql));
  assert.equal(rehearsal.metadata.payloadSha256,sha256(rehearsal.payload));
  assert.throws(() => buildQaAvatarHistoryEnvelope({projectRef:"other",version}),/Exact QA/);
  for (const bad of ["", "20261008", "20261008000000';commit;", "202610080000001"]) {
    assert.throws(() => buildQaAvatarHistoryEnvelope({projectRef:QA_PROJECT_REF,version:bad}),/14-digit/);
  }
  assert.throws(() => unwrapAvatarTransaction("begin;\nbegin;\nrollback;\n"),/Exactly one/);
});

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const { PGlite } = runtime ? await import(pathToFileURL(runtime).href) : { PGlite:null };
async function fixture() {
  const db = new PGlite();
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
    create schema cron; create table cron.job(jobid bigint primary key,active boolean not null);
    create table public.football_data_sync_runs(id uuid primary key,status text,started_at timestamptz);
    create function public.touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
      if $1 is distinct from '${QA_PROJECT_REF}' then raise exception 'TARGET'; end if; end$$;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,
      created_by text,idempotency_key text unique,rollback text[]);
  `);
  // Real predecessor definitions, not altered hashes or stubbed functions.
  await db.exec(readFileSync(new URL("../supabase/qa/003_touchline_qa_owner_scenario.sql",import.meta.url),"utf8"));
  await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000001',null);
    insert into public.users values('00000000-0000-4000-8000-000000000001','/synthetic-existing.webp','Synthetic');
    insert into public.touchline_qa_fixture_runs values('00000000-0000-4000-8000-000000000002');
    insert into public.touchline_qa_owner_scenarios(run_id,user_id,project_ref,fixture_version,status)
    values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
      '${QA_PROJECT_REF}','synthetic-existing','applied');`);
  return db;
}
test("history insert failure rolls back avatar DDL, roles and predecessor replacements; success persists both and retry rejects", {skip:!runtime}, async () => {
  const db = await fixture();
  const build = (commit = false) => buildQaAvatarHistoryEnvelope({projectRef:QA_PROJECT_REF,version,executorRole:"qa_executor",commit});
  async function assertOriginal() {
    assert.deepEqual((await db.query(`select to_regnamespace('touchline_avatar_private')::text schema,
      to_regrole('touchline_avatar_writer')::text writer,to_regrole('touchline_avatar_qa_install_creator')::text creator,
      (select count(*)::int from supabase_migrations.schema_migrations) history,
      (select count(*)::int from information_schema.columns where table_schema='public' and
        ((table_name='users' and column_name='avatar_revision') or
         (table_name='touchline_qa_owner_scenarios' and column_name in ('avatar_apply_outcome','avatar_rollback_outcome')))) added_columns,
      (select count(*)::int from pg_auth_members where member='qa_executor'::regrole) memberships
    `)).rows[0],{schema:null,writer:null,creator:null,history:0,added_columns:0,memberships:0});
    for (const [signature,hash] of Object.entries(PREDECESSORS)) {
      assert.equal((await db.query("select md5(prosrc) hash from pg_proc where oid=to_regprocedure($1)",[signature])).rows[0].hash,hash);
    }
  }
  try {
    await db.exec("insert into cron.job values(1,true)");
    await assert.rejects(db.exec(build().sql),/AVATAR_QA_SCHEDULER_ACTIVE/);
    await db.exec("rollback");
    await assertOriginal();
    assert.equal((await db.query("select to_regclass('pg_temp.avatar_installation_preimages') t")).rows[0].t,null);
    await db.exec("update cron.job set active=false");
    await db.exec("insert into public.football_data_sync_runs values('00000000-0000-4000-8000-000000000003','running',now())");
    await assert.rejects(db.exec(build().sql),/AVATAR_QA_LIVE_RUN_ACTIVE/);
    await db.exec("rollback");
    await assertOriginal();
    await db.exec("update public.football_data_sync_runs set status='completed'");
    await db.exec(build().sql);
    await assertOriginal();
    for (const mutation of [
      "update public.users set full_name='Injected drift';",
      "update public.touchline_qa_owner_scenarios set metadata='{\"injected\":true}'::jsonb;",
    ]) {
      const mutated = build().sql.replace("do $avatar_data_postflight$ begin",`${mutation}\ndo $avatar_data_postflight$ begin`);
      await assert.rejects(db.exec(mutated),/AVATAR_EXISTING_DATA_CHANGED/);
      await db.exec("rollback");
      await assertOriginal();
    }
    await db.exec(`create function supabase_migrations.reject_avatar_history() returns trigger language plpgsql as $$
      begin raise exception 'DELIBERATE_HISTORY_FAILURE'; end$$;
      create trigger fail_avatar_history before insert on supabase_migrations.schema_migrations
      for each row execute function supabase_migrations.reject_avatar_history();`);
    await assert.rejects(db.exec(build(true).sql),/DELIBERATE_HISTORY_FAILURE/);
    await db.exec("rollback");
    await assertOriginal();
    await db.exec("drop trigger fail_avatar_history on supabase_migrations.schema_migrations");
    const success = build(true);
    await db.exec(success.sql);
    const history = (await db.query("select version,name,statements from supabase_migrations.schema_migrations")).rows[0];
    assert.equal(history.version,version);
    assert.equal(history.name,success.metadata.name);
    assert.deepEqual(history.statements,[success.payload]);
    assert.equal(sha256(history.statements[0]),success.metadata.payloadSha256);
    assert.equal((await db.query("select count(*)::int n from pg_proc where pronamespace='touchline_avatar_private'::regnamespace")).rows[0].n,13);
    assert.deepEqual((await db.query("select avatar_url,full_name,avatar_revision::text revision from public.users")).rows,
      [{avatar_url:"/synthetic-existing.webp",full_name:"Synthetic",revision:"0"}]);
    await assert.rejects(db.exec(success.sql),/ALREADY_APPLIED_RECONCILE/);
    await db.exec("rollback");
    assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations")).rows[0].n,1);
  } finally { await db.close(); }
});
