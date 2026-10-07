import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { classifyTouchlineConfirmedMatchEvent } from "../lib/touchlineArena/social-confirmed-event-contract.ts";

const js = ts.transpileModule(readFileSync(new URL("../lib/football-data/confirmed-event-observer.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const id = "11111111-1111-4111-8111-111111111111";
const fixture = { id, provider: "sportmonks", provider_fixture_id: "8" };
const event = (provider_event_id: string, event_type = "Goal") => ({ fixture_id: id, provider: "sportmonks", provider_event_id, event_type });
type Response = { data: unknown; error?: unknown; count?: number | null };
function harness(input: { fixtures?: unknown[]; events?: unknown[]; known?: unknown[]; badRead?: string; hold?: string; rpcFail?: boolean; counts?: Record<string, number> } = {}) {
  const tables: Record<string, unknown[]> = { football_fixtures: input.fixtures ?? [fixture],
    football_fixture_events: input.events ?? [event("9")], touchline_social_confirmed_event_observations: input.known ?? [] };
  const reads: { table: string; operations: unknown[][]; signal?: AbortSignal }[] = [];
  const writes: { name: string; args: unknown; signal?: AbortSignal }[] = [];
  const timers = new Map<number, () => void>();
  let elapsed = 0;
  let resolveLate!: (response: Response) => void;
  let rejectLate!: (error: Error) => void;
  const pending = new Promise<Response>((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
  const admin = {
    from(table: string) {
      assert.ok(Object.hasOwn(tables, table));
      const read = { table, operations: [] as unknown[][], signal: undefined as AbortSignal | undefined }; reads.push(read);
      const query: Record<string, unknown> = {};
      for (const name of ["select", "eq", "in", "limit", "order"]) query[name] = (...args: unknown[]) => { read.operations.push([name, ...args]); return query; };
      query.abortSignal = (signal: AbortSignal) => {
        read.signal = signal;
        if (input.hold === table) return pending;
        return Promise.resolve({ data: tables[table], count: input.counts?.[table] ?? tables[table].length,
          error: input.badRead === table ? { message: "PRIVATE" } : null });
      };
      return query;
    },
    rpc(name: string, args: unknown) {
      const write = { name, args, signal: undefined as AbortSignal | undefined }; writes.push(write);
      return { abortSignal(signal: AbortSignal) {
        write.signal = signal;
        return input.hold === "rpc" ? pending : Promise.resolve(input.rpcFail
          ? { error: { message: "PRIVATE SQL" }, data: null }
          : { data: { ok: true, state: "OBSERVING" }, error: null });
      } };
    },
  };
  const exports: { observePersistedConfirmedEvents?: (input: unknown) => Promise<{ status: string; attempted: number; observed: number }> } = {};
  vm.runInNewContext(js, { exports, performance: { now: () => elapsed }, AbortController,
    setTimeout(callback: () => void, ms: number) { assert.equal(ms, 5000); timers.set(1, callback); return 1; },
    clearTimeout(timer: number) { timers.delete(timer); },
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "../touchlineArena/social-confirmed-event-contract") return { classifyTouchlineConfirmedMatchEvent };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  const controller = new AbortController();
  return { reads, writes, controller, resolveLate, rejectLate, timers,
    run: (patch: Record<string, unknown> = {}) => exports.observePersistedConfirmedEvents!({ admin, fixtureProviderIds: ["8"], enabled: true, signal: controller.signal, ...patch }),
    timeout() { elapsed = 5000; const callback = timers.get(1); assert.ok(callback); callback(); },
  };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("observer defaults off and rejects invalid scope before database access", async () => {
  for (const [patch, status] of [[{ enabled: undefined }, "disabled"], [{ enabled: false }, "disabled"],
    [{ admin: null }, "unavailable"], [{ fixtureProviderIds: [id] }, "unavailable"],
    [{ fixtureProviderIds: [8] }, "unavailable"], [{ fixtureProviderIds: Array.from({ length: 11 }, (_, i) => String(i + 1)) }, "limit-exceeded"],
    [{ fixtureProviderIds: [] }, "completed"]] as const) {
    const h = harness(); assert.equal((await h.run(patch)).status, status); assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0);
  }
  const h = harness(); h.controller.abort(); assert.equal((await h.run()).status, "aborted"); assert.equal(h.reads.length, 0);
});
test("deduped fixture reads canonical rows; one observation per goal/card or previously observed event", async () => {
  const h = harness({ events: [event("9"), event("10", "Own Goal"), event("11", "Penalty"), event("12", "Red Card"),
    event("13", "Yellow Card"), event("14", "Unknown")], known: [{ fixture_provider_id: "8", event_provider_id: "14" }] });
  assert.deepEqual(plain(await h.run({ fixtureProviderIds: ["8", "8"] })), { status: "completed", attempted: 5, observed: 5 });
  assert.equal(h.reads.length, 3); assert.equal(h.writes.length, 5);
  assert.deepEqual(h.reads[0].operations.find(op => op[0] === "in")?.slice(1).map(plain), ["provider_fixture_id", ["8"]]);
  for (const read of h.reads) {
    assert.ok(read.operations.some(op => op[0] === "select" && (op[2] as { count: string }).count === "exact"));
    assert.ok(read.operations.some(op => op[0] === "limit")); assert.ok(read.signal);
  }
  const eventIds = h.writes.map(write => {
    assert.equal(write.name, "touchline_social_043_observe_confirmed_event");
    const args = write.args as { p_fixture_provider_id: string; p_event_provider_id: string };
    assert.equal(args.p_fixture_provider_id, "8"); return args.p_event_provider_id;
  });
  assert.deepEqual(eventIds.sort(), ["10", "11", "12", "14", "9"]); assert.equal(h.timers.size, 0);
});
test("cancelled/review event discovery is not filtered out; SQL owns confirmation", async () => {
  const h = harness({ events: [{ ...event("9"), event_status: "cancelled", info: "VAR REVIEW" }] });
  assert.equal((await h.run()).observed, 1);
  assert.ok(!h.reads[1].operations.some(op => op[0] === "eq" && op[1] === "event_status"));
});
test("malformed, duplicate, foreign, missing and incomplete data reject before writes", async () => {
  for (const input of [{ fixtures: [{ ...fixture, provider: "other" }] }, { fixtures: [fixture, fixture] },
    { fixtures: [{ ...fixture, provider_fixture_id: 8 }] }, { events: [event("9"), event("9")] },
    { events: [{ ...event("9"), provider: "other" }] }, { events: [{ ...event("9"), fixture_id: "foreign" }] },
    { events: [{ ...event("9"), provider_event_id: "bad" }] }, { known: [{ fixture_provider_id: "8", event_provider_id: "777" }] },
    { counts: { football_fixture_events: 1000 } }, { badRead: "football_fixtures" }, { badRead: "football_fixture_events" },
    { badRead: "touchline_social_confirmed_event_observations" }]) {
    const h = harness(input); assert.equal((await h.run()).status, "unavailable"); assert.equal(h.writes.length, 0); assert.equal(h.timers.size, 0);
  }
  const h = harness({ events: Array.from({ length: 51 }, (_, i) => event(String(i + 1))) });
  assert.equal((await h.run()).status, "limit-exceeded"); assert.equal(h.writes.length, 0);
});
test("timeout or abort never progresses after ignored cancellation or retries uncertain writes", async () => {
  for (const hold of ["football_fixtures", "rpc"]) for (const action of ["timeout", "abort", "reject"] as const) {
    const h = harness({ hold }); const running = h.run();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    if (action === "abort") h.controller.abort(); else h.timeout();
    const result = await running;
    assert.equal(result.status, action === "abort" ? "aborted" : "timed-out");
    const writeCount = h.writes.length;
    if (action === "reject") h.rejectLate(Error("PRIVATE late"));
    else h.resolveLate(hold === "rpc" ? { data: { ok: true, state: "CONFIRMED" } } : { data: [fixture], count: 1 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.writes.length, writeCount); assert.equal(result.observed, 0); assert.equal(h.timers.size, 0);
    assert.ok((h.reads[0].signal)?.aborted); assert.doesNotMatch(JSON.stringify(result), /PRIVATE|111111/);
  }
  const h = harness({ events: [event("9"), event("10")], rpcFail: true });
  assert.deepEqual(plain(await h.run()), { status: "unconfirmed", attempted: 1, observed: 0 }); assert.equal(h.writes.length, 1);
});
