import assert from "node:assert/strict";
import test from "node:test";
import { createAvatarRetentionListStorage } from "../lib/touchlineArena/club-owner-avatar-retention-list-storage.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const prefix = `${id(1)}/${id(2)}/`, origin = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const signal = () => new AbortController().signal;
const make = (fetchImpl: typeof fetch, assertEnvironment = () => {}) => createAvatarRetentionListStorage({ supabaseOrigin: origin, serviceRoleKey: "test-secret", fetchImpl, assertEnvironment });
test("exact read-only SDK list POST, stable sort, captured credentials and reduced rows", async () => {
  let calls = 0;
  const config = { supabaseOrigin: origin, serviceRoleKey: "test-secret", assertEnvironment() {}, fetchImpl: (async (url, init) => {
    calls++; assert.equal(url, `${origin}/storage/v1/object/list/touchline-club-owner-avatars`);
    assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-secret");
    assert.equal(new Headers(init?.headers).get("accept-encoding"), "identity");
    assert.deepEqual(JSON.parse(String(init?.body)), { prefix, limit: 25, offset: 25, sortBy: { column: "name", order: "asc" } });
    return Response.json([{ id: id(3), name: "a.webp", metadata: { secret: true } }, { id: null, name: "folder" }]);
  }) as typeof fetch };
  const adapter = createAvatarRetentionListStorage(config); config.serviceRoleKey = "mutated";
  assert.deepEqual(await adapter.listPage(prefix, 25, 25, signal()), [{ id: id(3), name: "a.webp" }, { id: null, name: "folder" }]);
  assert.equal(calls, 1);
});
test("bad target/key/prefix/offset/limit never dispatch", async () => {
  let calls = 0; const fetchImpl: typeof fetch = async () => { calls++; return Response.json([]); };
  assert.throws(() => createAvatarRetentionListStorage({ supabaseOrigin: "https://foreign.supabase.co", serviceRoleKey: "x", assertEnvironment() {}, fetchImpl }));
  const adapter = make(fetchImpl);
  for (const bad of ["", `${id(1)}/`, `/${prefix}`, `${prefix}nested/`, `../${prefix}`]) await assert.rejects(adapter.listPage(bad, 0, 25, signal()));
  for (const bad of [-1, 1, NaN, 2_147_483_625]) await assert.rejects(adapter.listPage(prefix, bad, 25, signal()));
  await assert.rejects(adapter.listPage(prefix, 0, 26 as 25, signal())); assert.equal(calls, 0);
});
test("reject compressed, oversized, bad-status, invalid JSON and oversized arrays without retry", async () => {
  const cases = [
    () => new Response("[]", { headers: { "content-type": "application/json", "content-encoding": "gzip" } }),
    () => new Response("[]", { headers: { "content-type": "application/json", "content-length": "65537" } }),
    () => new Response(" ".repeat(65_537), { headers: { "content-type": "application/json" } }),
    () => Response.json([], { status: 403 }), () => Response.json(Array(26).fill({ id: null, name: "x" })),
    () => Response.json({ data: [] }), () => Response.json([{ name: "missing id" }]),
    () => new Response("not-json", { headers: { "content-type": "application/json" } }),
    () => new Response("[]", { headers: { "content-type": "application/json", "content-length": "3" } }),
  ];
  for (const response of cases) {
    let calls = 0; const adapter = make(async () => { calls++; return response(); });
    await assert.rejects(adapter.listPage(prefix, 0, 25, signal()), /QA_RETENTION_LIST_UNAVAILABLE/); assert.equal(calls, 1);
  }
});
test("stream byte budget cancels response and environment drift fails closed", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(65_537)); }, cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } });
  await assert.rejects(make(async () => response).listPage(prefix, 0, 25, signal())); assert.equal(cancelled, true);
  let drift = false;
  await assert.rejects(make(async () => { drift = true; return Response.json([]); }, () => { if (drift) throw Error(); }).listPage(prefix, 0, 25, signal()));
});
test("aborted original fetch holds resource slot until it settles; late body cancelled", async () => {
  let resolve!: (response: Response) => void; let calls = 0, cancelled = false;
  const adapter = make(async () => { calls++; return await new Promise<Response>(done => { resolve = done; }); });
  const controller = new AbortController();
  const pending = adapter.listPage(prefix, 0, 25, controller.signal); controller.abort();
  await assert.rejects(pending);
  await assert.rejects(adapter.listPage(prefix, 0, 25, signal())); assert.equal(calls, 1);
  resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } }));
  await new Promise(done => setImmediate(done)); assert.equal(cancelled, true);
});
