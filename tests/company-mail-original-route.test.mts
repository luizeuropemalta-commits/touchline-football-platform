import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {createHash} from "node:crypto";
import {documentUuid} from "../lib/admin/company-documents.ts";
const compiled=ts.transpileModule(readFileSync(new URL("../app/api/admin/company-finance/mail/original/route.ts",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const bytes=Buffer.from("Subject: Example\r\n\r\nOriginal body");
function harness(mode="ok"){
 let reads=0;const exports={} as {GET(request:Request):Promise<Response>};
 const deps:Record<string,unknown>={
  "next/server":{NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},
  "node:crypto":{createHash},"@/lib/admin/company-documents":{documentUuid},
  "@/lib/admin/owner":{isOwnerEmail:()=>mode!=="customer"},"@/lib/touchlineArena/auth-access":{hasTouchLineArenaAccess:()=>true},
  "@/lib/supabase/server":{createClient:async()=>mode==="anonymous"?null:{auth:{getUser:async()=>({data:{user:{email:"synthetic@example.test"}},error:null})}}},
  "@/lib/supabase/admin":{createAdminClient:()=>({from:()=>{reads++;const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({error:mode==="db-error"?{message:"PRIVATE"}:null,data:mode==="missing"?null:{original:mode==="invalid"?"\\xzz":"\\x"+bytes.toString("hex"),checksum:mode==="tampered"?"0".repeat(64):createHash("sha256").update(bytes).digest("hex")}})};return query;}})},
 };
 vm.runInNewContext(compiled,{exports,Buffer,Response,require:(key:string)=>{assert.ok(key in deps);return deps[key];}});return {...exports,reads:()=>reads};
}
const request=()=>Object.assign(new Request("https://example.test/api/admin/company-finance/mail/original?id=11111111-1111-4111-8111-111111111111"),{nextUrl:new URL("https://example.test/?id=11111111-1111-4111-8111-111111111111")});
test("original download is owner-only and attachment bytes match checksum",async()=>{
 for(const mode of ["anonymous","customer"]){const h=harness(mode);assert.equal((await h.GET(request())).status,403);assert.equal(h.reads(),0);}
 const result=await harness().GET(request());assert.equal(result.status,200);assert.equal(await result.text(),bytes.toString());assert.equal(result.headers.get("cache-control"),"private, no-store");assert.match(result.headers.get("content-disposition")!,/^attachment;/);assert.equal(result.headers.get("content-type"),"application/octet-stream");
});
test("missing or damaged original is never served as trusted attachment",async()=>{
 assert.equal((await harness("missing").GET(request())).status,404);
 for(const mode of ["invalid","tampered","db-error"]){const result=await harness(mode).GET(request());assert.equal(result.status,503);assert.equal(result.headers.get("content-disposition"),null);assert.ok(!(await result.text()).includes("PRIVATE"));}
});
