import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import test from "node:test";
import { touchlinePushSubscriptionFingerprint as fingerprint } from "../lib/touchlineArena/push-subscription-fingerprint.ts";
import { matchPushDeliveryDecision } from "../lib/touchlineArena/match-push-delivery-policy.ts";

const key = createECDH("prime256v1");
key.setPrivateKey(Buffer.alloc(32, 1));
const registration = {
  installationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", permission: "granted",
  subscription: { endpoint: "https://fcm.googleapis.com/push/one?token=a",
    keys: { p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") } },
};

test("fingerprint is deterministic, excludes raw keys and is independent of object order or installation metadata", () => {
  const before = JSON.stringify(registration);
  const hash = fingerprint(registration);
  assert.match(hash!, /^sha256:[a-f0-9]{64}$/);
  assert.equal(fingerprint({ subscription: { keys: { auth: registration.subscription.keys.auth, p256dh: registration.subscription.keys.p256dh }, endpoint: registration.subscription.endpoint }, permission: "granted", installationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", lastSeenAt: "later" }), hash);
  assert.equal(JSON.stringify(registration), before);
  assert.equal(hash!.includes(registration.subscription.keys.auth), false);
});

test("each subscription constituent changes the binding under the same device installation", () => {
  const other = createECDH("prime256v1");
  other.setPrivateKey(Buffer.alloc(32, 3));
  for (const subscription of [
    { ...registration.subscription, endpoint: "https://fcm.googleapis.com/push/two?token=a" },
    { ...registration.subscription, endpoint: "https://fcm.googleapis.com/push/one?token=%61" },
    { ...registration.subscription, keys: { ...registration.subscription.keys, auth: Buffer.alloc(16, 4).toString("base64url") } },
    { ...registration.subscription, keys: { ...registration.subscription.keys, p256dh: other.getPublicKey().toString("base64url") } },
  ]) assert.notEqual(fingerprint({ ...registration, subscription }), fingerprint(registration));
});

test("missing, denied and malformed registrations cannot produce a deliverable binding", () => {
  for (const value of [null, {}, { ...registration, permission: "denied", subscription: null },
    { ...registration, subscription: { ...registration.subscription, endpoint: "http://example.com/push" } },
    { ...registration, subscription: { ...registration.subscription, keys: { p256dh: "invalid", auth: "invalid" } } },
  ]) assert.equal(fingerprint(value), null);
});

test("real validated subscription fingerprints feed the final policy without trusting stable device identity", () => {
  const original = fingerprint(registration);
  const policy = {
    now: new Date("2026-09-26T12:00:00Z"), leaseUntil: "2026-09-26T12:01:00Z", expiresAt: "2026-09-26T12:02:00Z",
    sourceChecksum: `sha256:${"a".repeat(64)}`, currentSourceChecksum: `sha256:${"a".repeat(64)}`,
    sourceVerified: true, fixtureOptedIn: true, permission: "granted", subscriptionUnchanged: true,
    queuedSubscriptionFingerprint: original, currentSubscriptionFingerprint: original,
    channels: { push: true }, settings: { goalsAndEvents: true }, frequency: "realtime",
    explicitConsentAt: "2026-09-25T12:00:00Z", quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" },
  };
  assert.equal(matchPushDeliveryDecision(policy), "ready");
  const changed = fingerprint({ ...registration, subscription: { ...registration.subscription, endpoint: "https://fcm.googleapis.com/push/replaced" } });
  assert.equal(matchPushDeliveryDecision({ ...policy, currentSubscriptionFingerprint: changed }), "device-changed");
  assert.equal(matchPushDeliveryDecision({ ...policy, currentSubscriptionFingerprint: fingerprint(null) }), "device-changed");
});
