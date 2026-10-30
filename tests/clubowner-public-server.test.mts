import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { handlePublicOwners, type PeopleDependencies } from "../lib/touchlineArena/clubowner-public-handler.ts";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";
import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";

const source = ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/clubowner-public-server.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(options: { enabled?: boolean; photoEnabled?: boolean; error?: { name: string } | null; user?: unknown; missingClient?: boolean; rpcError?: boolean } = {}) {
  let clients = 0, authenticated = 0;
  const calls: { name: string; args: unknown; signal?: AbortSignal }[] = [];
  const exports: Record<string, unknown> = {};
  const client = {
    auth: { getUser: async () => { authenticated++; return { data: { user: options.user === undefined ? { id: "private-account-id", is_anonymous: false, app_metadata: { touchline_arena_access_v1: true } } : options.user }, error: options.error ?? null }; } },
    rpc: (name: string, args: unknown) => {
      const call: typeof calls[number] = { name, args }; calls.push(call);
      return { abortSignal: async (signal: AbortSignal) => { call.signal = signal; return { data: null, error: options.rpcError ? { message: "PRIVATE_DB_DETAIL" } : null }; } };
    },
  };
  runInNewContext(source, { exports, AbortSignal, process: { env: { TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED: options.enabled === false ? "false" : "true" } },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "@/lib/supabase/server") return { createClient: async () => { clients++; return options.missingClient ? null : client; } };
      if (name === "./auth-access") return { hasTouchLineArenaAccess };
      if (name === "./server-read-deadline") return { resolveServerReadWithin };
      if (name === "@/lib/admin/owner") return { isOwnerEmail: (email: string) => email === "admin@example.invalid" };
      if (name === "./clubowner-public-avatar-server") return { publicOwnerAvatarService: () => ({ enabled: options.photoEnabled === true, urls: async () => ({}), assertCurrent() {} }) };
      throw new Error(`Unexpected server dependency ${name}`);
    },
  });
  return { deps: (exports.publicOwnerDependencies as () => PeopleDependencies)(), calls, counts: () => ({ clients, authenticated }) };
}
test("real server adapter reuses request session, bounds RPC transport, and never passes an actor parameter", async () => {
  const f = fixture(); assert.deepEqual(JSON.parse(JSON.stringify(await f.deps.currentActor())), { allowed: true });
  await f.deps.rpc("touchline_people_own_profile");
  assert.deepEqual(f.counts(), { clients: 1, authenticated: 1 }); assert.equal(f.calls[0].signal instanceof AbortSignal, true);
  assert.equal(JSON.stringify(f.calls[0].args), "{}");
});
test("photo opt-in capability uses verified request user and canonical owner exclusion without changing legacy access", async () => {
  const customer = { id: "11111111-1111-4111-8111-111111111111", email: "customer@example.invalid", is_anonymous: false, app_metadata: { touchline_arena_access_v1: true } };
  assert.deepEqual(JSON.parse(JSON.stringify(await fixture({ photoEnabled: true, user: customer }).deps.currentActor())), { allowed: true, photoAllowed: true });
  for (const user of [{ ...customer, email: "admin@example.invalid" }, { ...customer, email: "" }, { ...customer, email: undefined }, { ...customer, is_anonymous: true }, { ...customer, app_metadata: {}, user_metadata: { touchline_arena_access_v1: true } }]) {
    assert.equal((await fixture({ photoEnabled: true, user }).deps.currentActor())?.photoAllowed, false);
  }
  const legacy = fixture({ user: customer });
  assert.equal(Object.hasOwn((await legacy.deps.currentActor())!, "photoAllowed"), false);
  await assert.rejects(legacy.deps.rpc("touchline_people_save_profile_v2", {}), /PHOTO_UNAVAILABLE/);
  assert.equal(legacy.calls.length, 0);
});
test("real server adapter treats auth errors, untrusted metadata and anonymous users as unauthorized", async () => {
  await assert.rejects(fixture({ error: { name: "AuthApiError" } }).deps.currentActor(), /AUTH_UNAVAILABLE/);
  await assert.rejects(fixture({ error: { name: "AuthSessionMissingError" } }).deps.currentActor(), /AUTH_UNAVAILABLE/);
  assert.equal(await fixture({ error: { name: "AuthSessionMissingError" }, user: null }).deps.currentActor(), null);
  for (const user of [{ user_metadata: { touchline_arena_access_v1: true } }, { is_anonymous: true, app_metadata: { touchline_arena_access_v1: true } }]) {
    assert.equal((await fixture({ user }).deps.currentActor())?.allowed, false);
  }
  await assert.rejects(fixture({ missingClient: true }).deps.currentActor(), /AUTH_UNAVAILABLE/);
});
test("application gate bypasses actual adapter setup and RPC errors remain sanitized through handler", async () => {
  const off = fixture({ enabled: false });
  const response = await handlePublicOwners(new Request("https://touchline.test/api?q=Alice"), "directory", off.deps);
  assert.equal(response.status, 503); assert.deepEqual(off.counts(), { clients: 0, authenticated: 0 });
  const failed = await handlePublicOwners(new Request("https://touchline.test/api?q=Alice"), "directory", fixture({ rpcError: true }).deps);
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /PRIVATE_DB_DETAIL/);
});
