import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { assertCandidateCapacityReadings, assertNoImplicitEnvironment, createCapacityMonitor, nextDevelopmentEnvFiles, parseCandidateArguments, runCandidateStage } from "../scripts/local/qa-candidate-runtime.mts";

test("local preview allows disk above 1 GiB but retains exact floor and critical pressure protection", () => {
  const floor = 1024 * 1024;
  assert.equal(assertCandidateCapacityReadings(1, floor + 1), 1);
  assert.equal(assertCandidateCapacityReadings(2, 2 * floor, true), 2);
  for (const disk of [floor, floor - 1, 0, NaN, Infinity]) {
    assert.throws(() => assertCandidateCapacityReadings(1, disk), /availableKiB/);
  }
  for (const pressure of [0, 2, 4, NaN]) {
    assert.throws(() => assertCandidateCapacityReadings(pressure, 8 * floor), /pressure/);
  }
  assert.throws(() => assertCandidateCapacityReadings(4, 8 * floor, true), /pressure/);
});

test("capacity monitor starts normal, retains sustained warnings and stops critical pressure", () => {
  let pressure = 2;
  const check = (_cwd: string, allowWarning = false) => {
    if (pressure !== 1 && !(allowWarning && pressure === 2)) throw new Error("pressure");
    return pressure;
  };
  const monitor = createCapacityMonitor(check);
  assert.throws(() => monitor("/synthetic"), /pressure/);
  pressure = 1; monitor("/synthetic");
  pressure = 2; monitor("/synthetic");
  for (let tick = 0; tick < 1000; tick++) monitor("/synthetic");
  pressure = 1; monitor("/synthetic");
  pressure = 2; monitor("/synthetic");
  monitor("/synthetic");
  pressure = 4; assert.throws(() => monitor("/synthetic"), /pressure/);
});

test("CLI requires explicit mode and absolute existing-source location; market is opt-in", () => {
  assert.deepEqual(parseCandidateArguments(["--check", "--env-file", "/synthetic/QA.env"]), { mode: "--check", sourcePath: "/synthetic/QA.env", qaMarketContext: false, clubCollection: false, clubRelease: false });
  assert.deepEqual(parseCandidateArguments(["--start", "--env-file", "/synthetic/QA.env", "--qa-market-context"]), { mode: "--start", sourcePath: "/synthetic/QA.env", qaMarketContext: true, clubCollection: false, clubRelease: false });
  assert.deepEqual(parseCandidateArguments(["--start", "--env-file", "/synthetic/QA.env", "--club-collection", "--qa-market-context"]), { mode: "--start", sourcePath: "/synthetic/QA.env", qaMarketContext: true, clubCollection: true, clubRelease: false });
  assert.equal(parseCandidateArguments(["--start", "--env-file", "/synthetic/QA.env", "--club-collection", "--qa-market-context", "--club-release"]).clubRelease, true);
  for (const flags of [["--club-release"], ["--club-release", "--club-collection"], ["--club-release", "--qa-market-context"]]) {
    assert.throws(() => parseCandidateArguments(["--start", "--env-file", "/synthetic/QA.env", ...flags]), /Usage/);
  }
  assert.throws(() => parseCandidateArguments(["--start", "--env-file", "/synthetic/QA.env", "--club-collection", "--club-collection"]), /Usage/);
  for (const args of [[], ["--start"], ["--check", "--env-file", "relative.env"], ["--check", "--env-file", "/synthetic", "--prod"], ["--start", "--env-file", "/synthetic", "--qa-market-context", "extra"]]) {
    assert.throws(() => parseCandidateArguments(args), /Usage/);
  }
});

function harness(expectedExit = false, timeoutMs?: number) {
  const child = Object.assign(new EventEmitter(), { pid: 123456 });
  const bus = new EventEmitter();
  const timers = new Map<object, { callback: () => void; ms: number }>();
  const polls = new Map<object, () => void>();
  const signals: [number, string][] = [];
  let pressureOk = true;
  let spawned = 0;
  let killError: string | undefined;
  const setTimer = (callback: () => void, ms: number) => {
    const id = {}; timers.set(id, { callback, ms }); return id;
  };
  const dependencies = {
    spawnChild: (_executable: string, _args: string[], options: { detached: boolean; env: object }) => {
      spawned++; assert.equal(options.detached, true); assert.deepEqual(options.env, {}); return child;
    },
    killGroup: (pid: number, signal: string) => {
      signals.push([pid, signal]);
      if (killError) throw Object.assign(new Error("synthetic signal failure"), { code: killError });
    },
    signalBus: bus,
    capacity: () => { if (!pressureOk) throw new Error("synthetic pressure"); },
    setTimer, clearTimer: (id: object) => timers.delete(id),
    setPoll: (callback: () => void) => { const id = {}; polls.set(id, callback); return id; },
    clearPoll: (id: object) => polls.delete(id),
  } as unknown as NonNullable<Parameters<typeof runCandidateStage>[1]>;
  const begin = () => runCandidateStage({ executable: "synthetic-node", args: [], cwd: "/synthetic-candidate", env: {}, expectedExit, timeoutMs }, dependencies);
  const tick = (ms: number) => {
    for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.callback(); }
  };
  const clean = () => {
    assert.equal(timers.size, 0); assert.equal(polls.size, 0);
    assert.equal(bus.listenerCount("SIGINT"), 0); assert.equal(bus.listenerCount("SIGTERM"), 0);
  };
  return { child, bus, signals, begin, tick, clean, failSignal: (code: string) => { killError = code; }, failCapacity: () => { pressureOk = false; }, poll: () => [...polls.values()].forEach(fn => fn()), spawned: () => spawned };
}

test("refuses every dotenv file Next development can load without reading any contents", () => {
  assert.doesNotThrow(() => assertNoImplicitEnvironment("/synthetic", () => false));
  for (const file of nextDevelopmentEnvFiles) {
    assert.throws(() => assertNoImplicitEnvironment("/synthetic", path => String(path) === `/synthetic/${file}`), /implicit Next dotenv/);
  }
});

test("capacity gate refuses before spawning", () => {
  const h = harness(); h.failCapacity();
  assert.throws(() => h.begin(), /pressure/);
  assert.equal(h.spawned(), 0); h.clean();
});

for (const [code, expected] of [[0, 1], [null, 1], [17, 17]] as const) {
  test(`unexpected Next exit ${code} reports ${expected}, never browser success`, async () => {
    const h = harness(); const result = h.begin(); h.child.emit("exit", code);
    assert.equal(await result, expected); h.clean();
    assert.deepEqual(h.signals, [[123456, "SIGKILL"]]);
  });
}

test("only expected successful preflight exit may return zero", async () => {
  const h = harness(true, 30000); const result = h.begin(); h.child.emit("exit", 0);
  assert.equal(await result, 0); h.clean();
});

test("preflight timeout escalates only its own group and cannot return success", async () => {
  const h = harness(true, 30000); const result = h.begin(); h.tick(30000);
  assert.deepEqual(h.signals, [[123456, "SIGTERM"]]); h.tick(5000);
  assert.deepEqual(h.signals, [[123456, "SIGTERM"], [123456, "SIGKILL"]]);
  h.child.emit("exit", 0); assert.equal(await result, 1); h.clean();
});

for (const [signal, expected] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
  test(`${signal} cancels with ${expected} and removes listeners`, async () => {
    const h = harness(); const result = h.begin(); h.bus.emit(signal); h.bus.emit(signal);
    assert.equal(h.signals.length, 1); h.child.emit("exit", null);
    assert.equal(await result, expected); h.clean();
  });
}

test("nonzero child failure retains precedence over requested stop", async () => {
  const h = harness(); const result = h.begin(); h.bus.emit("SIGINT"); h.child.emit("exit", 9);
  assert.equal(await result, 9); h.clean();
});

test("capacity loss after spawn stops the owned stage", async () => {
  const h = harness(); const result = h.begin(); h.failCapacity(); h.poll();
  assert.deepEqual(h.signals, [[123456, "SIGTERM"]]); h.child.emit("exit", 0);
  assert.equal(await result, 1); h.clean();
});

test("spawn error is failure and settles only once", async () => {
  const h = harness(); const result = h.begin(); h.child.emit("error", new Error("synthetic spawn error"));
  h.child.emit("exit", 0); assert.equal(await result, 1); h.clean(); assert.equal(h.signals.length, 1);
});

test("unconfirmed group shutdown prevents a successful preflight result", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const h = harness(true, 30000); const result = h.begin(); h.failSignal("EPERM");
  h.child.emit("exit", 0); assert.equal(await result, 1); h.clean();
  assert.equal(log.mock.callCount(), 1);
});

test("an already-exited group is not treated as failed shutdown", async () => {
  const h = harness(true, 30000); const result = h.begin(); h.failSignal("ESRCH");
  h.child.emit("exit", 0); assert.equal(await result, 0); h.clean();
});
