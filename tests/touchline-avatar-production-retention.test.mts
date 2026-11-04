import assert from "node:assert/strict";
import test from "node:test";
import { createProductionAvatarRetentionTarget, avatarRetentionTarget, avatarRetentionRpcContext, avatarRetentionRpcName } from "../lib/touchlineArena/club-owner-avatar-retention-target.ts";
import { createAvatarRetentionRpc } from "../lib/touchlineArena/club-owner-avatar-retention-rpc.ts";
import { createAvatarRetentionServer } from "../lib/touchlineArena/club-owner-avatar-retention-server.ts";
import { createAvatarRetentionScheduler } from "../lib/touchlineArena/club-owner-avatar-retention-scheduler.ts";
import { createAvatarRetentionStorage } from "../lib/touchlineArena/club-owner-avatar-retention-storage.ts";

// Synthetic target only. No real project configuration or transport is used.
const project = "abcdefghijklmnopqrst", origin = `https://${project}.supabase.co`, profile = "production-avatar-fixture-v1";
const jwt = (ref: string, role = "service_role") => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ ref, role })).toString("base64url")}.synthetic_signature`;
const key = jwt(project), secret = "s".repeat(48);
const targetFor = () => {
  const value = createProductionAvatarRetentionTarget({ profileId: profile, projectRef: project, supabaseOrigin: origin, serviceRoleKey: key });
  assert.ok(value); return value;
};
const actor = "11111111-1111-4111-8111-111111111111", operation = "22222222-2222-4222-8222-222222222222", candidateId = "33333333-3333-4333-8333-333333333333";
const digest = "a".repeat(64), objectKey = `${actor}/${operation}/${digest}.webp`;
const candidate = { candidateId, actorId: actor, operationId: operation, digest, objectKey };
const workerRequest = (credential = key) => new Request(origin + "/functions/v1/touchline-avatar-retention", { method: "POST", headers: { authorization: `Bearer ${credential}` } });

test("retention target is explicit, immutable and project/key/profile bound; QA API remains unchanged", () => {
  const target = targetFor(); assert.equal(Object.isFrozen(target), true);
  assert.deepEqual(avatarRetentionRpcContext(target), { p_profile_id: profile, p_project_ref: project });
  assert.equal(avatarRetentionRpcName(target, "begin"), "touchline_begin_avatar_retention_attempt");
  assert.deepEqual(avatarRetentionRpcContext(avatarRetentionTarget()), { p_project_ref: "xgxbwqxjssxxuihuwmgy" });
  assert.equal(avatarRetentionRpcName(avatarRetentionTarget(), "begin"), "touchline_begin_qa_avatar_retention_attempt");
  assert.throws(() => avatarRetentionTarget({ ...target }));
  for (const patch of [{ projectRef: undefined }, { profileId: undefined }, { projectRef: "xgxbwqxjssxxuihuwmgy" },
    { projectRef: project + "\n" }, { profileId: profile + "\n" }, { supabaseOrigin: origin + "/" },
    { serviceRoleKey: jwt("zyxwvutsrqponmlkjihg") }, { serviceRoleKey: jwt(project, "anon") }, { serviceRoleKey: "sb_secret_synthetic" }]) {
    assert.equal(createProductionAvatarRetentionTarget({ profileId: profile, projectRef: project, supabaseOrigin: origin, serviceRoleKey: key, ...patch }), null);
  }
});

test("Production RPC transport accepts only exact generic family/profile/project and never sends a rejected call", async () => {
  const target = targetFor(); let calls = 0;
  const rpc = createAvatarRetentionRpc({ target, supabaseOrigin: origin, serviceRoleKey: key, assertEnvironment() {}, fetchImpl: async (input, init) => {
    calls++; assert.equal(String(input), origin + "/rest/v1/rpc/touchline_list_due_avatar_retention_candidates");
    assert.deepEqual(JSON.parse(String(init?.body)), { p_profile_id: profile, p_project_ref: project, p_limit: 5 });
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${key}`);
    return Response.json({ version: 1, candidates: [] });
  } });
  const args = { p_profile_id: profile, p_project_ref: project, p_limit: 5 };
  assert.equal((await rpc("touchline_list_due_avatar_retention_candidates", args, new AbortController().signal)).error, null);
  for (const [name, value] of [
    ["touchline_list_due_qa_avatar_retention_candidates", args],
    ["touchline_list_due_avatar_retention_candidates", { ...args, p_profile_id: "another-profile" }],
    ["touchline_list_due_avatar_retention_candidates", { ...args, p_project_ref: "xgxbwqxjssxxuihuwmgy" }],
    ["touchline_list_due_avatar_retention_candidates", { p_project_ref: project, p_limit: 5 }],
  ] as const) assert.ok((await rpc(name, value, new AbortController().signal)).error);
  assert.equal(calls, 1);
  assert.throws(() => createAvatarRetentionRpc({ target, supabaseOrigin: origin, serviceRoleKey: jwt("zyxwvutsrqponmlkjihg"), assertEnvironment() {}, fetchImpl: async () => { assert.fail("wrong key transport"); } }));
});

function workerFixture(options: { enabled?: boolean; denyPolicy?: boolean; deleteUnknown?: boolean } = {}) {
  const target = targetFor(), calls: string[] = [], outcomes: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, origin);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${key}`); assert.equal(init?.redirect, "error");
    if (init?.method === "DELETE") {
      calls.push("delete"); assert.equal(url.pathname, "/storage/v1/object/touchline-club-owner-avatars");
      assert.deepEqual(JSON.parse(String(init.body)), { prefixes: [objectKey] });
      return new Response(null, { status: options.deleteUnknown ? 500 : 200 });
    }
    const name = url.pathname.split("/").at(-1)!; calls.push(name); assert.doesNotMatch(name, /_qa_/);
    const args = JSON.parse(String(init?.body)); assert.equal(args.p_profile_id, profile); assert.equal(args.p_project_ref, project);
    if (name === "touchline_claim_avatar_retention_discovery") return Response.json({ version: 1, allowed: !options.denyPolicy, scans: [] });
    if (name === "touchline_list_due_avatar_retention_candidates") return Response.json({ version: 1, candidates: [candidate] });
    if (name === "touchline_begin_avatar_retention_attempt") {
      const now = Date.now(); assert.equal(args.p_candidate, candidateId);
      return Response.json({ version: 1, allowed: true, ...candidate, attemptId: args.p_attempt, checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString() });
    }
    if (name === "touchline_record_avatar_retention_attempt") {
      outcomes.push(args.p_outcome); return Response.json({ version: 1, recorded: true, reconciliationRequired: true });
    }
    assert.fail(`Unexpected transport ${name}`);
  };
  const config = { target, supabaseOrigin: origin, serviceRoleKey: key, assertEnvironment() {} };
  const rpc = createAvatarRetentionRpc({ ...config, fetchImpl });
  return { calls, outcomes, serve: createAvatarRetentionServer({ ...config, enabled: options.enabled ?? true }, { rpc, fetchImpl }) };
}

test("real Production worker preserves durable begin→single object delete→journal and reports unknown conservatively", async () => {
  const f = workerFixture(); assert.equal((await f.serve(workerRequest())).status, 200);
  assert.deepEqual(f.calls, ["touchline_claim_avatar_retention_discovery", "touchline_list_due_avatar_retention_candidates", "touchline_begin_avatar_retention_attempt", "delete", "touchline_record_avatar_retention_attempt"]);
  assert.deepEqual(f.outcomes, ["accepted"]);
  const unknown = workerFixture({ deleteUnknown: true }); assert.equal((await unknown.serve(workerRequest())).status, 503);
  assert.deepEqual(unknown.outcomes, ["unknown"]); assert.equal(unknown.calls.filter(x => x === "delete").length, 1);
});

test("disabled worker, caller mismatch and denied DB policy cannot reach deletion", async () => {
  const off = workerFixture({ enabled: false }); assert.equal((await off.serve(workerRequest())).status, 503); assert.deepEqual(off.calls, []);
  const wrong = workerFixture(); assert.equal((await wrong.serve(workerRequest(jwt("zyxwvutsrqponmlkjihg")))).status, 401); assert.deepEqual(wrong.calls, []);
  const denied = workerFixture({ denyPolicy: true }); assert.equal((await denied.serve(workerRequest())).status, 503);
  assert.deepEqual(denied.calls, ["touchline_claim_avatar_retention_discovery"]);
  assert.throws(() => createAvatarRetentionStorage({ target: { ...targetFor() }, supabaseOrigin: origin, serviceRoleKey: key,
    assertEnvironment() {}, authorize: async () => assert.fail("forged target authority"), fetchImpl: async () => assert.fail("forged target transport") }));
});

test("Production scheduler has its own gate and trigger, and forwards only a bodyless authenticated request", async () => {
  const calls: string[] = []; const target = targetFor();
  const config = { target, enabled: true, supabaseOrigin: origin, serviceRoleKey: key, triggerSecret: secret, assertEnvironment() {} };
  const transport: typeof fetch = async (input, init) => { calls.push(String(input)); assert.equal(String(input), origin + "/functions/v1/touchline-avatar-retention");
    assert.equal(init?.body, undefined); assert.equal(init?.method, "POST"); assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${key}`); return new Response(null, { status: 200 }); };
  const request = (trigger = secret) => new Request(origin + "/functions/v1/touchline-avatar-retention-scheduler", { method: "POST", headers: { "content-type": "application/json", "x-touchline-avatar-retention-secret": trigger }, body: "{}" });
  assert.equal((await createAvatarRetentionScheduler({ ...config, enabled: false }, transport)(request())).status, 503);
  assert.equal((await createAvatarRetentionScheduler(config, transport)(request("wrong"))).status, 401); assert.deepEqual(calls, []);
  assert.equal((await createAvatarRetentionScheduler(config, transport)(request())).status, 200); assert.equal(calls.length, 1);
});

test("actual Edge worker and scheduler bootstraps reject absent/OFF/mixed Production and never use a QA credential fallback", async () => {
  type Handler = (request: Request) => Response | Promise<Response>;
  type Shim = { env: { get(name: string): string | undefined }; serve(handler: Handler): void };
  const globals = globalThis as typeof globalThis & { Deno?: Shim };
  const previous = { deno: globals.Deno, fetch: globals.fetch, error: console.error }; let sequence = 0;
  const base = { SUPABASE_URL: origin, TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF: project,
    TOUCHLINE_PRODUCTION_AVATAR_RETENTION_PROFILE_ID: profile, TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SERVICE_ROLE_KEY: key,
    TOUCHLINE_PRODUCTION_AVATAR_RETENTION_ENABLED: "true", TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SCHEDULER_ENABLED: "true",
    TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SCHEDULER_SECRET: secret };
  try {
    for (const entry of ["touchline-avatar-retention", "touchline-avatar-retention-scheduler"]) for (const patch of [
      { TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF: undefined }, { TOUCHLINE_PRODUCTION_AVATAR_RETENTION_ENABLED: "false" },
      { TOUCHLINE_PRODUCTION_AVATAR_RETENTION_SERVICE_ROLE_KEY: "", SUPABASE_SERVICE_ROLE_KEY: jwt("xgxbwqxjssxxuihuwmgy") },
      { TOUCHLINE_QA_AVATAR_RETENTION_ENABLED: "true" },
    ]) {
      const env: Record<string, string | undefined> = { ...base, ...patch }; let handler: Handler | undefined; let calls = 0;
      globals.Deno = { env: { get: name => env[name] }, serve: value => { handler = value; } };
      globals.fetch = async () => { calls++; assert.fail("denied bootstrap transported"); }; console.error = () => {};
      await import(new URL(`../supabase/functions/${entry}/index.ts?production=${sequence++}`, import.meta.url).href);
      assert.ok(handler); assert.equal((await handler(workerRequest())).status, 503); assert.equal(calls, 0);
    }
    for (const entry of ["touchline-avatar-retention", "touchline-avatar-retention-scheduler"]) {
      const env: Record<string, string | undefined> = { ...base }; let handler: Handler | undefined; let calls = 0;
      globals.Deno = { env: { get: name => env[name] }, serve: value => { handler = value; } };
      globals.fetch = async (input, init) => {
        calls++; const url = new URL(String(input)); assert.equal(url.origin, origin);
        assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${key}`);
        if (entry.endsWith("scheduler")) { assert.equal(url.pathname, "/functions/v1/touchline-avatar-retention"); assert.equal(init?.body, undefined); return new Response(null, { status: 200 }); }
        const args = JSON.parse(String(init?.body)); assert.equal(args.p_project_ref, project); assert.equal(args.p_profile_id, profile);
        assert.doesNotMatch(url.pathname, /_qa_/);
        return Response.json(url.pathname.endsWith("touchline_claim_avatar_retention_discovery")
          ? { version: 1, allowed: true, scans: [] } : { version: 1, candidates: [] });
      };
      await import(new URL(`../supabase/functions/${entry}/index.ts?production=${sequence++}`, import.meta.url).href);
      assert.ok(handler); assert.equal(calls, 0);
      const request = () => entry.endsWith("scheduler") ? new Request(origin + "/functions/v1/" + entry, { method: "POST",
        headers: { "content-type": "application/json", "x-touchline-avatar-retention-secret": secret }, body: "{}" }) : workerRequest();
      assert.equal((await handler(request())).status, 200); const beforeDrift = calls;
      assert.equal(calls, entry.endsWith("scheduler") ? 1 : 2);
      env.TOUCHLINE_PRODUCTION_AVATAR_RETENTION_PROFILE_ID = "changed-profile";
      assert.equal((await handler(request())).status, 503); assert.equal(calls, beforeDrift);
    }
  } finally {
    if (previous.deno === undefined) delete globals.Deno; else globals.Deno = previous.deno;
    globals.fetch = previous.fetch; console.error = previous.error;
  }
});
