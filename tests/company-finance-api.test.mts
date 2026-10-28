import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as core from "../lib/admin/company-finance-api.ts";
const actor="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222";
const command={kind:"suppliers",requestId:id,fields:{name:"Supplier",created_by:"forged"}};
test("money conversion is exact and rejects hidden precision, TC and unsafe integers",()=>{
 assert.equal(core.parseCompanyAmount("0.29",2,"EUR").minor,29);
 assert.equal(core.parseCompanyAmount("123.456",3,"KWD").minor,123456);
 for(const [amount,scale,currency] of [["0.001",2,"EUR"],["1e6",2,"EUR"],["1",0,"TC"],["9007199254740992",0,"EUR"],["1,00",2,"EUR"]] as const)assert.throws(()=>core.parseCompanyAmount(amount,scale,currency));
});
test("command injects actor and rejects invalid dates and future/unconfirmed payments",()=>{
 const parsed=core.parseCompanyCommand(command,actor,"2026-10-25");assert.equal(parsed.row.created_by,actor);assert.equal(parsed.row.id,id);
 assert.throws(()=>core.parseCompanyCommand({kind:"contracts",requestId:id,fields:{supplier_id:id,title:"X",starts_on:"2026-02-30"}},actor,"2026-10-25"));
 assert.throws(()=>core.parseCompanyCommand({kind:"settlements",requestId:id,fields:{obligation_id:id,amount:"1",unit_exponent:2,currency:"EUR",paid_on:"2027-01-01",source:"MANUAL",source_reference:"x"}},actor,"2026-10-25"));
 assert.equal(core.companyReplayMatches({id,name:"x",created_at:"extra"},{id,name:"x"}),true);assert.equal(core.companyReplayMatches({id,name:"x"},{id,name:"y"}),false);
});
/* eslint-disable @typescript-eslint/no-explicit-any */
function harness(options:{auth?:boolean;authError?:boolean;schemaError?:boolean;rows?:Record<string,unknown>[];existing?:Record<string,unknown>}={}){
 let reads=0,inserts=0,rpcs=0;const stored:Record<string,unknown>|undefined=options.existing;let proposed:Record<string,unknown>={};
 const builder:any={select:()=>builder,returns:()=>builder,eq:()=>builder,order:()=>builder,range:async()=>({data:options.rows??[],error:options.schemaError?{code:"42P01"}:null}),maybeSingle:async()=>{reads++;return{data:stored??null,error:options.schemaError?{code:"42P01"}:null};},insert:(row:Record<string,unknown>)=>{inserts++;proposed=row;return builder;},single:async()=>({data:proposed,error:null})};
 class Response{body: any;init:any;constructor(body:any,init:any){this.body=body;this.init=init;}static json(body:any,init:any){return new Response(body,init);}}
 const deps:any={"next/server":{NextResponse:Response},"@/lib/admin/owner":{isOwnerEmail:()=>options.auth!==false},"@/lib/touchlineArena/auth-access":{hasTouchLineArenaAccess:()=>options.auth!==false},"@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:actor,email:"owner@example.test"}},error:options.authError?{}:null})}})},"@/lib/supabase/admin":{createAdminClient:()=>({from:()=>builder,rpc:async()=>{rpcs++;return{data:{id},error:null};}})},"@/lib/admin/company-finance-api":core};
 const exports:any={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/api/admin/company-finance/route.ts",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,TextEncoder,require:(name:string)=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});
 const req=(body=command,origin="https://qa.test",query="")=>({nextUrl:new URL(`https://qa.test/api${query}`),headers:new Headers({origin,"content-type":"application/json"}),body:new Request("https://qa.test",{method:"POST",body:JSON.stringify(body)}).body});
 return{...exports,req,counts:()=>({reads,inserts,rpcs}),proposed:()=>proposed};
}
test("routes reject unauthorised or errored session before database and cross-origin before mutation",async()=>{
 for(const options of [{auth:false},{authError:true}]){const h=harness(options);assert.equal((await h.POST(h.req())).init.status,403);assert.equal((await h.GET(h.req())).init.status,403);assert.deepEqual(h.counts(),{reads:0,inserts:0,rpcs:0});}
 const h=harness();assert.equal((await h.POST(h.req(command,"https://other.test"))).init.status,403);assert.equal(h.counts().inserts,0);
});
test("API creates once or replays exact actor-bound record; conflicts and missing schema remain explicit",async()=>{
 const h=harness();assert.equal((await h.POST(h.req())).init.status,201);assert.equal(h.proposed().created_by,actor);
 const same=harness({existing:{id,name:"Supplier",created_by:actor}});assert.equal((await same.POST(same.req())).init.status,200);assert.equal(same.counts().inserts,0);
 const conflict=harness({existing:{id,name:"Changed",created_by:actor}});assert.equal((await conflict.POST(conflict.req())).init.status,409);
 const missing=harness({schemaError:true});assert.equal((await missing.GET(missing.req())).init.status,503);assert.equal((await missing.POST(missing.req())).init.status,503);
 const invalid=harness();assert.equal((await invalid.GET(invalid.req(command,"https://qa.test","?kind=users"))).init.status,400);
});

test("JSON reader bounds streamed body and rejects invalid JSON",async()=>{
 assert.equal(await core.readCompanyJson(new Request("https://qa.test",{method:"POST",headers:{"content-type":"application/json"},body:"x".repeat(12001)})),null);
 assert.equal(await core.readCompanyJson(new Request("https://qa.test",{method:"POST",headers:{"content-type":"application/json"},body:"{"})),null);
});

test("settlement history projects correction object or array and rejects malformed evidence",async()=>{
 for(const correction of [null,[],{id,reason:'A documented correction'},[{id,reason:'A documented correction'}]]){
 const h=harness({rows:[{id,amount_minor:100,correction}]});const result=await h.GET(h.req(command,'https://qa.test','?kind=settlements'));
 assert.equal(result.init.status,200);assert.equal(result.body.rows[0].correction_id,correction&&(!Array.isArray(correction)||correction.length)?id:null);assert.ok(!('correction' in result.body.rows[0]));
 }
 for(const correction of [[{id,reason:'one'},{id,reason:'two'}],{id,reason:123}]){const h=harness({rows:[{id,correction}]});assert.equal((await h.GET(h.req(command,'https://qa.test','?kind=settlements'))).init.status,503);}
});
