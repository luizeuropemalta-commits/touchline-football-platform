/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated real server adapter harness, no database/network. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createECDH } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { fixtureAlertPreferenceStatus, handleFixtureAlertStatus, type FixtureAlertStatusDependencies } from "../lib/touchlineArena/fixture-alert-status.ts";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";
import { parseTouchlineDeviceRegistration } from "../lib/touchlineArena/push-device-contract.ts";
import { touchlinePushSubscriptionFingerprint } from "../lib/touchlineArena/push-subscription-fingerprint.ts";
import { parseMatchPushVapidConfig } from "../lib/touchlineArena/match-push-vapid-config.ts";
import { normalizeMatchPushSourceAgePolicy } from "../lib/touchlineArena/match-push-source-freshness.ts";

const account = "00000000-0000-4000-8000-000000000001";
const installation = "00000000-0000-4000-8000-000000000002";
const fixture = "00000000-0000-4000-8000-000000000003";
const other = "00000000-0000-4000-8000-000000000004";
const now = new Date("2026-10-24T01:00:00Z");
const preference = () => ({ user_id: account, settings: { goalsAndEvents: true }, channels: { push: true }, frequency: "realtime",
  explicit_consent_at: "2026-10-23T00:00:00Z", quiet_hours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" } });
const request = (headers: Record<string, string> = {}, signal?: AbortSignal) => new Request("https://qa.example/api/notifications/fixtures/123/readiness", {
  headers: { "X-Touchline-Expected-Account": account, "X-Touchline-Installation": installation, ...headers }, signal,
});
function harness() {
  const calls: unknown[][] = [];
  const deps: FixtureAlertStatusDependencies = {
    enabled: true,
    actor: async () => { calls.push(["actor"]); return { id: account, allowed: true }; },
    resolveFixture: async id => { calls.push(["fixture", id]); return fixture; },
    observe: async (...args) => { calls.push(["observe", ...args.slice(0, 3)]); return {
      subscribed: true, configured: true, device: "registered", preferences: preference(),
    }; }, now: () => now,
  };
  return { calls, deps };
}

test("configured prerequisites never claim operational health, active alerts or delivery", async () => {
  const { deps, calls } = harness();
  const response = await handleFixtureAlertStatus(request(), "123", deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, version: 1, data: {
    accountId: account, fixtureId: "123", installationId: installation, subscribed: true, configuration: "configured",
    device: "registered", preference: "enabled", operational: "unknown", delivery: "unconfirmed", active: false,
  } });
  assert.deepEqual(calls, [["actor"], ["fixture", "123"], ["observe", account, fixture, installation]]);
  for (const name of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) assert.match(response.headers.get(name) ?? "", /no-store/);
  assert.match(response.headers.get("vary") ?? "", /X-Touchline-Expected-Account/);
});

test("invalid, cross-site and write requests do not reach auth or storage", async () => {
  const cases: [Request, string, number][] = [
    [new Request(request(), { method: "POST" }), "123", 405], [request({ "sec-fetch-site": "cross-site" }), "123", 403],
    [request(), "0123", 400], [request({ "X-Touchline-Expected-Account": "" }), "123", 400],
    [request({ "X-Touchline-Installation": "not-an-installation" }), "123", 400],
  ];
  for (const [input, id, status] of cases) {
    const { deps, calls } = harness();
    assert.equal((await handleFixtureAlertStatus(input, id, deps)).status, status);
    assert.deepEqual(calls, []);
  }
  const { deps, calls } = harness();
  assert.equal((await handleFixtureAlertStatus(request(), "123", { ...deps, enabled: false })).status, 503);
  assert.deepEqual(calls, []);
});

test("verified actor and canonical fixture gate all private reads", async () => {
  for (const [actor, status] of [[null, 401], [{ id: account, allowed: false }, 403], [{ id: other, allowed: true }, 409]] as const) {
    const { deps, calls } = harness();
    assert.equal((await handleFixtureAlertStatus(request(), "123", { ...deps, actor: async () => actor })).status, status);
    assert.deepEqual(calls, []);
  }
  const { deps, calls } = harness();
  assert.equal((await handleFixtureAlertStatus(request(), "123", { ...deps, resolveFixture: async () => null })).status, 404);
  assert.deepEqual(calls, [["actor"]]);
});

test("cancellation prevents a late auth response starting any storage work", async () => {
  const { deps, calls } = harness();
  const controller = new AbortController();
  let release!: (actor: { id: string; allowed: boolean }) => void;
  const response = handleFixtureAlertStatus(request({}, controller.signal), "123", { ...deps,
    actor: () => new Promise(resolve => { release = resolve; }),
  });
  controller.abort();
  assert.equal((await response).status, 503);
  release({ id: account, allowed: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, []);
});

test("unknown or malformed observation fails closed without exposing thrown data", async () => {
  const { deps } = harness();
  const response = await handleFixtureAlertStatus(request(), "123", { ...deps, observe: async () => { throw new Error("secret-endpoint-token"); } });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret-endpoint-token/);
  for (const patch of [{ subscribed: "true" }, { device: "not-requested" }, { configured: "true" }]) {
    const invalid = await handleFixtureAlertStatus(request(), "123", { ...deps,
      observe: async () => ({ subscribed: true, configured: true, device: "registered", preferences: preference(), ...patch }) as any,
    });
    assert.equal(invalid.status, 503);
  }
});

test("preference observation respects consent, pause, quiet hours and malformed persisted data", () => {
  assert.equal(fixtureAlertPreferenceStatus(null, now), "consent-required");
  assert.equal(fixtureAlertPreferenceStatus({}, now), "unconfirmed");
  assert.equal(fixtureAlertPreferenceStatus(preference(), now), "enabled");
  for (const patch of [{ explicit_consent_at: null }, { explicit_consent_at: "2030-01-01" }, { channels: { push: false } }, { settings: { goalsAndEvents: false } }, { frequency: "daily_digest" }]) {
    assert.equal(fixtureAlertPreferenceStatus({ ...preference(), ...patch }, now), "consent-required");
  }
  assert.equal(fixtureAlertPreferenceStatus({ ...preference(), frequency: "paused" }, now), "paused");
  assert.equal(fixtureAlertPreferenceStatus({ ...preference(), quiet_hours: {} }, now), "unconfirmed");
  assert.equal(fixtureAlertPreferenceStatus({ ...preference(), quiet_hours: { ...preference().quiet_hours, enabled: true } }, now), "quiet-hours");
});

function adapterHarness() {
  const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(Buffer.alloc(32, 1));
  const publicKey = ecdh.getPublicKey(undefined, "uncompressed").toString("base64url");
  const subscription = { endpoint: "https://push.example/private-token", keys: { p256dh: publicKey, auth: Buffer.alloc(16, 2).toString("base64url") } };
  const records: Record<string, any> = { football_fixtures: { id: fixture }, notification_preferences: preference(),
    notification_devices: { user_id: account, installation_id: installation, permission: "granted", push_subscription: subscription } };
  const calls: unknown[][] = [];
  const env: Record<string, string> = { TOUCHLINE_FIXTURE_ALERTS_ENABLED: "true", TOUCHLINE_MATCH_PUSH_WORKER_ENABLED: "true",
    TOUCHLINE_MATCH_PUSH_WORKER_SECRET: "test-only-".repeat(4), TOUCHLINE_MATCH_PUSH_SOURCE_AGE_POLICY: JSON.stringify({ eventSyncedAt: 1000, settlementSyncedAt: 1000, fixtureUpdatedAt: 1000, lastObservedAt: 1000 }),
    TOUCHLINE_WEB_PUSH_SUBJECT: "mailto:test@example.com", NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: publicKey,
    TOUCHLINE_WEB_PUSH_PRIVATE_KEY: ecdh.getPrivateKey().toString("base64url") };
  function from(owner: string, table: string) {
    calls.push([owner, "from", table]);
    const query = {
      select: (columns: string) => { calls.push([table, "select", columns]); return query; },
      eq: (field: string, value: string) => { calls.push([table, "eq", field, value]); return query; },
      abortSignal: (signal: AbortSignal) => { assert.ok(signal instanceof AbortSignal); return query; },
      maybeSingle: async () => ({ data: records[table], error: null }),
    };
    return query;
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: account, is_anonymous: false, app_metadata: { touchline_arena_access_v1: true } } }, error: null }) }, from: (table: string) => from("customer", table) };
  const admin = { from: (table: string) => from("service", table), rpc: (name: string, args: unknown) => {
    calls.push(["rpc", name, structuredClone(args)]); return { abortSignal: () => Promise.resolve({ data: { subscribed: true }, error: null }) };
  } };
  const exports: { createFixtureAlertStatusDependencies?: () => FixtureAlertStatusDependencies } = {};
  const source = readFileSync(new URL("../lib/touchlineArena/fixture-alert-status-server.ts", import.meta.url), "utf8");
  const imports: Record<string, unknown> = { "server-only": {}, "@supabase/supabase-js": { AuthSessionMissingError }, "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": { createAdminClient: () => admin }, "./auth-access": { hasTouchLineArenaAccess },
    "./push-device-contract": { parseTouchlineDeviceRegistration }, "./push-subscription-fingerprint": { touchlinePushSubscriptionFingerprint },
    "./match-push-vapid-config": { parseMatchPushVapidConfig }, "./match-push-source-freshness": { normalizeMatchPushSourceAgePolicy } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Buffer, process: { env }, require: (name: string) => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; } });
  return { calls, env, records, deps: () => exports.createFixtureAlertStatusDependencies!() };
}

test("real adapter uses customer RLS + exact owner/installation and only service read RPC", async () => {
  const h = adapterHarness();
  const response = await handleFixtureAlertStatus(request(), "123", { ...h.deps(), now: () => now });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /private-token|p256dh|privateKey|sha256|test-only/);
  const data = JSON.parse(text).data;
  assert.equal(data.configuration, "configured"); assert.equal(data.device, "registered"); assert.equal(data.active, false);
  assert.ok(h.calls.some(call => JSON.stringify(call) === JSON.stringify(["notification_devices", "eq", "user_id", account])));
  assert.ok(h.calls.some(call => JSON.stringify(call) === JSON.stringify(["notification_devices", "eq", "installation_id", installation])));
  assert.ok(h.calls.some(call => JSON.stringify(call) === JSON.stringify(["customer", "from", "notification_preferences"])));
  assert.deepEqual(h.calls.filter(call => call[0] === "rpc"), [["rpc", "touchline_fixture_alert_status", { p_fixture_id: fixture, p_user_id: account }]]);
});

test("real adapter distinguishes absent installation, missing device, foreign row and incomplete configuration", async () => {
  const absent = adapterHarness(); const noDeviceRequest = request(); noDeviceRequest.headers.delete("X-Touchline-Installation");
  const noDevice = await handleFixtureAlertStatus(noDeviceRequest, "123", absent.deps());
  assert.equal((await noDevice.json()).data.device, "not-requested");
  assert.ok(!absent.calls.some(call => call[2] === "notification_devices"));
  const missing = adapterHarness(); missing.records.notification_devices = null;
  assert.equal((await (await handleFixtureAlertStatus(request(), "123", missing.deps())).json()).data.device, "missing");
  const foreign = adapterHarness(); foreign.records.notification_devices.user_id = other;
  assert.equal((await handleFixtureAlertStatus(request(), "123", foreign.deps())).status, 503);
  const configuration = adapterHarness(); configuration.env.TOUCHLINE_WEB_PUSH_PRIVATE_KEY = "invalid";
  const body = await (await handleFixtureAlertStatus(request(), "123", configuration.deps())).json();
  assert.equal(body.data.configuration, "unconfigured"); assert.equal(body.data.operational, "unknown");
});

test("readiness route remains GET-only and independent of activation/send modules", () => {
  const source = readFileSync(new URL("../app/api/notifications/fixtures/[fixtureId]/readiness/route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export (?:async )?function (?:POST|PUT|DELETE)|dispatch|enqueue|registerTouchlinePushDevice/);
});
