import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../app/api/admin/company-finance/settlement-correction/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const requestId='11111111-1111-4111-8111-111111111111',settlementId='22222222-2222-4222-8222-222222222222';
const valid={requestId,settlementId,reason:'This settlement was recorded in error',confirmed:true};
function harness(mode='ok',body:unknown=valid,receipt?:unknown){
 let calls=0;const exports={} as {POST(request:unknown):Promise<{status:number;body:unknown;headers:Record<string,string>}>};
 const deps:Record<string,unknown>={
 'next/server':{NextResponse:{json:(body:unknown,init:object)=>({body,...init})}},
 '@/lib/admin/owner':{isOwnerEmail:()=>mode!=='customer'},
 '@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>mode!=='no-access'},
 '@/lib/admin/company-finance-api':{readCompanyJson:async()=>body},
 '@/lib/supabase/server':{createClient:async()=>mode==='anonymous'?null:{auth:{getUser:async()=>({data:{user:{id:'trusted-actor',email:'fixture@example.invalid'}},error:mode==='auth-error'?{}:null})}}},
 '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{calls++;assert.equal(name,'touchline_company_cancel_settlement');assert.equal(args.p_actor_id,'trusted-actor');return {data:receipt!==undefined?receipt:{id:mode==='malformed'?'wrong':requestId,settlement_id:settlementId,reason:valid.reason,created_by:'trusted-actor',created_at:'2026-11-02T10:00:00Z'},error:mode==='conflict'?{code:'40001'}:mode==='db-error'?{code:'XX000',message:'PRIVATE'}:null};}})},
 };
 vm.runInNewContext(compiled,{exports,require:(k:string)=>{assert.ok(k in deps);return deps[k];}});
 const headers=new Headers({origin:mode==='cross-origin'?'https://evil.invalid':'https://qa.invalid','sec-fetch-site':mode==='cross-site'?'cross-site':'same-origin'});
 return {post:()=>exports.POST({headers,nextUrl:{origin:'https://qa.invalid'}}),calls:()=>calls};
}
test('settlement cancellation rejects untrusted callers before RPC',async()=>{for(const mode of ['anonymous','customer','no-access','auth-error','cross-origin','cross-site']){const h=harness(mode);assert.equal((await h.post()).status,403);assert.equal(h.calls(),0);}});
test('settlement cancellation requires explicit valid confirmation',async()=>{for(const body of [null,[],{}, {...valid,confirmed:false},{...valid,reason:'short'},{...valid,settlementId:'bad'}]){const h=harness('ok',body);assert.equal((await h.post()).status,400);assert.equal(h.calls(),0);}});
test('trusted actor and durable receipt determine success, failures never imply cancellation',async()=>{const ok=await harness('ok',{...valid,actorId:'attacker'}).post();assert.equal(ok.status,200);assert.equal(ok.headers['Cache-Control'],'private, no-store');for(const [mode,status] of [['conflict',409],['db-error',503],['malformed',503]] as const){const response=await harness(mode).post();assert.equal(response.status,status);assert.ok(!JSON.stringify(response).includes('PRIVATE'));}});

test('correction receipt must bind reason and actor to the recorded mutation',async()=>{
 const row={id:requestId,settlement_id:settlementId,reason:valid.reason,created_by:'trusted-actor',created_at:'2026-11-02T10:00:00Z'};
 for(const receipt of [null,[],{id:requestId,settlement_id:settlementId},{...row,created_by:'other'},{...row,reason:'Other correction reason'},{...row,created_at:'invalid'}]) {
 const h=harness('ok',valid,receipt);assert.equal((await h.post()).status,503);assert.equal(h.calls(),1);
 }
 const h=harness('ok',{...valid,reason:'  '+valid.reason+'  '},row);
 for(let i=0;i<2;i++){const response=await h.post();assert.equal(response.status,200);assert.deepEqual(JSON.parse(JSON.stringify(response.body)),{record:row});}
 assert.equal(h.calls(),2,'one RPC per explicit request; no automatic retry');
});
