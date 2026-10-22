import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { createLocalRehearsalRuntime } from "./helpers/local-rehearsal-runtime.ts";

import {
  TOUCHLINE_QA_20261011_PREIMAGE_DRAFT,
  buildTouchlineQaBatchAtomicRehearsal,
  buildTouchlineQaBatchPostCommitReadOnlyCheck,
  prepareTouchlineQaBatchPreimageDraft,
} from "../scripts/qa/build-touchline-qa-20261011-atomic-rehearsal.mjs";
import { TOUCHLINE_QA_MIGRATION_BATCH_20261011 } from "../scripts/qa/verify-touchline-qa-migration-batch-20261011.mjs";

type Row = Record<string, unknown>;
type Db = { exec(sql: string): Promise<unknown>; query<T extends Row = Row>(sql: string, args?: unknown[]): Promise<{ rows: T[] }>; close(): Promise<void> };
async function createRehearsalDb(): Promise<Db> {
  return createLocalRehearsalRuntime(process.env.TOUCHLINE_QA_NATIVE_REHEARSAL_URL, () => new PGlite());
}
const migration = (name: string) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

// These are the externally callable service-role writers relevant to the
// 05000–15000 batch. `reconcile_gameweek` is the real historical function
// already installed by the V1 chain in this baseline, but this test does not
// invoke it: it proves only top-level EXECUTE containment and restoration.
// It deliberately does not model SECURITY DEFINER calls, pg_cron, or in-flight
// workers, which require a native PostgreSQL operational rehearsal.
const containmentProcedures = [
  "public.touchline_arena_quick_substitution_start(uuid,uuid,text,uuid[],uuid[])",
  "public.touchline_arena_quick_substitution_apply(uuid,uuid,uuid,bigint,text,text,text,uuid,uuid)",
  "public.touchline_live_presentation_publish_current()",
  "public.touchline_fantasy_sync_gameweeks()",
  "public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)",
  "public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)",
  "public.touchline_fantasy_lock_gameweek(uuid)",
  "public.touchline_fantasy_reconcile_gameweek(uuid)",
  "public.touchline_fantasy_reconcile_lineup_alerts(uuid)",
  "public.touchline_fantasy_apply_test_subscription_event(text,timestamptz,text,boolean,uuid,text,text,text,timestamptz,timestamptz)",
  "public.touchline_fantasy_grant_vip_access(uuid,text,text,text,uuid)",
  "public.touchline_fantasy_enroll_beta(uuid,text)",
] as const;

const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
const containmentValues = containmentProcedures
  .map((procedure) => `(${sqlLiteral(procedure)})`)
  .join(",\n      ");
const containmentRevokeSql = containmentProcedures
  .map((procedure) => `revoke execute on function ${procedure} from service_role;`)
  .join("\n");
const containmentRestoreSql = containmentProcedures
  .map((procedure) => `grant execute on function ${procedure} to service_role;`)
  .join("\n");

function actualTable(source: string, name: string) {
  const start = source.indexOf(`create table if not exists public.${name} (`);
  const end = source.indexOf("\n);", start);
  assert.ok(start >= 0 && end > start, `missing real ${name} table`);
  return source.slice(start, end + 3);
}

function actualFunction(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start, `missing real ${name} function`);
  return source.slice(start, end + 4);
}

// All batch-patched functions are installed through the actual historical
// chain. The only synthetic objects are external football/auth leaf tables
// needed to run that chain in memory.
async function makeQaPreimageBaseline(): Promise<Db> {
  const db: Db = await createRehearsalDb();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
      create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb,updated_at timestamptz default now());
      create table public.users(id uuid primary key,full_name text not null default '');
      create table public.football_competitions(id uuid primary key,provider text,provider_competition_id text);
      create table public.football_seasons(id uuid primary key);
      create table public.football_clubs(id uuid primary key,provider text,provider_team_id text);
      create table public.football_players(id uuid primary key,provider text,provider_player_id text,current_club_id uuid,position text,detailed_position text);
      create table public.football_rounds(id uuid primary key,competition_id uuid,season_id uuid,name text);
      create table public.football_fixtures(id uuid primary key,round_id uuid,competition_id uuid,season_id uuid,provider text,provider_fixture_id text,starts_at timestamptz,status text,home_club_id uuid,away_club_id uuid,finalized_at timestamptz,provider_updated_at timestamptz,source_updated_at timestamptz,updated_at timestamptz default now());
      create table public.football_squad_members(id uuid primary key,provider text,club_id uuid,player_id uuid,position text,detailed_position text,status text);
      create table public.football_player_market_values(id uuid primary key,player_id uuid,market_value_eur bigint,status text,confidence text);
      create table public.touchline_card_publications(id uuid primary key,player_id uuid,current_membership_id uuid,market_value_id uuid,publication_status text,published_at timestamptz);
      create table public.touchline_formation_geometry_versions(formation_code text,geometry_version integer,status text,geometry jsonb,primary key(formation_code,geometry_version));
      create table public.touchline_card_inventory(id uuid primary key,player_id uuid);
      create table public.touchline_card_contracts(user_id uuid not null references public.users(id),card_id uuid not null references public.touchline_card_inventory(id),status text not null);
      create table public.touchline_user_arena_state(user_id uuid primary key references public.users(id),lineup jsonb not null default '[]'::jsonb);
      create table public.football_live_snapshots(snapshot_key text primary key,payload jsonb not null,fetched_at timestamptz);
      create table public.touchline_card_ranking_active_snapshots(league_key text primary key,snapshot_id text);
      create table public.touchline_card_ranking_snapshots(snapshot_id text,league_key text,source text,status text,scoring_version text,coverage_status text,expected_player_count integer,actual_player_count integer,fixture_ids jsonb,expected_fixture_ids jsonb);
      create table public.touchline_coach_ranking_active_snapshots(league_key text primary key,snapshot_id text);
      create table public.touchline_coach_ranking_snapshots(snapshot_id text,league_key text,scoring_version text,fixture_ids jsonb);
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,name text not null,statements text[] not null);
    `);
    await db.exec(await readFile(new URL("../supabase/qa/001_touchline_qa_fixture_tracking.sql", import.meta.url), "utf8"));
    const base = await migration("20260825165821_touchline_fantasy_gameweek_v1");
    const tableStart = base.indexOf("create table if not exists public.touchline_fantasy_configs");
    const tableEnd = base.indexOf("create or replace function public.touchline_fantasy_position_bucket");
    assert.ok(tableStart >= 0 && tableEnd > tableStart);
    await db.exec(base.slice(tableStart, tableEnd));
    await db.exec(base.split("\n").filter((line) => /^(?:alter table public\.touchline_fantasy_\w+ enable row level security;|revoke all on table public\.touchline_fantasy_|grant .* on table public\.touchline_fantasy_)/.test(line)).join("\n"));
    for (const name of ["position_bucket", "fixture_is_final", "fixture_is_live", "entitlement_is_active", "sync_gameweeks", "reconcile_gameweek"]) await db.exec(actualFunction(base, `touchline_fantasy_${name}`));
    await db.exec(actualTable(await migration("048_touchline_player_season_statistics_read_model"), "football_player_fixture_statistics"));
    await db.exec(actualTable(await migration("015_sportmonks_fantasy_data_foundation"), "football_fantasy_fixture_feeds"));
    await db.exec(await migration("20260825202938_touchline_fantasy_markt_gameweek_xi"));
    const permissions = base.split("\n").filter((line) => /^(?:revoke all|grant execute) on function public\.touchline_fantasy_(?:lock_gameweek|reconcile_gameweek|prepare_user_gameweek)\(/.test(line));
    assert.equal(permissions.length, 6);
    await db.exec(permissions.join("\n"));
    await db.exec(await migration("20260825213744_touchline_fantasy_wall_clock_deadline"));
    const finality = await migration("20260826173229_touchline_fantasy_inter_round_market_window");
    await db.exec(finality.slice(0, finality.indexOf("create or replace function public.touchline_fantasy_sync_gameweeks")));
    await db.exec(await migration("20260919151427_touchline_fantasy_kickoff_final_whistle_market_window"));
    await db.exec(await migration("20260920153000_touchline_fantasy_safe_rollover_settlement"));
    await db.exec(await migration("20260825182600_touchline_fantasy_subscription_event_ordering"));
    // Captured read-only from QA, preserving the original oracle hashes.
    // These historical definitions exist only in this in-memory baseline.
    await db.exec(await readFile(new URL("fixtures/qa-fantasy-functions-preimage-20261011.sql", import.meta.url), "utf8"));
    await db.exec(await migration("20261011002000_touchline_arena_quick_substitution_persistence"));
    await db.exec(await migration("20261011003000_touchline_live_presentation_immutable_publication"));
    await db.exec(await migration("20261011004000_touchline_live_presentation_freshness_guard"));
    await db.exec(await readFile(new URL("fixtures/qa-live-publisher-preimage-20261011.sql", import.meta.url), "utf8"));
    assert.equal((await db.query("select md5(pg_get_functiondef('public.touchline_live_presentation_publish_current()'::regprocedure)) as hash")).rows[0].hash, "59f4ceafc650015edcce8d6e333f0e19");
    await db.exec(actualTable(await migration("027_touchline_tc_wallet_integrity"), "touchline_platform_owner_accounts"));
    // Real baseline data lets 060 capture counts while retaining its required
    // empty Quick Sub state. It is not a substitute for the QA oracle hashes.
    await db.exec(`
      insert into auth.users(id,email,email_confirmed_at) values ('${id(1)}','member@example.com',clock_timestamp());
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
        values ('${id(7)}','admin@example.com',clock_timestamp(),'{"touchline_arena_access_v1":true}'::jsonb);
      insert into public.users(id) values ('${id(1)}');
      insert into public.football_competitions(id,provider,provider_competition_id) values ('${id(2)}','sportmonks','8');
      insert into public.football_seasons(id) values ('${id(3)}');
      insert into public.football_rounds(id,competition_id,season_id,name) values ('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into public.touchline_fantasy_gameweeks(id,competition_id,season_id,round_id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at)
        values ('${id(5)}','${id(2)}','${id(3)}','${id(4)}',1,'LOCKED',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '30 minutes',clock_timestamp()+interval '3 hours');
      insert into public.touchline_fantasy_entitlements(user_id,status,source) values ('${id(1)}','active','qa_grant');
      insert into public.touchline_fantasy_user_gameweeks(id,user_id,gameweek_id,formation_code,state,budget_eur_snapshot,max_players_per_club_snapshot,total_market_value_eur)
        values ('${id(6)}','${id(1)}','${id(5)}','4-3-3','DRAFT',500000000,3,0);
    `);
    return db;
  } catch (error) { await db.close(); throw error; }
}

async function builderInput() {
  const preimageSource = await readFile(new URL("../supabase/qa/060_touchline_qa_20261011_batch_preimage_DRAFT.sql", import.meta.url));
  const batchSources = new Map(await Promise.all(TOUCHLINE_QA_MIGRATION_BATCH_20261011.map(async (entry) => [entry.file, await readFile(new URL(`../${entry.file}`, import.meta.url))] as const)));
  return { preimageSource, batchSources };
}

async function rollback(db: Db) { await db.exec("rollback;"); }

async function preimageFingerprint(db: Db) {
  return (await db.query<{ value: unknown }>(`
    select jsonb_build_object(
      'receipt_relation',to_regclass('public.touchline_qa_20261011_batch_preimage_receipts'),
      'history',(select coalesce(jsonb_agg(to_jsonb(row) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations row),
      'functions',jsonb_build_object(
        'quick_start',md5(pg_get_functiondef('public.touchline_arena_quick_substitution_start(uuid,uuid,text,uuid[],uuid[])'::regprocedure)),
        'quick_apply',md5(pg_get_functiondef('public.touchline_arena_quick_substitution_apply(uuid,uuid,uuid,bigint,uuid,uuid)'::regprocedure)),
        'live',md5(pg_get_functiondef('public.touchline_live_presentation_publish_current()'::regprocedure)),
        'prepare',md5(pg_get_functiondef('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)),
        'save',md5(pg_get_functiondef('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure)),
        'lock',md5(pg_get_functiondef('public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure))
      ),
      'data',jsonb_build_object(
        'confirmed',(select count(*) from public.touchline_fantasy_user_gameweeks where state='CONFIRMED'),
        'quick_sessions',(select count(*) from public.touchline_arena_quick_substitution_sessions),
        'quick_events',(select count(*) from public.touchline_arena_quick_substitution_events)
      )
    ) value
  `)).rows[0].value;
}

async function containmentAclSnapshot(db: Db) {
  return (await db.query<{
    procedure: string;
    acl: string | null;
    service_role_execute: boolean;
    anon_execute: boolean;
    authenticated_execute: boolean;
  }>(`
    select expected.procedure,
      procedure_row.proacl::text as acl,
      has_function_privilege('service_role', procedure_row.oid, 'EXECUTE') as service_role_execute,
      has_function_privilege('anon', procedure_row.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE') as authenticated_execute
    from (values
      ${containmentValues}
    ) expected(procedure)
    left join pg_proc procedure_row on procedure_row.oid = expected.procedure::regprocedure
    order by expected.procedure
  `)).rows;
}

async function postCommitContainmentFingerprint(db: Db) {
  return (await db.query<{ value: unknown }>(`
    with function_definitions as (
      select expected.procedure,
        md5(pg_get_functiondef(procedure_row.oid)) as definition_md5
      from (values
        ${containmentValues}
      ) expected(procedure)
      join pg_proc procedure_row on procedure_row.oid = expected.procedure::regprocedure
    )
    select jsonb_build_object(
      'history',(
        select coalesce(jsonb_agg(to_jsonb(history) order by history.version),'[]'::jsonb)
        from supabase_migrations.schema_migrations history
      ),
      'functions',(
        select jsonb_object_agg(procedure,definition_md5 order by procedure)
        from function_definitions
      ),
      'data',jsonb_build_object(
        'receipt',(select coalesce(jsonb_agg(to_jsonb(receipt) order by receipt.receipt_key),'[]'::jsonb)
          from public.touchline_qa_20261011_batch_preimage_receipts receipt),
        'entitlements',(select coalesce(jsonb_agg(to_jsonb(entitlement) order by to_jsonb(entitlement)::text),'[]'::jsonb)
          from public.touchline_fantasy_entitlements entitlement),
        'user_gameweeks',(select coalesce(jsonb_agg(to_jsonb(gameweek) order by to_jsonb(gameweek)::text),'[]'::jsonb)
          from public.touchline_fantasy_user_gameweeks gameweek),
        'locked_selections',(select coalesce(jsonb_agg(to_jsonb(selection) order by to_jsonb(selection)::text),'[]'::jsonb)
          from public.touchline_fantasy_locked_selections selection),
        'audit_events',(select coalesce(jsonb_agg(to_jsonb(audit) order by to_jsonb(audit)::text),'[]'::jsonb)
          from public.touchline_fantasy_audit_events audit),
        'quick_sessions',(select coalesce(jsonb_agg(to_jsonb(session) order by to_jsonb(session)::text),'[]'::jsonb)
          from public.touchline_arena_quick_substitution_sessions session),
        'quick_events',(select coalesce(jsonb_agg(to_jsonb(event) order by to_jsonb(event)::text),'[]'::jsonb)
          from public.touchline_arena_quick_substitution_events event),
        'vip_grants',(select coalesce(jsonb_agg(to_jsonb(grant_row) order by to_jsonb(grant_row)::text),'[]'::jsonb)
          from public.touchline_fantasy_vip_grants grant_row),
        'beta_enrollments',(select coalesce(jsonb_agg(to_jsonb(enrollment) order by to_jsonb(enrollment)::text),'[]'::jsonb)
          from public.touchline_fantasy_beta_enrollments enrollment)
      )
    ) value
  `)).rows[0].value;
}

test("060 DRAFT remains guarded; its exact payload and 11 exact migrations rehearse as one rollback-safe local transaction", async () => {
  const inputs = await builderInput();
  const prepared = prepareTouchlineQaBatchPreimageDraft(inputs.preimageSource);
  assert.deepEqual(prepared.metadata.removedLines, [4, 5, 201]);
  assert.equal(prepared.metadata.sourceSha256, TOUCHLINE_QA_20261011_PREIMAGE_DRAFT.sourceSha256);
  assert.throws(() => buildTouchlineQaBatchAtomicRehearsal({ releaseSha: "invalid", manifestSha256: "b".repeat(64), ...inputs }), /TL_QA_BATCH_RELEASE_SHA_INVALID/);
  assert.throws(() => buildTouchlineQaBatchAtomicRehearsal({ releaseSha: "a".repeat(40), manifestSha256: "invalid", ...inputs }), /TL_QA_BATCH_MANIFEST_SHA_INVALID/);
  const rehearsal = buildTouchlineQaBatchAtomicRehearsal({ releaseSha: "a".repeat(40), manifestSha256: "b".repeat(64), ...inputs });
  assert.match(rehearsal.sql, /NOT_FOR_REMOTE_EXECUTION/);
  assert.doesNotMatch(rehearsal.sql, /TL_QA_PREIMAGE_DRAFT_NOT_APPROVED/);
  const db = await makeQaPreimageBaseline();
  try {
    const hashes = (await db.query<{ entitlement_md5: string; app_metadata_md5: string }>(`
      select (select md5(to_jsonb(e)::text) from public.touchline_fantasy_entitlements e where user_id='${id(1)}') as entitlement_md5,
        (select md5(coalesce(raw_app_meta_data,'{}'::jsonb)::text) from auth.users where id='${id(1)}') as app_metadata_md5
    `)).rows[0];
    const vipGrant = { actorId: id(7), actorEmail: "admin@example.com", targetId: id(1),
      targetEmail: "member@example.com", reason: "QA transition rehearsal", commandId: id(8),
      expectedEntitlementMd5: hashes.entitlement_md5, expectedAppMetadataMd5: hashes.app_metadata_md5 };
  assert.throws(() => buildTouchlineQaBatchAtomicRehearsal({ releaseSha: "a".repeat(40), manifestSha256: "b".repeat(64), ...inputs,
    vipGrant: { ...vipGrant, targetEmail: "WRONG@example.com" } }), /TL_QA_BATCH_VIP_TARGETEMAIL_INVALID/);
  const grantedRehearsal = buildTouchlineQaBatchAtomicRehearsal({ releaseSha: "a".repeat(40), manifestSha256: "b".repeat(64), ...inputs, vipGrant });
  const grantedRehearsalSql = grantedRehearsal.sql;
  assert.equal(grantedRehearsal.metadata.vipCutover, "local-rehearsal-only");
  assert.match(grantedRehearsalSql, /TL_QA_BATCH_VIP_TARGET_PREIMAGE_MISMATCH/);
    const before = await preimageFingerprint(db);
    await assert.rejects(db.exec(inputs.preimageSource.toString("utf8")), /TL_QA_PREIMAGE_DRAFT_NOT_APPROVED/);
    await rollback(db);
    assert.deepEqual(await preimageFingerprint(db), before, "the checked-in DRAFT itself remains inert");
    const wrongTarget = buildTouchlineQaBatchAtomicRehearsal({ releaseSha: "a".repeat(40), manifestSha256: "b".repeat(64),
      ...inputs, vipGrant: { ...vipGrant, targetId: id(9) } });
    await assert.rejects(db.exec(wrongTarget.sql), /TL_QA_BATCH_VIP_TARGET_PREIMAGE_MISMATCH/);
    await rollback(db);
    assert.deepEqual(await preimageFingerprint(db), before, "wrong VIP target aborts the entire batch");
    const wrongEntitlement = buildTouchlineQaBatchAtomicRehearsal({ releaseSha: "a".repeat(40), manifestSha256: "b".repeat(64),
      ...inputs, vipGrant: { ...vipGrant, expectedEntitlementMd5: "0".repeat(32) } });
    await assert.rejects(db.exec(wrongEntitlement.sql), /TL_QA_BATCH_VIP_ENTITLEMENT_PREIMAGE_MISMATCH/);
    await rollback(db);
    assert.deepEqual(await preimageFingerprint(db), before, "changed entitlement preimage aborts the entire batch");
    const markers = [
      "-- TL_QA_BATCH_AFTER_PREIMAGE_RECEIPT",
      ...TOUCHLINE_QA_MIGRATION_BATCH_20261011.map((entry) => `-- TL_QA_BATCH_AFTER_HISTORY:${entry.version}`),
      "-- TL_QA_BATCH_BEFORE_POSTIMAGE",
      "-- TL_QA_BATCH_BEFORE_COMMIT",
    ];
    for (const marker of markers) {
      assert.equal(grantedRehearsalSql.includes(marker), true, `missing failure marker ${marker}`);
      const injected = grantedRehearsalSql.replace(marker, () => `do $$ begin raise exception 'TL_QA_ATOMIC_INJECTED_FAILURE'; end $$; -- ${marker}`);
      await assert.rejects(db.exec(injected), /TL_QA_ATOMIC_INJECTED_FAILURE/);
      await rollback(db);
      assert.deepEqual(await preimageFingerprint(db), before, `failure at ${marker} rolls back receipt, history, DDL, and preserved data`);
    }
    const postimageTamperCases = [
      {
        mutation: "revoke execute on function public.touchline_fantasy_enroll_beta(uuid,text) from service_role;",
        expected: /TL_QA_BATCH_POSTIMAGE_FUNCTION_ACL_MISMATCH/,
        label: "service RPC privilege",
      },
      {
        mutation: "alter table public.touchline_fantasy_beta_enrollments disable row level security;",
        expected: /TL_QA_BATCH_POSTIMAGE_RECEIPT_TABLE_SECURITY_MISMATCH/,
        label: "Beta receipt RLS",
      },
      {
        mutation: "grant truncate on table public.touchline_fantasy_vip_grants to authenticated;",
        expected: /TL_QA_BATCH_POSTIMAGE_RECEIPT_TABLE_SECURITY_MISMATCH/,
        label: "VIP receipt truncate privilege",
      },
      {
        mutation: "grant update (receipt) on table public.touchline_fantasy_beta_enrollments to authenticated;",
        expected: /TL_QA_BATCH_POSTIMAGE_RECEIPT_TABLE_SECURITY_MISMATCH/,
        label: "Beta receipt column privilege",
      },
      {
        mutation: "alter table public.touchline_arena_quick_substitution_events alter column command_hash drop not null;",
        expected: /TL_QA_BATCH_POSTIMAGE_COLUMN_CONTRACT_MISMATCH/,
        label: "Quick Sub audit column",
      },
      {
        mutation: `
          alter table public.touchline_fantasy_entitlements
            drop constraint touchline_fantasy_entitlements_plan_key_check;
          alter table public.touchline_fantasy_entitlements
            add constraint touchline_fantasy_entitlements_plan_key_check
              check (plan_key is null or plan_key in ('beta','standard','pro','master','vip','VIP'));
        `,
        expected: /TL_QA_BATCH_POSTIMAGE_CONSTRAINT_CONTRACT_MISMATCH/,
        label: "server-owned plan uppercase value",
      },
      {
        mutation: `
          alter table public.touchline_fantasy_audit_events
            drop constraint touchline_fantasy_audit_events_event_type_check;
          alter table public.touchline_fantasy_audit_events
            add constraint touchline_fantasy_audit_events_event_type_check
              check (event_type in ('draft_saved','xi_confirmed','xi_locked','xi_rejected','score_reconciled','entitlement_changed'));
        `,
        expected: /TL_QA_BATCH_POSTIMAGE_CONSTRAINT_CONTRACT_MISMATCH/,
        label: "Fantasy audit lowercase event values",
      },
      {
        mutation: `
          alter table public.touchline_arena_quick_substitution_events
            drop constraint touchline_arena_quick_substitution_events_command_hash_check;
          alter table public.touchline_arena_quick_substitution_events
            add constraint touchline_arena_quick_substitution_events_command_hash_check
              check (command_hash ~ '[0-9a-f]{64}');
        `,
        expected: /TL_QA_BATCH_POSTIMAGE_CONSTRAINT_CONTRACT_MISMATCH/,
        label: "Quick Sub command hash loose regex",
      },
      {
        mutation: `
          drop index public.touchline_arena_quick_substitution_events_command_hash_idx;
          create unique index touchline_arena_quick_substitution_events_command_hash_idx
            on public.touchline_arena_quick_substitution_events (session_id, command_hash)
            where false;
        `,
        expected: /TL_QA_BATCH_POSTIMAGE_COMMAND_DEDUPLICATION_INDEX_MISMATCH/,
        label: "Quick Sub command deduplication partial index",
      },
    ] as const;
    for (const tamper of postimageTamperCases) {
      const injected = grantedRehearsalSql.replace(
        "-- TL_QA_BATCH_BEFORE_POSTIMAGE",
        () => `${tamper.mutation}\n-- TL_QA_BATCH_BEFORE_POSTIMAGE`,
      );
      assert.notEqual(injected, grantedRehearsalSql, `missing postimage tamper point for ${tamper.label}`);
      await assert.rejects(db.exec(injected), tamper.expected);
      await rollback(db);
      assert.deepEqual(await preimageFingerprint(db), before, `${tamper.label} tamper aborts the whole atomic rehearsal`);
    }
    await assert.rejects(db.exec(rehearsal.sql), /TL_QA_BATCH_POSTIMAGE_UNCLASSIFIED_ACTIVE_ENTITLEMENT/,
      "schema-only commit must fail while the existing QA-like active account has no plan");
    await rollback(db);
    assert.deepEqual(await preimageFingerprint(db), before, "unclassified account aborts the entire batch");
    await db.exec(grantedRehearsalSql);
    assert.equal((await db.query("select count(*)::int as count from public.touchline_qa_20261011_batch_preimage_receipts")).rows[0].count, 1);
    assert.deepEqual((await db.query("select source,plan_key,status,current_period_end from public.touchline_fantasy_entitlements where user_id=$1", [id(1)])).rows[0],
      { source: "owner_vip_grant", plan_key: "vip", status: "active", current_period_end: null });
    assert.equal((await db.query("select count(*)::int as count from public.touchline_fantasy_vip_grants where target_user_id=$1", [id(1)])).rows[0].count, 1);
    const postCommitCheck = buildTouchlineQaBatchPostCommitReadOnlyCheck({ releaseSha: "a".repeat(40),
      manifestSha256: "b".repeat(64), batchSources: inputs.batchSources, vipGrant });
    assert.equal(postCommitCheck.metadata.remoteMutation, "forbidden");
    await assert.rejects(db.exec(buildTouchlineQaBatchPostCommitReadOnlyCheck({ releaseSha: "c".repeat(40),
      manifestSha256: "b".repeat(64), batchSources: inputs.batchSources, vipGrant }).sql),
    /TL_QA_BATCH_POSTIMAGE_PREIMAGE_RECEIPT_MISMATCH/);
    await rollback(db);
    await assert.rejects(db.exec(buildTouchlineQaBatchPostCommitReadOnlyCheck({ releaseSha: "a".repeat(40),
      manifestSha256: "b".repeat(64), batchSources: inputs.batchSources,
      vipGrant: { ...vipGrant, commandId: id(9) } }).sql), /TL_QA_BATCH_POSTCOMMIT_VIP_MISMATCH/);
    await rollback(db);
    const writeAttempt = postCommitCheck.sql.replace("select 'TL_QA_BATCH_POSTCOMMIT_READ_ONLY_PASS' as result;",
      "update public.touchline_fantasy_entitlements set plan_key='beta' where user_id='" + id(1) + "';");
    await assert.rejects(db.exec(writeAttempt), /read.only transaction/i);
    await rollback(db);
    await db.exec(postCommitCheck.sql);
    assert.equal((await db.query("select count(*)::int as count from supabase_migrations.schema_migrations")).rows[0].count, 11);
    assert.equal((await db.query("select snapshot->>'release_sha' as release_sha,snapshot->>'manifest_sha256' as manifest_sha256 from public.touchline_qa_20261011_batch_preimage_receipts")).rows[0].release_sha, "a".repeat(40));
    assert.equal((await db.query("select snapshot->>'release_sha' as release_sha,snapshot->>'manifest_sha256' as manifest_sha256 from public.touchline_qa_20261011_batch_preimage_receipts")).rows[0].manifest_sha256, "b".repeat(64));

    // The currently hosted QA application still invokes this two-argument
    // prepare RPC. A rollback to that app must not break JL's existing draft.
    await db.exec("begin;");
    await db.query(`insert into public.touchline_fantasy_configs
      (competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values ('england',$1,$2,2990,'GBP',500000000,3)`, [id(2), id(3)]);
    assert.equal((await db.query<{ prepared: string }>(
      "select public.touchline_fantasy_prepare_user_gameweek($1,$2) as prepared", [id(1), id(5)]
    )).rows[0].prepared, id(6), "hosted two-argument prepare call retains JL's existing draft after VIP cutover");
    await db.query(`insert into public.football_fixtures
      (id,round_id,competition_id,season_id,starts_at,status)
      values ($1,$2,$3,$4,clock_timestamp()+interval '4 hours','NS')`,
    [id(9), id(4), id(2), id(3)]);
    await db.exec(`insert into public.touchline_formation_geometry_versions
      (formation_code,geometry_version,status,geometry)
      values ('4-3-3',1,'published','{"slots":[]}'::jsonb)`);
    const hostedSave = (await db.query<{ result: Row }>(
      "select public.touchline_fantasy_save_lineup($1,$2,$3,$4,$5::jsonb,$6,$7) as result",
      [id(1), id(5), "307", "4-3-3", "[]", "draft", "qa-rollback-compatibility-1"]
    )).rows[0].result;
    assert.equal(hostedSave.ok, true, "hosted seven-argument save call accepts a VIP draft after the schema cutover");
    await db.exec("rollback;");

    const containmentAclBefore = await containmentAclSnapshot(db);
    assert.equal(containmentAclBefore.length, containmentProcedures.length, "every containment RPC resolves after commit");
    assert.equal(containmentAclBefore.every((row) => row.acl !== null && row.service_role_execute && !row.anon_execute && !row.authenticated_execute), true,
      "the committed batch exposes each containment RPC only to service_role");
    const containmentDataBefore = await postCommitContainmentFingerprint(db);

    await db.exec("begin;");
    await db.exec(containmentRevokeSql);
    const containmentAclRevoked = await containmentAclSnapshot(db);
    assert.equal(containmentAclRevoked.every((row) => !row.service_role_execute && !row.anon_execute && !row.authenticated_execute), true,
      "emergency REVOKE removes only the tested service-role ingress privileges");
    assert.deepEqual(await postCommitContainmentFingerprint(db), containmentDataBefore,
      "containment REVOKE preserves batch history, data, and function definitions");
    await db.exec("commit;");

    await db.exec("begin;");
    // The captured ACL contract above proves that service_role was the sole
    // non-owner callable grant in this local baseline, so this restores no
    // privilege that was not present before containment.
    await db.exec(containmentRestoreSql);
    assert.deepEqual(await containmentAclSnapshot(db), containmentAclBefore,
      "the recovery transaction restores the exact pre-containment function ACLs");
    assert.deepEqual(await postCommitContainmentFingerprint(db), containmentDataBefore,
      "ACL recovery preserves batch history, data, and function definitions");
    await db.exec("commit;");

    await assert.rejects(db.exec(rehearsal.sql), /TL_QA_BATCH_PREIMAGE_RECEIPT_EXISTS_RECONCILE/);
    await rollback(db);
    assert.equal((await db.query("select count(*)::int as count from supabase_migrations.schema_migrations")).rows[0].count, 11, "replay stays fail-closed");
  } finally { await db.close(); }
});
