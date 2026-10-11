import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  TOUCHLINE_QA_MIGRATION_BATCH_20261011,
  prepareTouchlineQaMigrationPayload,
} from "../scripts/qa/verify-touchline-qa-migration-batch-20261011.mjs";

// This is an in-memory rehearsal of the *real* 05000--15000 payloads in one
// transaction.  It intentionally does not execute 060 (the QA preimage
// DRAFT), make a network connection, or substitute the historical Fantasy
// functions that 10000/14000/15000 patch by exact source text.
type Row = Record<string, unknown>;
type Db = {
  exec(sql: string): Promise<unknown>;
  query<T extends Row = Row>(sql: string, args?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};

const migration = (name: string) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const source = (file: string) => readFile(new URL(`../${file}`, import.meta.url));
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function actualTable(sql: string, name: string) {
  const start = sql.indexOf(`create table if not exists public.${name} (`);
  const end = sql.indexOf("\n);", start);
  assert.ok(start >= 0 && end > start, `missing real ${name} table`);
  return sql.slice(start, end + 3);
}

function actualFunction(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = sql.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start, `missing real ${name} function`);
  return sql.slice(start, end + 4);
}

async function makeBaseline(): Promise<Db> {
  const db: Db = new PGlite();
  try {
    // These are leaf relations outside the 11-payload batch.  Definitions
    // patched by the batch are loaded below from their actual migrations.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $$;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(auth.jwt() ->> 'sub', '')::uuid
      $$;
      create table auth.users(
        id uuid primary key,
        email text,
        email_confirmed_at timestamptz,
        raw_app_meta_data jsonb default '{}'::jsonb,
        raw_user_meta_data jsonb default '{}'::jsonb,
        updated_at timestamptz default now()
      );
      create table public.users(id uuid primary key, full_name text not null default '');
      create table public.football_competitions(id uuid primary key, provider text, provider_competition_id text);
      create table public.football_seasons(id uuid primary key);
      create table public.football_clubs(id uuid primary key, provider text, provider_team_id text);
      create table public.football_players(id uuid primary key, provider text, provider_player_id text, current_club_id uuid, position text, detailed_position text);
      create table public.football_rounds(id uuid primary key, competition_id uuid, season_id uuid, name text);
      create table public.football_fixtures(
        id uuid primary key, round_id uuid, competition_id uuid, season_id uuid,
        provider text, provider_fixture_id text, starts_at timestamptz, status text,
        home_club_id uuid, away_club_id uuid, finalized_at timestamptz,
        provider_updated_at timestamptz, source_updated_at timestamptz,
        updated_at timestamptz default now()
      );
      create table public.football_squad_members(id uuid primary key, provider text, club_id uuid, player_id uuid, position text, detailed_position text, status text);
      create table public.football_player_market_values(id uuid primary key, player_id uuid, market_value_eur bigint, status text, confidence text);
      create table public.touchline_card_publications(id uuid primary key, player_id uuid, current_membership_id uuid, market_value_id uuid, publication_status text, published_at timestamptz);
      create table public.touchline_formation_geometry_versions(formation_code text, geometry_version integer, status text, geometry jsonb, primary key(formation_code, geometry_version));
      create table public.touchline_card_inventory(id uuid primary key, player_id uuid);
      create table public.touchline_card_contracts(user_id uuid not null references public.users(id), card_id uuid not null references public.touchline_card_inventory(id), status text not null);
      create table public.touchline_user_arena_state(user_id uuid primary key references public.users(id), lineup jsonb not null default '[]'::jsonb);
      create table public.football_live_snapshots(snapshot_key text primary key, payload jsonb not null, fetched_at timestamptz);
      create table public.touchline_card_ranking_active_snapshots(league_key text primary key, snapshot_id text);
      create table public.touchline_card_ranking_snapshots(snapshot_id text, league_key text, source text, status text, scoring_version text, coverage_status text, expected_player_count integer, actual_player_count integer, fixture_ids jsonb, expected_fixture_ids jsonb);
      create table public.touchline_coach_ranking_active_snapshots(league_key text primary key, snapshot_id text);
      create table public.touchline_coach_ranking_snapshots(snapshot_id text, league_key text, scoring_version text, fixture_ids jsonb);
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key, name text not null, statements text[] not null);
    `);

    // Reuse the historical Fantasy lifecycle chain exactly as the existing
    // Market-plan PGlite test does, stopping immediately before 10000.
    const fantasyBase = await migration("20260825165821_touchline_fantasy_gameweek_v1");
    const tableStart = fantasyBase.indexOf("create table if not exists public.touchline_fantasy_configs");
    const tableEnd = fantasyBase.indexOf("create or replace function public.touchline_fantasy_position_bucket");
    assert.ok(tableStart >= 0 && tableEnd > tableStart, "Fantasy base table slice must remain recognizable");
    await db.exec(fantasyBase.slice(tableStart, tableEnd));
    await db.exec(fantasyBase.split("\n").filter((line) =>
      /^(?:alter table public\.touchline_fantasy_\w+ enable row level security;|revoke all on table public\.touchline_fantasy_|grant .* on table public\.touchline_fantasy_)/.test(line),
    ).join("\n"));
    for (const name of ["position_bucket", "fixture_is_final", "fixture_is_live", "entitlement_is_active", "sync_gameweeks", "reconcile_gameweek"]) {
      await db.exec(actualFunction(fantasyBase, `touchline_fantasy_${name}`));
    }
    await db.exec(actualTable(await migration("048_touchline_player_season_statistics_read_model"), "football_player_fixture_statistics"));
    await db.exec(actualTable(await migration("015_sportmonks_fantasy_data_foundation"), "football_fantasy_fixture_feeds"));
    await db.exec(await migration("20260825202938_touchline_fantasy_markt_gameweek_xi"));
    const functionPermissions = fantasyBase.split("\n").filter((line) =>
      /^(?:revoke all|grant execute) on function public\.touchline_fantasy_(?:lock_gameweek|reconcile_gameweek|prepare_user_gameweek)\(/.test(line),
    );
    assert.equal(functionPermissions.length, 6, "real Fantasy function ACL baseline");
    await db.exec(functionPermissions.join("\n"));
    await db.exec(await migration("20260825213744_touchline_fantasy_wall_clock_deadline"));
    const finality = await migration("20260826173229_touchline_fantasy_inter_round_market_window");
    await db.exec(finality.slice(0, finality.indexOf("create or replace function public.touchline_fantasy_sync_gameweeks")));
    await db.exec(await migration("20260919151427_touchline_fantasy_kickoff_final_whistle_market_window"));
    await db.exec(await migration("20260920153000_touchline_fantasy_safe_rollover_settlement"));
    // 11000 and 12000 patch this ten-argument historical subscription-event
    // writer by exact regprocedure.  It must be real rather than a harness
    // stand-in or those source-mismatch guards are not meaningful.
    await db.exec(await migration("20260825182600_touchline_fantasy_subscription_event_ordering"));

    // The three applied QA predecessors are real source too.  02000 feeds
    // 05000--09000 and 03000/04000 are the exact publisher source 13000
    // validates and patches.
    await db.exec(await migration("20261011002000_touchline_arena_quick_substitution_persistence"));
    const owner = id(1);
    const competition = id(2);
    const season = id(3);
    const club = id(4);
    const round = id(5);
    const fixture = id(6);
    const gameweek = id(7);
    const draft = id(8);
    const session = id(9);
    const inventory = Array.from({ length: 20 }, (_, index) => id(100 + index));
    await db.exec(`
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
        ('${owner}','member@example.com',clock_timestamp(),'{}');
      insert into public.users(id,full_name) values ('${owner}','Existing member');
      insert into public.football_competitions(id,provider,provider_competition_id) values ('${competition}','sportmonks','8');
      insert into public.football_seasons(id) values ('${season}');
      insert into public.football_clubs(id,provider,provider_team_id) values ('${club}','sportmonks','22');
      insert into public.football_rounds(id,competition_id,season_id,name) values ('${round}','${competition}','${season}','Gameweek 1');
      insert into public.football_fixtures(id,round_id,competition_id,season_id,provider,provider_fixture_id,starts_at,status,home_club_id,away_club_id)
        values ('${fixture}','${round}','${competition}','${season}','sportmonks','91001',clock_timestamp()+interval '1 hour','NS','${club}','${club}');
      insert into public.touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
        values ('england','${competition}','${season}',2990,'GBP',500000000,3);
      insert into public.touchline_fantasy_entitlements(user_id,status,source,metadata)
        values ('${owner}','active','qa_grant','{"preexisting":true}');
      insert into public.touchline_fantasy_gameweeks(id,competition_id,season_id,round_id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at)
        values ('${gameweek}','${competition}','${season}','${round}',1,'LOCKED',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '30 minutes',clock_timestamp()+interval '3 hours');
      insert into public.touchline_fantasy_user_gameweeks(id,user_id,gameweek_id,formation_code,state,budget_eur_snapshot,max_players_per_club_snapshot,total_market_value_eur)
        values ('${draft}','${owner}','${gameweek}','4-3-3','DRAFT',500000000,3,0);
      insert into public.touchline_fantasy_audit_events(user_id,gameweek_id,event_type,metadata)
        values ('${owner}','${gameweek}','DRAFT_SAVED','{"preexisting":true}');
    `);
    for (const [index, cardId] of inventory.entries()) {
      await db.query("insert into public.touchline_card_inventory(id,player_id) values($1,$2)", [cardId, id(200 + index)]);
      await db.query("insert into public.touchline_card_contracts(user_id,card_id,status) values($1,$2,'active')", [owner, cardId]);
    }
    await db.query(`insert into public.touchline_arena_quick_substitution_sessions(
      id,user_id,fixture_id,roster_revision,starting_inventory_ids,bench_inventory_ids,
      active_inventory_ids,available_bench_inventory_ids
    ) values($1,$2,$3,'preexisting-r1',$4::uuid[],$5::uuid[],$4::uuid[],$5::uuid[])`,
    [session, owner, fixture, inventory.slice(0, 11), inventory.slice(11)]);
    await db.exec(await migration("20261011003000_touchline_live_presentation_immutable_publication"));
    await db.exec(await migration("20261011004000_touchline_live_presentation_freshness_guard"));
    const presentation = id(10);
    await db.query(`insert into public.football_live_snapshots(snapshot_key,payload,fetched_at)
      values('touchline-england-live',$1::jsonb,clock_timestamp())`, [JSON.stringify({ fixtures: [] })]);
    await db.query(`insert into public.touchline_live_presentation_snapshots(id,scope_key,content_digest,payload)
      values($1,'touchline-england','00000000000000000000000000000000','{}'::jsonb)`, [presentation]);
    await db.query("insert into public.touchline_live_presentation_active_snapshots(scope_key,snapshot_id) values('touchline-england',$1)", [presentation]);
    await db.exec(actualTable(await migration("027_touchline_tc_wallet_integrity"), "touchline_platform_owner_accounts"));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function batchPayloads() {
  return Promise.all(TOUCHLINE_QA_MIGRATION_BATCH_20261011.map(async (entry) => {
    const fullSource = await source(entry.file);
    const prepared = prepareTouchlineQaMigrationPayload(entry, fullSource);
    return Object.freeze({ entry, fullSource, payload: prepared.payload.toString("utf8") });
  }));
}

async function baselineFingerprint(db: Db) {
  const result = await db.query<{ fingerprint: unknown }>(`
    with relation_rows as (
      select n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
        c.relacl::text acl, pg_get_userbyid(c.relowner) owner
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'supabase_migrations')
        and c.relkind in ('r', 'p', 'i', 'S')
    ), column_rows as (
      select n.nspname, c.relname, a.attname, a.atttypid::regtype::text type,
        a.attnotnull, a.attnum, pg_get_expr(d.adbin,d.adrelid) default_expression
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname in ('public', 'supabase_migrations') and a.attnum > 0 and not a.attisdropped
    ), function_rows as (
      select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) arguments,
        pg_get_functiondef(p.oid) definition, p.proacl::text acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ), constraint_rows as (
      select k.conrelid::regclass::text relation, k.conname, k.contype,
        pg_get_constraintdef(k.oid) definition
      from pg_constraint k join pg_namespace n on n.oid = k.connamespace
      where n.nspname in ('public', 'supabase_migrations')
    ), trigger_rows as (
      select c.relname relation, t.tgname, pg_get_triggerdef(t.oid) definition
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'supabase_migrations') and not t.tgisinternal
    ), policy_rows as (
      select tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies where schemaname = 'public'
    ), index_rows as (
      select c.relname relation, i.relname index_name, pg_get_indexdef(i.oid) definition
      from pg_index x join pg_class c on c.oid = x.indrelid
      join pg_class i on i.oid = x.indexrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'supabase_migrations')
    )
    select jsonb_build_object(
      'relations', coalesce((select jsonb_agg(to_jsonb(relation_rows) order by nspname, relname, relkind) from relation_rows), '[]'::jsonb),
      'columns', coalesce((select jsonb_agg(to_jsonb(column_rows) order by nspname, relname, attnum) from column_rows), '[]'::jsonb),
      'functions', coalesce((select jsonb_agg(to_jsonb(function_rows) order by nspname, proname, arguments) from function_rows), '[]'::jsonb),
      'constraints', coalesce((select jsonb_agg(to_jsonb(constraint_rows) order by relation, conname) from constraint_rows), '[]'::jsonb),
      'triggers', coalesce((select jsonb_agg(to_jsonb(trigger_rows) order by relation, tgname) from trigger_rows), '[]'::jsonb),
      'policies', coalesce((select jsonb_agg(to_jsonb(policy_rows) order by tablename, policyname) from policy_rows), '[]'::jsonb),
      'indexes', coalesce((select jsonb_agg(to_jsonb(index_rows) order by relation, index_name) from index_rows), '[]'::jsonb),
      'data', jsonb_build_object(
        'quick_sub_sessions', (select coalesce(jsonb_agg(to_jsonb(row) order by id), '[]'::jsonb) from public.touchline_arena_quick_substitution_sessions row),
        'quick_sub_events', (select coalesce(jsonb_agg(to_jsonb(row) order by command_id), '[]'::jsonb) from public.touchline_arena_quick_substitution_events row),
        'live_snapshots', (select coalesce(jsonb_agg(to_jsonb(row) order by id), '[]'::jsonb) from public.touchline_live_presentation_snapshots row),
        'live_pointers', (select coalesce(jsonb_agg(to_jsonb(row) order by scope_key), '[]'::jsonb) from public.touchline_live_presentation_active_snapshots row),
        'entitlements', (select coalesce(jsonb_agg(to_jsonb(row) order by user_id), '[]'::jsonb) from public.touchline_fantasy_entitlements row),
        'gameweeks', (select coalesce(jsonb_agg(to_jsonb(row) order by id), '[]'::jsonb) from public.touchline_fantasy_gameweeks row),
        'user_gameweeks', (select coalesce(jsonb_agg(to_jsonb(row) order by id), '[]'::jsonb) from public.touchline_fantasy_user_gameweeks row),
        'audit_events', (select coalesce(jsonb_agg(to_jsonb(row) order by id), '[]'::jsonb) from public.touchline_fantasy_audit_events row)
      ),
      'history', coalesce((select jsonb_agg(to_jsonb(history) order by version) from supabase_migrations.schema_migrations history), '[]'::jsonb)
    ) as fingerprint
  `);
  return result.rows[0].fingerprint;
}

async function runBatch(db: Db, payloads: Awaited<ReturnType<typeof batchPayloads>>, stopAfter: number | null) {
  await db.exec("begin; lock table supabase_migrations.schema_migrations in exclusive mode;");
  try {
    const existing = (await db.query<{ count: number }>(
      "select count(*)::int as count from supabase_migrations.schema_migrations where version = any($1::text[])",
      [payloads.map(({ entry }) => entry.version)],
    )).rows[0].count;
    if (existing !== 0) throw new Error("TL_QA_BATCH_ALREADY_APPLIED_RECONCILE");
    for (const [index, item] of payloads.entries()) {
      await db.exec(item.payload);
      await db.query(
        "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
        [item.entry.version, item.entry.file.split("/").at(-1)!.replace(/\.sql$/, ""), [item.fullSource.toString("utf8")]],
      );
      if (stopAfter === index + 1) await db.exec("do $$ begin raise exception 'TL_QA_BATCH_INJECTED_FAILURE'; end $$;");
    }
    await db.exec("commit;");
  } catch (error) {
    await db.exec("rollback;");
    throw error;
  }
}

test("QA 05000--15000 batch rehearse uses actual predecessor functions, one transaction, exact history, and rollback for every prefix", async () => {
  const payloads = await batchPayloads();

  const db = await makeBaseline();
  try {
    const before = await baselineFingerprint(db);
    for (let prefix = 1; prefix <= payloads.length; prefix += 1) {
      await assert.rejects(runBatch(db, payloads, prefix), /TL_QA_BATCH_INJECTED_FAILURE/);
      assert.deepEqual(await baselineFingerprint(db), before, `injected failure after payload ${prefix} must leave no catalog, data, or history residue`);
    }
    await runBatch(db, payloads, null);
    const history = (await db.query<{ version: string; name: string; statements: string[] }>(
      "select version,name,statements from supabase_migrations.schema_migrations order by version",
    )).rows;
    assert.deepEqual(history.map((row) => row.version), payloads.map(({ entry }) => entry.version));
    for (const [index, row] of history.entries()) {
      const expected = payloads[index];
      assert.ok(expected, `missing expected payload ${index}`);
      assert.equal(row.name, expected.entry.file.split("/").at(-1)!.replace(/\.sql$/, ""));
      assert.deepEqual(row.statements, [expected.fullSource.toString("utf8")], `history keeps the exact original payload ${row.version}`);
    }
    const post = (await db.query<{ gameweek_id: string | null; command_hash: string | null; plan_key: string | null; market_plan_key_snapshot: string | null }>(`
      select
        (select column_name from information_schema.columns where table_schema='public' and table_name='touchline_arena_quick_substitution_sessions' and column_name='gameweek_id') as gameweek_id,
        (select column_name from information_schema.columns where table_schema='public' and table_name='touchline_arena_quick_substitution_events' and column_name='command_hash') as command_hash,
        (select column_name from information_schema.columns where table_schema='public' and table_name='touchline_fantasy_entitlements' and column_name='plan_key') as plan_key,
        (select column_name from information_schema.columns where table_schema='public' and table_name='touchline_fantasy_user_gameweeks' and column_name='market_plan_key_snapshot') as market_plan_key_snapshot
    `)).rows[0];
    assert.deepEqual(post, { gameweek_id: "gameweek_id", command_hash: "command_hash", plan_key: "plan_key", market_plan_key_snapshot: "market_plan_key_snapshot" });
    assert.equal((await db.query("select gameweek_id from public.touchline_arena_quick_substitution_sessions where id=$1", [id(9)])).rows[0].gameweek_id, id(7), "07000 backfills the representative pre-existing Quick Sub session from its fixture round");
    assert.equal((await db.query("select to_regclass('public.touchline_fantasy_vip_grants') as relation")).rows[0].relation, "touchline_fantasy_vip_grants");
    assert.equal((await db.query("select to_regclass('public.touchline_fantasy_beta_enrollments') as relation")).rows[0].relation, "touchline_fantasy_beta_enrollments");
    assert.match(String((await db.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.touchline_fantasy_audit_events'::regclass and conname='touchline_fantasy_audit_events_event_type_check'")).rows[0].definition), /XI_REJECTED/);
    const definitions = (await db.query<{ prepare: string; save: string; lock: string; publisher: string }>(`
      select
        pg_get_functiondef('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure) prepare,
        pg_get_functiondef('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure) save,
        pg_get_functiondef('public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure) lock,
        pg_get_functiondef('public.touchline_live_presentation_publish_current()'::regprocedure) publisher
    `)).rows[0];
    assert.match(definitions.prepare, /TL_FANTASY_PLAN_INVALID/);
    assert.match(definitions.save, /TL_FANTASY_PLAN_INVALID/);
    assert.match(definitions.lock, /v_lock_observed_at/);
    assert.match(definitions.publisher, /TL_LIVE_PRESENTATION_SCORE_SNAPSHOT_CONTRACT_INVALID/);
    await assert.rejects(runBatch(db, payloads, null), /TL_QA_BATCH_ALREADY_APPLIED_RECONCILE/, "a replay is blocked before any payload runs");
    assert.equal((await db.query("select count(*)::int as count from supabase_migrations.schema_migrations")).rows[0].count, 11);
  } finally {
    await db.close();
  }
});
