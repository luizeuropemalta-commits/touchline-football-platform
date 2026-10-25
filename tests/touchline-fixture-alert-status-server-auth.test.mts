import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { handleFixtureAlertStatus, type FixtureAlertStatusDependencies } from "../lib/touchlineArena/fixture-alert-status.ts";

const accountId = "11111111-1111-4111-8111-111111111111";
const user = { id: accountId, is_anonymous: false };
class MissingSession extends Error {}
const source = ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/fixture-alert-status-server.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(receipt: unknown, options: { missingClient?: boolean; rejectClient?: boolean; rejectAuth?: boolean; clientWait?: Promise<void>; authWait?: Promise<void> } = {}) {
  const calls: string[] = [];
  let markAuthStarted!: () => void;
  const authStarted = new Promise<void>(resolve => { markAuthStarted = resolve; });
  const modules: Record<string, unknown> = {
    "server-only": {}, "@supabase/supabase-js": { AuthSessionMissingError: MissingSession },
    "@/lib/supabase/server": { createClient: async () => {
      calls.push("client");
      if (options.clientWait) await options.clientWait;
      if (options.rejectClient) throw new Error("PRIVATE_CLIENT_FAILURE");
      if (options.missingClient) return null;
      return { auth: { getUser: async () => {
        calls.push("auth");
        markAuthStarted();
        if (options.authWait) await options.authWait;
        if (options.rejectAuth) throw new Error("PRIVATE_AUTH_FAILURE");
        return receipt;
      } } };
    } },
    "@/lib/supabase/admin": { createAdminClient: () => { calls.push("admin"); throw new Error("unexpected database access"); } },
    "./auth-access": { hasTouchLineArenaAccess: () => { calls.push("access"); return true; } },
    "./push-device-contract": {}, "./push-subscription-fingerprint": {},
    "./match-push-vapid-config": {}, "./match-push-source-freshness": {},
  };
  const exports: { createFixtureAlertStatusDependencies?: () => FixtureAlertStatusDependencies } = {};
  runInNewContext(source, { exports, process: { env: { TOUCHLINE_FIXTURE_ALERTS_ENABLED: "true" } },
    require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  const deps = exports.createFixtureAlertStatusDependencies!();
  return { calls, deps, authStarted, run: () => handleFixtureAlertStatus(new Request("http://localhost:3100/api/notifications/fixtures/123/readiness", {
    headers: { "X-Touchline-Expected-Account": accountId },
  }), "123", deps) };
}

test("readiness adapter propagates temporary and malformed auth as sanitized 503, never logout", async () => {
  for (const [receipt, options] of [
    [null, { missingClient: true }], [null, { rejectClient: true }], [null, { rejectAuth: true }],
    [{ data: { user }, error: new Error("PRIVATE_PROVIDER_FAILURE") }, {}],
    [{ data: { user: null }, error: { status: 403, message: "PRIVATE_PROVIDER_FAILURE" } }, {}],
    [null, {}], [undefined, {}], [{ data: { user } }, {}], [{ error: null }, {}], [{ data: {}, error: null }, {}],
  ] as const) {
    const h = harness(receipt, options);
    const response = await h.run();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "ALERT_STATUS_UNCONFIRMED" });
    assert.equal(h.calls.includes("access"), false);
    assert.equal(h.calls.includes("admin"), false);
  }
});

test("readiness adapter recognizes only verified absent user and missing session as 401", async () => {
  for (const receipt of [{ data: { user: null }, error: null }, { data: { user }, error: new MissingSession() }]) {
    const h = harness(receipt);
    const response = await h.run();
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "AUTHENTICATION_REQUIRED" });
    assert.deepEqual(h.calls, ["client", "auth"]);
  }
});

test("readiness adapter returns verified identity and preserves anonymous access rejection", async () => {
  for (const anonymous of [false, true]) {
    const h = harness({ data: { user: { ...user, is_anonymous: anonymous } }, error: null });
    const actor = await h.deps.actor(new AbortController().signal);
    assert.equal(actor?.id, accountId);
    assert.equal(actor?.allowed, !anonymous);
    assert.equal(h.calls.includes("admin"), false);
  }
});

test("readiness adapter cannot continue auth when client creation resolves after cancellation", async () => {
  let release!: () => void;
  const clientWait = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ data: { user }, error: null }, { clientWait });
  const controller = new AbortController();
  const pending = h.deps.actor(controller.signal);
  controller.abort(); release();
  await assert.rejects(pending);
  assert.deepEqual(h.calls, ["client"]);
});

test("readiness adapter cannot publish identity when auth resolves after cancellation", async () => {
  let release!: () => void;
  const authWait = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ data: { user }, error: null }, { authWait });
  const controller = new AbortController();
  const pending = h.deps.actor(controller.signal);
  await h.authStarted;
  assert.ok(h.calls.includes("auth"));
  controller.abort(); release();
  await assert.rejects(pending);
  assert.deepEqual(h.calls, ["client", "auth"]);
});
