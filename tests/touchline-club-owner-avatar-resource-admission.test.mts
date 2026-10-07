import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const load = () => import("../lib/touchlineArena/club-owner-avatar-resource-admission.ts");
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test("resource admission is synchronous, queue-free and closed/foreign/forged scopes cannot run jobs", async () => {
  const mod = await load(), pool = mod.createClubOwnerAvatarResourceAdmission(), foreign = mod.createClubOwnerAvatarResourceAdmission();
  const scope = pool.tryAcquire(); assert.ok(scope); assert.ok(Object.isFrozen(scope)); assert.equal(pool.tryAcquire(), null);
  let started = 0;
  for (const invalid of [{}, foreign.tryAcquire()!]) await assert.rejects(pool.runNative(invalid as typeof scope, async () => { started++; }));
  assert.equal(started, 0); pool.close(scope); pool.close(scope);
  await assert.rejects(pool.runNative(scope, async () => { started++; })); assert.equal(started, 0);
  const next = pool.tryAcquire(); assert.ok(next); assert.notEqual(next, scope); pool.close(next);
});

test("closing a timed-out request never releases capacity before its original native promise settles", async () => {
  const mod = await load(), pool = mod.createClubOwnerAvatarResourceAdmission(), scope = pool.tryAcquire()!;
  const job = deferred<number>(); const pending = pool.runNative(scope, () => job.promise);
  pool.close(scope); pool.close(scope); assert.equal(pool.tryAcquire(), null);
  // Arbitrarily many caller continuations do not act as an automatic release.
  for (let index = 0; index < 30; index++) await Promise.resolve();
  assert.equal(pool.tryAcquire(), null); job.resolve(42); assert.equal(await pending, 42);
  const next = pool.tryAcquire(); assert.ok(next); pool.close(scope); assert.equal(pool.tryAcquire(), null); pool.close(next);
});

test("one child spans a whole job; nested acquisition rejects without queuing and sequential children work", async () => {
  const mod = await load(), pool = mod.createClubOwnerAvatarResourceAdmission(), scope = pool.tryAcquire()!;
  const held = deferred<void>(), pending = pool.runNative(scope, () => held.promise);
  let nested = 0; await assert.rejects(pool.runNative(scope, async () => { nested++; })); assert.equal(nested, 0);
  held.resolve(); await pending; assert.equal(await pool.runNative(scope, async () => "next-stage"), "next-stage");
  assert.equal(pool.tryAcquire(), null); pool.close(scope); const next = pool.tryAcquire(); assert.ok(next); pool.close(next);
});

test("sync throw and asynchronous rejection release child exactly once but never close an open request", async () => {
  const mod = await load(), pool = mod.createClubOwnerAvatarResourceAdmission(), scope = pool.tryAcquire()!;
  await assert.rejects(pool.runNative(scope, () => { throw Error("synthetic"); }));
  assert.equal(await pool.runNative(scope, () => Promise.resolve(1)), 1); assert.equal(pool.tryAcquire(), null);
  const late = deferred<void>(), result = pool.runNative(scope, () => late.promise); pool.close(scope);
  late.reject(Error("synthetic-late")); await assert.rejects(result); const next = pool.tryAcquire(); assert.ok(next); pool.close(next);
});

test("default singleton identity survives separate module evaluations in one JavaScript runtime", async () => {
  const source = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-resource-admission.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {} });
  vm.runInContext(js, context); const first = context.exports as Awaited<ReturnType<typeof load>>;
  // A separate function scope models another bundled module, not another VM.
  context.exports = {}; vm.runInContext(`(function(){${js}\n})()`, context);
  const second = context.exports as typeof first;
  assert.equal(first.getClubOwnerAvatarResourceAdmission(), second.getClubOwnerAvatarResourceAdmission());
  const scope = first.getClubOwnerAvatarResourceAdmission().tryAcquire(); assert.ok(scope);
  assert.equal(second.getClubOwnerAvatarResourceAdmission().tryAcquire(), null);
  second.getClubOwnerAvatarResourceAdmission().close(scope);
});
