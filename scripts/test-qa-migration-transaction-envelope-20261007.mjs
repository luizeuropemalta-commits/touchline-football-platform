// LOCAL SYNTHETIC PROOF ONLY. No hosted executor, SQL export, network or credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPayloads } from './check-qa-release-migration-payloads-20261007.mjs';
const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
assert(runtime, 'Set TOUCHLINE_FANTASY_PGLITE_MODULE to the verified local PGlite runtime; this proof never silently skips');
const { PGlite } = await import(runtime);

assert.equal(process.argv.length, 2, 'This local-only proof accepts no target or arguments');
const db = new PGlite(); // In-memory only; no connection string accepted.
const payloads = loadPayloads();
const quote = (text) => `'${text.replaceAll("'", "''")}'`;
const readMigration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
// Deliberately private: not a reusable hosted runner. Hosted use requires its own
// exact QA project guard and independently reviewed executor/history contract.
function envelope({ payload, metadata }) {
  const version = metadata.file.split('_')[0];
  const name = metadata.file.slice(version.length + 1, -4);
  return `begin;
    set local lock_timeout = '5s'; set local statement_timeout = '30s';
    lock table supabase_migrations.schema_migrations in exclusive mode;
    do $guard$ begin
      if exists(select 1 from supabase_migrations.schema_migrations where version=${quote(version)}) then
        raise exception 'LOCAL_PROOF_ALREADY_APPLIED';
      end if;
    end $guard$;
    ${payload.toString()}
    insert into supabase_migrations.schema_migrations(version,name,statements)
      values(${quote(version)},${quote(name)},array[${quote(payload.toString())}]);
    commit;`;
}
const markers = {
  L1: "exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_preferences' and column_name='game_locale')",
  L2: "to_regprocedure('public.touchline_set_game_locale(text,bigint)') is not null",
  Q1: "to_regclass('public.touchline_fixture_quota_scopes') is not null",
  Q2: "exists(select 1 from pg_constraint where conrelid='public.touchline_fixture_quota_attempts'::regclass and conname='touchline_fixture_quota_attempts_endpoint_check' and pg_get_constraintdef(oid) like '%topscorers%')",
  R: "to_regprocedure('public.touchline_defer_fixture_recovery(uuid,uuid,uuid,integer)') is not null",
};
async function snapshot() {
  const result = {};
  for (const [key, query] of Object.entries({
    columns: "select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
    functions: "select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) body,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1",
    relations: "select relname,relkind,relrowsecurity,relforcerowsecurity,relacl::text acl from pg_class where relnamespace='public'::regnamespace order by relname",
    constraints: "select conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by 1,2",
    policies: "select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname",
    triggers: "select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal order by 1,2",
    preferences: "select to_jsonb(p) row from public.notification_preferences p order by user_id",
    recovery: "select to_jsonb(r) row from public.touchline_fixture_recovery r order by fixture_id",
    history: "select * from supabase_migrations.schema_migrations order by version",
  })) result[key] = (await db.query(query)).rows;
  return result;
}

try {
  // Synthetic prerequisites adapted from the existing locale and recovery SQL tests.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;
    create table public.users(id uuid primary key);
    create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    insert into public.users values('11111111-1111-4111-8111-111111111111');
    create table football_competitions(id uuid primary key,provider text,provider_competition_id text);
    create table football_seasons(id uuid primary key,competition_id uuid,provider text,is_current boolean,provider_season_id text);
    create table football_clubs(id uuid primary key,provider text,provider_team_id text);
    create table football_data_sync_runs(id uuid primary key,provider text,sync_type text,status text,started_at timestamptz);
    create table football_fixtures(id uuid primary key,provider text,provider_fixture_id text,season_id uuid,competition_id uuid,starts_at timestamptz,status text,home_score integer,away_score integer,source_updated_at timestamptz,home_club_id uuid,away_club_id uuid);
    create table football_fantasy_fixture_feeds(provider text,provider_fixture_id text,fixture_payload jsonb,lineups_payload jsonb,events_payload jsonb,last_synced_at timestamptz,formations_payload jsonb,sidelined_payload jsonb,unique(provider,provider_fixture_id));
    grant select,insert,update on all tables in schema public to service_role;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text,rollback text[]);`);
  await db.exec(readMigration('017_touchline_notification_preferences.sql'));
  await db.exec(readMigration('20260923185720_touchline_fixture_backlog_recovery.sql'));
  await db.exec(`insert into notification_preferences(user_id,settings,explicit_consent_at) values('11111111-1111-4111-8111-111111111111','{"keep":true}','2026-01-01');
    insert into football_fixtures(id) values('22222222-2222-4222-8222-222222222222');
    insert into touchline_fixture_recovery(fixture_id,last_attempt_at,next_attempt_at,attempt_count,state) values('22222222-2222-4222-8222-222222222222','2026-01-01','2026-01-02',1,'pending');`);

  for (const item of payloads) {
    const { id, file } = item.metadata;
    const version = file.split('_')[0];
    // The trigger first proves the candidate's DDL is visible, then fails the
    // history INSERT itself. A failure before reaching INSERT cannot pass.
    await db.exec(`create function supabase_migrations.fail_history() returns trigger language plpgsql as $failure$
      begin if not (${markers[id]}) then raise exception 'DDL_NOT_VISIBLE'; end if;
      raise exception 'FORCED_HISTORY_INSERT_FAILURE'; end $failure$;
      create trigger fail_history before insert on supabase_migrations.schema_migrations for each row execute function supabase_migrations.fail_history();`);
    const before = await snapshot();
    await assert.rejects(db.exec(envelope(item)), /FORCED_HISTORY_INSERT_FAILURE/);
    await db.exec('rollback;');
    assert.deepEqual(await snapshot(), before, `${id}: complete schema/data/history rollback`);
    await db.exec('drop trigger fail_history on supabase_migrations.schema_migrations; drop function supabase_migrations.fail_history();');
    await db.exec(envelope(item));
    assert.equal((await db.query(`select ${markers[id]} present`)).rows[0].present, true);
    const history = (await db.query('select name,statements from supabase_migrations.schema_migrations where version=$1', [version])).rows;
    assert.equal(history.length, 1);
    assert.equal(history[0].name, file.slice(version.length + 1, -4));
    assert.deepEqual(history[0].statements, [item.payload.toString()]);
    const committed = await snapshot();
    await assert.rejects(db.exec(envelope(item)), /LOCAL_PROOF_ALREADY_APPLIED/);
    await db.exec('rollback;');
    assert.deepEqual(await snapshot(), committed, `${id}: retry changes nothing`);
    process.stdout.write(`${id}: PASS history-insert failure rolls back; success persists DDL+exact history; retry rejects unchanged\n`);
  }
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n, 5);
  assert.equal((await db.query('select count(*)::int n from touchline_fixture_quota_scopes')).rows[0].n, 0);
  process.stdout.write('PASS 5/5; no skips; local PostgreSQL/PGlite envelope only; hosted connector behavior UNVERIFIED\n');
} finally {
  await db.close();
}
