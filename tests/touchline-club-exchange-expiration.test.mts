import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {timingSafeEqual} from 'node:crypto';
import ts from 'typescript';
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function load(path:string,deps:Record<string,unknown>,globals:Record<string,unknown>={}){
 const exports:Record<string,unknown>={};
 runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(key:string)=>{if(!(key in deps))throw new Error(key);return deps[key];},AbortController,Date,setTimeout,clearTimeout,Buffer,...globals});return exports;
}
type Result={status:string;examined:number;expired:number;skipped:number};
function helper(enabled:boolean){return load('../lib/touchlineFantasy/club-exchange-expiration-server.ts',{'server-only':{},'./club-exchange-server':{clubExchangeEnabled:()=>enabled}}).expireClubExchangeProposals as(admin:unknown)=>Promise<Result>;}
function admin(rows:unknown[],run:(args:Record<string,unknown>)=>Promise<unknown>){
 const filters:unknown[][]=[];const query={select:(...a:unknown[])=>{filters.push(['select',...a]);return query;},eq:(...a:unknown[])=>{filters.push(['eq',...a]);return query;},lte:(...a:unknown[])=>{filters.push(['lte',...a]);return query;},order:(...a:unknown[])=>{filters.push(['order',...a]);return query;},limit:(...a:unknown[])=>{filters.push(['limit',...a]);return query;},abortSignal:async()=>({data:rows,error:null})};
 return {filters,from:()=>query,rpc:(name:string,args:Record<string,unknown>)=>{assert.equal(name,'touchline_club_exchange_resolve');return {abortSignal:()=>run(args)};}};
}
test('expiration disabled is no-op; enabled uses pending expired bounded batch and separate idempotent RPCs',async()=>{
 let calls=0;
 assert.equal((await helper(false)({from:()=>{throw Error('gate bypass');}})).status,'disabled');
 const store=admin([1,2].map(n=>({id:id(n),season_id:id(3),proposer_id:id(4)})),async args=>{calls++;assert.equal(args.p_action,'expire');return {data:{ok:true,status:'expired',replayed:calls>1},error:null};});
 const result=await helper(true)(store);
 assert.equal(result.status,'complete');assert.equal(result.expired,1);assert.equal(result.skipped,1);assert.equal(calls,2);
 assert.ok(store.filters.some(x=>x[0]==='eq'&&x[1]==='status'&&x[2]==='pending'));
 assert.ok(store.filters.some(x=>x[0]==='lte'&&x[1]==='expires_at'));
 assert.ok(store.filters.some(x=>x[0]==='limit'&&x[1]===25));
 assert.deepEqual(store.filters.find(x=>x[0]==='select'),['select','id,season_id,proposer_id']);
});
test('expiration never forces valid or concurrently closed proposal; ambiguous failure is not retried',async()=>{
 let calls=0;const store=admin([1,2,3,4].map(n=>({id:id(n),season_id:id(5),proposer_id:id(6)})),async()=>{calls++;return {data:null,error:{message:calls===1?'CLUB_PROPOSAL_NOT_EXPIRED':calls===2?'CLUB_PROPOSAL_CLOSED':'network timeout'}};});
 const result=await helper(true)(store);assert.equal(result.status,'partial');assert.equal(result.skipped,2);assert.equal(calls,3);
});
test('expiration five-second abort does not repeat ambiguous mutation',async()=>{
 let fire=()=>{};let calls=0;let signal:AbortSignal|undefined;
 const expire=load('../lib/touchlineFantasy/club-exchange-expiration-server.ts',{'server-only':{},'./club-exchange-server':{clubExchangeEnabled:()=>true}},{setTimeout:(callback:()=>void,ms:number)=>{assert.equal(ms,5000);fire=callback;return 0;},clearTimeout:()=>{}}).expireClubExchangeProposals as(admin:unknown)=>Promise<Result>;
 const store=admin([{id:id(1),season_id:id(2),proposer_id:id(3)}],async()=>({}));
 const result=await expire({...store,rpc:()=>({abortSignal:async(s:AbortSignal)=>{signal=s;calls++;fire();throw Error('abort');}})});
 assert.equal(signal?.aborted,true);assert.equal(result.status,'partial');assert.equal(calls,1);
});
function route(maintenance:()=>Promise<Result>,provider:()=>Promise<unknown>){return load('../app/api/football-data/live-sync/route.ts',{'node:crypto':{timingSafeEqual},'next/server':{NextResponse:{json:(body:unknown,options:unknown)=>({body,options})}},'@/lib/football-data/live-sync':{syncSportmonksLiveState:provider},'@/lib/supabase/admin':{createAdminClient:()=>({})},'@/lib/touchlineFantasy/club-exchange-expiration-server':{expireClubExchangeProposals:maintenance}},{process:{env:{TOUCHLINE_LIVE_SYNC_SECRET:'s'.repeat(32)}}}).POST as(request:unknown)=>Promise<{body:{exchangeMaintenance:Result};options:{status:number}}>}
const request={headers:new Headers({authorization:`Bearer ${'s'.repeat(32)}`}),json:async()=>({})};
test('existing authenticated tick runs cleanup despite provider failure',async()=>{
 let ran=false;const result=await route(async()=>{ran=true;return {status:'complete',examined:1,expired:1,skipped:0};},async()=>{throw Error('provider down');})(request);
 assert.equal(ran,true);assert.equal(result.options.status,502);assert.equal(result.body.exchangeMaintenance.expired,1);
});
test('cleanup error cannot prevent provider synchronization; unauthorized does neither',async()=>{
 let provider=0;const post=route(async()=>{throw Error('maintenance down');},async()=>{provider++;return {ok:true,status:'complete'};});
 const result=await post(request);assert.equal(provider,1);assert.equal(result.options.status,200);assert.equal(result.body.exchangeMaintenance.status,'unavailable');
 const rejected=await post({headers:new Headers(),json:async()=>({})});assert.equal(rejected.options.status,401);assert.equal(provider,1);
});
