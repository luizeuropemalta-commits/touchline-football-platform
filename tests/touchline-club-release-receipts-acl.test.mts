import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
const sql=(file:string)=>readFileSync(new URL(`../supabase/migrations/${file}.sql`,import.meta.url),"utf8");
const release=sql("20261018051627_club_collection_atomic_release");
const hardening=sql("20261018150231_club_release_receipts_service_role_least_privilege");
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("receipt hardening removes inherited defaults, replays safely and preserves invoker release",async()=>{
  const db=await clubRoundDatabase();
  try {
    await db.exec("alter default privileges in schema public grant all on tables to service_role");
    await db.exec(release);
    const defaults=async()=>(await db.query("select defaclacl::text from pg_default_acl order by oid")).rows;
    const beforeDefaults=await defaults();
    const acl=async()=>(await db.query<{privilege_type:string;is_grantable:boolean}>(`select privilege_type,is_grantable from pg_class c,
      lateral aclexplode(c.relacl) a where c.oid='public.touchline_club_release_receipts'::regclass
      and a.grantee='service_role'::regrole order by privilege_type`)).rows;
    assert.ok((await acl()).some(row=>row.privilege_type==="DELETE"));
    const fingerprint=async()=>(await db.query<{hash:string}>("select md5(pg_get_functiondef('public.touchline_club_release_player(uuid,uuid,jsonb)'::regprocedure)) hash")).rows[0].hash;
    const beforeHash=await fingerprint();
    assert.equal(beforeHash,"c45f054dfb5b83bc509fdebb53107a7d");
    await db.exec(hardening);
    const expected=[{privilege_type:"INSERT",is_grantable:false},{privilege_type:"SELECT",is_grantable:false}];
    assert.deepEqual(await acl(),expected);
    await db.exec(hardening);
    assert.deepEqual(await acl(),expected);
    assert.deepEqual(await defaults(),beforeDefaults,"global defaults untouched");
    assert.equal(await fingerprint(),beforeHash);
    await db.exec(`insert into users values('${id(1)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
      insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','vip');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();
      grant select on touchline_fantasy_entitlements,touchline_fantasy_gameweeks,touchline_fantasy_user_gameweeks to service_role;`);
    const state={revision:1,seasonId:id(3),plan:"vip",balanceEur:1145000000,
      coach:{id:"coach",tier:"sapphire-blue",valueEur:10000000},players:[{playerId:id(7),clubId:id(20),position:"RB",area:"outside",slot:1,valueEur:45000000}],
      receipts:[{key:"purchase_original",playerId:id(7),area:"outside",slot:1,valueEur:45000000,revision:1}]};
    await db.query("insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,1,$3::jsonb)",[id(1),id(3),JSON.stringify(state)]);
    await db.exec("set role service_role");
    const run=async()=>(await db.query<{result:{replayed:boolean;state:typeof state;receipt:{fee_credits:number;refund_credits:number}}}>(
      "select touchline_club_release_player($1,$2,$3::jsonb) result",[id(1),id(3),JSON.stringify({action:"release",playerId:id(7),expectedRevision:1,idempotencyKey:"release_acl"})])).rows[0].result;
    const first=await run();
    assert.equal(first.replayed,false);assert.equal(first.receipt.fee_credits,4500000);assert.equal(first.receipt.refund_credits,40500000);
    assert.equal(first.state.balanceEur,1185500000);assert.equal(first.state.players.length,0);
    assert.deepEqual(first.state.receipts,state.receipts);
    const replay=await run();assert.equal(replay.replayed,true);assert.deepEqual(replay.state,first.state);
    assert.equal((await db.query<{n:number}>("select count(*)::int n from touchline_club_release_receipts")).rows[0].n,1);
    await assert.rejects(db.exec("delete from touchline_club_release_receipts"),/permission denied/);
    await assert.rejects(db.exec("update touchline_club_release_receipts set refund_credits=0"),/permission denied/);
    await assert.rejects(db.exec("truncate touchline_club_release_receipts"),/permission denied/);
    await db.exec("reset role;set role authenticated");
    await assert.rejects(db.exec("select * from touchline_club_release_receipts"),/permission denied/);
    await db.exec("reset role");
    await db.exec("grant select on touchline_club_release_receipts to anon");
    await assert.rejects(db.exec(hardening),/CLUB_RELEASE_ACL_PREIMAGE_DRIFT/);
    await db.exec("rollback");
    assert.deepEqual(await acl(),expected,"failed guard leaves hardened receipt unchanged");
  } finally {await db.close();}
});
