import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { AuthSessionMissingError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { handleCoachEditorial, type CoachEditorialDependencies } from "../lib/touchlineArena/coach-editorial-handler.ts";
import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";

const code = ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/coach-editorial-server.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const owner = { id: "00000000-0000-4000-8000-000000000001", email: "owner@example.test", is_anonymous: false };
function fixture(result: unknown, mode = "resolved") {
  let admins = 0;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, { exports, AbortSignal, require(name: string) {
    if (name === "server-only") return {};
    if (name === "@supabase/supabase-js") return { isAuthSessionMissingError };
    if (name === "@/lib/supabase/server") return { createClient: async () => mode === "unconfigured" ? null : { auth: { getUser: () =>
      mode === "rejected" ? Promise.reject(new Error("unavailable")) : mode === "timeout" ? new Promise(() => {}) : Promise.resolve(result) } } };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => { admins++; return { rpc: () => ({ abortSignal: async () => ({ data: null, error: null }) }) }; } };
    if (name === "@/lib/admin/owner") return { isOwnerEmail: (email: string) => email === owner.email };
    if (name === "./auth-access") return { hasTouchLineArenaAccess: () => true };
    if (name === "./coach-catalogue-server") return { coachEditorialEnabled: () => true };
    if (name === "./server-read-deadline") return { resolveServerReadWithin: (read: PromiseLike<unknown>, fallback: unknown, timeout: number) => {
      assert.equal(timeout, 8000); return resolveServerReadWithin(read, fallback, 5);
    } };
    throw Error(`Unexpected dependency: ${name}`);
  } });
  const dependencies = (exports.coachEditorialDependencies as () => CoachEditorialDependencies)();
  return { dependencies, admins: () => admins, request: () => handleCoachEditorial(new Request("https://qa.example.test/api/admin/coaches"), dependencies) };
}
for (const error of [null, new AuthSessionMissingError()]) test(`real coach actor + handler denies absent session (${error?.name ?? "no error"}) without admin access`, async () => {
  const f = fixture({ data: { user: null }, error });
  const result = await f.request();
  assert.equal(result.status, 403); assert.deepEqual(await result.json(), { error: "FORBIDDEN" }); assert.equal(f.admins(), 0);
});
for (const mode of ["unconfigured", "rejected", "timeout"]) test(`real coach auth ${mode} remains unavailable without admin access`, async () => {
  const f = fixture(null, mode); assert.equal((await f.request()).status, 503); assert.equal(f.admins(), 0);
});
for (const result of [null, { data: { user: null }, error: new Error("network") },
  { data: { user: null }, error: { name: "AuthSessionMissingError" } }, { data: { user: owner }, error: new AuthSessionMissingError() }]) {
  test("inconsistent or unrecognized authentication failures remain fail-closed", async () => {
    const f = fixture(result); assert.equal((await f.request()).status, 503); assert.equal(f.admins(), 0);
  });
}
test("customer and anonymous actors remain denied; verified owner preserves the normal path", async () => {
  for (const user of [{ ...owner, email: "customer@example.test" }, { ...owner, is_anonymous: true }]) {
    const f = fixture({ data: { user }, error: null }); assert.equal((await f.request()).status, 403); assert.equal(f.admins(), 0);
  }
  const f = fixture({ data: { user: owner }, error: null });
  const actor = await f.dependencies.actor(); assert.equal(actor?.id, owner.id); assert.equal(actor?.owner, true); assert.equal(actor?.allowed, true);
  await f.request(); assert.equal(f.admins(), 1);
});
