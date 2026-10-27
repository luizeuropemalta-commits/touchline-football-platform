import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clubRoundDatabase } from "./helpers/club-round-database.mts";
import { parseClubCoachLifecycleResponse } from "../lib/touchlineFantasy/club-coach-lifecycle-response.ts";
import type { ClubCoachLifecycleResponse } from "../lib/touchlineFantasy/club-coach-lifecycle-response.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const migration=readFileSync(new URL("../supabase/migrations/20261025193152_club_collection_atomic_coach_lifecycle.sql",import.meta.url),"utf8");

test("coach lifecycle atomically releases, retains vacancy, hires, preserves earned points and replays historical receipts",async()=>{
 const db=await clubRoundDatabase();
 try {
  await db.exec(`create table touchline_coach_fixture_points(contract_id uuid,fixture_context text,outcome text,touchline_points int,scoring_version text);
    insert into users values('${id(1)}'),('${id(9)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${id(3)}');
    insert into football_clubs values('${id(20)}','sportmonks','20');
    insert into football_rounds values('${id(4)}','${id(2)}','${id(3)}','Gameweek 1');
    insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(2)}','${id(3)}',2990,'GBP',400000000,3);
    insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${id(1)}','active','qa_grant','vip');
    insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(6)}','${id(4)}','${id(2)}','${id(3)}',clock_timestamp()+interval '2 hours','NS');
    select touchline_fantasy_sync_gameweeks();`);
  const scoring=readFileSync(new URL('../supabase/qa/017_touchline_qa_score_points_engine_v2.sql',import.meta.url),'utf8');
  const start=scoring.indexOf('create or replace function public.touchline_coach_points_snapshot(');
  await db.exec(scoring.slice(start,scoring.indexOf('\n$$;',start)+4));
  await db.exec(migration);
  // Inspect the installed routine, not just the migration text. PGlite proves
  // function installation/order, but does not prove two-session PG scheduling.
  const definition=(await db.query<{definition:string}>("select pg_get_functiondef('public.touchline_club_coach_lifecycle(uuid,uuid,jsonb,jsonb)'::regprocedure) definition")).rows[0].definition;
  const ordered=['perform public.touchline_club_lock_open_round',"'touchline-fantasy-subscription:'","'touchline-club-ownership:'",'select * into v_current','if not exists(select 1 from public.touchline_fantasy_entitlements'];
  const offsets=ordered.map(marker=>definition.indexOf(marker));
  assert.ok(offsets.every((offset,index)=>offset>=0 && (index===0 || offset>offsets[index-1])), 'round/subscription/ownership locks precede collection and entitlement reads');
  assert.equal(definition.split("'touchline-fantasy-subscription:'").length-1,1);

  const before={revision:1,seasonId:id(3),plan:'vip',balanceEur:100_000_000,coach:{id:'307',tier:'sapphire-blue',valueEur:10_000_000},players:[],receipts:[]};
  await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,1,$3)',[id(1),id(3),JSON.stringify(before)]);
  const authority={expectedAccountId:id(1),expectedSeasonId:id(3)};
  const release={action:'release-coach',currentCoachId:'307',expectedRevision:1,idempotencyKey:'release_coach_1'};
  const offer={id:'308',tier:'radiant-gold',valueEur:25_000_000,clubId:id(20),published:true};
  const run=async(command:object,coach:object|null=null,owner=id(1))=>(await db.query<{result:ClubCoachLifecycleResponse}>('select touchline_club_coach_lifecycle($1,$2,$3,$4) result',[owner,id(3),JSON.stringify(command),coach?JSON.stringify(coach):null])).rows[0].result;
  const read=async()=>(await db.query<{state:ClubAcquisitionState}>('select state from touchline_club_collections where user_id=$1',[id(1)])).rows[0].state;
  await assert.rejects(run(release,null,id(9)),/CLUB_COLLECTION_REQUIRED/);
  await assert.rejects(run({...release,feeCredits:0}),/CLUB_INVALID_REQUEST/);
  await assert.rejects(run({...release,expectedRevision:0}),/CLUB_STALE_REVISION/);
  await db.exec("update touchline_fantasy_entitlements set current_period_end=clock_timestamp()-interval '1 second'");
  await assert.rejects(run(release),/CLUB_ACCESS_REQUIRED/);
  await db.exec('update touchline_fantasy_entitlements set current_period_end=null');
  await db.exec(`create function reject_coach_receipt() returns trigger language plpgsql as $$begin raise exception 'TEST_RECEIPT_FAILURE';end;$$;
    create trigger reject_coach_receipt before insert on touchline_club_coach_operations for each row execute function reject_coach_receipt();`);
  await assert.rejects(run(release),/TEST_RECEIPT_FAILURE/);
  assert.deepEqual(await read(),before);
  await db.exec('drop trigger reject_coach_receipt on touchline_club_coach_operations');
  const released=await run(release);
  assert.equal(released.state.coach,null);assert.equal(released.state.balanceEur,109_000_000);
  assert.equal(("feeCredits" in released.receipt ? released.receipt.feeCredits : null),1_000_000);assert.equal(("refundCredits" in released.receipt ? released.receipt.refundCredits : null),9_000_000);
  assert.ok(parseClubCoachLifecycleResponse(released,release,authority,before));
  assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_coach_contracts')).rows[0].n,0,'no invented historical contract');
  const hire={action:'hire-coach',incomingCoachId:'308',expectedRevision:2,idempotencyKey:'hire_coach_2'};
  await assert.rejects(run(hire,{...offer,valueEur:1}),/CLUB_PRICE_INVALID/);
  await assert.rejects(run(hire,{...offer,published:false}),/CLUB_COACH_UNAVAILABLE/);
  await db.exec(`create function reject_coach_hire() returns trigger language plpgsql as $$begin raise exception 'TEST_HIRE_FAILURE';end;$$;
    create trigger reject_coach_hire before insert on touchline_club_coach_operations for each row execute function reject_coach_hire();`);
  await assert.rejects(run(hire,offer),/TEST_HIRE_FAILURE/);
  assert.deepEqual(await read(),released.state);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_coach_contracts')).rows[0].n,0,'failed receipt rolls back contract as well as debit');
  await db.exec('drop trigger reject_coach_hire on touchline_club_coach_operations');
  const hired=await run(hire,offer);
  assert.equal(hired.state.balanceEur,84_000_000);assert.equal(hired.state.coach?.id,'308');
  assert.ok(parseClubCoachLifecycleResponse(hired,hire,authority,released.state));
  const contract=(await db.query<{id:string;status:string;scoring_version:string}>('select id,status,scoring_version from touchline_coach_contracts')).rows[0];
  assert.equal(contract.status,'active');assert.equal(contract.scoring_version,'coach_scoring_v2');
  await db.query("insert into touchline_coach_fixture_points values($1,'home','win',20,'coach_scoring_v2')",[contract.id]);
  await assert.rejects(run({...hire,expectedRevision:3,idempotencyKey:'hire_coach_again'},offer),/CLUB_COACH_ALREADY_OWNED/);
  const nextRelease={action:'release-coach',currentCoachId:'308',expectedRevision:3,idempotencyKey:'release_coach_3'};
  const second=await run(nextRelease);
  assert.equal(second.state.balanceEur,106_500_000);
  assert.equal((await db.query<{status:string}>('select status from touchline_coach_contracts')).rows[0].status,'ended');
  assert.equal((await db.query<{points:number}>("select (points_snapshot->>'totalTouchlinePoints')::int points from touchline_coach_contract_events where event_type='cancelled'")).rows[0].points,20);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from touchline_coach_fixture_points')).rows[0].n,1);
  // No state rollback: original receipt returns original snapshot even after later operations.
  const replay=await run(release);assert.equal(replay.replayed,true);assert.deepEqual(replay.state,released.state);assert.deepEqual(await read(),second.state);
  await assert.rejects(run({...release,currentCoachId:'308'}),/CLUB_IDEMPOTENCY_CONFLICT/);
  await db.exec(`create function touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$begin
    if $1<>'xgxbwqxjssxxuihuwmgy' then raise exception 'WRONG_TARGET';end if;end;$$;`);
  await db.exec(readFileSync(new URL('../supabase/qa/club_market_test_opening.sql',import.meta.url),'utf8'));
  await db.exec("update touchline_qa_club_market_control set enabled=true;update touchline_fantasy_gameweeks set state='LIVE'");
  assert.equal((await run(hire,offer)).replayed,true,'read-only replay survives market closure');
  await assert.rejects(run({...hire,expectedRevision:4,idempotencyKey:'hire_during_live'},offer),/CLUB_MARKET_CLOSED|CLUB_COACH_ROUND_LOCKED/);
  await db.exec('set role authenticated');
  await assert.rejects(run(hire,offer),/permission denied/);
  await assert.rejects(db.query('select * from touchline_club_coach_operations'),/permission denied/);
  await db.exec('reset role');
 } finally {await db.close();}
});

import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import * as authorityModule from "../lib/touchlineFantasy/club-command-authority.ts";
import * as lifecycle from "../lib/touchlineFantasy/club-coach-lifecycle.ts";
import * as responseModule from "../lib/touchlineFantasy/club-coach-lifecycle-response.ts";
import * as deadline from "../lib/touchlineArena/server-read-deadline.ts";
import * as commandReader from "../lib/touchlineFantasy/club-request.ts";
import * as access from "../lib/touchlineArena/auth-access.ts";
import { submitClubCoachLifecycle, recoverClubCoachLifecycle } from "../lib/touchlineFantasy/club-coach-lifecycle-client.ts";
import type { readClubCoachLifecycleRecovery } from "../lib/touchlineFantasy/club-coach-lifecycle-recovery-server.ts";
function moduleLoad(path:string,modules:Record<string,unknown>) {
 const exports:Record<string,unknown>={};
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,Error,require(name:string){assert.ok(Object.hasOwn(modules,name),name);return modules[name];}});
 return exports;
}
const recovery=moduleLoad('../lib/touchlineFantasy/club-coach-lifecycle-recovery-server.ts',{
 'server-only':{},'./club-command-authority.ts':authorityModule,'./club-coach-lifecycle.ts':lifecycle,
 './club-coach-lifecycle-response.ts':responseModule,'../touchlineArena/server-read-deadline.ts':deadline,
}) as {readClubCoachLifecycleRecovery:typeof readClubCoachLifecycleRecovery};

test('actual client and HTTP handler bind session, capability, command and durable historical recovery',async()=>{
 const before:ClubAcquisitionState={revision:1,seasonId:id(3),plan:'vip',balanceEur:100_000_000,coach:{id:'307',tier:'sapphire-blue',valueEur:10_000_000},players:[],receipts:[]};
 const authority={expectedAccountId:id(1),expectedSeasonId:id(3)};
 const command={action:'release-coach' as const,currentCoachId:'307',expectedRevision:1,idempotencyKey:'route_release_coach'};
 let enabled=true,owner=false,auth=true,broken=false,calls=0;
 let record:unknown=null;
 const query={select:()=>query,eq:()=>query,single:async()=>({data:{season_id:id(3)},error:null})};
 const server={clubCoachLifecycleEnabled:()=>enabled,createClubCoachLifecycleRepository:()=>({readCommittedOperation:async()=>record}),
  commitClubCoachLifecycle:async(_admin:unknown,accountId:string,seasonId:string,cmd:typeof command)=>{
    calls++;assert.equal(accountId,id(1));assert.equal(seasonId,id(3));
    const applied=lifecycle.releaseClubCoach(before,cmd,{marketOpen:true,roundLocked:false});
    const response={ok:true,accountId,seasonId,...applied,replayed:false};
    record=broken?{}:{schemaVersion:1,accountId,seasonId,command:cmd,before,response};return response;
  }};
 const route=moduleLoad('../app/api/touchline-fantasy/collection/coach/route.ts',{
  'next/server':{NextResponse:Response},'@/lib/admin/owner':{ownerEmails:()=>['admin@example.invalid'],isOwnerEmail:()=>owner},
  '@/lib/touchlineArena/auth-access':access,'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({error:null,data:{user:auth?{id:id(1),email:'test@example.invalid',app_metadata:{touchline_arena_access_v1:true}}:null}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query})},'@/lib/touchlineFantasy/club-acquisition':acquisition,
  '@/lib/touchlineFantasy/server':{loadTouchlineFantasyReadSnapshot:async()=>({entitlementActive:true,coaches:[]})},
  '@/lib/touchlineFantasy/club-request':commandReader,'@/lib/touchlineFantasy/club-command-authority':authorityModule,
  '@/lib/touchlineFantasy/club-coach-lifecycle':lifecycle,'@/lib/touchlineFantasy/club-coach-lifecycle-server':server,
  '@/lib/touchlineFantasy/club-coach-lifecycle-recovery-server':recovery,
 }) as Record<'POST'|'GET',(request:Request&{nextUrl:URL})=>Promise<Response>>;
 const fetcher=(async(_url:unknown,options:RequestInit)=>route[options.method === 'GET' ? 'GET' : 'POST'](Object.assign(new Request('http://localhost:3319/api/touchline-fantasy/collection/coach',{
  ...options,headers:{...options.headers,origin:'http://localhost:3319'}}),{nextUrl:new URL('http://localhost:3319/api/touchline-fantasy/collection/coach')}))) as typeof fetch;
 enabled=false;assert.equal((await submitClubCoachLifecycle(command,before,authority,fetcher)).status,'rejected');assert.equal(calls,0);
 enabled=true;owner=true;assert.equal((await submitClubCoachLifecycle(command,before,authority,fetcher)).status,'rejected');assert.equal(calls,0);
 owner=false;auth=false;assert.equal((await submitClubCoachLifecycle(command,before,authority,fetcher)).status,'unresolved');assert.equal(calls,0);
 auth=true;assert.equal((await submitClubCoachLifecycle(command,before,{...authority,expectedAccountId:id(9)},fetcher)).status,'unresolved');assert.equal(calls,0);
 const result=await submitClubCoachLifecycle(command,before,authority,fetcher);assert.equal(result.status,'committed');assert.equal(calls,1);
 assert.equal((await submitClubCoachLifecycle(command,before,authority,fetcher)).status,'committed');assert.equal(calls,1,'exact replay does not repeat write');
 enabled=false;assert.equal((await recoverClubCoachLifecycle(command,before,authority,fetcher)).status,'committed');assert.equal(calls,1,'observation after gate closed never writes');enabled=true;
 record=null;broken=true;assert.equal((await submitClubCoachLifecycle(command,before,authority,fetcher)).status,'unresolved');assert.equal(calls,2,'ambiguous durable read never claimed success');
});
