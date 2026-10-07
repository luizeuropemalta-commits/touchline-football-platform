import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

function client(response: { ok: boolean; json: () => Promise<unknown> }, stall = false, workerStage?: "register" | "ready" | "subscription" | "subscribe", binding: "match" | "mismatch" | "missing" = "match", fresh = false) {
  let requests = 0;
  let timeoutAction: (() => void) | undefined;
  let cleared = false;
  let releaseWorker: (() => void) | undefined;
  let subscriptionReads = 0;
  let subscriptions = 0;
  const key = new Uint8Array(65);
  if (binding === "mismatch") key[0] = 1;
  const subscription = { options: { applicationServerKey: binding === "missing" ? null : key.buffer }, toJSON: () => ({ endpoint: "https://push.example.test/device", keys: {} }) };
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
          return workerStage === "subscribe" || fresh ? null : subscription;
        }, subscribe: async () => {
          subscriptions += 1;
          if (workerStage === "subscribe") await new Promise<void>(resolve => { releaseWorker = resolve; });
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
    hasDeadline: () => Boolean(timeoutAction), releaseWorker: () => releaseWorker?.(), subscriptionReads: () => subscriptionReads, subscriptions: () => subscriptions };
}

test("existing subscription must prove the configured application server key before reuse", async () => {
  for (const binding of ["mismatch", "missing"] as const) {
    const instance = client({ ok: true, json: async () => ({ ok: true, delivery: "not-sent" }) }, false, undefined, binding);
    await assert.rejects(instance.run(), /touchline-push-re-registration-required/);
    assert.equal(instance.count(), 0);
    assert.equal(instance.subscriptions(), 0, "must not silently replace the existing subscription");
  }
});

test("a new subscription is created once and saved only with matching key binding", async () => {
  for (const binding of ["match", "mismatch", "missing"] as const) {
    const instance = client({ ok: true, json: async () => ({ ok: true, delivery: "not-sent" }) }, false, undefined, binding, true);
    if (binding === "match") assert.equal(await instance.run(), "registered");
    else await assert.rejects(instance.run(), /touchline-push-re-registration-required/);
    assert.equal(instance.count(), binding === "match" ? 1 : 0);
    assert.equal(instance.subscriptions(), 1);
  }
});

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

const rehearsalAccount = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rehearsalInstallation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rehearsalAck = { ok: true, delivery: "not-sent", accountId: rehearsalAccount, installationId: rehearsalInstallation };
type Stage = "register" | "ready" | "subscription" | "subscribe" | "fetch" | "json";
function rehearsalClient(options: { stage?: Stage; ack?: unknown; existingId?: string | null; storageFails?: boolean; ignoreStorage?: boolean; expected?: string; permission?: string; configured?: boolean } = {}) {
  const calls: string[] = [], requests: { headers: Record<string, string>; body: string; signal: AbortSignal }[] = [];
  let stored = Object.hasOwn(options, "existingId") ? options.existingId : rehearsalInstallation;
  let current = true, release: (() => void) | undefined;
  const controller = new AbortController();
  let listeners = 0;
  const originalAdd = controller.signal.addEventListener.bind(controller.signal);
  const originalRemove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args: Parameters<AbortSignal["addEventListener"]>) => { listeners++; originalAdd(...args); };
  controller.signal.removeEventListener = (...args: Parameters<AbortSignal["removeEventListener"]>) => { listeners--; originalRemove(...args); };
  const timers = new Map<number, () => void>(); let timerId = 0;
  const wait = async <T,>(stage: Stage, value: T): Promise<T> => {
    calls.push(stage);
    if (options.stage === stage) await new Promise<void>(resolve => { release = resolve; });
    return value;
  };
  const subscription = { options: { applicationServerKey: new Uint8Array(65).buffer }, toJSON: () => ({ endpoint: "https://push.example.test/device", keys: {} }) };
  const worker = { pushManager: {
    getSubscription: () => wait("subscription", options.stage === "subscribe" ? null : subscription),
    subscribe: () => wait("subscribe", subscription),
  } };
  const context = vm.createContext({ AbortController, atob, crypto: { randomUUID: () => rehearsalInstallation },
    setTimeout: (callback: () => void, delay: number) => { assert.equal(delay, 15_000); timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    process: { env: { NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: options.configured === false ? undefined : "A".repeat(87) } },
    window: { Notification: {}, PushManager: {}, localStorage: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { calls.push("persist"); if (options.storageFails) throw Error("storage-failed"); if (!options.ignoreStorage) stored = value; },
    } },
    Notification: { permission: options.permission ?? "granted", requestPermission: () => { throw Error("must not prompt"); } },
    navigator: { serviceWorker: { register: () => wait("register", worker), get ready() { return wait("ready", undefined); } } },
    fetch: async (_url: string, input: typeof requests[number]) => {
      assert.equal(_url, "/api/notifications/devices"); requests.push(input);
      assert.equal(stored, JSON.parse(input.body).installationId, "installation must be persisted before PUT");
      return wait("fetch", { ok: true, json: () => wait("json", Object.hasOwn(options, "ack") ? options.ack : rehearsalAck) });
    },
    input: { expectedAccountId: options.expected ?? rehearsalAccount, signal: controller.signal, isCurrentAccount: () => current },
  });
  const source = readFileSync(new URL("../lib/touchlineArena/push-device-registration.ts", import.meta.url), "utf8");
  vm.runInContext(stripTypeScriptTypes(source).replace(/export /g, ""), context);
  return { run: () => vm.runInContext("registerTouchlinePushDeviceForRehearsal(input)", context) as Promise<unknown>,
    calls, requests, invalidate: () => { current = false; }, abort: () => controller.abort(), release: () => release?.(),
    expire: () => { for (const action of [...timers.values()]) action(); }, counts: () => ({ listeners, timers: timers.size }) };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test("rehearsal registration returns only acknowledged account/installation and sends expected-account condition", async () => {
  const h = rehearsalClient({ existingId: null });
  assert.deepEqual(JSON.parse(JSON.stringify(await h.run())), { status: "registered", accountId: rehearsalAccount, installationId: rehearsalInstallation });
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].headers["X-Touchline-Expected-Account"], rehearsalAccount);
  assert.ok(h.calls.indexOf("persist") < h.calls.indexOf("fetch"));
  assert.deepEqual(h.counts(), { listeners: 0, timers: 0 });
});

test("rehearsal refuses missing/malformed/wrong identity acknowledgements without retry", async () => {
  for (const ack of [null, {}, [], { ok: true, delivery: "not-sent" }, { ...rehearsalAck, accountId: undefined },
    { ...rehearsalAck, accountId: "bad" }, { ...rehearsalAck, accountId: rehearsalInstallation },
    { ...rehearsalAck, installationId: undefined }, { ...rehearsalAck, installationId: "bad" },
    { ...rehearsalAck, installationId: rehearsalAccount }]) {
    const h = rehearsalClient({ ack }); await assert.rejects(h.run(), /touchline-device-registration-failed/);
    assert.equal(h.requests.length, 1); assert.deepEqual(h.counts(), { listeners: 0, timers: 0 });
  }
});

test("strong expected UUID and current lifecycle are required before browser work", async () => {
  for (const expected of ["bad", "-".repeat(36), ` ${rehearsalAccount}`]) {
    const h = rehearsalClient({ expected }); await assert.rejects(h.run()); assert.deepEqual(h.calls, []);
  }
  for (const action of ["invalidate", "abort"] as const) {
    const h = rehearsalClient(); h[action](); await assert.rejects(h.run()); assert.deepEqual(h.calls, []);
    assert.deepEqual(h.counts(), { listeners: 0, timers: 0 });
  }
});

test("rehearsal validates and persists a strong installation UUID before save", async () => {
  const repaired = rehearsalClient({ existingId: "-".repeat(36) }); await repaired.run();
  assert.ok(repaired.calls.includes("persist")); assert.equal(JSON.parse(repaired.requests[0].body).installationId, rehearsalInstallation);
  for (const options of [{ storageFails: true }, { ignoreStorage: true }]) {
    const h = rehearsalClient({ existingId: null, ...options }); await assert.rejects(h.run()); assert.equal(h.requests.length, 0);
    assert.deepEqual(h.counts(), { listeners: 0, timers: 0 });
  }
});

test("abort races every browser stage and ignores late completion without a later side effect", async () => {
  for (const stage of ["register", "ready", "subscription", "subscribe", "fetch", "json"] as const) {
    const h = rehearsalClient({ stage }); const pending = h.run(); await tick(); assert.ok(h.calls.includes(stage));
    const rejection = assert.rejects(pending); h.abort(); await rejection;
    const calls = [...h.calls]; h.release(); await tick();
    assert.deepEqual(h.calls, calls, stage); assert.deepEqual(h.counts(), { listeners: 0, timers: 0 });
    assert.equal(h.requests.length, stage === "fetch" || stage === "json" ? 1 : 0);
  }
});

test("current-account guard is checked after every browser await before the next stage", async () => {
  for (const stage of ["register", "ready", "subscription", "subscribe", "fetch", "json"] as const) {
    const h = rehearsalClient({ stage }); const pending = h.run(); await tick();
    const before = [...h.calls]; h.invalidate(); const rejection = assert.rejects(pending); h.release(); await rejection;
    assert.deepEqual(h.calls, before, stage); assert.deepEqual(h.counts(), { listeners: 0, timers: 0 });
  }
});

test("save and response JSON deadlines reject ignored aborts with no retry or late success", async () => {
  for (const stage of ["fetch", "json"] as const) {
    const h = rehearsalClient({ stage }); const pending = h.run(); await tick();
    const rejection = assert.rejects(pending); h.expire(); await rejection;
    assert.equal(h.requests[0].signal.aborted, true); const before = [...h.calls]; h.release(); await tick();
    assert.deepEqual(h.calls, before); assert.equal(h.requests.length, 1); assert.deepEqual(h.counts(), { listeners: 0, timers: 0 });
  }
});

test("rehearsal preserves permission and configuration refusals without prompts or registration", async () => {
  for (const [options, status] of [[{ permission: "default" }, "permission-required"], [{ configured: false }, "subscription-unconfigured"]] as const) {
    const h = rehearsalClient(options); assert.deepEqual(JSON.parse(JSON.stringify(await h.run())), { status }); assert.deepEqual(h.calls, []);
  }
});
