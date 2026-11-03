import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/api/admin/manual-card-editorial/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const actor='11111111-1111-4111-8111-111111111111', history='22222222-2222-4222-8222-222222222222';
function fixture(options:{authError?:unknown;user?:boolean;owner?:boolean;access?:boolean;throws?:boolean}={}){
 const calls={clients:0,admins:0,auth:0,rpc:[] as {name:string;args:Record<string,unknown>}[]};
 const admin={rpc:async(name:string,args:Record<string,unknown>)=>{calls.rpc.push({name,args});return{data:[{publication_id:'publication',publication_status:'published',calculated_tier:'gold',nominal_price_gbp:10}],error:null};}};
 const modules:Record<string,unknown>={
  'next/server':{NextResponse:{json:Response.json}},
  '@/lib/admin/owner':{isOwnerEmail:()=>options.owner!==false},
  '@/lib/supabase/admin':{createAdminClient:()=>{calls.admins++;return admin;}},
  '@/lib/supabase/server':{createClient:async()=>{calls.clients++;if(options.throws)throw Error('PRIVATE_AUTH');return{auth:{getUser:async()=>{calls.auth++;return{data:{user:options.user===false?null:{id:actor,email:'owner@synthetic.invalid'}},error:options.authError??null};}}};}},
  '@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>options.access!==false},
  '@/lib/touchlineArena/manual-market-value-editorial':{}, '@/lib/touchlineArena/manual-market-value-bulk':{}, '@/lib/touchlineArena/country-flags':{}, '@/lib/touchlineArena/card-review-state':{}, '@/lib/touchlineArena/card-editorial-overrides':{},
 };const exports:Record<string,unknown>={};runInNewContext(compiled,{exports,URL,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
 return{calls,post:exports.POST as (r:Request)=>Promise<Response>,patch:exports.PATCH as (r:Request)=>Promise<Response>};
}
function request(method='PATCH',headers:Record<string,string>={},action=''){
 const url=`https://qa.synthetic.invalid/api/admin/manual-card-editorial${action?'?action='+action:''}`;
 const req=new Request(url,{method,headers:{origin:'https://qa.synthetic.invalid','sec-fetch-site':'same-origin','content-type':'application/json',...headers},body:JSON.stringify({action:'revert',historyId:history})});return Object.assign(req,{nextUrl:new URL(url)});
}
test('editorial rejects foreign, missing and malformed origins before auth or commands for every action',async()=>{
 for(const action of ['', 'preview','bulk-preview','save-review','reconcile-publication'])for(const origin of ['https://foreign.invalid','null','','https://qa.synthetic.invalid.attacker.test']){
  const f=fixture();const result=await f.post(request('POST',{origin},action));assert.equal(result.status,403,action+origin);assert.equal(f.calls.clients,0);assert.equal(f.calls.rpc.length,0);
 }
 for(const headers of [{origin:'https://foreign.invalid'},{'sec-fetch-site':'cross-site'}]){const f=fixture();assert.equal((await f.patch(request('PATCH',headers))).status,403);assert.equal(f.calls.clients,0);}
});
test('editorial rejects simple form/text media types before auth or command',async()=>{
 for(const contentType of ['text/plain','application/x-www-form-urlencoded','multipart/form-data',''])for(const method of ['POST','PATCH']){
  const f=fixture();assert.equal((await (method==='POST'?f.post:f.patch)(request(method,{'content-type':contentType}))).status,415);assert.equal(f.calls.clients,0);
 }
});
test('auth failures with an apparent owner never authorize a revert or expose private error',async()=>{
 for(const options of [{authError:{message:'PRIVATE_AUTH',status:503}},{throws:true}]){const f=fixture(options);const result=await f.patch(request());assert.equal(result.status,503);assert.equal(f.calls.rpc.length,0);assert.ok(!(await result.text()).includes('PRIVATE_AUTH'));}
 for(const options of [{user:false},{owner:false},{access:false}]){const f=fixture(options);assert.equal((await f.patch(request())).status,403);assert.equal(f.calls.rpc.length,0);}
});
test('legitimate JSON same-origin revert preserves command and authenticated actor; preview still validates input',async()=>{
 const f=fixture();const result=await f.patch(request('PATCH',{'content-type':'application/json; charset=utf-8'}));assert.equal(result.status,200);assert.deepEqual(JSON.parse(JSON.stringify(f.calls.rpc)),[{name:'touchline_revert_manual_card_publication',args:{p_history_id:history,p_actor_id:actor}}]);assert.equal((await result.json()).ok,true);
 const p=fixture();assert.equal((await p.post(request('POST',{},'preview'))).status,400);assert.equal(p.calls.auth,1);assert.equal(p.calls.rpc.length,0);
});

test('unknown or empty explicit POST actions never fall through to publication',async()=>{for(const action of ['publish','typo','PREVIEW','preview&action=save-review']){const f=fixture();const result=await f.post(request('POST',{},action));assert.equal(result.status,400);assert.equal(f.calls.clients,0);assert.equal(f.calls.rpc.length,0);}const f=fixture();const req=request('POST');req.nextUrl.searchParams.set('action','');assert.equal((await f.post(req)).status,400);assert.equal(f.calls.clients,0);});
