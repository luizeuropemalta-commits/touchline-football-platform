import test from "node:test";
import assert from "node:assert/strict";
import { createClubCoachBrowserRecovery } from "../lib/touchlineFantasy/club-coach-browser-recovery.ts";
import { releaseClubCoach } from "../lib/touchlineFantasy/club-coach-lifecycle.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
const authority={expectedAccountId:'10000000-0000-4000-8000-000000000001',expectedSeasonId:'10000000-0000-4000-8000-000000000002'};
const before:ClubAcquisitionState={revision:1,seasonId:authority.expectedSeasonId,plan:'vip',balanceEur:100_000_000,coach:{id:'307',tier:'sapphire-blue',valueEur:10_000_000},players:[],receipts:[]};
const command={action:'release-coach' as const,currentCoachId:'307',expectedRevision:1,idempotencyKey:'coach_browser_release'};
const applied=releaseClubCoach(before,command,{marketOpen:true,roundLocked:false});
const response={ok:true,accountId:authority.expectedAccountId,seasonId:authority.expectedSeasonId,...applied,replayed:false};
function storage(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}

test('timeout persists exact command; reload only reads receipt then clears journal',async()=>{
 const store=storage();const methods:string[]=[];
 const fetcher=(async(_input,init)=>{methods.push(init!.method!);if(init!.method==='POST')throw Error('network lost after commit');return Response.json({status:'committed',resolved:true,response});}) as typeof fetch;
 const first=createClubCoachBrowserRecovery(authority,store,fetcher);
 assert.equal((await first.submit(command,before)).status,'unresolved');assert.equal(first.hasPending(),true);
 first.close();
 const second=createClubCoachBrowserRecovery(authority,store,fetcher);
 assert.equal((await second.submit({...command,idempotencyKey:'new_unsafe_retry'},before)).status,'unresolved');
 assert.equal((await second.recover()).status,'committed');assert.equal(second.hasPending(),false);
 assert.deepEqual(methods,['POST','GET']);assert.deepEqual(before.coach?.id,'307','no optimistic state mutation');
});
test('journal failures and corruption prevent any POST',async()=>{
 let calls=0;const fetcher=(async()=>{calls++;return Response.json(response);}) as typeof fetch;
 const blocked={getItem:()=>null,setItem:()=>{throw Error('storage denied');},removeItem:()=>{}};
 await assert.rejects(createClubCoachBrowserRecovery(authority,blocked,fetcher).submit(command,before),/storage denied/);assert.equal(calls,0);
 const store=storage();const session=createClubCoachBrowserRecovery(authority,store,fetcher);
 store.data.set(`touchline:coach-command:v1:${authority.expectedAccountId}:${authority.expectedSeasonId}`,'{}');
 await assert.rejects(session.submit(command,before),/CLUB_COACH_RECOVERY_UNAVAILABLE/);assert.equal(calls,0);
});
test('closing generation keeps late committed operation pending for read-only reconciliation',async()=>{
 const store=storage();let release:(response:Response)=>void=()=>{};
 const fetcher=(()=>new Promise<Response>(resolve=>{release=resolve;})) as typeof fetch;
 const session=createClubCoachBrowserRecovery(authority,store,fetcher);
 const pending=session.submit(command,before);session.close();release(Response.json(response));
 assert.equal((await pending).status,'unresolved');assert.equal(session.hasPending(),true);
 const other=createClubCoachBrowserRecovery({...authority,expectedAccountId:'10000000-0000-4000-8000-000000000003'},store,fetcher);
 assert.equal(other.hasPending(),false,'journal isolated by account and season');
});
test('bounded waiting keeps ambiguous command while definitive atomic rejection clears it',async()=>{
 const store=storage();const hanging=(()=>new Promise<Response>(()=>{})) as typeof fetch;
 const session=createClubCoachBrowserRecovery(authority,store,hanging,5);
 assert.equal((await session.submit(command,before)).status,'unresolved');assert.equal(session.hasPending(),true);
 const another=storage();const rejected=(async()=>Response.json({ok:false,error:'CLUB_MARKET_CLOSED'},{status:409})) as typeof fetch;
 const declined=createClubCoachBrowserRecovery(authority,another,rejected);
 assert.equal((await declined.submit(command,before)).status,'rejected');assert.equal(declined.hasPending(),false);
});


test('unobserved recovery never posts automatically; explicit retry retains exact identity and key',async()=>{
 const store=storage();const requests:RequestInit[]=[];
 const fetcher=(async(_input,init)=>{requests.push(init!);if(requests.length===1)throw Error('request interrupted');
  return init!.method==='GET'?Response.json({status:'not_observed',resolved:false}):Response.json(response);}) as typeof fetch;
 const session=createClubCoachBrowserRecovery(authority,store,fetcher);
 await session.submit(command,before);
 assert.equal((await session.recover()).status,'not_observed');assert.equal(requests.length,2);assert.equal(session.hasPending(),true);
 assert.equal((await session.retryPending()).status,'committed');assert.equal(requests[0].body,requests[2].body);
 assert.deepEqual(requests.map(request=>request.method),['POST','GET','POST']);
});


test('a rejected retry cannot erase an earlier ambiguous operation before its durable receipt arrives',async()=>{
 const store=storage();let calls=0;
 const fetcher=(async()=>{calls++;if(calls===1)throw Error('first POST may still commit');
  if(calls===2)return Response.json({status:'not_observed',resolved:false});
  if(calls===3)return Response.json({error:'CLUB_COACH_LIFECYCLE_UNAVAILABLE'},{status:503});
  return Response.json({status:'committed',resolved:true,response});}) as typeof fetch;
 const session=createClubCoachBrowserRecovery(authority,store,fetcher);
 assert.equal((await session.submit(command,before)).status,'unresolved');
 assert.equal((await session.recover()).status,'not_observed');
 assert.equal((await session.retryPending()).status,'unresolved');
 assert.equal(session.hasPending(),true,'gate OFF says nothing about the first POST outcome');
 assert.equal((await session.recover()).status,'committed');
 assert.equal(session.hasPending(),false);assert.equal(calls,4);
});
