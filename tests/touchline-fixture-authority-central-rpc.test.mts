import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const exports = {} as { createCentralQuotaRpc: typeof import('../lib/football-data/fixture-authority-central-rpc-server.ts').createCentralQuotaRpc };
runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/football-data/fixture-authority-central-rpc-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require(name:string){assert.equal(name,'server-only');return{};},AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,
  fetch(){throw Error('Network forbidden in isolated tests');},
});
const create=exports.createCentralQuotaRpc;
const config={enabled:true,projectRef:'a'.repeat(20),serviceKey:'secret'.repeat(8),accountScope:'shared',timeoutMs:100};
const args={p_account_scope:'shared',p_worker_id:'qa-live',p_environment:'qa'};
const signal=()=>new AbortController().signal;
const error=(e:Error)=>e.message==='Central quota database unavailable.';
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const admit='touchline_central_quota_admit';

test('real store and HTTP adapter compose with immutable identity and exact receipt validation',async()=>{
  const storeExports={} as {createCentralQuotaStore:typeof import('../lib/football-data/fixture-authority-store-server.ts').createCentralQuotaStore};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/football-data/fixture-authority-store-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:storeExports,require(name:string){assert.equal(name,'server-only');return{};},AbortController,setTimeout,clearTimeout,
  });
  const uuid='12345678-1234-4234-8234-123456789abc';
  const command={operation:'admit' as const,principal:{workerId:'qa-live',environment:'qa' as const,accountScope:'shared'},requestId:uuid,endpoint:'latest' as const,attempt:1,budgetMs:1000};
  let reply:unknown={allowed:true,token:uuid};let calls=0;
  const rpc=create(config,async(_url,init)=>{
    calls++;const body=JSON.parse(String(init!.body));
    assert.equal(body.p_worker_id,'qa-live');assert.equal(body.p_environment,'qa');
    assert.equal(body.p_request_id,uuid);assert.equal(body.p_account_scope,'shared');
    return json(reply);
  });
  const store=storeExports.createCentralQuotaStore(config,rpc);
  assert.deepEqual(JSON.parse(JSON.stringify(await store(command,signal()))),reply);
  reply={allowed:true,token:uuid,unexpected:'private database field'};
  await assert.rejects(()=>store(command,signal()),(e:Error)=>e.message==='Central fixture authority unavailable.');
  assert.equal(calls,2,'one request per operation; no retries on invalid receipt');
});

test('central RPC targets only explicit project and ownership wrappers, credentials stay in headers',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const rpc=create(config,async(url,init)=>{calls.push({url:String(url),init:init!});return json({allowed:false});});
  await rpc(admit,args,signal());await rpc('touchline_central_quota_complete',args,signal());
  assert.equal(calls.length,2);
  assert.equal(calls[0].url,`https://${config.projectRef}.supabase.co/rest/v1/rpc/${admit}`);
  assert.ok(calls[1].url.endsWith('/touchline_central_quota_complete'));
  for(const {init} of calls){
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');
    assert.equal(new Headers(init.headers).get('apikey'),config.serviceKey);
    assert.equal(new Headers(init.headers).get('authorization'),`Bearer ${config.serviceKey}`);
    assert.deepEqual(JSON.parse(String(init.body)),args);assert.ok(!String(init.body).includes(config.serviceKey));
  }
});
test('disabled, wrong scope, legacy operation, oversized request and abort make zero requests',async()=>{
  let count=0;const fetcher=async()=>{count++;return json({});};
  await assert.rejects(()=>create({...config,enabled:false},fetcher)(admit,args,signal()),error);
  await assert.rejects(()=>create({...config,enabled:undefined},fetcher)(admit,args,signal()),error);
  const rpc=create(config,fetcher);
  await assert.rejects(()=>rpc(admit,{...args,p_account_scope:'other'},signal()),error);
  await assert.rejects(()=>rpc('touchline_fixture_quota_admit' as typeof admit,args,signal()),error);
  await assert.rejects(()=>rpc(admit,{...args,extra:'x'.repeat(9000)},signal()),error);
  const c=new AbortController();c.abort();await assert.rejects(()=>rpc(admit,args,c.signal),error);assert.equal(count,0);
});
test('invalid destinations, secrets and timeouts are rejected before construction',()=>{
  for(const projectRef of ['','a'.repeat(19),'a'.repeat(20)+'.evil','https://db.example','../database'])assert.throws(()=>create({...config,projectRef}),error);
  for(const serviceKey of ['short','bad\r\nheader'.repeat(8),'x'.repeat(8193)])assert.throws(()=>create({...config,serviceKey}),error);
  for(const timeoutMs of [0,-1,5001,1.5,NaN])assert.throws(()=>create({...config,timeoutMs}),error);
});
test('HTTP and malformed responses fail with generic errors and never retry',async()=>{
  for(const response of [new Response('private',{status:401}),new Response('private',{status:429}),new Response('private',{status:503}),new Response('{}'),json(null),json([]),json({v:'x'.repeat(9000)}),new Response('invalid private json',{headers:{'Content-Type':'application/json'}})]){
    let count=0;await assert.rejects(()=>create(config,async()=>{count++;return response;})(admit,args,signal()),error);assert.equal(count,1);
  }
  await assert.rejects(()=>create(config,async()=>{throw Error(config.serviceKey);})(admit,args,signal()),error);
});
test('bounded deadline cancels uncooperative fetch and late response grants nothing',async()=>{
  let finish:(r:Response)=>void=()=>{};let observed:AbortSignal|undefined;let count=0;
  const rpc=create({...config,timeoutMs:5},async(_u,init)=>{count++;observed=init!.signal as AbortSignal;return new Promise(r=>{finish=r;});});
  await assert.rejects(()=>rpc(admit,args,signal()),error);assert.equal(observed?.aborted,true);
  let cancelled=false;
  finish(new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}}));
  await new Promise(r=>setTimeout(r,10));assert.equal(count,1);assert.equal(cancelled,true);
});
test('deadline also bounds an unending response body',async()=>{
  let cancelled=false;
  const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}});
  await assert.rejects(()=>create({...config,timeoutMs:5},async()=>response)(admit,args,signal()),error);
  assert.equal(cancelled,true);
});
test('parent abort stops pending response stream',async()=>{
  let ready:()=>void=()=>{};const started=new Promise<void>(r=>{ready=r;});let cancelled=false;
  const response=new Response(new ReadableStream({pull(){ready();},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}});
  const c=new AbortController();const pending=create(config,async()=>response)(admit,args,c.signal);
  await started;c.abort();await assert.rejects(()=>pending,error);assert.equal(cancelled,true);
});
