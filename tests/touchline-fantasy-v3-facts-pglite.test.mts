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
const baseline = process.env.TOUCHLINE_FANTASY_V3_FACTS_BASELINE === "1";
const candidate = "20261001065736_touchline_fantasy_v3_football_facts";
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

type FunctionSnapshot = Row & { definition: string };
async function functionSnapshots(db: Database) {
  return (await db.query<FunctionSnapshot>(`select proname,pg_get_functiondef(oid) as definition,
    proacl::text as acl,proconfig,prosecdef,provolatile,pg_get_userbyid(proowner) as owner
    from pg_proc where oid in (
      'public.touchline_fantasy_reconcile_gameweek(uuid)'::regprocedure,
      'public.touchline_fantasy_pending_gameweeks(uuid)'::regprocedure
    ) order by proname`)).rows;
}

async function rollbackRows(db: Database) {
  const result: Record<string, Row[]> = {};
  for (const table of [
    "football_players", "football_fixtures", "football_fantasy_fixture_feeds",
    "football_player_fixture_statistics", "touchline_player_fixture_score_settlements",
    "touchline_fantasy_configs", "touchline_fantasy_gameweeks", "touchline_fantasy_user_gameweeks",
    "touchline_fantasy_user_gameweek_selections", "touchline_fantasy_locked_selections",
    "touchline_fantasy_player_fixture_scores", "touchline_fantasy_user_gameweek_scores", "touchline_fantasy_audit_events",
  ]) {
    result[table] = (await db.query(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows;
  }
  return result;
}

async function makeDatabase(beforeCandidate?: (db: Database) => Promise<void>): Promise<Database> {
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
    await db.exec(await sql("20260920153000_touchline_fantasy_safe_rollover_settlement"));
    await db.exec(actualTable(await sql("20260823192827_touchline_player_score_engine_v3"), "touchline_player_fixture_score_settlements"));
    if (beforeCandidate) await beforeCandidate(db);
    if (!baseline) await db.exec(await sql(candidate));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}


const PLAYER = id(101);
const DNP = id(102);
const NO_RATING = id(103);
const SOURCE_TIME = "2026-09-01T12:00:00Z";

async function seed(db: Database) {
  await db.exec(`
    insert into public.football_competitions values ('${ids.competition}');
    insert into public.football_seasons values ('${ids.season}');
    insert into public.football_clubs values ('${ids.home}','sportmonks','900'), ('${ids.away}','sportmonks','901');
    insert into public.football_players values
      ('${PLAYER}','sportmonks','9001'), ('${DNP}','sportmonks','9002'), ('${NO_RATING}','sportmonks','9003');
    insert into public.touchline_fantasy_configs
      (competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values ('england','${ids.competition}','${ids.season}',2990,'GBP',1000000,11);
    insert into public.football_rounds values
      ('${ids.previousRound}','${ids.competition}','${ids.season}','Gameweek 1'),
      ('${ids.nextRound}','${ids.competition}','${ids.season}','Gameweek 2');
    insert into public.football_fixtures
      (id,round_id,competition_id,season_id,provider,provider_fixture_id,starts_at,status,home_club_id,away_club_id,finalized_at,source_updated_at)
      values
      ('${ids.fixture}','${ids.previousRound}','${ids.competition}','${ids.season}','sportmonks','99001',
        clock_timestamp()-interval '2 hours','FT','${ids.home}','${ids.away}',clock_timestamp()-interval '5 minutes','${SOURCE_TIME}'),
      ('${ids.nextFixture}','${ids.nextRound}','${ids.competition}','${ids.season}','sportmonks','99002',
        clock_timestamp()+interval '1 day','NS','${ids.home}','${ids.away}',null,null);
    insert into public.football_fantasy_fixture_feeds
      (provider,provider_fixture_id,fixture_payload,lineups_payload,formations_payload,sidelined_payload,events_payload,last_synced_at)
      values ('sportmonks','99001','{"status":"FT"}','[{"playerId":"9001","teamId":"900"}]','[]','[]','[]','${SOURCE_TIME}');
    select public.touchline_fantasy_sync_gameweeks();
    insert into public.football_player_fixture_statistics
      (football_player_id,fixture_id,competition_id,season_id,club_id,appearance_status,minutes_played,rating,statistics_payload,source_synced_at)
      values
      ('${PLAYER}','${ids.fixture}','${ids.competition}','${ids.season}','${ids.home}','started',90,10,'{"goals":2}','${SOURCE_TIME}'),
      ('${DNP}','${ids.fixture}','${ids.competition}','${ids.season}','${ids.home}','unused',0,null,'{}','${SOURCE_TIME}'),
      ('${NO_RATING}','${ids.fixture}','${ids.competition}','${ids.season}','${ids.home}','substitute',10,null,'{}','${SOURCE_TIME}');
    insert into public.touchline_player_fixture_score_settlements
      (football_player_id,fixture_id,competition_id,season_id,club_id,scoring_version,appearance_status,
       minutes_played,rating,touchline_points,statistics_payload,scoring_coverage_status,ranking_coverage_status,settlement_status,source_synced_at)
      select football_player_id,fixture_id,competition_id,season_id,club_id,'player_scoring_v3',appearance_status,
        minutes_played,rating,case when rating is null then null else 12 end,
        case when football_player_id='${PLAYER}' then '{"goals":3}'::jsonb else '{"goals":null}'::jsonb end,
        case when rating is null then 'unavailable' else 'complete' end,
        case when appearance_status='unused' then 'complete_for_scoring'
          when rating is null then 'blocking_partial' else 'complete' end,
        'final',source_synced_at
      from public.football_player_fixture_statistics;
    insert into public.touchline_fantasy_player_fixture_scores
      (gameweek_id,player_id,fixture_id,appearance_status,participation_status,rating,goals,
       hat_trick_multiplier,fantasy_contribution,reason_code,settlement_status,source_synced_at)
      select gameweek.id,stats.football_player_id,stats.fixture_id,stats.appearance_status,
        case when stats.appearance_status='unused' then 'did_not_play'
          when stats.rating is null then 'no_provider_rating' else 'rated_appearance' end,
        stats.rating,case when stats.rating is null then 0 else 2 end,1,coalesce(stats.rating,0),
        case when stats.appearance_status='unused' then 'DID_NOT_PLAY'
          when stats.rating is null then 'NO_PROVIDER_RATING' else 'RATED_APPEARANCE' end,
        'FINAL',stats.source_synced_at
      from public.football_player_fixture_statistics stats
      join public.touchline_fantasy_gameweeks gameweek on gameweek.round_id='${ids.previousRound}';
    update public.touchline_fantasy_gameweeks set state='SETTLED' where round_id='${ids.previousRound}';
  `);
  return (await db.query<{ id: string }>("select id from public.touchline_fantasy_gameweeks where round_id=$1", [ids.previousRound])).rows[0].id;
}
const discover = async (db: Database) => (await db.query("select * from public.touchline_fantasy_pending_gameweeks($1)", [ids.season])).rows;
const reconcile = async (db: Database, gameweek: string) =>
  (await db.query<{ result: Row }>("select public.touchline_fantasy_reconcile_gameweek($1) as result", [gameweek])).rows[0].result;
const scores = async (db: Database) => (await db.query<{ row: Row }>(
  "select to_jsonb(s) as row from public.touchline_fantasy_player_fixture_scores s order by player_id",
)).rows.map(({ row }) => row);
const legacy = async (db: Database) => (await db.query(
  "select football_player_id,md5(to_jsonb(s)::text) as hash from public.football_player_fixture_statistics s order by football_player_id",
)).rows;

test("Fantasy V3 facts migration executes real SQL with one isolated engine", { skip: !modulePath }, async (t) => {
  let predecessorFunctions: FunctionSnapshot[] = [];
  const db = await makeDatabase(async (database) => {
    predecessorFunctions = await functionSnapshots(database);
    assert.equal(predecessorFunctions.length, 2);
  });
  async function scenario(name: string, body: (gameweek: string) => Promise<void>) {
    await t.test(name, async () => {
      await db.exec("begin");
      try { await body(await seed(db)); }
      finally { await db.exec("rollback"); }
    });
  }
  try {
    await scenario("RED regression: same-timestamp 2 legacy / 3 V3 goals is discovered without any users", async (gameweek) => {
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_locked_selections")).rows[0].n, 0);
      assert.equal((await db.query("select count(*)::int as n from public.users")).rows[0].n, 0);
      assert.deepEqual(await discover(db), [{ id: gameweek, state: "SETTLED" }]);
    });
    await scenario("V3 facts produce 20, preserve V2 history and V3 band 12, and second pass changes zero scores", async (gameweek) => {
      const old = await legacy(db);
      const result = await reconcile(db, gameweek);
      assert.equal(result.playerFixtureRowsChanged, 1);
      assert.equal(result.userScoresChanged, 0);
      const after = await scores(db);
      assert.equal(after[0].goals, 3);
      assert.equal(after[0].rating, 10);
      assert.equal(after[0].hat_trick_multiplier, 2);
      assert.equal(after[0].fantasy_contribution, 20);
      assert.equal(after[0].settlement_status, "FINAL");
      assert.deepEqual(await legacy(db), old);
      assert.equal((await db.query("select touchline_points from public.touchline_player_fixture_score_settlements where football_player_id=$1", [PLAYER])).rows[0].touchline_points, 12);
      assert.deepEqual(await discover(db), []);
      const repeat = await reconcile(db, gameweek);
      assert.equal(repeat.playerFixtureRowsChanged, 0);
      assert.equal(repeat.userScoresChanged, 0);
      assert.deepEqual(await scores(db), after);
    });
    await scenario("DNP null goals and absent rating are zero contracts, not missing-source blockers", async (gameweek) => {
      await db.exec(`update public.touchline_fantasy_player_fixture_scores set goals=3,hat_trick_multiplier=2,fantasy_contribution=20 where player_id='${PLAYER}'`);
      assert.deepEqual(await discover(db), []);
      const result = await reconcile(db, gameweek);
      assert.notEqual(result.pendingStatistics, true);
      assert.equal(result.playerFixtureRowsChanged, 0);
      const rows = await scores(db);
      assert.equal(rows[1].goals, 0);
      assert.equal(rows[1].rating, null);
      assert.equal(rows[1].fantasy_contribution, 0);
      assert.equal(rows[1].reason_code, "DID_NOT_PLAY");
      assert.equal(rows[2].reason_code, "NO_PROVIDER_RATING");
      assert.equal(rows[2].fantasy_contribution, 0);
    });
    await scenario("source-only zero-score rows are materialized even without users", async (gameweek) => {
      await db.exec(`update public.touchline_fantasy_player_fixture_scores set goals=3,hat_trick_multiplier=2,fantasy_contribution=20 where player_id='${PLAYER}';
        delete from public.touchline_fantasy_player_fixture_scores where player_id in ('${DNP}','${NO_RATING}')`);
      assert.equal((await discover(db)).length, 1);
      const result = await reconcile(db, gameweek);
      assert.equal(result.playerFixtureRowsChanged, 2);
      assert.equal(result.userScoresChanged, 0);
      assert.equal((await scores(db)).length, 3);
      assert.deepEqual(await discover(db), []);
    });
    for (const [label, mutation] of [
      ["inverse absent source", `delete from public.touchline_player_fixture_score_settlements where football_player_id='${DNP}'`],
      ["wrong source season", `insert into public.football_seasons values ('${id(500)}'); update public.touchline_player_fixture_score_settlements set season_id='${id(500)}' where football_player_id='${DNP}'`],
      ["wrong source competition", `insert into public.football_competitions values ('${id(500)}'); update public.touchline_player_fixture_score_settlements set competition_id='${id(500)}' where football_player_id='${DNP}'`],
      ["wrong player provider", `update public.football_players set provider='other' where id='${DNP}'`],
      ["wrong fixture provider", `update public.football_fixtures set provider='other' where id='${ids.fixture}'`],
      ["provisional source", `update public.touchline_player_fixture_score_settlements set settlement_status='provisional' where football_player_id='${DNP}'`],
      ["stale source", `update public.touchline_player_fixture_score_settlements set source_synced_at=source_synced_at-interval '1 second' where football_player_id='${DNP}'`],
      ["missing feed", "delete from public.football_fantasy_fixture_feeds"],
      ["non-final feed", `update public.football_fantasy_fixture_feeds set fixture_payload='{"status":"NS"}'`],
      ["empty lineup", `update public.football_fantasy_fixture_feeds set lineups_payload='[]'`],
    ]) {
      await scenario(label + " blocks the whole resettlement, not just the bad row", async (gameweek) => {
        await db.exec(mutation);
        const before = await scores(db);
        assert.equal((await discover(db)).length, 1);
        const result = await reconcile(db, gameweek);
        assert.equal(result.pendingStatistics, true);
        assert.equal(result.playerFixtureRowsChanged, 0);
        assert.equal(result.userScoresChanged, 0);
        assert.deepEqual(await scores(db), before, "Bruno must remain unchanged too, preventing partial resettlement");
        assert.equal((await db.query("select state from public.touchline_fantasy_gameweeks where id=$1", [gameweek])).rows[0].state, "FINAL");
      });
    }
    for (const missingLockedSource of [false, true]) {
      await scenario(missingLockedSource
        ? "FINAL locked XI with neither V3 source nor existing score remains pending without changing any scores"
        : "the affected locked XI gains 10 without changing its immutable selections", async (gameweek) => {
      await db.exec(`
        insert into public.users values ('${ids.owner}');
        insert into public.football_players
          select ('10000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'sportmonks',(9000+n)::text from generate_series(4,11) n;
        insert into public.touchline_player_fixture_score_settlements
          (football_player_id,fixture_id,competition_id,season_id,club_id,scoring_version,appearance_status,minutes_played,
           statistics_payload,scoring_coverage_status,ranking_coverage_status,settlement_status,source_synced_at)
          select id,'${ids.fixture}','${ids.competition}','${ids.season}','${ids.home}','player_scoring_v3','unused',0,
            '{}','unavailable','complete_for_scoring','final','${SOURCE_TIME}'
          from public.football_players where provider_player_id::integer >= 9004;
        insert into public.touchline_fantasy_user_gameweeks
          (id,user_id,gameweek_id,formation_code,selected_coach_id,state,budget_eur_snapshot,max_players_per_club_snapshot,total_market_value_eur,confirmed_at)
          values ('${ids.confirmed}','${ids.owner}','${gameweek}','4-3-3','307','CONFIRMED',1000000,11,11000,clock_timestamp()-interval '3 hours');
        insert into public.touchline_fantasy_user_gameweek_selections
          (user_gameweek_id,slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur)
          select '${ids.confirmed}','slot-'||n,n,('10000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
            '${ids.home}',case when n=1 then 'goalkeeper' else 'midfielder' end,
            case when n=1 then 'goalkeeper' else 'midfield' end,1000 from generate_series(1,11) n;
        select public.touchline_fantasy_lock_gameweek('${gameweek}');
        insert into public.touchline_fantasy_user_gameweek_scores (user_gameweek_id,gameweek_score,settlement_status,checksum)
          values ('${ids.confirmed}',10,'FINAL','old');
      `);
      const locked = (await db.query("select to_jsonb(s) as row from public.touchline_fantasy_locked_selections s order by slot_index")).rows;
      assert.equal(locked.length, 11);
      if (missingLockedSource) {
        await db.query("delete from public.touchline_player_fixture_score_settlements where football_player_id=$1", [DNP]);
        await db.query("delete from public.touchline_fantasy_player_fixture_scores where player_id=$1", [DNP]);
        const missing = (await db.query(`select
          (select count(*)::int from public.touchline_player_fixture_score_settlements where football_player_id=$1) as sources,
          (select count(*)::int from public.touchline_fantasy_player_fixture_scores where player_id=$1) as scores`, [DNP])).rows[0];
        assert.deepEqual(missing, { sources: 0, scores: 0 }, "Only the locked-XI branch can detect this required player");
        const beforePlayers = await scores(db);
        const beforeUsers = (await db.query("select to_jsonb(s) as row from public.touchline_fantasy_user_gameweek_scores s")).rows;
        const result = await reconcile(db, gameweek);
        assert.equal(result.allFixturesFinal, true);
        assert.equal(result.pendingStatistics, true);
        assert.equal(result.playerFixtureRowsChanged, 0);
        assert.equal(result.userScoresChanged, 0);
        assert.deepEqual(await scores(db), beforePlayers);
        assert.deepEqual((await db.query("select to_jsonb(s) as row from public.touchline_fantasy_user_gameweek_scores s")).rows, beforeUsers);
        assert.deepEqual((await db.query("select to_jsonb(s) as row from public.touchline_fantasy_locked_selections s order by slot_index")).rows, locked);
        assert.equal((await db.query("select state from public.touchline_fantasy_gameweeks where id=$1", [gameweek])).rows[0].state, "FINAL");
        return;
      }
      assert.equal((await reconcile(db, gameweek)).userScoresChanged, 1);
      assert.equal(Number((await db.query("select gameweek_score from public.touchline_fantasy_user_gameweek_scores")).rows[0].gameweek_score), 20);
      assert.deepEqual((await db.query("select to_jsonb(s) as row from public.touchline_fantasy_locked_selections s order by slot_index")).rows, locked);
      assert.equal((await reconcile(db, gameweek)).userScoresChanged, 0);
      });
    }
    await scenario("mixed LIVE and scheduled fixtures update available players without inventing future stats", async (gameweek) => {
      await db.exec(`
        insert into public.users values ('${ids.owner}');
        insert into public.football_clubs values ('${id(700)}','sportmonks','902'), ('${id(701)}','sportmonks','903');
        insert into public.football_players
          select ('10000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'sportmonks',(9000+n)::text from generate_series(4,11) n;
        update public.football_fixtures set status='LIVE' where id='${ids.fixture}';
        update public.football_fixtures set round_id='${ids.previousRound}',home_club_id='${id(700)}',away_club_id='${id(701)}'
          where id='${ids.nextFixture}';
        update public.football_fantasy_fixture_feeds set fixture_payload='{"status":"LIVE"}';
        update public.touchline_player_fixture_score_settlements set settlement_status='provisional';
        update public.touchline_fantasy_gameweeks set state='LIVE' where id='${gameweek}';
        insert into public.touchline_fantasy_user_gameweeks
          (id,user_id,gameweek_id,formation_code,selected_coach_id,state,budget_eur_snapshot,max_players_per_club_snapshot,total_market_value_eur,confirmed_at)
          values ('${ids.confirmed}','${ids.owner}','${gameweek}','4-3-3','307','CONFIRMED',1000000,11,11000,clock_timestamp()-interval '3 hours');
        insert into public.touchline_fantasy_user_gameweek_selections
          (user_gameweek_id,slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur)
          select '${ids.confirmed}','slot-'||n,n,('10000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
            case when n<=3 then '${ids.home}'::uuid else '${id(700)}'::uuid end,
            case when n=1 then 'goalkeeper' else 'midfielder' end,
            case when n=1 then 'goalkeeper' else 'midfield' end,1000 from generate_series(1,11) n;
      `);
      const old = await legacy(db);
      const result = await reconcile(db, gameweek);
      assert.equal(result.ok, true);
      assert.equal(result.allFixturesFinal, false);
      assert.notEqual(result.pendingStatistics, true);
      assert.equal(result.playerFixtureRowsChanged, 3);
      assert.equal(result.userScoresChanged, 1);
      const after = await scores(db);
      assert.equal(after.length, 3, "The eight scheduled players have no source or materialized fixture score");
      assert.equal(after[0].fantasy_contribution, 20);
      assert.equal(after.every((row) => row.settlement_status === "PROVISIONAL"), true);
      const userScores = (await db.query("select to_jsonb(s) as row from public.touchline_fantasy_user_gameweek_scores s")).rows;
      assert.equal(Number((userScores[0].row as Row).gameweek_score), 20);
      assert.equal((userScores[0].row as Row).settlement_status, "PROVISIONAL");
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_locked_selections")).rows[0].n, 11);
      assert.equal((await db.query("select state from public.touchline_fantasy_gameweeks where id=$1", [gameweek])).rows[0].state, "LIVE");
      assert.deepEqual(await legacy(db), old);

      // Unlike a future player's legitimate absence, losing an existing score's
      // canonical source remains blocking even while the round is live.
      await db.query("delete from public.touchline_player_fixture_score_settlements where football_player_id=$1", [DNP]);
      const blocked = await reconcile(db, gameweek);
      assert.equal(blocked.pendingStatistics, true);
      assert.equal(blocked.playerFixtureRowsChanged, 0);
      assert.equal(blocked.userScoresChanged, 0);
      assert.deepEqual(await scores(db), after);
      assert.deepEqual((await db.query("select to_jsonb(s) as row from public.touchline_fantasy_user_gameweek_scores s")).rows, userScores);
    });
    await t.test("candidate forward and exact-predecessor rollback preserve seeded rows and ACLs transactionally", { skip: baseline }, async () => {
      const candidateFunctions = await functionSnapshots(db);
      await db.exec("begin");
      try {
        await seed(db);
        const candidateRows = await rollbackRows(db);
        assert.equal(candidateRows.touchline_fantasy_player_fixture_scores.length, 3, "Exercise populated data, not an empty-schema rollback");
        await db.exec("savepoint restore_candidate");
        for (const row of predecessorFunctions) await db.exec(`${row.definition};`);
        assert.deepEqual(await functionSnapshots(db), predecessorFunctions);
        const beforeRows = await rollbackRows(db);
        assert.deepEqual(beforeRows, candidateRows);

        // Execute the actual candidate inside this test-owned transaction. Only
        // its outer BEGIN/COMMIT are removed so the savepoint cannot be committed.
        const migration = await sql(candidate);
        assert.equal(migration.match(/^begin;$/gm)?.length, 1);
        assert.match(migration, /\ncommit;\s*$/);
        await db.exec(migration.replace(/^begin;\n/m, "").replace(/\ncommit;\s*$/, "\n"));
        assert.deepEqual(await functionSnapshots(db), candidateFunctions);
        assert.deepEqual(await rollbackRows(db), beforeRows, "Forward migration changes functions only");

        for (const row of predecessorFunctions) await db.exec(`${row.definition};`);
        assert.deepEqual(await functionSnapshots(db), predecessorFunctions, "Restore exact definitions, owner, ACL, search_path and security flags");
        assert.deepEqual(await rollbackRows(db), beforeRows, "Rollback changes no canonical, player-score or customer rows");
        await db.exec("rollback to savepoint restore_candidate");
        assert.deepEqual(await functionSnapshots(db), candidateFunctions);
        assert.deepEqual(await rollbackRows(db), candidateRows);
      } finally { await db.exec("rollback"); }
      assert.deepEqual(await functionSnapshots(db), candidateFunctions, "The test leaves the candidate installed");
    });
    await t.test("service-only ACLs and hardened search_path remain, and migration drift is rejected", async () => {
      for (const name of ["reconcile_gameweek", "pending_gameweeks"]) {
        const signature = `public.touchline_fantasy_${name}(uuid)`;
        const row = (await db.query(`select
          has_function_privilege('anon',$1,'EXECUTE') as anon,
          has_function_privilege('authenticated',$1,'EXECUTE') as customer,
          has_function_privilege('service_role',$1,'EXECUTE') as service,
          p.prosecdef, p.proconfig from pg_proc p where p.oid=$1::regprocedure`, [signature])).rows[0];
        assert.equal(row.anon, false);
        assert.equal(row.customer, false);
        assert.equal(row.service, true);
        assert.equal(row.prosecdef, true);
        assert.deepEqual(row.proconfig, ['search_path=""']);
      }
      if (!baseline) {
        await assert.rejects(db.exec(await sql(candidate)), /TL_FANTASY_V3_FACTS_SOURCE_MISMATCH/);
        await db.exec("rollback");
      }
    });
  } finally { await db.close(); }
});
