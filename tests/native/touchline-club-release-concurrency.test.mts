import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { clubRoundDatabase } from "../helpers/club-round-database.mts";
import { installTestClubSeasonCalendar } from "../helpers/club-season-calendar.mts";
import type { ClubAcquisitionState } from "../../lib/touchlineFantasy/club-acquisition.ts";

const runtime=process.env.TOUCHLINE_QUOTA_NATIVE_RUNTIME;
assert.ok(runtime,"Isolated native PostgreSQL runtime required; no skip or emulator fallback");
const { NativeQuotaDatabase }=await import(pathToFileURL(runtime).href);
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
type Result={state:ClubAcquisitionState;receipt:{fee_credits:number;refund_credits:number};replayed:boolean};

test("native release serializes concurrent requests and commits exactly one 90 percent refund",async()=>{
  const admin=new NativeQuotaDatabase(),first=new NativeQuotaDatabase(),second=new NativeQuotaDatabase();
  const sessions=[admin,first,second];
  try {
    await Promise.all(sessions.map(db=>db.ready));
    for(const db of sessions) {
      const isolation=await db.verifyIsolation();
      assert.equal(isolation.transport,"unix");assert.equal(isolation.listenAddresses,"");
      assert.ok(isolation.dataDirectory.startsWith("/"));
      assert.ok(Number(isolation.serverVersionNum)>=140000);
      assert.ok(db.client.connectionParameters.host.startsWith("/"),"Unix socket only");
      const actual=(await db.query("select inet_server_addr() is null local_socket,current_database() database,current_user as username,current_setting('data_directory') data_directory,current_setting('server_version_num') version_num,current_setting('listen_addresses') listen_addresses")).rows[0];
      assert.equal(actual.local_socket,true);assert.equal(actual.database,isolation.database);
      assert.equal(actual.username,isolation.user);assert.equal(actual.data_directory,isolation.dataDirectory);
      assert.equal(Number(actual.version_num),Number(isolation.serverVersionNum));assert.equal(actual.listen_addresses,"");
    }
    const pids=await Promise.all(sessions.map(async db=>(await db.query("select pg_backend_pid() pid")).rows[0].pid));
    assert.equal(new Set(pids).size,3,"three genuine PostgreSQL backends");
    await clubRoundDatabase({createDatabase:()=>admin});
    // Mirror service_role SELECT ACLs confirmed read-only on QA on 2026-10-18.
    // The reduced lifecycle fixture omits these pre-existing grants; do not
    // elevate the caller or change product migrations to mask a fixture gap.
    await admin.exec("grant select on public.touchline_fantasy_entitlements,public.touchline_fantasy_gameweeks,public.touchline_fantasy_user_gameweeks to service_role");
    for(const name of ["20261017195405_club_collection_remove_real_club_cap.sql","20261018073030_club_collection_primary_position_contract.sql"])
      await admin.exec(readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),"utf8"));
    await admin.exec(readFileSync(new URL("../../supabase/migrations/20261018051627_club_collection_atomic_release.sql",import.meta.url),"utf8"));
    await admin.exec(`insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status)
      values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();`);
    // Same disposable-only target guard as the isolated atomic-release suite.
    await admin.exec(`create function touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
      if $1<>'xgxbwqxjssxxuihuwmgy' then raise exception 'WRONG_TARGET';end if;end;$$;`);
    await installTestClubSeasonCalendar(admin,id(3),id(2));
    await admin.exec(readFileSync(new URL("../../supabase/qa/club_market_test_opening.sql",import.meta.url),"utf8"));
    await admin.exec("update touchline_qa_club_market_control set enabled=true");
    await first.exec("set role service_role");
    await second.exec("set role service_role");
    const initial=(owner:number):ClubAcquisitionState=>({revision:1,seasonId:id(3),plan:"vip",balanceEur:1_145_000_000,
      coach:{id:"coach",tier:"sapphire-blue",valueEur:10_000_000},
      players:[{playerId:id(owner+100),clubId:id(20),position:"RB",primaryDetail:"Right Back",area:"outside",slot:1,valueEur:45_000_000}],
      receipts:[{key:"purchase_original",playerId:id(owner+100),area:"outside",slot:1,valueEur:45_000_000,revision:1}]});
    const seed=async(owner:number)=>{
      await admin.query("insert into users values($1)",[id(owner)]);
      await admin.query("insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values($1,'active','qa_grant','vip')",[id(owner)]);
      await admin.query("insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,1,$3::jsonb)",[id(owner),id(3),JSON.stringify(initial(owner))]);
    };
    const command=(owner:number,key="release_original",revision=1)=>({action:"release",playerId:id(owner+100),expectedRevision:revision,idempotencyKey:key});
    const run=async(db:typeof admin,owner:number,c=command(owner)):Promise<Result>=>(await db.query(
      "select touchline_club_release_player($1,$2,$3::jsonb) result",[id(owner),id(3),JSON.stringify(c)])).rows[0].result;
    const read=async(owner:number):Promise<ClubAcquisitionState>=>(await admin.query("select state from touchline_club_collections where user_id=$1",[id(owner)])).rows[0].state;
    const counts=async(owner:number)=>(await admin.query(`select
      (select count(*)::int from touchline_club_collection_operations where user_id=$1) operations,
      (select count(*)::int from touchline_club_release_receipts where user_id=$1) receipts`,[id(owner)])).rows[0];
    const race=async(owner:number,commands:ReturnType<typeof command>[])=>{
      await admin.exec("begin");
      await admin.query("select 1 from touchline_club_collections where user_id=$1 for update",[id(owner)]);
      const pending=Promise.allSettled([run(first,owner,commands[0]),run(second,owner,commands[1])]);
      try {
        let bothBlocked=false;
        for(let n=0;n<150;n++) {
          await admin.query("select pg_stat_clear_snapshot()");
          if((await admin.query("select pid from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'",[pids.slice(1)])).rows.length===2) {bothBlocked=true;break;}
          await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.equal(bothBlocked,true,"both real requests blocked before releasing the transaction");
      } finally {await admin.exec("commit");}
      return pending;
    };
    await seed(10);
    const same=await race(10,[command(10),command(10)]);
    assert.equal(same.every(result=>result.status==="fulfilled"),true,JSON.stringify(same.map(result=>
      result.status==="fulfilled" ? {status:result.status,replayed:result.value.replayed}
        : {status:result.status,code:(result.reason as {code?:string})?.code,message:String(result.reason)})));
    const results=same.map(result=>{assert.equal(result.status,"fulfilled");return result.value;});
    assert.deepEqual(results.map(result=>result.replayed).sort(),[false,true]);
    for(const result of results) {
      assert.equal(result.receipt.fee_credits,4_500_000);assert.equal(result.receipt.refund_credits,40_500_000);
    }
    assert.deepEqual(await counts(10),{operations:1,receipts:1});
    assert.equal((await read(10)).balanceEur,1_185_500_000);
    assert.equal((await read(10)).revision,2);assert.equal((await read(10)).players.length,0);
    assert.deepEqual((await read(10)).receipts,initial(10).receipts);
    const reconnect=new NativeQuotaDatabase();
    try {await reconnect.exec("set role service_role");assert.equal((await run(reconnect,10)).replayed,true);assert.equal((await read(10)).balanceEur,1_185_500_000);}
    finally {await reconnect.close();}

    await seed(11);
    const different=await race(11,[command(11,"release_first"),command(11,"release_second")]);
    assert.equal(different.filter(result=>result.status==="fulfilled").length,1);
    const failure=different.find(result=>result.status==="rejected");
    assert.ok(failure && failure.status==="rejected");assert.match(String(failure.reason),/CLUB_STALE_REVISION/);
    assert.deepEqual(await counts(11),{operations:1,receipts:1});
    assert.equal((await read(11)).balanceEur,1_185_500_000);
    await assert.rejects(run(first,11,command(11,"release_after",2)),/CLUB_PLAYER_NOT_OWNED/);

    await seed(12);
    await assert.rejects(run(first,12,command(12,"release_stale",0)),/CLUB_STALE_REVISION/);
    assert.deepEqual(await read(12),initial(12));assert.deepEqual(await counts(12),{operations:0,receipts:0});
    await admin.exec(`create function reject_native_release() returns trigger language plpgsql as $$begin raise exception 'NATIVE_RECEIPT_FAILURE';end;$$;
      create trigger reject_native_release before insert on touchline_club_release_receipts for each row execute function reject_native_release();`);
    await assert.rejects(run(first,12),/NATIVE_RECEIPT_FAILURE/);
    assert.deepEqual(await read(12),initial(12));assert.deepEqual(await counts(12),{operations:0,receipts:0});
    await admin.exec("drop trigger reject_native_release on touchline_club_release_receipts");
    assert.equal((await run(second,12)).replayed,false,"same command recovers after transaction rollback");
    assert.equal((await run(first,12)).replayed,true);
    assert.deepEqual(await counts(12),{operations:1,receipts:1});assert.equal((await read(12)).balanceEur,1_185_500_000);

    await seed(13);
    for(const role of ["anon","authenticated"]) {
      await second.exec(`set role ${role}`);
      await assert.rejects(run(second,13),/permission denied/);
      await assert.rejects(second.query("select * from touchline_club_release_receipts"),/permission denied/);
    }
    await second.exec("set role service_role");
    await admin.query("insert into touchline_club_player_reservations values($1,$2,$3,$4)",[id(13),id(3),id(113),id(99)]);
    await assert.rejects(run(first,13),/CLUB_PLAYER_RESERVED/);
    await admin.query("delete from touchline_club_player_reservations where user_id=$1",[id(13)]);
    await admin.query(`insert into touchline_fantasy_user_gameweeks(user_id,gameweek_id,formation_code,state,budget_eur_snapshot,max_players_per_club_snapshot,collection_revision_snapshot,collection_related_snapshot)
      select $1,id,'4-3-3','LOCKED',1200000000,3,1,$2::jsonb from touchline_fantasy_gameweeks`,[id(13),JSON.stringify([{playerId:id(113),area:"starters",slot:1}])]);
    for(const roundState of ["LOCKED","LIVE"]) {
      await admin.query("update touchline_fantasy_gameweeks set state=$1",[roundState]);
      await assert.rejects(run(first,13),/CLUB_PLAYER_ROUND_LOCKED/);
      assert.deepEqual(await read(13),initial(13));assert.deepEqual(await counts(13),{operations:0,receipts:0});
    }
    await admin.exec("update touchline_qa_club_market_control set enabled=false;update football_fixtures set starts_at=clock_timestamp()-interval '10 minutes',status='LIVE'");
    assert.equal((await admin.query("select touchline_club_market_is_open($1) opened",[id(3)])).rows[0].opened,false,"positive control: actual market projection is closed");
    await assert.rejects(run(first,13),/CLUB_MARKET_CLOSED/);
    assert.deepEqual(await read(13),initial(13));assert.deepEqual(await counts(13),{operations:0,receipts:0});
    await admin.exec("update touchline_qa_club_market_control set enabled=true;update touchline_fantasy_gameweeks set state='FINAL';update touchline_fantasy_user_gameweeks set state='FINAL'");
    // Deterministic transport uncertainty: discard a completed response, then
    // recover through a fresh connection and the exact same command, never a new purchase.
    await run(first,13);
    const recovery=new NativeQuotaDatabase();
    try {
      await recovery.exec("set role service_role");
      const recovered=await run(recovery,13);
      assert.equal(recovered.replayed,true);assert.equal(recovered.state.balanceEur,1_185_500_000);
      assert.deepEqual(await counts(13),{operations:1,receipts:1});
    } finally {await recovery.close();}
  } finally {
    await admin.exec("rollback").catch(()=>{});
    await Promise.allSettled(sessions.map(db=>db.close()));
  }
});
