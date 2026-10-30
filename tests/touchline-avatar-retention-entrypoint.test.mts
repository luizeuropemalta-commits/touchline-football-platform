import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { avatarRetentionConfigurationFailure } from "../lib/touchlineArena/club-owner-avatar-retention-configuration.ts";
import { createAvatarRetentionServer } from "../lib/touchlineArena/club-owner-avatar-retention-server.ts";

const origin = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const project = "xgxbwqxjssxxuihuwmgy";
const jwt = (claims: unknown) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic_signature`;
const key = jwt({ ref: project, role: "service_role" });
const secretMarker = "synthetic-error-must-never-appear";
const base = () => ({ SUPABASE_URL: origin, SUPABASE_SERVICE_ROLE_KEY: key, TOUCHLINE_QA_AVATAR_RETENTION_ENABLED: "true" });
const request = (method = "GET", headers: Record<string, string> = {}) => new Request(`${origin}/functions/v1/touchline-avatar-retention`, { method, headers });
let probe = 0;
type Handler = (request: Request) => Response | Promise<Response>;
type Shim = { env: { get(name: string): string | undefined }; serve(handler: Handler): void };

async function entrypoint(env: Record<string, string | undefined>, inspect: (handler: Handler, logs: unknown[], calls: () => number) => Promise<void>,
  options: { envThrows?: boolean; constructorThrows?: boolean; loggerThrows?: boolean } = {}) {
  const globals = globalThis as typeof globalThis & { Deno?: Shim };
  const previous = { deno: globals.Deno, fetch: globals.fetch, error: console.error };
  const logs: unknown[] = []; let handler: Handler | undefined, calls = 0;
  try {
    globals.Deno = { env: { get(name) { if (options.envThrows) throw Error(secretMarker); return env[name]; } }, serve(value) { handler = value; } };
    globals.fetch = async () => { calls++; throw Error(secretMarker); };
    if (options.constructorThrows) Object.defineProperty(globals.fetch, "bind", { value() { throw Error(secretMarker); } });
    console.error = value => { if (options.loggerThrows) throw Error(secretMarker); logs.push(JSON.parse(value)); };
    // Import the real entrypoint anew: no copied bootstrap/handler implementation.
    await import(new URL(`../supabase/functions/touchline-avatar-retention/index.ts?diagnostic=${probe++}`, import.meta.url).href);
    assert.ok(handler); await inspect(handler, logs, () => calls);
  } finally {
    if (previous.deno === undefined) delete globals.Deno; else globals.Deno = previous.deno;
    globals.fetch = previous.fetch; console.error = previous.error;
  }
}

test("bootstrap emits one fixed cause per isolate while every failed request remains generic with zero outbound", async () => {
  const cases: Array<{ env: Record<string, string | undefined>; code: string; envThrows?: boolean; constructorThrows?: boolean }> = [
    { env: {}, code: "QA_RETENTION_FLAG_OFF" },
    { env: { ...base(), TOUCHLINE_QA_AVATAR_RETENTION_ENABLED: "false" }, code: "QA_RETENTION_FLAG_OFF" },
    { env: { ...base(), TOUCHLINE_QA_AVATAR_RETENTION_ENABLED: "true\n" }, code: "QA_RETENTION_FLAG_OFF" },
    { env: { ...base(), SUPABASE_URL: undefined }, code: "QA_RETENTION_CONFIGURATION_MISSING" },
    { env: { ...base(), SUPABASE_SERVICE_ROLE_KEY: "" }, code: "QA_RETENTION_CONFIGURATION_MISSING" },
    { env: { ...base(), SUPABASE_URL: origin + "/" }, code: "QA_RETENTION_ORIGIN_INCOMPATIBLE" },
    { env: { ...base(), SUPABASE_URL: "https://personal.invalid" }, code: "QA_RETENTION_ORIGIN_INCOMPATIBLE" },
    { env: { ...base(), SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic" }, code: "QA_RETENTION_KEY_FORMAT_INCOMPATIBLE" },
    { env: { ...base(), SUPABASE_SERVICE_ROLE_KEY: key + "\n" }, code: "QA_RETENTION_KEY_FORMAT_INCOMPATIBLE" },
    { env: { ...base(), SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role" }) }, code: "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE" },
    { env: { ...base(), SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: project, role: "authenticated" }) }, code: "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE" },
    { env: { ...base(), SUPABASE_SERVICE_ROLE_KEY: jwt({ ref: "foreign", role: "service_role" }) }, code: "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE" },
    { env: { ...base(), SUPABASE_SERVICE_ROLE_KEY: "abc.invalid_json.sig" }, code: "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE" },
    { env: base(), envThrows: true, code: "QA_RETENTION_CONFIGURATION_READ_FAILED" },
    { env: base(), constructorThrows: true, code: "QA_RETENTION_CONSTRUCTOR_FAILED" },
  ];
  for (const fixture of cases) await entrypoint(fixture.env, async (handler, logs, calls) => {
    assert.deepEqual(logs, [{ event: "qa_avatar_retention_bootstrap", code: fixture.code }]);
    for (const method of ["GET", "POST", "POST"]) {
      const response = await handler(request(method, { authorization: `Bearer ${key}` }));
      assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { status: "unavailable" });
    }
    assert.equal(logs.length, 1); assert.equal(calls(), 0);
    assert.doesNotMatch(JSON.stringify(logs), /synthetic_signature|synthetic-error|personal\.invalid|SUPABASE_SERVICE_ROLE_KEY|ref|stack/);
  }, fixture);
});

test("valid bootstrap stays quiet and retains method, bearer, Origin and environment-drift gates", async () => {
  const env = base();
  await entrypoint(env, async (handler, logs, calls) => {
    assert.equal((await handler(request())).status, 405);
    assert.equal((await handler(request("POST"))).status, 401);
    assert.equal((await handler(request("POST", { authorization: "Bearer wrong" }))).status, 401);
    assert.equal((await handler(request("POST", { authorization: `Bearer ${key}`, origin: "https://personal.invalid" }))).status, 401);
    const body = new Request(`${origin}/functions/v1/touchline-avatar-retention`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: "{}" });
    assert.equal((await handler(body)).status, 400);
    env.TOUCHLINE_QA_AVATAR_RETENTION_ENABLED = "false";
    assert.equal((await handler(request())).status, 405);
    const drift = await handler(request("POST", { authorization: `Bearer ${key}` }));
    assert.equal(drift.status, 503); assert.deepEqual(await drift.json(), { status: "unavailable" });
    assert.deepEqual(logs, []); assert.equal(calls(), 0);
  });
});

test("a logging failure cannot change unavailable response or initiate transport", async () => {
  await entrypoint({}, async (handler, _logs, calls) => {
    const response = await handler(request()); assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable" }); assert.equal(calls(), 0);
  }, { loggerThrows: true });
});

test("shared diagnostic and server admit the same exact origin/JWT binding, including rejecting ref-less builtins", async () => {
  const configurations = [
    [origin, key, null], [origin + "/", key, "QA_RETENTION_ORIGIN_INCOMPATIBLE"],
    [origin, key + " ", "QA_RETENTION_KEY_FORMAT_INCOMPATIBLE"], [origin, "x".repeat(4097), "QA_RETENTION_KEY_FORMAT_INCOMPATIBLE"],
    [origin, jwt({ role: "service_role" }), "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE"],
    [origin, jwt(null), "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE"], [origin, jwt([]), "QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE"],
  ] as const;
  for (const [supabaseOrigin, serviceRoleKey, failure] of configurations) {
    assert.equal(avatarRetentionConfigurationFailure(supabaseOrigin, serviceRoleKey), failure);
    const handler = createAvatarRetentionServer({ enabled: true, supabaseOrigin, serviceRoleKey, assertEnvironment() {} }, {
      rpc: async () => { throw Error("unexpected RPC"); }, fetchImpl: async () => { throw Error("unexpected fetch"); },
    });
    assert.equal((await handler(request())).status, failure === null ? 405 : 503);
  }
});
