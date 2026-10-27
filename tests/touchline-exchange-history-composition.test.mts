import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {readExchangeHistory} from '../lib/touchlineFantasy/exchange-history-client.ts';
import {parseExchangeDiscovery} from '../lib/touchlineFantasy/exchange-discovery.ts';
import {projectExchangeLedger} from '../lib/touchlineFantasy/exchange-ledger-projection.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function load(path:string,deps:Record<string,unknown>){
 const exports:Record<string,unknown>={};
 const js=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(js,{exports,process:{env:{}},require:(name:string)=>{if(name in deps)return deps[name];throw Error(name);}});return exports;
}
function setup(options:{account?:string;revision?:number;enabled?:boolean;rpcError?:boolean;corrupt?:boolean}={}){
 let rpcCalls=0;
 const admin={from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{season_id:id(2)},error:null})})})})}),
 rpc:async(name:string,args:unknown)=>{rpcCalls++;assert.equal(name,'touchline_club_exchange_history');assert.equal(JSON.stringify(args),JSON.stringify({p_actor:id(1),p_season:id(2)}));return {error:options.rpcError?{}:null,data:{accountId:options.corrupt?id(9):id(1),seasonId:id(2),collectionRevision:options.revision??7,coverage:'complete',seasonNegotiationIncomeTc:0,receipts:[]}};}};
 const server=load('../lib/touchlineFantasy/club-exchange-server.ts',{'server-only':{},'./exchange-ledger-projection':{projectExchangeLedger},'./exchange-discovery':{parseExchangeDiscovery}});
 const route=load('../app/api/touchline-fantasy/exchange/history/route.ts',{
 'next/server':{NextResponse:{json:(body:unknown,init:ResponseInit)=>new Response(JSON.stringify(body),init)}},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:options.account??id(1),email:'customer@example.test'}},error:null})}})},
 '@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/admin/owner':{ownerEmails:()=>['owner@example.test'],isOwnerEmail:()=>false},
 '@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>true},
 '@/lib/touchlineFantasy/club-exchange-server':{...server,clubExchangeEnabled:()=>options.enabled!==false}});
 return {calls:()=>rpcCalls,request:async(path:string,init?:RequestInit)=>{const request=new Request(`https://qa.example.test${path}`,init);Object.assign(request,{nextUrl:new URL(request.url)});const response=await (route.GET as (request: Request) => Promise<Response>)(request);return {response,payload:await response.json()};}};
}
const scope={ready:true,accountId:id(1),seasonId:id(2),collectionRevision:7};
test('actual GET and server adapter compose with history client and coherent RPC envelope',async()=>{
 const harness=setup();const history=await readExchangeHistory(scope,undefined,harness.request);
 assert.equal(history?.accountId,id(1));assert.equal(history?.coverage,'complete');assert.equal(history?.seasonNegotiationIncomeTc,0);assert.equal(harness.calls(),1);
});
test('account change and disabled backend cannot query or present another ledger',async()=>{
 for(const options of [{account:id(9)},{enabled:false}]){const harness=setup(options);assert.equal(await readExchangeHistory(scope,undefined,harness.request),null);assert.equal(harness.calls(),0);}
});
test('RPC error, foreign envelope and revision race remain unavailable rather than empty history',async()=>{
 for(const options of [{rpcError:true},{corrupt:true},{revision:8}]){const harness=setup(options);assert.equal(await readExchangeHistory(scope,undefined,harness.request),null);assert.equal(harness.calls(),1);}
});
