import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const migration=readFileSync(new URL("../supabase/migrations/20261018051627_club_collection_atomic_release.sql",import.meta.url),"utf8");

test("ordinary release is atomic, owner-scoped, ten percent of paid contract and replay-safe",async()=>{
  const db=await clubRoundDatabase();
  try {
    await db.exec(migration);
    await db.exec(`insert into users values('${id(1)}'),('${id(9)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','vip');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();`);
    const state:ClubAcquisitionState={revision:1,seasonId:id(3),plan:"vip",balanceEur:1_145_000_000,
      coach:{id:"coach",tier:"sapphire-blue",valueEur:10_000_000},players:[{playerId:id(7),clubId:id(20),position:"RB",area:"outside",slot:1,valueEur:45_000_000}],
      receipts:[{key:"purchase_original",playerId:id(7),area:"outside",slot:1,valueEur:45_000_000,revision:1}]};
    await db.query("insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,1,$3::jsonb)",[id(1),id(3),JSON.stringify(state)]);
    const command={action:"release",playerId:id(7),expectedRevision:1,idempotencyKey:"release_original"};
    const run=async(c:object=command,owner=id(1))=>(await db.query<{result:{state:ClubAcquisitionState;receipt:{fee_credits:number;refund_credits:number};replayed:boolean}}>(
      "select touchline_club_release_player($1,$2,$3::jsonb) result",[owner,id(3),JSON.stringify(c)])).rows[0].result;
    const read=async()=>(await db.query<{state:ClubAcquisitionState}>("select state from touchline_club_collections where user_id=$1 and season_id=$2",[id(1),id(3)])).rows[0].state;
    await assert.rejects(run(command,id(9)),/CLUB_COLLECTION_REQUIRED/);
    for(const patch of [{refund:45_000_000},{expectedRevision:1.5},{action:"move"},{playerId:"wrong"}]) await assert.rejects(run({...command,...patch}),/CLUB_INVALID_REQUEST/);
    await assert.rejects(run({...command,expectedRevision:0}),/CLUB_STALE_REVISION/);
    await db.query("insert into touchline_club_player_reservations values($1,$2,$3,$4)",[id(1),id(3),id(7),id(8)]);
    await assert.rejects(run(),/CLUB_PLAYER_RESERVED/);
    assert.deepEqual(await read(),state);
    await db.exec("delete from touchline_club_player_reservations");
    await db.exec("update touchline_fantasy_entitlements set current_period_end=clock_timestamp()-interval '1 second'");
    await assert.rejects(run(),/CLUB_ACCESS_REQUIRED/);
    await db.exec("update touchline_fantasy_entitlements set current_period_end=null");
    // Install the actual QA override in this isolated fixture, not on remote QA.
    await db.exec(`create function touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
      if $1<>'xgxbwqxjssxxuihuwmgy' then raise exception 'WRONG_TARGET';end if;end;$$;`);
    await db.exec(readFileSync(new URL("../supabase/qa/club_market_test_opening.sql",import.meta.url),"utf8"));
    await db.exec("update touchline_qa_club_market_control set enabled=true");
    await db.query(`insert into touchline_fantasy_user_gameweeks(user_id,gameweek_id,formation_code,state,budget_eur_snapshot,max_players_per_club_snapshot,collection_revision_snapshot,collection_related_snapshot)
      select $1,id,'4-3-3','LOCKED',1200000000,3,1,$2::jsonb from touchline_fantasy_gameweeks`,[id(1),JSON.stringify([{playerId:id(7),area:"starters",slot:1}])]);
    for(const roundState of ["LOCKED","LIVE"]) {
      await db.query("update touchline_fantasy_gameweeks set state=$1",[roundState]);
      await assert.rejects(run(),/CLUB_PLAYER_ROUND_LOCKED/);
      assert.deepEqual(await read(),state);
    }
    await db.exec("update touchline_fantasy_gameweeks set state='FINAL';update touchline_fantasy_user_gameweeks set state='FINAL'");
    // Failure after the wallet UPDATE must roll back wallet, contract and command together.
    await db.exec(`create function reject_test_release() returns trigger language plpgsql as $$begin raise exception 'TEST_RECEIPT_FAILURE';end;$$;
      create trigger reject_test_release before insert on touchline_club_release_receipts for each row execute function reject_test_release();`);
    await assert.rejects(run(),/TEST_RECEIPT_FAILURE/);
    assert.deepEqual(await read(),state);
    assert.equal((await db.query<{count:number}>("select count(*)::int count from touchline_club_collection_operations")).rows[0].count,0);
    await db.exec("drop trigger reject_test_release on touchline_club_release_receipts");
    const result=await run();
    assert.equal(result.replayed,false);
    assert.equal(result.receipt.fee_credits,4_500_000);
    assert.equal(result.receipt.refund_credits,40_500_000);
    assert.equal(result.state.balanceEur,state.balanceEur+40_500_000);
    assert.equal(result.state.players.length,0);
    assert.deepEqual(result.state.receipts,state.receipts,"purchase audit history retained");
    assert.deepEqual(result.state.coach,state.coach);
    const replay=await run();
    assert.equal(replay.replayed,true);
    assert.deepEqual(replay.state,result.state);
    await assert.rejects(run({...command,playerId:id(8)}),/CLUB_IDEMPOTENCY_CONFLICT/);
    await assert.rejects(run({...command,expectedRevision:2,idempotencyKey:"another_release"}),/CLUB_PLAYER_NOT_OWNED/);
    assert.equal((await db.query<{count:number}>("select count(*)::int count from touchline_club_release_receipts")).rows[0].count,1);
    // A later contract for the same athlete must survive replay of the old release.
    const reacquired={...result.state,revision:3,balanceEur:result.state.balanceEur-45_000_000,players:state.players};
    await db.query("update touchline_club_collections set state=$1::jsonb,revision=3",[JSON.stringify(reacquired)]);
    assert.deepEqual((await run()).state,reacquired);
    assert.deepEqual(await read(),reacquired);
    assert.equal((await db.query<{count:number}>("select count(*)::int count from touchline_club_release_receipts")).rows[0].count,1);
    await db.exec("set role authenticated");
    await assert.rejects(run(),/permission denied/);
    await assert.rejects(db.query("select * from touchline_club_release_receipts"),/permission denied/);
    await db.exec("reset role");
  } finally {await db.close();}
});
