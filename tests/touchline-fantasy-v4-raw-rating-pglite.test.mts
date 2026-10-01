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
const baseline = process.env.TOUCHLINE_FANTASY_V4_RAW_BASELINE === "1";
const rawCandidate = "20261001090049_touchline_fantasy_v4_raw_rating_transition";
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
    await db.exec(base.split("\n").filter(line =>
      /^(?:alter table public\.touchline_fantasy_\w+ enable row level security;|revoke all on table public\.touchline_fantasy_|grant .* on table public\.touchline_fantasy_)/.test(line)).join("\n"));
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
    const initial = await sql("001_initial_schema");
    const touchStart = initial.indexOf("create or replace function public.touch_updated_at()");
    await db.exec(initial.slice(touchStart, initial.indexOf("$$;", touchStart) + 3));
    const qa = (name: string) => readFile(new URL(`../supabase/qa/${name}.sql`, import.meta.url), "utf8");
    const tracking = await qa("001_touchline_qa_fixture_tracking");
    const targetStart = tracking.indexOf("create or replace function public.touchline_assert_qa_fixture_target(");
    await db.exec(tracking.slice(targetStart, tracking.indexOf("\n$$;", targetStart) + 4));
    await db.exec(actualTable(await sql("048_touchline_player_season_statistics_read_model"), "football_player_season_statistics"));
    await db.exec(await sql("020_touchline_card_ranking_snapshots"));
    const v2 = await qa("017_touchline_qa_score_points_engine_v2");
    await db.exec(v2.slice(v2.indexOf("alter table public.football_player_season_statistics"),v2.indexOf("alter table public.touchline_coach_contracts")));
    const completion = await qa("023_touchline_qa_ranking_completion");
    await db.exec(completion.slice(completion.indexOf("alter table public.football_player_season_statistics"),completion.indexOf("create or replace function public.publish_touchline_card_ranking_snapshot")));
    await db.exec(await sql("20260823192827_touchline_player_score_engine_v3"));
    await db.exec(await sql("20261001085331_touchline_player_score_v4_storage"));
    if (beforeCandidate) await beforeCandidate(db);
    await db.exec(await sql(candidate));
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

async function rawSeed(db: Database) {
  const gameweek = await seed(db);
  // Synthetic old materialization of the retired bonus: rating10 x2 =20.
  await db.query(`update public.touchline_fantasy_player_fixture_scores set goals=3,
    hat_trick_multiplier=2,fantasy_contribution=20 where player_id=$1`, [PLAYER]);
  await db.exec(`insert into public.touchline_player_fixture_score_settlements
    (football_player_id,fixture_id,competition_id,season_id,club_id,scoring_version,appearance_status,
      minutes_played,rating,touchline_points,statistics_payload,scoring_coverage_status,
      ranking_coverage_status,settlement_status,source_synced_at)
    select football_player_id,fixture_id,competition_id,season_id,club_id,'player_scoring_v4',appearance_status,
      minutes_played,rating,rating,statistics_payload,scoring_coverage_status,
      ranking_coverage_status,settlement_status,source_synced_at
    from public.touchline_player_fixture_score_settlements where scoring_version='player_scoring_v3'`);
  return gameweek;
}
async function install(db: Database) {
  if (!baseline) await db.exec((await sql(rawCandidate)).replace(/^begin;$/m,"").replace(/^commit;\s*$/m,""));
}
async function addLockedUser(db: Database, gameweek: string) {
  await db.exec(`insert into public.users values ('${ids.owner}');`);
  await db.query(`insert into public.touchline_fantasy_user_gameweeks
    (id,user_id,gameweek_id,formation_code,state,budget_eur_snapshot,max_players_per_club_snapshot,total_market_value_eur)
    values ($1,$2,$3,'4-4-2','FINAL',1000000,11,0)`, [ids.confirmed,ids.owner,gameweek]);
  await db.query(`insert into public.touchline_fantasy_locked_selections
    (user_gameweek_id,slot_id,slot_index,formation_role,player_id,club_id,position_bucket,market_value_eur,locked_at)
    values ($1,'GK',1,'goalkeeper',$2,$3,'goalkeeper',0,now())`, [ids.confirmed,PLAYER,ids.home]);
  await db.query(`insert into public.touchline_fantasy_user_gameweek_scores
    (user_gameweek_id,gameweek_score,settlement_status,checksum) values ($1,20,'FINAL','old-bonus')`, [ids.confirmed]);
}

test("Fantasy raw-rating transition executes atomically against real SQL", {skip:!modulePath}, async t => {
  const db=await makeDatabase();
  async function scenario(name: string, body: (gameweek:string)=>Promise<void>) {
    await t.test(name,async()=>{
      await db.exec("begin");
      try { await body(await rawSeed(db)); }
      finally { await db.exec("rollback"); }
    });
  }
  try {
    await scenario("same facts and timestamps: old20 becomes raw10 without requiring a selected XI",async gameweek=>{
      const sourceBefore=await legacy(db);
      const settlementsBefore=(await db.query("select to_jsonb(s) as row from public.touchline_player_fixture_score_settlements s order by scoring_version,football_player_id")).rows;
      await install(db);
      const row=(await scores(db)).find(row=>row.player_id===PLAYER)!;
      assert.equal(Number(row.fantasy_contribution),10);
      assert.equal(row.hat_trick_multiplier,1);
      assert.equal(row.goals,3);
      assert.deepEqual(await legacy(db),sourceBefore);
      assert.deepEqual((await db.query("select to_jsonb(s) as row from public.touchline_player_fixture_score_settlements s order by scoring_version,football_player_id")).rows,settlementsBefore);
      assert.deepEqual(await discover(db),[]);
      const again=await reconcile(db,gameweek);
      assert.equal(again.playerFixtureRowsChanged,0);
      assert.equal(again.userScoresChanged,0);
    });
    await scenario("durable private beforeimages retain retired score and unchanged identities",async gameweek=>{
      const before=await scores(db);
      await install(db);
      const receipts=(await db.query<{metadata:Row}>(`select metadata from public.touchline_fantasy_audit_events
        where gameweek_id=$1 and metadata->>'operation'='player_rating_v4_transition' order by metadata->>'phase'`,[gameweek])).rows;
      assert.equal(receipts.length,2);
      const pre=receipts.find(row=>row.metadata.phase==="before")!;
      assert.deepEqual(pre.metadata.playerFixtureScores,before);
      assert.equal(pre.metadata.scoringVersion,"player_scoring_v4");
      assert.equal((receipts.find(row=>row.metadata.phase==="after")!.metadata.reconcileResult as Row).playerFixtureRowsChanged,1);
    });
    await scenario("locked XI stays immutable; user total is recalculated from raw rating",async gameweek=>{
      await addLockedUser(db,gameweek);
      const xi=(await db.query("select to_jsonb(t) as row from public.touchline_fantasy_locked_selections t")).rows;
      await install(db);
      assert.deepEqual((await db.query("select to_jsonb(t) as row from public.touchline_fantasy_locked_selections t")).rows,xi);
      assert.equal(Number((await db.query("select gameweek_score from public.touchline_fantasy_user_gameweek_scores")).rows[0].gameweek_score),10);
    });
    await scenario("DNP and missing-rating retain separate zero/null semantics",async()=>{
      await install(db);
      const rows=await scores(db);
      for (const player of [DNP,NO_RATING]) {
        const row=rows.find(row=>row.player_id===player)!;
        assert.equal(row.rating,null);
        assert.equal(Number(row.fantasy_contribution),0);
        assert.equal(row.hat_trick_multiplier,1);
      }
      assert.equal(rows.find(row=>row.player_id===DNP)!.reason_code,"DID_NOT_PLAY");
      assert.equal(rows.find(row=>row.player_id===NO_RATING)!.reason_code,"NO_PROVIDER_RATING");
    });
    await scenario("post-transition same-timestamp raw rating drift is discovered and remains decimal",async gameweek=>{
      await install(db);
      await db.query(`update public.touchline_player_fixture_score_settlements set rating=8.09,touchline_points=8.09
        where football_player_id=$1 and scoring_version='player_scoring_v4'`,[PLAYER]);
      assert.deepEqual(await discover(db),[{id:gameweek,state:"SETTLED"}]);
      await reconcile(db,gameweek);
      assert.equal(Number((await scores(db)).find(row=>row.player_id===PLAYER)!.fantasy_contribution),8.09);
    });
    for (const [name,change,expected] of [
      ["missing V4 peer",`delete from public.touchline_player_fixture_score_settlements where scoring_version='player_scoring_v4' and football_player_id='${PLAYER}'`,"TL_FANTASY_V4"],
      ["provisional V4 facts",`update public.touchline_player_fixture_score_settlements set settlement_status='provisional' where scoring_version='player_scoring_v4'`,"TL_FANTASY_V4"],
      ["source timestamp drift",`update public.touchline_player_fixture_score_settlements set source_synced_at=source_synced_at-interval '1 second' where scoring_version='player_scoring_v4'`,"TL_FANTASY_V4"],
      ["nonfinal source feed",`update public.football_fantasy_fixture_feeds set fixture_payload='{"status":"LIVE"}'`,"TL_FANTASY_V4"],
      ["wrong source identity",`update public.football_players set provider='other' where id='${PLAYER}'`,"TL_FANTASY_V4"],
      ["historical materialized scope",`insert into public.football_seasons values ('${id(500)}'); update public.touchline_fantasy_gameweeks set season_id='${id(500)}' where round_id='${ids.previousRound}'`,"TL_FANTASY_V4_HISTORICAL_SCOPE_NEEDS_VERSIONING"],
    ]) await scenario(`rejects ${name} and restores ALL rows/functions after rollback`,async()=>{
      await db.exec(change);
      const before=await rollbackRows(db);
      const functions=await functionSnapshots(db);
      await db.exec("savepoint rejected_transition");
      await assert.rejects(install(db),new RegExp(expected));
      await db.exec("rollback to savepoint rejected_transition");
      assert.deepEqual(await rollbackRows(db),before);
      assert.deepEqual(await functionSnapshots(db),functions);
    });
    await scenario("function ACLs/search path and complete transition rollback are preserved",async()=>{
      const before=await rollbackRows(db);
      const functions=await functionSnapshots(db);
      await db.exec("savepoint complete_transition");
      await install(db);
      const after=await functionSnapshots(db);
      assert.deepEqual(after.map(({definition: _definition,...rest})=>rest),functions.map(({definition: _definition,...rest})=>rest));
      assert.ok(after.every(row=>JSON.stringify(row.proconfig)===JSON.stringify(['search_path=""'])));
      await db.exec("rollback to savepoint complete_transition");
      assert.deepEqual(await rollbackRows(db),before);
      assert.deepEqual(await functionSnapshots(db),functions);
    });
    await scenario("audit beforeimages remain inaccessible to public roles",async()=>{
      await install(db);
      assert.deepEqual((await db.query(`select
        has_table_privilege('anon','public.touchline_fantasy_audit_events','SELECT') as anon,
        has_table_privilege('authenticated','public.touchline_fantasy_audit_events','SELECT') as authenticated,
        has_table_privilege('service_role','public.touchline_fantasy_audit_events','SELECT') as service,
        (select relrowsecurity from pg_class where oid='public.touchline_fantasy_audit_events'::regclass) as rls`)).rows,
      [{anon:false,authenticated:false,service:true,rls:true}]);
    });
    await scenario("mixed LIVE and scheduled fixtures do not require future statistics",async gameweek=>{
      await db.query("update public.football_fixtures set status='LIVE' where id=$1",[ids.fixture]);
      await db.query("update public.football_fixtures set round_id=$1 where id=$2",[ids.previousRound,ids.nextFixture]);
      await db.query("update public.touchline_fantasy_gameweeks set state='LIVE' where id=$1",[gameweek]);
      await addLockedUser(db,gameweek);
      await install(db);
      assert.equal(Number((await scores(db)).find(row=>row.player_id===PLAYER)!.fantasy_contribution),10);
      assert.equal((await db.query("select state from public.touchline_fantasy_gameweeks where id=$1",[gameweek])).rows[0].state,"LIVE");
      assert.equal((await db.query("select count(*)::int as n from public.touchline_fantasy_player_fixture_scores where fixture_id=$1",[ids.nextFixture])).rows[0].n,0);
    });
    await scenario("post-transition inverse missing V4 source blocks partial resettlement",async gameweek=>{
      await install(db);
      const before=await scores(db);
      await db.query("delete from public.touchline_player_fixture_score_settlements where football_player_id=$1 and scoring_version='player_scoring_v4'",[DNP]);
      assert.equal((await reconcile(db,gameweek)).pendingStatistics,true);
      assert.deepEqual(await scores(db),before);
    });
    await scenario("new writes cannot reintroduce the retired multiplier or contribution",async()=>{
      await install(db);
      await assert.rejects(db.query("update public.touchline_fantasy_player_fixture_scores set hat_trick_multiplier=2,fantasy_contribution=20 where player_id=$1",[PLAYER]),(e:{code?:string})=>e.code==="23514");
    });
  } finally { await db.close(); }
});
