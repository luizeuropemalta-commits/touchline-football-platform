import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { FixtureAuthorityCommand } from '../lib/football-data/fixture-authority-command-server.ts';

const exports = {} as { createCentralQuotaStore: typeof import('../lib/football-data/fixture-authority-store-server.ts').createCentralQuotaStore };
runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/football-data/fixture-authority-store-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require(name:string){assert.equal(name,'server-only');return{};},AbortController,setTimeout,clearTimeout,
});
const create=exports.createCentralQuotaStore;
const uuid='12345678-1234-4234-8234-123456789abc';
const command: FixtureAuthorityCommand={operation:'admit',principal:{workerId:'qa-live',environment:'qa',accountScope:'shared'},requestId:uuid,endpoint:'latest',attempt:1,budgetMs:1000};
const signal=()=>new AbortController().signal;
const config={enabled:true,accountScope:'shared',timeoutMs:100};
const error=(e:Error)=>e.message==='Central fixture authority unavailable.';

test('central store sends trusted worker identity to ownership wrapper, never legacy RPC',async()=>{
  const calls:unknown[]=[];
  const store=create(config,async(name,args)=>{calls.push({name,args});return{allowed:true,token:uuid};});
  const result=await store(command,signal());
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{allowed:true,token:uuid});
  assert.equal(Object.isFrozen(result),true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{name:'touchline_central_quota_admit',args:{p_worker_id:'qa-live',p_environment:'qa',p_account_scope:'shared',p_request_id:uuid,p_endpoint:'latest',p_attempt:1,p_budget_ms:1000}}]);
});
test('completion carries original receipt and observation; denial is not fabricated success',async()=>{
  const observation={requestId:uuid,attempt:1,operation:'fixture' as const,observedAt:null,status:0,requestedEntity:null,remaining:null,resetAt:null,cooldownUntil:null};
  const done:FixtureAuthorityCommand={...command,operation:'complete',token:uuid,observation};
  let count=0;
  const store=create(config,async(name,args)=>{
    count++;assert.equal(name,'touchline_central_quota_complete');assert.equal(args.p_token,uuid);assert.equal(args.p_observation,observation);
    assert.equal(Object.hasOwn(args,'p_budget_ms'),false);return{persisted:false};
  });
  assert.equal((await store(done,signal()) as {persisted:boolean}).persisted,false);assert.equal(count,1);
});
test('disabled, wrong-scope and pre-aborted requests perform zero RPCs',async()=>{
  let count=0;const rpc=async()=>{count++;return{allowed:false};};
  await assert.rejects(()=>create({...config,enabled:false},rpc)(command,signal()),error);
  await assert.rejects(()=>create({accountScope:'shared'},rpc)(command,signal()),error);
  await assert.rejects(()=>create(config,rpc)({...command,principal:{...command.principal,accountScope:'other'}},signal()),error);
  const abort=new AbortController();abort.abort();
  await assert.rejects(()=>create(config,rpc)(command,abort.signal),error);assert.equal(count,0);
});
test('invalid or secret-bearing DB responses are sanitized without retry',async()=>{
  for(const value of [null,[],{allowed:true},{allowed:true,token:'invalid'},{allowed:false,secret:'db-secret'},{persisted:true}]){
    let count=0;await assert.rejects(()=>create(config,async()=>{count++;return value;})(command,signal()),error);assert.equal(count,1);
  }
  await assert.rejects(()=>create(config,async()=>{throw Error('sensitive database URL');})(command,signal()),error);
});
test('deadline bounds uncooperative RPC and late success is not permission to call provider',async()=>{
  let calls=0;let rpcSignal:AbortSignal|undefined;
  const store=create({...config,timeoutMs:5},async(_name,_args,s)=>{calls++;rpcSignal=s;await new Promise(r=>setTimeout(r,25));return{allowed:true,token:uuid};});
  await assert.rejects(()=>store(command,signal()),error);assert.equal(rpcSignal?.aborted,true);
  await new Promise(r=>setTimeout(r,30));assert.equal(calls,1);
});
test('parent abort cancels in-flight RPC without retry',async()=>{
  let ready:()=>void=()=>{};const entered=new Promise<void>(r=>{ready=r;});let rpcSignal:AbortSignal|undefined;
  const store=create(config,async(_n,_a,s)=>{rpcSignal=s;ready();return new Promise(()=>{});});
  const abort=new AbortController();const result=store(command,abort.signal);await entered;abort.abort();
  await assert.rejects(()=>result,error);assert.equal(rpcSignal?.aborted,true);
});

test('valid denial and complete success retain exact result shapes',async()=>{
  const denied=await create(config,async()=>({allowed:false}))(command,signal());
  assert.deepEqual(JSON.parse(JSON.stringify(denied)),{allowed:false});
  const done:FixtureAuthorityCommand={...command,operation:'complete',token:uuid,observation:{requestId:uuid,attempt:1,operation:'fixture',observedAt:null,status:0,requestedEntity:null,remaining:null,resetAt:null,cooldownUntil:null}};
  assert.deepEqual(JSON.parse(JSON.stringify(await create(config,async()=>({persisted:true}))(done,signal()))),{persisted:true});
  for(const result of [{persisted:true,secret:'hidden'},{persisted:'true'},{allowed:false}]) await assert.rejects(()=>create(config,async()=>result)(done,signal()),error);
});
test('invalid construction is rejected before RPC',()=>{
  for(const timeoutMs of [0,-1,5001,1.5,Infinity,NaN]) assert.throws(()=>create({...config,timeoutMs},async()=>({allowed:false})),error);
  for(const accountScope of ['', 'Shared', 'other/scope']) assert.throws(()=>create({...config,accountScope},async()=>({allowed:false})),error);
});
