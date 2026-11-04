import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as registry } from "../lib/touchlineArena/formation-geometry.ts";
const sql = (name:string) => readFileSync(new URL("../supabase/migrations/"+name+".sql",import.meta.url),"utf8");
const migration=sql("20261103025750_club_automatic_lineup_and_position_reserves");
const id=(n:number)=>"50000000-0000-4000-8000-"+String(n).padStart(12,"0");
const geometry=registry["4-3-3"];
const positions:Record<string,string>={GK:"GK",RCB:"CB",LCB:"CB",RB:"RB",LB:"LB",RCM:"MID",CM:"MID",LCM:"MID",RW:"RW",LW:"LW",ST:"CF"};
const details:Record<string,string>={GK:"Goalkeeper",CB:"Centre Back",RB:"Right Back",LB:"Left Back",MID:"Central Midfield",RW:"Right Wing",LW:"Left Wing",CF:"Centre Forward"};
type Owned={playerId:string;clubId:string;position:string;primaryDetail:string;area:string;slot:number;valueEur:number};
async function database() {
  const db=await clubRoundDatabase();
  try {
    const before=JSON.parse(readFileSync(new URL("./fixtures/qa-club-primary-preimage-20261018.json",import.meta.url),"utf8"));
    await db.exec(before.map((p:{definition:string})=>p.definition).join(";\n"));
    await db.exec(sql("20261017195405_club_collection_remove_real_club_cap"));
    await db.exec(sql("20261018073030_club_collection_primary_position_contract"));
    // Reduced canonical football fixture, real installed business functions.
    await db.exec(`create table touchline_player_fixture_score_settlements(
      football_player_id uuid,fixture_id uuid,competition_id uuid,season_id uuid,
      scoring_version text,appearance_status text,minutes_played int,rating numeric,
      statistics_payload jsonb,settlement_status text,source_synced_at timestamptz,
      primary key(football_player_id,fixture_id));`);
    const actual=JSON.parse(readFileSync(new URL("./fixtures/qa-auto-lineup-predecessors-20261103.json",import.meta.url),"utf8"));
    await db.exec(actual.map((p:{definition:string})=>p.definition).join(";\n"));
    await db.exec(migration);
    await db.exec(sql("20261103111327_club_lineup_integral_tc_parsing"));
    await db.exec(`update touchline_club_automatic_lineup_policy set starts_at=clock_timestamp()-interval '1 day';
      insert into users values('${id(1)}'),('${id(2)}');
      insert into football_competitions values('${id(3)}');
      insert into football_seasons values('${id(4)}');
      insert into football_clubs values('${id(20)}','sportmonks','20'),('${id(21)}','sportmonks','21');
      insert into football_rounds values('${id(5)}','${id(3)}','${id(4)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(3)}','${id(4)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','standard');
      insert into touchline_fantasy_gameweeks(id,competition_id,season_id,round_id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at)
      values('${id(6)}','${id(3)}','${id(4)}','${id(5)}',1,'MARKET_OPEN',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '65 minutes',clock_timestamp()+interval '3 hours');
      insert into football_fixtures(id,round_id,competition_id,season_id,provider,provider_fixture_id,starts_at,status,home_club_id,away_club_id)
      values('${id(7)}','${id(5)}','${id(3)}','${id(4)}','sportmonks','777',clock_timestamp()+interval '65 minutes','NS','${id(20)}','${id(21)}');`);
    await db.query("insert into touchline_formation_geometry_versions values('4-3-3',1,'published',$1::jsonb)",[JSON.stringify(geometry)]);
    const players:Owned[]=geometry.slots.map((slot,i)=>({playerId:id(100+i),clubId:id(20),position:positions[slot.id],primaryDetail:details[positions[slot.id]],area:"starters",slot:i,valueEur:1000000}));
    // One bench CB, three outside CBs (explicit order), one wrong-position GK.
    for(let i=0;i<5;i++)players.push({playerId:id(200+i),clubId:id(20),position:i===4?"GK":"CB",primaryDetail:details[i===4?"GK":"CB"],area:i===0?"reserves":"outside",slot:i===0?1:i-1,valueEur:1000000});
    for(const [i,p] of players.entries()) {
      await db.query("insert into football_players values($1,'sportmonks',$2,$3,$4,$5)",[p.playerId,String(i+100),p.clubId,p.position,p.primaryDetail]);
      await db.query("insert into football_squad_members values($1,'sportmonks',$2,$3,$4,$5,'active')",[id(300+i),p.clubId,p.playerId,p.position,p.primaryDetail]);
      await db.query("insert into football_player_market_values values($1,$2,1000000,'verified','verified')",[id(400+i),p.playerId]);
      await db.query("insert into touchline_card_publications values($1,$2,$3,$4,'published',clock_timestamp())",[id(500+i),p.playerId,id(300+i),id(400+i)]);
    }
    const state={revision:1,seasonId:id(4),plan:"standard",balanceEur:100000000,coach:{id:"307",tier:"ruby-red",valueEur:5000000},formationCode:"4-3-3",players,receipts:[]};
    await db.query("insert into touchline_club_collections(user_id,season_id,revision,state,updated_at) values($1,$2,1,$3::jsonb,clock_timestamp()-interval '2 hours')",[id(1),id(4),JSON.stringify(state)]);
    return {db,players,state};
  } catch(e) {await db.close();throw e;}
}
async function closeRound(db:Awaited<ReturnType<typeof database>>["db"]) {
  await db.exec("update touchline_fantasy_gameweeks set locks_at=clock_timestamp()-interval '1 second'");
  await db.query("select touchline_fantasy_lock_gameweek($1)",[id(6)]);
  return (await db.query<{id:string}>("select id from touchline_fantasy_user_gameweeks where user_id=$1",[id(1)])).rows[0].id;
}
test("automatic deadline enrolls an offline owner without save/confirm; immutable and repeatable",async()=>{
  const {db,state}=await database();
  try {
    assert.equal((await db.query("select * from touchline_fantasy_user_gameweeks")).rows.length,0);
    const ug=await closeRound(db);
    const rows=await db.query<{state:string;automatic_lineup_version:number;collection_squad_snapshot:unknown}>("select state,automatic_lineup_version,collection_squad_snapshot from touchline_fantasy_user_gameweeks");
    assert.equal(rows.rows[0].state,"LOCKED");assert.equal(rows.rows[0].automatic_lineup_version,1);
    const frozen=rows.rows[0].collection_squad_snapshot as (Owned & {eligibleSlotIds:string[]})[];
    assert.deepEqual(frozen.map(({eligibleSlotIds: _slots,...p})=>p),state.players);
    assert.ok(frozen.every(p=>Array.isArray(p.eligibleSlotIds)));
    const original=(await db.query("select * from touchline_fantasy_locked_selections order by slot_index")).rows;
    assert.equal(original.length,11);
    await db.query("select touchline_fantasy_lock_gameweek($1)",[id(6)]);
    assert.deepEqual((await db.query("select * from touchline_fantasy_locked_selections order by slot_index")).rows,original);
    assert.deepEqual((await db.query<{state:unknown}>("select state from touchline_club_collections")).rows[0].state,state,"no cash or ownership mutation");
    await assert.rejects(db.query("update touchline_fantasy_user_gameweeks set collection_squad_snapshot='[]' where id=$1",[ug]),/IMMUTABLE/);
    for(const role of ["anon","authenticated","service_role"])assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege($1,'touchline_club_project_deadline_lineup(uuid,uuid,text,text,jsonb,text,text)','execute') allowed",[role])).rows[0].allowed,false);
  } finally {await db.close();}
});
test("one invalid owner is audited without blocking another owner's automatic XI",async()=>{
  const {db,state}=await database();
  try{
    await db.query("insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values($1,'active','qa_grant','standard')",[id(2)]);
    const invalid=structuredClone(state); invalid.players.push({playerId:id(999),clubId:id(20),position:"CB",primaryDetail:"Centre Back",area:"outside",slot:14,valueEur:1000000});
    await db.query("insert into touchline_club_collections(user_id,season_id,revision,state,updated_at) values($1,$2,1,$3::jsonb,clock_timestamp()-interval '2 hours')",[id(2),id(4),JSON.stringify(invalid)]);
    await closeRound(db);
    const rounds=(await db.query<{user_id:string;state:string}>("select user_id,state from touchline_fantasy_user_gameweeks")).rows;
    assert.ok(rounds.some(r=>r.user_id===id(1)&&r.state==='LOCKED'));
    assert.ok(!rounds.some(r=>r.user_id===id(2)&&r.state==='LOCKED'));
    const audit=(await db.query<{metadata:{reason:string}}>("select metadata from touchline_fantasy_audit_events where user_id=$1 and event_type='XI_REJECTED'",[id(2)])).rows;
    assert.equal(audit[0].metadata.reason,'CLUB_PRIMARY_DETAIL_MISSING');
    assert.deepEqual((await db.query<{state:unknown}>("select state from touchline_club_collections where user_id=$1",[id(2)])).rows[0].state,invalid);
  }finally{await db.close();}
});
test("automatic substitutions: bench then ordered outside, same position, no duplicate, actual appearances retained",async()=>{
  const {db,players}=await database();
  try {
    const ug=await closeRound(db);
    const cbs=players.filter(p=>p.area==="starters"&&p.position==="CB");
    const original=(await db.query("select * from touchline_fantasy_locked_selections order by slot_index")).rows;
    await db.exec("update football_fixtures set status='FT'");
    for(const p of players) {
      await db.query(`insert into touchline_fantasy_player_fixture_scores(gameweek_id,player_id,fixture_id,appearance_status,participation_status,rating,goals,hat_trick_multiplier,fantasy_contribution,reason_code,settlement_status)
        values($1,$2,$3,'started','rated_appearance',6,0,1,6,'RATED_APPEARANCE','FINAL')`,[id(6),p.playerId,id(7)]);
    }
    const read=async()=>(await db.query<{slot_id:string;source_player_id:string;player_id:string;source_area:string}>("select * from touchline_club_resolve_effective_xi($1)",[ug])).rows;
    assert.ok((await read()).every(p=>p.source_player_id===p.player_id),"never substitute a participant");
    await db.query("update touchline_fantasy_player_fixture_scores set appearance_status='absent',participation_status='did_not_play',rating=null,reason_code='DID_NOT_PLAY',fantasy_contribution=0 where player_id=$1",[cbs[0].playerId]);
    await db.query("update touchline_fantasy_player_fixture_scores set rating=10,fantasy_contribution=10 where player_id=$1",[id(203)]);
    assert.equal((await read()).find(p=>p.source_player_id===cbs[0].playerId)?.player_id,id(200),"bench precedes higher-scoring outside");
    await db.query("update touchline_fantasy_player_fixture_scores set appearance_status='absent',participation_status='did_not_play',rating=null,reason_code='DID_NOT_PLAY',fantasy_contribution=0 where player_id=$1",[id(200)]);
    assert.equal((await read()).find(p=>p.source_player_id===cbs[0].playerId)?.player_id,id(201),"first outside even when third scores more");
    await db.query("update touchline_fantasy_player_fixture_scores set appearance_status='absent',participation_status='did_not_play',rating=null,reason_code='DID_NOT_PLAY',fantasy_contribution=0 where player_id=$1",[cbs[1].playerId]);
    const two=await read();assert.equal(new Set(two.map(p=>p.player_id)).size,11);
    assert.deepEqual(two.filter(p=>p.source_area==="outside").map(p=>p.player_id),[id(201),id(202)]);
    await db.query("update touchline_fantasy_player_fixture_scores set appearance_status='started',participation_status='no_provider_rating',rating=null,reason_code='NO_PROVIDER_RATING',fantasy_contribution=0 where player_id=$1",[cbs[0].playerId]);
    assert.equal((await read()).find(p=>p.source_player_id===cbs[0].playerId)?.player_id,cbs[0].playerId,"appearance without rating still played");
    await db.exec("update football_fixtures set status='NS'");
    assert.ok((await read()).every(p=>p.source_player_id===p.player_id),"postponed/pending fixtures are not zero-minute proof");
    assert.deepEqual((await db.query("select * from touchline_fantasy_locked_selections order by slot_index")).rows,original);
  } finally {await db.close();}
});
test("real reconcile waits for reserve coverage, scores the chosen XI once and handles corrected appearances",async()=>{
  const {db,players}=await database();
  try {
    const ug=await closeRound(db),cb=players.find(p=>p.area==="starters"&&p.position==="CB")!;
    await db.exec("update football_fixtures set status='FT'");
    const synced="2026-11-01T12:00:00Z";
    await db.query("insert into football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload,lineups_payload,last_synced_at) values('sportmonks','777',$1::jsonb,$2::jsonb,$3)",
      [JSON.stringify({status:"FT"}),JSON.stringify([{id:1}]),synced]);
    for(const p of players) {
      const absent=p.playerId===cb.playerId||p.playerId===id(200);
      await db.query(`insert into touchline_player_fixture_score_settlements values($1,$2,$3,$4,'player_scoring_v4',$5,$6,$7,'{}','final',$8)`,
        [p.playerId,id(7),id(3),id(4),absent?"absent":"started",absent?0:90,absent?null:p.playerId===id(203)?10:6,synced]);
    }
    // Missing data cannot be interpreted as a substitute who did not play.
    await db.query("delete from touchline_player_fixture_score_settlements where football_player_id=$1",[id(200)]);
    const reconcile=async()=>(await db.query<{result:{ok:boolean;pendingStatistics?:boolean;userScoresChanged:number}}>("select touchline_fantasy_reconcile_gameweek($1) result",[id(6)])).rows[0].result;
    assert.equal((await reconcile()).pendingStatistics,true);
    assert.equal((await db.query("select * from touchline_fantasy_user_gameweek_scores")).rows.length,0);
    await db.query("insert into touchline_player_fixture_score_settlements values($1,$2,$3,$4,'player_scoring_v4','absent',0,null,'{}','final',$5)",[id(200),id(7),id(3),id(4),synced]);
    assert.equal((await reconcile()).ok,true);
    const effective=(await db.query<{player_id:string}>("select player_id from touchline_club_effective_selections where source_player_id=$1",[cb.playerId])).rows[0];
    assert.equal(effective.player_id,id(201));
    assert.equal(Number((await db.query<{gameweek_score:string}>("select gameweek_score from touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1",[ug])).rows[0].gameweek_score),66);
    assert.equal((await reconcile()).userScoresChanged,0,"idempotent replay");
    // A final zero-minute absence exhausts both earlier same-position choices.
    await db.query("update touchline_player_fixture_score_settlements set appearance_status='absent',minutes_played=0,rating=null where football_player_id=$1",[id(201)]);
    await db.query("update touchline_player_fixture_score_settlements set appearance_status='unused',minutes_played=0,rating=null where football_player_id=$1",[id(202)]);
    assert.equal((await reconcile()).ok,true);
    const thirdOutside=(await db.query<{player_id:string;source_area:string}>("select player_id,source_area from touchline_club_effective_selections where source_player_id=$1",[cb.playerId])).rows[0];
    assert.deepEqual(thirdOutside,{player_id:id(203),source_area:"outside"},"bench, outside 1 and outside 2 did not play: outside 3 enters");
    assert.equal(Number((await db.query<{gameweek_score:string}>("select gameweek_score from touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1",[ug])).rows[0].gameweek_score),70);
    assert.equal((await reconcile()).userScoresChanged,0,"later outside choice also replays without changes");
    // A participating goalkeeper is never used when every eligible CB is absent.
    await db.query("update touchline_player_fixture_score_settlements set appearance_status='absent',minutes_played=0,rating=null where football_player_id=$1",[id(203)]);
    assert.equal((await reconcile()).ok,true);
    const noEligible=(await db.query<{player_id:string;source_area:string}>("select player_id,source_area from touchline_club_effective_selections where source_player_id=$1",[cb.playerId])).rows[0];
    assert.deepEqual(noEligible,{player_id:cb.playerId,source_area:"starters"},"no same-position participant: keep the original CB, never the available GK");
    const effectiveXi=(await db.query<{player_id:string}>("select player_id from touchline_club_effective_selections where user_gameweek_id=$1",[ug])).rows;
    assert.equal(effectiveXi.length,11);assert.equal(new Set(effectiveXi.map(p=>p.player_id)).size,11);
    assert.ok(!effectiveXi.some(p=>p.player_id===id(204)),"wrong-position outside player is excluded");
    assert.equal(Number((await db.query<{gameweek_score:string}>("select gameweek_score from touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1",[ug])).rows[0].gameweek_score),60);
    for(const n of [201,202,203])await db.query("update touchline_player_fixture_score_settlements set appearance_status='started',minutes_played=90,rating=$2 where football_player_id=$1",[id(n),n===203?10:6]);
    await db.query("update touchline_player_fixture_score_settlements set appearance_status='substitute',minutes_played=1,rating=2 where football_player_id=$1",[cb.playerId]);
    await reconcile();
    assert.equal((await db.query<{player_id:string}>("select player_id from touchline_club_effective_selections where source_player_id=$1",[cb.playerId])).rows[0].player_id,cb.playerId);
    assert.equal(Number((await db.query<{gameweek_score:string}>("select gameweek_score from touchline_fantasy_user_gameweek_scores where user_gameweek_id=$1",[ug])).rows[0].gameweek_score),62);
  } finally {await db.close();}
});
test("automatic enrollment preserves historical rounds and never borrows a post-deadline or incomplete squad",async()=>{
  for(const mode of ["historical","late","incomplete"] as const){
    const {db,state}=await database();
    try {
      if(mode==="historical")await db.exec("update touchline_club_automatic_lineup_policy set starts_at=clock_timestamp()+interval '1 day'");
      if(mode==="late")await db.exec("update touchline_club_collections set updated_at=clock_timestamp()+interval '1 second'");
      if(mode==="incomplete")await db.query("update touchline_club_collections set state=$1::jsonb",[JSON.stringify({...state,players:state.players.filter(p=>p.playerId!==id(100))})]);
      await db.exec("update touchline_fantasy_gameweeks set locks_at=clock_timestamp()-interval '1 second'");
      await db.query("select touchline_fantasy_lock_gameweek($1)",[id(6)]);
      assert.equal((await db.query("select * from touchline_fantasy_locked_selections")).rows.length,0,mode);
      assert.deepEqual((await db.query<{state:unknown}>("select state from touchline_club_collections")).rows[0].state,mode==="incomplete"?{...state,players:state.players.filter(p=>p.playerId!==id(100))}:state);
    }finally{await db.close();}
  }
});
test("delayed first worker locks a completed future-policy round and uses frozen tactical compatibility",async()=>{
  const {db,players}=await database();
  try{
    await db.query("update football_players set current_club_id=$1 where id=$2",[id(21),id(200)]);
    await db.query("update football_squad_members set club_id=$1 where player_id=$2",[id(21),id(200)]);
    await db.exec("update touchline_fantasy_gameweeks set locks_at=clock_timestamp()-interval '1 second',state='FINAL'; update football_fixtures set status='FT'");
    // A later market write must catch this round before changing ownership.
    await db.query("select touchline_club_lock_open_round($1)",[id(4)]);
    const ug=(await db.query<{id:string;state:string}>("select id,state from touchline_fantasy_user_gameweeks")).rows[0];
    assert.equal(ug.state,"LOCKED");
    const frozen=async()=>(await db.query<{club:string}>("select p->>'clubId' club from touchline_fantasy_user_gameweeks ug cross join lateral jsonb_array_elements(ug.collection_squad_snapshot) p where p->>'playerId'=$1",[id(200)])).rows[0].club;
    assert.equal(await frozen(),id(21),"freeze the verified current club after a real transfer, not purchase metadata");
    await db.query("update football_players set current_club_id=$1 where id=$2",[id(20),id(200)]);
    assert.equal(await frozen(),id(21),"later transfers cannot change the round's club");
    const cb=players.find(p=>p.area==="starters"&&p.position==="CB")!;
    for(const p of players){
      const absent=p.playerId===cb.playerId;
      await db.query(`insert into touchline_fantasy_player_fixture_scores(gameweek_id,player_id,fixture_id,appearance_status,participation_status,rating,goals,hat_trick_multiplier,fantasy_contribution,reason_code,settlement_status)
      values($1,$2,$3,$4,$5,$6,0,1,$7,$8,'FINAL')`,[id(6),p.playerId,id(7),absent?"absent":"started",absent?"did_not_play":"rated_appearance",absent?null:6,absent?0:6,absent?"DID_NOT_PLAY":"RATED_APPEARANCE"]);
    }
    await db.query("update football_squad_members set detailed_position='Goalkeeper',position='GK' where player_id=$1",[id(200)]);
    await db.query("update football_players set detailed_position='Goalkeeper',position='GK' where id=$1",[id(200)]);
    const chosen=(await db.query<{player_id:string}>("select player_id from touchline_club_resolve_effective_xi($1) where source_player_id=$2",[ug.id,cb.playerId])).rows[0];
    assert.equal(chosen.player_id,id(200),"post-deadline changes cannot reclassify the frozen reserve");
    // The scoring contract can give zero for missing minutes, but that is not DNP.
    await db.query("update touchline_fantasy_player_fixture_scores set rating=null,participation_status='did_not_play',reason_code='DID_NOT_PLAY',fantasy_contribution=0 where player_id=$1",[id(200)]);
    assert.equal((await db.query<{player_id:string}>("select player_id from touchline_club_resolve_effective_xi($1) where source_player_id=$2",[ug.id,cb.playerId])).rows[0].player_id,id(200),"a started bench player is never skipped because minutes/rating are missing");
    await db.query("update touchline_fantasy_player_fixture_scores set appearance_status='started' where player_id=$1",[cb.playerId]);
    assert.equal((await db.query<{player_id:string}>("select player_id from touchline_club_resolve_effective_xi($1) where source_player_id=$2",[ug.id,cb.playerId])).rows[0].player_id,cb.playerId);
  }finally{await db.close();}
});

test('decimal serialization of integral TC never blocks manual preparation or automatic XI and never rewrites the wallet',async()=>{
  const {db}=await database();
  try {
    await db.query(`update touchline_club_collections set state=jsonb_set(state,'{balanceEur}','1155435000.000000000000'::jsonb)||jsonb_build_object('players',(
      select jsonb_agg(jsonb_set(p,'{valueEur}',to_jsonb((p->>'valueEur')::numeric(30,12)))) from jsonb_array_elements(state->'players') p)) where user_id=$1`,[id(1)]);
    const before=(await db.query<{state:unknown}>('select state from touchline_club_collections where user_id=$1',[id(1)])).rows[0].state;
    // Same preparation used when opening ClubOwner before the deadline.
    const prepared=(await db.query<{id:string}>('select touchline_fantasy_prepare_user_gameweek($1,$2) id',[id(1),id(6)])).rows[0].id;
    assert.ok(prepared);
    const ug=await closeRound(db);
    const locked=(await db.query<{n:number}>('select count(*)::int n from touchline_fantasy_locked_selections where user_gameweek_id=$1',[ug])).rows[0].n;
    assert.equal(locked,11);
    const row=(await db.query<{budget:string}>('select budget_eur_snapshot::text budget from touchline_fantasy_user_gameweeks where id=$1',[ug])).rows[0];
    assert.equal(row.budget,'1171435000');
    assert.deepEqual((await db.query<{state:unknown}>('select state from touchline_club_collections where user_id=$1',[id(1)])).rows[0].state,before);
  } finally {await db.close();}
});


test('TC parser rejects fractional, negative, missing and unsafe amounts instead of rounding',async()=>{
  const {db}=await database();try{
    for(const value of ['1.25','-1',null,'not-money','9007199254740992','NaN','Infinity'])
      await assert.rejects(db.query('select public.touchline_club_integral_tc($1)',[value]),/CLUB_BUDGET_AMOUNT_INVALID/);
    assert.equal((await db.query<{v:string}>("select public.touchline_club_integral_tc('2250000.000000000000')::text v")).rows[0].v,'2250000');
    for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege($1,'public.touchline_club_integral_tc(text)','execute') allowed",[role])).rows[0].allowed,false);
  }finally{await db.close();}
});
