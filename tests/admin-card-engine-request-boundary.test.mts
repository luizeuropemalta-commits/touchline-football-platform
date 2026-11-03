import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const actor='11111111-1111-4111-8111-111111111111', batch='22222222-2222-4222-8222-222222222222';
function harness(mode='ok'){
 const calls={admins:0,auth:0,writes:[] as unknown[]};const exports:Record<string,(r:unknown)=>Promise<Response>>={};
 const dependencies:Record<string,unknown>={
 'next/server':{NextResponse:{json:Response.json}},'@/lib/admin/owner':{isOwnerEmail:()=>mode!=='customer'},'@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>true},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>{calls.auth++;if(mode==='throw')throw Error('PRIVATE_AUTH');return{data:{user:mode==='anonymous'?null:{id:actor,email:'synthetic'}},error:mode==='auth-error'?{}:null};}}})},
 '@/lib/supabase/admin':{createAdminClient:()=>{calls.admins++;return{};}},
 '@/lib/touchlineArena/card-engine-editorial-import':{parseCardEngineDelimitedInput:()=>[{}],resolveCardEngineImportRows:()=>[{}],summarizeCardEngineRows:()=>({review:0,conflict:0,unmatched:0})},
 '@/lib/touchlineArena/card-engine-candidates-server':{loadTouchlineCardEngineCandidates:async()=>{if(mode==='load-error')throw Error('PRIVATE_BACKEND_DIAGNOSTIC');return[];}},
 '@/lib/touchlineArena/card-engine-batch-server':{createTouchlineCardEngineBatch:async(_a:unknown,c:unknown)=>{calls.writes.push(c);if(mode==='backend-error')throw Error('PRIVATE_BACKEND_DIAGNOSTIC');return{id:batch};},transitionTouchlineCardEngineBatch:async(_a:unknown,c:unknown)=>{calls.writes.push(c);if(mode==='backend-error')throw Error('PRIVATE_BACKEND_DIAGNOSTIC');return{id:batch};}},
 };const source=readFileSync(new URL('../app/api/admin/card-engine/route.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextDecoder,Uint8Array,Error,setTimeout:(fn:()=>void)=>setTimeout(fn,5),clearTimeout,require:(s:string)=>{assert.ok(s in dependencies,s);return dependencies[s];}});
 const request=(method='POST',headers:Record<string,string>={},body:unknown={action:'create',text:'csv',sourceType:'csv',effectiveSeason:'2026-27'})=>Object.assign(new Request('https://qa.invalid/api/admin/card-engine',{method,headers:{origin:'https://qa.invalid','content-type':'application/json',...headers},body:JSON.stringify(body)}),{nextUrl:new URL('https://qa.invalid/api/admin/card-engine')});
 return{...exports,calls,request};
}
test('card engine denies missing/foreign origin and nonJSON before reading or authorizing',async()=>{for(const method of ['POST','PATCH'])for(const headers of [{origin:''},{origin:'https://evil.invalid'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'},{'content-type':'application/jsonp'}]){const h=harness();const result=await h[method](h.request(method,headers));assert.equal(result.status,'content-type'in headers?415:403);assert.equal(h.calls.auth,0);assert.equal(h.calls.admins,0);}});
test('card engine error-bearing owner and auth exceptions cannot publish',async()=>{for(const mode of ['auth-error','throw','customer','anonymous']){const h=harness(mode);const response=await h.PATCH(h.request('PATCH',{}, {action:'publish',batchId:batch}));assert.equal(response.status,['auth-error','throw'].includes(mode)?503:403);assert.equal(h.calls.admins,0);assert.equal(h.calls.writes.length,0);assert.ok(!(await response.text()).includes('PRIVATE'));}});
test('card engine valid create and transition preserve authenticated actor',async()=>{const h=harness();assert.equal((await h.POST(h.request())).status,200);assert.equal((await h.PATCH(h.request('PATCH',{}, {action:'publish',batchId:batch}))).status,200);for(const c of h.calls.writes)assert.equal((c as {actorId:string}).actorId,actor);});
test('card engine stalled stream times out and releases reader without privileged work',async()=>{const h=harness();let cancelled=false;let control:ReadableStreamDefaultController<Uint8Array>|undefined;const body=new ReadableStream<Uint8Array>({start(c){control=c;c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});const req={nextUrl:new URL('https://qa.invalid/api'),headers:new Headers({origin:'https://qa.invalid','content-type':'application/json'}),body};const work=h.POST(req);let timer:ReturnType<typeof setTimeout>|undefined;const response=await Promise.race([work,new Promise<null>(r=>{timer=setTimeout(()=>r(null),100);})]);clearTimeout(timer);if(!response){control!.close();await work;}assert.notEqual(response,null);assert.equal(response!.status,408);assert.equal(cancelled,true);assert.equal(body.locked,false);assert.equal(h.calls.admins,0);});
test('card engine streamed overflow cancels and releases; null/array cannot mutate',async()=>{
 const h=harness();let cancelled=false;const body=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array(260001));},cancel(){cancelled=true;}},{highWaterMark:0});
 const response=await h.POST({nextUrl:new URL('https://qa.invalid/api'),headers:new Headers({origin:'https://qa.invalid','content-type':'application/json'}),body});assert.equal(response.status,413);assert.equal(cancelled,true);assert.equal(body.locked,false);assert.equal(h.calls.admins,0);
 for(const value of [null,[],42]){const f=harness();assert.equal((await f.POST(f.request('POST',{},value))).status,400);assert.equal(f.calls.writes.length,0);}
});

test('card engine command failures never disclose backend diagnostics or claim success',async()=>{for(const method of ['POST','PATCH']){const h=harness('backend-error');const response=await h[method](h.request(method,{},method==='POST'?{action:'create',text:'csv',sourceType:'csv',effectiveSeason:'2026-27'}:{action:'publish',batchId:batch}));assert.equal(response.status,409);const body=await response.json();assert.ok(!JSON.stringify(body).includes('PRIVATE_BACKEND'));assert.notEqual(body.ok,true);assert.match(body.error,/could not be confirmed/);assert.equal(h.calls.writes.length,1);}});

test('card engine preview load failure is generic and performs no write',async()=>{const h=harness('load-error');const response=await h.POST(h.request('POST',{}, {action:'preview',text:'csv',sourceType:'csv',effectiveSeason:'2026-27'}));assert.equal(response.status,409);assert.ok(!(await response.text()).includes('PRIVATE_BACKEND'));assert.equal(h.calls.writes.length,0);});
