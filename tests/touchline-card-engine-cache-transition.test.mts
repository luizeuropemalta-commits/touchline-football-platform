import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as crypto from "node:crypto";
const batch="11111111-1111-4111-8111-111111111111";

const source = readFileSync(new URL("../lib/touchlineArena/card-engine-batch-server.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture(cacheFails = false) {
  const cacheCalls: unknown[][] = [];
  const logged: unknown[][] = [];
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", "console", compiled)((id: string) => {
    if (id === "server-only") return {};
    if (id === "node:crypto") return crypto;
    if (id === "next/cache") return { revalidateTag: (...args: unknown[]) => {
      cacheCalls.push(args);
      if (cacheFails) throw new Error("cache unavailable");
    } };
    if (id === "./public-player-projection") return {
      TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID: "8",
      TOUCHLINE_ENGLAND_EFFECTIVE_SEASON: "2026-27",
    };
    throw new Error(`Unexpected runtime dependency: ${id}`);
  }, exports, { error: (...args: unknown[]) => logged.push(args) });
  return {
    cacheCalls, logged,
    create: exports.createTouchlineCardEngineBatch as (admin:unknown,input:unknown)=>Promise<unknown>,
    transition: exports.transitionTouchlineCardEngineBatch as (
      admin: { rpc: () => Promise<unknown> },
      input: { action: string; batchId: string; actorId: string },
    ) => Promise<unknown>,
  };
}

for (const action of ["publish", "rollback", "approve"]) {
  test(`${action} expires cache only when it changes published content`, async () => {
    const f = fixture();
    const result = { batch_id: batch, status: action === "approve" ? "approved" : action === "publish" ? "published" : "reverted", ...(action === "publish" ? {published_rows:1} : action === "rollback" ? {reverted_rows:1} : {}) };
    assert.equal(await f.transition({ rpc: async () => ({ data: [result], error: null }) }, {
      action, batchId: batch, actorId: "owner",
    }), result);
    assert.deepEqual(f.cacheCalls, action === "approve" ? [] : [["touchline-public-projection:8:2026-27", { expire: 0 }]]);
  });
}

test("failed RPC never expires the cache", async () => {
  const f = fixture();
  await assert.rejects(f.transition({ rpc: async () => ({ data: null, error: { message: "transaction failed" } }) }, {
    action: "publish", batchId: batch, actorId: "owner",
  }), /transaction failed/);
  assert.deepEqual(f.cacheCalls, []);
});

test("cache failure preserves the successful committed result and records a diagnostic", async () => {
  const f = fixture(true);
  const result = { batch_id: batch, status: "published",published_rows:1 };
  assert.equal(await f.transition({ rpc: async () => ({ data: [result], error: null }) }, {
    action: "publish", batchId: batch, actorId: "owner",
  }), result);
  assert.equal(f.logged.length, 1);
  assert.equal(f.cacheCalls.length, 1);
});

test("malformed or divergent receipts never confirm a transition or expire cache",async()=>{
 for(const data of [null,[],[{}],[{batch_id:batch,status:"approved"}],[{batch_id:"other",status:"published",published_rows:1}],[{batch_id:batch,status:"published",published_rows:-1}],[{batch_id:batch,status:"published",published_rows:"1"}]]){
 const f=fixture();await assert.rejects(f.transition({rpc:async()=>({data,error:null})},{action:"publish",batchId:batch,actorId:"owner"}));assert.equal(f.cacheCalls.length,0);
 }
});
test("create validates SQL counts, status and replay receipt",async()=>{
 const input={sourceType:"paste",effectiveSeason:"2026-27",rows:[{matchStatus:"matched"}],actorId:batch,contentIdentity:"synthetic"};
 const receipt={batch_id:batch,status:"draft",replayed:false,rows_received:1,matched_rows:1,review_rows:0,conflict_rows:0,unmatched_rows:0};
 for(const data of [[{}],[{...receipt,rows_received:2}],[{...receipt,matched_rows:0}],[{...receipt,replayed:"false"}],[{...receipt,status:"published"}]]) await assert.rejects(fixture().create({rpc:async()=>({data,error:null})},input));
 for(const state of [receipt,{...receipt,replayed:true,status:"published"}]) assert.equal(await fixture().create({rpc:async()=>({data:[state],error:null})},input),state);
});

test("unknown action cannot fall through to rollback",async()=>{
 const f=fixture();let calls=0;
 await assert.rejects(f.transition({rpc:async()=>{calls++;return {data:[],error:null};}},{action:"unknown",batchId:batch,actorId:"owner"}),/Invalid Card Engine action/);
 assert.equal(calls,0);assert.equal(f.cacheCalls.length,0);
});
