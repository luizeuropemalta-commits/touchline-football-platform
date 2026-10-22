import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Install under tests/. The route runs in a closed VM: no real Supabase,
// environment, SDK, transport, or other test harness is imported.
const source = readFileSync(new URL("../app/api/notifications/preferences/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const quietHours = { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" };
const accountId = "synthetic-account-id";
const sentinel = "PRIVATE_DIAGNOSTIC_SENTINEL schema=private_preferences path=/synthetic/internal.sql";
const publicError = "Notification preferences could not be saved.";
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function harness(options: { error?: boolean; authenticated?: boolean; arenaAccess?: boolean; clientAvailable?: boolean } = {}) {
  const calls = { clients: 0, auth: 0, writes: 0, singles: 0 };
  let written: Record<string, unknown> | undefined;
  const user = options.authenticated === false ? null : { id: accountId };
  const client = {
    auth: { getUser: async () => { calls.auth++; return { data: { user }, error: null }; } },
    from: (table: string) => {
      assert.equal(table, "notification_preferences", "unexpected table/device access");
      return {
        upsert: (row: Record<string, unknown>, config: unknown) => {
          calls.writes++;
          written = plain(row);
          assert.deepEqual(plain(config), { onConflict: "user_id" });
          return { select: (columns: string) => {
            assert.equal(columns, "settings, channels, frequency, quiet_hours, explicit_consent_at, updated_at");
            return { single: async () => {
              calls.singles++;
              return options.error
                ? { data: null, error: { message: sentinel, details: sentinel, hint: sentinel, code: "SYNTHETIC_PRIVATE_CODE" } }
                : { data: { ...row, updated_at: "2026-10-21T00:00:00Z", internal_diagnostic: sentinel }, error: null };
            } };
          } };
        },
      };
    },
  };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } },
    "@/lib/supabase/server": { createClient: async () => { calls.clients++; return options.clientAvailable === false ? null : client; } },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: (value: unknown) => Boolean(value) && options.arenaAccess !== false },
    "@/lib/touchlineArena/push-device-contract": { parseTouchlineDeviceRegistration: () => { throw new Error("Unexpected device access"); } },
    "@/lib/touchlineArena/notification-quiet-hours": { parseNotificationQuietHours: (value: unknown) => {
      assert.deepEqual(plain(value), quietHours);
      return { ...quietHours };
    } },
    "@/lib/touchlineArena/push-preference-contract": {
      hasTouchlineServerPushConfiguration: () => false,
      resolveTouchlinePushPreference: (value: unknown) => {
        assert.deepEqual(plain(value), { explicitConsent: false, requested: false, serverConfigured: false, hasRegisteredDevice: false });
        return false;
      },
    },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled, {
    exports, URL,
    require: (name: string) => {
      assert.ok(Object.hasOwn(modules, name), `Forbidden import: ${name}`);
      return modules[name];
    },
  }, { timeout: 1000 });
  return {
    put: exports.PUT as (request: Request) => Promise<Response>,
    calls,
    written: () => written,
  };
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://touchline.test/api/notifications/preferences", {
    method: "PUT",
    headers: { origin: "https://touchline.test", "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
    body: JSON.stringify({ settings: { playerRumours: false }, channels: { in_app: true, push: false, email: false }, quietHours, frequency: "realtime", explicitConsent: false }),
  });
}

test("preferences PUT hides database diagnostics behind the stable 500 envelope", async () => {
  const h = harness({ error: true });
  const response = await h.put(request());
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { ok: false, error: publicError });
  assert.ok(!JSON.stringify(body).includes(sentinel));
  assert.ok(!JSON.stringify(body).includes("SYNTHETIC_PRIVATE_CODE"));
  assert.deepEqual(h.calls, { clients: 1, auth: 1, writes: 1, singles: 1 });
  assert.equal(h.written()?.user_id, accountId);
});

test("preferences PUT preserves successful preference data without internal fields", async () => {
  const h = harness();
  const response = await h.put(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, {
    settings: h.written()?.settings,
    channels: { in_app: true, push: false, email: false },
    frequency: "realtime", quietHours, explicitConsentAt: null, updatedAt: "2026-10-21T00:00:00Z",
  });
  assert.equal(body.data.settings.playerRumours, false);
  assert.ok(!JSON.stringify(body).includes(sentinel));
  assert.deepEqual(h.calls, { clients: 1, auth: 1, writes: 1, singles: 1 });
});

test("preferences PUT rejects unauthenticated or inaccessible accounts before writes", async () => {
  for (const options of [{ authenticated: false }, { arenaAccess: false }, { clientAvailable: false }]) {
    const h = harness(options);
    const response = await h.put(request());
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "Authentication required." });
    assert.equal(h.calls.writes, 0);
    assert.equal(h.calls.singles, 0);
  }
});

test("preferences PUT rejects invalid origins before creating a client", async () => {
  for (const headers of [{ origin: "https://other.test" }, { origin: "" }, { "sec-fetch-site": "cross-site" }]) {
    const h = harness();
    const response = await h.put(request(headers));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: "Invalid request origin." });
    assert.deepEqual(h.calls, { clients: 0, auth: 0, writes: 0, singles: 0 });
  }
});
