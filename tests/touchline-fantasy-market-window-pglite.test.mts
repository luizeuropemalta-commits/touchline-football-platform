import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Optional isolated PostgreSQL harness. It never connects to Supabase or uses
// application credentials. Set TOUCHLINE_FANTASY_PGLITE_MODULE to the local
// PGlite entry point when the database contract suite is available.
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const migrationUrl = new URL("../supabase/migrations/20260919151427_touchline_fantasy_kickoff_final_whistle_market_window.sql", import.meta.url);

async function makeDatabase() {
  const { PGlite } = await import(modulePath!);
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.football_rounds (
      id text primary key,
      competition_id text not null,
      season_id text not null,
      name text not null
    );
    create table public.football_fixtures (
      id text primary key,
      round_id text not null,
      starts_at timestamptz,
      status text,
      finalized_at timestamptz
    );
    create table public.touchline_fantasy_configs (
      competition_id text not null,
      season_id text not null,
      status text not null,
      lock_offset_minutes integer not null
    );
    create table public.touchline_fantasy_gameweeks (
      id uuid primary key default gen_random_uuid(),
      competition_id text not null,
      season_id text not null,
      round_id text not null unique,
      gameweek_number integer not null,
      state text not null,
      market_opens_at timestamptz not null,
      locks_at timestamptz not null,
      first_fixture_at timestamptz not null,
      last_fixture_at timestamptz not null,
      check (market_opens_at < locks_at and locks_at < first_fixture_at and first_fixture_at <= last_fixture_at)
    );
    create table public.touchline_fantasy_user_gameweeks (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      gameweek_id uuid not null
    );
    create or replace function public.touchline_fantasy_fixture_is_final(p_status text)
    returns boolean language sql immutable set search_path = '' as $$
      select lower(btrim(coalesce(p_status, ''))) in ('ft', 'full time', 'finished', 'after penalties', 'aet', 'awarded')
    $$;
    create or replace function public.touchline_fantasy_fixture_is_live(p_status text)
    returns boolean language sql immutable set search_path = '' as $$
      select lower(btrim(coalesce(p_status, ''))) in ('live', '1st half', '2nd half', 'half time', 'extra time', 'penalties')
    $$;
    create or replace function public.touchline_fantasy_save_lineup(
      p_user_id uuid,
      p_gameweek_id uuid,
      p_selected_coach_id text,
      p_formation_code text,
      p_selections jsonb,
      p_action text,
      p_idempotency_key text
    ) returns jsonb language plpgsql security definer set search_path = '' as $$
    declare v_gameweek public.touchline_fantasy_gameweeks%rowtype;
    begin
      perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_gameweek_id::text, 0));
      select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id for update;
      if v_gameweek.state <> 'MARKET_OPEN' or clock_timestamp() >= v_gameweek.locks_at then raise exception 'TL_FANTASY_GAMEWEEK_LOCKED'; end if;
      return '{}'::jsonb;
    end;
    $$;
    create or replace function public.touchline_fantasy_prepare_user_gameweek(
      p_user_id uuid,
      p_gameweek_id uuid
    ) returns uuid language plpgsql security definer set search_path = '' as $$
    declare
      v_gameweek public.touchline_fantasy_gameweeks%rowtype;
      v_existing uuid;
    begin
      select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id;
      if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;
      select id into v_existing from public.touchline_fantasy_user_gameweeks where user_id = p_user_id and gameweek_id = p_gameweek_id;
      if v_existing is not null then return v_existing; end if;
      return gen_random_uuid();
    end;
    $$;
  `);
  // Execute the complete migration, including its function ACLs. The minimal
  // test roles support permission tests, not a claim of Supabase RLS coverage:
  // tables and business-function bodies remain deliberately reduced fixtures.
  await db.exec(await readFile(migrationUrl, "utf8"));
  return db;
}

async function seedRounds(db: { exec(sql: string): Promise<unknown> }, prefix: string, previousStatus: string, finalizedOffset: string, nextStartOffset: string, extraPreviousStatus?: string) {
  await db.exec(`
    insert into public.touchline_fantasy_configs values ('competition-${prefix}', 'season-${prefix}', 'active', 5);
    insert into public.football_rounds values
      ('${prefix}-previous', 'competition-${prefix}', 'season-${prefix}', '1'),
      ('${prefix}-next', 'competition-${prefix}', 'season-${prefix}', '2');
    insert into public.football_fixtures values
      ('${prefix}-previous-final', '${prefix}-previous', clock_timestamp() - interval '7 days', '${previousStatus}', ${finalizedOffset});
    ${extraPreviousStatus ? `insert into public.football_fixtures values ('${prefix}-previous-extra', '${prefix}-previous', clock_timestamp() - interval '6 days 23 hours', '${extraPreviousStatus}', null);` : ""}
    insert into public.football_fixtures values
      ('${prefix}-next-first', '${prefix}-next', clock_timestamp() + interval '${nextStartOffset}', 'NS', null);
    select public.touchline_fantasy_sync_gameweeks();
  `);
}

test("Markt closes exactly at kickoff and opens the next Gameweek on the final persisted provider observation", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "kickoff", "FT", "clock_timestamp() - interval '1 second'", "1 day");
    const next = (await db.query("select state, extract(epoch from market_opens_at - (select max(finalized_at) from public.football_fixtures where round_id='kickoff-previous')) as opening_delay_seconds, extract(epoch from first_fixture_at-locks_at) as close_offset_seconds from public.touchline_fantasy_gameweeks where round_id='kickoff-next'" )).rows[0] as { state: string; opening_delay_seconds: number; close_offset_seconds: number };
    assert.equal(next.state, "MARKET_OPEN");
    assert.equal(Number(next.opening_delay_seconds), 0);
    assert.equal(Number(next.close_offset_seconds), 0);

    const first = (await db.query("select id, first_fixture_at, locks_at from public.touchline_fantasy_gameweeks where round_id='kickoff-next'" )).rows[0] as { id: string; first_fixture_at: string; locks_at: string };
    const userId = "00000000-0000-4000-8000-000000000001";
    const beforeKickoff = await db.query(`select public.touchline_fantasy_save_lineup('${userId}', '${first.id}', '307', '4-3-3', '[]'::jsonb, 'draft', 'market-window-before-kickoff') as result`);
    assert.deepEqual((beforeKickoff.rows[0] as { result: unknown }).result, {});

    await db.exec("update public.football_fixtures set starts_at = clock_timestamp() - interval '1 microsecond' where id='kickoff-next-first';");
    await assert.rejects(
      () => db.query(`select public.touchline_fantasy_save_lineup('${userId}', '${first.id}', '307', '4-3-3', '[]'::jsonb, 'draft', 'market-window-at-kickoff')`),
      /TL_FANTASY_GAMEWEEK_LOCKED/,
      "a direct server RPC is blocked even when no client reloaded the market clock",
    );

    const existingId = "00000000-0000-4000-8000-000000000099";
    await db.exec(`insert into public.touchline_fantasy_user_gameweeks (id, user_id, gameweek_id) values ('${existingId}', '${userId}', '${first.id}');`);
    const existing = await db.query(`select public.touchline_fantasy_prepare_user_gameweek('${userId}', '${first.id}') as id`);
    assert.equal((existing.rows[0] as { id: string }).id, existingId, "an already-created closed XI record remains readable and is not mutated by the prepare guard");
  } finally {
    await db.close();
  }
});

test("final-whistle Markt migration fails closed for non-final, postponed/cancelled, unknown, stale-schedule LIVE and compressed rounds", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "not-final", "NS", "null", "1 day");
    await seedRounds(db, "cancelled", "FT", "clock_timestamp() - interval '1 second'", "1 day", "CANCELLED");
    await seedRounds(db, "postponed-null", "FT", "clock_timestamp() - interval '1 second'", "1 day");
    await seedRounds(db, "unknown", "FT", "clock_timestamp() - interval '1 second'", "1 day", "UNKNOWN_PROVIDER_STATUS");
    await db.exec("insert into public.football_fixtures values ('postponed-null-undated','postponed-null-previous',null,'POSTPONED',null); select public.touchline_fantasy_sync_gameweeks();");
    await seedRounds(db, "compressed", "FT", "clock_timestamp() - interval '1 hour'", "-2 hours");
    await seedRounds(db, "future-final", "FT", "clock_timestamp() + interval '2 days'", "1 day");
    await seedRounds(db, "stale-live", "FT", "clock_timestamp() - interval '1 second'", "1 day");
    await db.exec("update public.football_fixtures set status = 'LIVE' where id = 'stale-live-next-first'; select public.touchline_fantasy_sync_gameweeks();");

    const states = await db.query("select round_id,state,extract(epoch from locks_at-market_opens_at) as margin_seconds from public.touchline_fantasy_gameweeks where round_id in ('not-final-next','cancelled-next','compressed-next','future-final-next','postponed-null-next','stale-live-next','unknown-next') order by round_id");
    assert.deepEqual(states.rows.map((row: { round_id: string; state: string }) => [row.round_id, row.state]), [
      ["cancelled-next", "UPCOMING"],
      ["compressed-next", "LOCKED"],
      ["future-final-next", "UPCOMING"],
      ["not-final-next", "UPCOMING"],
      ["postponed-null-next", "UPCOMING"],
      ["stale-live-next", "LIVE"],
      ["unknown-next", "UPCOMING"],
    ]);
    const compressed = states.rows.find((row: { round_id: string }) => row.round_id === "compressed-next") as { margin_seconds: number };
    assert.equal(Number(compressed.margin_seconds), 0.000001, "compressed schedule keeps the required strict window sentinel rather than opening early");

    const before = await db.query("select round_id,state,market_opens_at,locks_at from public.touchline_fantasy_gameweeks order by round_id");
    await db.exec("select public.touchline_fantasy_sync_gameweeks();");
    const after = await db.query("select round_id,state,market_opens_at,locks_at from public.touchline_fantasy_gameweeks order by round_id");
    assert.deepEqual(after.rows, before.rows, "a repeat synchronisation does not duplicate or mutate equivalent windows");
  } finally {
    await db.close();
  }
});

test("a final status without a persisted final observation cannot reopen the Markt", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "missing-observation", "FT", "null", "1 day");
    const row = (await db.query("select state,extract(epoch from locks_at-market_opens_at) as margin_seconds from public.touchline_fantasy_gameweeks where round_id='missing-observation-next'")).rows[0] as { state: string; margin_seconds: number };
    assert.equal(row.state, "UPCOMING");
    assert.equal(Number(row.margin_seconds), 0.000001);
  } finally {
    await db.close();
  }
});

test("an unscheduled postponed round remains a fail-closed predecessor instead of being skipped", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`
      insert into public.touchline_fantasy_configs values ('competition-gap', 'season-gap', 'active', 5);
      insert into public.football_rounds values
        ('gap-one', 'competition-gap', 'season-gap', '1'),
        ('gap-two', 'competition-gap', 'season-gap', '2'),
        ('gap-three', 'competition-gap', 'season-gap', '3');
      insert into public.football_fixtures values
        ('gap-one-final', 'gap-one', clock_timestamp() - interval '7 days', 'FT', clock_timestamp() - interval '1 day'),
        ('gap-two-postponed', 'gap-two', null, 'POSTPONED', null),
        ('gap-three-next', 'gap-three', clock_timestamp() + interval '1 day', 'NS', null);
      select public.touchline_fantasy_sync_gameweeks();
    `);
    const rows = await db.query("select round_id,state,extract(epoch from locks_at-market_opens_at) as margin_seconds from public.touchline_fantasy_gameweeks where season_id='season-gap' order by gameweek_number");
    assert.deepEqual(rows.rows.map((row: { round_id: string; state: string }) => [row.round_id, row.state]), [
      ["gap-one", "FINAL"],
      ["gap-three", "UPCOMING"],
    ]);
    const future = rows.rows[1] as { margin_seconds: number };
    assert.equal(Number(future.margin_seconds), 0.000001, "the unscheduled provider round remains an explicit closed predecessor");
  } finally {
    await db.close();
  }
});

test("known rounds without any fixtures block their successors while genuine first rounds bootstrap", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`
      insert into public.touchline_fantasy_configs values
        ('competition-empty-first','season-empty-first','active',5),
        ('competition-empty-middle','season-empty-middle','active',5),
        ('competition-bootstrap','season-bootstrap','active',5);
      insert into public.football_rounds values
        ('empty-first-one','competition-empty-first','season-empty-first','1'),
        ('empty-first-two','competition-empty-first','season-empty-first','2'),
        ('empty-middle-one','competition-empty-middle','season-empty-middle','1'),
        ('empty-middle-two','competition-empty-middle','season-empty-middle','2'),
        ('empty-middle-three','competition-empty-middle','season-empty-middle','3'),
        ('bootstrap-one','competition-bootstrap','season-bootstrap','1');
      insert into public.football_fixtures values
        ('empty-first-two-fixture','empty-first-two',clock_timestamp()+interval '1 day','NS',null),
        ('empty-middle-one-fixture','empty-middle-one',clock_timestamp()-interval '7 days','FT',clock_timestamp()-interval '1 day'),
        ('empty-middle-three-fixture','empty-middle-three',clock_timestamp()+interval '1 day','NS',null),
        ('bootstrap-fixture','bootstrap-one',clock_timestamp()+interval '1 day','NS',null);
      select public.touchline_fantasy_sync_gameweeks();
    `);
    const rows = await db.query("select round_id,state from public.touchline_fantasy_gameweeks order by round_id");
    assert.deepEqual(rows.rows, [
      { round_id: "bootstrap-one", state: "MARKET_OPEN" },
      { round_id: "empty-first-two", state: "UPCOMING" },
      { round_id: "empty-middle-one", state: "FINAL" },
      { round_id: "empty-middle-three", state: "UPCOMING" },
    ]);
    await db.exec("select public.touchline_fantasy_sync_gameweeks();");
    assert.deepEqual((await db.query("select round_id,state from public.touchline_fantasy_gameweeks order by round_id")).rows, rows.rows);
    for (const roundId of ["empty-first-two", "empty-middle-three"]) {
      const id = (await db.query(`select id from public.touchline_fantasy_gameweeks where round_id='${roundId}'`)).rows[0].id;
      await assert.rejects(
        () => db.query(`select public.touchline_fantasy_save_lineup('00000000-0000-4000-8000-000000000002','${id}','307','4-3-3','[]'::jsonb,'draft','empty-round-blocked-save')`),
        /TL_FANTASY_GAMEWEEK_LOCKED/,
      );
    }
  } finally {
    await db.close();
  }
});

test("a lone numbered Round 2 cannot bootstrap when Round 1 is absent", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`
      insert into public.touchline_fantasy_configs values
        ('competition-absent-first','season-absent-first','active',5),
        ('competition-unnamed-first','season-unnamed-first','active',5);
      insert into public.football_rounds values
        ('absent-first-two','competition-absent-first','season-absent-first','Round 2'),
        ('unnamed-first','competition-unnamed-first','season-unnamed-first','Opening');
      insert into public.football_fixtures values
        ('absent-first-two-fixture','absent-first-two',clock_timestamp()+interval '1 day','NS',null),
        ('unnamed-first-fixture','unnamed-first',clock_timestamp()+interval '1 day','NS',null);
      select public.touchline_fantasy_sync_gameweeks();
    `);
    const gameweek = (await db.query("select id,gameweek_number,state,extract(epoch from locks_at-market_opens_at) as margin_seconds,extract(epoch from first_fixture_at-locks_at) as lock_offset_seconds from public.touchline_fantasy_gameweeks where round_id='absent-first-two'")).rows[0];
    assert.equal(gameweek.gameweek_number, 2);
    assert.equal(gameweek.state, "UPCOMING");
    assert.equal(Number(gameweek.margin_seconds), 0.000001, "an absent predecessor keeps the explicit closed window");
    assert.equal(Number(gameweek.lock_offset_seconds), 0);
    assert.equal((await db.query("select state from public.touchline_fantasy_gameweeks where round_id='unnamed-first'")).rows[0].state, "MARKET_OPEN", "unambiguous scheduled unnamed first rounds retain the existing fallback");
    await assert.rejects(
      () => db.query(`select public.touchline_fantasy_save_lineup('00000000-0000-4000-8000-000000000002','${gameweek.id}','307','4-3-3','[]'::jsonb,'draft','absent-first-blocked-save')`),
      /TL_FANTASY_GAMEWEEK_LOCKED/,
    );
    await assert.rejects(
      () => db.query(`select public.touchline_fantasy_prepare_user_gameweek('00000000-0000-4000-8000-000000000002','${gameweek.id}')`),
      /TL_FANTASY_GAMEWEEK_LOCKED/,
    );
    await db.exec("update public.football_fixtures set starts_at=clock_timestamp()-interval '1 second' where id='absent-first-two-fixture'; select public.touchline_fantasy_sync_gameweeks();");
    assert.equal((await db.query(`select state from public.touchline_fantasy_gameweeks where id='${gameweek.id}'`)).rows[0].state, "LOCKED");
  } finally {
    await db.close();
  }
});

test("a materialized Gameweek closes before a direct save when every kickoff is removed", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "removed-kickoff", "FT", "clock_timestamp() - interval '1 second'", "1 day");
    const gameweek = (await db.query("select id,state from public.touchline_fantasy_gameweeks where round_id='removed-kickoff-next'")).rows[0] as { id: string; state: string };
    assert.equal(gameweek.state, "MARKET_OPEN");
    await db.exec("update public.football_fixtures set starts_at = null where id='removed-kickoff-next-first'; select public.touchline_fantasy_sync_gameweeks();");
    const closed = (await db.query("select state from public.touchline_fantasy_gameweeks where id='" + gameweek.id + "'")).rows[0] as { state: string };
    assert.equal(closed.state, "LOCKED");
    await assert.rejects(
      () => db.query("select public.touchline_fantasy_save_lineup('00000000-0000-4000-8000-000000000002', '" + gameweek.id + "', '307', '4-3-3', '[]'::jsonb, 'draft', 'removed-kickoff-post')"),
      /TL_FANTASY_GAMEWEEK_LOCKED/,
    );
  } finally {
    await db.close();
  }
});

test("a materialized Gameweek closes when all fixture observations disappear, preserving SETTLED", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "deleted-fixtures", "FT", "clock_timestamp() - interval '1 second'", "1 day");
    const gameweek = (await db.query("select id,state from public.touchline_fantasy_gameweeks where round_id='deleted-fixtures-next'")).rows[0];
    assert.equal(gameweek.state, "MARKET_OPEN");
    await db.exec("delete from public.football_fixtures where round_id='deleted-fixtures-next'; select public.touchline_fantasy_sync_gameweeks();");
    assert.equal((await db.query(`select state from public.touchline_fantasy_gameweeks where id='${gameweek.id}'`)).rows[0].state, "LOCKED");
    await assert.rejects(
      () => db.query(`select public.touchline_fantasy_save_lineup('00000000-0000-4000-8000-000000000002','${gameweek.id}','307','4-3-3','[]'::jsonb,'draft','deleted-fixtures-blocked-save')`),
      /TL_FANTASY_GAMEWEEK_LOCKED/,
    );
    await db.exec(`update public.touchline_fantasy_gameweeks set state='SETTLED' where id='${gameweek.id}'; select public.touchline_fantasy_sync_gameweeks();`);
    assert.equal((await db.query(`select state from public.touchline_fantasy_gameweeks where id='${gameweek.id}'`)).rows[0].state, "SETTLED");
  } finally {
    await db.close();
  }
});

test("an unscheduled unnumbered provider round closes otherwise ambiguous season ordering", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec([
      "insert into public.touchline_fantasy_configs values ('competition-ambiguous', 'season-ambiguous', 'active', 5);",
      "insert into public.football_rounds values ('ambiguous-opening', 'competition-ambiguous', 'season-ambiguous', 'Opening'), ('ambiguous-tbd', 'competition-ambiguous', 'season-ambiguous', 'TBD');",
      "insert into public.football_fixtures values ('ambiguous-opening-fixture', 'ambiguous-opening', clock_timestamp() + interval '1 day', 'NS', null), ('ambiguous-tbd-fixture', 'ambiguous-tbd', null, 'POSTPONED', null);",
      "select public.touchline_fantasy_sync_gameweeks();",
    ].join("\n"));
    const row = (await db.query("select state,extract(epoch from locks_at-market_opens_at) as margin_seconds from public.touchline_fantasy_gameweeks where round_id='ambiguous-opening'")).rows[0] as { state: string; margin_seconds: number };
    assert.equal(row.state, "UPCOMING");
    assert.equal(Number(row.margin_seconds), 0.000001);
  } finally {
    await db.close();
  }
});

test("final-whistle Markt migration recalculates exact kickoff lock after a fixture reschedule", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "postponed", "FT", "clock_timestamp() - interval '1 second'", "1 day");
    const before = (await db.query("select locks_at,market_opens_at from public.touchline_fantasy_gameweeks where round_id='postponed-next'" )).rows[0] as { locks_at: string; market_opens_at: string };
    await db.exec("update public.football_fixtures set starts_at = clock_timestamp() + interval '2 days' where id='postponed-next-first'; select public.touchline_fantasy_sync_gameweeks();");
    const after = (await db.query("select state,locks_at,extract(epoch from first_fixture_at-locks_at) as lock_offset_seconds,extract(epoch from market_opens_at - (select max(finalized_at) from public.football_fixtures where round_id='postponed-previous')) as delay_seconds from public.touchline_fantasy_gameweeks where round_id='postponed-next'" )).rows[0] as { state: string; locks_at: string; lock_offset_seconds: number; delay_seconds: number };
    assert.notEqual(after.locks_at, before.locks_at);
    assert.equal(after.state, "MARKET_OPEN");
    assert.equal(Number(after.lock_offset_seconds), 0);
    assert.equal(Number(after.delay_seconds), 0);
  } finally {
    await db.close();
  }
});

test("provider-style textual round names retain canonical sequence after a later round is rescheduled earlier", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`
      insert into public.touchline_fantasy_configs values ('competition-text', 'season-text', 'active', 5);
      insert into public.football_rounds values
        ('text-one','competition-text','season-text','Gameweek 1'),
        ('text-two','competition-text','season-text','Gameweek 2');
      insert into public.football_fixtures values
        ('text-one-final','text-one',clock_timestamp()+interval '2 days','FT',clock_timestamp()-interval '6 hours'),
        ('text-two-next','text-two',clock_timestamp()+interval '1 day','NS',null);
      select public.touchline_fantasy_sync_gameweeks();
    `);
    const rows = await db.query("select round_id,gameweek_number,state from public.touchline_fantasy_gameweeks where season_id='season-text' order by gameweek_number");
    assert.deepEqual(rows.rows.map((row: { round_id: string; gameweek_number: number; state: string }) => [row.round_id,row.gameweek_number,row.state]), [
      ["text-one",1,"FINAL"], ["text-two",2,"MARKET_OPEN"],
    ]);
    assert.deepEqual(rows.rows.filter((row: { state: string }) => row.state === "MARKET_OPEN")
      .map((row: { round_id: string }) => row.round_id), ["text-two"], "the consumer's first open Gameweek cannot be an already-finished round");
  } finally { await db.close(); }
});

test("provider-final rounds stay closed across stale future kickoff dates and reject direct save/prepare while preserving SETTLED", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "stale-final", "FT", "clock_timestamp() - interval '1 second'", "1 day");
    await db.exec("update public.football_fixtures set status='FT', finalized_at=clock_timestamp()-interval '1 second', starts_at=clock_timestamp()+interval '20 days' where id='stale-final-next-first'; update public.football_fixtures set starts_at=clock_timestamp()+interval '21 days' where id='stale-final-previous-final'; select public.touchline_fantasy_sync_gameweeks();");
    assert.equal((await db.query("select state from public.touchline_fantasy_gameweeks where round_id='stale-final-previous'")).rows[0].state, "FINAL", "a bootstrap opening date in the future must not demote a provider-final round to UPCOMING");
    const gameweek = (await db.query("select id,state from public.touchline_fantasy_gameweeks where round_id='stale-final-next'")).rows[0] as { id: string; state: string };
    assert.equal(gameweek.state, "FINAL", "provider-final evidence takes precedence over an otherwise open calendar window");
    const userId = "00000000-0000-4000-8000-000000000003";
    await assert.rejects(
      () => db.query(`select public.touchline_fantasy_save_lineup('${userId}', '${gameweek.id}', '307', '4-3-3', '[]'::jsonb, 'draft', 'stale-final-save')`),
      /TL_FANTASY_GAMEWEEK_LOCKED/,
    );
    await assert.rejects(
      () => db.query(`select public.touchline_fantasy_prepare_user_gameweek('${userId}', '${gameweek.id}')`),
      /TL_FANTASY_GAMEWEEK_LOCKED/,
    );
    await db.exec(`update public.touchline_fantasy_gameweeks set state='SETTLED' where id='${gameweek.id}'; select public.touchline_fantasy_sync_gameweeks();`);
    assert.equal((await db.query(`select state from public.touchline_fantasy_gameweeks where id='${gameweek.id}'`)).rows[0].state, "SETTLED");
  } finally { await db.close(); }
});

test("one official final fixture closes a stale future round even when final-observation coverage is incomplete", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    for (const prefix of ["partial-final", "unobserved-final"]) {
      await seedRounds(db, prefix, "FT", "clock_timestamp() - interval '1 second'", "1 day");
      await db.exec(`update public.football_fixtures set status='FT', finalized_at=${prefix === "partial-final" ? "clock_timestamp()-interval '1 second'" : "null"} where id='${prefix}-next-first';`);
      if (prefix === "partial-final") {
        await db.exec("insert into public.football_fixtures values ('partial-final-next-unplayed','partial-final-next',clock_timestamp()+interval '2 days','NS',null);");
      }
      await db.exec("select public.touchline_fantasy_sync_gameweeks();");
      const gameweek = (await db.query(`select id,state from public.touchline_fantasy_gameweeks where round_id='${prefix}-next'`)).rows[0] as { id: string; state: string };
      assert.equal(gameweek.state, "LOCKED", "a final result proves play already started but incomplete evidence must not invent a fully finalized round");
      await assert.rejects(
        () => db.query(`select public.touchline_fantasy_save_lineup('00000000-0000-4000-8000-000000000004', '${gameweek.id}', '307', '4-3-3', '[]'::jsonb, 'draft', '${prefix}-save')`),
        /TL_FANTASY_GAMEWEEK_LOCKED/,
      );
    }
  } finally { await db.close(); }
});

test("the complete migration restricts all three privileged RPCs to the service role without claiming table RLS coverage", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const privileges = await db.query(`
      select p.proname, p.prosecdef,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'touchline_fantasy_sync_gameweeks', 'touchline_fantasy_save_lineup', 'touchline_fantasy_prepare_user_gameweek'
      ) order by p.proname;
    `);
    assert.equal(privileges.rows.length, 3);
    for (const row of privileges.rows) {
      assert.equal(row.prosecdef, true);
      assert.equal(row.anon_execute, false, `${row.proname}: anon must not execute`);
      assert.equal(row.authenticated_execute, false, `${row.proname}: authenticated must not execute`);
      assert.equal(row.service_execute, true, `${row.proname}: the server boundary retains access`);
    }
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role};`);
      try {
        await assert.rejects(() => db.query("select public.touchline_fantasy_sync_gameweeks();"), /permission denied for function/);
      } finally { await db.exec("reset role;"); }
    }
    await db.exec("set role service_role;");
    try {
      const allowed = await db.query("select public.touchline_fantasy_sync_gameweeks() as count;");
      assert.equal(allowed.rows[0].count, 0);
    } finally { await db.exec("reset role;"); }
  } finally { await db.close(); }
});
