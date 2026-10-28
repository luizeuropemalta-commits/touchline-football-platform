import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/touchline/social/TouchlinePlayerSocialActions.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("social.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "PlayerSocialActions");
assert.ok(component && ts.isFunctionDeclaration(component) && component.body);
const callbacks = component.body.statements.flatMap(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "useEffect"
  ? [node.expression.arguments[0].getText(ast)] : []);
const callback = callbacks.find(text => text.includes("setInterval") && text.includes("requestPlayerSocial"));
assert.ok(callback, "exercise the actual periodic effect, not a duplicated implementation");

function harness() {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  const listeners = new Map<string, () => void>();
  const updates: [string, unknown][] = [];
  let sequence = 0, reads = 0;
  let pending: { resolve: (value: unknown) => void; signal: AbortSignal } | undefined;
  const ctx = {
    phase: "ready", providerId: "123", mutationBusy: { current: false }, polling: { current: null as AbortController | null },
    setSummary: (value: unknown) => updates.push(["summary", value]),
    setCanReact: (value: unknown) => updates.push(["canReact", value]),
    setPhase: (value: string) => { ctx.phase = value; updates.push(["phase", value]); },
  };
  const events = {
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string, listener: () => void) => { if (listeners.get(name) === listener) listeners.delete(name); },
  };
  const document = { ...events, visibilityState: "visible" }, navigator = { onLine: true };
  const exported = {} as { make: (context: typeof ctx) => () => void };
  const compiled = ts.transpileModule(`exports.make = ctx => {
    const { phase, providerId, mutationBusy, polling, setSummary, setCanReact, setPhase } = ctx;
    return (${callback})();
  };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, {
    exports: exported, AbortController, DOMException, Error, document, navigator, window: events,
    requestPlayerSocial: (id: string, input: { signal: AbortSignal; mutation?: unknown }) => {
      assert.equal(id, "123"); assert.equal(input.mutation, undefined); reads++;
      return new Promise((resolve, reject) => {
        pending = { resolve, signal: input.signal };
        input.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    },
    setTimeout: (fn: () => void, ms: number) => { const id = ++sequence; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    setInterval: (fn: () => void, ms: number) => { const id = ++sequence; intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id: number) => intervals.delete(id),
  });
  return { ctx, updates, document, navigator, listeners, timers, intervals, start: () => exported.make(ctx),
    reads: () => reads, settle: () => { assert.ok(pending); return pending; },
    tick: () => [...intervals.values()].forEach(timer => { assert.equal(timer.ms, 30_000); timer.fn(); }),
    timeout: () => [...timers.values()].forEach(timer => { assert.equal(timer.ms, 15_000); timer.fn(); }),
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const valid = { summary: { followerCount: 0, likeCount: 12, following: false, liked: true }, canReact: true };

test("social refresh skips hidden/offline pages and coalesces overlapping reads", async () => {
  const h = harness(), cleanup = h.start();
  h.document.visibilityState = "hidden"; h.tick(); assert.equal(h.reads(), 0);
  h.document.visibilityState = "visible"; h.navigator.onLine = false; h.tick(); assert.equal(h.reads(), 0);
  h.navigator.onLine = true; h.listeners.get("online")!(); h.tick(); assert.equal(h.reads(), 1);
  h.settle().resolve(valid); await flush(); assert.equal(h.updates[0][1], valid.summary);
  cleanup(); assert.equal(h.listeners.size, 0); assert.equal(h.intervals.size, 0);
});
test("social read cancelled before mutation cannot overwrite its receipt", async () => {
  const h = harness(), cleanup = h.start(); h.tick();
  h.ctx.mutationBusy.current = true; h.ctx.polling.current!.abort(); h.settle().resolve(valid);
  await flush(); assert.deepEqual(h.updates, []); cleanup();
});
test("unmount cancels social polling and ignores late responses", async () => {
  const h = harness(), cleanup = h.start(); h.tick(); cleanup();
  assert.equal(h.settle().signal.aborted, true); h.settle().resolve(valid); await flush();
  assert.deepEqual(h.updates, []); assert.equal(h.listeners.size, 0); assert.equal(h.intervals.size, 0);
});
test("social timeout closes permission and online recovers using GET only", async () => {
  const h = harness(); let cleanup = h.start(); h.tick(); h.timeout(); await flush();
  assert.equal(h.ctx.phase, "error"); assert.equal(h.updates.find(([key]) => key === "summary")![1], null);
  assert.equal(h.updates.find(([key]) => key === "canReact")![1], false);
  cleanup(); cleanup = h.start(); h.listeners.get("online")!(); assert.equal(h.reads(), 2);
  h.settle().resolve(valid); await flush(); assert.equal(h.ctx.phase, "ready");
  assert.equal(h.updates.at(-3)![1], valid.summary); cleanup();
});
