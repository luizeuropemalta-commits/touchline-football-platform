import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { inspectTouchlineIsolatedPreviewEnvironment } from "../lib/touchlinePreview/isolation.ts";

const require = createRequire(import.meta.url);
const timingExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/server-phase-timing.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: timingExports, process: { env: {} }, performance, console,
  require: (name: string) => name === "server-only" ? {} : name === "../touchlinePreview/isolation" ? { inspectTouchlineIsolatedPreviewEnvironment } : require(name),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(panel: string | null = null) {
  const geometry = deferred<object>();
  const auth = deferred<{ data: { user: { id: string; email: string } | null } }>();
  const calls: string[] = [];
  const redirect = new Error("redirect");
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/server-phase-timing": timingExports,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "./ArenaClient": { default: () => null },
    "next/headers": { headers: async () => ({ get: () => "qa.example" }) },
    "next/navigation": { redirect: () => { throw redirect; } },
    "@/lib/touchlineArena/arena-navigation": { parseTouchlineArenaPanel: () => panel },
    "@/lib/touchlineArena/arena-intro": { parseTouchlineArenaIntroIntent: () => null },
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale: () => "en-GB" },
    "@/lib/touchlineArena/public-origin": { TOUCHLINE_QA_HOSTNAME: "qa.example" },
    "@/lib/touchlineArena/server-read-deadline": { resolveServerReadWithin: (promise: unknown, fallback: unknown, timeout: number) => {
      assert.equal(timeout, 8000); assert.equal(fallback, null); return promise;
    } },
    "@/lib/supabase/server": { createClient: async () => { calls.push("client"); return { auth: { getUser: () => { calls.push("auth"); return auth.promise; } } }; } },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/touchlineArena/formation-geometry-server": { readTouchlineFormationGeometryRegistry: () => { calls.push("geometry"); return geometry.promise; } },
    "@/lib/touchlineFantasy/server": { loadTouchlineFantasyArenaSnapshot: async (user: { id: string }, registry: object) => { assert.equal(user.id, "customer"); assert.equal(registry, await geometry.promise); calls.push("fantasy"); return null; } },
    "@/lib/touchlineFantasy/arena-lineup": { buildTouchlineFantasyArenaLineup: () => null },
  };
  const exports: { default?: (input: { searchParams: Promise<object> }) => Promise<unknown> } = {};
  const source = readFileSync(new URL("../app/arena/page.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    assert.ok(name in modules, `Unexpected module: ${name}`); return modules[name];
  }, URLSearchParams, fetch: () => assert.fail("Network forbidden") });
  return { result: exports.default!({ searchParams: Promise.resolve({}) }), calls, geometry, auth, redirect };
}

test("Arena starts bounded authentication while geometry is pending; Fantasy waits for identity", async () => {
  const run = fixture();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(run.calls.slice().sort(), ["auth", "client", "geometry"]);
  run.geometry.resolve({});
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!run.calls.includes("fantasy"));
  run.auth.resolve({ data: { user: { id: "customer", email: "synthetic@example.test" } } });
  await run.result;
  assert.equal(run.calls.filter(call => call === "fantasy").length, 1);
});

test("Arena anonymous identity never reads Fantasy", async () => {
  const run = fixture();
  run.geometry.resolve({}); run.auth.resolve({ data: { user: null } });
  await run.result;
  assert.ok(!run.calls.includes("fantasy"));
});

test("Arena panel redirect occurs before auth, geometry or Fantasy reads", async () => {
  const run = fixture("rankings");
  await assert.rejects(run.result, error => error === run.redirect);
  assert.deepEqual(run.calls, []);
});
