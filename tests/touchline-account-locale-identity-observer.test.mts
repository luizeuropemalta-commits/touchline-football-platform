import assert from "node:assert/strict";
import test from "node:test";
import { startAccountLocaleIdentityObserver } from "../lib/touchlineArena/account-locale-identity-observer.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const unavailableUser = new Proxy({}, { get() { throw new Error("unavailable user"); } });
const verified = (id: string | null) => ({ data: { user: id === null ? null : { id } }, error: null });
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(yes => { resolve = yes; });
  return { promise, resolve };
}
function harness(readUser: () => Promise<unknown> = async () => verified(owner)) {
  let listener!: (event: string, session: unknown) => void;
  let serial = 0, reads = 0, unsubscribes = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const identities: Array<string | null | undefined> = [];
  const cleanup = startAccountLocaleIdentityObserver({
    subscribe: callback => { listener = callback; return () => { unsubscribes++; }; },
    readUser: () => { reads++; return readUser(); },
    onIdentity: identity => identities.push(identity),
    setTimer: (callback, delay) => { timers.set(++serial, { callback, delay }); return serial; },
    clearTimer: handle => { timers.delete(handle as number); },
  });
  function run(delay: number) {
    const entry = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `timer ${delay} exists`);
    timers.delete(entry[0]); entry[1].callback();
  }
  return { cleanup, run, timers, identities, emit: (session: unknown) => listener("INITIAL_SESSION", session),
    counts: () => ({ reads, unsubscribes }) };
}

test("known identity and null session need no extra verification", () => {
  const h = harness(); h.emit({ user: { id: owner } }); h.emit(null);
  assert.deepEqual(h.identities, [owner, null]); assert.equal(h.counts().reads, 0);
  assert.equal(h.timers.size, 0); h.cleanup();
});
test("unavailable proxy is unknown synchronously and verifies outside auth callback", async () => {
  const h = harness(); assert.doesNotThrow(() => h.emit({ user: unavailableUser }));
  assert.deepEqual(h.identities, [undefined]); assert.equal(h.counts().reads, 0);
  h.run(0); await settle();
  assert.deepEqual(h.identities, [undefined, owner]); assert.equal(h.counts().reads, 1);
  assert.equal(h.timers.size, 0); h.cleanup();
});
test("verified different account or signed-out result is reported without assuming original identity", async () => {
  for (const id of [other, null]) {
    const h = harness(async () => verified(id)); h.emit({ user: unavailableUser }); h.run(0); await settle();
    assert.deepEqual(h.identities, [undefined, id]); h.cleanup();
  }
});
test("auth read error or malformed result stays unknown, not signed out", async () => {
  for (const result of [{ data: { user: null }, error: new Error("offline") }, {}, verified("invalid")]) {
    const h = harness(async () => result); h.emit({ user: unavailableUser }); h.run(0); await settle();
    assert.deepEqual(h.identities, [undefined]); assert.equal(h.timers.size, "error" in result && result.error ? 1 : 0); h.cleanup();
  }
});
test("timeout and cleanup fence late user responses; only timeout schedules bounded recovery", async () => {
  for (const action of ["timeout", "cleanup"]) {
    const pending = deferred(), h = harness(() => pending.promise);
    h.emit({ user: unavailableUser }); h.run(0);
    if (action === "timeout") h.run(8_000); else h.cleanup();
    pending.resolve(verified(owner)); await settle();
    assert.deepEqual(h.identities, [undefined]); assert.equal(h.counts().reads, 1);
    assert.equal(h.timers.size, action === "timeout" ? 1 : 0); h.cleanup(); assert.equal(h.timers.size, 0); assert.equal(h.counts().unsubscribes, 1);
  }
});
test("new known identity fences an older verification and cleanup cancels queued work", async () => {
  const pending = deferred(), h = harness(() => pending.promise);
  h.emit({ user: unavailableUser }); h.run(0); h.emit({ user: { id: other } });
  pending.resolve(verified(owner)); await settle();
  assert.deepEqual(h.identities, [undefined, other]);
  h.emit({ user: unavailableUser }); h.cleanup(); assert.equal(h.timers.size, 0);
  assert.equal(h.counts().reads, 1);
});


test("unknown identity recovers after a temporary auth read error without an auth event loop", async () => {
  let attempt = 0;
  const h = harness(async () => ++attempt === 1 ? { data: { user: null }, error: { status: 503 } } : verified(owner));
  h.emit({ user: unavailableUser }); h.run(0); await settle();
  assert.deepEqual(h.identities, [undefined]);
  h.run(1000); await settle();
  assert.deepEqual(h.identities, [undefined, owner]);
  assert.equal(h.counts().reads, 2); assert.equal(h.timers.size, 0); h.cleanup();
});

test("timed-out auth attempt cannot override the recovery result", async () => {
  const pending = deferred(); let attempt = 0;
  const h = harness(() => ++attempt === 1 ? pending.promise : Promise.resolve(verified(other)));
  h.emit({ user: unavailableUser }); h.run(0); h.run(8000); h.run(1000); await settle();
  pending.resolve(verified(owner)); await settle();
  assert.deepEqual(h.identities, [undefined, other]);
  assert.equal(h.counts().reads, 2); assert.equal(h.timers.size, 0); h.cleanup();
});

test("auth transient failures stop after three reads; invalid or forbidden authority is terminal", async () => {
  const h = harness(async () => { throw new TypeError("offline"); });
  h.emit({ user: unavailableUser }); h.run(0); await settle();
  h.run(1000); await settle(); h.run(3000); await settle();
  assert.equal(h.counts().reads, 3); assert.equal(h.timers.size, 0);
  assert.deepEqual(h.identities, [undefined]); h.cleanup();
  for (const status of [400, 401, 403, 429]) {
    const terminal = harness(async () => ({ data: { user: null }, error: { status } }));
    terminal.emit({ user: unavailableUser }); terminal.run(0); await settle();
    assert.equal(terminal.counts().reads, 1); assert.equal(terminal.timers.size, 0);
    assert.deepEqual(terminal.identities, [undefined]); terminal.cleanup();
  }
});

test("known identity and cleanup cancel scheduled auth recovery including stale callbacks", async () => {
  for (const end of ["known", "cleanup"] as const) {
    const h = harness(async () => { throw new TypeError("offline"); });
    h.emit({ user: unavailableUser }); h.run(0); await settle();
    const stale = [...h.timers.values()][0].callback;
    if (end === "known") h.emit({ user: { id: other } }); else h.cleanup();
    stale(); await settle();
    assert.equal(h.counts().reads, 1); assert.equal(h.timers.size, 0);
    assert.deepEqual(h.identities, end === "known" ? [undefined, other] : [undefined]); h.cleanup();
  }
});
