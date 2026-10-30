import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { createPublicOwnerAvatarQueue, loadPublicOwnerAvatar } from "../lib/touchlineArena/clubowner-public-avatar-client.ts";
import { publicOwnerAvatarHref } from "../lib/touchlineArena/clubowner-public-contract.ts";

const id = "22222222-2222-4222-8222-222222222222", url = publicOwnerAvatarHref(id, "a".repeat(64));
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
test("twenty visible requests run once and sequentially; queued cancellation never dispatches", async () => {
  const queue = createPublicOwnerAvatarQueue(), controllers = Array.from({ length: 20 }, () => new AbortController());
  const started: number[] = [], releases: (() => void)[] = []; let active = 0, maximum = 0;
  const requests = controllers.map((controller, index) => queue.run(async () => {
    started.push(index); active++; maximum = Math.max(maximum, active);
    await new Promise<void>(resolve => releases.push(resolve)); active--; return index;
  }, controller.signal));
  const cancelled = assert.rejects(requests[7]); controllers[7].abort(); await flush();
  assert.deepEqual(started, [0]);
  for (let i = 0; i < 19; i++) { assert.equal(releases.length, 1); releases.shift()!(); await flush(); }
  await cancelled; assert.equal(maximum, 1); assert.equal(started.length, 19); assert.ok(!started.includes(7));
  assert.deepEqual(await Promise.all(requests.filter((_, i) => i !== 7)), started);
});

test("active cancellation settles caller but retains slot until original work finishes; finite queue and immediate abort", async () => {
  const queue = createPublicOwnerAvatarQueue(), controller = new AbortController(); let release!: () => void, later = 0;
  const first = queue.run(() => new Promise<void>(resolve => { release = resolve; }), controller.signal);
  await flush(); const second = queue.run(async () => { later++; }, new AbortController().signal);
  const cancelled = assert.rejects(first); controller.abort(); await cancelled; await flush(); assert.equal(later, 0);
  release(); await second; assert.equal(later, 1);
  const blocked = new AbortController(); let finish!: () => void;
  const active = queue.run(() => new Promise<void>(resolve => { finish = resolve; }), blocked.signal); await flush();
  const waiting = Array.from({ length: 20 }, () => queue.run(async () => 1, new AbortController().signal));
  await assert.rejects(queue.run(async () => assert.fail("overflow dispatched"), new AbortController().signal), /QUEUE_FULL/);
  finish(); await active; await Promise.all(waiting);
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(queue.run(async () => assert.fail("abort dispatched"), aborted.signal));
});

test("photo reader differentiates 404/503, performs no automatic retry and never accepts private or foreign URLs", async () => {
  for (const status of [404, 503, 401]) {
    let calls = 0;
    const result = await loadPublicOwnerAvatar(url, id, new AbortController().signal, async (_input, init) => {
      calls++; assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error"); assert.equal(init?.method, "GET"); return new Response(null, { status });
    });
    assert.deepEqual(result, { status: status === 404 ? "not-found" : "unavailable" }); assert.equal(calls, 1);
  }
  for (const source of ["https://foreign.invalid/image.webp", "/api/account/avatar?version=" + id, url + "&accountId=" + id]) {
    assert.deepEqual(await loadPublicOwnerAvatar(source, id, new AbortController().signal, async () => assert.fail("invalid URL dispatched")), { status: "unavailable" });
  }
});

test("photo bytes are bounded with absent/lying length and wrong MIME; success is one disposable WebP blob", async () => {
  const signal = () => new AbortController().signal;
  for (const response of [new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }),
    new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp", "content-length": "4000001" } }),
    new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp", "content-length": "2" } }),
    new Response(new Uint8Array(4_000_001), { headers: { "content-type": "image/webp" } })]) {
    assert.deepEqual(await loadPublicOwnerAvatar(url, id, signal(), async () => response), { status: "unavailable" });
  }
  const result = await loadPublicOwnerAvatar(url, id, signal(), async () => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/webp", "content-length": "2" } }));
  assert.equal(result.status, "ready"); if (result.status === "ready") { assert.equal(result.blob.type, "image/webp"); assert.equal(result.blob.size, 2); }
});

test("unmount abort reaches actual transport and does not retry", async () => {
  const controller = new AbortController(); let calls = 0, aborted = false;
  const work = loadPublicOwnerAvatar(url, id, controller.signal, async (_input, init) => {
    calls++; return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => { aborted = true; reject(Error("aborted")); }, { once: true }));
  });
  await flush(); const rejection = assert.rejects(work); controller.abort(); await rejection; await flush();
  assert.equal(calls, 1); assert.equal(aborted, true);
});

test("without AbortSignal.any the reader retains timeout, abort and listener cleanup", async context => {
  const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");
  Object.defineProperty(AbortSignal, "any", { configurable: true, writable: true, value: undefined });
  context.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const completed = new AbortController();
    const success = await loadPublicOwnerAvatar(url, id, completed.signal, async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp" } }));
    assert.equal(success.status, "ready"); assert.equal(getEventListeners(completed.signal, "abort").length, 0);
    for (const mode of ["timeout", "unmount"] as const) {
      const controller = new AbortController(); let calls = 0, aborted = false;
      const pending = loadPublicOwnerAvatar(url, id, controller.signal, async (_input, init) => {
        calls++; return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => { aborted = true; reject(Error("cancelled")); }, { once: true }));
      });
      await flush(); assert.equal(getEventListeners(controller.signal, "abort").length, 1);
      if (mode === "timeout") {
        context.mock.timers.tick(14_999); await flush(); assert.equal(aborted, false);
        context.mock.timers.tick(1); assert.deepEqual(await pending, { status: "unavailable" });
      } else { const rejected = assert.rejects(pending); controller.abort(); await rejected; }
      await flush(); assert.equal(calls, 1); assert.equal(aborted, true); assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    }
    const already = new AbortController(); already.abort();
    await assert.rejects(loadPublicOwnerAvatar(url, id, already.signal, async () => assert.fail("already aborted request dispatched")));
    assert.equal(getEventListeners(already.signal, "abort").length, 0);
  } finally { context.mock.timers.reset(); if (any) Object.defineProperty(AbortSignal, "any", any); }
});
