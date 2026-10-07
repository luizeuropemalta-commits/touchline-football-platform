import assert from "node:assert/strict";
import test from "node:test";
import { dispatchGamePush, type GamePushDispatchDependencies } from "../lib/touchlineArena/match-push-dispatch.ts";

const attemptId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-10-02T12:00:00Z");
const claim = { id: "queue", leaseToken: "lease", leaseUntil: "2026-10-02T12:01:00Z", expiresAt: "2026-10-02T12:02:00Z" };
// Deliberately no fixtureOptedIn/goalsAndEvents: this is a different policy.
type Policy = { reminderConsent: boolean; incomplete: boolean; revision: number };
const ready: Policy = { reminderConsent: true, incomplete: true, revision: 1 };
type Deps = GamePushDispatchDependencies<Policy>;
function scenario(overrides: Partial<Deps> = {}) {
  const events: string[] = [], receipts: unknown[] = [];
  let reads = 0;
  const deps: Deps = {
    enabled: true, now: () => now, attemptId,
    loadFresh: async () => {
      const read = ++reads; events.push(`read:${read}`);
      return { policy: { ...ready, revision: read }, deliver: async () => { events.push(`send:${read}`); return "provider_accepted"; } };
    },
    decide: (policy, clock) => {
      events.push(`policy:${policy.revision}`);
      assert.equal(clock.now, now); assert.equal(clock.leaseUntil, claim.leaseUntil); assert.equal(clock.expiresAt, claim.expiresAt);
      return policy.reminderConsent && policy.incomplete ? "ready" : "cancelled";
    },
    reserve: async () => { events.push("reserve"); return true; },
    finish: async (_, state, reference) => { events.push("finish"); receipts.push([state, reference]); return true; },
    ...overrides,
  };
  return { deps, events, receipts, run: () => dispatchGamePush(claim, deps) };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("generic ready policy is evaluated before and after reservation; only second closure sends", async () => {
  const h = scenario();
  assert.equal(await h.run(), "provider_accepted");
  assert.deepEqual(h.events, ["read:1", "policy:1", "reserve", "read:2", "policy:2", "send:2", "finish"]);
  assert.deepEqual(h.receipts, [["provider_accepted", { kind: "reserved", attemptId }]]);
});

test("policy revocation before or after reservation cancels with the appropriate ownership", async () => {
  for (const revokeAt of [1, 2]) {
    let decisions = 0;
    const h = scenario({ decide: () => ++decisions >= revokeAt ? "cancelled" : "ready" });
    assert.equal(await h.run(), "cancelled");
    assert.equal(h.events.some(event => event.startsWith("send:")), false);
    assert.equal(h.events.includes("reserve"), revokeAt === 2);
    assert.deepEqual(h.receipts, [["cancelled", revokeAt === 2 ? { kind: "reserved", attemptId } : { kind: "unreserved" }]]);
  }
});

test("malformed runtime policy decisions cannot authorize either delivery stage", async () => {
  for (const invalid of [undefined, null, true, "READY", {}, Promise.resolve("ready")]) {
    for (const failAt of [1, 2]) {
      let decisions = 0;
      const h = scenario({ decide: () => ++decisions === failAt ? invalid as never : "ready" });
      assert.equal(await h.run(), "cancelled");
      assert.equal(h.events.some(event => event.startsWith("send:")), false);
      assert.deepEqual(h.receipts, [["cancelled", failAt === 2 ? { kind: "reserved", attemptId } : { kind: "unreserved" }]]);
    }
  }
});

test("generic policy cannot override an expired lease after a read or reservation", async () => {
  for (const expireAt of ["read", "reserve"] as const) {
    let clock = now, sends = 0;
    const h = scenario({ now: () => clock, decide: () => "ready",
      loadFresh: async () => {
        if (expireAt === "read") clock = new Date(claim.leaseUntil);
        return { policy: ready, deliver: async () => { sends++; return "provider_accepted"; } };
      },
      reserve: async () => { if (expireAt === "reserve") clock = new Date(claim.leaseUntil); return true; },
    });
    assert.equal(await h.run(), "cancelled"); assert.equal(sends, 0);
    assert.deepEqual(h.receipts, [["cancelled", expireAt === "reserve" ? { kind: "reserved", attemptId } : { kind: "unreserved" }]]);
  }
});

test("policy and source exceptions cancel without transport, including an owned second read", async () => {
  for (const failAt of [1, 2]) for (const failure of ["policy", "source"] as const) {
    let reads = 0, decisions = 0, sends = 0;
    const h = scenario({
      loadFresh: async () => {
        if (++reads === failAt && failure === "source") throw new Error("private source error");
        return { policy: ready, deliver: async () => { sends++; return "provider_accepted"; } };
      },
      decide: () => { if (++decisions === failAt && failure === "policy") throw new Error("private policy error"); return "ready"; },
    });
    assert.equal(await h.run(), "cancelled"); assert.equal(sends, 0);
    assert.deepEqual(h.receipts, [["cancelled", failAt === 2 ? { kind: "reserved", attemptId } : { kind: "unreserved" }]]);
  }
});

test("refused or uncertain reservation never finishes someone else's item", async () => {
  for (const failure of ["refused", "unknown"] as const) {
    const h = scenario({ reserve: async () => { if (failure === "unknown") throw new Error("unknown receipt"); return false; } });
    assert.equal(await h.run(), failure === "refused" ? "reservation-not-granted" : "reservation-unconfirmed");
    assert.equal(h.events.some(event => event.startsWith("send:")), false); assert.deepEqual(h.receipts, []);
  }
});

test("transport exceptions and unknown outcomes remain uncertain; rejection is failed, never retried", async () => {
  for (const outcome of ["throw", "malformed", "rejected", "provider_accepted"] as const) {
    let sends = 0;
    const h = scenario({ loadFresh: async () => ({ policy: ready, deliver: async () => {
      sends++;
      if (outcome === "throw") throw new Error("possibly accepted before connection closed");
      if (outcome === "malformed") return undefined as never; // Transport boundary violates its TS contract.
      return outcome;
    } }) });
    const expected = outcome === "provider_accepted" ? "provider_accepted" : outcome === "rejected" ? "failed" : "uncertain";
    assert.equal(await h.run(), expected); assert.equal(sends, 1);
    assert.deepEqual(h.receipts, [[expected, { kind: "reserved", attemptId }]]);
  }
});

test("disabled, malformed nonce and expired claim have no read/reserve/send/finish effects", async () => {
  for (const [overrides, expected] of [
    [{ enabled: false }, "disabled"],
    [{ attemptId: "invalid" }, "reservation-unconfirmed"],
    [{ now: () => new Date(claim.leaseUntil) }, "expired"],
  ] as const) {
    const h = scenario(overrides); assert.equal(await h.run(), expected); assert.deepEqual(h.events, []);
  }
});

test("deadline during reservation cannot turn an abort acknowledgment into permission to send", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = scenario({ reserve: (_, __, signal) => new Promise(resolve => signal.addEventListener("abort", () => resolve(true), { once: true })) });
  const pending = h.run(); await flush(); t.mock.timers.tick(15_000);
  assert.equal(await pending, "reservation-unconfirmed"); assert.deepEqual(h.receipts, []);
  assert.equal(h.events.some(event => event.startsWith("send:")), false);
});

test("late second read cannot deliver after deadline; cancellation retains reserved attempt", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0, sends = 0;
  let release!: (value: Awaited<ReturnType<Deps["loadFresh"]>>) => void;
  const value: Awaited<ReturnType<Deps["loadFresh"]>> = { policy: ready, deliver: async () => { sends++; return "provider_accepted"; } };
  const h = scenario({ loadFresh: async () => ++reads === 2 ? new Promise(resolve => { release = resolve; }) : value });
  const pending = h.run(); await flush(); t.mock.timers.tick(15_000);
  assert.equal(await pending, "cancelled");
  release(value); await flush(); assert.equal(sends, 0);
  assert.deepEqual(h.receipts, [["cancelled", { kind: "reserved", attemptId }]]);
});

test("transport abort acceptance is uncertain, with exactly one attempt", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let sends = 0;
  const h = scenario({ loadFresh: async () => ({ policy: ready, deliver: signal => {
    sends++;
    return new Promise(resolve => signal.addEventListener("abort", () => resolve("provider_accepted"), { once: true }));
  } }) });
  const pending = h.run(); await flush(); t.mock.timers.tick(15_000);
  assert.equal(await pending, "uncertain"); assert.equal(sends, 1);
  assert.deepEqual(h.receipts, [["uncertain", { kind: "reserved", attemptId }]]);
});

test("lost, thrown or stalled finish receipts never retry transport", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const finish of [async () => false, async () => { throw new Error("receipt uncertain"); }, () => new Promise<boolean>(() => {})]) {
    const h = scenario({ finish }); const pending = h.run(); await flush(); t.mock.timers.tick(5_000);
    assert.equal(await pending, "receipt-unconfirmed");
    assert.deepEqual(h.events.filter(event => event.startsWith("send:")), ["send:2"]);
  }
});
