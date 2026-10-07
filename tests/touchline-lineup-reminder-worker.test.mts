import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as vapidParser from "../lib/touchlineArena/match-push-vapid-config.ts";
import type * as worker from "../lib/touchlineFantasy/lineup-reminder-worker-server.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = Date.parse("2026-10-02T04:30:00.000Z");
const iso = (offset: number) => new Date(now + offset).toISOString();
const curve = createECDH("prime256v1"); curve.setPrivateKey(Buffer.alloc(32, 1));
const vapid = { subject: "mailto:owner@example.test", publicKey: curve.getPublicKey().toString("base64url"), privateKey: Buffer.alloc(32, 1).toString("base64url") };
const options = { enabled: true, locale: "en-GB", maximumAgeMs: 30_000, leaseSeconds: 30, vapid };
type Response = { data: unknown; error: unknown };
const row = () => ({ id: id(1), state: "queued", created_at: iso(-60_000), expires_at: iso(90_000), lease_token: null as string | null, lease_expires_at: null as string | null, attempt_id: null });
const receipt = () => ({ id: id(1), leaseToken: id(2), leaseUntil: iso(30_000), leaseExpiresAt: iso(30_000), expiresAt: iso(90_000) });
const js = ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/lineup-reminder-worker-server.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  const state = { wall: now, elapsed: 0, admins: 0, noAdmin: false, pending: "", dispatchThrows: false,
    query: { data: [row()], error: null } as Response, claim: { data: receipt(), error: null } as Response,
    steps: [] as Array<[string, ...unknown[]]>, rpc: [] as Array<{ name: string; args: unknown }>,
    dispatched: [] as unknown[][], signals: [] as AbortSignal[] };
  const timers = new Map<number, () => void>(); let timerId = 0;
  let resolveLate!: (value: Response) => void;
  const late = new Promise<Response>(resolve => { resolveLate = resolve; });
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "is", "gt", "or", "order", "limit"]) chain[method] = (...args) => { state.steps.push([method, ...args]); return chain; };
  chain.abortSignal = (signal: unknown) => { state.signals.push(signal as AbortSignal); return state.pending === "query" ? late : Promise.resolve(state.query); };
  const imports: Record<string, unknown> = {
    "server-only": {}, "../touchlineArena/match-push-vapid-config.ts": vapidParser,
    "@/lib/supabase/admin": { createAdminClient: () => {
      state.admins++; if (state.noAdmin) return null;
      return { from: (table: string) => { state.steps.push(["from", table]); return chain; },
        rpc: (name: string, args: unknown) => { state.rpc.push({ name, args }); return { abortSignal: (signal: AbortSignal) => {
          state.signals.push(signal); return state.pending === "claim" ? late : Promise.resolve(state.claim);
        } }; } };
    } },
    // Worker boundary only; actual single-claim/dispatcher/policy/SQL/encryption
    // composition has its own suite. This test never pretends to deliver HTTP.
    "./lineup-reminder-single-claim-server.ts": { dispatchClaimedLineupReminder: async (...args: unknown[]) => {
      state.dispatched.push(args); if (state.dispatchThrows) throw new Error("PRIVATE backend failure"); return "provider_accepted";
    } },
  };
  class ClockDate extends Date { constructor(value: string | number = state.wall) { super(value); } static now() { return state.wall; } }
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(js, { exports, Date: ClockDate, AbortController, performance: { now: () => state.elapsed },
    setTimeout: (callback: () => void, delay: number) => { assert.equal(delay, 5_000); timers.set(++timerId, callback); return timerId; },
    clearTimeout: (key: number) => timers.delete(key),
    require: (name: string) => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; } });
  const api = exports as unknown as typeof worker;
  return { state, timers, resolveLate, run: (input: Parameters<typeof api.runLineupReminderWorker>[0] = options) => api.runLineupReminderWorker(input),
    expire: () => { state.elapsed = 5_000; state.wall += 5_000; const callback = timers.values().next().value; assert.ok(callback); callback(); } };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("worker default OFF and malformed explicit options never touch admin", async () => {
  for (const input of [{}, { ...options, enabled: false }, { ...options, maximumAgeMs: 0 },
    { ...options, maximumAgeMs: Infinity }, { ...options, leaseSeconds: 0 }, { ...options, leaseSeconds: 61 },
    { ...options, leaseSeconds: 1.5 }, { ...options, vapid: {} }]) {
    const h = harness(); assert.equal((await h.run(input)).status, input.enabled === true ? "unconfigured" : "disabled");
    assert.equal(h.state.admins, 0); assert.equal(h.state.dispatched.length, 0);
  }
});

test("legacy locale is ignored and never forwarded as recipient authority", async () => {
  for (const locale of [undefined, null, "xx", "pt-BR", "ar-SA"]) {
    const h = harness();
    assert.equal((await h.run({ ...options, locale })).status, "processed");
    assert.equal(Object.hasOwn(h.state.dispatched[0][1], "locale"), false);
  }
});

test("discovery is bounded, ordered, queued/unattempted/unexpired/unleased; one exact claim and dispatch", async () => {
  const h = harness(); assert.deepEqual(plain(await h.run()), { status: "processed", outcome: "provider_accepted" });
  assert.deepEqual(plain(h.state.steps), [
    ["from", "touchline_game_notification_deliveries"], ["select", "id,state,created_at,expires_at,lease_token,lease_expires_at,attempt_id"],
    ["eq", "state", "queued"], ["is", "attempt_id", null], ["gt", "expires_at", iso(0)],
    ["or", `lease_expires_at.is.null,lease_expires_at.lte.${iso(0)}`],
    ["order", "created_at", { ascending: true }], ["order", "id", { ascending: true }], ["limit", 1],
  ]);
  assert.deepEqual(plain(h.state.rpc), [{ name: "touchline_game_notification_claim", args: { p_id: id(1), p_lease_seconds: 30 } }]);
  assert.deepEqual(plain(h.state.dispatched), [[{ id: id(1), leaseToken: id(2), leaseUntil: iso(30_000), expiresAt: iso(90_000) },
    { enabled: true, maximumAgeMs: 30_000, vapid }]]);
  assert.equal(h.timers.size, 0);
});

test("empty discovery and contended null claim are idle without retries", async () => {
  for (const empty of [true, false]) {
    const h = harness(); if (empty) h.state.query.data = []; else h.state.claim.data = null;
    assert.equal((await h.run()).status, "idle"); assert.equal(h.state.rpc.length, empty ? 0 : 1);
    assert.equal(h.state.dispatched.length, 0); assert.equal(h.timers.size, 0);
  }
});

test("stale or malformed discovery cannot claim", async () => {
  for (const data of [null, {}, [row(), row()], [{ ...row(), state: "cancelled" }], [{ ...row(), attempt_id: id(3) }],
    [{ ...row(), id: "bad" }], [{ ...row(), expires_at: iso(0) }], [{ ...row(), created_at: iso(1) }],
    [{ ...row(), lease_token: id(3), lease_expires_at: iso(1) }], [{ ...row(), lease_token: null, lease_expires_at: iso(-1) }],
    [{ ...row(), created_at: "2026-02-30T00:00:00Z" }]]) {
    const h = harness(); h.state.query.data = data;
    assert.equal((await h.run()).status, "unconfirmed"); assert.equal(h.state.rpc.length, 0); assert.equal(h.state.dispatched.length, 0);
  }
});

test("expired lease can be discovered but only the new SQL lease is dispatched", async () => {
  const h = harness(); h.state.query.data = [{ ...row(), lease_token: id(3), lease_expires_at: iso(-1) }];
  assert.equal((await h.run()).status, "processed"); assert.equal(h.state.dispatched.length, 1);
  assert.equal((h.state.dispatched[0][0] as { leaseToken: string }).leaseToken, id(2));
  const stale = harness(); stale.state.query.data = [{ ...row(), lease_token: id(2), lease_expires_at: iso(-1) }];
  assert.equal((await stale.run()).status, "unconfirmed", "claim must replace, not reuse, the expired lease token");
  assert.equal(stale.state.dispatched.length, 0);
});

test("unknown, wrong identity, changed deadline and stale/oversized claim receipts never dispatch", async () => {
  for (const data of [undefined, [], {}, { ...receipt(), id: id(9) }, { ...receipt(), leaseToken: "bad" },
    { ...receipt(), expiresAt: iso(90_001) }, { ...receipt(), leaseUntil: iso(0) },
    { ...receipt(), leaseUntil: iso(30_001), leaseExpiresAt: iso(30_001) },
    { ...receipt(), leaseUntil: iso(100_000), leaseExpiresAt: iso(100_000) },
    { ...receipt(), leaseExpiresAt: iso(29_000) }, { ...receipt(), leaseUntil: "2026-02-30T00:00:00Z" }]) {
    const h = harness(); h.state.claim.data = data;
    assert.equal((await h.run()).status, "unconfirmed"); assert.equal(h.state.rpc.length, 1); assert.equal(h.state.dispatched.length, 0);
  }
});

test("query/claim errors and dispatch exception are sanitized, absent admin remains unconfigured", async () => {
  for (const location of ["query", "claim", "dispatch", "admin"] as const) {
    const h = harness();
    if (location === "query" || location === "claim") h.state[location].error = { message: "PRIVATE DETAILS" };
    else if (location === "dispatch") h.state.dispatchThrows = true; else h.state.noAdmin = true;
    assert.deepEqual(plain(await h.run()), { status: location === "admin" ? "unconfigured" : "unconfirmed" });
    assert.equal(h.state.dispatched.length, location === "dispatch" ? 1 : 0);
  }
});

test("bounded discovery/claim timeout ignores late receipt and does not retry or send", async () => {
  for (const stage of ["query", "claim"]) {
    const h = harness(); h.state.pending = stage;
    const result = h.run(); await flush(); h.expire();
    assert.equal((await result).status, "unconfirmed"); assert.ok(h.state.signals.every(signal => signal.aborted));
    h.resolveLate(stage === "query" ? h.state.query : h.state.claim); await flush();
    assert.equal(h.state.rpc.length, stage === "query" ? 0 : 1); assert.equal(h.state.dispatched.length, 0); assert.equal(h.timers.size, 0);
  }
});

test("caller option mutation while discovery waits cannot alter captured claim/send configuration", async () => {
  const h = harness(); h.state.pending = "query";
  const input = { ...options, vapid: { ...vapid } }; const result = h.run(input); await flush();
  input.leaseSeconds = 60; input.maximumAgeMs = 999_999; input.locale = "pt-BR"; input.vapid.subject = "mailto:changed@example.test";
  h.resolveLate(h.state.query);
  assert.equal((await result).status, "processed");
  assert.deepEqual(plain(h.state.rpc[0].args), { p_id: id(1), p_lease_seconds: 30 });
  assert.deepEqual(plain(h.state.dispatched[0][1]), { enabled: true, maximumAgeMs: 30_000, vapid });
});
