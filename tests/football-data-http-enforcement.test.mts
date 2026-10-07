import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { footballDataFetchJson, type FootballDataAttemptEnforcement, type FootballDataHttpResponse, type FootballDataRetryPolicy } from "../lib/football-data/http.ts";

// Contract-first local type permits running this test against the pre-port module.
type Context = { attempt: number; signal: AbortSignal; remainingBudgetMs: number };
type Port = {
  beforeAttempt(context: Context): unknown;
  afterAttempt(context: Context & { token: string; response: Readonly<FootballDataHttpResponse<{ value: number }>> }): unknown;
};
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const url = new URL("https://sportmonks.test/enforced");
function response(status = 200) {
  return new Response(JSON.stringify({ value: 1 }), { status, headers: { "content-type": "application/json", "retry-after": "0" } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function run(enforcement: Port, options: { signal?: AbortSignal; retry?: FootballDataRetryPolicy; budget?: number; observer?: () => void | Promise<void> } = {}) {
  const init = { provider: "sportmonks" as const, timeoutMs: options.budget ?? 500,
    // Deliberately malformed adapter receipts exercise the runtime boundary.
    enforcement: enforcement as FootballDataAttemptEnforcement<{ value: number }>,
    signal: options.signal, retry: options.retry, onAttemptCompleted: options.observer };
  return footballDataFetchJson<{ value: number }>(url, init);
}
function unavailable(result: FootballDataHttpResponse<unknown>) {
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.equal(result.error, "Football data request enforcement unavailable.");
  assert.equal(result.data, undefined);
  assert.deepEqual([...result.headers], []);
}
const admitted = () => ({ allowed: true, token: "private-token" });
const persisted = () => ({ persisted: true });

test("only an explicit denial before any fetch carries zero-HTTP deferral proof", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(429); };
  const disposition = (value: unknown) => (value as {requestDisposition?: string}).requestDisposition;
  const denied = await run({beforeAttempt: () => ({allowed:false}), afterAttempt:persisted});
  assert.equal(calls,0);
  assert.equal(disposition(denied),"deferred-before-http");
  for (const beforeAttempt of [() => null, () => ({allowed:false,extra:true}), () => {throw Error("uncertain");}]) {
    assert.equal(disposition(await run({beforeAttempt,afterAttempt:persisted})),undefined);
  }
  assert.equal(calls,0);
  const retryDenied = await run({beforeAttempt: ({attempt}) => attempt === 1 ? admitted() : {allowed:false}, afterAttempt:persisted},
    {retry:{maxAttempts:2,totalBudgetMs:500,baseDelayMs:0,maxDelayMs:0}});
  assert.equal(calls,1);
  assert.equal(disposition(retryDenied),undefined,"a denied retry cannot refund the HTTP already started");
  globalThis.fetch = () => {calls++; throw Error("transport started");};
  assert.equal(disposition(await run({beforeAttempt:admitted,afterAttempt:persisted})),undefined);
  globalThis.fetch = async () => response();
  assert.equal(disposition(await run({beforeAttempt:admitted,afterAttempt:()=>({persisted:false})})),undefined);
});

test("admission and persistence are awaited; token and original detached response are handed off only internally", async () => {
  const admission = deferred<unknown>(), completion = deferred<unknown>();
  let calls = 0, observedAt = "", settled = false;
  const order: string[] = [];
  globalThis.fetch = async (_url, init) => {
    calls++; order.push("fetch");
    assert.equal(Object.hasOwn(init ?? {}, "enforcement"), false);
    assert.equal(Object.hasOwn(init ?? {}, "onAttemptCompleted"), false);
    assert.equal(JSON.stringify(init).includes("private-token"), false);
    return response();
  };
  const pending = run({
    beforeAttempt(context) { order.push("before"); assert.equal(context.attempt, 1); assert.ok(context.remainingBudgetMs > 0); return admission.promise; },
    afterAttempt(context) {
      order.push("after"); assert.equal(context.token, "private-token"); assert.equal(context.attempt, 1);
      observedAt = context.response.fetchedAt;
      assert.ok(Number.isFinite(Date.parse(observedAt)));
      context.response.headers.set("PRIVATE", "changed");
      if (context.response.data) context.response.data.value = 999;
      return completion.promise;
    },
  }).then(value => { settled = true; return value; });
  await tick(); assert.equal(calls, 0); assert.equal(settled, false);
  admission.resolve(admitted()); await tick();
  assert.equal(calls, 1); assert.equal(settled, false); assert.deepEqual(order, ["before", "fetch", "after"]);
  completion.resolve(persisted());
  const result = await pending;
  assert.equal(result.ok, true); assert.deepEqual(result.data, { value: 1 });
  assert.equal(result.fetchedAt, observedAt); assert.equal(result.headers.has("PRIVATE"), false);
});

test("denied, malformed or rejected admission never fetches or calls completion", async () => {
  let calls = 0, completions = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  for (const value of [{ allowed: false }, null, {}, { allowed: true }, { allowed: true, token: "" }, { allowed: true, token: "x".repeat(513) }]) {
    unavailable(await run({ beforeAttempt: () => value, afterAttempt: () => { completions++; return persisted(); } }));
  }
  for (const beforeAttempt of [() => { throw Error("PRIVATE SQL ERROR"); }, () => Promise.reject(Error("PRIVATE SQL ERROR"))]) {
    unavailable(await run({ beforeAttempt, afterAttempt: persisted }));
  }
  assert.equal(calls, 0); assert.equal(completions, 0);
});

test("failed persistence replaces even successful HTTP with sanitized unavailable and never retries", async () => {
  for (const afterAttempt of [() => null, () => ({ persisted: false }), () => { throw Error("PRIVATE DB ERROR"); }, () => Promise.reject(Error("PRIVATE DB ERROR"))]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return response(429); };
    unavailable(await run({ beforeAttempt: admitted, afterAttempt }, { retry: { maxAttempts: 3, totalBudgetMs: 500, baseDelayMs: 0 } }));
    assert.equal(calls, 1);
  }
  globalThis.fetch = async () => response(200);
  unavailable(await run({ beforeAttempt: admitted, afterAttempt: () => ({ persisted: false }) }));
});

test("each retry requires persisted previous attempt and a fresh admission; observers stay best-effort", async () => {
  const order: string[] = [];
  let calls = 0;
  globalThis.fetch = async () => { calls++; order.push(`fetch${calls}`); return response(calls === 1 ? 429 : 200); };
  const result = await run({
    beforeAttempt: ({ attempt }) => { order.push(`before${attempt}`); return { allowed: true, token: `token${attempt}` }; },
    afterAttempt: ({ attempt, token }) => { assert.equal(token, `token${attempt}`); order.push(`after${attempt}`); return persisted(); },
  }, { observer: () => Promise.reject(Error("PRIVATE TELEMETRY")), retry: { maxAttempts: 2, totalBudgetMs: 500, baseDelayMs: 0, maxDelayMs: 0 } });
  assert.equal(result.status, 200);
  assert.deepEqual(order, ["before1", "fetch1", "after1", "before2", "fetch2", "after2"]);
  await tick();
  calls = 0;
  unavailable(await run({ beforeAttempt: ({ attempt }) => attempt === 1 ? admitted() : { allowed: false }, afterAttempt: persisted },
    { retry: { maxAttempts: 3, totalBudgetMs: 500, baseDelayMs: 0, maxDelayMs: 0 } }));
  assert.equal(calls, 1);
});

test("total deadline bounds hanging callbacks and observes late rejection without resuming work", async () => {
  for (const phase of ["before", "after"] as const) {
    const callback = deferred<unknown>();
    let calls = 0, callbackSignal: AbortSignal | undefined;
    globalThis.fetch = async () => { calls++; return response(); };
    const result = await run({
      beforeAttempt: context => { if (phase === "before") { callbackSignal = context.signal; return callback.promise; } return admitted(); },
      afterAttempt: context => { callbackSignal = context.signal; return callback.promise; },
    }, { budget: 25 });
    unavailable(result); assert.equal(callbackSignal?.aborted, true); assert.equal(calls, phase === "before" ? 0 : 1);
    callback.reject(Error("PRIVATE LATE REJECTION")); await tick();
    assert.equal(calls, phase === "before" ? 0 : 1);
  }
});

test("external abort before and during callbacks is sanitized and cannot start or resume HTTP", async () => {
  for (const phase of ["pre", "before", "after"] as const) {
    const controller = new AbortController(), callback = deferred<unknown>();
    let calls = 0, callbackSignal: AbortSignal | undefined;
    globalThis.fetch = async () => { calls++; return response(); };
    if (phase === "pre") controller.abort(Error("PRIVATE abort reason"));
    const pending = run({
      beforeAttempt: context => { callbackSignal = context.signal; return phase === "before" ? callback.promise : admitted(); },
      afterAttempt: context => { callbackSignal = context.signal; return callback.promise; },
    }, { signal: controller.signal });
    await tick(); controller.abort(Error("PRIVATE abort reason"));
    unavailable(await pending);
    if (phase !== "pre") assert.equal(callbackSignal?.aborted, true);
    callback.resolve(persisted()); await tick(); assert.equal(calls, phase === "after" ? 1 : 0);
  }
});

test("admission time consumes retry budget; late ignored-abort fetch cannot release success", async () => {
  let calls = 0, clock = 0, completions = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  unavailable(await run({ beforeAttempt: () => { clock = 501; return admitted(); }, afterAttempt: persisted },
    { retry: { maxAttempts: 2, totalBudgetMs: 500, now: () => clock } }));
  assert.equal(calls, 0);
  globalThis.fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 60)); return response(); };
  unavailable(await run({ beforeAttempt: admitted, afterAttempt: () => { completions++; return persisted(); } }, { budget: 20 }));
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(calls, 1); assert.equal(completions, 0);
});

test("absent enforcement preserves ordinary result and nonblocking observer", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  const result = await footballDataFetchJson(url, { provider: "sportmonks", onAttemptCompleted: () => new Promise<void>(() => {}) });
  assert.equal(result.status, 200); assert.equal(calls, 1);
});

test("authority methods and retry budget are captured before the first await", async () => {
  const admission = deferred<unknown>();
  let completions = 0, calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  const port: Port = { beforeAttempt: () => admission.promise, afterAttempt: () => { completions++; return persisted(); } };
  const retry = { totalBudgetMs: 500, maxAttempts: 1 };
  const pending = run(port, { retry });
  port.beforeAttempt = () => { throw Error("replacement must not run"); };
  port.afterAttempt = () => { throw Error("replacement must not run"); };
  retry.totalBudgetMs = 0;
  admission.resolve(admitted());
  assert.equal((await pending).status, 200);
  assert.equal(calls, 1); assert.equal(completions, 1);
});

test("a frozen injected clock cannot disable the real elapsed deadline", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  unavailable(await run({ beforeAttempt: () => new Promise(() => {}), afterAttempt: persisted },
    { retry: { totalBudgetMs: 25, now: () => 42 } }));
  assert.equal(calls, 0);
});

test("completed unsuccessful responses are persisted with their original timestamp before returning", async () => {
  for (const status of [403, 503, 0]) {
    let completions = 0, stamp = "";
    globalThis.fetch = async () => {
      if (status === 0) throw new TypeError("synthetic transport failure");
      return response(status);
    };
    const result = await run({ beforeAttempt: admitted, afterAttempt: ({ response: observed }) => {
      completions++; stamp = observed.fetchedAt;
      assert.equal(observed.status, status); assert.equal(observed.ok, false);
      return persisted();
    } });
    assert.equal(result.status, status); assert.equal(result.ok, false);
    assert.equal(completions, 1); assert.equal(result.fetchedAt, stamp);
  }
});
