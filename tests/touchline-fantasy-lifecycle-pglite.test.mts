import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Isolated, in-memory PostgreSQL only. These deterministic identities and
// ratings are SYNTHETIC TEST DATA, not archived football facts or customer data.
// Run with TOUCHLINE_FANTASY_PGLITE_MODULE pointing at the separately installed
// local harness. No application environment, credentials or remote DB is read.
// Canonical football tables are reduced fixtures; Fantasy tables, constraints,
// immutable triggers and ALL business function bodies come from versioned SQL.
// This proves SQL behavior/interleavings, not multi-session locking or RLS.
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
type Row = Record<string, unknown>;
type Database = {
  exec(sql: string): Promise<unknown>;
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};
const sql = (name: string) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const ids = { competition: id(1), season: id(2), home: id(3), away: id(4), owner: id(5), draftOwner: id(6), previousRound: id(7), nextRound: id(8), fixture: id(9), nextFixture: id(10), confirmed: id(11), historicalDraft: id(12) };

function actualFunction(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `Missing canonical function: ${name}`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `Missing canonical function terminator: ${name}`);
  return source.slice(start, end + 4);
}

function actualTable(source: string, name: string) {
  const start = source.indexOf(`create table if not exists public.${name} (`);
  assert.notEqual(start, -1, `Missing canonical table: ${name}`);
  const end = source.indexOf("\n);", start);
  assert.notEqual(end, -1, `Missing canonical table terminator: ${name}`);
  return source.slice(start, end + 3);
}

async function makeDatabase(beforeSuccessor?: (db: Database) => Promise<void>): Promise<Database> {
  const { PGlite } = await import(modulePath!);
  const db: Database = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.users (id uuid primary key);
      create table public.football_competitions (id uuid primary key);
      create table public.football_seasons (id uuid primary key);
      create table public.football_clubs (id uuid primary key, provider text, provider_team_id text);
      create table public.football_players (id uuid primary key, provider text, provider_player_id text);
      create table public.football_rounds (id uuid primary key, competition_id uuid, season_id uuid, name text);
      create table public.football_fixtures (
        id uuid primary key, round_id uuid, competition_id uuid, season_id uuid,
        provider text, provider_fixture_id text, starts_at timestamptz, status text,
        home_club_id uuid, away_club_id uuid, finalized_at timestamptz,
        provider_updated_at timestamptz, source_updated_at timestamptz, updated_at timestamptz default now()
      );
    `);
    const base = await sql("20260825165821_touchline_fantasy_gameweek_v1");
    const tableStart = base.indexOf("create table if not exists public.touchline_fantasy_configs");
    const tableEnd = base.indexOf("create or replace function public.touchline_fantasy_position_bucket");
    assert.ok(tableStart >= 0 && tableEnd > tableStart);
    // Includes the real updated-at and immutable locked-selection triggers.
    await db.exec(base.slice(tableStart, tableEnd));
    for (const name of ["position_bucket", "fixture_is_final", "fixture_is_live", "entitlement_is_active", "sync_gameweeks", "reconcile_gameweek"]) {
      await db.exec(actualFunction(base, `touchline_fantasy_${name}`));
    }
    await db.exec(actualTable(await sql("048_touchline_player_season_statistics_read_model"), "football_player_fixture_statistics"));
    await db.exec(actualTable(await sql("015_sportmonks_fantasy_data_foundation"), "football_fantasy_fixture_feeds"));
    // Real prepare/lock/save/alerts and immutable user-snapshot trigger.
    await db.exec(await sql("20260825202938_touchline_fantasy_markt_gameweek_xi"));
    const functionPermissions = base.split("\n").filter((line) => /^(?:revoke all|grant execute) on function public\.touchline_fantasy_(?:lock_gameweek|reconcile_gameweek|prepare_user_gameweek)\(/.test(line));
    assert.equal(functionPermissions.length, 6, "Use the real deny-public/grant-service ACLs for all three functions");
    await db.exec(functionPermissions.join("\n"));
    await db.exec(await sql("20260825213744_touchline_fantasy_wall_clock_deadline"));
    // Real final-observation trigger, not a fabricated finality implementation.
    const finality = await sql("20260826173229_touchline_fantasy_inter_round_market_window");
    await db.exec(finality.slice(0, finality.indexOf("create or replace function public.touchline_fantasy_sync_gameweeks")));
    await db.exec(await sql("20260919151427_touchline_fantasy_kickoff_final_whistle_market_window"));
    if (beforeSuccessor) await beforeSuccessor(db);
    await db.exec(await sql("20260920153000_touchline_fantasy_safe_rollover_settlement"));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function seed(db: Database, futureKickoff = false, providerFinal = true) {
  await db.exec(`
    insert into public.users values ('${ids.owner}'), ('${ids.draftOwner}');
    insert into public.football_competitions values ('${ids.competition}');
    insert into public.football_seasons values ('${ids.season}');
    insert into public.football_clubs values ('${ids.home}','sportmonks','900'), ('${ids.away}','sportmonks','901');
    insert into public.football_players
      select ('10000000-0000-4000-8000-' || lpad((100+n)::text,12,'0'))::uuid, 'sportmonks', (9000+n)::text
      from generate_series(1,11) n;
    insert into public.touchline_fantasy_configs
      (competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values ('england','${ids.competition}','${ids.season}',2990,'GBP',1000000,11);
    insert into public.touchline_fantasy_entitlements (user_id,status,source)
      values ('${ids.owner}','active','qa_grant'), ('${ids.draftOwner}','active','qa_grant');
    insert into public.football_rounds values
      ('${ids.previousRound}','${ids.competition}','${ids.season}','Gameweek 1'),
      ('${ids.nextRound}','${ids.competition}','${ids.season}','Gameweek 2');
    insert into public.football_fixtures
      (id,round_id,competition_id,season_id,provider,provider_fixture_id,starts_at,status,home_club_id,away_club_id,finalized_at,source_updated_at)
      values
      ('${ids.fixture}','${ids.previousRound}','${ids.competition}','${ids.season}','sportmonks','99001',
        clock_timestamp() ${futureKickoff ? "+ interval '2 days'" : "- interval '2 hours'"},'${providerFinal ? "FT" : "NS"}','${ids.home}','${ids.away}',
        ${providerFinal ? "clock_timestamp()-interval '5 minutes'" : "null"},clock_timestamp()-interval '1 minute'),
      ('${ids.nextFixture}','${ids.nextRound}','${ids.competition}','${ids.season}','sportmonks','99002',
        clock_timestamp()+interval '1 day','NS','${ids.home}','${ids.away}',null,null);
    insert into public.football_fantasy_fixture_feeds
      (provider,provider_fixture_id,fixture_payload,lineups_payload,formations_payload,sidelined_payload,events_payload,last_synced_at)
      select 'sportmonks','99001','{"status":"${providerFinal ? "FT" : "NS"}"}',jsonb_agg(jsonb_build_object('playerId',(9000+n)::text,'teamId','900')),'[]','[]','[]',
        (select source_updated_at from public.football_fixtures where id='${ids.fixture}')
      from generate_series(1,11) n;
    select public.touchline_fantasy_sync_gameweeks();
    insert into public.touchline_fantasy_user_gameweeks
      (id,user_id,gameweek_id,formation_code,selected_coach_id,state,budget_eur_snapshot,max_players_per_club_snapshot,total_market_value_eur,confirmed_at)
      select '${ids.confirmed}','${ids.owner}',id,'4-3-3','307','CONFIRMED',1000000,11,11000,clock_timestamp()-interval '3 hours'
      from public.touchline_fantasy_gameweeks where round_id='${ids.previousRound}';
    insert into public.touchline_fantasy_user_gameweeks
      (id,user_id,gameweek_id,formation_code,selected_coach_id,state,budget_eur_snapshot,max_players_per_club_snapshot,total_market_value_eur)
      select '${ids.historicalDraft}','${ids.draftOwner}',id,'4-3-3','307','DRAFT',1000000,11,11000
      from public.touchline_fantasy_gameweeks where round_id='${ids.previousRound}';
    insert into public.touchline_fantasy_user_gameweek_selections
      (user_gameweek_id,slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur)
      select user_gameweek.id,'slot-'||n,n,('10000000-0000-4000-8000-' || lpad((100+n)::text,12,'0'))::uuid,
        '${ids.home}',case when n=1 then 'goalkeeper' else 'midfielder' end,
        case when n=1 then 'goalkeeper' else 'midfield' end,1000
      from public.touchline_fantasy_user_gameweeks user_gameweek cross join generate_series(1,11) n;
  `);
  const gameweeks = await db.query<{ id: string; round_id: string; state: string }>("select id,round_id,state from public.touchline_fantasy_gameweeks order by gameweek_number");
  assert.deepEqual(gameweeks.rows.map((row) => row.state), providerFinal ? ["FINAL", "MARKET_OPEN"] : ["MARKET_OPEN", "UPCOMING"]);
  return { previous: gameweeks.rows[0].id, next: gameweeks.rows[1].id };
}

async function writeStatistics(db: Database, fresh: boolean, rating = 7) {
  await db.exec(`
    insert into public.football_player_fixture_statistics
      (football_player_id,fixture_id,competition_id,season_id,club_id,appearance_status,minutes_played,rating,statistics_payload,source_synced_at)
      select player.id,'${ids.fixture}','${ids.competition}','${ids.season}','${ids.home}','started',90,${rating},'{"goals":0}',
        fixture.source_updated_at ${fresh ? "" : "- interval '1 hour'"}
      from public.football_players player cross join public.football_fixtures fixture
      where fixture.id='${ids.fixture}'
      on conflict (football_player_id,fixture_id) do update
      set rating=excluded.rating, source_synced_at=excluded.source_synced_at;
  `);
}

async function reconcile(db: Database, gameweek: string) {
  return (await db.query<{ result: Row }>("select public.touchline_fantasy_reconcile_gameweek($1) as result", [gameweek])).rows[0].result;
}

async function state(db: Database, gameweek: string) {
  return (await db.query<{ state: string }>("select state from public.touchline_fantasy_gameweeks where id=$1", [gameweek])).rows[0].state;
}

async function historicalDraft(db: Database) {
  return (await db.query(`select to_jsonb(user_gameweek) as row,
    (select jsonb_agg(to_jsonb(selection) order by slot_index) from public.touchline_fantasy_user_gameweek_selections selection where selection.user_gameweek_id=user_gameweek.id) as selections,
    (select count(*) from public.touchline_fantasy_locked_selections locked where locked.user_gameweek_id=user_gameweek.id) as locked_count,
    (select count(*) from public.touchline_fantasy_user_gameweek_scores score where score.user_gameweek_id=user_gameweek.id) as score_count,
    (select count(*) from public.touchline_fantasy_audit_events audit where audit.user_id=user_gameweek.user_id and audit.gameweek_id=user_gameweek.gameweek_id and event_type='XI_LOCKED') as lock_audit_count
    from public.touchline_fantasy_user_gameweeks user_gameweek where id=$1`, [ids.historicalDraft])).rows[0];
}

for (const statistics of ["missing", "stale", "one-player-missing", "one-timestamp-null", "one-version-ahead"] as const) {
  test(`real SQL cannot settle ${statistics} player statistics before producer completion, and retry recovers`, { skip: !modulePath }, async () => {
    const db = await makeDatabase();
    try {
      const rounds = await seed(db);
      const draftBefore = await historicalDraft(db);
      if (statistics === "stale") await writeStatistics(db, false, 1);
      if (["one-player-missing", "one-timestamp-null", "one-version-ahead"].includes(statistics)) {
        await writeStatistics(db, true);
        await db.query(statistics === "one-player-missing"
          ? "delete from public.football_player_fixture_statistics where football_player_id=$1"
          : statistics === "one-timestamp-null"
            ? "update public.football_player_fixture_statistics set source_synced_at=null where football_player_id=$1"
            : "update public.football_player_fixture_statistics set source_synced_at=source_synced_at+interval '1 second' where football_player_id=$1", [id(101)]);
      }
      const pending = await reconcile(db, rounds.previous);
      assert.equal(pending.ok, true, "Lock/carry may complete even when final scoring remains pending");
      assert.equal(pending.pendingStatistics, true);
      assert.notEqual(await state(db, rounds.previous), "SETTLED", "Fixture FT alone cannot certify missing/stale player scores as final");
      const premature = await db.query("select * from public.touchline_fantasy_user_gameweek_scores where settlement_status='FINAL'");
      assert.equal(premature.rows.length, 0, "No final customer score before the canonical producer catches up");
      const prepared = (await db.query<{ id: string }>("select public.touchline_fantasy_prepare_user_gameweek($1,$2) as id", [ids.owner, rounds.next])).rows[0].id;
      const carried = (await db.query("select state,selected_coach_id,carry_source_user_gameweek_id from public.touchline_fantasy_user_gameweeks where id=$1", [prepared])).rows[0];
      assert.deepEqual(carried, { state: "DRAFT", selected_coach_id: "307", carry_source_user_gameweek_id: ids.confirmed });
      const selectionProjection = "slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur";
      const carriedSelections = (await db.query(`select ${selectionProjection} from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 order by slot_index`, [prepared])).rows;
      assert.equal(carriedSelections.length, 11);
      assert.deepEqual(carriedSelections, (await db.query(`select ${selectionProjection} from public.touchline_fantasy_locked_selections where user_gameweek_id=$1 order by slot_index`, [ids.confirmed])).rows);
      // Deterministically models GET running between fixture persistence and
      // the player's producer: a later successful producer must remain repairable.
      await writeStatistics(db, true);
      assert.equal((await reconcile(db, rounds.previous)).ok, true);
      assert.equal(await state(db, rounds.previous), "SETTLED");
      const score = (await db.query<{ gameweek_score: string; settlement_status: string }>("select gameweek_score,settlement_status from public.touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1", [ids.confirmed])).rows[0];
      assert.equal(Number(score.gameweek_score), 77, "Eleven independently seeded ratings of seven sum to 77");
      assert.equal(score.settlement_status, "FINAL");
      const scoreBeforeRetry = await db.query("select to_jsonb(score) as row from public.touchline_fantasy_user_gameweek_scores score where user_gameweek_id=$1", [ids.confirmed]);
      assert.equal((await reconcile(db, rounds.previous)).ok, true);
      assert.deepEqual((await db.query("select to_jsonb(score) as row from public.touchline_fantasy_user_gameweek_scores score where user_gameweek_id=$1", [ids.confirmed])).rows, scoreBeforeRetry.rows);
      assert.deepEqual(await historicalDraft(db), draftBefore);
    } finally { await db.close(); }
  });
}

test("real SQL locks a provider-final round despite stale future kickoff and carries that exact XI", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const rounds = await seed(db, true);
    const draftBefore = await historicalDraft(db);
    await writeStatistics(db, true);
    assert.equal((await reconcile(db, rounds.previous)).ok, true);
    const selectionFields = "slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur";
    const locked = await db.query(`select ${selectionFields} from public.touchline_fantasy_locked_selections where user_gameweek_id=$1 order by slot_index`, [ids.confirmed]);
    assert.equal(locked.rows.length, 11, "Outer RPC ok:true must not hide an inner market-open lock refusal");
    assert.equal((await db.query(`select bool_and(locked.locked_at <= clock_timestamp() and locked.locked_at < gameweek.locks_at) as observed_lock
      from public.touchline_fantasy_locked_selections locked
      join public.touchline_fantasy_user_gameweeks user_gameweek on user_gameweek.id=locked.user_gameweek_id
      join public.touchline_fantasy_gameweeks gameweek on gameweek.id=user_gameweek.gameweek_id
      where user_gameweek.id=$1`, [ids.confirmed])).rows[0].observed_lock, true, "An observed final cannot acquire a future lock timestamp");
    const prepared = (await db.query<{ id: string }>("select public.touchline_fantasy_prepare_user_gameweek($1,$2) as id", [ids.owner, rounds.next])).rows[0].id;
    const next = (await db.query("select state,formation_code,selected_coach_id,carry_source_user_gameweek_id,total_market_value_eur from public.touchline_fantasy_user_gameweeks where id=$1", [prepared])).rows[0];
    assert.equal(next.state, "DRAFT");
    assert.equal(next.formation_code, "4-3-3");
    assert.equal(next.selected_coach_id, "307");
    assert.equal(next.carry_source_user_gameweek_id, ids.confirmed);
    assert.equal(Number(next.total_market_value_eur), 11000);
    assert.deepEqual((await db.query(`select ${selectionFields} from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 order by slot_index`, [prepared])).rows, locked.rows);
    assert.equal((await db.query("select * from public.touchline_fantasy_locked_selections where user_gameweek_id=$1", [prepared])).rows.length, 0);
    assert.equal((await db.query<{ id: string }>("select public.touchline_fantasy_prepare_user_gameweek($1,$2) as id", [ids.owner, rounds.next])).rows[0].id, prepared);
    assert.deepEqual(await historicalDraft(db), draftBefore);
  } finally { await db.close(); }
});

test("real SQL normal final settlement preserves historical DRAFT and an existing edited next draft", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const rounds = await seed(db);
    const draftBefore = await historicalDraft(db);
    await writeStatistics(db, true);
    assert.equal((await reconcile(db, rounds.previous)).ok, true);
    const prepared = (await db.query<{ id: string }>("select public.touchline_fantasy_prepare_user_gameweek($1,$2) as id", [ids.owner, rounds.next])).rows[0].id;
    await db.query("delete from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 and slot_index>1", [prepared]);
    await db.query("update public.touchline_fantasy_user_gameweeks set selected_coach_id='255',total_market_value_eur=1000 where id=$1", [prepared]);
    const before = await db.query("select to_jsonb(user_gameweek) as row from public.touchline_fantasy_user_gameweeks user_gameweek where id=$1", [prepared]);
    const selectionsBefore = await db.query("select * from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 order by slot_index", [prepared]);
    await reconcile(db, rounds.previous);
    await db.query("select public.touchline_fantasy_prepare_user_gameweek($1,$2)", [ids.owner, rounds.next]);
    assert.deepEqual((await db.query("select to_jsonb(user_gameweek) as row from public.touchline_fantasy_user_gameweeks user_gameweek where id=$1", [prepared])).rows, before.rows);
    assert.equal(selectionsBefore.rows.length, 1);
    assert.deepEqual((await db.query("select * from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 order by slot_index", [prepared])).rows, selectionsBefore.rows);
    assert.deepEqual(await historicalDraft(db), draftBefore);
    await assert.rejects(db.query("delete from public.touchline_fantasy_locked_selections where user_gameweek_id=$1", [ids.confirmed]), /TL_FANTASY_LOCKED_SELECTION_IMMUTABLE/);
    await assert.rejects(db.query("update public.touchline_fantasy_user_gameweeks set selected_coach_id='255' where id=$1", [ids.confirmed]), /TL_FANTASY_LOCKED_SNAPSHOT_IMMUTABLE/);
  } finally { await db.close(); }
});

test("real SQL still refuses to lock a genuinely upcoming provider fixture", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const rounds = await seed(db, true, false);
    const result = (await db.query<{ result: Row }>("select public.touchline_fantasy_lock_gameweek($1) as result", [rounds.previous])).rows[0].result;
    assert.equal(result.ok, false);
    assert.equal(await state(db, rounds.previous), "MARKET_OPEN");
    assert.equal((await db.query("select * from public.touchline_fantasy_locked_selections")).rows.length, 0);
    assert.equal((await db.query("select state from public.touchline_fantasy_user_gameweeks where id=$1", [ids.confirmed])).rows[0].state, "CONFIRMED");
  } finally { await db.close(); }
});

test("real SQL prepare cannot silently create an empty draft before capturing its confirmed predecessor", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const rounds = await seed(db);
    // This is the gap between separate RPC transactions, not concurrent SQL
    // sessions: the next market exists but the confirmed predecessor is not locked.
    await assert.rejects(db.query("select public.touchline_fantasy_prepare_user_gameweek($1,$2)", [ids.owner, rounds.next]), /TL_FANTASY_PREDECESSOR_NOT_LOCKED/);
    assert.equal((await db.query("select * from public.touchline_fantasy_user_gameweeks where user_id=$1 and gameweek_id=$2", [ids.owner, rounds.next])).rows.length, 0);
  } finally { await db.close(); }
});

test("real SQL coverage is club-specific and does not require each selected player in every round fixture", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const rounds = await seed(db);
    await db.exec(`
      insert into public.football_clubs values ('${id(20)}','sportmonks','902'), ('${id(21)}','sportmonks','903');
      insert into public.football_fixtures
        (id,round_id,competition_id,season_id,provider,provider_fixture_id,starts_at,status,home_club_id,away_club_id,finalized_at,source_updated_at)
        values ('${id(22)}','${ids.previousRound}','${ids.competition}','${ids.season}','sportmonks','99003',
          clock_timestamp()-interval '2 hours','FT','${id(20)}','${id(21)}',clock_timestamp()-interval '5 minutes',clock_timestamp()-interval '1 minute');
      insert into public.football_fantasy_fixture_feeds
        (provider,provider_fixture_id,fixture_payload,lineups_payload,formations_payload,sidelined_payload,events_payload,last_synced_at)
        select 'sportmonks','99003','{"status":"FT"}','[]','[]','[]','[]',source_updated_at
        from public.football_fixtures where id='${id(22)}';
      select public.touchline_fantasy_sync_gameweeks();
    `);
    await writeStatistics(db, true);
    assert.equal((await reconcile(db, rounds.previous)).ok, true);
    assert.equal(await state(db, rounds.previous), "SETTLED");
    assert.equal(Number((await db.query("select gameweek_score from public.touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1", [ids.confirmed])).rows[0].gameweek_score), 77);
  } finally { await db.close(); }
});

test("real SQL freshness follows the persisted final feed version, not the later fixture observation clock", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const rounds = await seed(db);
    await writeStatistics(db, true);
    // The final feed can be persisted before the separate fixture update.
    // Stats produced from that exact final feed are fresh even if its timestamp
    // precedes finalized_at/source_updated_at on the canonical fixture row.
    await db.exec(`
      update public.football_fantasy_fixture_feeds feed
        set last_synced_at=fixture.finalized_at-interval '1 second'
        from public.football_fixtures fixture where fixture.id='${ids.fixture}' and feed.provider_fixture_id='99001';
      update public.football_player_fixture_statistics stats
        set source_synced_at=feed.last_synced_at
        from public.football_fantasy_fixture_feeds feed where stats.fixture_id='${ids.fixture}' and feed.provider_fixture_id='99001';
    `);
    assert.equal((await reconcile(db, rounds.previous)).ok, true);
    assert.equal(await state(db, rounds.previous), "SETTLED");
    assert.equal(Number((await db.query("select gameweek_score from public.touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1", [ids.confirmed])).rows[0].gameweek_score), 77);
  } finally { await db.close(); }
});

for (const feedFailure of ["missing", "not-final", "newer-version", "empty-lineups"] as const) {
  test(`real SQL cannot finalize against a ${feedFailure} feed and can retry after its producer completes`, { skip: !modulePath }, async () => {
    const db = await makeDatabase();
    try {
      const rounds = await seed(db);
      await writeStatistics(db, true);
      if (feedFailure === "missing") {
        await db.exec("delete from public.football_fantasy_fixture_feeds");
      } else if (feedFailure === "not-final") {
        await db.exec("update public.football_fantasy_fixture_feeds set fixture_payload='{\"status\":\"Live\"}'");
      } else if (feedFailure === "empty-lineups") {
        await db.exec("update public.football_fantasy_fixture_feeds set lineups_payload='[]'");
      } else {
        await db.exec("update public.football_fantasy_fixture_feeds set last_synced_at=clock_timestamp()");
      }
      await reconcile(db, rounds.previous);
      assert.notEqual(await state(db, rounds.previous), "SETTLED");
      assert.equal((await db.query("select * from public.touchline_fantasy_user_gameweek_scores where settlement_status='FINAL'")).rows.length, 0);
      await db.exec(`
        insert into public.football_fantasy_fixture_feeds
          (provider,provider_fixture_id,fixture_payload,lineups_payload,formations_payload,sidelined_payload,events_payload,last_synced_at)
          select 'sportmonks','99001','{"status":"FT"}',jsonb_agg(jsonb_build_object('playerId',(9000+n)::text,'teamId','900')),'[]','[]','[]',clock_timestamp()
          from generate_series(1,11) n
          on conflict (provider,provider_fixture_id) do update set fixture_payload=excluded.fixture_payload,lineups_payload=excluded.lineups_payload,last_synced_at=excluded.last_synced_at;
        update public.football_player_fixture_statistics stats
          set source_synced_at=feed.last_synced_at from public.football_fantasy_fixture_feeds feed
          where stats.fixture_id='${ids.fixture}' and feed.provider_fixture_id='99001';
      `);
      assert.equal((await reconcile(db, rounds.previous)).ok, true);
      assert.equal(await state(db, rounds.previous), "SETTLED");
      assert.equal(Number((await db.query("select gameweek_score from public.touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1", [ids.confirmed])).rows[0].gameweek_score), 77);
    } finally { await db.close(); }
  });
}

for (const invalidLineup of ["coach-null", "ten-selections"] as const) {
  test(`real SQL cannot report successful reconciliation or prepare carry for ${invalidLineup}`, { skip: !modulePath }, async () => {
    const db = await makeDatabase();
    try {
      const rounds = await seed(db);
      await writeStatistics(db, true);
      await db.query(invalidLineup === "coach-null"
        ? "update public.touchline_fantasy_user_gameweeks set selected_coach_id=null where id=$1"
        : "delete from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id=$1 and slot_index=11", [ids.confirmed]);
      const result = await reconcile(db, rounds.previous);
      assert.equal(result.ok, false);
      assert.equal(result.reason, "confirmed-lineup-not-locked");
      assert.notEqual(await state(db, rounds.previous), "SETTLED");
      assert.equal((await db.query("select * from public.touchline_fantasy_locked_selections where user_gameweek_id=$1", [ids.confirmed])).rows.length, 0);
      assert.equal((await db.query("select state from public.touchline_fantasy_user_gameweeks where id=$1", [ids.confirmed])).rows[0].state, "CONFIRMED");
      await assert.rejects(db.query("select public.touchline_fantasy_prepare_user_gameweek($1,$2)", [ids.owner, rounds.next]), /TL_FANTASY_PREDECESSOR_NOT_LOCKED/);
      assert.equal((await db.query("select * from public.touchline_fantasy_user_gameweeks where user_id=$1 and gameweek_id=$2", [ids.owner, rounds.next])).rows.length, 0);
    } finally { await db.close(); }
  });
}

test("real SQL persists a settled round's pending correction and retries without another incoming fixture", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const rounds = await seed(db);
    await writeStatistics(db, true);
    assert.equal((await reconcile(db, rounds.previous)).ok, true);
    assert.equal(await state(db, rounds.previous), "SETTLED");
    const customerTables = new Set([
      "touchline_fantasy_user_gameweeks", "touchline_fantasy_user_gameweek_selections",
      "touchline_fantasy_locked_selections", "touchline_fantasy_user_gameweek_scores",
    ]);
    const customerBefore = (await storedRows(db)).filter((entry) => customerTables.has(entry.table));
    const score = async () => Number((await db.query("select gameweek_score from public.touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1", [ids.confirmed])).rows[0].gameweek_score);
    assert.equal(await score(), 77);
    // A new final feed was observed, but its statistics producer has not yet
    // succeeded. No fixture status/write is needed to represent this correction.
    await db.exec("update public.football_fantasy_fixture_feeds set last_synced_at=clock_timestamp() where provider_fixture_id='99001'");
    const pending = await reconcile(db, rounds.previous);
    assert.equal(pending.ok, true);
    assert.equal(pending.pendingStatistics, true);
    assert.equal(await state(db, rounds.previous), "FINAL", "Pending source corrections must leave SETTLED's filtered-out state durably");
    assert.equal(await score(), 77, "Keep the previously published score while its replacement is unavailable");
    assert.deepEqual((await storedRows(db)).filter((entry) => customerTables.has(entry.table)), customerBefore, "Marking a retry must not alter customer XI, drafts or the previous score");
    await db.exec(`update public.football_player_fixture_statistics stats
      set rating=8,source_synced_at=feed.last_synced_at
      from public.football_fantasy_fixture_feeds feed
      where stats.fixture_id='${ids.fixture}' and feed.provider_fixture_id='99001'`);
    // The next worker can discover this round through pending states alone;
    // the original provider fixture does not need to appear in live scores again.
    const retry = await db.query<{ id: string }>("select id from public.touchline_fantasy_gameweeks where state in ('LOCKED','LIVE','FINAL') order by gameweek_number");
    assert.deepEqual(retry.rows.map((row) => row.id), [rounds.previous]);
    assert.equal((await reconcile(db, retry.rows[0].id)).ok, true);
    assert.equal(await state(db, rounds.previous), "SETTLED");
    assert.equal(await score(), 88, "Eleven updated ratings of eight replace the previous total");
    const unchangedTables = new Set([...customerTables].filter((table) => table !== "touchline_fantasy_user_gameweek_scores"));
    assert.deepEqual((await storedRows(db)).filter((entry) => unchangedTables.has(entry.table)), customerBefore.filter((entry) => unchangedTables.has(entry.table)));
  } finally { await db.close(); }
});

test("real SQL read-only discovery recovers a correction lost before the first reconciliation RPC", { skip: !modulePath }, async () => {
  const db = await makeDatabase();
  try {
    const rounds = await seed(db);
    await writeStatistics(db, true);
    await reconcile(db, rounds.previous);
    const discover = async (season = ids.season) => (await db.query<{ id: string; state: string }>("select * from public.touchline_fantasy_pending_gameweeks($1)", [season])).rows;
    assert.deepEqual(await discover(), [], "A source-consistent settled round needs no replay");
    // Models transport/read failure before the original reconciliation RPC:
    // source and stats commit, but no call has marked the round FINAL.
    await db.exec(`
      update public.football_fantasy_fixture_feeds set last_synced_at=clock_timestamp() where provider_fixture_id='99001';
      update public.football_player_fixture_statistics stats set rating=8,source_synced_at=feed.last_synced_at
        from public.football_fantasy_fixture_feeds feed where stats.fixture_id='${ids.fixture}' and feed.provider_fixture_id='99001';
    `);
    assert.equal(await state(db, rounds.previous), "SETTLED");
    assert.equal(Number((await db.query("select gameweek_score from public.touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1", [ids.confirmed])).rows[0].gameweek_score), 77);
    const beforeDiscovery = await storedRows(db);
    const candidates = await discover();
    assert.deepEqual(candidates, [{ id: rounds.previous, state: "SETTLED" }], "Discovery must compare persisted source/score versions, not the next run's empty incoming fixture list");
    assert.deepEqual(await discover(), candidates, "Repeated read-only discovery cannot consume pending work");
    assert.deepEqual(await discover(id(999)), [], "A non-active season cannot be reconciled through this discovery API");
    assert.deepEqual(await storedRows(db), beforeDiscovery, "Discovery must not mutate gameweeks, scores, customer rows or audit events");
    assert.equal((await reconcile(db, candidates[0].id)).ok, true);
    assert.equal(Number((await db.query("select gameweek_score from public.touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1", [ids.confirmed])).rows[0].gameweek_score), 88);
    assert.deepEqual(await discover(), []);
    // A missing Fantasy score is also a divergence even when raw stats/feed
    // timestamps already match. Do not silently accept incomplete projection.
    await db.query("delete from public.touchline_fantasy_player_fixture_scores where player_id=$1", [id(101)]);
    assert.deepEqual(await discover(), [{ id: rounds.previous, state: "SETTLED" }]);
    await reconcile(db, rounds.previous);
    assert.deepEqual(await discover(), []);
    // A newer feed awaiting its statistics must be visible before any writer
    // gets a chance to materialize the durable FINAL marker.
    await db.exec("update public.football_fantasy_fixture_feeds set last_synced_at=clock_timestamp() where provider_fixture_id='99001'");
    assert.deepEqual(await discover(), [{ id: rounds.previous, state: "SETTLED" }]);
    await reconcile(db, rounds.previous);
    assert.deepEqual(await discover(), [{ id: rounds.previous, state: "FINAL" }]);
  } finally { await db.close(); }
});

async function lifecycleDefinitions(db: Database) {
  return (await db.query(`select proname,pg_get_functiondef(oid) as definition,prosecdef,proconfig,proacl::text as acl,
    has_function_privilege('anon',oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',oid,'EXECUTE') as authenticated_execute,
    has_function_privilege('service_role',oid,'EXECUTE') as service_execute
    from pg_proc where oid in (
      'public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure,
      'public.touchline_fantasy_reconcile_gameweek(uuid)'::regprocedure,
      'public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure
    ) order by proname`)).rows;
}

async function storedRows(db: Database) {
  const tables = (await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const snapshot: Array<{ table: string; rows: Row[] }> = [];
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z_]+$/);
    snapshot.push({ table: tablename, rows: (await db.query(`select to_jsonb(row) as row from public.${tablename} row order by to_jsonb(row)::text`)).rows });
  }
  return snapshot;
}

test("real migration and rollback preserve all fixture/customer rows, ACLs and exact predecessor definitions", { skip: !modulePath }, async () => {
  let definitionsBefore: Row[] = [];
  let rowsBefore: Awaited<ReturnType<typeof storedRows>> = [];
  const db = await makeDatabase(async (before) => {
    await seed(before);
    definitionsBefore = await lifecycleDefinitions(before);
    rowsBefore = await storedRows(before);
  });
  try {
    const definitionsAfter = await lifecycleDefinitions(db);
    assert.equal(definitionsAfter.length, 3);
    assert.deepEqual(await storedRows(db), rowsBefore, "Installing the function-only correction must not reconcile customer data");
    for (const [index, definition] of definitionsAfter.entries()) {
      assert.notEqual(definition.definition, definitionsBefore[index].definition);
      assert.equal(definition.prosecdef, true);
      assert.deepEqual(definition.proconfig, definitionsBefore[index].proconfig);
      assert.equal(definition.acl, definitionsBefore[index].acl);
      assert.equal(definition.anon_execute, false);
      assert.equal(definition.authenticated_execute, false);
      assert.equal(definition.service_execute, true);
    }
    const discoveryDefinition = (await db.query(`select provolatile,prosecdef,proconfig,
      has_function_privilege('anon',oid,'EXECUTE') as anon_execute,
      has_function_privilege('authenticated',oid,'EXECUTE') as authenticated_execute,
      has_function_privilege('service_role',oid,'EXECUTE') as service_execute
      from pg_proc where oid='public.touchline_fantasy_pending_gameweeks(uuid)'::regprocedure`)).rows[0];
    assert.equal(discoveryDefinition.provolatile, "s", "Read-only discovery must be declared STABLE");
    assert.equal(discoveryDefinition.prosecdef, true);
    assert.deepEqual(discoveryDefinition.proconfig, definitionsAfter[0].proconfig);
    assert.equal(discoveryDefinition.anon_execute, false);
    assert.equal(discoveryDefinition.authenticated_execute, false);
    assert.equal(discoveryDefinition.service_execute, true);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(db.query("select * from public.touchline_fantasy_pending_gameweeks($1)", [ids.season]), /permission denied for function touchline_fantasy_pending_gameweeks/);
      } finally { await db.exec("reset role"); }
    }
    await db.exec(await readFile(new URL("../supabase/qa/056_touchline_fantasy_safe_rollover_settlement_rollback.sql", import.meta.url), "utf8"));
    assert.deepEqual(await lifecycleDefinitions(db), definitionsBefore, "Rollback must restore pg_get_functiondef byte-for-byte, including ACL and search_path metadata");
    assert.equal((await db.query("select to_regprocedure('public.touchline_fantasy_pending_gameweeks(uuid)') as discovery")).rows[0].discovery, null, "Rollback must remove the added discovery API");
    assert.deepEqual(await storedRows(db), rowsBefore);
    const successor = await sql("20260920153000_touchline_fantasy_safe_rollover_settlement");
    await db.exec(successor);
    assert.deepEqual(await lifecycleDefinitions(db), definitionsAfter);
    assert.deepEqual(await storedRows(db), rowsBefore);
    await assert.rejects(db.exec(successor), /TL_FANTASY_LIFECYCLE_SOURCE_MISMATCH/);
    await db.exec("rollback");
    assert.deepEqual(await lifecycleDefinitions(db), definitionsAfter, "A repeated/source-mismatched migration must fail atomically");
    assert.deepEqual(await storedRows(db), rowsBefore);
  } finally { await db.close(); }
});
