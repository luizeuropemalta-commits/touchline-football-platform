import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import test from "node:test";
import { fixtureFinalPushDeliveryDecision } from "../lib/touchlineArena/fixture-final-push-delivery-policy.ts";
import { touchlinePushSubscriptionFingerprint } from "../lib/touchlineArena/push-subscription-fingerprint.ts";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fingerprint = `sha256:${"a".repeat(64)}`, revision = `sha256:${"b".repeat(64)}`;
function fixture() {
  const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(Buffer.alloc(32, 1));
  const registration = { installationId: uuid(3), permission: "granted", subscription: { endpoint: "https://push.example.test/device", keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") } } };
  const snapshot = { kind: "fixture-final", fixtureId: uuid(2), factsFingerprint: fingerprint, sourceRevisionChecksum: revision, clockRevision: 4, validUntil: "2026-10-03T07:01:00Z" };
  return { enabled: true, now: new Date("2026-10-03T07:00:00Z"), leaseUntil: "2026-10-03T07:00:30Z", expiresAt: "2026-10-03T07:01:00Z", queued: { userId: uuid(1), installationId: uuid(3), deviceGeneration: 2, subscriptionFingerprint: touchlinePushSubscriptionFingerprint(registration), source: { ...snapshot } },
    current: { userId: uuid(1), installationId: uuid(3), deviceGeneration: 2, registration, source: { ...snapshot }, fixtureOptedIn: true, channels: { push: true }, settings: { selectedLiveMatches: true, pushSilent: false }, frequency: "realtime", explicitConsentAt: "2026-10-01T00:00:00Z", quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" } } };
}

test("prepared policy requires fresh technical consent and exact fixture/account/device, never fabricated event IDs", () => {
  const c = fixture(); assert.equal(fixtureFinalPushDeliveryDecision(c), "ready");
  c.enabled = false; assert.equal(fixtureFinalPushDeliveryDecision(c), "disabled");
});

test("revocation after reservation must be evaluated anew; only selectedLiveMatches authorises final score", () => {
  const c = fixture(); assert.equal(fixtureFinalPushDeliveryDecision(c), "ready");
  c.current.settings.selectedLiveMatches = false; assert.equal(fixtureFinalPushDeliveryDecision(c), "opted-out");
  for (const mutate of [
    (v: typeof c) => { v.current.fixtureOptedIn = false; }, (v: typeof c) => { v.current.channels.push = false; },
    (v: typeof c) => { v.current.frequency = "daily"; }, (v: typeof c) => { v.current.explicitConsentAt = ""; },
    (v: typeof c) => { v.current.explicitConsentAt = "2027-01-01T00:00:00Z"; },
  ]) { const v = fixture(); mutate(v); assert.notEqual(fixtureFinalPushDeliveryDecision(v), "ready"); }
});

test("quiet hours suppress even silent presentation; sound change does not write or renew consent", () => {
  const c = fixture(), before = structuredClone(c);
  c.current.settings.pushSilent = true; assert.equal(fixtureFinalPushDeliveryDecision(c), "ready");
  assert.equal(c.current.explicitConsentAt, before.current.explicitConsentAt); assert.deepEqual(c.current.channels, before.current.channels);
  c.current.quietHours = { enabled: true, start: "06:00", end: "08:00", timezone: "UTC" };
  assert.equal(fixtureFinalPushDeliveryDecision(c), "quiet-hours");
  c.current.quietHours.timezone = "bad-zone"; assert.equal(fixtureFinalPushDeliveryDecision(c), "invalid-consent");
});

test("an unrelated global clock advance is not a changed fixture revision or score correction", () => {
  const c = fixture(); c.current.source.clockRevision++;
  assert.equal(fixtureFinalPushDeliveryDecision(c), "ready");
});

test("both revision clocks must be safe nonnegative integers and the fresh clock cannot regress", () => {
  for (const field of ["queued", "current"] as const) {
    for (const clock of [NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const c = fixture(); c[field].source.clockRevision = clock;
      assert.equal(fixtureFinalPushDeliveryDecision(c), "source-changed", `${field}: ${clock}`);
    }
  }
  const c = fixture(); c.current.source.clockRevision = 3;
  assert.equal(fixtureFinalPushDeliveryDecision(c), "source-changed");
  c.queued.source.clockRevision = 0; c.current.source.clockRevision = 0;
  assert.equal(fixtureFinalPushDeliveryDecision(c), "ready");
});

test("scope/generation/subscription/source and expired constituent gates reject without mutation", () => {
  for (const mutate of [
    (v: ReturnType<typeof fixture>) => { v.current.userId = uuid(9); }, (v: ReturnType<typeof fixture>) => { v.current.installationId = uuid(9); },
    (v: ReturnType<typeof fixture>) => { v.current.deviceGeneration++; }, (v: ReturnType<typeof fixture>) => { v.current.registration.subscription.endpoint += "/rotated"; },
    (v: ReturnType<typeof fixture>) => { v.current.source.fixtureId = uuid(9); }, (v: ReturnType<typeof fixture>) => { v.current.source.factsFingerprint = revision; },
    (v: ReturnType<typeof fixture>) => { v.current.source.sourceRevisionChecksum = fingerprint; }, (v: ReturnType<typeof fixture>) => { v.current.source.clockRevision--; },
    (v: ReturnType<typeof fixture>) => { v.current.source.kind = "goal"; }, (v: ReturnType<typeof fixture>) => { v.current.source.validUntil = v.now.toISOString(); },
    (v: ReturnType<typeof fixture>) => { v.leaseUntil = v.now.toISOString(); }, (v: ReturnType<typeof fixture>) => { v.queued.subscriptionFingerprint = null; },
  ]) { const c = fixture(); mutate(c); const before = structuredClone(c); assert.notEqual(fixtureFinalPushDeliveryDecision(c), "ready"); assert.deepEqual(c, before); }
});
