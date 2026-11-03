import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
type Adapter = { action(actor:string,command:unknown,phase:string):Promise<unknown> };
const exports = {} as { rosterRepository(admin:{rpc:()=>Promise<{data:unknown;error:null}>}):Adapter };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/football-data/roster-reconciliation-repository.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>{assert.equal(name,'server-only');return {};}});
const id='11111111-1111-4111-8111-111111111111', snapshot='22222222-2222-4222-8222-222222222222';
const capture={action:'capture',requestId:id};
const invoke=(data:unknown,command:unknown=capture,phase='lookup')=>exports.rosterRepository({rpc:async()=>({data,error:null})}).action('owner:'+id,command,phase);
test('roster adapter rejects unknown, incomplete and mismatched receipts',async()=>{
 for(const data of [{status:'unexpected',requestId:id},{status:'review',requestId:id},{status:'review',requestId:id,snapshotId:snapshot,revision:0},{status:'collecting',requestId:id,capture:true},{status:'failed',requestId:id,error:42},[],null]) await assert.rejects(invoke(data,capture,'begin'),/ROSTER_NOT_CONFIRMED/);
 for(const action of ['decide','apply']) {
 const command={action,requestId:id,snapshotId:snapshot,revision:4};
 for(const data of [{status:'review',requestId:id,snapshotId:snapshot,revision:5},{status:action==='apply'?'applied':'decided',requestId:id,snapshotId:id,revision:5},{status:action==='apply'?'applied':'decided',requestId:id,snapshotId:snapshot,revision:4}]) await assert.rejects(invoke(data,command),/ROSTER_NOT_CONFIRMED/);
 }
});
test('roster adapter preserves SQL terminal receipts, replay, pending claim and empty lookup',async()=>{
 assert.equal(await invoke(null),null);
 for(const data of [{status:'review',requestId:id,snapshotId:id,revision:0},{status:'collecting',requestId:id,error:null},{status:'collecting',requestId:id,capture:true,seasonId:'12345'},{status:'failed',requestId:id,error:'CAPTURE_NOT_CONFIRMED'}]) assert.deepEqual(await invoke(data),data);
 for(const action of ['decide','apply']) {const command={action,requestId:id,snapshotId:snapshot,revision:4}; const receipt={status:action==='apply'?'applied':'decided',requestId:id,snapshotId:snapshot,revision:5};for(let i=0;i<2;i++)assert.deepEqual(await invoke(receipt,command),receipt);}
});
