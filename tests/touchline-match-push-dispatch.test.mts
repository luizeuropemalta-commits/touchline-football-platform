import assert from "node:assert/strict";
import test from "node:test";
import { dispatchMatchPush as dispatch } from "../lib/touchlineArena/match-push-dispatch.ts";

const attemptId = '11111111-1111-4111-8111-111111111111';
type DispatchDeps = Parameters<typeof dispatch>[1];
function dispatchMatchPush(claim: Parameters<typeof dispatch>[0], deps: Omit<DispatchDeps,'attemptId'|'reserve'> & Partial<Pick<DispatchDeps,'attemptId'|'reserve'>>) {
  return dispatch(claim,{attemptId,reserve:async()=>true,...deps});
}

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

test('refused or lost reservation never sends or completes another invocation', async () => {
  for(const refusal of [false,'throw']) {
    let sent=0,finished=0,reserved=0;
    const result=await dispatchMatchPush(claim,{enabled:true,now:()=>now,
      loadFresh:async()=>({policy,deliver:async()=>{sent++;return 'provider_accepted';}}),
      reserve:async()=>{reserved++;if(refusal==='throw')throw new Error('lost receipt');return false;},
      finish:async()=>{finished++;return true;},
    });
    assert.equal(result,refusal===false?'reservation-not-granted':'reservation-unconfirmed');
    assert.deepEqual([reserved,sent,finished],[1,0,0]);
  }
});

test('reservation receipt triggered by timeout abort cannot grant late transport', async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let sent=0,finished=0;
  const result=dispatchMatchPush(claim,{enabled:true,now:()=>now,
    loadFresh:async()=>({policy,deliver:async()=>{sent++;return 'provider_accepted';}}),
    reserve:(_,__,signal)=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve(true),{once:true})),
    finish:async()=>{finished++;return true;},
  });
  await new Promise<void>(resolve=>setImmediate(resolve));
  t.mock.timers.tick(15000);
  assert.equal(await result,'reservation-unconfirmed');
  assert.deepEqual([sent,finished],[0,0]);
});

test('consent reread after reservation cancels with owned nonce',async()=>{
  let reads=0,sent=0;
  const references:unknown[]=[];
  assert.equal(await dispatchMatchPush(claim,{enabled:true,now:()=>now,
    loadFresh:async()=>({policy:{...policy,fixtureOptedIn:++reads===1},deliver:async()=>{sent++;return 'provider_accepted';}}),
    finish:async(_,state,reference)=>{references.push([state,reference]);return true;},
  }),'cancelled');
  assert.deepEqual([reads,sent],[2,0]);
  assert.deepEqual(references,[['cancelled',{kind:'reserved',attemptId}]]);
});

test('invalid nonce has no read, reservation, transport or receipt effects',async()=>{
  let effects=0;
  assert.equal(await dispatchMatchPush(claim,{enabled:true,attemptId:'invalid',now:()=>now,
    loadFresh:async()=>{effects++;return {policy,deliver:async()=>{effects++;return 'provider_accepted';}};},
    reserve:async()=>{effects++;return true;},finish:async()=>{effects++;return true;},
  }),'reservation-unconfirmed');
  assert.equal(effects,0);
});

test('only the second fresh closure may deliver after confirmed reservation',async()=>{
  let reads=0;
  const closures:number[]=[];
  assert.equal(await dispatchMatchPush(claim,{enabled:true,now:()=>now,
    loadFresh:async()=>{const read=++reads;return {policy,deliver:async()=>{closures.push(read);return 'provider_accepted';}};},
    finish:async()=>true,
  }),'provider_accepted');
  assert.deepEqual(closures,[2]);
});

test('second read timeout cancels owned reservation and late read never delivers',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let reads=0,sent=0;
  let resolveRead!:(value:{policy:typeof policy;deliver:()=>Promise<'provider_accepted'>})=>void;
  const receipts:unknown[]=[];
  const result=dispatchMatchPush(claim,{enabled:true,now:()=>now,
    loadFresh:async()=>{if(++reads===2)return new Promise(resolve=>{resolveRead=resolve;});return {policy,deliver:async()=>{sent++;return 'provider_accepted';}};},
    finish:async(_,state,reference)=>{receipts.push([state,reference]);return true;},
  });
  await new Promise<void>(resolve=>setImmediate(resolve));
  t.mock.timers.tick(15000);
  assert.equal(await result,'cancelled');
  resolveRead({policy,deliver:async()=>{sent++;return 'provider_accepted';}});
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(sent,0);
  assert.deepEqual(receipts,[['cancelled',{kind:'reserved',attemptId}]]);
});

test('two invocations share one controlled reservation; loser never completes winner',async()=>{
  let owned:string|null=null,sent=0;
  const receipts:unknown[]=[];
  const results=await Promise.all([attemptId,'22222222-2222-4222-8222-222222222222'].map(nonce=>dispatchMatchPush(claim,{
    enabled:true,attemptId:nonce,now:()=>now,
    reserve:async(_,candidate)=>{if(owned!==null)return false;owned=candidate;return true;},
    loadFresh:async()=>({policy,deliver:async()=>{sent++;return 'provider_accepted';}}),
    finish:async(_,state,reference)=>{receipts.push([state,reference]);return true;},
  })));
  assert.deepEqual(results.sort(),['provider_accepted','reservation-not-granted']);
  assert.equal(sent,1);
  assert.deepEqual(receipts,[['provider_accepted',{kind:'reserved',attemptId:owned}]]);
});

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
