import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { readCompanyJson } from "../lib/admin/company-finance-api.ts";
import { documentUuid } from "../lib/admin/company-documents.ts";
const source=readFileSync(new URL("../app/api/admin/company-finance/mail/route.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function harness(mode="ok"){
 let privileged=0,runs=0;const selections:string[]=[];const reviews:Record<string,unknown>[]=[];
 const exports={} as {GET(request:Request):Promise<{status:number;body:unknown;headers:Record<string,string>}>;POST(request:Request):Promise<{status:number;body:unknown;headers:Record<string,string>}>};
 const deps:Record<string,unknown>={
  "next/server":{NextResponse:{json:(body:unknown,init:object)=>({body,...init})}},
  "@/lib/admin/owner":{isOwnerEmail:()=>mode!=="customer"},
  "@/lib/touchlineArena/auth-access":{hasTouchLineArenaAccess:()=>mode!=="no-access"},
  "@/lib/supabase/server":{createClient:async()=>mode==="anonymous"?null:{auth:{getUser:async()=>({data:{user:{id:"11111111-1111-4111-8111-111111111111"}},error:mode==="auth-error"?{}:null})}}},
  "@/lib/supabase/admin":{createAdminClient:()=>{privileged++;return {rpc:async(name:string,args:Record<string,unknown>)=>{assert.equal(name,"touchline_company_review_mail");reviews.push(args);return {data:{id:(args.p_command as Record<string,unknown>).requestId},error:mode==="review-error"?{message:"SECRET"}:null};},from:()=>{const query={select:(fields:string)=>{selections.push(fields);return query;},order:()=>query,limit:(n:number,options:unknown)=>{assert.equal(n,1);assert.equal(JSON.stringify(options),JSON.stringify({referencedTable:"reviews"}));return query;},range:async()=>({data:[],error:mode==="db-error"?{message:"PRIVATE"}:null})};return query;}};}},
  "@/lib/admin/company-finance-api":{readCompanyJson},"@/lib/admin/company-documents":{documentUuid},
  "@/lib/admin/company-mail-store":{companyMailStore:()=>({}),connectCompanyMailbox:async()=>({})},
  "@/lib/admin/company-mail-intake":{ingestCompanyMailPage:async()=>{runs++;if(mode==="job-error")throw Error("SECRET");return {state:mode==="disabled"?"DISABLED":"IMPORTED",imported:0,pending:0};}},
 };
 vm.runInNewContext(compiled,{exports,require:(key:string)=>{assert.ok(key in deps,key);return deps[key];}});
 return {...exports,privileged:()=>privileged,runs:()=>runs,selections,reviews};
}
function request(method="GET",body?:unknown,origin="https://example.test",query=""){
 const req=new Request(`https://example.test/api/admin/company-finance/mail${query}`,{method,headers:{origin,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return Object.assign(req,{nextUrl:new URL(req.url)});
}
test("mail routes deny nonowner and missing access before database/provider",async()=>{
 for(const mode of ["anonymous","customer","no-access","auth-error"]){const h=harness(mode);assert.equal((await h.GET(request())).status,403);assert.equal((await h.POST(request("POST",{}))).status,403);assert.equal(h.privileged(),0);assert.equal(h.runs(),0);}
});
test("mail list is private, excludes originals and rejects invalid pages",async()=>{
 const h=harness();const result=await h.GET(request());assert.equal(result.status,200);assert.equal(result.headers["Cache-Control"],"private, no-store");assert.ok(!h.selections[0].includes("original"));
 assert.equal((await h.GET(request("GET",undefined,undefined,"?page=-1"))).status,400);
 assert.equal((await h.GET(request("GET",undefined,undefined,"?kind=secrets"))).status,400);
 const failed=await harness("db-error").GET(request());assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes("PRIVATE"));
});
test("mail run checks origin and bounded command, keeps gate outcome explicit",async()=>{
 const h=harness();const body={action:"run",scanId:"33333333-3333-4333-8333-333333333333"};
 assert.equal((await h.POST(request("POST",body,"https://attacker.test"))).status,403);
 assert.equal((await h.POST(request("POST",{...body,scanId:"bad"}))).status,400);
 assert.equal((await h.POST(request("POST",{...body,padding:"A".repeat(13000)}))).status,400);assert.equal(h.runs(),0);
 const disabled=await harness("disabled").POST(request("POST",body));assert.match(JSON.stringify(disabled.body),/DISABLED/);
 const failed=await harness("job-error").POST(request("POST",body));assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes("SECRET"));
});
test("mail review validates targets, pins actor from session and returns real receipt",async()=>{
 const command={requestId:"22222222-2222-4222-8222-222222222222",evidenceId:"33333333-3333-4333-8333-333333333333",action:"LINK",kind:"obligations",targetId:"44444444-4444-4444-8444-444444444444",note:"Verified",actorId:"attacker"};
 const h=harness();assert.equal((await h.POST(request("POST",{action:"review",command}))).status,200);assert.equal(h.reviews.length,1);assert.equal(h.reviews[0].p_actor_id,"11111111-1111-4111-8111-111111111111");assert.ok(!JSON.stringify(h.reviews).includes("attacker"));
 assert.equal((await h.POST(request("POST",{action:"review",command:{...command,targetId:"bad"}}))).status,400);
 assert.equal((await h.POST(request("POST",{action:"review",command:{...command,kind:"users"}}))).status,400);
 const failed=await harness("review-error").POST(request("POST",{action:"review",command}));assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes("SECRET"));
});
test("finance JSON reader rejects a stalled body within its deadline",async()=>{
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{"complete":true}'));}});
 const req=new Request("https://example.test",{method:"POST",headers:{"content-type":"application/json"},body:stream,duplex:"half"} as RequestInit);
 assert.equal(await readCompanyJson(req,5),null);
});
