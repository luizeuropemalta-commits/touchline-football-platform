import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// This is deliberately one in-memory connection. It proves the real lock
// function and its forward guard, not cross-connection advisory-lock behavior.
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
type Row = Record<string, unknown>;
type Database = {
  exec(sql: string): Promise<unknown>;
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};
const sql = (name: string) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = {
  gameweek: id(1), round: id(2), fixture: id(3),
  season: id(4), competition: id(5), locked: id(9),
  noContract: id(10), downgraded: id(11), expired: id(12), inactive: id(13), overBudget: id(14), valid: id(15),
};

function actualFunction(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start, `missing canonical ${name}`);
  return source.slice(start, end + 4);
}

function actualDollarFunction(source: string, name: string) {
  const start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf("\n$function$;", start);
  assert.ok(start >= 0 && end > start, `missing canonical ${name}`);
  return source.slice(start, end + "\n$function$;".length);
}

function firstMigrationBlock(source: string) {
  const start = source.indexOf("do $migration$");
  const end = source.indexOf("\n$migration$;", start);
  assert.ok(start >= 0 && end > start, "missing first canonical migration block");
  return source.slice(start, end + "\n$migration$;".length);
}

async function makeDatabase(): Promise<Database> {
  const { PGlite } = await import(modulePath!);
  const db: Database = new PGlite();
  try {
    await db.exec(`
      create table public.football_rounds(id uuid primary key, season_id uuid, competition_id uuid);
      create table public.football_fixtures(
        id uuid primary key, round_id uuid, status text, provider text,
        provider_fixture_id text, home_club_id uuid, away_club_id uuid,
        season_id uuid, competition_id uuid
      );
      create table public.touchline_fantasy_configs(
        id uuid primary key, season_id uuid, competition_id uuid,
        competition_key text, status text
      );
      create table public.touchline_fantasy_gameweeks(
        id uuid primary key, round_id uuid, season_id uuid, competition_id uuid,
        locks_at timestamptz, state text, finalized_at timestamptz, settled_at timestamptz
      );
      create table public.touchline_fantasy_entitlements(
        user_id uuid, entitlement_key text, status text, plan_key text,
        current_period_start timestamptz, current_period_end timestamptz,
        primary key(user_id, entitlement_key)
      );
      create table public.touchline_fantasy_user_gameweeks(
        id uuid primary key, user_id uuid, gameweek_id uuid, selected_coach_id text, locked_coach_id text,
        state text, budget_eur_snapshot bigint, market_plan_key_snapshot text,
        total_market_value_eur bigint, locked_at timestamptz, finalized_at timestamptz,
        confirmed_at timestamptz
      );
      create table public.touchline_fantasy_user_gameweek_selections(
        user_gameweek_id uuid, slot_id text, slot_index integer, player_id uuid, club_id uuid,
        formation_role text, position_bucket text, market_value_eur bigint,
        primary key(user_gameweek_id, slot_id)
      );
      create table public.touchline_fantasy_locked_selections(
        user_gameweek_id uuid, slot_id text, slot_index integer, player_id uuid, club_id uuid,
        formation_role text, position_bucket text, market_value_eur bigint, locked_at timestamptz,
        primary key(user_gameweek_id, slot_id)
      );
      create table public.touchline_fantasy_audit_events(user_id uuid, gameweek_id uuid, event_type text, metadata jsonb);
      create table public.football_fantasy_fixture_feeds(
        id uuid primary key, provider text, provider_fixture_id text, last_synced_at timestamptz,
        fixture_payload jsonb, lineups_payload jsonb
      );
      create table public.football_players(id uuid primary key, provider text);
      create table public.touchline_player_fixture_score_settlements(
        football_player_id uuid, fixture_id uuid, scoring_version text, season_id uuid,
        competition_id uuid, settlement_status text, source_synced_at timestamptz,
        appearance_status text, minutes_played integer, rating numeric, statistics_payload jsonb
      );
      create table public.touchline_fantasy_player_fixture_scores(
        gameweek_id uuid, player_id uuid, fixture_id uuid, appearance_status text,
        participation_status text, rating numeric, goals integer, hat_trick_multiplier integer,
        fantasy_contribution numeric, reason_code text, settlement_status text,
        source_synced_at timestamptz, settled_at timestamptz,
        unique(player_id, fixture_id)
      );
      create table public.touchline_fantasy_user_gameweek_scores(
        user_gameweek_id uuid primary key, gameweek_score numeric, settlement_status text,
        checksum text, calculated_at timestamptz, settled_at timestamptz
      );
    `);
    const base = await sql("20260825165821_touchline_fantasy_gameweek_v1");
    await db.exec(actualFunction(base, "touchline_fantasy_fixture_is_live"));
    await db.exec(actualFunction(base, "touchline_fantasy_fixture_is_final"));
    const preWallLock = actualFunction(await sql("20260825202938_touchline_fantasy_markt_gameweek_xi"), "touchline_fantasy_lock_gameweek");
    const wallClockLock = preWallLock.replace("now() < v_gameweek.locks_at", "clock_timestamp() < v_gameweek.locks_at");
    assert.notEqual(wallClockLock, preWallLock, "fixture must include the real wall-clock predecessor");
    await db.exec(wallClockLock);
    await db.exec(firstMigrationBlock(await sql("20260920153000_touchline_fantasy_safe_rollover_settlement")));
    await db.exec(actualDollarFunction(
      await sql("20261001090049_touchline_fantasy_v4_raw_rating_transition"),
      "touchline_fantasy_reconcile_gameweek",
    ));
    await db.exec(await sql("20261011015000_touchline_fantasy_confirmed_plan_lock_guard"));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function seedConfirmed(db: Database, userId: string, planKey: string | null, budget: number | null, selectionValue: number) {
  const gameweekId = id(100 + Number(userId.slice(-2)));
  await db.query(`insert into public.touchline_fantasy_user_gameweeks
    (id,user_id,gameweek_id,selected_coach_id,state,budget_eur_snapshot,market_plan_key_snapshot,total_market_value_eur,confirmed_at)
    values ($1,$2,$3,'307','CONFIRMED',$4,$5,$6,clock_timestamp())`, [gameweekId, userId, ids.gameweek, budget, planKey, selectionValue * 11]);
  for (let slot = 1; slot <= 11; slot++) {
    await db.query(`insert into public.touchline_fantasy_user_gameweek_selections
      (user_gameweek_id,slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur)
      values ($1,$2,$3,$4,$5,'midfielder','midfield',$6)`, [gameweekId, `slot-${slot}`, slot, id(200 + slot), id(300 + slot), selectionValue]);
  }
  return gameweekId;
}

test("15000 lets the real V4 reconcile lock valid XIs while moving ineligible confirmations out of its global gate", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    await db.exec("begin");
    await db.query("insert into public.football_rounds values ($1,$2,$3)", [ids.round, ids.season, ids.competition]);
    await db.query("insert into public.touchline_fantasy_configs values ($1,$2,$3,'england','active')", [id(6), ids.season, ids.competition]);
    await db.query(`insert into public.touchline_fantasy_gameweeks
      (id,round_id,season_id,competition_id,locks_at,state)
      values ($1,$2,$3,$4,clock_timestamp()-interval '1 minute','MARKET_OPEN')`,
      [ids.gameweek, ids.round, ids.season, ids.competition]);
    await db.query(`insert into public.football_fixtures
      (id,round_id,status,provider,provider_fixture_id,home_club_id,away_club_id,season_id,competition_id)
      values ($1,$2,'NS','sportmonks','fixture-3',$3,$4,$5,$6)`,
      [ids.fixture, ids.round, id(301), id(302), ids.season, ids.competition]);

    const noContract = await seedConfirmed(db, ids.noContract, null, 123_000_000, 1_000_000);
    const downgraded = await seedConfirmed(db, ids.downgraded, "master", 2_000_000_000, 1_000_000);
    const expired = await seedConfirmed(db, ids.expired, "beta", 50_000_000, 1_000_000);
    const inactive = await seedConfirmed(db, ids.inactive, "standard", 500_000_000, 1_000_000);
    const overBudget = await seedConfirmed(db, ids.overBudget, "standard", 500_000_000, 50_000_000);
    const valid = await seedConfirmed(db, ids.valid, "pro", 1_000_000_000, 1_000_000);
    await db.query(`insert into public.touchline_fantasy_entitlements
      (user_id,entitlement_key,status,plan_key,current_period_start,current_period_end) values
      ($1,'fantasy_access','active','standard',clock_timestamp()-interval '1 hour',null),
      ($2,'fantasy_access','active','standard',clock_timestamp()-interval '1 hour',null),
      ($3,'fantasy_access','active','beta',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour'),
      ($4,'fantasy_access','canceled','standard',clock_timestamp()-interval '1 hour',null),
      ($5,'fantasy_access','active','standard',clock_timestamp()-interval '1 hour',null),
      ($6,'fantasy_access','active','pro',clock_timestamp()-interval '1 hour',null)`,
      [ids.noContract, ids.downgraded, ids.expired, ids.inactive, ids.overBudget, ids.valid]);

    await db.query(`insert into public.touchline_fantasy_user_gameweeks
      (id,user_id,gameweek_id,selected_coach_id,locked_coach_id,state,budget_eur_snapshot,market_plan_key_snapshot,total_market_value_eur,locked_at,confirmed_at)
      values ($1,$2,$3,'frozen','frozen','LOCKED',500000000,'standard',123456789,clock_timestamp()-interval '1 minute',clock_timestamp()-interval '2 minutes')`,
      [id(109), ids.locked, ids.gameweek]);
    await db.query(`insert into public.touchline_fantasy_locked_selections
      (user_gameweek_id,slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur,locked_at)
      values ($1,'frozen-slot',1,$2,$3,'midfielder','midfield',123456789,clock_timestamp()-interval '1 minute')`,
      [id(109), id(401), id(301)]);
    await db.query(`insert into public.touchline_fantasy_audit_events
      (user_id,gameweek_id,event_type,metadata) values ($1,$2,'XI_LOCKED','{}'::jsonb)`, [ids.locked, ids.gameweek]);

    const result = (await db.query<{ result: Row }>("select public.touchline_fantasy_reconcile_gameweek($1) as result", [ids.gameweek])).rows[0].result;
    assert.equal(result.ok, true);
    assert.equal(Number(result.userScoresChanged), 2, "only existing/valid LOCKED XIs enter reconciliation");
    const states = (await db.query<{ id: string; state: string }>("select id,state from public.touchline_fantasy_user_gameweeks order by id")).rows;
    assert.deepEqual(new Map(states.map(row => [row.id, row.state])), new Map([
      [id(109), "LOCKED"], [noContract, "DRAFT"], [downgraded, "DRAFT"],
      [expired, "DRAFT"], [inactive, "DRAFT"], [overBudget, "DRAFT"], [valid, "LOCKED"],
    ]));
    assert.equal(Number((await db.query<{ count: number }>(`select count(*)::int as count
      from public.touchline_fantasy_user_gameweeks
      where gameweek_id = $1 and state = 'CONFIRMED'`, [ids.gameweek])).rows[0].count), 0,
      "the real reconcile gate sees no residual CONFIRMED XI");
    assert.deepEqual((await db.query("select user_gameweek_id,count(*)::int as count from public.touchline_fantasy_locked_selections group by user_gameweek_id order by user_gameweek_id")).rows,
      [{ user_gameweek_id: id(109), count: 1 }, { user_gameweek_id: valid, count: 11 }]);
    assert.deepEqual((await db.query(`select state,selected_coach_id,locked_coach_id,total_market_value_eur,
      confirmed_at is not null as has_confirmed_at, locked_at is not null as has_locked_at
      from public.touchline_fantasy_user_gameweeks where id = $1`, [id(109)])).rows,
      [{ state: "LOCKED", selected_coach_id: "frozen", locked_coach_id: "frozen", total_market_value_eur: 123456789,
        has_confirmed_at: true, has_locked_at: true }]);
    assert.deepEqual((await db.query("select user_gameweek_id from public.touchline_fantasy_user_gameweek_scores order by user_gameweek_id")).rows,
      [{ user_gameweek_id: id(109) }, { user_gameweek_id: valid }]);
    assert.deepEqual((await db.query("select user_id,event_type from public.touchline_fantasy_audit_events order by user_id,event_type")).rows,
      [
        { user_id: ids.locked, event_type: "XI_LOCKED" },
        { user_id: ids.noContract, event_type: "XI_REJECTED" },
        { user_id: ids.downgraded, event_type: "XI_REJECTED" },
        { user_id: ids.expired, event_type: "XI_REJECTED" },
        { user_id: ids.inactive, event_type: "XI_REJECTED" },
        { user_id: ids.overBudget, event_type: "XI_REJECTED" },
        { user_id: ids.valid, event_type: "XI_LOCKED" },
        { user_id: null, event_type: "SCORE_RECONCILED" },
      ]);
    assert.deepEqual((await db.query<{ before_state: string; reason: string }>(`select
      metadata ->> 'beforeState' as before_state, metadata ->> 'reason' as reason
      from public.touchline_fantasy_audit_events
      where event_type = 'XI_REJECTED'
      order by user_id`)).rows,
      Array.from({ length: 5 }, () => ({ before_state: "CONFIRMED", reason: "LOCK_ELIGIBILITY_REJECTED" })));

    const replay = (await db.query<{ result: Row }>("select public.touchline_fantasy_lock_gameweek($1) as result", [ids.gameweek])).rows[0].result;
    assert.equal(Number(replay.lockedSelectionRows), 0, "a retry cannot relock or re-audit rejected XIs");
    assert.equal(Number((await db.query<{ count: number }>("select count(*)::int as count from public.touchline_fantasy_audit_events where event_type = 'XI_REJECTED'")).rows[0].count), 5);
  } finally {
    await db.exec("rollback");
    await db.close();
  }
});
