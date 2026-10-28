import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {timingSafeEqual} from "node:crypto";
const compiled=ts.transpileModule(readFileSync(new URL("../app/api/internal/company-finance/mail/run/route.ts",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function harness(enabled=false,fail=false){
 let runs=0,clients=0;const exports={} as {POST(req:Request):Promise<Response>};const env={TOUCHLINE_COMPANY_MAIL_JOB_SECRET:"a".repeat(32),TOUCHLINE_COMPANY_MAIL_JOB_ENABLED:enabled?"1":"0"};
 const deps:Record<string,unknown>={"next/server":{NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},"node:crypto":{timingSafeEqual},"@/lib/supabase/admin":{createAdminClient:()=>{clients++;return {}; }},"@/lib/admin/company-mail-job":{runCompanyMailJob:async()=>{runs++;if(fail)throw Error("SECRET");return {page:{state:"IDLE"},retryState:"NONE"};}}};
 vm.runInNewContext(compiled,{exports,Buffer,process:{env},require:(key:string)=>{assert.ok(key in deps);return deps[key];}});return {...exports,runs:()=>runs,clients:()=>clients};
}
function request(secret:string){return new Request("https://example.test/api/internal/company-finance/mail/run",{method:"POST",headers:{"x-touchline-job-secret":secret}});}
test("mail scheduler rejects wrong secrets and OFF gate makes no reads",async()=>{
 const h=harness();for(const secret of ["","wrong","é".repeat(32)])assert.equal((await h.POST(request(secret))).status,403);
 const off=await h.POST(request("a".repeat(32)));assert.equal(off.status,200);assert.deepEqual(await off.json(),{state:"DISABLED"});assert.equal(h.runs(),0);assert.equal(h.clients(),0);
});
test("enabled mail scheduler returns actual job result and sanitizes failure",async()=>{
 const h=harness(true);const result=await h.POST(request("a".repeat(32)));assert.equal(result.status,200);assert.equal(h.runs(),1);assert.deepEqual(await result.json(),{page:{state:"IDLE"},retryState:"NONE"});
 const failed=await harness(true,true).POST(request("a".repeat(32)));assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes("SECRET"));
});
