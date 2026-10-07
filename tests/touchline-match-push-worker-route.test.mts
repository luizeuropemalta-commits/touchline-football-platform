import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

const secret = "s".repeat(48);
const policy = { eventSyncedAt: 60000, settlementSyncedAt: 60000, fixtureUpdatedAt: 60000, lastObservedAt: 60000 };
const enabled = {
  TOUCHLINE_MATCH_PUSH_WORKER_ENABLED: "true", TOUCHLINE_MATCH_PUSH_WORKER_SECRET: secret,
  TOUCHLINE_MATCH_PUSH_SOURCE_AGE_POLICY: JSON.stringify(policy),
  NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: "public-test", TOUCHLINE_WEB_PUSH_PRIVATE_KEY: "private-test",
  TOUCHLINE_WEB_PUSH_SUBJECT: "mailto:qa@example.test",
};
function harness(env: Record<string, string | undefined> = enabled) {
  const state = { calls: 0, fail: false, result: { status: "idle" } as Record<string, unknown>, input: null as unknown };
  const imports: Record<string, unknown> = {
    "node:crypto": crypto, "next/server": { NextResponse: Response },
    "@/lib/touchlineArena/match-push-worker-server": { async runMatchPushWorker(input: unknown) {
      state.calls++; state.input = input;
      if (state.fail) throw Error("PRIVATE sentinel");
      return state.result;
    } },
  };
  const source = readFileSync(new URL("../app/api/notifications/match-push/dispatch/route.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInThisContext(`(function(exports,require,process){${js}\n})`)(exports, (name: string) => {
    assert.ok(Object.hasOwn(imports, name), name); return imports[name];
  }, { env });
  return { state, exports, post: (authorization = `Bearer ${secret}`) =>
    (exports.POST as (r: Request) => Promise<Response>)(new Request("https://example.test/api/notifications/match-push/dispatch?enabled=true", {
      method: "POST", headers: { authorization }, body: JSON.stringify({ locale: "pt-BR", maximumAgeMs: 99999999 }),
    })), get: exports.GET as () => Response };
}
function noStore(response: Response) {
  for (const header of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"]) assert.match(response.headers.get(header) ?? "", /no-store/);
}
test("push worker defaults off and GET cannot send", async () => {
  for (const value of [undefined, "false", "TRUE", "1"]) {
    const h = harness({ ...enabled, TOUCHLINE_MATCH_PUSH_WORKER_ENABLED: value });
    assert.equal((await h.post()).status, 503); assert.equal(h.state.calls, 0);
  }
  const h = harness(); const response = h.get();
  assert.equal(response.status, 405); assert.equal(response.headers.get("Allow"), "POST"); noStore(response);
  assert.equal(h.state.calls, 0); assert.equal(h.exports.maxDuration, 30);
});
test("push worker requires exact dedicated bearer before reading configuration or invoking work", async () => {
  for (const auth of ["", "Bearer undefined", `Basic ${secret}`, `Bearer ${"é".repeat(48)}`, `Bearer ${"x".repeat(48)}`]) {
    const h = harness(); const response = await h.post(auth);
    assert.equal(response.status, 401); noStore(response); assert.equal(h.state.calls, 0);
  }
  for (const value of ["", "short", "x".repeat(513)]) {
    const h = harness({ ...enabled, TOUCHLINE_MATCH_PUSH_WORKER_SECRET: value });
    assert.equal((await h.post(`Bearer ${value}`)).status, 401); assert.equal(h.state.calls, 0);
  }
});
test("worker uses server policy and VAPID only; returns bounded acknowledgements", async () => {
  for (const [result, code, status] of [
    [{ status: "idle" }, 200, "idle"], [{ status: "processed", outcome: "provider_accepted" }, 200, "processed"],
    [{ status: "processed", outcome: "uncertain" }, 503, "unconfirmed"],
    [{ status: "processed", outcome: "receipt-unconfirmed" }, 503, "unconfirmed"],
    [{ status: "processed", outcome: "expired" }, 503, "unconfirmed"],
    [{ status: "processed", outcome: "reservation-unconfirmed" }, 503, "unconfirmed"],
    [{ status: "processed", outcome: "reservation-not-granted" }, 503, "unconfirmed"],
    [{ status: "processed", outcome: "cancelled" }, 200, "processed"],
    [{ status: "processed", outcome: "failed" }, 200, "processed"],
    [{ status: "unconfigured" }, 503, "unconfigured"],
  ] as const) {
    const h = harness(); h.state.result = { ...result, private: "PRIVATE sentinel" };
    const response = await h.post(); assert.equal(response.status, code); noStore(response);
    assert.deepEqual(await response.json(), { ok: code === 200, status });
    assert.equal(h.state.calls, 1);
    assert.deepEqual(h.state.input, { enabled: true, maximumAgeMs: policy,
      vapid: { publicKey: "public-test", privateKey: "private-test", subject: "mailto:qa@example.test" } });
  }
});
test("absent or malformed policy and exceptions do not expose private details", async () => {
  for (const value of [undefined, "", "{", "x".repeat(1025)]) {
    const h = harness({ ...enabled, TOUCHLINE_MATCH_PUSH_SOURCE_AGE_POLICY: value });
    const response = await h.post(); assert.equal(response.status, 503); assert.equal(h.state.calls, 0); noStore(response);
  }
  const h = harness(); h.state.fail = true;
  const response = await h.post(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE|sentinel/);
});
