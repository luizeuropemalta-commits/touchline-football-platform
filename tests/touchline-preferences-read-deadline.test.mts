import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/api/notifications/preferences/route.ts", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
const compiled = ts.transpileModule(`${source}\n({ GET })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = async () => { for (let index = 0; index < 16; index++) await Promise.resolve(); };
function deferred() { let resolve!: (value: unknown) => void; const promise = new Promise(resolveValue => { resolve = resolveValue; }); return { promise, resolve }; }
const auth = { data: { user: { id: "owner" } }, error: null };
function harness(stage?: "client" | "auth" | "query", authValue: unknown = auth) {
  const pending = deferred();
  const calls = { clients: 0, auth: 0, reads: 0 };
  let expire = () => {};
  let cleared = false;
  let readSignal: AbortSignal | undefined;
  const query = {
    select() { return query; }, eq(key: string, value: string) { assert.equal(key, "user_id"); assert.equal(value, "owner"); return query; },
    abortSignal(signal: AbortSignal) { readSignal = signal; return query; },
    maybeSingle() { calls.reads++; return stage === "query" ? pending.promise : Promise.resolve({ data: null, error: null }); },
  };
  const client = { auth: { getUser: () => { calls.auth++; return stage === "auth" ? pending.promise : Promise.resolve(authValue); } },
    from(table: string) { assert.equal(table, "notification_preferences"); return query; } };
  const api = runInNewContext(compiled, {
    AbortController,
    setTimeout(callback: () => void, delay: number) { assert.equal(delay, 8000); expire = callback; return 1; },
    clearTimeout(id: number) { assert.equal(id, 1); cleared = true; },
    createClient() { calls.clients++; return stage === "client" ? pending.promise : Promise.resolve(client); },
    hasTouchLineArenaAccess: (user: unknown) => Boolean(user),
    NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
  });
  return { get: api.GET as (request?: Request) => Promise<Response>, calls, expire: () => expire(), cleared: () => cleared,
    signal: () => readSignal, finish: () => pending.resolve(stage === "client" ? client : stage === "auth" ? auth : { data: null, error: null }) };
}

for (const stage of ["client", "auth", "query"] as const) {
  test(`preferences GET bounds ${stage} and rejects late continuation without further reads`, async () => {
    const h = harness(stage);
    const response = h.get(); await tick();
    h.expire();
    const result = await response;
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { ok: false, error: "Preferences unavailable." });
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(result.headers.get("CDN-Cache-Control"), "no-store");
    const before = { ...h.calls };
    h.finish(); await tick();
    assert.deepEqual(h.calls, before, "expired read never resumes the next stage");
    assert.equal(h.cleared(), true);
    if (stage === "query") assert.equal(h.signal()?.aborted, true);
    else assert.equal(h.calls.reads, 0);
  });
}

test("preferences GET cancellation stops before work or aborts the running query", async () => {
  for (const alreadyAborted of [false, true]) {
    const h = harness("query"), controller = new AbortController();
    if (alreadyAborted) controller.abort();
    const result = h.get(new Request("https://local.test/preferences", { signal: controller.signal }));
    await tick(); controller.abort();
    assert.equal((await result).status, 503);
    assert.equal(h.cleared(), true);
    if (alreadyAborted) assert.deepEqual(h.calls, { clients: 0, auth: 0, reads: 0 });
    else assert.equal(h.signal()?.aborted, true);
    h.finish(); await tick();
  }
});

test("preferences GET distinguishes absent session from authentication outage", async () => {
  for (const [error, status] of [[null, 401], [{ name: "AuthSessionMissingError" }, 401], [{ status: 401 }, 503],
    [{ status: 403 }, 503], [{ status: 500, message: "PRIVATE_AUTH_DETAIL" }, 503], [{ name: "AuthRetryableFetchError" }, 503]] as const) {
    const h = harness(undefined, { data: { user: null }, error });
    const result = await h.get();
    assert.equal(result.status, status);
    assert.equal(h.calls.reads, 0);
    assert.equal(h.cleared(), true);
    assert.doesNotMatch(await result.text(), /PRIVATE_AUTH_DETAIL/);
  }
});

test("preferences GET success clears its budget and preserves unconsented defaults", async () => {
  const h = harness();
  const result = await h.get();
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.data.accountId, "owner");
  assert.equal(body.data.gameLocale, null);
  assert.equal(body.data.gameLocaleRevision, "0");
  assert.equal(body.data.channels.push, false);
  assert.equal(h.cleared(), true);
  assert.equal(h.signal()?.aborted, true);
  assert.deepEqual(h.calls, { clients: 1, auth: 1, reads: 1 });
});

test("preferences GET rejects a populated identity without an explicit error-free auth receipt", async () => {
  for (const error of [undefined, false, "", {}]) {
    const h = harness(undefined, { data: { user: { id: "owner" } }, error });
    assert.equal((await h.get()).status, 503);
    assert.equal(h.calls.reads, 0);
  }
});
