import assert from "node:assert/strict";
import test from "node:test";
import { createLocalReadTiming } from "../lib/touchlineArena/local-read-timing.ts";

const enabled = { NODE_ENV: "development", TOUCHLINE_LOCAL_READ_TIMING: "1" };

test("local timing is default off and never observes clocks or results outside the exact gate", async () => {
  for (const environment of [{}, { ...enabled, NODE_ENV: "production" }, { ...enabled, NODE_ENV: "test" },
    { ...enabled, TOUCHLINE_LOCAL_READ_TIMING: "true" }, { NODE_ENV: "development" }]) {
    let logs = 0, clocks = 0;
    const timing = createLocalReadTiming(environment, { now: () => { clocks++; return 0; }, emit: () => { logs++; } });
    const original = Promise.resolve({ privateValue: 42 });
    assert.equal(timing.measure("auth", () => original), original);
    assert.equal((await original).privateValue, 42);
    assert.equal(logs, 0); assert.equal(clocks, 0);
  }
});

test("concurrent branches retain independent timing, original promises and results without payload capture", async () => {
  const records: Array<{ requestId: string; stage: string; durationMs: number | null; status: string }> = [];
  const started: string[] = [];
  let time = 10;
  const timing = createLocalReadTiming(enabled, { now: () => time, emit: record => records.push(record) });
  let resolveAvatar!: (value: string) => void, rejectSnapshot!: (error: Error) => void;
  const avatar = new Promise<string>(resolve => { resolveAvatar = resolve; });
  const snapshot = new Promise<never>((_, reject) => { rejectSnapshot = reject; });
  assert.equal(timing.measure("avatar", () => { started.push("avatar"); return avatar; }), avatar);
  time = 20;
  assert.equal(timing.measure("snapshot", () => { started.push("snapshot"); return snapshot; }), snapshot);
  assert.deepEqual(started, ["avatar", "snapshot"]);
  const outcomes = Promise.allSettled([avatar, snapshot]);
  time = 40; resolveAvatar("private account"); await Promise.resolve();
  time = 75; const privateError = new Error("private credential"); rejectSnapshot(privateError);
  assert.deepEqual(await outcomes, [{ status: "fulfilled", value: "private account" }, { status: "rejected", reason: privateError }]);
  assert.deepEqual(records.map(({ stage, durationMs, status }) => ({ stage, durationMs, status })), [
    { stage: "avatar", durationMs: 30, status: "fulfilled" }, { stage: "snapshot", durationMs: 55, status: "rejected" },
  ]);
  assert.match(records[0].requestId, /^[0-9a-f-]{36}$/);
  assert.equal(records[0].requestId, records[1].requestId);
  assert.deepEqual(Object.keys(records[0]).sort(), ["durationMs", "requestId", "stage", "status"]);
  assert.ok(!JSON.stringify(records).includes("private"));
});

test("clock and logger failure never replaces a result or rejection, including synchronous failure", async () => {
  const timing = createLocalReadTiming(enabled, { now: () => { throw new Error("clock"); }, emit: () => { throw new Error("logger"); } });
  assert.equal(await timing.measure("collection", () => Promise.resolve(42)), 42);
  const original = new Error("original");
  await assert.rejects(timing.measure("snapshot", () => Promise.reject(original)), error => error === original);
  assert.throws(() => timing.measure("auth", () => { throw original; }), error => error === original);
  const records: unknown[] = [];
  const badClock = createLocalReadTiming(enabled, { now: () => NaN, emit: record => records.push(record) });
  await badClock.measure("liveRail", () => Promise.resolve(null));
  assert.equal((records[0] as { durationMs: unknown }).durationMs, null);
});

test("request identifiers stay isolated and total observes existing parallel work without changing its outcome", async () => {
  const records: Array<{ requestId: string; stage: string }> = [];
  const first = createLocalReadTiming(enabled, { emit: record => records.push(record) });
  const second = createLocalReadTiming(enabled, { emit: record => records.push(record) });
  assert.deepEqual(await first.measure("total", () => Promise.all([
    first.measure("snapshot", () => Promise.resolve(1)), first.measure("collection", () => Promise.resolve(2)),
  ])), [1, 2]);
  await second.measure("auth", () => Promise.resolve(null));
  assert.equal(new Set(records.slice(0, 3).map(record => record.requestId)).size, 1);
  assert.notEqual(records[0].requestId, records[3].requestId);
});
