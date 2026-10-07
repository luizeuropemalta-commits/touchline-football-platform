import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createECDH } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { parseMatchPushVapidConfig } from "../lib/touchlineArena/match-push-vapid-config.ts";
import { normalizeMatchPushSourceAgePolicy, MATCH_PUSH_SOURCE_TIMES } from "../lib/touchlineArena/match-push-source-freshness.ts";

const source = readFileSync(new URL("../lib/touchlineArena/match-push-worker-server.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const curve = createECDH("prime256v1");
curve.setPrivateKey(Buffer.alloc(32, 1));
const vapid = { subject: "mailto:test@example.test", privateKey: Buffer.alloc(32, 1).toString("base64url"), publicKey: curve.getPublicKey().toString("base64url") };
const policy = Object.fromEntries(MATCH_PUSH_SOURCE_TIMES.map(key => [key, 30_000]));
const row = () => ({ id: "11111111-1111-4111-8111-111111111111", lease_token: "22222222-2222-4222-8222-222222222222",
  lease_until: new Date(Date.now() + 60_000).toISOString(), expires_at: new Date(Date.now() + 90_000).toISOString(),
  state: "claimed", payload: { schemaVersion: 1, locale: "pt-BR" }, device_id: "private-device", push_subscription: "private-subscription" });
function harness(response: unknown, mode = "normal") {
  let admins = 0, claims = 0, signal: AbortSignal | undefined;
  let elapsed = 0;
  const calls: unknown[][] = [];
  const timers = new Map<number, () => void>();
  let resolveLate!: (value: unknown) => void;
  let rejectLate!: (error: Error) => void;
  const pending = new Promise((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
  const exports: { runMatchPushWorker?: (options: unknown) => Promise<{ status: string; outcome?: string }> } = {};
  vm.runInNewContext(js, { exports, Date, Error, AbortController, performance: { now: () => elapsed },
    setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 5000); timers.set(1, callback); return 1; },
    clearTimeout: (id: number) => timers.delete(id),
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "./match-push-source-freshness") return { normalizeMatchPushSourceAgePolicy };
      if (name === "./match-push-vapid-config") return { parseMatchPushVapidConfig };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => {
        admins++; if (mode === "factory-throw") throw Error("private factory error");
        if (mode === "no-admin") return null;
        return { rpc: (name: string, args: unknown) => {
          claims++; assert.equal(name, "touchline_claim_match_push_batch"); assert.equal(JSON.stringify(args), '{"p_limit":1}');
          if (mode === "rpc-throw") throw Error("private SQL error");
          return { abortSignal: (value: AbortSignal) => { signal = value; return mode === "late" ? pending : Promise.resolve(response); } };
        } };
      } };
      if (name === "./match-push-single-claim-server") return { dispatchClaimedMatchPush: async (...args: unknown[]) => {
        calls.push(args); if (mode === "dispatch-throw") throw Error("private transport error"); return "provider_accepted";
      } };
      throw Error(`Unexpected import ${name}`);
    },
  });
  return { run: (options: unknown = { enabled: true, maximumAgeMs: policy, vapid }) => exports.runMatchPushWorker!(options), calls,
    counts: () => ({ admins, claims, timers: timers.size }), signal: () => signal,
    timeout: () => { elapsed = 5000; const callback = timers.get(1); assert.ok(callback); callback(); }, resolveLate, rejectLate };
}

test("worker validates disabled/policy/VAPID before any admin or claim", async () => {
  for (const options of [{ enabled: false }, { enabled: true, maximumAgeMs: null, vapid },
    { enabled: true, maximumAgeMs: policy, vapid: { ...vapid, privateKey: "invalid" } }]) {
    const h = harness(null); const result = await h.run(options);
    assert.equal(result.status, options.enabled ? "unconfigured" : "disabled");
    assert.deepEqual(h.counts(), { admins: 0, claims: 0, timers: 0 }); assert.equal(h.calls.length, 0);
  }
});
test("worker claims schema-one items without treating queued locale as authority and preserves exact timestamps", async () => {
  for (const locale of ["pt-BR", "en-GB", "ar-SA", "fr-FR", "unknown", null, undefined]) {
    const item = { ...row(), payload: locale === undefined ? { schemaVersion: 1 } : { schemaVersion: 1, locale } };
    const h = harness({ data: [item], error: null }); const result = await h.run();
    assert.equal(JSON.stringify(result), '{"status":"processed","outcome":"provider_accepted"}');
    assert.equal(JSON.stringify(h.calls[0][0]), JSON.stringify({ id: item.id, leaseToken: item.lease_token, leaseUntil: item.lease_until, expiresAt: item.expires_at }));
    const options = h.calls[0][1] as { locale?: unknown; maximumAgeMs: unknown; vapid: unknown };
    assert.equal(options.locale, undefined, 'dispatcher must obtain locale from fresh account preferences'); assert.deepEqual(options.maximumAgeMs, policy); assert.deepEqual(options.vapid, vapid);
    assert.deepEqual(h.counts(), { admins: 1, claims: 1, timers: 0 }); assert.equal(h.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /private|11111111|22222222/);
  }
});
test("empty is idle; malformed, ambiguous and expired receipts cannot dispatch", async () => {
  const cases = [null, {}, { data: null }, { data: [] , error: { message: "private" } }, { data: [row(), row()] },
    ...[{ id: "bad" }, { lease_token: "bad" }, { state: "queued" }, { lease_until: "invalid" },
      { expires_at: new Date(0).toISOString() }, { lease_until: new Date(0).toISOString() },
      { payload: { schemaVersion: 2, locale: "en-GB" } }, { payload: null }, { payload: {} }, { payload: [] }]
      .map(patch => ({ data: [{ ...row(), ...patch }], error: null }))];
  for (const response of cases) { const h = harness(response); assert.equal((await h.run()).status, "unconfirmed"); assert.equal(h.calls.length, 0); assert.equal(h.counts().claims, 1); assert.equal(h.counts().timers, 0); }
  const h = harness({ data: [], error: null }); assert.equal((await h.run()).status, "idle"); assert.equal(h.calls.length, 0);
});
test("ignored abort and late success/rejection cannot dispatch or retry", async () => {
  for (const reject of [false, true]) {
    const h = harness(null, "late"); const result = h.run(); h.timeout();
    assert.equal((await result).status, "unconfirmed"); assert.equal(h.signal()?.aborted, true);
    if (reject) h.rejectLate(Error("late private error")); else h.resolveLate({ data: [row()], error: null });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.length, 0); assert.deepEqual(h.counts(), { admins: 1, claims: 1, timers: 0 });
  }
});
test("factory, claim and dispatcher failures stay sanitized and never retry", async () => {
  for (const mode of ["factory-throw", "no-admin", "rpc-throw", "dispatch-throw"]) {
    const h = harness({ data: [row()], error: null }, mode); const result = await h.run();
    assert.equal(result.status, mode === "no-admin" ? "unconfigured" : "unconfirmed");
    assert.ok(h.counts().claims <= 1); assert.ok(h.calls.length <= 1); assert.equal(h.counts().timers, 0);
    assert.doesNotMatch(JSON.stringify(result), /private|error|subscription/);
  }
});
