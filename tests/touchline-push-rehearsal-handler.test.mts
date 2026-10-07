import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import test from "node:test";
import { handlePushRehearsal, type PushRehearsalDependencies } from "../lib/touchlineArena/push-rehearsal-handler.ts";

const actorId = "10000000-0000-4000-8000-000000000001";
const installationId = "20000000-0000-4000-8000-000000000001";
const deviceId = "30000000-0000-4000-8000-000000000001";
const requestId = "40000000-0000-4000-8000-000000000001";
const reservationId = "50000000-0000-4000-8000-000000000001";
const body = { installationId, requestId, explicitTestConsent: true };
const registration = { installationId, permission: "granted", subscription: {
  endpoint: "https://fcm.googleapis.com/device-one", keys: {
    p256dh: createECDH("prime256v1").generateKeys().toString("base64url"), auth: Buffer.alloc(16, 7).toString("base64url"),
  },
} };
function request(value: unknown = body) {
  return new Request("https://qa.example/api/notifications/rehearsal", {
    method: "POST", headers: { origin: "https://qa.example", "content-type": "application/json", "sec-fetch-site": "same-origin", "x-touchline-expected-account": actorId },
    body: JSON.stringify(value),
  });
}
function harness() {
  const calls: string[] = [];
  const sends: Parameters<PushRehearsalDependencies["send"]>[0][] = [];
  const finishes: Parameters<PushRehearsalDependencies["finish"]>[0][] = [];
  const deps: PushRehearsalDependencies = {
    enabled: true, now: () => new Date("2026-10-03T00:00:00Z"), requestTimeoutMs: 1000,
    actor: async () => { calls.push("actor"); return { id: actorId, allowed: true }; },
    loadOwnedDevice: async () => { calls.push("load"); return { ownerId: actorId, deviceId, registration }; },
    reserve: async input => { calls.push("reserve"); return { status: "reserved", ...input, reservationId }; },
    send: async input => { calls.push("send"); sends.push(input); return "provider_accepted"; },
    finish: async input => { calls.push("finish"); finishes.push(input); return true; },
  };
  return { deps, calls, sends, finishes };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

test("one selected device is reserved, reread and sent fixed silent test copy, never declared delivered", async () => {
  const h = harness();
  const response = await handlePushRehearsal(request(), h.deps);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, status: "provider_accepted" });
  assert.deepEqual(h.calls, ["actor", "load", "reserve", "load", "send", "finish"]);
  assert.equal(h.sends.length, 1);
  assert.deepEqual(JSON.parse(h.sends[0].payload), { title: "TouchLine · TESTE / TEST", body: "Teste de notificação / Notification test", href: "/notifications", silent: true });
  assert.equal(h.sends[0].expiresAt.getTime() - h.deps.now().getTime(), 30_000);
  assert.deepEqual(h.sends[0].subscription, registration.subscription);
  assert.equal(h.finishes[0].outcome, "provider_accepted");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("method, exact origin, cross-site and disabled gate reject before dependencies", async () => {
  const base = request();
  for (const [input, enabled, code] of [
    [new Request(base.url), true, 405], [request(), undefined, 503], [request(), false, 503],
    [new Request(base, { headers: { origin: "https://foreign.example" } }), true, 403],
    [new Request(request(), { headers: {} }), true, 403],
    [new Request(request(), { headers: { origin: "https://qa.example/" } }), true, 403],
    [new Request(request(), { headers: { origin: "https://qa.example", "sec-fetch-site": "cross-site" } }), true, 403],
  ] as const) {
    const h = harness(); h.deps.enabled = enabled;
    assert.equal((await handlePushRehearsal(input, h.deps)).status, code);
    assert.deepEqual(h.calls, []);
  }
});

test("exact bounded consent JSON rejects missing consent, extra authority, malformed and oversized bodies", async () => {
  for (const value of [null, [], {}, { ...body, explicitTestConsent: false }, { ...body, explicitTestConsent: "true" },
    { ...body, requestId: "bad" }, { ...body, installationId: ` ${installationId}` },
    ...["userId", "endpoint", "text", "title"].map(key => ({ ...body, [key]: "injected" }))]) {
    const h = harness(); assert.equal((await handlePushRehearsal(request(value), h.deps)).status, 400);
    assert.equal(h.sends.length, 0); assert.ok(!h.calls.includes("reserve"));
  }
  for (const raw of ["{", " ".repeat(1025)]) {
    const h = harness(); assert.equal((await handlePushRehearsal(new Request(request(), { body: raw }), h.deps)).status, 400);
    assert.equal(h.sends.length, 0);
  }
});

test("anonymous, disallowed and uncertain auth never access devices", async () => {
  for (const actor of [null, { id: actorId, allowed: false }, { id: "bad", allowed: true }]) {
    const h = harness(); h.deps.actor = async () => actor;
    assert.ok([401, 403, 503].includes((await handlePushRehearsal(request(), h.deps)).status));
    assert.deepEqual(h.calls, []);
  }
  const h = harness(); h.deps.actor = async () => { throw Error("private-secret"); };
  const response = await handlePushRehearsal(request(), h.deps);
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private-secret/);
});

test("missing or changed expected account blocks before reservation", async () => {
  for (const expected of ["", "bad", requestId]) {
    const h = harness(); const input = request(); input.headers.set("x-touchline-expected-account", expected);
    assert.ok([400,409].includes((await handlePushRehearsal(input, h.deps)).status));
    assert.ok(!h.calls.includes("load")); assert.equal(h.sends.length, 0);
  }
});

test("wrong owner, installation, denied permission and unsupported endpoint cannot reserve", async () => {
  for (const device of [null, { ownerId: requestId, deviceId, registration },
    { ownerId: actorId, deviceId, registration: { ...registration, installationId: requestId } },
    { ownerId: actorId, deviceId, registration: { ...registration, permission: "denied", subscription: null } },
    { ownerId: actorId, deviceId, registration: { ...registration, subscription: { ...registration.subscription, endpoint: "https://evil.example/track" } } }]) {
    const h = harness(); h.deps.loadOwnedDevice = async () => device;
    assert.equal((await handlePushRehearsal(request(), h.deps)).status, 409);
    assert.ok(!h.calls.includes("reserve")); assert.equal(h.sends.length, 0);
  }
});

test("duplicate, cooldown, unavailable and uncertain reservation never send", async () => {
  for (const status of ["duplicate", "cooldown", "unavailable", "unknown"] as const) {
    const h = harness(); h.deps.reserve = async () => ({ status });
    assert.ok([409, 429, 503].includes((await handlePushRehearsal(request(), h.deps)).status));
    assert.equal(h.sends.length, 0); assert.equal(h.finishes.length, 0);
  }
});

test("reservation receipt must match every identity and binding, and be unexpired", async () => {
  for (const change of [{ actorId: requestId }, { deviceId: requestId }, { installationId: requestId },
    { requestId: actorId }, { fingerprint: "sha256:wrong" }, { reservationId: "bad" }, { expiresAt: "2026-10-02T00:00:00Z" }]) {
    const h = harness(); h.deps.reserve = async input => ({ status: "reserved", ...input, reservationId, ...change });
    assert.equal((await handlePushRehearsal(request(), h.deps)).status, 503); assert.equal(h.sends.length, 0);
  }
});

test("post-reservation revocation, replacement or missing device cancels without switching target", async () => {
  for (const changed of [null, { ownerId: requestId, deviceId, registration },
    { ownerId: actorId, deviceId: requestId, registration },
    { ownerId: actorId, deviceId, registration: { ...registration, subscription: { ...registration.subscription, endpoint: "https://fcm.googleapis.com/replaced" } } },
    { ownerId: actorId, deviceId, registration: { ...registration, permission: "default", subscription: null } }]) {
    const h = harness(); let reads = 0;
    h.deps.loadOwnedDevice = async (actor, installation) => { assert.equal(actor, actorId); assert.equal(installation, installationId); return ++reads === 1 ? { ownerId: actorId, deviceId, registration } : changed; };
    assert.equal((await handlePushRehearsal(request(), h.deps)).status, 409);
    assert.equal(h.sends.length, 0); assert.equal(h.finishes[0].outcome, "cancelled");
  }
});

test("transport uncertainty is recorded without retry and finish failure cannot claim success", async () => {
  for (const failedFinish of [false, true]) {
    const h = harness(); h.deps.send = async input => { h.sends.push(input); if (!failedFinish) throw Error("private-endpoint"); return "provider_accepted"; };
    h.deps.finish = async input => { h.finishes.push(input); return !failedFinish; };
    const response = await handlePushRehearsal(request(), h.deps);
    assert.equal(response.status, 503); assert.equal(h.sends.length, 1);
    assert.equal(h.finishes[0].outcome, failedFinish ? "provider_accepted" : "unknown");
    assert.deepEqual(await response.json(), { ok: false, status: "unconfirmed" });
  }
});

test("known transport rejection is terminal and responses disclose no device, actor or subscription", async () => {
  const h = harness(); h.deps.send = async input => { h.sends.push(input); return "rejected"; };
  const response = await handlePushRehearsal(request(), h.deps);
  assert.equal(response.status, 502); assert.equal(h.sends.length, 1);
  assert.equal(h.finishes[0].outcome, "rejected");
  const text = await response.text();
  assert.equal(text, '{"ok":false,"status":"rejected"}');
  for (const secret of [actorId, installationId, deviceId, requestId, reservationId, registration.subscription.endpoint, registration.subscription.keys.auth]) assert.ok(!text.includes(secret));
});

test("request cancellation and invalid or backward clocks cannot cause a send", async () => {
  const h = harness(); const controller = new AbortController(); controller.abort();
  assert.equal((await handlePushRehearsal(new Request(request(), { signal: controller.signal }), h.deps)).status, 503);
  assert.deepEqual(h.calls, []);
  for (const time of [NaN, Date.parse("2026-10-02T00:00:00Z"), Date.parse("2026-10-04T00:00:00Z")]) {
    const attempt = harness(); const clock = attempt.deps.now;
    attempt.deps.reserve = async input => { attempt.deps.now = () => new Date(time); return { status: "reserved", ...input, reservationId }; };
    assert.equal((await handlePushRehearsal(request(), attempt.deps)).status, 503);
    assert.equal(attempt.sends.length, 0); attempt.deps.now = clock;
  }
});

test("lost reservation receipt and rejected finish preserve uncertainty without a second attempt", async () => {
  const h = harness(); h.deps.reserve = async () => { throw Error("commit-may-have-happened"); };
  assert.equal((await handlePushRehearsal(request(), h.deps)).status, 503);
  assert.equal(h.sends.length, 0); assert.equal(h.finishes.length, 0);
  const second = harness(); second.deps.finish = async () => { throw Error("private-storage-error"); };
  assert.equal((await handlePushRehearsal(request(), second.deps)).status, 503);
  assert.equal(second.sends.length, 1);
});

test("deadline fences late reserve and fresh-read completion; abort propagates", async () => {
  for (const boundary of ["reserve", "fresh"] as const) {
    const h = harness(); h.deps.requestTimeoutMs = 20;
    const paused = deferred<unknown>(); let signal: AbortSignal | undefined; let receipt: unknown; let reads = 0;
    if (boundary === "reserve") h.deps.reserve = async (input, inputSignal) => { signal = inputSignal; receipt = { status: "reserved", ...input, reservationId }; return await paused.promise as never; };
    else h.deps.loadOwnedDevice = async (_actor, _installation, inputSignal) => { if (++reads === 1) return { ownerId: actorId, deviceId, registration }; signal = inputSignal; receipt = { ownerId: actorId, deviceId, registration }; return await paused.promise as never; };
    const response = await handlePushRehearsal(request(), h.deps);
    assert.equal(response.status, 503); assert.equal(signal?.aborted, true);
    paused.resolve(receipt); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.sends.length, 0);
  }
});

test("deadline covers stalled request body and at most one stalled transport attempt", async () => {
  const stalled = new ReadableStream<Uint8Array>({ start() {} });
  const h = harness(); h.deps.requestTimeoutMs = 20;
  const input = new Request(request(), { body: stalled, duplex: "half" } as RequestInit);
  assert.equal((await handlePushRehearsal(input, h.deps)).status, 503); assert.equal(h.sends.length, 0);
  const second = harness(); second.deps.requestTimeoutMs = 20;
  const paused = deferred<"provider_accepted">();
  second.deps.send = async value => { second.sends.push(value); return paused.promise; };
  assert.equal((await handlePushRehearsal(request(), second.deps)).status, 503);
  assert.equal(second.sends.length, 1); assert.equal(second.sends[0].signal.aborted, true);
  assert.equal(second.finishes[0].outcome, "unknown");
  paused.resolve("provider_accepted"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(second.sends.length, 1); assert.equal(second.finishes.length, 1);
});
