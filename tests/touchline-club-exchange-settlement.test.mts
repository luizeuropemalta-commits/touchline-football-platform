import test from 'node:test';
import assert from 'node:assert/strict';
import { settleClubExchange, type ExchangeSettlementSide } from '../lib/touchlineFantasy/club-exchange-settlement.ts';
import { CLUB_POSITION_LIMITS, type PublishedClubOffer } from '../lib/touchlineFantasy/club-acquisition.ts';
import type { ExchangePosition } from '../lib/touchlineFantasy/exchange-eligibility.ts';
function side(id: string): ExchangeSettlementSide {
 const positions = Object.entries(CLUB_POSITION_LIMITS).flatMap(([p,n]) => Array(n).fill(p) as ExchangePosition[]);
 const players = positions.map((position,i) => ({playerId:`${id}-${i}`,clubId:'club',position,valueEur:80_000_000,
 area:(i<11?'starters':i<20?'reserves':'outside') as 'starters'|'reserves'|'outside',slot:i<11?i:i<20?i-11:i-20}));
 return {accountId:id,state:{revision:1,seasonId:'season',plan:'standard',balanceEur:100_000_000,coach:{id:'coach',tier:'ruby-red',valueEur:5_000_000},players,receipts:[]},
 allocation:{ownerId:id,plan:'standard',players,listedIds:[],reservations:[{playerId:`${id}-20`,proposalId:'trade'}],unavailableIds:[],lineupLocked:true},allowedClubIds:['club']};
}
function fixture(){const proposer=side('a'),accepter=side('b');
 const offer=(s:ExchangeSettlementSide,v:number):PublishedClubOffer=>({...s.state.players[20],published:true,valueEur:v});
 return {seasonOpen:true,proposer,accepter,outgoing:offer(proposer,80_000_000),incoming:offer(accepter,100_000_000),proposalId:'trade',expectedProposerRevision:1,expectedAccepterRevision:1};}
test('settlement preserves slots, contract price and single balance; aggregate loses only retired fee',()=>{
 const input=fixture(),before=structuredClone(input),r=settleClubExchange(input);
 assert.equal(r.proposer.balanceEur,75_000_000);assert.equal(r.accepter.balanceEur,122_500_000);
 assert.equal(r.proposer.players[20].valueEur,100_000_000);assert.equal(r.accepter.players[20].valueEur,80_000_000);
 assert.equal(r.proposer.players[20].area,'outside');assert.equal(r.proposer.players[20].slot,0);
 assert.equal(r.proposer.balanceEur+r.accepter.balanceEur,200_000_000-r.quote.retired);
 assert.deepEqual(input,before);
});
test('either insolvent wallet rejects without mutating either snapshot',()=>{
 for(const reverse of [false,true]){const i=fixture();if(reverse){i.outgoing={...i.outgoing,valueEur:100_000_000};i.incoming={...i.incoming,valueEur:80_000_000};i.accepter={...i.accepter,state:{...i.accepter.state,balanceEur:0}};}else i.proposer={...i.proposer,state:{...i.proposer.state,balanceEur:0}};
 const before=structuredClone(i);assert.throws(()=>settleClubExchange(i),/INSUFFICIENT/);assert.deepEqual(i,before);}
});
test('rejects stale revisions, mismatched allocation, wrong season and disallowed received club',()=>{
 const stale=fixture();stale.expectedAccepterRevision=0;assert.throws(()=>settleClubExchange(stale),/STALE/);
 const season=fixture();season.accepter={...season.accepter,state:{...season.accepter.state,seasonId:'other'}};assert.throws(()=>settleClubExchange(season),/SEASON/);
 const scope=fixture();scope.proposer={...scope.proposer,allowedClubIds:[]};assert.throws(()=>settleClubExchange(scope),/CLUB_NOT_ALLOWED/);
 const allocation=fixture();allocation.proposer={...allocation.proposer,allocation:{...allocation.proposer.allocation,players:allocation.proposer.allocation.players.slice(1)}};assert.throws(()=>settleClubExchange(allocation),/ALLOCATION/);
});

test('requires confirmed season and repository owner scope',()=>{
 const i=fixture();i.seasonOpen=false;assert.throws(()=>settleClubExchange(i),/SEASON_CLOSED/);
 const j=fixture();j.proposer={...j.proposer,accountId:'wrong'};assert.throws(()=>settleClubExchange(j),/OWNER_MISMATCH/);
});
