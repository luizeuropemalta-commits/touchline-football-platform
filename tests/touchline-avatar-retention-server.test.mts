import assert from "node:assert/strict";
import test from "node:test";
import { createAvatarRetentionServer } from "../lib/touchlineArena/club-owner-avatar-retention-server.ts";
import type { AvatarRetentionRpc } from "../lib/touchlineArena/club-owner-avatar-retention-worker.ts";
const project = "xgxbwqxjssxxuihuwmgy", origin = `https://${project}.supabase.co`;
const key = (ref = project, role = "service_role") => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ ref, role })).toString("base64url")}.synthetic_signature`;
const secret = key();
const request = (options: RequestInit = {}, path = "/touchline-avatar-retention") => new Request(`https://qa.invalid${path}`, { method: "POST", ...options, headers: { authorization: `Bearer ${secret}`, ...options.headers } });
const empty: AvatarRetentionRpc = async name => ({ data: name.includes("claim") ? { version: 1, allowed: true, scans: [] } : { version: 1, candidates: [] }, error: null });
const noFetch: typeof fetch = async () => { throw Error("unexpected network"); };
test("disabled configuration returns503 before any RPC/network", async () => {
 let calls = 0;
 const handler = createAvatarRetentionServer({ enabled: false, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() {} }, { rpc: async () => { calls++; throw Error(); }, fetchImpl: noFetch });
 assert.equal((await handler(request())).status, 503); assert.equal(calls, 0);
});
test("QA origin and configured service-role JWT binding reject without network", async () => {
 for (const config of [{ supabaseOrigin: "https://foreign.supabase.co", serviceRoleKey: secret }, { supabaseOrigin: origin, serviceRoleKey: key("foreign") }, { supabaseOrigin: origin, serviceRoleKey: key(project, "authenticated") }, { supabaseOrigin: origin, serviceRoleKey: "malformed" }]) {
  let calls = 0;
  const handler = createAvatarRetentionServer({ enabled: true, ...config, assertEnvironment() {} }, { rpc: async () => { calls++; throw Error(); }, fetchImpl: noFetch });
  assert.equal((await handler(request())).status, 503); assert.equal(calls, 0);
 }
});
test("exact bearer auth, no Origin, POST-only, exact path and no request payload/query", async () => {
 let calls = 0;
 const handler = createAvatarRetentionServer({ enabled: true, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() {} }, { rpc: async (...args) => { calls++; return await empty(...args); }, fetchImpl: noFetch });
 for (const header of ["", "Bearer wrong", `bearer ${secret}`, `Bearer ${secret}x`]) assert.equal((await handler(request({ headers: { authorization: header } }))).status, 401);
 assert.equal((await handler(request({ headers: { origin: "https://qa.invalid" } }))).status, 401);
 assert.equal((await handler(request({ method: "GET" }))).status, 405);
 assert.equal((await handler(request({}, "/touchline-avatar-retention/"))).status, 404);
 assert.equal((await handler(request({}, "/touchline-avatar-retention?a=1"))).status, 400);
 assert.equal((await handler(request({ body: "{}" }))).status, 400);
 assert.equal(calls, 0);
});
test("empty successful run performs discovery then cleanup and returns aggregates only", async () => {
 const calls: string[] = [];
 const handler = createAvatarRetentionServer({ enabled: true, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() {} }, { rpc: async (...args) => { calls.push(args[0]); return await empty(...args); }, fetchImpl: noFetch });
 const response = await handler(request({}, "/functions/v1/touchline-avatar-retention"));
 assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
 assert.deepEqual(calls, ["touchline_claim_qa_avatar_retention_discovery", "touchline_list_due_qa_avatar_retention_candidates"]);
 assert.deepEqual(await response.json(), { status: "processed", discovery: { listed: 0, registered: 0, denied: 0, skipped: 0 }, cleanup: { inspected: 0, accepted: 0, denied: 0, unknown: 0 } });
});
test("HTTP empty stream is accepted but content is rejected before RPC", async () => {
 let calls = 0;
 const handler = createAvatarRetentionServer({ enabled: true, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() {} }, { rpc: async (...args) => { calls++; return empty(...args); }, fetchImpl: noFetch });
 const emptyStream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(0)); controller.close(); } });
 const input = { method: "POST", body: emptyStream, duplex: "half", headers: { authorization: `Bearer ${secret}`, "content-length": "0" } } as RequestInit;
 assert.equal((await handler(new Request("https://qa.invalid/touchline-avatar-retention", input))).status, 200);
 assert.equal(calls, 2);
 const content = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } });
 assert.equal((await handler(new Request("https://qa.invalid/touchline-avatar-retention", { ...input, body: content }))).status, 400);
 assert.equal(calls, 2);
});
test("failed discovery never starts cleanup and does not leak error content", async () => {
 let calls = 0;
 const handler = createAvatarRetentionServer({ enabled: true, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() {} }, { rpc: async () => { calls++; return { data: null, error: { message: secret } }; }, fetchImpl: noFetch });
 const response = await handler(request()); assert.equal(response.status, 503); assert.equal(calls, 1);
 assert.equal((await response.text()).includes(secret), false);
});
test("environment drift between stages prevents cleanup", async () => {
 let drift = false, calls = 0;
 const handler = createAvatarRetentionServer({ enabled: true, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() { if (drift) throw Error(); } }, { rpc: async (...args) => { calls++; const r = await empty(...args); drift = true; return r; }, fetchImpl: noFetch });
 assert.equal((await handler(request())).status, 503); assert.equal(calls, 1);
});
test("one invocation and unsettled original RPC retain admission after request abort", async () => {
 let resolve!: (value: { data: unknown; error: unknown }) => void, calls = 0;
 const handler = createAvatarRetentionServer({ enabled: true, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() {} }, { rpc: async () => { calls++; return await new Promise(done => { resolve = done; }); }, fetchImpl: noFetch });
 const controller = new AbortController();
 const pending = handler(request({ signal: controller.signal }));
 assert.equal((await handler(request())).status, 503); assert.equal(calls, 1);
 controller.abort(); assert.equal((await pending).status, 503);
 assert.equal((await handler(request())).status, 503); assert.equal(calls, 1);
 resolve({ data: { version: 1, allowed: true, scans: [] }, error: null });
 await new Promise(done => setImmediate(done));
});
test("config/dependency mutation cannot replace captured authentication or dispatch", async () => {
 const config = { enabled: true, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() {} };
 const deps = { rpc: empty, fetchImpl: noFetch };
 const handler = createAvatarRetentionServer(config, deps);
 config.serviceRoleKey = "replaced"; config.supabaseOrigin = "foreign"; deps.rpc = async () => { throw Error(); };
 assert.equal((await handler(request())).status, 200);
 assert.equal((await handler(request({ headers: { authorization: "Bearer replaced" } }))).status, 401);
});
test("uncertain Storage result yields503 even when its recurring receipt succeeds", async () => {
 const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
 const digest = "a".repeat(64), candidate = { candidateId: id(1), actorId: id(2), operationId: id(3), digest, objectKey: `${id(2)}/${id(3)}/${digest}.webp` };
 let recorded = false;
 const handler = createAvatarRetentionServer({ enabled: true, supabaseOrigin: origin, serviceRoleKey: secret, assertEnvironment() {} }, {
  rpc: async (name, args) => {
   if (name.includes("claim")) return { data: { version: 1, allowed: true, scans: [] }, error: null };
   if (name.includes("list_due")) return { data: { version: 1, candidates: [candidate] }, error: null };
   if (name.includes("begin")) { const now = Date.now(); return { data: { version: 1, allowed: true, ...candidate, attemptId: args.p_attempt,
    checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString() }, error: null }; }
   recorded = true; assert.equal(args.p_outcome, "unknown"); return { data: { version: 1, recorded: true, reconciliationRequired: true }, error: null };
  }, fetchImpl: async () => { throw Error("lost HTTP response"); },
 });
 assert.equal((await handler(request())).status, 503); assert.equal(recorded, true);
});
