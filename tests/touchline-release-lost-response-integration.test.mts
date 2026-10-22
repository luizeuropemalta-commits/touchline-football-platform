import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { clubRoundDatabase } from './helpers/club-round-database.mts';
import * as acquisition from '../lib/touchlineFantasy/club-acquisition.ts';
import * as authority from '../lib/touchlineFantasy/club-command-authority.ts';
import * as budget from '../lib/touchlineFantasy/club-initial-budget.ts';
import * as release from '../lib/touchlineFantasy/club-release.ts';
import * as bootstrap from '../lib/touchlineFantasy/club-collection-bootstrap.ts';
import * as commandReader from '../lib/touchlineFantasy/club-request.ts';
import type { useClubCollection } from '../components/touchline/fantasy/useClubCollection.ts';

// Reuse the existing lightweight hook scheduler, not its tests or fabricated replies.
// Product hook and route are real. Only auth/HTTP boundaries are synthetic; RPC is SQL.
test('real release route and SQL survive a lost committed reply and explicit same-key hook recovery',async()=>{
  const id=(n:number)=>`99000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const accountId=id(1),seasonId=id(3);
  const initial:acquisition.ClubAcquisitionState={revision:1,seasonId,plan:'vip',balanceEur:100_000_000,
    coach:{id:'fixture-coach',tier:'sapphire-blue',valueEur:10_000_000},
    players:[{playerId:id(7),clubId:id(20),position:'RB',primaryDetail:'Right Back',area:'outside',slot:1,valueEur:10_000_000},
      {playerId:id(8),clubId:id(20),position:'CB',primaryDetail:'Centre Back',area:'reserves',slot:1,valueEur:20_000_000}],
    receipts:[{key:'original_purchase',playerId:id(7),area:'outside',slot:1,valueEur:10_000_000,revision:1}]};
  const sourceUrl=new URL('./touchline-club-collection-hook.test.mts',import.meta.url);
  const source=readFileSync(sourceUrl,'utf8');
  const start=source.indexOf('type PendingRequest ='),end=source.indexOf('const tick=');
  assert.ok(start>=0&&end>start,'existing hook harness boundary');
  const harnessCode=source.slice(start,end).replaceAll('import.meta.url',JSON.stringify(sourceUrl.href));
  type RequestSlot={path:string;options:{body:string};resolve:(value:unknown)=>void;reject:(error:Error)=>void};
  const harnessExports:Record<string,()=>{render:()=>ReturnType<typeof useClubCollection>;requests:RequestSlot[]}>={};
  runInNewContext(ts.transpileModule(harnessCode+'\nexports.fixture=fixture;',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports:harnessExports,assert,readFileSync,URL,ts,runInNewContext,randomUUID,AbortController,accountId,initial,
    acquisition,authority,budget,release,bootstrap});
  const h=harnessExports.fixture();
  const db=await clubRoundDatabase();
  try {
    for(const file of ['20261018051627_club_collection_atomic_release','20261018150231_club_release_receipts_service_role_least_privilege'])
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}.sql`,import.meta.url),'utf8'));
    await db.exec(`insert into users values('${accountId}'),('${id(9)}');insert into football_competitions values('${id(2)}');insert into football_seasons values('${seasonId}');
      insert into football_rounds values('${id(4)}','${id(2)}','${seasonId}','Gameweek 1');
      insert into touchline_fantasy_configs(competition_key,competition_id,season_id,subscription_price_minor,subscription_currency,budget_eur,max_players_per_club)
      values('england','${id(2)}','${seasonId}',2990,'GBP',400000000,3);
      insert into touchline_fantasy_entitlements(user_id,status,source,plan_key) values('${accountId}','active','qa_grant','vip');
      insert into football_fixtures(id,round_id,competition_id,season_id,starts_at,status) values('${id(6)}','${id(4)}','${id(2)}','${seasonId}',clock_timestamp()+interval '2 hours','NS');
      select touchline_fantasy_sync_gameweeks();
      grant select on touchline_fantasy_entitlements,touchline_fantasy_gameweeks,touchline_fantasy_user_gameweeks to service_role;`);
    await db.query('insert into touchline_club_collections(user_id,season_id,revision,state) values($1,$2,1,$3::jsonb)',[accountId,seasonId,JSON.stringify(initial)]);
    const read=async()=>(await db.query<{state:acquisition.ClubAcquisitionState}>('select state from touchline_club_collections where user_id=$1',[accountId])).rows[0].state;
    let session=accountId,rpcCalls=0;
    const modules:Record<string,unknown>={
      'next/server':{NextResponse:Response},
      '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:session}},error:null})}})},
      '@/lib/supabase/admin':{createAdminClient:()=>({from:(table:string)=>{
        assert.equal(table,'touchline_fantasy_configs');const q={select:()=>q,eq:()=>q,single:async()=>({data:{season_id:seasonId},error:null})};return q;
      },rpc:async(name:string,args:{p_user_id:string;p_season_id:string;p_command:unknown})=>{
        assert.equal(name,'touchline_club_release_player');rpcCalls++;
        await db.exec('set role service_role');
        try {return {data:(await db.query('select touchline_club_release_player($1,$2,$3::jsonb) result',[args.p_user_id,args.p_season_id,JSON.stringify(args.p_command)])).rows[0].result,error:null};}
        finally {await db.exec('reset role');}
      }})},
      '@/lib/touchlineFantasy/club-collection-server':{clubReleaseEnabled:()=>true},
      '@/lib/touchlineFantasy/club-acquisition':acquisition,'@/lib/touchlineFantasy/club-request':commandReader,
      '@/lib/touchlineFantasy/club-command-authority':authority,'@/lib/touchlineFantasy/club-release':release,
    };
    const exports:{POST?:(request:Request)=>Promise<Response>}={};
    runInNewContext(ts.transpileModule(readFileSync(new URL('../app/api/touchline-fantasy/collection/release/route.ts',import.meta.url),'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,Error,require:(name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];}});
    const post=async(body:string)=>{
      const url=new URL('https://fixture.invalid/api/touchline-fantasy/collection/release');
      return exports.POST!(Object.assign(new Request(url,{method:'POST',headers:{origin:url.origin,'content-type':'application/json'},body}),{nextUrl:url}));
    };
    const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
    const get=async(index:number)=>{h.requests[index].resolve({response:{ok:true,status:200},payload:{ok:true,state:await read(),accountId,seasonId,releaseAvailable:true}});await tick();};
    acquisition.inspectClubAcquisition(initial);
    h.render();await get(0);assert.equal(h.render().ready,true);
    const operation=h.render().release(id(7),1);
    const body=h.requests[1].options.body;
    assert.equal(h.requests[1].path,'/api/touchline-fantasy/collection/release');
    const committed=await post(body);assert.equal(committed.status,200);
    const first=await committed.json();assert.equal(first.replayed,false);
    assert.equal(first.receipt.paid_credits,10_000_000);assert.equal(first.receipt.fee_credits,1_000_000);assert.equal(first.receipt.refund_credits,9_000_000);
    h.requests[1].reject(new Error('lost response after actual SQL commit'));assert.equal(await operation,false);
    assert.equal(h.render().hasPending,true);assert.deepEqual(h.render().state,initial,'no optimistic refund');
    assert.equal((await read()).balanceEur,109_000_000);
    h.render().reload();h.render();await get(2);
    assert.equal(h.render().hasPending,true,'GET absence is not a release receipt');
    assert.equal(await h.render().purchase(id(10),{area:'outside',slot:1}),false);
    session=id(9);const calls=rpcCalls;const denied=await post(body);
    assert.equal(denied.status,409);assert.equal((await denied.json()).error,'CLUB_CONTEXT_CHANGED');assert.equal(rpcCalls,calls);
    // The rejected cross-session probe is not delivered into the original hook.
    // A 409 delivered to that hook intentionally revokes its authority; not remount coverage.
    session=accountId;const retry=h.render().retryPending();assert.equal(h.requests[3].options.body,body);
    const replay=await post(h.requests[3].options.body);const payload=await replay.json();
    assert.equal(replay.status,200);assert.equal(payload.replayed,true);
    h.requests[3].resolve({response:{ok:true,status:200},payload});assert.equal(await retry,true);
    assert.equal(h.render().hasPending,false);assert.deepEqual(h.render().state,await read());
    const final=await read();assert.equal(final.balanceEur,109_000_000);assert.equal(final.revision,2);
    assert.deepEqual(final.players,[initial.players[1]]);assert.deepEqual(final.coach,initial.coach);assert.deepEqual(final.receipts,initial.receipts);
    for(const table of ['touchline_club_release_receipts','touchline_club_collection_operations'])
      assert.equal((await db.query<{n:number}>(`select count(*)::int n from ${table}`)).rows[0].n,1);
    assert.equal(rpcCalls,2,'first commit plus explicit replay only');
  } finally {await db.close();}
});
