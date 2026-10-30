import test from 'node:test';import assert from 'node:assert/strict';
import {parseExchangeDiscovery} from '../lib/touchlineFantasy/exchange-discovery.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={ready:true,accountId:id(1),seasonId:id(2),collectionRevision:7};
const player={playerId:id(3),clubId:id(9),name:'Card',valueTc:80,position:'MID',primaryDetail:'CM'};
const proposal={proposalId:id(6),status:'pending',expiresAt:'2026-12-01T00:00:00Z',proposer:{accountId:id(1),name:'A'},accepter:{accountId:id(4),name:'B'},outgoing:player,incoming:{...player,playerId:id(5),valueTc:100},quote:{feeTc:4,bonusTc:2,retiredTc:2,compensationTc:-20}};
const data={version:1,...scope,ownListedIds:[id(3)],reservations:[{playerId:id(3),proposalId:id(6)}],listings:[{owner:{accountId:id(4),name:'B'},collectionRevision:2,player}],proposals:[proposal]};
test('discovery strips private extras and requires exact account season revision',()=>{
 const result=parseExchangeDiscovery({...data,wallet:500,proposals:[{...proposal,proposerContract:{private:true}}]},scope);
 assert.ok(result);assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('wallet'));
 for(const patch of [{accountId:id(7)},{seasonId:id(7)},{collectionRevision:8},{ready:false}])assert.equal(parseExchangeDiscovery(data,{...scope,...patch}),null);
});
test('foreign proposals, duplicate records and corrupt amounts cannot enter discovery',()=>{
 for(const patch of [{ownListedIds:[id(3),id(3)]},{reservations:[...data.reservations,...data.reservations]},{listings:[...data.listings,...data.listings]},{proposals:[proposal,proposal]},
 {proposals:[{...proposal,proposer:{accountId:id(8),name:'foreign'}}]}, {proposals:[{...proposal,quote:{...proposal.quote,bonusTc:3,retiredTc:1}}]}, {listings:[{...data.listings[0],player:{...player,valueTc:null}}]}])assert.equal(parseExchangeDiscovery({...data,...patch},scope),null);
});
test('empty authenticated discovery is explicit, missing discovery stays unavailable',()=>{
 assert.equal(parseExchangeDiscovery(null,scope),null);assert.ok(parseExchangeDiscovery({...data,ownListedIds:[],reservations:[],listings:[],proposals:[]},scope));
});

test('negotiation permission accepts only explicit server true; missing and malformed values fail closed',()=>{
 for(const permission of [undefined,null,false,'true',1,true]){
  const parsed=parseExchangeDiscovery({...data,listings:[{...data.listings[0],negotiationAllowed:permission}],proposals:[{...proposal,negotiationAllowed:permission}]},scope);
  assert.ok(parsed);assert.equal(parsed.listings[0].negotiationAllowed,permission===true);assert.equal(parsed.proposals[0].negotiationAllowed,permission===true);
 }
});

test('only an explicit Beta pairing restriction authorizes upgrade presentation',()=>{
 for(const permission of [undefined,null,false,'false',true]) for(const reason of [undefined,null,'beta-pair','unavailable',{},1]){
  const parsed=parseExchangeDiscovery({...data,listings:[{...data.listings[0],negotiationAllowed:permission,restrictionReason:reason}],proposals:[{...proposal,negotiationAllowed:permission,restrictionReason:reason}]},scope)!;
  const expected=permission===false&&reason==='beta-pair'?'beta-pair':null;
  assert.equal(parsed.listings[0].restrictionReason,expected);assert.equal(parsed.proposals[0].restrictionReason,expected);
 }
});
