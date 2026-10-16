import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/touchlineArena/card-engine-batch-server.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture(cacheFails = false) {
  const cacheCalls: unknown[][] = [];
  const logged: unknown[][] = [];
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", "console", compiled)((id: string) => {
    if (id === "server-only" || id === "node:crypto") return {};
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
    transition: exports.transitionTouchlineCardEngineBatch as (
      admin: { rpc: () => Promise<unknown> },
      input: { action: string; batchId: string; actorId: string },
    ) => Promise<unknown>,
  };
}

for (const action of ["publish", "rollback", "approve"]) {
  test(`${action} expires cache only when it changes published content`, async () => {
    const f = fixture();
    const result = { batch_id: "batch", status: action };
    assert.equal(await f.transition({ rpc: async () => ({ data: [result], error: null }) }, {
      action, batchId: "batch", actorId: "owner",
    }), result);
    assert.deepEqual(f.cacheCalls, action === "approve" ? [] : [["touchline-public-projection:8:2026-27", { expire: 0 }]]);
  });
}

test("failed RPC never expires the cache", async () => {
  const f = fixture();
  await assert.rejects(f.transition({ rpc: async () => ({ data: null, error: { message: "transaction failed" } }) }, {
    action: "publish", batchId: "batch", actorId: "owner",
  }), /transaction failed/);
  assert.deepEqual(f.cacheCalls, []);
});

test("cache failure preserves the successful committed result and records a diagnostic", async () => {
  const f = fixture(true);
  const result = { batch_id: "batch", status: "published" };
  assert.equal(await f.transition({ rpc: async () => ({ data: [result], error: null }) }, {
    action: "publish", batchId: "batch", actorId: "owner",
  }), result);
  assert.equal(f.logged.length, 1);
  assert.equal(f.cacheCalls.length, 1);
});
