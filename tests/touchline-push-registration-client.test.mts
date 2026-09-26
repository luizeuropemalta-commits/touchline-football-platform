import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

function client(response: { ok: boolean; json: () => Promise<unknown> }, stall = false, workerStage?: "register" | "ready" | "subscription" | "subscribe") {
  let requests = 0;
  let timeoutAction: (() => void) | undefined;
  let cleared = false;
  let releaseWorker: (() => void) | undefined;
  let subscriptionReads = 0;
  const subscription = { toJSON: () => ({ endpoint: "https://push.example.test/device", keys: {} }) };
  const context = vm.createContext({
    AbortController,
    atob,
    setTimeout: (action: () => void, delay: number) => { assert.equal(delay, 15_000); timeoutAction = action; return 1; },
    clearTimeout: () => { cleared = true; },
    process: { env: { NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: "A".repeat(87) } },
    window: { Notification: {}, PushManager: {}, localStorage: { getItem: () => "11111111-1111-4111-8111-111111111111" } },
    Notification: { permission: "granted" },
    navigator: { serviceWorker: {
      register: async () => {
        if (workerStage === "register") await new Promise<void>(resolve => { releaseWorker = resolve; });
        return { pushManager: { getSubscription: async () => {
          subscriptionReads += 1;
          if (workerStage === "subscription") await new Promise<void>(resolve => { releaseWorker = resolve; });
          return workerStage === "subscribe" ? null : subscription;
        }, subscribe: async () => {
          await new Promise<void>(resolve => { releaseWorker = resolve; });
          return subscription;
        } } };
      },
      ready: workerStage === "ready" ? new Promise<void>(resolve => { releaseWorker = resolve; }) : Promise.resolve(),
    } },
    fetch: async (_url: string, options: { signal: AbortSignal }) => {
      requests += 1;
      if (stall) return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
      return response;
    },
  });
  const source = readFileSync(new URL("../lib/touchlineArena/push-device-registration.ts", import.meta.url), "utf8");
  vm.runInContext(stripTypeScriptTypes(source).replace(/export /g, ""), context);
  return { run: () => vm.runInContext("registerTouchlinePushDevice()", context) as Promise<string>, count: () => requests, expire: () => timeoutAction?.(), cleared: () => cleared,
    hasDeadline: () => Boolean(timeoutAction), releaseWorker: () => releaseWorker?.(), subscriptionReads: () => subscriptionReads };
}

test("stalled worker preparation fails explicitly and late completion cannot save a device", async () => {
  for (const stage of ["register", "ready", "subscription", "subscribe"] as const) {
    const instance = client({ ok: true, json: async () => ({ ok: true, delivery: "not-sent" }) }, false, stage);
    const pending = instance.run();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(instance.hasDeadline(), true, `${stage} must have a deadline`);
    const rejected = assert.rejects(pending, /touchline-push-preparation-timeout/);
    instance.expire();
    await rejected;
    assert.equal(instance.cleared(), true);
    instance.releaseWorker();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(instance.count(), 0, "late preparation must not persist after failure");
    assert.equal(instance.subscriptionReads(), stage === "subscription" || stage === "subscribe" ? 1 : 0);
  }
});

test("a stalled device save aborts after the deadline without resending or claiming activation", async () => {
  const instance = client({ ok: true, json: async () => ({ ok: true, delivery: "not-sent" }) }, true);
  const pending = instance.run();
  const rejected = assert.rejects(pending, /aborted/);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(instance.count(), 1);
  instance.expire();
  await rejected;
  assert.equal(instance.count(), 1);
  assert.equal(instance.cleared(), true);
});

test("registration requires the explicit server acknowledgement, not just HTTP200", async () => {
  for (const body of [null, {}, [], { ok: false }, { ok: "true", delivery: "not-sent" }, { ok: true }, { ok: true, delivery: "sent" }]) {
    const instance = client({ ok: true, json: async () => body });
    await assert.rejects(instance.run(), /touchline-device-registration-failed/);
    assert.equal(instance.count(), 1);
  }
});

test("malformed or unsuccessful registration responses fail without a blind retry", async () => {
  for (const response of [
    { ok: true, json: async () => { throw new SyntaxError("invalid body"); } },
    { ok: false, json: async () => ({ ok: true, delivery: "not-sent" }) },
  ]) {
    const instance = client(response);
    await assert.rejects(instance.run(), /touchline-device-registration-failed/);
    assert.equal(instance.count(), 1);
  }
});

test("acknowledged registration returns registered without claiming or sending delivery", async () => {
  const instance = client({ ok: true, json: async () => ({ ok: true, delivery: "not-sent" }) });
  assert.equal(await instance.run(), "registered");
  assert.equal(instance.count(), 1);
});
