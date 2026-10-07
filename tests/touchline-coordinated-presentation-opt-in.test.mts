import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as accessibility from "../lib/touchlineArena/site-accessibility-i18n.ts";
import { NextRequest, NextResponse } from "next/server.js";
import * as hostRouting from "../lib/server/touchline-host-routing.ts";
import * as publicOrigin from "../lib/touchlineArena/public-origin.ts";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";
import * as access from "../lib/touchlineArena/auth-access.ts";
import * as locale from "../lib/touchlineArena/root-locale.ts";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as publicError from "../lib/touchlineArena/public-error-i18n.ts";

function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

const proxyCode = compile("../proxy.ts");
const syncCode = compile("../components/touchline/DocumentLocaleSync.tsx");

function proxyHarness(draftLocalesEnabled = false, releaseFlag?: string) {
  const process = { env: { TOUCHLINE_SITE_LOCALES_ENABLED: releaseFlag } };
  const siteLocales = {};
  runInNewContext(compile("../lib/touchlineArena/site-locales-release.ts"), { exports: siteLocales, process });
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/site-locales-release": siteLocales,
    "next/server": { NextResponse },
    "@/lib/server/touchline-host-routing": hostRouting,
    "@/lib/touchlineArena/public-origin": publicOrigin,
    "@/lib/touchlineArena/auth-i18n": auth,
    "@/lib/touchlineArena/auth-access": access,
    "@/lib/touchlineArena/root-locale": locale,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/public-error-i18n": publicError,
    "@/lib/touchlineAudit/access": { isTouchlineAuditMode: () => false },
    "@/lib/touchlinePreview/isolation": { resolveTouchlineIsolatedPreviewRoutePolicy: () => ({ status: "inactive" }) },
    "@/lib/touchlinePreview/qa-visual-review": { TOUCHLINE_STABLE_QA_HOST: "qa.example.test" },
  };
  const exports: { proxy?: (request: NextRequest) => Promise<NextResponse>; internal?: (request: NextRequest, enabled?: boolean) => Promise<NextResponse> } = {};
  runInNewContext(proxyCode + "\nexports.internal = handleTouchLineRequest;", {
    exports, URL, Headers, process,
    require(name: string) {
      assert.ok(name in modules, `Unexpected proxy dependency: ${name}`);
      return modules[name];
    },
  });
  assert.ok(exports.proxy);
  return draftLocalesEnabled ? (request: NextRequest) => exports.internal!(request, true) : exports.proxy;
}

function request(path: string, saved?: string, method = "GET") {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: saved === undefined ? {} : { cookie: `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=${saved}` },
  });
}


test("trusted internal opt-in preserves explicit Arabic over stale PT; the public wrapper remains gated", async () => {
  const path="/live?fixture=123&lang=ar-SA";
  const opted=await proxyHarness(true)(request(path,"pt-BR"));
  assert.equal(opted.status,200);
  assert.equal(opted.headers.get("location"),null);
  assert.equal(opted.headers.get("x-middleware-request-x-touchline-presentation-locale"),"ar-SA");
  const publicResult=await proxyHarness()(request(path,"pt-BR"));
  assert.equal(new URL(publicResult.headers.get("location")!).searchParams.get("lang"),"pt-BR");
  const released=await proxyHarness(false,"true")(request(path,"pt-BR"));
  assert.equal(released.status,200);
  assert.equal(released.headers.get("location"),null);
  assert.equal(released.headers.get("x-middleware-request-x-touchline-presentation-locale"),"ar-SA");
  const disabled=await proxyHarness(false,"false")(request(path,"pt-BR"));
  assert.equal(new URL(disabled.headers.get("location")!).searchParams.get("lang"),"pt-BR");
});

test("trusted opt-in restores absent query, canonicalizes invalid query and overwrites forged presentation headers", async () => {
  const run=proxyHarness(true);
  const absent=await run(request("/live?fixture=123","ar-SA"));
  const absentDestination=absent.headers.get("location");
  assert.ok(absentDestination,"absent query must restore the approved saved locale before SSR");
  assert.equal(new URL(absentDestination).searchParams.get("lang"),"ar-SA");
  assert.match(absent.headers.get("cache-control")??"",/private.*no-store/);
  const invalid=await run(request("/live?lang=invalid","pt-BR"));
  assert.equal(new URL(invalid.headers.get("location")!).searchParams.get("lang"),"en-GB");
  for(const enabled of [false,true]) {
    const forged=new NextRequest("http://localhost:3000/live?lang=pt-BR",{headers:{
      "x-touchline-presentation-locale":"ar-SA","x-touchline-login-presentation-locale":"ar-SA",
      "x-touchline-draft-locales-enabled":"true",
    }});
    const result=await proxyHarness(enabled)(forged);
    assert.equal(result.headers.get("x-middleware-request-x-touchline-presentation-locale"),"pt-BR");
    assert.equal(result.headers.get("x-middleware-request-x-touchline-login-presentation-locale"),null);
  }
});

test("both modes leave API, POST, callback and asset queries out of locale redirects",async()=>{
  for(const enabled of [false,true])for(const [path,method] of [
    ["/api/example?lang=invalid","GET"],["/login?lang=invalid","POST"],
    ["/auth/callback?lang=invalid","GET"],["/assets/demo.png?lang=invalid","GET"],
  ]) {
    const result=await proxyHarness(enabled)(request(path,"pt-BR",method));
    assert.equal(result.headers.get("location"),null,path);
  }
});

function syncDocument(query:string,initialLocale:string,draftLocalesEnabled?:boolean, pathname = "/live") {
  let writes=0;
  const document={
    documentElement:{lang:initialLocale,dir:"ltr"},
    querySelector:()=>null,
    get cookie(){return "touchline:locale:v1=pt-BR";},
    set cookie(_value:string){writes++;},
  };
  const modules:Record<string,unknown>={
    react:{useEffect:(callback:()=>void)=>callback()},
    "next/navigation":{usePathname:()=>pathname,useSearchParams:()=>new URLSearchParams(query)},
    "@/lib/touchlineArena/root-locale":locale,
    "@/lib/touchlineArena/auth-i18n":auth,
  };
  const exports:{default?:(props:unknown)=>unknown}={};
  runInNewContext(syncCode,{exports,document,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  exports.default!({initialLocale,draftLocalesEnabled});
  return {document,writes};
}
test("document opt-in retains Arabic SSR without query, keeps physical LTR and never persists a URL choice",()=>{
  for(const query of ["","lang=ar-SA"]) {
    const result=syncDocument(query,"ar-SA",true);
    assert.equal(result.document.documentElement.lang,"ar-SA");
    assert.equal(result.document.documentElement.dir,"ltr");
    assert.equal(result.writes,0);
  }
  assert.equal(syncDocument("lang=ar-SA","en-GB").document.documentElement.lang,"en-GB");
  for (const path of ["/login", "/register", "/forgot-password"]) for (const enabled of [false,true]) {
    assert.equal(syncDocument("lang=ar-SA&returnTo=%2Fclubowner%2F..%2Fadmin", "en-GB", enabled, path).document.documentElement.lang, "en-GB");
  }
  for (const path of ["/admin", "/admin/login", "/visual-qa/cards"]) {
    assert.equal(syncDocument("lang=ar-SA", "en-GB", true, path).document.documentElement.lang, "en-GB");
    assert.equal(syncDocument("lang=pt-BR", "en-GB", true, path).document.documentElement.lang, "pt-BR");
  }
  const source=readFileSync(new URL("../components/touchline/DocumentLocaleSync.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(source,/document\.cookie\s*=|writeBrowserStorage|localStorage\.setItem|sessionStorage\.setItem/);
});

type Element={type:unknown;props:Record<string,unknown>};
function elements(tree:unknown):Element[] {
  if(Array.isArray(tree))return tree.flatMap(elements);
  if(!tree||typeof tree!=="object"||!("props" in tree))return [];
  const element=tree as Element;
  return [element,...elements(element.props.children)];
}
async function rootLayout(enabled:boolean, publicRelease = false) {
  const source=readFileSync(new URL("../app/layout.tsx",import.meta.url),"utf8");
  const file=ts.createSourceFile("layout.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const functions=file.statements.filter((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&
    ["RootLayout","renderRootLayout"].includes(node.name?.text??"")).map(node=>node.getText(file)).join("\n");
  const js=ts.transpileModule(functions,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:{default?:(props:unknown)=>Promise<unknown>;internal?:(props:unknown,enabled:boolean)=>Promise<unknown>}={};
  runInNewContext(js+"\nexports.internal = typeof renderRootLayout === 'function' ? renderRootLayout : RootLayout;",{
    exports,headers:async()=>new Headers({[locale.TOUCHLINE_PRESENTATION_LOCALE_HEADER]:"ar-SA"}),
    isTouchLineSiteLocalesEnabled:()=>publicRelease, SiteLocaleReleaseProvider:"locale-release",
    ...locale,...accessibility,normalizeTouchLineLoginLocale:auth.normalizeTouchLineLoginLocale,
    isTouchlineIsolatedPreviewRequest:()=>false,TOUCHLINE_ISOLATED_PREVIEW_HEADER:"x-touchline-isolated-preview",
    resolveTouchlineDataSource:()=>"direct",Suspense:"suspense",DocumentLocaleSync:"document-sync",
    TouchlineActivityTracker:"activity",TouchlineLandscapeBoundary:"landscape",TouchlineAmbientAudioProvider:"audio",
    require:(name:string)=>{assert.equal(name,"react/jsx-runtime");return jsx;},
  });
  return enabled?exports.internal!({children:null},true):exports.default!({children:null});
}
test("root SSR and document receive the same trusted opt-in; exported layout remains default-off",async()=>{
  const tree=elements(await rootLayout(true));
  assert.equal(tree[0].type,"html");assert.equal(tree[0].props.lang,"ar-SA");assert.equal(tree[0].props.dir,"ltr");
  const sync=tree.find(node=>node.type==="document-sync")!;
  assert.equal(sync.props.initialLocale,"ar-SA");assert.equal(sync.props.draftLocalesEnabled,true);
  const boundary=tree.find(node=>node.type==="landscape")!;
  assert.equal(boundary.props.locale,"ar-SA");assert.equal(boundary.props.draftLocalesEnabled,true);
  assert.equal(elements(await rootLayout(false))[0].props.lang,"en-GB");
  const publicTree=elements(await rootLayout(false,true));
  assert.equal(publicTree[0].props.lang,"ar-SA");
  assert.equal(publicTree.find(node=>node.type==="locale-release")!.props.enabled,true);
});
