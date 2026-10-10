import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createSportmonksFixtureAuthority } from "../lib/football-data/sportmonks-fixture-authority.ts";

const source = readFileSync(new URL("../lib/football-data/fixture-authority-http-server.ts", import.meta.url), "utf8");
const exports = {} as { createFixtureAuthorityHttpTransport: typeof import("../lib/football-data/fixture-authority-http-server.ts").createFixtureAuthorityHttpTransport };
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, require(name: string) { assert.equal(name, "server-only"); return {}; },
  URL, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout,
});
const create = exports.createFixtureAuthorityHttpTransport;
const config = { url: "https://authority.example/api/internal/football-data/quota", workerToken: "q".repeat(40), accountScope: "shared-account", timeoutMs: 100 };
const args = { p_account_scope: config.accountScope, p_request_id: "fixture-request", p_endpoint: "date", p_attempt: 1, p_budget_ms: 100 };
const failure = (error: Error) => error.message === "Fixture authority unavailable.";
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

test("prepared authority sends one bounded request to its fixed endpoint, without secrets in body", async () => {
  const calls: [string, RequestInit][] = [];
  const call = create(config, async (url: string, init: RequestInit) => { calls.push([url, init]); return json({ allowed: false }); });
  const result = await call("touchline_fixture_quota_admit", args, new AbortController().signal);
  assert.equal(result.allowed, false); assert.equal(calls.length, 1);
  assert.equal(calls[0][0], config.url);
  assert.equal(calls[0][1].redirect, "error"); assert.equal(calls[0][1].cache, "no-store");
  assert.equal(calls[0][1].credentials, "omit");
  assert.equal(new Headers(calls[0][1].headers).get("Authorization"), `Bearer ${config.workerToken}`);
  assert.deepEqual(JSON.parse(String(calls[0][1].body)), { operation: "admit", args });
  assert.ok(!String(calls[0][1].body).includes(config.workerToken));
  await call("touchline_fixture_quota_complete", args, new AbortController().signal);
  assert.equal(JSON.parse(String(calls[1][1].body)).operation, "complete");
});

test("rejects invalid config, unrelated RPCs, substituted scope, huge requests and pre-abort before fetch", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return json({}); };
  for (const delta of [{ url: "http://authority.example/api/internal/football-data/quota" }, { url: config.url + "?token=secret" },
    { url: "https://user:secret@authority.example/api/internal/football-data/quota" }, { url: config.url + "/other" },
    { workerToken: "bad\r\nheader" }, { timeoutMs: 5_001 }, { accountScope: "../other" }]) {
    assert.throws(() => create({ ...config, ...delta }, fetcher), failure);
  }
  const call = create(config, fetcher);
  await assert.rejects(call("delete_all", args, new AbortController().signal), failure);
  await assert.rejects(call("touchline_fixture_quota_admit", { ...args, p_account_scope: "other" }, new AbortController().signal), failure);
  await assert.rejects(call("touchline_fixture_quota_admit", { ...args, extra: "x".repeat(9_000) }, new AbortController().signal), failure);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(call("touchline_fixture_quota_admit", args, aborted.signal), failure);
  assert.equal(calls, 0);
});

test("HTTP failures and invalid/oversized JSON fail closed, sanitized, with no retry", async () => {
  for (const response of [new Response("secret", { status: 401 }), new Response("secret", { status: 429 }),
    new Response("secret", { status: 503 }), new Response("{}"), json([]), json(null),
    new Response("bad-secret", { headers: { "Content-Type": "application/json" } }), json({ secret: "x".repeat(9_000) })]) {
    let calls = 0;
    const call = create(config, async () => { calls++; return response; });
    await assert.rejects(call("touchline_fixture_quota_admit", args, new AbortController().signal), failure);
    assert.equal(calls, 1);
  }
});

test("deadline and cancellation reject even when fetch ignores abort; late responses never become permission", async () => {
  let finish: (value: Response) => void = () => {};
  let receivedSignal: AbortSignal;
  const call = create({ ...config, timeoutMs: 10 }, (_url: string, init: RequestInit) => {
    receivedSignal = init.signal as AbortSignal;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  await assert.rejects(call("touchline_fixture_quota_admit", args, new AbortController().signal), failure);
  assert.equal(receivedSignal!.aborted, true);
  finish(json({ allowed: true, token: "late" }));
  const controller = new AbortController();
  const pending = call("touchline_fixture_quota_admit", args, controller.signal);
  controller.abort();
  await assert.rejects(pending, failure);
  finish(json({ allowed: true, token: "late" }));
});

test("deadline cancels a response body that never finishes", async () => {
  let canceled = false;
  const call = create({ ...config, timeoutMs: 10 }, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"allowed":')); },
    cancel() { canceled = true; },
  }), { headers: { "Content-Type": "application/json" } }));
  await assert.rejects(call("touchline_fixture_quota_admit", args, new AbortController().signal), failure);
  assert.equal(canceled, true);
});

test("real authority adapter preserves admission and receipt validation through the prepared transport", async () => {
  const requestId = "00000000-0000-4000-8000-000000000001";
  const token = "00000000-0000-4000-8000-000000000002";
  const responses = [{ allowed: true, token }, { persisted: true }, { allowed: true, token: "forged" }];
  const operations: string[] = [];
  const transport = create(config, async (_url: string, init: RequestInit) => {
    operations.push(JSON.parse(String(init.body)).operation);
    return json(responses.shift());
  });
  const port = createSportmonksFixtureAuthority(config.accountScope, transport).createPort({
    accountScope: config.accountScope, entity: "Fixture", endpoint: "inplay", requestId,
  });
  const context = { attempt: 1, remainingBudgetMs: 100, signal: new AbortController().signal };
  assert.deepEqual(await port.beforeAttempt(context), { allowed: true, token });
  assert.deepEqual(await port.afterAttempt({ ...context, token, observation: {
    requestId, attempt: 1, operation: "fixture", observedAt: "2026-10-10T14:00:00.000Z",
    status: 200, requestedEntity: "Fixture", remaining: 100, resetAt: null, cooldownUntil: null,
  } }), { persisted: true });
  await assert.rejects(port.beforeAttempt({ ...context, attempt: 2 }), failure);
  assert.deepEqual(operations, ["admit", "complete", "admit"]);
});
