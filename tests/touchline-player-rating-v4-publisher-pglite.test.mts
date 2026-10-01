import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { auditTouchlineRankingDraft, buildSportmonksRankingDraft } from "../lib/touchlineArena/card-ranking-pipeline.ts";
import { buildTouchlineRankingPersistenceRecord } from "../lib/touchlineArena/card-ranking-persistence.ts";
import { buildTouchlineSelection } from "../lib/touchlineArena/touchline-selection.ts";

// Synthetic local PostgreSQL only. Real ranking/storage DDL and publisher;
// reduced canonical identity parents. No remote connection or provider data.
const modulePath = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const baseline = process.env.TOUCHLINE_V4_PUBLISHER_BASELINE === "1";
const migration = "20261001085725_touchline_player_rating_v4_publisher";
type Row = Record<string, unknown>;
type DB = { exec(s: string): Promise<unknown>; query<T extends Row = Row>(s: string, p?: unknown[]): Promise<{ rows: T[] }>; close(): Promise<void> };
const read = (p: string) => readFile(new URL(`../supabase/${p}.sql`, import.meta.url), "utf8");
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function table(s: string, name: string) {
  const start=s.indexOf(`create table if not exists public.${name} (`), end=s.indexOf("\n);",start);
  assert.ok(start>=0 && end>start); return s.slice(start,end+3);
}
async function database(): Promise<DB> {
  const { PGlite }=await import(modulePath!); const db: DB=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
      create table public.football_competitions(id uuid primary key,provider text,provider_competition_id text);
      create table public.football_seasons(id uuid primary key,provider text,competition_id uuid);
      create table public.football_clubs(id uuid primary key);
      create table public.football_players(id uuid primary key,provider text,provider_player_id text);
      create table public.football_fixtures(id uuid primary key,provider text,provider_fixture_id text,season_id uuid,competition_id uuid);`);
    const initial=await read("migrations/001_initial_schema");
    const start=initial.indexOf("create or replace function public.touch_updated_at()");
    await db.exec(initial.slice(start,initial.indexOf("$$;",start)+3));
    const target=await read("qa/001_touchline_qa_fixture_tracking");
    const targetStart=target.indexOf("create or replace function public.touchline_assert_qa_fixture_target(");
    await db.exec(target.slice(targetStart,target.indexOf("\n$$;",targetStart)+4));
    await db.exec(table(await read("migrations/048_touchline_player_season_statistics_read_model"),"football_player_season_statistics"));
    await db.exec(await read("migrations/020_touchline_card_ranking_snapshots"));
    const v2=await read("qa/017_touchline_qa_score_points_engine_v2");
    await db.exec(v2.slice(v2.indexOf("alter table public.football_player_season_statistics"),v2.indexOf("alter table public.touchline_coach_contracts")));
    const coverage=await read("qa/023_touchline_qa_ranking_completion");
    await db.exec(coverage.slice(coverage.indexOf("alter table public.football_player_season_statistics"),coverage.indexOf("create or replace function public.publish_touchline_card_ranking_snapshot")));
    await db.exec(await read("migrations/20260823192827_touchline_player_score_engine_v3"));
    await db.exec(await read("migrations/20261001085331_touchline_player_score_v4_storage"));
    if (!baseline) await db.exec(await read(`migrations/${migration}`));
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    return db;
  } catch(e) { await db.close(); throw e; }
}
async function seed(db: DB) {
  await db.exec(`insert into public.football_competitions values('${id(1)}','sportmonks','8');
    insert into public.football_seasons values('${id(2)}','sportmonks','${id(1)}');
    insert into public.football_fixtures values('${id(3)}','sportmonks','91','${id(2)}','${id(1)}'),('${id(4)}','sportmonks','92','${id(2)}','${id(1)}');`);
  const players=Array.from({length:11},(_,i)=>({playerId:id(100+i),providerPlayerId:String(100+i),provider:"sportmonks",verified:true,totalRating:16.18,sourceFixtureIds:["91","92"]}));
  for (const p of players) {
    await db.query("insert into public.football_players values($1,'sportmonks',$2)",[p.playerId,p.providerPlayerId]);
    await db.query(`insert into public.football_player_season_statistics
      (football_player_id,competition_id,season_id,provider,provider_player_id,coverage_status,expected_fixture_count,synchronized_fixture_count,expected_fixture_ids,aggregated_fixture_ids,summary_payload,scoring_version)
      values($1,$2,$3,'sportmonks',$4,'complete',2,2,$5,$5,'{"totalRating":16.18}','player_scoring_v4')`,[p.playerId,id(1),id(2),p.providerPlayerId,JSON.stringify([id(3),id(4)])]);
    await db.query(`insert into public.touchline_player_fixture_score_settlements
      (football_player_id,fixture_id,competition_id,season_id,scoring_version,appearance_status,minutes_played,rating,touchline_points,scoring_coverage_status,ranking_coverage_status,settlement_status)
      select $1,f.id,$2,$3,'player_scoring_v4','started',90,8.09,8.09,'complete','complete','final' from public.football_fixtures f`,[p.playerId,id(1),id(2)]);
  }
  for (const name of ["old-v3","new-v4"]) {
    const version=name==="old-v3"?"player_scoring_v3":"player_scoring_v4";
    const payload={snapshotId:name,seasonId:id(2),roundId:"round-1",source:"sportmonks-audited",status:"audited",scoringVersion:version,coverageStatus:"complete",fixtureIds:["91","92"],expectedFixtureIds:["91","92"],totalScorePoints:0,checksum:name,players};
    const selection={sourceSnapshotId:name,complete:true,players:players.map((player,i)=>({id:`slot-${i}`,player}))};
    await db.query(`insert into public.touchline_card_ranking_snapshots
      (snapshot_id,league_key,season_id,round_id,source,status,generated_at,audited_at,published_at,price_table_version,checksum,expected_player_count,actual_player_count,ranking_payload,selection_version,selection_payload,audit_report,scoring_version,coverage_status,fixture_ids,expected_fixture_ids,total_score_points)
      values($1,'touchline-england',$2,'round-1','sportmonks-audited',$3,'2026-01-01','2026-01-02',$4,'synthetic',$1,11,11,$5,'synthetic',$6,$7,$8,'complete','["91","92"]','["91","92"]',0)`,
    [name,id(2),name==="old-v3"?"published":"audited",name==="old-v3"?"2026-01-03":null,JSON.stringify(payload),JSON.stringify(selection),JSON.stringify({passed:true,checksum:name}),version]);
  }
  await db.exec("insert into public.touchline_card_ranking_active_snapshots values('touchline-england','old-v3','2026-01-03','2026-01-03')");
}
const publish=(db: DB, league="touchline-england")=>db.query("select public.publish_touchline_card_ranking_snapshot('new-v4',$1,'2026-01-04') as id",[league]);
const rows=async(db: DB)=>(await db.query("select to_jsonb(s) as row from public.touchline_card_ranking_snapshots s where snapshot_id='old-v3'")).rows;

async function persistRealCandidate(db: DB, firstRating=16.18, coverageStatus: "complete" | "complete_for_scoring"="complete") {
  const positions=["GK","LB","RB","CB","CB","CM","DM","AM","LW","RW","ST"];
  const draft=buildSportmonksRankingDraft({
    snapshotId:"new-v4",seasonId:id(2),roundId:"round-1",receivedAt:"2026-01-01T00:00:00.000Z",
    expectedPlayerCount:11,scoringVersion:"player_scoring_v4",coverageStatus,
    fixtureIds:["91","92"],expectedFixtureIds:["91","92"],totalScorePoints:0,
    players:positions.map((position,i)=>({playerId:id(100+i),providerPlayerId:100+i,provider:"sportmonks" as const,
      verified:true as const,name:`Player ${i}`,clubName:"Synthetic club",position,
      totalRating:i===0?firstRating:16.18,minutesPlayed:i===0&&firstRating===8.09?90:180,
      appearances:i===0&&firstRating===8.09?1:2,sourceFixtureIds:["91","92"]})),
  });
  const audit=auditTouchlineRankingDraft(draft,"2026-01-02T00:00:00.000Z");
  assert.equal(audit.passed,true,JSON.stringify(audit));
  const selection=buildTouchlineSelection(audit.snapshot!);
  assert.equal(selection.complete,true);
  const r=buildTouchlineRankingPersistenceRecord({leagueKey:"touchline-england",expectedPlayerCount:11,audit,selection});
  await db.query(`update public.touchline_card_ranking_snapshots set
    ranking_payload=$1,selection_payload=$2,audit_report=$3,checksum=$4,price_table_version=$5,
    selection_version=$6,generated_at=$7,audited_at=$8,coverage_status=$9 where snapshot_id='new-v4'`,
    [JSON.stringify(r.rankingPayload),JSON.stringify(r.selectionPayload),JSON.stringify(r.auditReport),r.checksum,
      r.priceTableVersion,r.selectionVersion,r.generatedAt,r.auditedAt,r.coverageStatus]);
  return r;
}

test("V4 publisher validates decimal raw-rating provenance without converted totals",{skip:!modulePath},async t=>{
  const db=await database();
  try {
    async function scenario(name:string,body:()=>Promise<void>) {
      await t.test(name,async()=>{await db.exec("begin");try {await seed(db);await body();} finally {await db.exec("rollback");}});
    }
    await scenario("raw 16.18 season total publishes; V3 history remains byte-identical",async()=>{
      const old=await rows(db); assert.equal((await publish(db)).rows[0].id,"new-v4");
      assert.equal((await db.query("select snapshot_id from public.touchline_card_ranking_active_snapshots")).rows[0].snapshot_id,"new-v4");
      assert.equal((await db.query("select ranking_payload->'players'->0->>'totalRating' as rating,total_score_points from public.touchline_card_ranking_snapshots where snapshot_id='new-v4'")).rows[0].rating,"16.18");
      assert.deepEqual(await rows(db),old);
      await assert.rejects(db.exec("update public.touchline_card_ranking_snapshots set checksum='changed' where snapshot_id='old-v3'"),/immutable/);
    });
    await scenario("complete-for-scoring remains publishable without claiming full provider detail",async()=>{
      await db.exec(`update public.football_player_season_statistics set coverage_status='complete_for_scoring';
        update public.touchline_player_fixture_score_settlements set ranking_coverage_status='complete_for_scoring';
        update public.touchline_card_ranking_snapshots set coverage_status='complete_for_scoring',
          ranking_payload=jsonb_set(ranking_payload,'{coverageStatus}','"complete_for_scoring"') where snapshot_id='new-v4'`);
      assert.equal((await publish(db)).rows[0].id,"new-v4");
    });
    await scenario("actual TS draft, audit, XI and persistence chain publishes decimal totals",async()=>{
      const record=await persistRealCandidate(db);
      assert.equal((await publish(db)).rows[0].id,"new-v4");
      const stored=(await db.query("select ranking_payload,selection_payload from public.touchline_card_ranking_snapshots where snapshot_id='new-v4'")).rows[0];
      assert.deepEqual(stored.ranking_payload,record.rankingPayload);
      assert.deepEqual(stored.selection_payload,record.selectionPayload);
    });
    for(const missingRating of [false,true]) await scenario(missingRating?"complete-for-scoring missing rating contributes no invented points":"DNP rating excluded while participant raw rating counts",async()=>{
      await db.exec(`update public.touchline_player_fixture_score_settlements set
        appearance_status='${missingRating?"started":"unused"}',minutes_played=${missingRating?90:0},
        rating=${missingRating?"null":"8.09"},touchline_points=null,scoring_coverage_status='unavailable',
        ranking_coverage_status='${missingRating?"complete_for_scoring":"complete"}'
        where football_player_id='${id(100)}' and fixture_id='${id(4)}';
        update public.football_player_season_statistics set summary_payload='{"totalRating":8.09}',
          coverage_status='${missingRating?"complete_for_scoring":"complete"}' where football_player_id='${id(100)}'`);
      await persistRealCandidate(db,8.09,missingRating?"complete_for_scoring":"complete");
      assert.equal((await publish(db)).rows[0].id,"new-v4");
    });
    await scenario("foreign league rejected even with otherwise canonical candidate",async()=>{
      await db.exec("update public.touchline_card_ranking_snapshots set league_key='foreign' where snapshot_id='new-v4'; savepoint wrong_league");
      await assert.rejects(publish(db,"foreign"),/TL_RANKING_LEAGUE_INVALID/);
      await db.exec("rollback to savepoint wrong_league");
      assert.equal((await db.query("select snapshot_id from public.touchline_card_ranking_active_snapshots")).rows[0].snapshot_id,"old-v3");
    });
    const mutations: [string,string][]=[
      ["V3 publication", "update public.touchline_card_ranking_snapshots set scoring_version='player_scoring_v3' where snapshot_id='new-v4'"],
      ["converted total", "update public.touchline_card_ranking_snapshots set total_score_points=16 where snapshot_id='new-v4'"],
      ["inner version", `update public.touchline_card_ranking_snapshots set ranking_payload=jsonb_set(ranking_payload,'{scoringVersion}','"player_scoring_v3"') where snapshot_id='new-v4'`],
      ["inner checksum", `update public.touchline_card_ranking_snapshots set ranking_payload=jsonb_set(ranking_payload,'{checksum}','"wrong"') where snapshot_id='new-v4'`],
      ["foreign competition", "update public.football_competitions set provider_competition_id='9'"],
      ["foreign player", `update public.football_players set provider='other' where id='${id(100)}'`],
      ["provider identity", `update public.football_players set provider_player_id='999' where id='${id(100)}'`],
      ["foreign fixture", `update public.football_fixtures set provider='other' where id='${id(3)}'`],
      ["missing settlement", `delete from public.touchline_player_fixture_score_settlements where football_player_id='${id(100)}' and fixture_id='${id(3)}'`],
      ["nonfinal settlement", `update public.touchline_player_fixture_score_settlements set settlement_status='provisional' where football_player_id='${id(100)}'`],
      ["unavailable source", `update public.touchline_player_fixture_score_settlements set ranking_coverage_status='blocking_partial' where football_player_id='${id(100)}'`],
      ["missing aggregate", `delete from public.football_player_season_statistics where football_player_id='${id(100)}'`],
      ["historical aggregate", `update public.football_player_season_statistics set scoring_version='player_scoring_v3' where football_player_id='${id(100)}'`],
      ["tampered rating", `update public.touchline_card_ranking_snapshots set ranking_payload=jsonb_set(ranking_payload,'{players,0,totalRating}','16.19') where snapshot_id='new-v4'`],
      ["tampered aggregate and payload", `update public.football_player_season_statistics set summary_payload='{"totalRating":16.19}' where football_player_id='${id(100)}';
        update public.touchline_card_ranking_snapshots set ranking_payload=jsonb_set(ranking_payload,'{players,0,totalRating}','16.19') where snapshot_id='new-v4'`],
      ["foreign XI", `update public.touchline_card_ranking_snapshots set selection_payload=jsonb_set(selection_payload,'{players,0,player,playerId}','"${id(999)}"') where snapshot_id='new-v4'`],
      ["duplicated XI", `update public.touchline_card_ranking_snapshots set selection_payload=jsonb_set(selection_payload,'{players,0,player}',selection_payload->'players'->1->'player') where snapshot_id='new-v4'`],
      ["duplicate player", `update public.touchline_card_ranking_snapshots set ranking_payload=jsonb_set(ranking_payload,'{players,0}',ranking_payload->'players'->1) where snapshot_id='new-v4'`],
      ["wrong fixture prefix", `update public.touchline_card_ranking_snapshots set ranking_payload=jsonb_set(ranking_payload,'{players,0,sourceFixtureIds}','["91"]') where snapshot_id='new-v4'`],
      ["old publication time", "update public.touchline_card_ranking_snapshots set audited_at='2026-01-05' where snapshot_id='new-v4'"],
    ];
    for(const [label,mutation] of mutations) await scenario(`rejects ${label} atomically`,async()=>{
      const old=await rows(db); await db.exec(mutation); await db.exec("savepoint bad_publish");
      if(label==="tampered aggregate and payload") await assert.rejects(publish(db),/TL_RANKING_RAW_RATING_SUM_MISMATCH/);
      else await assert.rejects(publish(db));
      await db.exec("rollback to savepoint bad_publish");
      assert.equal((await db.query("select snapshot_id from public.touchline_card_ranking_active_snapshots")).rows[0].snapshot_id,"old-v3");
      assert.equal((await db.query("select status from public.touchline_card_ranking_snapshots where snapshot_id='new-v4'")).rows[0].status,"audited");
      assert.deepEqual(await rows(db),old);
    });
    await scenario("service-only admission and empty search_path preserved",async()=>{
      const s=(await db.query(`select has_function_privilege('anon',oid,'execute') as anon,
        has_function_privilege('authenticated',oid,'execute') as customer,has_function_privilege('service_role',oid,'execute') as service,
        prosecdef,proconfig from pg_proc where oid='public.publish_touchline_card_ranking_snapshot(text,text,timestamptz)'::regprocedure`)).rows[0];
      assert.deepEqual(s,{anon:false,customer:false,service:true,prosecdef:true,proconfig:['search_path=""']});
      await db.exec("select set_config('request.jwt.claim.role','authenticated',true)");
      await assert.rejects(publish(db),/TL_RANKING_ADMIN_REQUIRED/);
    });
  } finally {await db.close();}
});
