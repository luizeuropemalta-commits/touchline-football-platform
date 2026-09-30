import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { inspectTouchlineIsolatedPreviewEnvironment } from "../lib/touchlinePreview/isolation.ts";
import type { createArenaPhaseTiming } from "../lib/touchlineArena/server-phase-timing.ts";
const require = createRequire(import.meta.url);
const exports: { createArenaPhaseTiming?: typeof createArenaPhaseTiming } = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/server-phase-timing.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, process, performance, console, require: (name: string) => name === "server-only" ? {} : name === "../touchlinePreview/isolation" ? { inspectTouchlineIsolatedPreviewEnvironment } : require(name),
});
const create = exports.createArenaPhaseTiming!;
const qa = { VERCEL_ENV: "preview", VERCEL_URL: "qa.vercel.app", TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy", SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic", SUPABASE_SERVICE_ROLE_KEY: "synthetic" };
test("timings are off unless exact QA contract; no clock or logger calls", async () => {
  for (const env of [{}, { ...qa, VERCEL_ENV: "production" }, { ...qa, TOUCHLINE_QA_SUPABASE_PROJECT_REF: "other" }]) {
    const timer = create(env, { now: () => assert.fail("clock"), emit: () => assert.fail("log") });
    const value = { private: "secret" };
    assert.equal(await timer.run("sync", async () => value), value);
  }
});
test("QA logs fixed phases and monotonic duration only, preserving rejection and value", async () => {
  const logs: Array<{ requestId: string; phase: string; durationMs: number }> = []; let time = 10;
  const timer = create(qa, { now: () => time, emit: (r) => logs.push(r) });
  const error = new Error("private SQL/email/userId");
  await assert.rejects(timer.run("sync", async () => { time = 25; throw error; }), (value: unknown) => value === error);
  assert.deepEqual(Object.keys(logs[0]).sort(), ["durationMs", "phase", "requestId"]);
  assert.equal(logs[0].durationMs, 15);
  assert.equal(logs[0].phase, "sync");
  assert.match(logs[0].requestId, /^[a-f0-9-]{36}$/);
  assert.ok(!JSON.stringify(logs).includes("private"));
  // @ts-expect-error runtime callers also cannot inject arbitrary phase text.
  timer.mark("arbitrary-secret"); timer.finish(); assert.equal(logs.length, 1);
  const value = { email: "private" };
  assert.equal(await timer.run("config", async () => value), value);
  assert.equal(logs[1].requestId, logs[0].requestId);
});
test("broken clock or logger cannot alter outcomes", async () => {
  for (const deps of [{ now: () => { throw Error("clock"); } }, { now: () => NaN }, { now: () => 1, emit: () => { throw Error("logger"); } }]) {
    assert.equal(await create(qa, deps).run("sync", async () => 7), 7);
    const error = new Error("private");
    await assert.rejects(create(qa, deps).run("sync", async () => { throw error; }), (actual: unknown) => actual === error);
  }
});
test("backwards clocks suppress invalid durations and request ids are isolated", async () => {
  let time = 10; const records: Array<{ requestId: string }> = [];
  const first = create(qa, { now: () => time, emit: r => records.push(r) });
  first.mark("sync"); time = 5; first.finish(); assert.equal(records.length, 0);
  await first.run("sync", async () => 1);
  await create(qa, { now: () => time, emit: r => records.push(r) }).run("sync", async () => 1);
  assert.notEqual(records[0].requestId, records[1].requestId);
});
test("retained timed loader finishes its request-local timer and preserves shared lifecycle calls", () => {
  const server = readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8");
  assert.match(server, /try \{ return await loadFantasySnapshotCore\(user, "arena", formationRegistry, timing\); \}\s*finally \{ timing\?\.finish\(\); \}/);
  assert.match(server, /loadTouchlineFantasySnapshot\(user: User\)[\s\S]*?return loadFantasySnapshotCore\(user, "full"\)/);
  assert.match(server, /timing\?\.mark\("lifecycle"\)/);
  assert.match(server, /const lifecycle = await reconcileTouchlineFantasyGameweeks\(admin, lifecycleGameweek \? \[lifecycleGameweek\] : \[\], true\);\s*if \(lifecycle\.error\) return null;/);
  assert.ok(server.indexOf('timing?.mark("lifecycle")') < server.indexOf("const lifecycle = await reconcileTouchlineFantasyGameweeks("));
});
