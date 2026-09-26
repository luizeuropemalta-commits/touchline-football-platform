import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import test from "node:test";
import { handlePushDeviceRegistration } from "../lib/touchlineArena/push-device-handler.ts";

const registration = { installationId: "11111111-1111-4111-8111-111111111111", permission: "denied", subscription: null };
const validKeys = { p256dh: createECDH("prime256v1").generateKeys().toString("base64url"), auth: randomBytes(16).toString("base64url") };
function request(body: unknown = registration, origin: string | null = "https://qa.example") {
  return new Request("https://qa.example/api/notifications/devices", {
    method: "PUT", headers: { ...(origin === null ? {} : { origin }), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function harness() {
  const writes: unknown[] = [];
  const deps = {
    actor: async (): Promise<{ id: string; allowed: boolean } | null> => ({ id: "verified-account", allowed: true }),
    save: async (value: unknown) => { writes.push(value); },
  };
  return { deps, writes };
}
test("device updates reject foreign, missing and cross-site origins before authentication", async () => {
  for (const input of [request(registration, "https://foreign.test"), request(registration, null),
    new Request(request(), { headers: { origin: "https://qa.example", "sec-fetch-site": "cross-site" } })]) {
    const { deps, writes } = harness();
    deps.actor = async () => { throw new Error("must not authenticate"); };
    assert.equal((await handlePushDeviceRegistration(input, deps)).status, 403);
    assert.deepEqual(writes, []);
  }
});
test("device registration uses verified identity and only acknowledges completed persistence", async () => {
  const { deps, writes } = harness();
  const response = await handlePushDeviceRegistration(request(), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, delivery: "not-sent" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.deepEqual(writes, [{ userId: "verified-account", registration, userAgent: null }]);
});
test("anonymous and disallowed accounts never register devices", async () => {
  for (const actor of [null, { id: "restricted", allowed: false }]) {
    const { deps, writes } = harness(); deps.actor = async () => actor;
    assert.equal((await handlePushDeviceRegistration(request(), deps)).status, actor ? 403 : 401);
    assert.deepEqual(writes, []);
  }
});
test("malformed JSON and ownership injection are rejected without storage", async () => {
  for (const input of [request({ ...registration, userId: "victim" }), request({ ...registration, permission: "granted" }),
    new Request(request(), { body: "{" })]) {
    const { deps, writes } = harness();
    assert.equal((await handlePushDeviceRegistration(input, deps)).status, 400);
    assert.deepEqual(writes, []);
  }
});
test("database and authentication failures never leak private errors or claim success", async () => {
  for (const boundary of ["actor", "save"] as const) {
    const { deps } = harness();
    deps[boundary] = async () => { throw new Error("secret endpoint and database details"); };
    const response = await handlePushDeviceRegistration(request(), deps);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "DEVICE_REGISTRATION_UNAVAILABLE" });
  }
});
test("unsupported methods cannot authenticate or write; user agent is bounded", async () => {
  const { deps, writes } = harness();
  assert.equal((await handlePushDeviceRegistration(new Request("https://qa.example/api/notifications/devices"), deps)).status, 405);
  assert.deepEqual(writes, []);
  await handlePushDeviceRegistration(new Request(request(), { headers: { origin: "https://qa.example", "user-agent": "x".repeat(900) } }), deps);
  assert.equal((writes[0] as { userAgent: string }).userAgent.length, 512);
});

test("granted subscription and explicit revocation reach the same authenticated installation", async () => {
  const { deps, writes } = harness();
  const subscription = { endpoint: "https://push.example.test/device", keys: validKeys };
  const granted = { ...registration, permission: "granted", subscription };
  assert.equal((await handlePushDeviceRegistration(request(granted), deps)).status, 200);
  assert.equal((await handlePushDeviceRegistration(request(registration), deps)).status, 200);
  assert.deepEqual(writes, [
    { userId: "verified-account", registration: granted, userAgent: null },
    { userId: "verified-account", registration, userAgent: null },
  ]);
});

test("device endpoints with embedded credentials, fragments or URL repair are rejected before storage", async () => {
  for (const endpoint of [
    "https://user:password@push.example.test/device",
    "https://user@push.example.test/device",
    "https://push.example.test/device#fragment",
    "https://push.example.test/device#",
    "https:push.example.test/device",
    "https:///push.example.test/device",
    "https://push.example.test\\device",
  ]) {
    const { deps, writes } = harness();
    const input = { ...registration, permission: "granted", subscription: {
      endpoint, keys: validKeys,
    } };
    const response = await handlePushDeviceRegistration(request(input), deps);
    assert.equal(response.status, 400, endpoint);
    assert.deepEqual(await response.json(), { ok: false, error: "INVALID_DEVICE_REGISTRATION" });
    assert.deepEqual(writes, []);
  }
});

test("device endpoint opaque path and query tokens are preserved without rewriting", async () => {
  const { deps, writes } = harness();
  const input = { ...registration, permission: "granted", subscription: {
    endpoint: "https://push.example.test/v1/a%2Fb?token=x%23y&v=2",
    keys: validKeys,
  } };
  assert.equal((await handlePushDeviceRegistration(request(input), deps)).status, 200);
  assert.deepEqual(writes, [{ userId: "verified-account", registration: input, userAgent: null }]);
});

test("malformed Web Push keys are rejected before storage, not acknowledged as devices", async () => {
  const offCurve = Buffer.alloc(65); offCurve[0] = 4;
  const compressed = createECDH("prime256v1"); compressed.generateKeys();
  const invalidKeys = [
    { ...validKeys, p256dh: "public-key" },
    { ...validKeys, p256dh: offCurve.toString("base64url") },
    { ...validKeys, p256dh: compressed.getPublicKey(undefined, "compressed").toString("base64url") },
    { ...validKeys, p256dh: `${validKeys.p256dh}=` },
    { ...validKeys, p256dh: "A".repeat(10000) },
    { ...validKeys, auth: Buffer.alloc(15).toString("base64url") },
    { ...validKeys, auth: Buffer.alloc(17).toString("base64url") },
    { ...validKeys, auth: "B".repeat(22) }, // non-canonical unused base64 bits
    { ...validKeys, auth: `${validKeys.auth}==` },
    { ...validKeys, auth: ` ${validKeys.auth}` },
  ];
  for (const keys of invalidKeys) {
    const { deps, writes } = harness();
    const response = await handlePushDeviceRegistration(request({ ...registration, permission: "granted",
      subscription: { endpoint: "https://push.example.test/device", keys },
    }), deps);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: "INVALID_DEVICE_REGISTRATION" });
    assert.deepEqual(writes, []);
  }
});
