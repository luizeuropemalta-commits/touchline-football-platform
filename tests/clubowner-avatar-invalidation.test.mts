import assert from "node:assert/strict";
import test from "node:test";
import { createClubOwnerAvatarInvalidation } from "../lib/touchlineArena/clubowner-avatar-invalidation.ts";

test("photo publisher without local subscribers reaches another tab and closes temporary channel", async () => {
  const name = `touchline-avatar-test-${crypto.randomUUID()}`;
  let closed = 0;
  const publisher = createClubOwnerAvatarInvalidation(() => {
    const channel = new BroadcastChannel(name);
    return { postMessage: channel.postMessage.bind(channel), addEventListener: channel.addEventListener.bind(channel),
      removeEventListener: channel.removeEventListener.bind(channel), close() { closed++; channel.close(); } };
  });
  const receiver = createClubOwnerAvatarInvalidation(() => new BroadcastChannel(name));
  let unsubscribe = () => {};
  const received = new Promise<void>(resolve => { unsubscribe = receiver.subscribe(resolve); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    publisher.publish();
    await Promise.race([received, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("No photo invalidation")), 1500); })]);
    assert.equal(closed, 1);
  } finally { clearTimeout(timer); unsubscribe(); }
});

test("photo invalidation avoids duplicate delivery and closes channels after last subscriber", () => {
  let opened = 0, closed = 0, refreshed = 0;
  const sent: unknown[] = [];
  const bus = createClubOwnerAvatarInvalidation(() => {
    opened++;
    return { postMessage(message) { sent.push(message); }, addEventListener() {}, removeEventListener() {}, close() { closed++; } };
  });
  const unsubscribe = bus.subscribe(() => refreshed++);
  bus.publish();
  assert.equal(opened, 1); assert.equal(refreshed, 1);
  assert.deepEqual(sent, [{ providerId: "1" }]);
  unsubscribe(); unsubscribe();
  bus.publish();
  assert.equal(opened, 2); assert.equal(closed, 2); assert.equal(sent.length, 2);
  const blocked = createClubOwnerAvatarInvalidation(() => { throw Error("blocked"); });
  assert.doesNotThrow(() => blocked.publish());
});
