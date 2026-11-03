import assert from "node:assert/strict";
import test from "node:test";
import { createAvatarRetentionScheduler } from "../lib/touchlineArena/club-owner-avatar-retention-scheduler.ts";
const origin = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const key = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ref: "xgxbwqxjssxxuihuwmgy", role: "service_role" })).toString("base64url")}.synthetic`;
const secret = "a".repeat(43);
const config = { enabled: true, supabaseOrigin: origin, serviceRoleKey: key, triggerSecret: secret, assertEnvironment() {} };
const request = (body = "{}", token = secret) => new Request("https://qa.invalid/touchline-avatar-retention-scheduler", { method: "POST", headers: { "content-type": "application/json", "x-touchline-avatar-retention-secret": token }, body });
test("pg_net empty JSON forwards exactly one fixed bodyless authenticated worker call", async () => {
  let count = 0;
  const handler = createAvatarRetentionScheduler(config, async (url, options) => {
    count++;
    assert.equal(url, `${origin}/functions/v1/touchline-avatar-retention`);
    assert.equal(options?.method, "POST");
    assert.equal(options?.body, undefined);
    assert.equal(options?.redirect, "error");
    assert.deepEqual(options?.headers, { authorization: `Bearer ${key}` });
    return Response.json({ secret: "upstream diagnostic must not escape" });
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "processed" });
  assert.equal(count, 1);
});
test("unauthorized, injected, oversized and malformed calls never reach worker", async () => {
  let count = 0;
  const handler = createAvatarRetentionScheduler(config, async () => { count++; return new Response(); });
  for (const input of [request("{}", "wrong"), request('{"target":"foreign"}'), request("[]"), request("null"), request(" ".repeat(33)), request('{"age":0}'), new Request("https://qa.invalid/touchline-avatar-retention-scheduler")]) {
    assert.notEqual((await handler(input)).status, 200);
  }
  assert.equal(count, 0);
});
test("disabled, missing secret, invalid QA binding and environment drift fail closed", async () => {
  for (const change of [{ enabled: false }, { triggerSecret: "" }, { supabaseOrigin: "https://foreign.supabase.co" }, { serviceRoleKey: "" }, { assertEnvironment() { throw Error("private diagnostic"); } }]) {
    let count = 0;
    const handler = createAvatarRetentionScheduler({ ...config, ...change }, async () => { count++; return new Response(); });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.equal(count, 0);
    assert.equal(await response.text(), '{"status":"unavailable"}');
  }
});
test("failed worker response and thrown upstream failure have no automatic retry", async () => {
  for (const mode of ["status", "throw"]) {
    let count = 0;
    const handler = createAvatarRetentionScheduler(config, async () => { count++; if (mode === "throw") throw Error(key); return new Response(key, { status: 503 }); });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.equal(await response.text(), '{"status":"unavailable"}');
    assert.equal(count, 1);
  }
});
test("concurrent adapter request is rejected until upstream settles", async () => {
  let resolve!: (response: Response) => void;
  let started!: () => void;
  const ready = new Promise<void>(r => { started = r; });
  const handler = createAvatarRetentionScheduler(config, async () => { started(); return await new Promise<Response>(r => { resolve = r; }); });
  const first = handler(request());
  await ready;
  assert.equal((await handler(request())).status, 503);
  resolve(new Response());
  assert.equal((await first).status, 200);
});
test("Origin, query and wrong media type are rejected without forwarding", async () => {
  let calls = 0;
  const handler = createAvatarRetentionScheduler(config, async () => { calls++; return new Response(); });
  for (const [change, expected] of [
    [{ origin: "https://foreign.invalid" }, 401],
    [{ "content-type": "text/plain" }, 400],
  ] as const) {
    const input = request();
    for (const [name, value] of Object.entries(change)) input.headers.set(name, value);
    assert.equal((await handler(input)).status, expected);
  }
  const input = request();
  assert.equal((await handler(new Request(input.url + "?target=other", input))).status, 400);
  assert.equal(calls, 0);
});
test("slow request stream times out, is cancelled and releases reader without worker call", async () => {
  let cancelled = false, calls = 0;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const input = new Request(request().url, { method: "POST", headers: request().headers, body: stream, duplex: "half" } as RequestInit);
  const handler = createAvatarRetentionScheduler(config, async () => { calls++; return new Response(); });
  assert.equal((await handler(input)).status, 503);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
  assert.equal(calls, 0);
});

test("real scheduler entrypoint preserves explicit authority, fallback and drift gates", async () => {
  type Handler = (request: Request) => Promise<Response>;
  const globals = globalThis as typeof globalThis & { Deno?: { env: { get(name: string): string | undefined }; serve(handler: Handler): void } };
  const previous = { deno: globals.Deno, fetch: globals.fetch };
  const explicit = "TOUCHLINE_QA_AVATAR_RETENTION_SERVICE_ROLE_KEY";
  let serial = 0;
  try {
    for (const fixture of [undefined, key, "", "invalid", "foreign.jwt.signature"]) {
      const env: Record<string, string | undefined> = {
        SUPABASE_URL: origin, SUPABASE_SERVICE_ROLE_KEY: key,
        TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_SECRET: secret,
        TOUCHLINE_QA_AVATAR_RETENTION_SCHEDULER_ENABLED: "true", [explicit]: fixture,
      };
      let handler: Handler | undefined, calls = 0;
      globals.Deno = { env: { get(name) { return env[name]; } }, serve(value) { handler = value; } };
      globals.fetch = async (_, options) => { calls++; assert.deepEqual(options?.headers, { authorization: `Bearer ${key}` }); return new Response(); };
      await import(new URL(`../supabase/functions/touchline-avatar-retention-scheduler/index.ts?scheduler=${serial++}`, import.meta.url).href);
      assert.ok(handler);
      const valid = fixture === undefined || fixture === key;
      assert.equal((await handler(request())).status, valid ? 200 : 503);
      assert.equal(calls, valid ? 1 : 0);
      env[explicit] = fixture === undefined ? key : undefined;
      assert.equal((await handler(request())).status, 503);
      assert.equal(calls, valid ? 1 : 0);
    }
  } finally {
    globals.fetch = previous.fetch;
    if (previous.deno === undefined) delete globals.Deno; else globals.Deno = previous.deno;
  }
});
