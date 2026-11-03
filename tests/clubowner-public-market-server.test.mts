import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { parsePublicOwnerProfile, publicOwnerId } from '../lib/touchlineArena/clubowner-public-contract.ts';
import { parseExchangeDiscovery } from '../lib/touchlineFantasy/exchange-discovery.ts';
import { marketObject } from '../lib/touchlineArena/clubowner-public-market-contract.ts';
import type { PublicMarketDependencies } from '../lib/touchlineArena/clubowner-public-market-handler.ts';
const id = (n: number) => `${n.toString().padStart(8,'0')}-1111-4111-8111-111111111111`;
const actor=id(1),target=id(2),publicId=id(3),season=id(4);
function fixture(options:{ authError?:boolean;missingSession?:boolean;guest?:boolean;admin?:boolean;collectionError?:boolean;missingCollection?:boolean;hidden?:boolean;gateOff?:boolean }={}){
 const calls:unknown[][]=[]; const exported:Record<string,unknown>={};
 const discovery={version:1,accountId:actor,seasonId:season,collectionRevision:2,ownListedIds:[],reservations:[],listings:[],proposals:[]};
 const db={rpc(name:string,args:unknown){calls.push(['rpc',name,args]);return{abortSignal:async()=>({error:null,data:name==='touchline_people_directory_candidates'?(options.hidden?[]:[{accountId:target,publicId,displayName:'Public name',followerCount:0,following:false,viewer:'member'}]):name==='touchline_club_exchange_discovery'?discovery:{ok:true}})};},from(table:string){calls.push(['table',table]);const chain={select:(columns:string)=>{calls.push(['columns',columns]);return chain;},eq:(k:string,v:string)=>{calls.push(['eq',k,v]);return chain;},abortSignal:()=>chain,single:async()=>({data:{season_id:season},error:null})};return chain;}};
 const source=ts.transpileModule(readFileSync(new URL('../lib/touchlineArena/clubowner-public-market-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(source,{exports:exported,process:{env:{TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED:options.gateOff?'false':'true'}},AbortSignal,Date,Map,Set,Error,require(name:string){
  if(name==='server-only')return{};
  if(name==='@/lib/supabase/server')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.guest?null:{id:actor,email:options.admin?'admin@test.invalid':'customer@test.invalid'}},error:options.missingSession?{name:'AuthSessionMissingError'}:options.authError?{name:'ProviderError'}:null})}})};
  if(name==='@/lib/supabase/admin')return{createAdminClient:()=>db};
  if(name==='@/lib/admin/owner')return{ownerEmails:()=>['admin@test.invalid'],isOwnerEmail:(email:string)=>email==='admin@test.invalid'};
  if(name==='./auth-access')return{hasTouchLineArenaAccess:()=>true};
  if(name==='./clubowner-public-contract')return{parsePublicOwnerProfile,publicOwnerId};
  if(name==='./server-read-deadline')return{resolveServerReadWithin:async(p:Promise<unknown>,fallback:unknown)=>p.catch(()=>fallback)};
  if(name==='../touchlineFantasy/club-exchange-server')return{clubExchangeEnabled:()=>true};
  if(name==='../touchlineFantasy/exchange-discovery')return{parseExchangeDiscovery};
  if(name==='../touchlineFantasy/club-collection-server')return{createClubCollectionStore:(database:unknown)=>{assert.equal(database,db);return{read:async(a:string,s:string)=>{calls.push(['collection',a,s]);if(options.collectionError)throw new Error('db lost');return options.missingCollection?null:{players:Array(35).fill({}),plan:'standard',revision:2};}};}};
  if(name==='./clubowner-public-market-contract')return{marketObject};
  throw new Error(name);
 }});
 return{deps:(exported.publicMarketDependencies as()=>PublicMarketDependencies)(),calls};
}
test('market adapter resolves published target only and reads collection of authenticated caller only',async()=>{
 const f=fixture();assert.equal((await f.deps.actor())?.accountId,actor);assert.equal(await f.deps.target(publicId,actor),target);
 const snapshot=await f.deps.snapshot(actor);assert.equal(snapshot.discovery.accountId,actor);
 assert.deepEqual(f.calls.find(c=>c[0]==='collection'),['collection',actor,season]);
 assert.ok(!f.calls.some(c=>c[0]==='collection'&&c[1]===target));
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(c=>c[1]==='touchline_people_directory_candidates'))),['rpc','touchline_people_directory_candidates',{p_viewer:actor}]);
 assert.equal(await fixture({hidden:true}).deps.target(publicId,actor),null);
});
test('adapter auth and configuration distinguish guest, admin, errors and disabled gate',async()=>{
 assert.equal(await fixture({guest:true}).deps.actor(),null);assert.equal((await fixture({admin:true}).deps.actor())?.allowed,false);
 await assert.rejects(fixture({authError:true}).deps.actor(),/AUTH_UNAVAILABLE/);assert.equal(fixture({gateOff:true}).deps.enabled,false);
});
test('collection transport failure never masquerades as an incomplete roster',async()=>{
 await assert.rejects(fixture({collectionError:true}).deps.snapshot(actor),/CLUB_STORAGE_UNAVAILABLE/);
 await assert.rejects(fixture({missingCollection:true}).deps.snapshot(actor),/CLUB_COMPLETE_ROSTER_REQUIRED/);
});
test('mutation forwards only resolved identities and validated revision fields to existing atomic RPC',async()=>{
 const f=fixture();const command={proposalId:id(8),context:'a'.repeat(64),seasonId:season,outgoingPlayerId:id(6),incomingPlayerId:id(7),expectedRevision:2,otherExpectedRevision:3};
 await f.deps.propose(actor,target,command);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))),['rpc','touchline_club_exchange_propose',{p_actor:actor,p_season:season,p_id:id(8),p_other:target,p_out:id(6),p_in:id(7),p_actor_revision:2,p_other_revision:3}]);
});
test('supplementary request guard is per-account and separates reads from writes',()=>{
 const {deps}=fixture();for(let i=0;i<10;i++)assert.equal(deps.allow(actor,true),true);
 assert.equal(deps.allow(actor,true),false);assert.equal(deps.allow(target,true),true);assert.equal(deps.allow(actor,false),true);
});

test('missing-session auth response cannot authorize an apparent customer',async()=>{
 const f=fixture({missingSession:true});
 assert.equal(await f.deps.actor(),null);
 assert.equal(f.calls.length,0);
 assert.equal(await fixture({missingSession:true,guest:true}).deps.actor(),null);
});
