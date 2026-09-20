import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const legacySyncUrl = new URL("../supabase/migrations/20260826182434_touchline_fantasy_future_gameweeks_fail_closed.sql", import.meta.url);
const forwardUrl = new URL("../supabase/migrations/20260919151427_touchline_fantasy_kickoff_final_whistle_market_window.sql", import.meta.url);
const preimageUrl = new URL("../supabase/qa/055_touchline_qa_fantasy_kickoff_final_whistle_recovery_preimage.sql", import.meta.url);
const postflightUrl = new URL("../supabase/qa/055_touchline_qa_fantasy_kickoff_final_whistle_recovery_postflight.sql", import.meta.url);
const recoveryUrl = new URL("../supabase/qa/055_touchline_qa_fantasy_kickoff_final_whistle_recovery.sql", import.meta.url);

type Database = {
  exec(sql: string): Promise<unknown>;
  query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>;
  close(): Promise<void>;
};

async function makeDatabase(): Promise<Database> {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite() as Database;
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.football_rounds (id text primary key, competition_id text not null, season_id text not null, name text not null);
    create table public.football_fixtures (id text primary key, round_id text not null, starts_at timestamptz, status text, finalized_at timestamptz);
    create table public.touchline_fantasy_configs (competition_id text not null, season_id text not null, status text not null, lock_offset_minutes integer not null);
    create table public.touchline_fantasy_gameweeks (
      id uuid primary key default gen_random_uuid(), competition_id text not null, season_id text not null,
      round_id text not null unique, gameweek_number integer not null, state text not null,
      market_opens_at timestamptz not null, locks_at timestamptz not null,
      first_fixture_at timestamptz not null, last_fixture_at timestamptz not null,
      constraint touchline_fantasy_gameweeks_check check (market_opens_at < locks_at and locks_at < first_fixture_at and first_fixture_at <= last_fixture_at)
    );
    create table public.touchline_fantasy_user_gameweeks (id uuid primary key default gen_random_uuid(), user_id uuid not null, gameweek_id uuid not null, state text not null default 'DRAFT');
    create table public.touchline_fantasy_user_gameweek_selections (user_gameweek_id uuid not null, slot_id text not null, player_id uuid not null, primary key (user_gameweek_id, slot_id));
    create table public.touchline_fantasy_locked_selections (user_gameweek_id uuid not null, slot_id text not null, player_id uuid not null, primary key (user_gameweek_id, slot_id));
    create or replace function public.touchline_assert_qa_fixture_target(p_ref text) returns void language plpgsql set search_path = '' as $$ begin if p_ref <> 'xgxbwqxjssxxuihuwmgy' then raise exception 'wrong QA'; end if; end; $$;
    create or replace function public.touchline_fantasy_fixture_is_final(p_status text) returns boolean language sql immutable set search_path = '' as $$ select lower(btrim(coalesce(p_status, ''))) = 'ft' $$;
    create or replace function public.touchline_fantasy_fixture_is_live(p_status text) returns boolean language sql immutable set search_path = '' as $$ select lower(btrim(coalesce(p_status, ''))) = 'live' $$;
    create or replace function public.touchline_fantasy_save_lineup(p_user_id uuid, p_gameweek_id uuid, p_selected_coach_id text, p_formation_code text, p_selections jsonb, p_action text, p_idempotency_key text)
    returns jsonb language plpgsql security definer set search_path = '' as $$ begin
      perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_gameweek_id::text, 0));
      return '{}'::jsonb;
    end; $$;
    create or replace function public.touchline_fantasy_prepare_user_gameweek(p_user_id uuid, p_gameweek_id uuid)
    returns uuid language plpgsql security definer set search_path = '' as $$ declare v_gameweek public.touchline_fantasy_gameweeks%rowtype; v_existing uuid; begin
      select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id;
      select id into v_existing from public.touchline_fantasy_user_gameweeks where user_id=p_user_id and gameweek_id=p_gameweek_id;
      if v_existing is not null then return v_existing; end if;
      return gen_random_uuid();
    end; $$;
    revoke all on function public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text) from public, anon, authenticated;
    revoke all on function public.touchline_fantasy_prepare_user_gameweek(uuid,uuid) from public, anon, authenticated;
    grant execute on function public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text) to service_role;
    grant execute on function public.touchline_fantasy_prepare_user_gameweek(uuid,uuid) to service_role;
  `);
  // Use the actual +5-minute legacy synchronizer captured on QA. Only save and
  // prepare remain reduced fixtures; recovery restores but never invokes them.
  await db.exec(await readFile(legacySyncUrl, "utf8"));
  return db;
}

async function functionHashes(db: Database) {
  const result = await db.query(`
    select jsonb_object_agg(signature::text, md5(pg_get_functiondef(signature))) as value
    from (values
      ('public.touchline_fantasy_sync_gameweeks()'::regprocedure),
      ('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure),
      ('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)
    ) as targets(signature)
  `);
  return (result.rows[0]?.value ?? {}) as Record<string, string>;
}

async function localPreimageScript(db: Database) {
  const source = await readFile(preimageUrl, "utf8");
  const hashes = await functionHashes(db);
  return source
    .replace("bb212970a821da595632c4f9577f6bdb", hashes["touchline_fantasy_sync_gameweeks()"]!)
    .replace("7cbbcef208e07f829aa7beea00ff25cb", hashes["touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)"]!)
    .replace("328a56a158a4eb2fccba00c4e80d2849", hashes["touchline_fantasy_prepare_user_gameweek(uuid,uuid)"]!);
}

async function protectedEvidence(db: Database) {
  const result = await db.query(`
    select jsonb_build_object(
      'user_gameweeks', (select jsonb_build_object('count', count(*), 'md5', md5(coalesce(string_agg(md5(row_to_json(item)::text), '' order by item.id), ''))) from public.touchline_fantasy_user_gameweeks item),
      'selections', (select jsonb_build_object('count', count(*), 'md5', md5(coalesce(string_agg(md5(row_to_json(item)::text), '' order by item.user_gameweek_id, item.slot_id), ''))) from public.touchline_fantasy_user_gameweek_selections item),
      'locked', (select jsonb_build_object('count', count(*), 'md5', md5(coalesce(string_agg(md5(row_to_json(item)::text), '' order by item.user_gameweek_id, item.slot_id), ''))) from public.touchline_fantasy_locked_selections item),
      'fixtures', (select jsonb_build_object('count', count(*), 'md5', md5(coalesce(string_agg(md5(row_to_json(item)::text), '' order by item.id), ''))) from public.football_fixtures item),
      'configs', (select jsonb_build_object('count', count(*), 'md5', md5(coalesce(string_agg(md5(row_to_json(item)::text), '' order by item.competition_id, item.season_id), ''))) from public.touchline_fantasy_configs item)
    ) as value
  `);
  return result.rows[0]!.value;
}

async function seedExistingGameweeks(db: Database) {
  await db.exec(`
    insert into public.touchline_fantasy_configs values ('competition','season','active',5);
    insert into public.football_rounds values
      ('previous','competition','season','1'), ('next','competition','season','2');
    insert into public.football_fixtures values
      ('previous-final','previous',clock_timestamp()-interval '7 days','FT',clock_timestamp()-interval '10 minutes'),
      ('next-first','next',clock_timestamp()+interval '1 day','NS',null);
    select public.touchline_fantasy_sync_gameweeks();
    insert into public.touchline_fantasy_user_gameweeks (id,user_id,gameweek_id,state)
      select '00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102',id,'LOCKED'
      from public.touchline_fantasy_gameweeks where round_id='previous';
    insert into public.touchline_fantasy_user_gameweek_selections values
      ('00000000-0000-4000-8000-000000000101','gk','00000000-0000-4000-8000-000000000103');
    insert into public.touchline_fantasy_locked_selections values
      ('00000000-0000-4000-8000-000000000101','gk','00000000-0000-4000-8000-000000000103');
  `);
}

async function windows(db: Database) {
  return (await db.query(`select id,round_id,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at from public.touchline_fantasy_gameweeks order by round_id`)).rows;
}

test("forward migration and nonempty sync recover exact legacy timing without altering XI or fixture snapshots", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedExistingGameweeks(db);
    const baseline = await functionHashes(db);
    const originalWindows = await windows(db);
    const originalEvidence = await protectedEvidence(db);
    const preimage = await localPreimageScript(db);
    await db.exec(preimage);
    await db.exec(preimage);
    assert.equal((await db.query("select count(*) as count from public.touchline_qa_fantasy_market_window_20260919_recovery_receipts")).rows[0]!.count, 1, "preimage replay preserves one receipt");
    await db.exec(await readFile(forwardUrl, "utf8"));
    await db.exec(await readFile(postflightUrl, "utf8"));
    await db.exec("select public.touchline_fantasy_sync_gameweeks();");
    const forwardWindows = await windows(db);
    assert.equal(forwardWindows.length, 2);
    assert.equal((await db.query("select bool_and(locks_at = first_fixture_at) as equality from public.touchline_fantasy_gameweeks")).rows[0]!.equality, true, "the regression must exercise actual kickoff-equality rows");
    await db.exec("select public.touchline_fantasy_sync_gameweeks();");
    assert.deepEqual(await windows(db), forwardWindows, "sync replay preserves IDs, timing and states");
    assert.deepEqual(await protectedEvidence(db), originalEvidence);
    const recovery = await readFile(recoveryUrl, "utf8");
    await db.exec(recovery);
    assert.deepEqual(await functionHashes(db), baseline);
    assert.deepEqual(await windows(db), originalWindows, "the actual restored synchronizer restores the prior derived offset and opening");
    assert.deepEqual(await protectedEvidence(db), originalEvidence, "complete row hashes and counts preserve customer snapshots and provider data");
    const constraints = await db.query(`select conname from pg_constraint where conrelid='public.touchline_fantasy_gameweeks'::regclass and contype='c' order by conname`);
    assert.ok(constraints.rows.some((row) => row.conname === "touchline_fantasy_gameweeks_check"));
    assert.ok(!constraints.rows.some((row) => row.conname === "touchline_fantasy_gameweeks_market_interval_check"));
    assert.equal((await db.query("select state from public.touchline_qa_fantasy_market_window_20260919_recovery_receipts")).rows[0]!.state, "RECOVERED");
    await assert.rejects(() => db.exec(recovery), /TL_FANTASY_RECOVERY_POSTFLIGHT_RECEIPT_REQUIRED/);
    await db.exec("rollback;");
    assert.deepEqual(await windows(db), originalWindows, "rejected recovery replay leaves derived rows unchanged");
    assert.deepEqual(await protectedEvidence(db), originalEvidence);
  } finally {
    await db.close();
  }
});

test("recovery fails closed when postflight code drifts", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec(await localPreimageScript(db));
    await db.exec(await readFile(forwardUrl, "utf8"));
    await db.exec(await readFile(postflightUrl, "utf8"));
    await db.exec(`create or replace function public.touchline_fantasy_sync_gameweeks() returns integer language plpgsql security definer set search_path = '' as $$ begin return 999; end; $$;`);
    const recovery = await readFile(recoveryUrl, "utf8");
    const driftedHashes = await functionHashes(db);
    await assert.rejects(() => db.exec(recovery), /TL_FANTASY_RECOVERY_POSTFLIGHT_FINGERPRINT_MISMATCH/);
    await db.exec("rollback;");
    assert.deepEqual(await functionHashes(db), driftedHashes, "rejected recovery must not replace the unexpected function");
    assert.equal((await db.query("select state from public.touchline_qa_fantasy_market_window_20260919_recovery_receipts")).rows[0]!.state, "POSTFLIGHT_CAPTURED");
  } finally {
    await db.close();
  }
});

test("unreconcilable provider timing aborts recovery atomically after restoring functions", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedExistingGameweeks(db);
    await db.exec(await localPreimageScript(db));
    await db.exec(await readFile(forwardUrl, "utf8"));
    await db.exec(await readFile(postflightUrl, "utf8"));
    await db.exec("select public.touchline_fantasy_sync_gameweeks(); update public.football_fixtures set starts_at=null where round_id='next'; select public.touchline_fantasy_sync_gameweeks();");
    const forwardHashes = await functionHashes(db);
    const forwardWindows = await windows(db);
    const beforeEvidence = await protectedEvidence(db);
    const recovery = await readFile(recoveryUrl, "utf8");
    await assert.rejects(() => db.exec(recovery), /TL_FANTASY_RECOVERY_UNRECONCILED_GAMEWEEK_TIMING/);
    await db.exec("rollback;");
    assert.deepEqual(await functionHashes(db), forwardHashes, "failure rolls back the earlier function restoration");
    assert.deepEqual(await windows(db), forwardWindows, "failure rolls back any already-recalculated Gameweek");
    assert.deepEqual(await protectedEvidence(db), beforeEvidence);
    const constraint = await db.query("select conname from pg_constraint where conrelid='public.touchline_fantasy_gameweeks'::regclass and contype='c'");
    assert.deepEqual(constraint.rows, [{ conname: "touchline_fantasy_gameweeks_market_interval_check" }]);
    assert.equal((await db.query("select state from public.touchline_qa_fantasy_market_window_20260919_recovery_receipts")).rows[0]!.state, "POSTFLIGHT_CAPTURED");
  } finally {
    await db.close();
  }
});
