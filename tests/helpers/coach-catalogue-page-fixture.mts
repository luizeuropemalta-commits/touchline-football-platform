import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import { cn } from "../../lib/utils.ts";
import * as auth from "../../lib/touchlineArena/auth-i18n.ts";
import * as catalogue from "../../lib/touchlineArena/coach-catalogue-contract.ts";
export const coachEditorialFixtureState: catalogue.CoachEditorialState = { revision:1,publicEnabled:false,currentCount:20,candidates:[{
  id:"22222222-2222-4222-8222-222222222222",revision:1,status:"pending",providerId:"99991",teamId:"19",name:"Synthetic New Coach",clubName:"Arsenal FC",
  sourceKind:"sportmonks.fixture.coaches",sourceId:"9990001",sourceHash:"a".repeat(64),observedAt:"2026-10-27T21:00:00Z",fixtureAt:"2026-10-27T18:00:00Z",currentProviderId:"307",currentName:"Mikel Arteta" }] };
export function coachPageFixture(options: { enabled?:boolean; owner?:boolean; allowed?:boolean; error?:boolean; state?:catalogue.CoachEditorialState }={}) {
  let reads=0;
  const modules = new Map<string,Record<string,unknown>>();
  const compile=(file:string)=>ts.transpileModule(readFileSync(new URL(`../../${file}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const require=(name:string):unknown=>{
    if(name==="react")return React;if(name==="react/jsx-runtime")return jsx;if(name==="lucide-react")return icons;if(name==="@/lib/utils")return {cn};
    if(name==="next/link")return {__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>React.createElement("a",props,children)};
    if(name==="next/navigation")return {notFound:()=>{throw new Error("COACH_ACCESS_DENIED");}};
    if(name==="@/lib/touchlineArena/auth-i18n")return auth;
    if(name==="@/lib/touchlineArena/coach-catalogue-contract")return catalogue;
    if(name==="@/lib/touchlineArena/coach-editorial-server")return {coachEditorialDependencies:()=>({enabled:options.enabled!==false,actor:async()=>({id:"11111111-1111-4111-8111-111111111111",owner:options.owner!==false,allowed:options.allowed!==false}),rpc:async()=>{reads++;if(options.error)throw new Error("PRIVATE_DB_FAILURE");return options.state??coachEditorialFixtureState;}})};
    const paths:Record<string,string>={"@/components/arena-admin-ui":"components/arena-admin-ui.tsx","@/components/ui":"components/ui.tsx","@/components/touchline/admin/CoachCatalogueEditor":"components/touchline/admin/CoachCatalogueEditor.tsx"};
    const path=paths[name];if(!path)throw new Error(`Unexpected dependency ${name}`);
    if(modules.has(path))return modules.get(path);
    const exports:Record<string,unknown>={};modules.set(path,exports);
    runInNewContext(compile(path),{exports,require,React,setTimeout,clearTimeout,AbortController,fetch:()=>assert.fail("No network permitted")});
    if(path === "components/touchline/admin/CoachCatalogueEditor.tsx") { const Editor=exports.CoachCatalogueEditor as React.ComponentType<Record<string,unknown>>; const wrapped={CoachCatalogueEditor:(props:Record<string,unknown>)=>React.createElement("div",{id:"root"},React.createElement(Editor,props))};modules.set(path,wrapped);return wrapped; }
    return exports;
  };
  const exports:Record<string,unknown>={};runInNewContext(compile("app/(app)/admin/coaches/page.tsx"),{exports,require});
  const Page=exports.default as (props:{searchParams:Promise<{lang:string}>})=>Promise<React.ReactNode>;
  return {reads:()=>reads,render:async(lang="pt-BR")=>renderToStaticMarkup(await Page({searchParams:Promise.resolve({lang})}))};
}
