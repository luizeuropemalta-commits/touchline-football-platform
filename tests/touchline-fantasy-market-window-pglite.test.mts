import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Optional isolated PostgreSQL harness. It never connects to Supabase or uses
// application credentials. Set TOUCHLINE_FANTASY_PGLITE_MODULE to the local
// PGlite entry point when the database contract suite is available.
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const migrationUrl = new URL("../supabase/migrations/20260915103000_touchline_fantasy_inter_round_market_open_5h.sql", import.meta.url);

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
      id bigint generated always as identity primary key,
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
    create or replace function public.touchline_fantasy_fixture_is_final(p_status text)
    returns boolean language sql immutable set search_path = '' as $$
      select lower(btrim(coalesce(p_status, ''))) in ('ft', 'full time', 'finished', 'after penalties', 'aet', 'awarded')
    $$;
    create or replace function public.touchline_fantasy_fixture_is_live(p_status text)
    returns boolean language sql immutable set search_path = '' as $$
      select lower(btrim(coalesce(p_status, ''))) in ('live', '1st half', '2nd half', 'half time', 'extra time', 'penalties')
    $$;
  `);
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

test("five-hour Markt migration keeps the window closed at T+4:59:59 and opens it after T+5:00:00", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "before-five", "FT", "clock_timestamp() - interval '4 hours 59 minutes 59 seconds'", "1 day");
    const before = (await db.query("select state, extract(epoch from market_opens_at - (select max(finalized_at) from public.football_fixtures where round_id='before-five-previous')) as delay_seconds from public.touchline_fantasy_gameweeks where round_id='before-five-next'" )).rows[0] as { state: string; delay_seconds: number };
    assert.equal(before.state, "UPCOMING");
    assert.equal(Number(before.delay_seconds), 18_000);

    await db.exec("update public.football_fixtures set finalized_at = clock_timestamp() - interval '5 hours 1 second' where id='before-five-previous-final'; select public.touchline_fantasy_sync_gameweeks();");
    const after = (await db.query("select state, extract(epoch from market_opens_at - (select max(finalized_at) from public.football_fixtures where round_id='before-five-previous')) as delay_seconds from public.touchline_fantasy_gameweeks where round_id='before-five-next'" )).rows[0] as { state: string; delay_seconds: number };
    assert.equal(after.state, "MARKET_OPEN");
    assert.equal(Number(after.delay_seconds), 18_000);
  } finally {
    await db.close();
  }
});

test("five-hour Markt migration fails closed for non-final, postponed/cancelled, and compressed rounds and is idempotent", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "not-final", "NS", "null", "1 day");
    await seedRounds(db, "cancelled", "FT", "clock_timestamp() - interval '6 hours'", "1 day", "CANCELLED");
    await seedRounds(db, "postponed-null", "FT", "clock_timestamp() - interval '6 hours'", "1 day");
    await db.exec("insert into public.football_fixtures values ('postponed-null-undated','postponed-null-previous',null,'POSTPONED',null); select public.touchline_fantasy_sync_gameweeks();");
    await seedRounds(db, "compressed", "FT", "clock_timestamp() - interval '1 hour'", "2 hours");

    const states = await db.query("select round_id,state,extract(epoch from locks_at-market_opens_at) as margin_seconds from public.touchline_fantasy_gameweeks where round_id in ('not-final-next','cancelled-next','compressed-next','postponed-null-next') order by round_id");
    assert.deepEqual(states.rows.map((row: { round_id: string; state: string }) => [row.round_id, row.state]), [
      ["cancelled-next", "UPCOMING"],
      ["compressed-next", "UPCOMING"],
      ["not-final-next", "UPCOMING"],
      ["postponed-null-next", "UPCOMING"],
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

test("five-hour Markt migration recalculates the next lock after a fixture postponement without moving the prior finalisation earlier", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await seedRounds(db, "postponed", "FT", "clock_timestamp() - interval '5 hours 1 second'", "1 day");
    const before = (await db.query("select locks_at,market_opens_at from public.touchline_fantasy_gameweeks where round_id='postponed-next'" )).rows[0] as { locks_at: string; market_opens_at: string };
    await db.exec("update public.football_fixtures set starts_at = clock_timestamp() + interval '2 days' where id='postponed-next-first'; select public.touchline_fantasy_sync_gameweeks();");
    const after = (await db.query("select state,locks_at,extract(epoch from first_fixture_at-locks_at) as lock_offset_seconds,extract(epoch from market_opens_at - (select max(finalized_at) from public.football_fixtures where round_id='postponed-previous')) as delay_seconds from public.touchline_fantasy_gameweeks where round_id='postponed-next'" )).rows[0] as { state: string; locks_at: string; lock_offset_seconds: number; delay_seconds: number };
    assert.notEqual(after.locks_at, before.locks_at);
    assert.equal(after.state, "MARKET_OPEN");
    assert.equal(Number(after.lock_offset_seconds), 300);
    assert.equal(Number(after.delay_seconds), 18_000);
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
      ["text-one",1,"MARKET_OPEN"], ["text-two",2,"MARKET_OPEN"],
    ]);
  } finally { await db.close(); }
});
