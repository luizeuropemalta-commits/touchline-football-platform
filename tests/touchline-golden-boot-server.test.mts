import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as authority from "../lib/touchlineArena/golden-boot-public-authority.ts";
import type * as server from "../lib/touchlineArena/golden-boot-server.ts";

const now = Date.parse("2026-10-01T19:00:00Z");
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function ready() {
  return { status: "ready", snapshotId: uuid(1), revision: "9007199254740993", competitionId: uuid(2),
    seasonId: uuid(3), playerIds: [uuid(4), uuid(5)], expiresAt: new Date(now + 40_000).toISOString(), freshnessAuthority: "fetch-age-only", observedAtMs: now };
}
function harness(enabled?: string) {
  const state = { response: { data: ready() as unknown, error: null as unknown }, calls: [] as string[], clients: 0, throws: false, factoryThrows: false,
    pending: null as Promise<{ data: unknown; error: unknown }> | null, signals: [] as AbortSignal[], monotonicMs: 1000 };
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  const admin = { rpc(name: string) {
    state.calls.push(name);
    const request = (async () => {
      if (state.throws) throw Error("PRIVATE database sentinel");
      return state.pending ?? state.response;
    })();
    return Object.assign(request, { abortSignal(signal: AbortSignal) { state.signals.push(signal); return request; } });
  } } as unknown as NonNullable<Parameters<typeof server.readGoldenBootPublicState>[0]>;
  const imports: Record<string, unknown> = {
    "server-only": {}, "react": { cache: (fn: unknown) => fn },
    "@/lib/supabase/admin": { createAdminClient() { state.clients++; if (state.factoryThrows) throw Error("PRIVATE configuration sentinel"); return admin; } },
    "./golden-boot-public-authority.ts": authority,
  };
  const js = ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/golden-boot-server.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result: Record<string, unknown> = {};
  class ClockDate extends Date { static now() { return now; } }
  vm.runInThisContext(`(function(exports,require,process,Date,setTimeout,clearTimeout,performance){${js}\n})`)(result,
    (name: string) => { assert.ok(Object.hasOwn(imports,name),name); return imports[name]; },
    { env: { TOUCHLINE_GOLDEN_BOOT_ENABLED: enabled } }, ClockDate,
    (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; },
    (id: number) => { timers.delete(id); }, { now: () => state.monotonicMs });
  return { state, admin, timers, reader: result as unknown as typeof server };
}

test("public loader default OFF performs no database or provider work", async () => {
  for (const flag of [undefined, "false", "1", "TRUE"]) {
    const h = harness(flag);
    assert.equal(await h.reader.loadTouchlineGoldenBoot(), null);
    assert.equal(h.state.clients,0); assert.deepEqual(h.state.calls,[]);
  }
});

test("enabled public loader uses one read RPC and strips private fields through the real parser", async () => {
  const h=harness("true"); h.state.response.data={...ready(), token:"PRIVATE", rawEvidence:{secret:true}};
  const result=await h.reader.loadTouchlineGoldenBoot();
  assert.ok(result); assert.equal(result.servedAtMs,now);
  assert.equal(result.authority.revision,"9007199254740993");
  assert.deepEqual(result.authority.playerIds,[uuid(4),uuid(5)]);
  assert.deepEqual(h.state.calls,["read_touchline_current_golden_boot"]);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|rawEvidence|secret/);
});

test("explicit unavailable decision retains its revision for consumer revocation", async () => {
  const h=harness("true"); h.state.response.data={...ready(),status:"unavailable",snapshotId:null,expiresAt:null,playerIds:[]};
  const result=await h.reader.loadTouchlineGoldenBoot();
  assert.equal(result?.authority.status,"unavailable"); assert.equal(result.authority.revision,"9007199254740993");
});

test("malformed, expired and implausibly extended awards never leave the server reader", async () => {
  for (const data of [null,{}, {...ready(),expiresAt:new Date(now).toISOString()},
    {...ready(),expiresAt:new Date(now+60_001).toISOString()}, {...ready(),playerIds:[] }]) {
    const h=harness("true"); h.state.response.data=data;
    assert.equal(await h.reader.loadTouchlineGoldenBoot(),null);
  }
});

test("errors and absent credentials fail closed without exposing diagnostics", async () => {
  const h=harness("true");
  assert.equal(await h.reader.readGoldenBootPublicState(null),null); assert.deepEqual(h.state.calls,[]);
  h.state.response.error={message:"PRIVATE error"}; assert.equal(await h.reader.loadTouchlineGoldenBoot(),null);
  h.state.throws=true; assert.equal(await h.reader.loadTouchlineGoldenBoot(),null);
});

test("client construction failure cannot reject the page loader", async () => {
  const h = harness("true");
  h.state.factoryThrows = true;
  assert.equal(await h.reader.loadTouchlineGoldenBoot(), null);
  assert.equal(h.state.clients, 1);
  assert.deepEqual(h.state.calls, []);
});

test("slow read is aborted and returns null even if transport ignores cancellation", async () => {
  const h = harness("true");
  let complete!: (value: { data: unknown; error: unknown }) => void;
  h.state.pending = new Promise(resolve => { complete = resolve; });
  const loading = h.reader.loadTouchlineGoldenBoot();
  assert.equal(h.timers.size, 1);
  const timer = [...h.timers.values()][0]!;
  assert.equal(timer.delay, 500);
  timer.callback();
  assert.equal(await loading, null);
  assert.equal(h.state.signals[0]?.aborted, true);
  assert.equal(h.timers.size, 0);
  complete({ data: ready(), error: null });
  assert.equal(await loading, null, "late success cannot restore a timed-out award");
});

test("successful read clears deadline and does not cancel a completed request", async () => {
  const h = harness("true");
  assert.ok(await h.reader.loadTouchlineGoldenBoot());
  assert.equal(h.state.signals.length, 1);
  assert.equal(h.state.signals[0]?.aborted, false);
  assert.equal(h.timers.size, 0);
});

test("database clock anchors expiry despite application wall-clock skew", async () => {
  for (const skew of [-3_600_000, 3_600_000]) {
    const h = harness("true");
    h.state.response.data = { ...ready(), observedAtMs: now + skew,
      expiresAt: new Date(now + skew + 40_000).toISOString() };
    const result = await h.reader.loadTouchlineGoldenBoot();
    assert.equal(result?.servedAtMs, now + skew);
  }
});

test("missing database clock and excessive or reversed monotonic reads fail closed", async () => {
  const missing = harness("true");
  missing.state.response.data = { ...ready(), observedAtMs: undefined };
  assert.equal(await missing.reader.loadTouchlineGoldenBoot(), null);
  for (const elapsed of [-1, 501, Number.NaN]) {
    const h = harness("true");
    let complete!: (value: { data: unknown; error: unknown }) => void;
    h.state.pending = new Promise(resolve => { complete = resolve; });
    const loading = h.reader.loadTouchlineGoldenBoot();
    h.state.monotonicMs += elapsed;
    complete(h.state.response);
    assert.equal(await loading, null);
  }
});

test("full RPC elapsed time is charged against remaining database validity", async () => {
  const h = harness("true");
  let complete!: (value: { data: unknown; error: unknown }) => void;
  h.state.pending = new Promise(resolve => { complete = resolve; });
  const loading = h.reader.loadTouchlineGoldenBoot();
  h.state.monotonicMs += 123.2;
  complete(h.state.response);
  assert.equal((await loading)?.servedAtMs, now + 124);
});
