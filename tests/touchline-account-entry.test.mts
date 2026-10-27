import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";
import {touchlineGlobalNavigationEntryHref} from "../lib/touchlineArena/global-navigation.ts";

const source=readFileSync(new URL("../app/account/page.tsx",import.meta.url),"utf8");
class MissingSession extends Error {}
type AuthResult={data:{user:{email:string;user_metadata?:unknown}|null};error:unknown};
async function destination(result:AuthResult|null|Error,params:Record<string,string>={lang:"pt-BR"}) {
  const exports={} as {default:(props:{searchParams:Promise<Record<string,string>>})=>Promise<never>};
  const targets:string[]=[];let authReads=0;
  const modules:Record<string,unknown>={
    "next/navigation":{redirect:(href:string)=>{targets.push(href);throw new Error("NEXT_REDIRECT");}},
    "@supabase/supabase-js":{AuthSessionMissingError:MissingSession},
    "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>{authReads++;if(result instanceof Error)throw result;return result;}}})},
    "@/lib/admin/owner":{isOwnerEmail:(email:string)=>email==="admin@example.test"},
    "@/lib/touchlineArena/server-read-deadline":{resolveServerReadWithin:async(promise:Promise<unknown>,fallback:unknown,deadline:number)=>{assert.equal(deadline,8000);assert.equal(fallback,null);return await promise.catch(()=>fallback);}},
    "@/lib/touchlineArena/catalogue-locale":catalogue,
    "@/lib/touchlineArena/site-locales-release":{isTouchLineSiteLocalesEnabled:()=>false},
    "@/lib/touchlineArena/auth-i18n":authCopy,
  };
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  await assert.rejects(exports.default({searchParams:Promise.resolve(params)}),/NEXT_REDIRECT/);
  assert.equal(authReads,1);assert.equal(targets.length,1);
  return targets[0];
}

test("public entry resolves admin, customer and unknown roles without customer links for admin",()=>{
  assert.equal(touchlineGlobalNavigationEntryHref("pt-BR","auth"),"/admin?lang=pt-BR");
  assert.equal(touchlineGlobalNavigationEntryHref("de-DE","auth",true),"/admin?lang=en-GB");
  assert.equal(touchlineGlobalNavigationEntryHref("pt-BR","public"),"/clubowner?lang=pt-BR");
  assert.equal(touchlineGlobalNavigationEntryHref("pt-BR","authenticated"),"/clubowner?lang=pt-BR");
});
test("verified administrator returns directly to admin, never creates a customer team",async()=>{
  assert.equal(await destination({data:{user:{email:"admin@example.test"}},error:null}),"/admin?lang=pt-BR");
  assert.doesNotMatch(source,/createAdminClient|upsert|\.insert\(|getSession|user_metadata|searchParams.*role/);
});
test("verified customer retains ClubOwner; spoofed query and metadata cannot select admin",async()=>{
  assert.equal(await destination({data:{user:{email:"customer@example.test",user_metadata:{role:"admin"}}},error:null},{lang:"en-GB",role:"admin",returnTo:"https://evil.test"}),"/clubowner?lang=en-GB");
});
test("guest retains account return after login without an open redirect",async()=>{
  const url=new URL(await destination({data:{user:null},error:null}),"https://touchline.test");
  assert.equal(url.pathname,"/login");assert.equal(url.searchParams.get("returnTo"),"/account?lang=pt-BR");assert.equal(url.searchParams.get("error"),null);
});
test("missing session is a guest, not an auth outage",async()=>{
  assert.doesNotMatch(await destination({data:{user:null},error:new MissingSession()}),/error=auth_unavailable/);
  const contradictory=new URL(await destination({data:{user:{email:"admin@example.test"}},error:new MissingSession()}),"https://touchline.test");
  assert.equal(contradictory.pathname,"/login");
});
test("unavailable or thrown Auth fails closed without selecting an identity",async()=>{
  for(const value of [null,new Error("private provider details"),{data:{user:{email:"admin@example.test"}},error:undefined},{data:{user:{email:"admin@example.test"}},error:new Error("provider error")}]){
    const url=new URL(await destination(value),"https://touchline.test");
    assert.equal(url.pathname,"/login");assert.equal(url.searchParams.get("error"),"auth_unavailable");assert.doesNotMatch(url.href,/private|provider/);
  }
});
