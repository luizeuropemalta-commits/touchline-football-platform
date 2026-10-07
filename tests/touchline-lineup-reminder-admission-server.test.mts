import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import type * as adapter from "../lib/touchlineFantasy/lineup-reminder-admission-server.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const options = { enabled: true, competitionId: id(1), seasonId: id(2), leadSeconds: 7_200, pageSize: 10, retrySeconds: 60 };
const empty = () => ({ status: "complete", scanned: 0, inserted: 0, processed: 0, deferred: 0, discoveryBusy: 0,
  stored: 0, closed: 0, sweep: "2", sweepCompleted: true });
type Response = { data: unknown; error: unknown };
const js = ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/lineup-reminder-admission-server.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness() {
  const state = { admins: 0, absent: false, throws: false, pending: false, elapsed: 0,
    response: { data: empty(), error: null } as Response,
    calls: [] as Array<{ name: string; args: unknown; signal?: AbortSignal }> };
  const timers = new Map<number, () => void>(); let timerId = 0;
  let resolveLate!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { resolveLate = resolve; });
  const exports: Record<string, unknown> = {};
  const imports: Record<string, unknown> = {
    "server-only": {},
    "@/lib/supabase/admin": { createAdminClient: () => {
      state.admins++; if (state.absent) return null;
      return { rpc: (name: string, args: unknown) => {
        const call: typeof state.calls[number] = { name, args }; state.calls.push(call);
        if (state.throws) throw Error("PRIVATE infrastructure detail");
        return { abortSignal: (signal: AbortSignal) => { call.signal = signal; return state.pending ? pending : Promise.resolve(state.response); } };
      } };
    } },
  };
  vm.runInNewContext(js, { exports, AbortController, performance: { now: () => state.elapsed },
    setTimeout: (callback: () => void, delay: number) => { assert.equal(delay, 5_000); timers.set(++timerId, callback); return timerId; },
    clearTimeout: (key: number) => timers.delete(key),
    require: (name: string) => { assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`); return imports[name]; } });
  const api = exports as unknown as typeof adapter;
  return { state, timers, resolveLate,
    run: (input: Parameters<typeof api.runLineupReminderAdmission>[0] = options) => api.runLineupReminderAdmission(input),
    expire: () => { state.elapsed = 5_000; const stop = timers.values().next().value; assert.ok(stop); stop(); } };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("default OFF or invalid explicit configuration never constructs admin", async () => {
  for (const input of [{}, { ...options, enabled: false }, { ...options, competitionId: "bad" },
    { ...options, seasonId: "00000000-0000-7000-8000-000000000002" }, { ...options, competitionId: ` ${id(1)}` },
    { ...options, leadSeconds: 0 }, { ...options, leadSeconds: 86_401 }, { ...options, leadSeconds: "7200" },
    { ...options, pageSize: 0 }, { ...options, pageSize: 51 }, { ...options, pageSize: 1.5 },
    { ...options, retrySeconds: 0 }, { ...options, retrySeconds: 3_601 }, { ...options, retrySeconds: Infinity }]) {
    const h = harness(); assert.equal((await h.run(input)).status, input.enabled === true ? "unconfigured" : "disabled");
    assert.equal(h.state.admins, 0); assert.equal(h.state.calls.length, 0);
  }
});

test("one exact bounded RPC accepts sanitized complete and partial counters", async () => {
  const examples = [empty(), { ...empty(), scanned: 10, inserted: 3, processed: 10, stored: 2, closed: 1, sweepCompleted: false },
    { ...empty(), status: "partial", scanned: 4, inserted: 2, processed: 7, deferred: 2, stored: 3, closed: 1 },
    { ...empty(), status: "partial", discoveryBusy: 1, sweepCompleted: false },
    { ...empty(), sweep: "9223372036854775807" }];
  for (const data of examples) {
    const h = harness(); h.state.response.data = data;
    assert.deepEqual(plain(await h.run()), data);
    assert.equal(h.state.calls.length, 1); assert.equal(h.state.calls[0].name, "touchline_lineup_reminder_admission_scan");
    assert.deepEqual(plain(h.state.calls[0].args), { p_competition_id: id(1), p_season_id: id(2), p_lead_seconds: 7_200, p_page_size: 10, p_retry_seconds: 60 });
    assert.ok(h.state.calls[0].signal instanceof AbortSignal); assert.equal(h.timers.size, 0);
  }
});

test("SQL refusals remain explicit, not zero-row success, and do not retry", async () => {
  for (const status of ["busy", "unavailable", "policy-mismatch", "unconfigured"]) {
    const h = harness(); h.state.response.data = { status };
    assert.deepEqual(plain(await h.run()), { status }); assert.equal(h.state.calls.length, 1);
  }
});

test("malformed receipts, leaked fields, inconsistent counters and unsafe sweep fail closed", async () => {
  const { scanned: _scanned, ...missingCounter } = empty();
  assert.equal(_scanned, 0);
  const malformed: unknown[] = [null, [], true, {}, missingCounter, { status: "busy", userId: id(9) },
    { ...empty(), secret: "PRIVATE" }, { ...empty(), status: "ready" }, { ...empty(), scanned: "0" },
    { ...empty(), inserted: 1 }, { ...empty(), processed: 11 }, { ...empty(), stored: 1 },
    { ...empty(), processed: 1, stored: 1, closed: 1 }, { ...empty(), deferred: -1 },
    { ...empty(), scanned: NaN }, { ...empty(), discoveryBusy: 2 }, { ...empty(), status: "partial" },
    { ...empty(), discoveryBusy: 1 }, { ...empty(), scanned: 10, sweepCompleted: true },
    { ...empty(), scanned: 2, sweepCompleted: false }, { ...empty(), sweepCompleted: "true" },
    { ...empty(), status: "partial", scanned: 10, discoveryBusy: 1, sweepCompleted: false },
    ...[0, "0", "01", "-1", "9223372036854775808", "1e3"].map(sweep => ({ ...empty(), sweep }))];
  for (const data of malformed) {
    const h = harness(); h.state.response.data = data;
    assert.deepEqual(plain(await h.run()), { status: "unconfirmed" }); assert.equal(h.state.calls.length, 1);
  }
});

test("admin absence, SQL error and thrown private failures expose no details", async () => {
  for (const mode of ["absent", "error", "throw"]) {
    const h = harness(); h.state.absent = mode === "absent"; h.state.throws = mode === "throw";
    if (mode === "error") h.state.response.error = { message: "PRIVATE SQL DETAILS" };
    assert.deepEqual(plain(await h.run()), { status: mode === "absent" ? "unconfigured" : "unconfirmed" });
    assert.equal(h.state.calls.length, mode === "absent" ? 0 : 1); assert.equal(h.timers.size, 0);
  }
});

test("timeout ignores a late successful receipt without replaying admission", async () => {
  const h = harness(); h.state.pending = true;
  const result = h.run(); await flush(); h.expire();
  assert.deepEqual(plain(await result), { status: "unconfirmed" }); assert.equal(h.state.calls[0].signal?.aborted, true);
  h.resolveLate({ data: empty(), error: null }); await flush();
  assert.equal(h.state.calls.length, 1); assert.equal(h.timers.size, 0);
});

test("monotonic deadline rejects stale completions even when abort is ignored", async () => {
  for (const elapsed of [5_000, -1, NaN, Infinity]) {
    const h = harness(); h.state.pending = true;
    const result = h.run(); await flush(); h.state.elapsed = elapsed; h.resolveLate(h.state.response);
    assert.deepEqual(plain(await result), { status: "unconfirmed" }); assert.equal(h.state.calls.length, 1);
  }
});

test("caller mutation cannot change captured scope/policy or receipt validation bounds", async () => {
  const h = harness(); h.state.pending = true;
  const input = { ...options }; const result = h.run(input); await flush();
  input.competitionId = id(8); input.seasonId = id(9); input.leadSeconds = 1; input.pageSize = 50; input.retrySeconds = 1;
  h.resolveLate({ data: { ...empty(), processed: 11 }, error: null });
  assert.deepEqual(plain(await result), { status: "unconfirmed" });
  assert.deepEqual(plain(h.state.calls[0].args), { p_competition_id: id(1), p_season_id: id(2), p_lead_seconds: 7_200, p_page_size: 10, p_retry_seconds: 60 });
});

test("returned counters are detached from transport-owned receipt objects", async () => {
  const h = harness(), data = empty(); h.state.response.data = data;
  const result = await h.run(); data.stored = 50; data.status = "PRIVATE";
  assert.deepEqual(plain(result), empty());
});
