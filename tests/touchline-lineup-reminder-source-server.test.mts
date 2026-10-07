import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as sourceReader from "../lib/touchlineFantasy/lineup-reminder-source.ts";
import type * as server from "../lib/touchlineFantasy/lineup-reminder-source-server.ts";

const now = Date.parse("2026-10-02T12:00:00Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { userId: id(1), gameweekId: id(2), competitionId: id(3), seasonId: id(4) };
const input = () => ({ ...scope, maximumAgeMs: 1_000 });
function dto(count = 11): sourceReader.LineupReminderSource {
  const slotIds = Array.from({ length: 11 }, (_, i) => `slot-${i}`);
  return { ...scope, schemaVersion: 1, checkedAtMs: now, read: {
    status: "complete", checkedAtMs: now, marketEditable: true, effectiveDeadlineMs: now + 60_000,
    formation: { published: true, code: "4-3-3", slotIds },
    userGameweek: { state: "DRAFT", formationCode: "4-3-3", selectedCoachId: "307" },
    selections: slotIds.slice(0, count).map((slotId, i) => ({ slotId, playerId: id(100 + i) })),
  } };
}
type Response = { data: unknown; error: unknown };
const unavailable = { status: "UNAVAILABLE", source: null };
const js = ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/lineup-reminder-source-server.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(mode: "normal" | "no-admin" | "factory-throw" | "rpc-throw" | "late" | "resolve-on-abort" = "normal") {
  const state = { admins: 0, calls: [] as Array<{ name: string; args: unknown }>, signals: [] as AbortSignal[],
    response: { data: dto(), error: null } as Response, elapsed: 0, wall: now };
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let resolveLate!: (value: Response) => void, rejectLate!: (error: Error) => void;
  const pending = new Promise<Response>((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
  const exports: Partial<typeof server> = {};
  class ClockDate extends Date { static now() { return state.wall; } }
  vm.runInNewContext(js, { exports, AbortController, Date: ClockDate,
    performance: { now: () => state.elapsed },
    setTimeout: (callback: () => void, delay: number) => { timers.set(1, { callback, delay }); return 1; },
    clearTimeout: (timerId: number) => timers.delete(timerId),
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "./lineup-reminder-source.ts") return sourceReader;
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => {
        state.admins++;
        if (mode === "factory-throw") throw new Error("PRIVATE configuration");
        if (mode === "no-admin") return null;
        return { rpc: (rpcName: string, args: unknown) => {
          state.calls.push({ name: rpcName, args });
          if (mode === "rpc-throw") throw new Error("PRIVATE SQL");
          return { abortSignal: (signal: AbortSignal) => {
            state.signals.push(signal);
            if (mode === "resolve-on-abort") signal.addEventListener("abort", () => resolveLate(state.response), { once: true });
            return mode === "late" || mode === "resolve-on-abort" ? pending : Promise.resolve(state.response);
          } };
        } };
      } };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { state, timers, resolveLate, rejectLate,
    read: (request = input()) => exports.readLineupReminderSourceServer!(request),
    timeout: () => {
      const timer = timers.get(1); assert.ok(timer); assert.equal(timer.delay, 5_000);
      state.elapsed = 5_000; timer.callback();
    },
  };
}

test("server uses exactly one abortable readonly RPC through the real parser/classifier", async () => {
  for (const count of [0, 11]) {
    const h = harness(); h.state.response.data = dto(count);
    const result = await h.read();
    assert.equal(result.status, count === 0 ? "INCOMPLETE" : "COMPLETE_UNCONFIRMED");
    assert.deepEqual(result.source, dto(count));
    assert.equal(h.state.admins, 1);
    assert.deepEqual(h.state.calls, [{ name: "touchline_fantasy_read_lineup_reminder", args: { p_user_id: scope.userId, p_gameweek_id: scope.gameweekId } }]);
    assert.equal(h.state.signals.length, 1); assert.equal(h.state.signals[0].aborted, false);
    assert.equal(h.timers.size, 0);
  }
});

test("invalid scope and age are rejected before admin construction or timer creation", async () => {
  for (const request of [
    ...["userId", "gameweekId", "competitionId", "seasonId"].map(key => ({ ...input(), [key]: "invalid" })),
    ...[0, -1, NaN, Infinity, 0.5].map(maximumAgeMs => ({ ...input(), maximumAgeMs })),
  ]) {
    const h = harness(); assert.deepEqual(await h.read(request), unavailable);
    assert.equal(h.state.admins, 0); assert.equal(h.state.calls.length, 0); assert.equal(h.timers.size, 0);
  }
});

test("missing admin, exceptions and RPC errors are sanitized without retry", async () => {
  for (const mode of ["no-admin", "factory-throw", "rpc-throw"] as const) {
    const h = harness(mode); assert.deepEqual(await h.read(), unavailable);
    assert.equal(h.state.admins, 1); assert.equal(h.state.calls.length, mode === "rpc-throw" ? 1 : 0);
    assert.equal(h.timers.size, 0);
  }
  const h = harness(); h.state.response.error = { message: "PRIVATE DB error", details: "credentials" };
  assert.deepEqual(await h.read(), unavailable); assert.equal(h.state.calls.length, 1); assert.equal(h.timers.size, 0);
});

test("transport success cannot bypass real scope, completeness or freshness checks", async () => {
  const valid = dto();
  for (const data of [null, [], {}, { ...valid, userId: id(999) },
    { ...valid, read: { ...valid.read, selections: [null] } },
    { ...valid, checkedAtMs: now + 1, read: { ...valid.read, checkedAtMs: now + 1 } },
    { ...valid, checkedAtMs: now - 1_001, read: { ...valid.read, checkedAtMs: now - 1_001 } },
    { ...valid, read: { status: "unavailable" } },
  ]) {
    const h = harness(); h.state.response.data = data;
    assert.deepEqual(await h.read(), unavailable); assert.equal(h.timers.size, 0);
  }
});

test("five-second deadline aborts; ignored abort and late success/rejection cannot restore a source", async () => {
  for (const reject of [false, true]) {
    const h = harness("late"); const result = h.read(); h.timeout();
    assert.deepEqual(await result, unavailable); assert.equal(h.state.signals[0].aborted, true);
    assert.equal(h.timers.size, 0);
    if (reject) h.rejectLate(new Error("PRIVATE late transport")); else h.resolveLate(h.state.response);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(await result, unavailable); assert.equal(h.state.calls.length, 1);
  }
});

test("synchronous abort listener success cannot win the timeout", async () => {
  const h = harness("resolve-on-abort"); const result = h.read(); h.timeout();
  assert.deepEqual(await result, unavailable); assert.equal(h.state.signals[0].aborted, true);
  assert.equal(h.state.calls.length, 1); assert.equal(h.timers.size, 0);
});

test("delayed timers cannot admit responses outside monotonic deadline", async () => {
  for (const elapsed of [5_000, 5_001, -1, NaN, Infinity]) {
    const h = harness("late"); const result = h.read();
    h.state.elapsed = elapsed; h.resolveLate(h.state.response);
    assert.deepEqual(await result, unavailable); assert.equal(h.state.signals[0].aborted, true);
    assert.equal(h.state.calls.length, 1); assert.equal(h.timers.size, 0);
  }
});

test("completion time still enforces source age and successful reads detach the response", async () => {
  const stale = harness("late"); const result = stale.read();
  stale.state.elapsed = 1_001; stale.state.wall += 1_001; stale.resolveLate(stale.state.response);
  assert.deepEqual(await result, unavailable); assert.equal(stale.timers.size, 0);
  const h = harness(); const value = dto(); h.state.response.data = value;
  const success = await h.read(); value.read.selections.length = 0;
  assert.equal(success.source?.read.selections.length, 11);
});
