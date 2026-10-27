import test from 'node:test';import assert from 'node:assert/strict';
import {prepareExchangeCommand} from '../lib/touchlineFantasy/exchange-command-client.ts';
import {readExchangeCommandJournal,writeExchangeCommandJournal,clearExchangeCommandJournal} from '../lib/touchlineFantasy/exchange-command-journal.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const command=prepareExchangeCommand({expectedAccountId:id(1),expectedSeasonId:id(2),command:{action:'accept',proposalId:id(3)}})!;
test('journal survives a new reader, remains scoped and preserves command identity without values',()=>{
 const map=new Map<string,string>();const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}};
 assert.equal(writeExchangeCommandJournal(storage,command),true);assert.deepEqual(readExchangeCommandJournal(storage,id(1),id(2)),command);assert.equal(readExchangeCommandJournal(storage,id(4),id(2)),null);
 assert.equal(readExchangeCommandJournal(storage,id(1),id(4)),null);assert.ok(![...map.values()][0].includes('balance'));
 clearExchangeCommandJournal(storage,id(1),id(2));assert.equal(readExchangeCommandJournal(storage,id(1),id(2)),null);
});
test('unavailable storage cannot authorize a new unjournaled mutation; malformed journal is rejected',()=>{
 const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('quota');},removeItem:()=>{throw Error('blocked');}};
 assert.equal(writeExchangeCommandJournal(blocked,command),false);assert.equal(readExchangeCommandJournal(blocked,id(1),id(2)),null);assert.doesNotThrow(()=>clearExchangeCommandJournal(blocked,id(1),id(2)));
 assert.equal(readExchangeCommandJournal({...blocked,getItem:()=>'{bad'},id(1),id(2)),null);
});
