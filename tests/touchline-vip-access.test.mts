import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";
import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const load = (source: string, output: string, context: object = {}) => runInNewContext(
  `${stripTypeScriptTypes(source).replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "")}\n${output};`,
  { TextDecoder, TextEncoder, setTimeout, clearTimeout, ...context },
);
const api = load(read("../lib/touchlineFantasy/vip-access-server.ts"), "({parseVipAccessCommand,readVipAccessCommand,grantVipAccess})");
const actor = { id: "10000000-0000-4000-8000-000000000001", email: "owner@example.com" };
const target = "10000000-0000-4000-8000-000000000002";
const command = { email: "member@example.com", reason: "Owner approved complimentary access", commandId: "10000000-0000-4000-8000-000000000003" };
const grant = { commandId: command.commandId, targetUserId: target, planKey: "vip", status: "active", source: "owner_vip_grant", expiresAt: null, grantedAt: "2026-10-11T10:00:00+00:00", accessReady: true };
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("VIP command accepts only a normalized bounded email, reason and command UUID", () => {
  assert.deepEqual(plain(api.parseVipAccessCommand({ ...command, email: " MEMBER@Example.com " })), command);
  for (const invalid of [null, [], {}, { ...command, actorId: actor.id }, { ...command, planKey: "vip" },
    { ...command, email: "x\n@example.com" }, { ...command, email: "a..b@example.com" },
    { ...command, email: "a@-example.com" }, { ...command, reason: "a" }, { ...command, reason: "x".repeat(241) },
    { ...command, reason: "owner\nreason" }, { ...command, commandId: "not-uuid" }]) {
    assert.equal(api.parseVipAccessCommand(invalid), null);
  }
});

test("VIP body reader rejects non-JSON, oversized, malformed and aborted commands", async () => {
  const request = (body: string, headers = { "content-type": "application/json" }) => new Request("https://qa.example/api/admin/vip-access", { method: "POST", headers, body });
  assert.deepEqual(plain(await api.readVipAccessCommand(request(JSON.stringify(command)))), command);
  assert.equal(await api.readVipAccessCommand(request(JSON.stringify(command), { "content-type": "text/plain" })), null);
  assert.equal(await api.readVipAccessCommand(request("x".repeat(2049))), null);
  assert.equal(await api.readVipAccessCommand(request("{")), null);
  const controller = new AbortController(); controller.abort();
  assert.equal(await api.readVipAccessCommand(new Request("https://qa.example", { method: "POST", body: JSON.stringify(command), headers: { "content-type": "application/json" }, signal: controller.signal })), null);
});

test("VIP RPC binds the authenticated actor, whitelists the durable receipt and never retries", async () => {
  let calls = 0;
  const actual = await api.grantVipAccess({ rpc: async (name: string, args: object) => {
    calls++; assert.equal(name, "touchline_fantasy_grant_vip_access");
    assert.deepEqual(plain(args), { p_actor_id: actor.id, p_actor_email: actor.email, p_target_email: command.email, p_reason: command.reason, p_command_id: command.commandId });
    return { data: { ok: true, replay: true, grant: { ...grant, internalSecret: "not-public" } }, error: null };
  } }, actor, command);
  assert.equal(calls, 1);
  assert.deepEqual(plain(actual), { status: 200, body: { ok: true, replay: true, grant } });
  for (const [message, status] of [["VIP_TARGET_NOT_REGISTERED",404],["VIP_IDEMPOTENCY_CONFLICT",409],["VIP_TARGET_EMAIL_UNVERIFIED",409],
    ["VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED",409],["SQL error containing secret",503]] as const) {
    const result = await api.grantVipAccess({rpc: async () => ({data:null,error:{message}})},actor,command);
    assert.equal(result.status,status);
    assert.equal(result.body.error,status===503 ? "VIP_UNAVAILABLE" : message);
  }
  const wrong = await api.grantVipAccess({rpc:async()=>({data:{ok:true,replay:false,grant:{...grant,commandId:target}},error:null})},actor,command);
  assert.equal(wrong.status,503);
  const noAccess = await api.grantVipAccess({rpc:async()=>({data:{ok:true,replay:false,grant:{...grant,accessReady:false}},error:null})},actor,command);
  assert.equal(noAccess.status,503,"an entitlement without confirmed application access is not success");
});

function routeHarness(options: { owner?: boolean; access?: boolean; authenticated?: boolean; error?: string } = {}) {
  const calls = { auth: 0, admin: 0, rpc: 0 };
  const handler = load(read("../app/api/admin/vip-access/route.ts"), "POST", {
    NextResponse: { json: (body: unknown, init: ResponseInit) => Response.json(body,init) },
    createClient: async () => ({auth:{getUser:async()=>{ calls.auth++; return {data:{user:options.authenticated===false ? null : {...actor,app_metadata:{touchline_arena_access_v1:options.access!==false}}},error:null}; }}}),
    createAdminClient: () => { calls.admin++; return {rpc:async()=>{calls.rpc++;return {data:options.error ? null : {ok:true,replay:false,grant},error:options.error ? {message:options.error}:null};}};},
    isOwnerEmail: (email:string)=> options.owner!==false && email===actor.email,
    hasTouchLineArenaAccess, resolveServerReadWithin, ...api,
  });
  const request = (body: unknown = command, headers: Record<string,string> = {}) => {
    const req = new Request("https://qa.example/api/admin/vip-access", {method:"POST",body:JSON.stringify(body),headers:{"content-type":"application/json",origin:"https://qa.example",...headers}});
    Object.defineProperty(req,"nextUrl",{value:new URL(req.url)}); return req;
  };
  return { handler, calls, request };
}

test("VIP route requires same origin and both owner/access before constructing service client", async () => {
  for (const options of [{owner:false},{access:false},{authenticated:false}]) {
    const h=routeHarness(options); const response=await h.handler(h.request());
    assert.equal(response.status,403); assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.equal(h.calls.admin,0); assert.equal(h.calls.rpc,0);
  }
  const h=routeHarness();
  for (const headers of [{origin:"https://evil.example"},{origin:"null"},{origin:"https://qa.example","sec-fetch-site":"cross-site"}]) {
    assert.equal((await h.handler(h.request(command,headers))).status,403);
  }
  assert.equal(h.calls.auth,0); assert.equal(h.calls.admin,0);
});

test("VIP HTTP acknowledges only a confirmed receipt; no metadata, billing or account creation accepts input", async () => {
  const h=routeHarness(); const response=await h.handler(h.request());
  assert.equal(response.status,200); assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.deepEqual(await response.json(),{ok:true,replay:false,grant}); assert.equal(h.calls.rpc,1);
  const invalid=routeHarness(); assert.equal((await invalid.handler(invalid.request({...command,expiresAt:"2099-01-01"}))).status,400);
  assert.equal(invalid.calls.admin,0);
  const ownerTarget=routeHarness();assert.equal((await ownerTarget.handler(ownerTarget.request({...command,email:actor.email}))).status,409);
  assert.equal(ownerTarget.calls.admin,0,"owner stays administration-only");
  const missing=routeHarness({error:"VIP_TARGET_NOT_REGISTERED"});
  assert.equal((await missing.handler(missing.request())).status,404);
});
