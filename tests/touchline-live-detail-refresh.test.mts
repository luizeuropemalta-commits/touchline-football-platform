import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("live.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects: ts.CallExpression[] = [];
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.getText(ast).includes("await fetch(")) effects.push(node);
  node.forEachChild(visit);
}
visit(ast);
assert.equal(effects.length, 2);
const detail = effects.find(node => node.getText(ast).includes("fixture?fixtureId="))!;
const polling = effects.find(node => node.getText(ast).includes("livescores?snapshot=1"))!;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
type DetailSnapshot = { fixture: { id: number; status?: string }; events: unknown[] };
type DetailResponse = { status: number; ok: boolean; json: () => Promise<unknown> };
function harness() {
  const requests: Array<{ url: string; signal: AbortSignal; result: ReturnType<typeof deferred<DetailResponse>> }> = [];
  const snapshots: (DetailSnapshot | null)[] = [];
  const visibility = { visibilityState: "visible" };
  let timer: (() => void) | null = null;
  let timerCount = 0;
  let nextDeadline = 0;
  const deadlines = new Map<number, () => void>();
  const exports: { select?: (id: number, permitted?: boolean) => (() => void) | undefined; poll?: () => () => void } = {};
  runInNewContext(ts.transpileModule(`
    export function select(id, canReadMatchDetail=true) {
      const selected={providerId:id};
      return (${detail.arguments[0].getText(ast)})();
    }
    export function poll() { return (${polling.arguments[0].getText(ast)})(); }
  `, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, AbortController, document: visibility, detailRefresh: { current: null },
    setMatchDetail: (snapshot: DetailSnapshot | null) => snapshots.push(snapshot),
    setFixtures: () => {}, setReadMetadata: () => {}, mergeTouchlineLiveFixtures: () => [], isTouchlineLiveReadMetadata: () => false,
    window: {
      setInterval: (callback: () => void, ms: number) => { assert.equal(ms, 45_000); assert.equal(timer, null); timer = callback; timerCount++; return 1; },
      clearInterval: (id: number) => { assert.equal(id, 1); timer = null; },
      setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 8_000); const id = ++nextDeadline; deadlines.set(id, callback); return id; },
      clearTimeout: (id: number) => { deadlines.delete(id); },
    },
    fetch: (url: string, options: { signal: AbortSignal; cache: string }) => {
      assert.equal(options.cache, "no-store");
      if (url.includes("livescores?snapshot=1")) return Promise.resolve({ json: async () => ({ ok: false }) });
      const result = deferred<DetailResponse>(); requests.push({ url, signal: options.signal, result }); return result.promise;
    },
  });
  const stopPolling = exports.poll!();
  return { requests, snapshots, visibility, select: exports.select!, tick: async () => { timer?.(); await flush(); }, stopPolling,
    expire: async () => { const entry = deadlines.entries().next().value; assert.ok(entry); deadlines.delete(entry[0]); entry[1](); await flush(); },
    get deadlineCount() { return deadlines.size; },
    get timerCount() { return timerCount; }, get timerActive() { return timer !== null; } };
}
function response(id: number, events: unknown[], status = 200) {
  return { status, ok: status === 200, json: async () => ({ ok: true, data: { fixture: { id, status: "finished" }, events } }) };
}

test("existing 45-second cadence refreshes events without a goal and replaces corrected/final snapshots", async () => {
  const h = harness(); const stop = h.select(7)!;
  h.requests[0].result.resolve(response(7, ["yellow"])); await flush();
  await h.tick(); assert.equal(h.requests.length, 2);
  h.requests[1].result.resolve(response(7, ["yellow", "substitution"])); await flush();
  await h.tick();
  h.requests[2].result.resolve(response(7, ["substitution", "late-final-correction"])); await flush();
  assert.deepEqual(h.snapshots.map(s => { assert.ok(s); return s.events; }), [["yellow"], ["yellow", "substitution"], ["substitution", "late-final-correction"]]);
  assert.equal(h.timerCount, 1);
  stop(); h.stopPolling(); assert.equal(h.timerActive, false);
  assert.equal(h.deadlineCount, 0);
});

test("one in-flight detail request; hidden tabs skip reads and resume on next existing cycle", async () => {
  const h = harness(); const stop = h.select(7)!;
  await h.tick(); await h.tick(); assert.equal(h.requests.length, 1);
  h.requests[0].result.resolve(response(7, [])); await flush();
  h.visibility.visibilityState = "hidden"; await h.tick(); assert.equal(h.requests.length, 1);
  h.visibility.visibilityState = "visible"; assert.equal(h.requests.length, 1);
  await h.tick(); assert.equal(h.requests.length, 2);
  stop(); assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(h.deadlineCount, 0);
  h.requests[1].result.resolve(response(7, ["after-unmount"])); await flush(); assert.equal(h.snapshots.length, 1);
  h.stopPolling();
});

test("A to B discards stale A even if JSON resolves after abort", async () => {
  const h = harness(); const stopA = h.select(7)!;
  const json = deferred<unknown>();
  h.requests[0].result.resolve({ status: 200, ok: true, json: () => json.promise }); await flush();
  stopA(); assert.equal(h.deadlineCount, 0); const stopB = h.select(8)!;
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[1].result.resolve(response(8, ["B"])); await flush();
  json.resolve({ ok: true, data: { fixture: { id: 7 }, events: ["stale A"] } }); await flush();
  assert.deepEqual(h.snapshots.map(s => { assert.ok(s); return s.fixture.id; }), [8]);
  stopB(); h.stopPolling();
  assert.equal(h.deadlineCount, 0);
});

for (const stalledPhase of ["fetch", "body"] as const) {
  test(`${stalledPhase} deadline permits next cycle and rejects a late previous attempt`, async () => {
    const h = harness(); const stop = h.select(7)!;
    h.requests[0].result.resolve(response(7, ["verified"])); await flush();
    await h.tick();
    const oldBody = deferred<unknown>();
    if (stalledPhase === "body") {
      h.requests[1].result.resolve({ status: 200, ok: true, json: () => oldBody.promise });
      await flush();
    }
    assert.equal(h.deadlineCount, 1);
    await h.expire();
    assert.equal(h.requests[1].signal.aborted, true);
    assert.equal(h.deadlineCount, 0);
    assert.deepEqual(h.snapshots.map(snapshot => { assert.ok(snapshot); return snapshot.events; }), [["verified"]]);
    await h.tick(); assert.equal(h.requests.length, 3);
    // The old request settles while its successor is still reading. Its
    // finally block must not release the successor's single-flight guard.
    if (stalledPhase === "fetch") h.requests[1].result.resolve(response(7, ["late-old"]));
    else oldBody.resolve({ ok: true, data: { fixture: { id: 7 }, events: ["late-old"] } });
    await flush();
    await h.tick(); assert.equal(h.requests.length, 3);
    assert.equal(h.deadlineCount, 1);
    h.requests[2].result.resolve(response(7, ["recovered"])); await flush();
    assert.deepEqual(h.snapshots.map(snapshot => { assert.ok(snapshot); return snapshot.events; }), [["verified"], ["recovered"]]);
    assert.equal(h.deadlineCount, 0);
    stop(); h.stopPolling();
    assert.equal(h.timerActive, false);
  });
}

test("503 and network failure retain detail; 401 removes protected snapshot; auth gate makes no request", async () => {
  const h = harness(); assert.equal(h.select(7, false), undefined); assert.equal(h.requests.length, 0);
  const stop = h.select(7)!;
  h.requests[0].result.resolve(response(7, ["verified"])); await flush();
  await h.tick(); h.requests[1].result.resolve(response(7, [], 503)); await flush();
  await h.tick(); h.requests[2].result.reject(new Error("offline")); await flush();
  assert.equal(h.snapshots.length, 1);
  await h.tick(); h.requests[3].result.resolve({ status: 401, ok: false, json: () => { throw new Error("must not parse unauthorized body"); } }); await flush();
  assert.equal(h.snapshots.length, 2); assert.equal(h.snapshots[1], null);
  stop(); h.stopPolling();
});
