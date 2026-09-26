import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerSocialInvalidation } from "../lib/touchlineArena/player-social-invalidation.ts";

test("confirmed changes invalidate matching subscribers locally and across real channels", async () => {
  const name = `touchline-social-test-${crypto.randomUUID()}`;
  const first = createPlayerSocialInvalidation(() => new BroadcastChannel(name));
  const second = createPlayerSocialInvalidation(() => new BroadcastChannel(name));
  let local = 0;
  let unrelated = 0;
  const cleanups = [first.subscribe("123", () => { local++; }), second.subscribe("456", () => { unrelated++; })];
  const received = new Promise<void>((resolve) => cleanups.push(second.subscribe("123", resolve)));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    first.publish("123");
    await Promise.race([received, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("No cross-tab invalidation")), 1500); })]);
    assert.equal(local, 1);
    assert.equal(unrelated, 0);
  } finally { clearTimeout(timeout); cleanups.forEach((cleanup) => cleanup()); }
});

test("unavailable browser channels retain same-page refresh without throwing", () => {
  const bus = createPlayerSocialInvalidation(() => { throw new Error("blocked"); });
  let refreshed = 0;
  const unsubscribe = bus.subscribe("123", () => { refreshed++; });
  bus.publish("123");
  bus.publish("not-a-player");
  assert.equal(refreshed, 1);
  unsubscribe();
  bus.publish("123");
  assert.equal(refreshed, 1);
});

test("channel lifecycle is shared and messages carry no counts or account permissions", () => {
  let opened = 0;
  let closed = 0;
  let receive: ((event: MessageEvent) => void) | undefined;
  const sent: unknown[] = [];
  const bus = createPlayerSocialInvalidation(() => {
    opened++;
    return {
      postMessage: (message) => { sent.push(message); },
      addEventListener: (_type, listener) => { receive = listener; },
      removeEventListener: () => { receive = undefined; },
      close: () => { closed++; },
    };
  });
  let refreshed = 0;
  const one = bus.subscribe("123", () => { refreshed++; });
  const two = bus.subscribe("123", () => { refreshed++; });
  assert.equal(opened, 1);
  bus.publish("123");
  assert.deepEqual(sent, [{ providerId: "123" }]);
  assert.equal(refreshed, 2);
  for (const data of [null, [], { providerId: "bad" }, { providerId: "123", likeCount: 99, canReact: true }]) {
    receive?.({ data } as MessageEvent);
  }
  assert.equal(refreshed, 2);
  receive?.({ data: { providerId: "123" } } as MessageEvent);
  assert.equal(refreshed, 4);
  assert.equal(sent.length, 1, "received messages must not echo across tabs");
  one(); assert.equal(closed, 0);
  two(); assert.equal(closed, 1);
});
