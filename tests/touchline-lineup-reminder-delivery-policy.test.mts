import assert from "node:assert/strict";
import test from "node:test";
import { lineupReminderDeliveryDecision as decide, type LineupReminderDeliveryContext } from "../lib/touchlineFantasy/lineup-reminder-delivery-policy.ts";
import { dispatchGamePush, type GamePushDispatchDependencies } from "../lib/touchlineArena/match-push-dispatch.ts";

const nowMs = Date.parse("2026-10-02T12:00:00Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { userId: id(1), gameweekId: id(2), competitionId: id(3), seasonId: id(4) };
const hash = `sha256:${"a".repeat(64)}`;
function context(count = 0): LineupReminderDeliveryContext {
  const slotIds = Array.from({ length: 11 }, (_, i) => `slot-${i}`);
  return {
    now: new Date(nowMs), leaseUntil: new Date(nowMs + 30_000).toISOString(), expiresAt: new Date(nowMs + 60_000).toISOString(), maximumAgeMs: 1_000,
    queued: { ...scope, deviceId: id(5), kind: count === 11 ? "complete_unconfirmed" : "missing_xi",
      generation: "9007199254740993", effectiveDeadlineMs: nowMs + 60_000, subscriptionFingerprint: hash },
    current: { ...scope, deviceId: id(5), checkedAtMs: nowMs, generation: "9007199254740993", needsBaseline: false, suppressed: false,
      subscriptionFingerprint: hash, permission: "granted", channels: { push: true }, settings: { lineupReminders: true }, frequency: "realtime",
      enrollmentConsentAt: "2026-10-01T10:00:00.123456+00:00", explicitConsentAt: "2026-10-01T10:00:00.123456+00:00",
      quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" } },
    source: { ...scope, schemaVersion: 1, checkedAtMs: nowMs, read: {
      status: "complete", checkedAtMs: nowMs, marketEditable: true, effectiveDeadlineMs: nowMs + 60_000,
      formation: { published: true, code: "4-3-3", slotIds },
      userGameweek: { state: "DRAFT", formationCode: "4-3-3", selectedCoachId: "307" },
      selections: slotIds.slice(0, count).map((slotId, i) => ({ slotId, playerId: id(100 + i) })),
    } },
  };
}

test("canonical reminder kinds use actual readiness, without fabricated match preferences", () => {
  for (const count of [0, 10, 11]) assert.equal(decide(context(count)), "ready");
  const absent = context(); absent.source!.read.userGameweek = null;
  assert.equal(decide(absent), "ready");
  const missingCoach = context(11); missingCoach.source!.read.userGameweek!.selectedCoachId = null;
  assert.equal(decide(missingCoach), "readiness-changed");
  missingCoach.queued.kind = "missing_xi"; assert.equal(decide(missingCoach), "ready");
});

test("exact scope, current owner/device and queued deadline must remain bound", () => {
  for (const key of ["userId", "gameweekId", "competitionId", "seasonId"] as const) {
    for (const place of ["current", "source"] as const) {
      const c = context(); c[place]![key] = id(999); assert.equal(decide(c), "scope-changed");
    }
    const c = context(); c.queued[key] = "invalid"; assert.equal(decide(c), "scope-changed");
  }
  const device = context(); device.current.deviceId = id(999); assert.equal(decide(device), "device-changed");
  const sourceDeadline = context(); sourceDeadline.source!.read.effectiveDeadlineMs++;
  assert.equal(decide(sourceDeadline), "deadline-changed");
  const queuedDeadline = context(); queuedDeadline.queued.effectiveDeadlineMs++;
  assert.equal(decide(queuedDeadline), "deadline-changed");
  const expiry = context(); expiry.expiresAt = new Date(nowMs + 59_000).toISOString();
  assert.equal(decide(expiry), "deadline-changed");
});

test("stale/future/malformed source and binding reads are unavailable, never a missing XI", () => {
  for (const bad of [nowMs - 1_001, nowMs + 1, NaN, Infinity, -1]) {
    const source = context(); source.source!.checkedAtMs = source.source!.read.checkedAtMs = bad;
    assert.equal(decide(source), "source-unavailable");
    const binding = context(); binding.current.checkedAtMs = bad; assert.equal(decide(binding), "source-unavailable");
  }
  for (const age of [0, -1, NaN, Infinity, 0.5]) { const c = context(); c.maximumAgeMs = age; assert.equal(decide(c), "source-unavailable"); }
  const absent = context(); absent.source = null; assert.equal(decide(absent), "source-unavailable");
  const mismatch = context(); mismatch.source!.read.checkedAtMs--; assert.equal(decide(mismatch), "source-unavailable");
  const boundary = context(); boundary.source!.checkedAtMs = boundary.source!.read.checkedAtMs = nowMs - 1_000;
  assert.equal(decide(boundary), "ready");
});

test("confirmed, closed, invalid and changed kinds cannot deliver the queued reminder", () => {
  for (const state of ["CONFIRMED", "LOCKED", "FINAL"] as const) {
    const c = context(11); c.source!.read.userGameweek!.state = state; assert.equal(decide(c), "readiness-changed");
  }
  const closed = context(); closed.source!.read.marketEditable = false; assert.equal(decide(closed), "readiness-changed");
  const changed = context(11); changed.queued.kind = "missing_xi"; assert.equal(decide(changed), "readiness-changed");
  const invalid = context(10); invalid.source!.read.selections[0].playerId = "invalid"; assert.equal(decide(invalid), "readiness-changed");
  for (const coach of ["0", "000307", "1234567890123456"]) {
    const c = context(11); c.source!.read.userGameweek!.selectedCoachId = coach;
    assert.equal(decide(c), "ready", "same persisted coach contract as admission and classifier");
  }
});

test("generation is lossless and mandatory; ABA invalidation and suppressed baselines reject", () => {
  for (const value of [null, 0, -1, Number.MAX_SAFE_INTEGER + 1, "01", "0", "-1", "9223372036854775808", "9007199254740994"]) {
    const c = context(); c.current.generation = value; assert.equal(decide(c), "enrollment-changed");
  }
  const equalInvalid = context(); equalInvalid.current.generation = equalInvalid.queued.generation = null;
  assert.equal(decide(equalInvalid), "enrollment-changed");
  for (const key of ["needsBaseline", "suppressed"] as const) { const c = context(); c.current[key] = true; assert.equal(decide(c), "enrollment-changed"); }
  const safe = context(); safe.queued.generation = 2; safe.current.generation = "2"; assert.equal(decide(safe), "ready");
});

test("current reminder consent, subscription, frequency and quiet hours fail closed", () => {
  for (const value of [false, undefined, "true", 1]) {
    const c = context(); c.current.settings = { lineupReminders: value }; assert.equal(decide(c), "opted-out");
    c.current.settings = { lineupReminders: true }; c.current.channels = { push: value }; assert.equal(decide(c), "opted-out");
  }
  for (const frequency of ["paused", "digest", ""]) { const c = context(); c.current.frequency = frequency; assert.equal(decide(c), "opted-out"); }
  for (const fingerprint of [null, "invalid", `sha256:${"b".repeat(64)}`]) {
    const c = context(); c.current.subscriptionFingerprint = fingerprint; assert.equal(decide(c), "device-changed");
  }
  const denied = context(); denied.current.permission = "denied"; assert.equal(decide(denied), "device-changed");
  for (const consent of [null, "2026-02-30T10:00:00Z", "2026-10-02", new Date(nowMs + 1).toISOString()]) {
    const c = context(); c.current.explicitConsentAt = c.current.enrollmentConsentAt = consent; assert.equal(decide(c), "invalid-consent");
  }
  const changed = context(); changed.current.enrollmentConsentAt = "2026-10-01T10:00:00.123455+00:00";
  assert.equal(decide(changed), "invalid-consent", "do not collapse microsecond consent changes");
  for (const quietHours of [undefined, null, { enabled: true, start: "00:00", end: "23:59", timezone: "Invalid" }]) {
    const c = context(); c.current.quietHours = quietHours; assert.equal(decide(c), "invalid-consent");
  }
  const quiet = context(); quiet.current.quietHours = { enabled: true, start: "11:00", end: "13:00", timezone: "UTC" };
  assert.equal(decide(quiet), "quiet-hours");
});

test("lease/expiry equality and impossible calendars reject", () => {
  for (const key of ["leaseUntil", "expiresAt"] as const) {
    for (const value of [new Date(nowMs).toISOString(), "2026-02-30T10:00:00Z", "invalid"]) {
      const c = context(); c[key] = value; assert.equal(decide(c), "expired");
    }
  }
  const invalidNow = context(); invalidNow.now = new Date(NaN); assert.equal(decide(invalidNow), "expired");
});

test("real dispatcher rechecks reminder state, consent, deadline and epoch after reservation", async () => {
  const mutations: Array<(c: LineupReminderDeliveryContext) => void> = [
    c => { c.source!.read.userGameweek!.state = "CONFIRMED"; },
    c => { c.current.settings = { lineupReminders: false }; },
    c => { c.source!.read.effectiveDeadlineMs++; },
    c => { c.current.generation = "9007199254740994"; },
    c => { c.current.subscriptionFingerprint = `sha256:${"b".repeat(64)}`; },
  ];
  for (const change of [null, ...mutations]) {
    let reads = 0, reserved = 0, sends = 0;
    const receipts: unknown[] = [];
    const base = context(11), attemptId = id(500);
    const deps: GamePushDispatchDependencies<LineupReminderDeliveryContext> = {
      enabled: true, now: () => base.now, attemptId,
      loadFresh: async () => {
        const policy = context(11); if (++reads === 2) change?.(policy);
        const read = reads;
        return { policy, deliver: async () => { assert.equal(read, 2); sends++; return "provider_accepted"; } };
      },
      decide: (policy, clock) => decide({ ...policy, ...clock }) === "ready" ? "ready" : "cancelled",
      reserve: async () => { reserved++; return true; },
      finish: async (_, state, attempt) => { receipts.push([state, attempt]); return true; },
    };
    const result = await dispatchGamePush({ id: id(501), leaseToken: id(502), leaseUntil: base.leaseUntil, expiresAt: base.expiresAt }, deps);
    assert.equal(result, change ? "cancelled" : "provider_accepted");
    assert.deepEqual([reads, reserved, sends], [2, 1, change ? 0 : 1]);
    assert.deepEqual(receipts, [[result, { kind: "reserved", attemptId }]]);
  }
});
