import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { handleFixtureAlert } from "../lib/touchlineArena/fixture-alert-handler.ts";

const accountId = "11111111-1111-4111-8111-111111111111";
const otherAccountId = "22222222-2222-4222-8222-222222222222";
const user = { id: accountId, is_anonymous: false };
class MissingSession extends Error {}
const source = ts.transpileModule(readFileSync(new URL("../app/api/notifications/fixtures/[fixtureId]/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(receipt: unknown, options: { client?: "missing" | "reject"; rejectAuth?: boolean; enabled?: boolean; allowed?: boolean } = {}) {
  const calls: string[] = [];
  const admin = {
    from: () => {
      calls.push("fixture");
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "fixture-row" }, error: null }) };
      return query;
    },
    rpc: async (name: string, args: { p_user_id: string; p_fixture_id: string; p_active?: boolean; p_expected_revision?: string }) => {
      calls.push(name);
      assert.equal(args.p_user_id, accountId);
      assert.equal(args.p_fixture_id, "fixture-row");
      return { data: { subscribed: args.p_active ?? false, revision: args.p_expected_revision === undefined ? "0" : (BigInt(args.p_expected_revision as string) + 1n).toString() }, error: null };
    },
  };
  const modules: Record<string, unknown> = {
    "@supabase/supabase-js": { AuthSessionMissingError: MissingSession },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/supabase/server": { createClient: async () => {
      calls.push("client");
      if (options.client === "missing") return null;
      if (options.client === "reject") throw new Error("PRIVATE_CLIENT_FAILURE");
      return { auth: { getUser: async () => {
        calls.push("auth");
        if (options.rejectAuth) throw new Error("PRIVATE_AUTH_FAILURE");
        return receipt;
      } } };
    } },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => options.allowed !== false },
    "@/lib/touchlineArena/fixture-alert-handler": { handleFixtureAlert },
  };
  const exports: Record<string, (request: Request, context: object) => Promise<Response>> = {};
  runInNewContext(source, { exports, process: { env: { TOUCHLINE_FIXTURE_ALERTS_ENABLED: options.enabled === false ? "false" : "true" } },
    require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  return { calls, run: (method: "GET" | "PUT", expectedAccount = accountId, origin = "http://localhost:3100") => exports[method](
    new Request("http://localhost:3100/api/notifications/fixtures/123", { method,
      headers: { "X-Touchline-Expected-Account": expectedAccount, Origin: origin, "Content-Type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify({ active: true, expectedRevision: "0" }) } : {}) }),
    { params: Promise.resolve({ fixtureId: "123" }) }) };
}

for (const method of ["GET", "PUT"] as const) {
  test(`${method} fixture alert adapter preserves temporary auth failure as sanitized 503`, async () => {
    for (const [receipt, options] of [
      [undefined, { client: "missing" }], [undefined, { client: "reject" }], [undefined, { rejectAuth: true }],
      [{ data: { user }, error: new Error("PRIVATE_PROVIDER_FAILURE") }, {}],
      [{ data: { user: null }, error: new Error("PRIVATE_PROVIDER_FAILURE") }, {}],
      [null, {}], [undefined, {}], [{ data: { user } }, {}], [{ error: null }, {}], [{ data: {}, error: null }, {}],
    ] as const) {
      const h = harness(receipt, options);
      const response = await h.run(method);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { ok: false, error: "ALERTS_UNAVAILABLE" });
      assert.equal(h.calls.includes("fixture"), false);
      assert.equal(h.calls.some(call => call.startsWith("touchline_")), false);
    }
  });

  test(`${method} fixture alert adapter returns 401 only for verified absence or missing session`, async () => {
    for (const receipt of [{ data: { user: null }, error: null }, { data: { user }, error: new MissingSession() }]) {
      const h = harness(receipt);
      const response = await h.run(method);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { ok: false, error: "AUTHENTICATION_REQUIRED" });
      assert.deepEqual(h.calls, ["client", "auth"]);
    }
  });

  test(`${method} fixture alert adapter preserves verified account receipts and rejects account drift`, async () => {
    const h = harness({ data: { user }, error: null });
    const response = await h.run(method);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, data: { accountId, fixtureId: "123", subscribed: method === "PUT", revision: method === "PUT" ? "1" : "0" }, delivery: "unavailable" });
    const drift = harness({ data: { user }, error: null });
    assert.equal((await drift.run(method, otherAccountId)).status, 409);
    assert.deepEqual(drift.calls, ["client", "auth"]);
  });
}

test("fixture alert adapter preserves disabled, entitlement and same-origin gates", async () => {
  const disabled = harness({ data: { user }, error: null }, { enabled: false });
  assert.equal((await disabled.run("GET")).status, 503);
  assert.deepEqual(disabled.calls, []);
  const denied = harness({ data: { user }, error: null }, { allowed: false });
  assert.equal((await denied.run("PUT")).status, 403);
  assert.deepEqual(denied.calls, ["client", "auth"]);
  const crossOrigin = harness({ data: { user }, error: null });
  assert.equal((await crossOrigin.run("PUT", accountId, "https://elsewhere.example")).status, 403);
  assert.deepEqual(crossOrigin.calls, []);
});
