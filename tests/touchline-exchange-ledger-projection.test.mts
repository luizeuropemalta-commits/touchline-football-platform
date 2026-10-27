import test from 'node:test';
import assert from 'node:assert/strict';
import {projectExchangeLedger,type CommittedExchangeReceipt} from '../lib/touchlineFantasy/exchange-ledger-projection.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const receipt:CommittedExchangeReceipt={tradeId:id(1),seasonId:id(2),occurredAt:'2026-10-25T20:00:00Z',
 proposer:{accountId:id(3),name:'A'},accepter:{accountId:id(4),name:'B'},
 outgoing:{playerId:id(5),name:'Outgoing',valueTc:80_000_000},incoming:{playerId:id(6),name:'Incoming',valueTc:100_000_000},
 quote:{feeTc:5_000_000,bonusTc:2_500_000,retiredTc:2_500_000,compensationTc:-20_000_000},proposerBalanceAfterTc:75_000_000,accepterBalanceAfterTc:122_500_000};
const scope={accountId:id(3),seasonId:id(2),collectionRevision:7,coverage:'partial' as const,seasonNegotiationIncomeTc:9_000_000};
test('each party sees their own cards, debit/credit, fee and bonus without a second wallet credit',()=>{
 const a=projectExchangeLedger({...scope,receipts:[receipt]})!;
 assert.equal(a.receipts[0].given.name,'Outgoing');assert.equal(a.receipts[0].difference.direction,'paid');
 assert.equal(a.receipts[0].feeTc,5_000_000);assert.equal(a.receipts[0].bonusTc,0);assert.equal(a.receipts[0].balanceAfterTc,75_000_000);
 const b=projectExchangeLedger({...scope,accountId:id(4),receipts:[receipt]})!;
 assert.equal(b.receipts[0].given.name,'Incoming');assert.equal(b.receipts[0].difference.direction,'received');
 assert.equal(b.receipts[0].feeTc,0);assert.equal(b.receipts[0].bonusTc,2_500_000);assert.equal(b.seasonNegotiationIncomeTc,9_000_000);
 assert.equal(b.receipts[0].balanceAfterTc,122_500_000);
});
test('rejects foreign accounts, seasons, duplicate rows and inconsistent arithmetic',()=>{
 assert.equal(projectExchangeLedger({...scope,accountId:id(9),receipts:[receipt]}),null);
 assert.equal(projectExchangeLedger({...scope,seasonId:id(9),receipts:[receipt]}),null);
 assert.equal(projectExchangeLedger({...scope,receipts:[receipt,receipt]}),null);
 for(const quote of [{...receipt.quote,retiredTc:0},{...receipt.quote,compensationTc:20_000_000}])
 assert.equal(projectExchangeLedger({...scope,receipts:[{...receipt,quote}]}),null);
 assert.equal(projectExchangeLedger({...scope,receipts:[null]}),null);
});
test('partial empty page retains independent confirmed season aggregate; missing stays unavailable',()=>{
 assert.equal(projectExchangeLedger({...scope,receipts:[]})?.seasonNegotiationIncomeTc,9_000_000);
 assert.equal(projectExchangeLedger({...scope,seasonNegotiationIncomeTc:null,receipts:[]})?.seasonNegotiationIncomeTc,null);
});


test('fee distribution is exactly half bonus and half retired, not merely a matching total',()=>{
 const wrong={...receipt,quote:{...receipt.quote,bonusTc:3_000_000,retiredTc:2_000_000}};
 assert.equal(projectExchangeLedger({...scope,receipts:[wrong]}),null);
});
test('confirmed aggregate reconciles complete coverage and cannot understate a partial page',()=>{
 const accepter={...scope,accountId:id(4)};
 assert.equal(projectExchangeLedger({...accepter,seasonNegotiationIncomeTc:2_499_999,receipts:[receipt]}),null);
 assert.equal(projectExchangeLedger({...accepter,seasonNegotiationIncomeTc:2_500_000,receipts:[receipt]})?.seasonNegotiationIncomeTc,2_500_000);
 assert.equal(projectExchangeLedger({...accepter,coverage:'complete',seasonNegotiationIncomeTc:9_000_000,receipts:[receipt]}),null);
 assert.equal(projectExchangeLedger({...accepter,coverage:'complete',seasonNegotiationIncomeTc:2_500_000,receipts:[receipt]})?.seasonNegotiationIncomeTc,2_500_000);
 assert.equal(projectExchangeLedger({...scope,coverage:'complete',seasonNegotiationIncomeTc:0,receipts:[receipt]})?.seasonNegotiationIncomeTc,0);
 assert.equal(projectExchangeLedger({...scope,coverage:'complete',seasonNegotiationIncomeTc:1,receipts:[]}),null);
 assert.equal(projectExchangeLedger({...scope,coverage:'complete',seasonNegotiationIncomeTc:null,receipts:[]})?.seasonNegotiationIncomeTc,null);
});
