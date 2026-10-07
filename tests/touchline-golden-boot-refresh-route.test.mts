import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

const secret = "x".repeat(48);
function harness(env: Record<string, string> = {}) {
  const logs: unknown[][] = [];
  const state = { clients: 0, runs: 0, providers: 0, fail: false, configured: true, invokeProvider: false,
    result: { status: "stored", reason: null, leaderCount: 1, publicAwardEligible: false,
      providerQuota: { private: "PRIVATE provider sentinel" } } as Record<string, unknown> };
  const admin = {};
  const imports: Record<string, unknown> = {
    "node:crypto": crypto,
    "next/server": { NextResponse: Response },
    "@/lib/supabase/admin": { createAdminClient() {
      state.clients++; if (state.fail) throw Error("PRIVATE database sentinel");
      return state.configured ? admin : null;
    } },
    "@/lib/football-data/fixture-provider-server": { createGuardedFixtureProvider(client: unknown) { assert.equal(client, admin); state.providers++; return {}; } },
    "@/lib/touchlineArena/golden-boot-producer": { async produceGoldenBootSnapshot(input: Record<string, unknown>) {
      state.runs++; assert.equal(input.admin, admin); assert.equal(typeof input.createProvider, "function");
      assert.equal(state.providers, 0, "provider creation belongs after durable admission inside producer");
      if (state.invokeProvider) (input.createProvider as () => unknown)();
      return state.result;
    } },
  };
  const source = readFileSync(new URL("../app/api/touchline-awards/golden-boot/refresh/route.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInThisContext(`(function(exports,require,process,console){${js}\n})`)(exports, (key: string) => {
    assert.ok(Object.hasOwn(imports, key), key); return imports[key];
  }, { env }, { warn: (...args: unknown[]) => logs.push(args) });
  return { state, exports, logs,
    post: (authorization = `Bearer ${secret}`) => (exports.POST as (request: Request) => Promise<Response>)(
      new Request("https://example.test/api/touchline-awards/golden-boot/refresh", { method: "POST", headers: { authorization } })),
    get: exports.GET as () => Response,
  };
}
const enabled = { TOUCHLINE_GOLDEN_BOOT_REFRESH_ENABLED: "true", TOUCHLINE_GOLDEN_BOOT_REFRESH_SECRET: secret };

test("admitted producer receives only the guarded factory bound to the same admin", async () => {
  const h=harness(enabled); h.state.invokeProvider=true;
  assert.equal((await h.post()).status,200);
  assert.equal(h.state.providers,1); assert.equal(h.state.clients,1);
});
function privateResponse(response: Response) {
  for (const key of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"])
    assert.match(response.headers.get(key) ?? "", /no-store/);
}

test("refresh defaults off without creating a database client or provider", async () => {
  for (const flag of [undefined, "false", "TRUE", "1"]) {
    const h = harness({ ...enabled, TOUCHLINE_GOLDEN_BOOT_REFRESH_ENABLED: flag as string });
    const response = await h.post(); assert.equal(response.status, 503); privateResponse(response);
    assert.equal(h.state.clients, 0); assert.equal(h.state.runs, 0);
  }
});

test("failed refresh logs one allowlisted diagnostic without changing the public response", async () => {
  const h = harness(enabled);
  h.state.result = { ...h.state.result, status: "unavailable", reason: "PROVIDER_UNAVAILABLE",
    diagnostic: { phase: "stages", category: "provider_error", httpStatus: 403, elapsedMs: 21,
      message: "PRIVATE api_token=sentinel", details: { token: secret }, playerId: "PRIVATE UUID" } };
  const response = await h.post();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, status: "unavailable" });
  assert.equal(h.logs.length, 1);
  const serialized = JSON.stringify(h.logs);
  assert.doesNotMatch(serialized, /PRIVATE|sentinel|api_token|playerId|details/);
  assert.equal(serialized.includes(secret), false);
  assert.match(serialized, /stages/); assert.match(serialized, /provider_error/);
  assert.match(serialized, /403/); assert.match(serialized, /21/);
  assert.equal(h.state.runs, 1);
});

test("successful or denied refresh emits no provider diagnostic", async () => {
  for (const status of ["stored", "skipped"]) {
    const h = harness(enabled); h.state.result.status = status;
    await h.post(); assert.deepEqual(h.logs, []);
  }
  const h = harness(enabled); await h.post("Bearer invalid"); assert.deepEqual(h.logs, []);
});

test("route rejects malformed diagnostic enums, status and elapsed rather than logging raw values", async () => {
  for (const elapsedMs of [-1, 45_001, Infinity, "PRIVATE elapsed sentinel"]) {
    const h = harness(enabled);
    h.state.result = { ...h.state.result, status: "unavailable", reason: "PRIVATE reason sentinel",
      diagnostic: { phase: "PRIVATE phase sentinel", category: "PRIVATE category sentinel", httpStatus: 999, elapsedMs } };
    assert.equal((await h.post()).status, 502);
    assert.equal(h.logs.length, 1);
    assert.deepEqual(JSON.parse(String(h.logs[0]![0])), {
      event: "golden_boot_refresh_failure", status: "unavailable", reason: null,
      phase: null, category: null, httpStatus: null, elapsedMs: null,
    });
  }
});
test("only exact dedicated bearer authority can invoke refresh", async () => {
  for (const authorization of ["", "Bearer undefined", `Basic ${secret}`, `Bearer ${secret}x`,
    `Bearer ${"é".repeat(secret.length)}`, `Bearer ${"y".repeat(secret.length)}`]) {
    const h = harness(enabled); const response = await h.post(authorization);
    assert.equal(response.status, 401); privateResponse(response);
    assert.equal(h.state.clients, 0); assert.equal(h.state.runs, 0);
  }
  for (const configured of ["", "short"]) {
    const h = harness({ ...enabled, TOUCHLINE_GOLDEN_BOOT_REFRESH_SECRET: configured });
    assert.equal((await h.post(`Bearer ${configured}`)).status, 401); assert.equal(h.state.clients, 0);
  }
});
test("GET cannot refresh; hosting execution is finite", async () => {
  const h = harness(enabled); const response = h.get();
  assert.equal(response.status, 405); assert.equal(response.headers.get("Allow"), "POST");
  privateResponse(response); assert.equal(h.state.runs, 0);
  assert.equal(h.exports.maxDuration, 45); assert.equal(h.exports.runtime, "nodejs");
  assert.equal(h.exports.dynamic, "force-dynamic");
});
test("trusted refresh calls the canonical producer once and returns no private evidence", async () => {
  for (const [status, expected] of [["stored", 200], ["skipped", 200], ["unavailable", 502], ["unconfirmed", 503]] as const) {
    const h = harness(enabled); h.state.result.status = status;
    const response = await h.post(); assert.equal(response.status, expected); privateResponse(response);
    assert.deepEqual(await response.json(), { ok: expected === 200, status });
    assert.equal(h.state.clients, 1); assert.equal(h.state.runs, 1);
  }
});
test("configuration exceptions and absent clients are sanitized", async () => {
  for (const fail of [true, false]) {
    const h = harness(enabled); h.state.fail = fail; h.state.configured = false;
    const response = await h.post(); assert.equal(response.status, 503); privateResponse(response);
    assert.doesNotMatch(await response.text(), /PRIVATE|sentinel/); assert.equal(h.state.runs, 0);
  }
});
