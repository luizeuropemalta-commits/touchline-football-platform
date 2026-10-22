import test from "node:test";
import assert from "node:assert/strict";
import { requestClubCollection, readClubCollection } from "../lib/touchlineFantasy/club-collection-request.ts";

test("collection request preserves the request and confirmed server response", async t => {
  let received: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    assert.equal(path, "/api/touchline-fantasy/collection"); received = options;
    return Response.json({ ok: true, state: { revision: 2 } });
  });
  const body = JSON.stringify({ idempotencyKey: "same-key" });
  const result = await requestClubCollection("/api/touchline-fantasy/collection", { method: "POST", body });
  assert.equal(received?.body, body);
  assert.equal(received?.method, "POST");
  assert.equal(result.payload.state.revision, 2);
});

test("a stalled request stops waiting without inventing a failed transaction or retrying", async t => {
  let signal: AbortSignal | undefined;
  const fetch = t.mock.method(globalThis, "fetch", (_path: string, options: RequestInit) => {
    signal = options.signal!; return new Promise<Response>(() => {});
  });
  await assert.rejects(requestClubCollection("/api/touchline-fantasy/collection", { method: "POST" }, 10), /CLUB_REQUEST_UNCONFIRMED/);
  assert.equal(signal?.aborted, true);
  assert.equal(fetch.mock.callCount(), 1);
});

test("unmount abort and stalled response bodies also stop waiting", async t => {
  t.mock.method(globalThis, "fetch", async () => ({ json: () => new Promise(() => {}) }));
  const controller = new AbortController();
  const result = requestClubCollection("/api/touchline-fantasy/collection", { signal: controller.signal });
  controller.abort();
  await assert.rejects(result, /CLUB_REQUEST_UNCONFIRMED/);
  await assert.rejects(requestClubCollection("/api/touchline-fantasy/collection", {}, 10), /CLUB_REQUEST_UNCONFIRMED/);
});

test("cold read recovers once with GET only and the second confirmed response",async t=>{
  let attempts=0;
  t.mock.method(globalThis,"fetch",(path:string,options:RequestInit)=>{
    assert.equal(path,"/api/touchline-fantasy/collection/read");assert.equal(options.method,"GET");assert.equal(options.body,undefined);
    if(++attempts===1)return new Promise<Response>(()=>{});
    return Promise.resolve(Response.json({ok:true,state:{revision:5}}));
  });
  const result=await readClubCollection(undefined,10);
  assert.equal(attempts,2);assert.equal(result.payload.state.revision,5);
});

test("read retry is bounded and never continues after unmount",async t=>{
  const fetch=t.mock.method(globalThis,"fetch",()=>new Promise<Response>(()=>{}));
  await assert.rejects(readClubCollection(undefined,10),/CLUB_REQUEST_UNCONFIRMED/);
  assert.equal(fetch.mock.callCount(),2);
  const controller=new AbortController();const pending=readClubCollection(controller.signal,10);controller.abort();
  await assert.rejects(pending,/CLUB_REQUEST_UNCONFIRMED/);assert.equal(fetch.mock.callCount(),3);
});

test("HTTP auth/server errors and malformed JSON are not automatically retried",async t=>{
  for(const status of [401,403,409,503]) {
    const fetch=t.mock.method(globalThis,"fetch",async()=>Response.json({ok:false},{status}));
    assert.equal((await readClubCollection()).response.status,status);assert.equal(fetch.mock.callCount(),1);
    fetch.mock.restore();
  }
  const fetch=t.mock.method(globalThis,"fetch",async()=>new Response("invalid-json"));
  await assert.rejects(readClubCollection(),SyntaxError);assert.equal(fetch.mock.callCount(),1);
});

test("known response headers prevent retry even when the body stalls or decoding fails", async t => {
  for (const status of [200, 401, 503]) {
    const stalled = t.mock.method(globalThis, "fetch", async () => ({ status, json: () => new Promise(() => {}) }));
    await assert.rejects(readClubCollection(undefined, 10), /CLUB_REQUEST_UNCONFIRMED/);
    assert.equal(stalled.mock.callCount(), 1);
    stalled.mock.restore();
    const broken = t.mock.method(globalThis, "fetch", async () => ({ status, json: async () => { throw new TypeError("decode failed"); } }));
    await assert.rejects(readClubCollection(undefined, 10), /CLUB_REQUEST_TRANSPORT_FAILED/);
    assert.equal(broken.mock.callCount(), 1);
    broken.mock.restore();
  }
});

test("a transport failure before headers permits only one GET recovery", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("network unavailable"); });
  await assert.rejects(readClubCollection(undefined, 10), /CLUB_REQUEST_TRANSPORT_FAILED/);
  assert.equal(fetch.mock.callCount(), 2);
});
