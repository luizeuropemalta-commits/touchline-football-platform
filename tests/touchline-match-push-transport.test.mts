import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import test from "node:test";
import webPush from "web-push";
import { dispatchMatchPush } from "../lib/touchlineArena/match-push-dispatch.ts";
import { isSupportedMatchPushEndpoint, sendMatchWebPush } from "../lib/touchlineArena/match-push-transport.ts";

test("transport limits egress to browser providers without URL tricks", () => {
  for (const host of ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]) {
    assert.equal(isSupportedMatchPushEndpoint(`https://${host}/token`), true);
  }
  for (const url of ["https://127.0.0.1/token", "https://169.254.169.254/token", "https://example.com/token", "https://web.push.apple.com.evil.test/token", "https://evilpush.apple.com/token", "https://user@web.push.apple.com/token", "https://web.push.apple.com:8080/token", "https://web.push.apple.com/", "http://web.push.apple.com/token", "https://web.push.apple.com/token#x"]) {
    assert.equal(isSupportedMatchPushEndpoint(url), false, url);
  }
});

function input() {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  return {
    subscription: { endpoint: "https://web.push.apple.com/test-token", keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } },
    payload: JSON.stringify({ title: "GOL", body: "Saka · 23′" }),
    vapid: { ...webPush.generateVAPIDKeys(), subject: "mailto:test@example.com" },
    expiresAt: new Date(Date.now() + 60_000), signal: new AbortController().signal,
  };
}

test("dispatcher and encrypted transport preserve consent and uncertain outcomes together", async () => {
  for (const scenario of ["accepted", "opted-out", "uncertain"] as const) {
    const data = input();
    const now = new Date();
    const claim = { id: "synthetic", leaseToken: "synthetic-lease", leaseUntil: data.expiresAt.toISOString(), expiresAt: data.expiresAt.toISOString() };
    const expected = scenario === "accepted" ? "provider_accepted" : scenario === "opted-out" ? "cancelled" : "uncertain";
    let requests = 0;
    const receipts: string[] = [];
    const result = await dispatchMatchPush(claim, {
      enabled: true, now: () => new Date(),
      loadFresh: async () => ({
        policy: {
          sourceChecksum: `sha256:${"a".repeat(64)}`, currentSourceChecksum: `sha256:${"a".repeat(64)}`,
          sourceVerified: true, fixtureOptedIn: scenario !== "opted-out", permission: "granted", subscriptionUnchanged: true,
          queuedSubscriptionFingerprint: `sha256:${"c".repeat(64)}`,
          currentSubscriptionFingerprint: `sha256:${"c".repeat(64)}`,
          channels: { push: true }, settings: { goalsAndEvents: true }, frequency: "realtime",
          explicitConsentAt: now.toISOString(), quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" },
        },
        deliver: (signal) => sendMatchWebPush({ ...data, signal }, async (_, init) => {
          requests++;
          assert.equal(new Headers(init?.headers).get("content-encoding"), "aes128gcm");
          assert.equal(init?.redirect, "error");
          return new Response(null, { status: scenario === "uncertain" ? 503 : 201 });
        }),
      }),
      finish: async (received, state) => { assert.equal(received, claim); receipts.push(state); return true; },
    });
    assert.equal(result, expected);
    assert.deepEqual(receipts, [expected]);
    assert.equal(requests, scenario === "opted-out" ? 0 : 1);
  }
});

test("real encryption produces an authenticated request without sending over network", async () => {
  const data = input(); let calls = 0;
  assert.equal(await sendMatchWebPush(data, async (url, init) => {
    calls++; assert.equal(url, data.subscription.endpoint);
    assert.equal(init?.redirect, "error"); assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("content-encoding"), "aes128gcm");
    assert.match(headers.get("authorization") ?? "", /^vapid /);
    assert.ok(Number(headers.get("ttl")) <= 60);
    assert.ok(init?.body instanceof Uint8Array);
    assert.equal(Buffer.from(init.body).includes(Buffer.from(data.payload)), false);
    return new Response(null, { status: 201 });
  }), "provider_accepted");
  assert.equal(calls, 1);
});

test("expired/aborted input makes no request; provider error never retries", async () => {
  const forbidden: typeof fetch = async () => { throw new Error("unexpected network"); };
  await assert.rejects(sendMatchWebPush({ ...input(), expiresAt: new Date(0) }, forbidden), /push-input-invalid/);
  await assert.rejects(sendMatchWebPush({ ...input(), signal: AbortSignal.abort() }, forbidden), /push-input-invalid/);
  for (const status of [400, 404, 410, 429, 500, 302]) {
    let calls = 0;
    const request: typeof fetch = async () => { calls++; return new Response(null, { status }); };
    if ([400, 404, 410].includes(status)) assert.equal(await sendMatchWebPush(input(), request), "rejected");
    else await assert.rejects(sendMatchWebPush(input(), request), /push-outcome-uncertain/);
    assert.equal(calls, 1);
  }
});

test("abort during request cannot turn a late acceptance into confirmed acceptance", async () => {
  const controller = new AbortController();
  await assert.rejects(sendMatchWebPush({ ...input(), signal: controller.signal }, async (_, init) => {
    controller.abort();
    assert.equal(init?.signal?.aborted, true);
    return new Response(null, { status: 201 });
  }), /push-outcome-uncertain/);
  let calls = 0;
  await assert.rejects(sendMatchWebPush(input(), async () => { calls++; throw new Error("network interrupted"); }), /network interrupted/);
  assert.equal(calls, 1);
});

test("payload byte limit and maximum TTL are enforced", async () => {
  let calls = 0;
  const request: typeof fetch = async (_, init) => {
    calls++; assert.equal(new Headers(init?.headers).get("ttl"), "300");
    return new Response(null, { status: 201 });
  };
  await assert.rejects(sendMatchWebPush({ ...input(), payload: "⚽".repeat(1025) }, request), /push-input-invalid/);
  assert.equal(calls, 0);
  assert.equal(await sendMatchWebPush({ ...input(), expiresAt: new Date(Date.now() + 600_000) }, request), "provider_accepted");
  assert.equal(calls, 1);
});
