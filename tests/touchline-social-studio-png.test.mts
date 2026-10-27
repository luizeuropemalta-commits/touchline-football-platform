import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checksumTouchlineSocialArtifact } from "../lib/touchlineArena/social-publication-contract.ts";
import * as png from "../lib/touchlineArena/social-studio-png.ts";
const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const id = "11111111-1111-4111-8111-111111111111";
const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
new DataView(bytes.buffer).setUint32(16,1080); new DataView(bytes.buffer).setUint32(20,1350);
const checksum = checksumTouchlineSocialArtifact(bytes);
const draft: png.StudioPngDraft = { id, content_type: "FULL_TIME", fixture_provider_id: "123", placement: "FEED", locale: "pt-BR", revision: 1, width:1080, height:1350, caption:"Official caption", approval_state:"APPROVAL_REQUIRED", created_at:"2026-10-25", artifact_storage_provider:"SUPABASE_STORAGE", artifact_storage_bucket:"touchline-social-drafts", artifact_storage_key:`instagram/123/${checksum.slice(7)}.png`, artifact_etag:null, artifact_content_type:"image/png", artifact_byte_length:24, artifact_checksum:checksum };
// Controlled private read adapters; no database, storage writes, or remote calls.
/* eslint-disable @typescript-eslint/no-explicit-any */
function load(path: string, dependencies: Record<string,unknown>) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,Buffer,DataView,URL,require:(name:string)=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name];}});
  return exports as Record<string, (...args:any[])=>Promise<any>>;
}
function fixture(options: {auth?:boolean; qa?:boolean; queryError?:boolean; row?:png.StudioPngDraft|null; corrupt?:boolean; rows?:png.StudioPngDraft[]} = {}) {
  let reads=0,queries=0;
  const builder:any={};
  for(const name of ["select","eq","neq","order","range"]) builder[name]=()=>builder;
  builder.maybeSingle=async()=>({data:options.row===undefined?draft:options.row,error:options.queryError?{message:"private diagnostic"}:null});
  builder.returns=async()=>({data:options.rows??[draft],error:options.queryError?{message:"private diagnostic"}:null});
  const deps={
    "@/lib/supabase/admin":{createAdminClient:()=>({from:()=>{queries++;return builder;}})},
    "@/lib/touchlineArena/social-studio-server":{authorizeStudio:async()=>options.auth===false?null:"admin"},
    "@/lib/touchlineArena/social-artifact-storage-server":{assertTouchlineSocialQaRuntime:()=>{if(options.qa===false)throw Error("QA");},createTouchlineSocialArtifactStorageFromEnvironment:()=>({readExact:async(locator:unknown)=>{reads++;return{locator,contentType:"image/png",bytes:options.corrupt?new Uint8Array(24):bytes};}})},
    "@/lib/touchlineArena/social-studio-png":png,
  };
  class Response { body:unknown; init:any; constructor(body:unknown,init:any={}){this.body=body;this.init=init;} static json(body:unknown,init:unknown){return new Response(body,init);} }
  return {get:load("app/api/admin/social-publications/studio/png/route.ts",{...deps,"next/server":{NextResponse:Response}}).GET,
    page:load("app/(app)/admin/social-publications/studio/page.tsx",{...deps,"react/jsx-runtime":require("react/jsx-runtime"),"next/link":{default:(props:any)=>React.createElement("a",props)},"next/navigation":{notFound:()=>{throw Error("NOT_FOUND");}},"@/components/arena-admin-ui":{GamePanel:(props:any)=>React.createElement("section",props)}}).default,
    counts:()=>({reads,queries})};
}
const request=(query=`id=${id}`)=>({nextUrl:new URL(`https://qa.example/api?${query}`)});
test("PNG locator rejects wrong content, traversal, checksum and cancelled artifacts",()=>{
  assert.ok(png.studioPngLocator(draft));
  for(const change of [{artifact_content_type:"video/mp4"},{artifact_storage_key:`instagram/../${checksum.slice(7)}.png`},{artifact_storage_bucket:"avatars"},{artifact_checksum:"sha256:bad"},{approval_state:"CANCELLED"},{artifact_byte_length:22}])assert.equal(png.studioPngLocator({...draft,...change}),null);
});
test("PNG route checks authorization and QA before private data or bytes",async()=>{
  for(const options of [{auth:false},{qa:false}]){const f=fixture(options); const response=await f.get(request());assert.equal(response.init.status,options.auth===false?401:503);assert.deepEqual(f.counts(),{reads:0,queries:0});}
});
test("PNG route rejects bad IDs, absent rows, data errors and corrupt bytes",async()=>{
  const invalid=fixture();assert.equal((await invalid.get(request("id=../secret"))).init.status,400);assert.equal(invalid.counts().queries,0);
  for(const [options,status] of [[{row:null},404],[{queryError:true},503],[{row:{...draft,artifact_content_type:"video/mp4"}},404],[{corrupt:true},409],[{row:{...draft,width:200}},409]] as const){const f=fixture(options);const result=await f.get(request());assert.equal(result.init.status,status);assert.equal(result.body.error,"PNG_UNAVAILABLE");}
});
test("PNG preview/download returns exact original bytes with private no-store and no writes",async()=>{
  for(const download of [false,true]){const f=fixture();const response=await f.get(request(`id=${id}${download?"&download=1":""}`));assert.equal(response.init.headers["Content-Type"],"image/png");assert.equal(response.init.headers["Cache-Control"],"private, no-store");assert.match(response.init.headers["Content-Disposition"],download?/^attachment/:/^inline/);assert.deepEqual([...response.body],[...bytes]);assert.deepEqual(f.counts(),{reads:1,queries:1});}
});
test("Studio renders real PNG captions with PT/EN copy and no video or posting controls",async()=>{
  for(const lang of ["pt-BR","en-GB"]){const f=fixture();const html=renderToStaticMarkup(await f.page({searchParams:Promise.resolve({lang})}));assert.match(html,/Official caption/);assert.match(html,/download=1/);assert.ok(html.includes(png.studioPngCopy(lang).download));assert.doesNotMatch(html,/<video|<button|studio\/review|studio\/video/);assert.equal(f.counts().reads,0);}
});
test("Studio preserves page navigation and reports read failures without leaking diagnostics",async()=>{
  const f=fixture({rows:Array.from({length:13},(_,i)=>({...draft,id:`${i}`}))});const html=renderToStaticMarkup(await f.page({searchParams:Promise.resolve({page:"1",lang:"en-GB"})}));assert.match(html,/page=0/);assert.match(html,/page=2/);assert.equal((html.match(/<img/g)??[]).length,12);
  const error=renderToStaticMarkup(await fixture({queryError:true}).page({}));assert.match(error,/role="alert"/);assert.doesNotMatch(error,/private diagnostic|<img/);
  await assert.rejects(()=>fixture({auth:false}).page({}),/NOT_FOUND/);
});
