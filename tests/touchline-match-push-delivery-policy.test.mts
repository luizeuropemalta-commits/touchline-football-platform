import assert from "node:assert/strict";
import test from "node:test";
import { matchPushDeliveryDecision, type MatchPushDeliveryContext } from "../lib/touchlineArena/match-push-delivery-policy.ts";

const valid: MatchPushDeliveryContext = {
  now: new Date("2026-09-25T12:00:00Z"), leaseUntil: "2026-09-25T12:01:00Z",
  expiresAt: "2026-09-25T12:02:00Z", sourceChecksum: `sha256:${"a".repeat(64)}`,
  currentSourceChecksum: `sha256:${"a".repeat(64)}`, sourceVerified: true,
  queuedSubscriptionFingerprint: `sha256:${"c".repeat(64)}`,
  currentSubscriptionFingerprint: `sha256:${"c".repeat(64)}`,
  fixtureOptedIn: true, permission: "granted", subscriptionUnchanged: true,
  channels: { push: true }, settings: { goalsAndEvents: true }, frequency: "realtime",
  explicitConsentAt: "2026-09-24T12:00:00Z",
  quietHours: { enabled: true, start: "22:00", end: "07:00", timezone: "Europe/Malta" },
};

test("delivery policy permits only current authorised facts outside quiet hours", () => {
  assert.equal(matchPushDeliveryDecision(valid), "ready");
  const cases: Array<[Partial<MatchPushDeliveryContext>, string]> = [
    [{ fixtureOptedIn: false }, "opted-out"],
    [{ channels: { push: false } }, "opted-out"],
    [{ channels: { push: "true" } }, "opted-out"],
    [{ settings: null }, "opted-out"],
    [{ settings: { goalsAndEvents: false } }, "opted-out"],
    [{ frequency: "daily_digest" }, "opted-out"],
    [{ permission: "denied" }, "device-changed"],
    [{ subscriptionUnchanged: false }, "device-changed"],
    [{ queuedSubscriptionFingerprint: null }, "device-changed"],
    [{ currentSubscriptionFingerprint: null }, "device-changed"],
    [{ currentSubscriptionFingerprint: `sha256:${"d".repeat(64)}` }, "device-changed"],
    [{ queuedSubscriptionFingerprint: "invalid", currentSubscriptionFingerprint: "invalid" }, "device-changed"],
    [{ sourceVerified: false }, "source-changed"],
    [{ currentSourceChecksum: `sha256:${"b".repeat(64)}` }, "source-changed"],
    [{ sourceChecksum: "invalid", currentSourceChecksum: "invalid" }, "source-changed"],
    [{ explicitConsentAt: null }, "invalid-consent"],
    [{ explicitConsentAt: "2026-09-26T00:00:00Z" }, "invalid-consent"],
    [{ quietHours: undefined }, "invalid-consent"],
    [{ leaseUntil: valid.now.toISOString() }, "expired"],
    [{ expiresAt: valid.now.toISOString() }, "expired"],
    [{ now: new Date(NaN) }, "expired"],
  ];
  for (const [change, expected] of cases) assert.equal(matchPushDeliveryDecision({ ...valid, ...change }), expected, JSON.stringify(change));
});

test("a previously eligible queued event loses permission when fresh consent or time changes", () => {
  assert.equal(matchPushDeliveryDecision(valid), "ready");
  assert.equal(matchPushDeliveryDecision({ ...valid, channels: { push: false } }), "opted-out");
  const night = { ...valid, now: new Date("2026-09-25T20:00:00Z"), leaseUntil: "2026-09-25T20:01:00Z", expiresAt: "2026-09-25T20:02:00Z" };
  assert.equal(matchPushDeliveryDecision(night), "quiet-hours");
  assert.equal(matchPushDeliveryDecision({ ...night, quietHours: { ...(valid.quietHours as object), enabled: false } }), "ready");
});
