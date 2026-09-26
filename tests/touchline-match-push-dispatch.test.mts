import assert from "node:assert/strict";
import test from "node:test";
import { dispatchMatchPush } from "../lib/touchlineArena/match-push-dispatch.ts";

const now = new Date("2026-09-25T12:00:00Z");
const claim = { id: "test", leaseToken: "lease", leaseUntil: "2026-09-25T12:01:00Z", expiresAt: "2026-09-25T12:02:00Z" };
const policy = {
  sourceChecksum: `sha256:${"a".repeat(64)}`, currentSourceChecksum: `sha256:${"a".repeat(64)}`,
  sourceVerified: true, fixtureOptedIn: true, permission: "granted", subscriptionUnchanged: true,
  queuedSubscriptionFingerprint: `sha256:${"c".repeat(64)}`,
  currentSubscriptionFingerprint: `sha256:${"c".repeat(64)}`,
  channels: { push: true }, settings: { goalsAndEvents: true }, frequency: "realtime",
  explicitConsentAt: "2026-09-24T00:00:00Z",
  quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" },
};

test("disabled dispatch performs no read, send or receipt", async () => {
  const forbidden = async () => { throw new Error("must not run"); };
  assert.equal(await dispatchMatchPush(claim, { enabled: false, now: () => now, loadFresh: forbidden, finish: forbidden }), "disabled");
});

test("fresh opt-out prevents transport and records cancellation", async () => {
  let sent = 0;
  const states: string[] = [];
  assert.equal(await dispatchMatchPush(claim, { enabled: true, now: () => now,
    loadFresh: async () => ({ policy: { ...policy, fixtureOptedIn: false }, deliver: async () => { sent++; return "provider_accepted"; } }),
    finish: async (received, state) => { assert.equal(received, claim); states.push(state); return true; },
  }), "cancelled");
  assert.equal(sent, 0);
  assert.deepEqual(states, ["cancelled"]);
});

test("same device with replaced or unbound subscription never reaches transport", async () => {
  for (const queuedSubscriptionFingerprint of [null, `sha256:${"d".repeat(64)}`]) {
    let sent = 0;
    const states: string[] = [];
    assert.equal(await dispatchMatchPush(claim, { enabled: true, now: () => now,
      loadFresh: async () => ({ policy: { ...policy, queuedSubscriptionFingerprint }, deliver: async () => { sent++; return "provider_accepted"; } }),
      finish: async (_, state) => { states.push(state); return true; },
    }), "cancelled");
    assert.equal(sent, 0);
    assert.deepEqual(states, ["cancelled"]);
  }
});

test("provider acceptance and lost receipts never trigger transport retries", async () => {
  for (const receipt of [true, false]) {
    let sent = 0;
    assert.equal(await dispatchMatchPush(claim, { enabled: true, now: () => now,
      loadFresh: async () => ({ policy, deliver: async () => { sent++; return "provider_accepted"; } }),
      finish: async (_, state) => { assert.equal(state, "provider_accepted"); return receipt; },
    }), receipt ? "provider_accepted" : "receipt-unconfirmed");
    assert.equal(sent, 1);
  }
});

test("network uncertainty is recorded once and not called rejection", async () => {
  let sent = 0;
  assert.equal(await dispatchMatchPush(claim, { enabled: true, now: () => now,
    loadFresh: async () => ({ policy, deliver: async () => { sent++; throw new Error("connection lost after write"); } }),
    finish: async (_, state) => { assert.equal(state, "uncertain"); return true; },
  }), "uncertain");
  assert.equal(sent, 1);
});

test("lease expiring during source read prevents send", async () => {
  let clock = now;
  assert.equal(await dispatchMatchPush(claim, { enabled: true, now: () => clock,
    loadFresh: async () => { clock = new Date(claim.leaseUntil); return { policy, deliver: async () => { throw new Error("must not send"); } }; },
    finish: async (_, state) => { assert.equal(state, "cancelled"); return false; },
  }), "receipt-unconfirmed");
});

test("stalled transport aborts at deadline and is parked uncertain", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let transportSignal: AbortSignal | undefined;
  const result = dispatchMatchPush(claim, { enabled: true, now: () => now,
    loadFresh: async () => ({ policy, deliver: async (signal) => { transportSignal = signal; return new Promise(() => {}); } }),
    finish: async (_, state) => { assert.equal(state, "uncertain"); return true; },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(transportSignal?.aborted, false);
  t.mock.timers.tick(15_000);
  assert.equal(await result, "uncertain");
  assert.equal(transportSignal?.aborted, true);
});

test("stalled receipt is bounded and never resends", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let sent = 0;
  const result = dispatchMatchPush(claim, { enabled: true, now: () => now,
    loadFresh: async () => ({ policy, deliver: async () => { sent++; return "provider_accepted"; } }),
    finish: async () => new Promise(() => {}),
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(5_000);
  assert.equal(await result, "receipt-unconfirmed");
  assert.equal(sent, 1);
});

test("source read completing after deadline cannot start a late send", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let sent = 0;
  let resolveRead!: (value: { policy: typeof policy; deliver: () => Promise<"provider_accepted"> }) => void;
  let readSignal: AbortSignal | undefined;
  const result = dispatchMatchPush(claim, { enabled: true, now: () => now,
    loadFresh: async (_, signal) => { readSignal = signal; return new Promise((resolve) => { resolveRead = resolve; }); },
    finish: async (_, state) => { assert.equal(state, "cancelled"); return true; },
  });
  t.mock.timers.tick(15_000);
  assert.equal(await result, "cancelled");
  assert.equal(readSignal?.aborted, true);
  resolveRead({ policy, deliver: async () => { sent++; return "provider_accepted"; } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(sent, 0);
});

for (const response of ["rejected", "provider_accepted"] as const) {
  test(`transport resolving ${response} during abort remains uncertain`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const result = dispatchMatchPush(claim, { enabled: true, now: () => now,
      loadFresh: async () => ({ policy, deliver: (signal) => new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve(response), { once: true });
      }) }),
      finish: async (_, state) => { assert.equal(state, "uncertain"); return true; },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    t.mock.timers.tick(15_000);
    assert.equal(await result, "uncertain");
  });
}
