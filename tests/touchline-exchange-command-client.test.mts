import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareExchangeCommand,submitExchangeCommand} from '../lib/touchlineFantasy/exchange-command-client.ts';
import {requestClubCollection} from '../lib/touchlineFantasy/club-collection-request.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const envelope=()=>prepareExchangeCommand({expectedAccountId:id(1),expectedSeasonId:id(2),command:{action:'propose',proposalId:id(3),otherAccountId:id(4),outgoingPlayerId:id(5),incomingPlayerId:id(6),expectedRevision:1,otherExpectedRevision:2}})!;
const terms={proposer:{accountId:id(1),name:'A'},accepter:{accountId:id(4),name:'B'},outgoing:{playerId:id(5),name:'A card',valueTc:80},incoming:{playerId:id(6),name:'B card',valueTc:100},quote:{feeTc:4,bonusTc:2,retiredTc:2,compensationTc:-20}};
const result=(payload:unknown,status=200)=>({response:new Response(null,{status}),payload});
const success={ok:true,accountId:id(1),seasonId:id(2),proposalId:id(3),status:'pending',terms,replayed:false};
const current={isCurrent:()=>true};
test('preparation freezes exact command, rejects injected amounts and absent context',()=>{
 const e=envelope();assert.ok(Object.isFrozen(e));assert.ok(Object.isFrozen(e.command));
 for(const value of [null,{}, {...e,expectedAccountId:'invalid'}, {...e,command:{...e.command,feeTc:0}}, {...e,command:{...e.command,expectedRevision:-1}}, {...e,command:{...e.command,otherAccountId:id(1)}}]){
  assert.equal(prepareExchangeCommand(value),null);
 }
});
test('one POST preserves original proposal ID on caller-controlled replay; no prices supplied',async()=>{
 const e=envelope();const bodies:string[]=[];
 const request=async(path:string,options?:RequestInit,timeout?:number)=>{assert.equal(path,'/api/touchline-fantasy/exchange');assert.equal(options?.method,'POST');assert.equal(options?.credentials,'same-origin');assert.equal(timeout,20000);bodies.push(String(options?.body));return result(success);};
 assert.equal((await submitExchangeCommand(e,current,request)).status,'confirmed');
 assert.equal((await submitExchangeCommand(e,current,request)).status,'confirmed');
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.equal(JSON.parse(bodies[0]).command.proposalId,id(3));assert.ok(!bodies[0].includes('valueTc'));
});
test('wrong identity, corrupt fee, foreign proposal and malformed success stay unconfirmed',async()=>{
 for(const payload of [{ok:true}, {...success,proposalId:id(8)}, {...success,terms:{...terms,accepter:{accountId:id(9),name:'X'}}},
 {...success,terms:{...terms,quote:{...terms.quote,bonusTc:3,retiredTc:1}}}, {...success,replayed:'false'}])assert.equal((await submitExchangeCommand(envelope(),current,async()=>result(payload))).status,'unconfirmed');
});
test('no request after prior abort/context change; delayed response fenced without retry',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const request=async()=>{calls++;return result(success);};
 assert.equal((await submitExchangeCommand(envelope(),{...current,signal:controller.signal},request)).status,'not-sent');
 assert.equal((await submitExchangeCommand(envelope(),{isCurrent:()=>false},request)).status,'context-changed');assert.equal(calls,0);
 let active=true;
 assert.equal((await submitExchangeCommand(envelope(),{isCurrent:()=>active},async()=>{calls++;active=false;return result(success);})).status,'context-changed');assert.equal(calls,1);
});
test('transport/JSON deadline is unknown outcome, never auto-retried or marked rejected',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=(async()=>{calls++;return {status:200,ok:true,json:()=>new Promise(()=>{})} as unknown as Response;}) as typeof fetch;
 try{assert.equal((await submitExchangeCommand(envelope(),current,(p,o)=>requestClubCollection(p,o,10))).status,'unconfirmed');assert.equal(calls,1);}finally{globalThis.fetch=original;}
 assert.deepEqual(await submitExchangeCommand(envelope(),current,async()=>result({ok:false,error:'CLUB_PLAYER_RESERVED'},409)),{status:'rejected',code:'CLUB_PLAYER_RESERVED'});
 assert.equal((await submitExchangeCommand(envelope(),current,async()=>result({ok:false,error:'CLUB_STORAGE_UNAVAILABLE'},503))).status,'unconfirmed');
});
test('listing and resolve acknowledgements must match action; accept requires a scoped acknowledgement',async()=>{
 const make=(command:unknown)=>prepareExchangeCommand({expectedAccountId:id(1),expectedSeasonId:id(2),command})!;
 const listing=make({action:'list',playerId:id(5)});
 assert.equal((await submitExchangeCommand(listing,current,async()=>result({ok:true,accountId:id(1),seasonId:id(2),listed:true,playerId:id(5)}))).status,'confirmed');
 assert.equal((await submitExchangeCommand(listing,current,async()=>result({ok:true,accountId:id(1),seasonId:id(2),listed:false,playerId:id(5)}))).status,'unconfirmed');
 const accept=prepareExchangeCommand({expectedAccountId:id(4),expectedSeasonId:id(2),command:{action:'accept',proposalId:id(3)}})!;
 assert.equal((await submitExchangeCommand(accept,current,async()=>result({ok:true,status:'accepted',replayed:false}))).status,'unconfirmed');
 const ack={proposalId:id(3),accountId:id(4),seasonId:id(2)};
 assert.equal((await submitExchangeCommand(accept,current,async()=>result({ok:true,status:'accepted',...ack,replayed:true}))).status,'confirmed');
});
