import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as vapidParser from "../lib/touchlineArena/match-push-vapid-config.ts";

const secret = "s".repeat(48);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const curve = crypto.createECDH("prime256v1"); curve.setPrivateKey(Buffer.alloc(32, 1));
const vapid = { publicKey: curve.getPublicKey().toString("base64url"), privateKey: Buffer.alloc(32, 1).toString("base64url"), subject: "mailto:qa@example.test" };
const configured = {
  TOUCHLINE_LINEUP_REMINDER_WORKER_ENABLED: "true",
  TOUCHLINE_LINEUP_REMINDER_WORKER_SECRET: secret,
  TOUCHLINE_LINEUP_REMINDER_LOCALE: "en-GB",
  TOUCHLINE_LINEUP_REMINDER_MAXIMUM_AGE_MS: "30000",
  TOUCHLINE_LINEUP_REMINDER_LEASE_SECONDS: "60",
  TOUCHLINE_LINEUP_REMINDER_COMPETITION_ID: id(1),
  TOUCHLINE_LINEUP_REMINDER_SEASON_ID: id(2),
  TOUCHLINE_LINEUP_REMINDER_LEAD_SECONDS: "7200",
  TOUCHLINE_LINEUP_REMINDER_PAGE_SIZE: "10",
  TOUCHLINE_LINEUP_REMINDER_RETRY_SECONDS: "60",
  NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY: vapid.publicKey,
  TOUCHLINE_WEB_PUSH_PRIVATE_KEY: vapid.privateKey,
  TOUCHLINE_WEB_PUSH_SUBJECT: vapid.subject,
};
const admissionReceipt = { status: "complete", scanned: 0, inserted: 0, processed: 0, deferred: 0, discoveryBusy: 0,
  stored: 0, closed: 0, sweep: "2", sweepCompleted: true };
function harness(env: Record<string, string | undefined> = configured) {
  const state = { calls: 0, fail: false, input: null as unknown, result: { status: "idle" } as Record<string, unknown>,
    admissionCalls: 0, admissionInput: null as unknown, admissionResult: admissionReceipt as unknown,
    admissionThrows: false, admissionPending: false, order: [] as string[] };
  let resolveAdmission!: (value: unknown) => void;
  const admissionPending = new Promise<unknown>(resolve => { resolveAdmission = resolve; });
  const imports: Record<string, unknown> = {
    "node:crypto": crypto,
    "@/lib/touchlineArena/match-push-vapid-config": vapidParser,
    "@/lib/touchlineFantasy/lineup-reminder-admission-server": { async runLineupReminderAdmission(input: unknown) {
      state.admissionCalls++; state.admissionInput = input; state.order.push("admission");
      if (state.admissionThrows) throw Error("PRIVATE database recipient details");
      return state.admissionPending ? admissionPending : state.admissionResult;
    } },
    "@/lib/touchlineFantasy/lineup-reminder-worker-server": { async runLineupReminderWorker(input: unknown) {
      state.calls++; state.input = input; state.order.push("worker");
      if (state.fail) throw Error("PRIVATE recipient device token");
      return state.result;
    } },
  };
  const source = readFileSync(new URL("../app/api/notifications/lineup-reminders/dispatch/route.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInThisContext(`(function(exports,require,process){${js}\n})`)(exports, (name: string) => {
    assert.ok(Object.hasOwn(imports, name), name); return imports[name];
  }, { env });
  return { state, resolveAdmission, get: exports.GET as () => Response,
    post: (authorization = `Bearer ${secret}`) => (exports.POST as (r: Request) => Promise<Response>)(
      new Request("https://example.test/api/notifications/lineup-reminders/dispatch?enabled=true&locale=pt-BR", {
        method: "POST", headers: { authorization }, body: JSON.stringify({ userId: "injected", maximumAgeMs: 999999, locale: "pt-BR",
          competitionId: id(8), seasonId: id(9), leadSeconds: 1, pageSize: 50, retrySeconds: 1 }),
      })),
  };
}
function privateResponse(response: Response) {
  for (const key of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"]) assert.match(response.headers.get(key) ?? "", /no-store/);
}
test("reminder route stays off and GET never processes a queue", async () => {
  for (const enabled of [undefined, "false", "TRUE", "1"]) {
    const h = harness({ ...configured, TOUCHLINE_LINEUP_REMINDER_WORKER_ENABLED: enabled });
    const response = await h.post(); assert.equal(response.status, 503); privateResponse(response); assert.equal(h.state.calls, 0); assert.equal(h.state.admissionCalls, 0);
  }
  const h = harness(); const response = h.get(); assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST"); privateResponse(response); assert.equal(h.state.calls, 0); assert.equal(h.state.admissionCalls, 0);
});
test("dedicated exact bearer is required before queue access", async () => {
  for (const auth of ["", `Basic ${secret}`, `Bearer ${"x".repeat(48)}`, `Bearer ${"é".repeat(48)}`]) {
    const h = harness(); const response = await h.post(auth); assert.equal(response.status, 401); privateResponse(response); assert.equal(h.state.calls, 0); assert.equal(h.state.admissionCalls, 0);
  }
  for (const value of [undefined, "", "short", "x".repeat(513)]) {
    const h = harness({ ...configured, TOUCHLINE_LINEUP_REMINDER_WORKER_SECRET: value });
    assert.equal((await h.post()).status, 401); assert.equal(h.state.calls, 0); assert.equal(h.state.admissionCalls, 0);
  }
});
test("freshness, lease and admission require explicit canonical server values", async () => {
  for (const [key, values] of [
    ["TOUCHLINE_LINEUP_REMINDER_MAXIMUM_AGE_MS", [undefined, "", "0", "-1", "1e5", " 30000", "030000", "9007199254740992"]],
    ["TOUCHLINE_LINEUP_REMINDER_LEASE_SECONDS", [undefined, "", "0", "61", "1.5"]],
    ["TOUCHLINE_LINEUP_REMINDER_COMPETITION_ID", [undefined, "", "bad", ` ${id(1)}`, "00000000-0000-7000-8000-000000000001"]],
    ["TOUCHLINE_LINEUP_REMINDER_SEASON_ID", [undefined, "", "bad", "00000000-0000-4000-0000-000000000001"]],
    ["TOUCHLINE_LINEUP_REMINDER_LEAD_SECONDS", [undefined, "", "0", "86401", "1.5", "01"]],
    ["TOUCHLINE_LINEUP_REMINDER_PAGE_SIZE", [undefined, "", "0", "51", "1e1", " 10"]],
    ["TOUCHLINE_LINEUP_REMINDER_RETRY_SECONDS", [undefined, "", "0", "3601", "-1"]],
    ["NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY", [undefined, "", "bad"]],
    ["TOUCHLINE_WEB_PUSH_PRIVATE_KEY", [undefined, "", "bad"]],
    ["TOUCHLINE_WEB_PUSH_SUBJECT", [undefined, "", "bad"]],
  ] as const) {
    for (const value of values) {
      const h = harness({ ...configured, [key]: value });
      const response = await h.post(); assert.equal(response.status, 503); privateResponse(response); assert.equal(h.state.calls, 0); assert.equal(h.state.admissionCalls, 0);
    }
  }
});
test("deployment locale is neither a prerequisite nor forwarded as recipient authority", async () => {
  for (const locale of [undefined, "", "unknown", "pt-BR", "ar-SA"]) {
    const h = harness({ ...configured, TOUCHLINE_LINEUP_REMINDER_LOCALE: locale });
    const response = await h.post(); assert.equal(response.status, 200); privateResponse(response);
    assert.equal(h.state.calls, 1); assert.equal(h.state.admissionCalls, 1);
    assert.deepEqual(h.state.input, { enabled: true, maximumAgeMs: 30000, leaseSeconds: 60, vapid });
  }
});

test("request parameters cannot choose recipient or override policy; responses are sanitized", async () => {
  for (const [result, code, status] of [
    [{ status: "idle" }, 200, "idle"], [{ status: "processed", outcome: "provider_accepted" }, 200, "processed"],
    [{ status: "processed", outcome: "cancelled" }, 200, "processed"], [{ status: "processed", outcome: "failed" }, 200, "processed"],
    [{ status: "processed", outcome: "receipt-unconfirmed" }, 503, "unconfirmed"],
    [{ status: "processed", outcome: "reservation-not-granted" }, 503, "unconfirmed"],
    [{ status: "unconfigured" }, 503, "unconfigured"], [{ status: "unexpected" }, 503, "unconfirmed"],
  ] as const) {
    const h = harness(); h.state.result = { ...result, private: "PRIVATE" };
    const response = await h.post(); assert.equal(response.status, code); privateResponse(response);
    assert.deepEqual(await response.json(), { ok: code === 200, status });
    assert.deepEqual(h.state.input, { enabled: true, maximumAgeMs: 30000, leaseSeconds: 60,
      vapid });
    assert.deepEqual(h.state.admissionInput, { enabled: true, competitionId: id(1), seasonId: id(2), leadSeconds: 7200, pageSize: 10, retrySeconds: 60 });
    assert.deepEqual(h.state.order, ["admission", "worker"]); assert.equal(h.state.admissionCalls, 1);
    assert.equal(h.state.calls, 1);
  }
  const h = harness(); h.state.fail = true; const response = await h.post();
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE|recipient|token/);
});

test("only complete or partial admission may drain the queue", async () => {
  for (const status of ["complete", "partial"]) {
    const h = harness(); h.state.admissionResult = { ...admissionReceipt, status, ...(status === "partial" ? { processed: 1, deferred: 1 } : {}) };
    assert.equal((await h.post()).status, 200);
    assert.deepEqual(h.state.order, ["admission", "worker"]); assert.equal(h.state.admissionCalls, 1); assert.equal(h.state.calls, 1);
  }
  for (const result of [null, undefined, {}, [], { status: "unexpected" }, ...["disabled", "unconfigured", "busy", "unavailable", "policy-mismatch", "unconfirmed"].map(status => ({ status, private: "PRIVATE" }))]) {
    const h = harness(); h.state.admissionResult = result;
    const response = await h.post(); assert.equal(response.status, 503); privateResponse(response);
    assert.deepEqual(await response.json(), { ok: false, status: "unconfirmed" });
    assert.equal(h.state.calls, 0); assert.equal(h.state.admissionCalls, 1);
  }
  const h = harness(); h.state.admissionThrows = true;
  const response = await h.post(); assert.equal(response.status, 503); privateResponse(response);
  assert.deepEqual(await response.json(), { ok: false, status: "unconfirmed" });
  assert.equal(h.state.calls, 0); assert.equal(h.state.admissionCalls, 1);
});

test("admission is awaited and deployment policy/VAPID are captured before it", async () => {
  const env: Record<string, string | undefined> = { ...configured };
  const h = harness(env); h.state.admissionPending = true;
  const pending = h.post(); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(h.state.admissionCalls, 1); assert.equal(h.state.calls, 0);
  env.TOUCHLINE_LINEUP_REMINDER_LOCALE = "pt-BR";
  env.TOUCHLINE_LINEUP_REMINDER_MAXIMUM_AGE_MS = "999999";
  env.TOUCHLINE_LINEUP_REMINDER_LEASE_SECONDS = "1";
  env.TOUCHLINE_LINEUP_REMINDER_COMPETITION_ID = id(8);
  env.TOUCHLINE_LINEUP_REMINDER_SEASON_ID = id(9);
  env.TOUCHLINE_LINEUP_REMINDER_LEAD_SECONDS = "1";
  env.TOUCHLINE_LINEUP_REMINDER_PAGE_SIZE = "50";
  env.TOUCHLINE_LINEUP_REMINDER_RETRY_SECONDS = "1";
  env.NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY = "changed";
  env.TOUCHLINE_WEB_PUSH_PRIVATE_KEY = "changed";
  env.TOUCHLINE_WEB_PUSH_SUBJECT = "mailto:changed@example.test";
  h.resolveAdmission(admissionReceipt);
  assert.equal((await pending).status, 200);
  assert.deepEqual(h.state.input, { enabled: true, maximumAgeMs: 30000, leaseSeconds: 60, vapid });
  assert.deepEqual(h.state.admissionInput, { enabled: true, competitionId: id(1), seasonId: id(2), leadSeconds: 7200, pageSize: 10, retrySeconds: 60 });
  assert.deepEqual(h.state.order, ["admission", "worker"]);
});
