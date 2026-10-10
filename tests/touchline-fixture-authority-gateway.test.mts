import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const cache=new Map<string,Record<string,unknown>>();
function load(name:string):Record<string,unknown>{
  if(cache.has(name))return cache.get(name)!;
  assert.match(name,/^(fixture-authority-[a-z-]+|sportmonks-quota-observation)$/);
  const exports:Record<string,unknown>={};cache.set(name,exports);
  const source=readFileSync(new URL(`../lib/football-data/${name}.ts`,import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,require(id:string){if(id==='server-only')return{};if(id==='node:crypto')return crypto;assert.match(id,/^\.\/[a-z-]+\.ts$/);return load(id.slice(2,-3));},
    Request,Response,URL,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,
  });return exports;
}
const gateway=load('fixture-authority-gateway-server').createFixtureAuthorityGateway as typeof import('../lib/football-data/fixture-authority-gateway-server.ts').createFixtureAuthorityGateway;
const auth=load('fixture-authority-worker-auth-server').createFixtureAuthorityWorkerAuthenticator as typeof import('../lib/football-data/fixture-authority-worker-auth-server.ts').createFixtureAuthorityWorkerAuthenticator;
const store=load('fixture-authority-store-server').createCentralQuotaStore as typeof import('../lib/football-data/fixture-authority-store-server.ts').createCentralQuotaStore;
const transport=load('fixture-authority-http-server').createFixtureAuthorityHttpTransport as typeof import('../lib/football-data/fixture-authority-http-server.ts').createFixtureAuthorityHttpTransport;
const token='q'.repeat(40),uuid='12345678-1234-4234-8234-123456789abc';
const principal={workerId:'qa-live',environment:'qa' as const,accountScope:'shared'};
const authenticate=auth({enabled:true,workers:[{...principal,token}]});
const base='https://authority.example/api/internal/football-data/quota';
const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const args={p_account_scope:'shared',p_request_id:uuid,p_endpoint:'latest',p_attempt:1};
const payload=()=>({operation:'admit',args:{...args,p_budget_ms:1500}});
const request=(body:unknown=payload(),extra:RequestInit={})=>new Request(base,{method:'POST',headers,body:JSON.stringify(body),...extra});

test('real auth, parser, gateway and store compose for admit and complete without provider traffic',async()=>{
  const calls:{name:string,args:Readonly<Record<string,unknown>>}[]=[];
  const execute=store({enabled:true,accountScope:'shared'},async(name,args)=>{calls.push({name,args});return name.endsWith('admit')?{allowed:true,token:uuid}:{persisted:true};});
  const handle=gateway({enabled:true},{authenticate,execute});
  const admitted=await handle(request());assert.equal(admitted.status,200);assert.deepEqual(await admitted.json(),{allowed:true,token:uuid});
  assert.equal(admitted.headers.get('cache-control'),'no-store');
  const completed=await handle(request({operation:'complete',args:{...args,p_token:uuid,p_observation:{requestId:uuid,attempt:1,operation:'fixture',observedAt:null,status:0,requestedEntity:null,remaining:null,resetAt:null,cooldownUntil:null}}}));
  assert.deepEqual(await completed.json(),{persisted:true});assert.equal(calls.length,2);
  assert.equal(calls[0].name,'touchline_central_quota_admit');assert.equal(calls[1].name,'touchline_central_quota_complete');
  for(const call of calls){assert.equal(call.args.p_worker_id,'qa-live');assert.equal(call.args.p_environment,'qa');assert.equal(Object.hasOwn(call.args,'authorization'),false);}
});
test('auth denial cancels body without reading it or calling store; OFF makes zero auth calls',async()=>{
  let reads=0,cancels=0,calls=0,authCalls=0;
  const body=new ReadableStream({pull(){reads++;},cancel(){cancels++;}},{highWaterMark:0});
  const incoming=new Request(base,{method:'POST',headers:{...headers,authorization:'Bearer wrong'},body,duplex:'half'} as RequestInit);
  const handle=gateway({enabled:true},{authenticate,execute:async()=>{calls++;return{allowed:false};}});
  assert.equal((await handle(incoming)).status,401);assert.equal(reads,0);assert.equal(calls,0);assert.equal(cancels,1);
  const off=gateway({}, {authenticate:()=>{authCalls++;return principal;},execute:async()=>{calls++;return{allowed:false};}});
  assert.equal((await off(request())).status,503);assert.equal(authCalls,0);
});
test('method, route, encoding and bounded streamed bodies fail before store',async()=>{
  let calls=0;const handle=gateway({enabled:true},{authenticate,execute:async()=>{calls++;return{allowed:false};}});
  assert.equal((await handle(new Request(base,{method:'GET'}))).status,405);
  assert.equal((await handle(new Request(base+'?scope=other',{method:'POST',headers}))).status,404);
  assert.equal((await handle(request({}, {headers:{...headers,'content-encoding':'gzip'}}))).status,415);
  assert.equal((await handle(request({}, {headers:{...headers,'content-length':'9000'}}))).status,413);
  assert.equal((await handle(request('x'.repeat(9000)))).status,413);
  assert.equal((await handle(request({}, {headers:{...headers,'content-length':'invalid'}}))).status,400);
  assert.equal((await handle(new Request(base,{method:'POST',headers,body:'{broken'}))).status,400);
  assert.equal(calls,0);
});
test('payload cannot change server identity or choose another scope; errors stay generic',async()=>{
  let calls=0;const handle=gateway({enabled:true},{authenticate,execute:async()=>{calls++;return{allowed:false};}});
  for(const body of [{...payload(),principal:{workerId:'prod-live'}},{operation:'admit',args:{...payload().args,p_account_scope:'other'}}]){
    const response=await handle(request(body));assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'Fixture authority unavailable.'});
  }
  assert.equal(calls,0);
  const broken=gateway({enabled:true},{authenticate,execute:async()=>{throw Error('private database token');}});
  const response=await broken(request());assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private'));
});
test('slow request body times out, cancels its stream and never reaches store',async()=>{
  let cancelled=false,calls=0;
  const body=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
  const handle=gateway({enabled:true,timeoutMs:5},{authenticate,execute:async()=>{calls++;return{allowed:false};}});
  const response=await handle(new Request(base,{method:'POST',headers,body,duplex:'half'} as RequestInit));
  assert.equal(response.status,503);assert.equal(cancelled,true);assert.equal(calls,0);
});
test('late store result and parent cancellation cannot emit a successful receipt',async()=>{
  let downstream:AbortSignal|undefined;
  const handle=gateway({enabled:true,timeoutMs:5},{authenticate,execute:async(_c,s)=>{downstream=s;await new Promise(r=>setTimeout(r,20));return{allowed:true,token:uuid};}});
  assert.equal((await handle(request())).status,503);assert.equal(downstream?.aborted,true);
  const abort=new AbortController();abort.abort();assert.equal((await handle(request(payload(),{signal:abort.signal}))).status,503);
  await new Promise(r=>setTimeout(r,25));
});

test('request abort during body read cancels stream without executing store',async()=>{
  let entered:()=>void=()=>{};const reading=new Promise<void>(r=>{entered=r;});let cancelled=false,calls=0;
  const body=new ReadableStream({pull(){entered();return new Promise(()=>{});},cancel(){cancelled=true;}},{highWaterMark:0});
  const abort=new AbortController();
  const handle=gateway({enabled:true},{authenticate,execute:async()=>{calls++;return{allowed:false};}});
  const work=handle(new Request(base,{method:'POST',headers,body,signal:abort.signal,duplex:'half'} as RequestInit));
  await reading;abort.abort();assert.equal((await work).status,503);assert.equal(cancelled,true);assert.equal(calls,0);
});
test('request abort during store propagates signal and discards late result without retry',async()=>{
  let entered:()=>void=()=>{};const executing=new Promise<void>(r=>{entered=r;});let downstream:AbortSignal|undefined,calls=0;
  let finish:(value:{allowed:false})=>void=()=>{};
  const handle=gateway({enabled:true},{authenticate,execute:async(_c,s)=>{calls++;downstream=s;entered();return new Promise(r=>{finish=r;});}});
  const abort=new AbortController();const work=handle(request(payload(),{signal:abort.signal}));
  await executing;abort.abort();assert.equal((await work).status,503);assert.equal(downstream?.aborted,true);
  finish({allowed:false});await Promise.resolve();assert.equal(calls,1);
});
test('worker HTTP transport reaches real gateway composition using fixed central RPC identity',async()=>{
  let calls=0;
  const execute=store({enabled:true,accountScope:'shared'},async(name,args)=>{calls++;assert.equal(name,'touchline_central_quota_admit');assert.equal(args.p_worker_id,'qa-live');return{allowed:false};});
  const handle=gateway({enabled:true},{authenticate,execute});
  const client=transport({url:base,workerToken:token,accountScope:'shared'},async(input,init)=>handle(new Request(input,init)));
  assert.deepEqual(JSON.parse(JSON.stringify(await client('touchline_fixture_quota_admit',payload().args,new AbortController().signal))),{allowed:false});assert.equal(calls,1);
});
test('gateway preserves completion denial but rejects extra or malformed store fields',async()=>{
  const completed={operation:'complete',args:{...args,p_token:uuid,p_observation:{requestId:uuid,attempt:1,operation:'fixture',observedAt:null,status:0,requestedEntity:null,remaining:null,resetAt:null,cooldownUntil:null}}};
  const denied=await gateway({enabled:true},{authenticate,execute:async()=>({persisted:false})})(request(completed));
  assert.equal(denied.status,200);assert.deepEqual(await denied.json(),{persisted:false});
  for(const value of [null,{allowed:true,token:uuid,secret:'sensitive'},{persisted:'yes'},{allowed:true,token:'bad'}]){
    const handle=gateway({enabled:true},{authenticate,execute:async()=>value as never});
    const response=await handle(request());assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'Fixture authority unavailable.'});
  }
});
