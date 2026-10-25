import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("strip.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects: ts.CallExpression[] = [];
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect"
    && node.arguments[0]?.getText(ast).includes("const revealFocusedFixture =")) effects.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(effects.length, 1, "extract the actual focus effect, not a rewritten algorithm");
assert.equal(effects[0].arguments[1]?.getText(ast), "[]", "focus recovery does not depend on canLoop");
const effectCode = ts.transpileModule(`(${effects[0].arguments[0].getText(ast)})()`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

// This is an effect lifecycle/geometry contract, not a native Tab or browser
// layout proof. Rectangles are supplied independently; scrolling is recorded,
// never simulated by silently moving a target into view.
function setup(options: { viewportMissing?: boolean; clientLeft?: number } = {}) {
  class Element {
    isConnected = true;
    reads = 0;
    left: number;
    right: number;
    constructor(left: number, right: number) { this.left = left; this.right = right; }
    getBoundingClientRect() { this.reads++; return { left: this.left, right: this.right }; }
  }
  type Listener = (event: { target: unknown }) => void;
  const listeners = new Map<string, Set<Listener>>();
  const frames = new Map<number, () => void>();
  const cancelled: number[] = [];
  const writes: Array<{ left: number; behavior: string; keys: string[] }> = [];
  let serial = 0;
  const originalMembers = new Set<unknown>();
  const viewportMembers = new Set<unknown>();
  const originalRun = { current: { contains: (target: unknown) => originalMembers.has(target) } };
  const document = { activeElement: null as unknown,
    scrollBy: () => { throw new Error("document must never be scrolled"); } };
  const node = Object.assign(new Element(100, 310), {
    clientLeft: options.clientLeft ?? 3, clientWidth: 200,
    contains: (target: unknown) => viewportMembers.has(target),
    addEventListener(type: string, callback: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
    },
    removeEventListener(type: string, callback: Listener) { listeners.get(type)?.delete(callback); },
    scrollBy(value: { left: number; behavior: string }) {
      writes.push({ left: value.left, behavior: value.behavior, keys: Object.keys(value).sort() });
    },
  });
  const cleanup = vm.runInNewContext(effectCode, {
    viewport: { current: options.viewportMissing ? null : node }, originalRun, document, HTMLElement: Element,
    requestAnimationFrame: (callback: () => void) => { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: (id: number) => { cancelled.push(id); frames.delete(id); },
    window: { scrollBy: () => { throw new Error("window must never be scrolled"); } },
  }) as (() => void) | undefined;
  const emit = (type: string, target: unknown) => {
    for (const callback of listeners.get(type) ?? []) callback({ target });
  };
  return {
    node, document, frames, writes, cancelled, originalRun, viewportMembers,
    cleanup: () => cleanup?.(), listenerCount: () => [...listeners.values()].reduce((sum, list) => sum + list.size, 0),
    target(left: number, right: number, original = true) {
      const target = new Element(left, right);
      viewportMembers.add(target); if (original) originalMembers.add(target);
      return target;
    },
    focus(target: unknown) { document.activeElement = target; emit("focusin", target); },
    focusOut(target: unknown) { emit("focusout", target); document.activeElement = null; },
    takeFrame() {
      assert.equal(frames.size, 1);
      const [id, callback] = [...frames][0]; frames.delete(id);
      return { id, callback };
    },
  };
}

test("focus reveal uses the viewport clientbox for exact left and right deltas", () => {
  for (const sample of [{ left: 80, right: 160, delta: -23 }, { left: 260, right: 340, delta: 37 }]) {
    const h = setup(); const target = h.target(sample.left, sample.right);
    h.focus(target); assert.deepEqual(h.writes, [], "defer until native focus scrolling has finished");
    h.takeFrame().callback();
    assert.deepEqual(h.writes, [{ left: sample.delta, behavior: "instant", keys: ["behavior", "left"] }]);
    assert.equal(target.reads, 1); h.cleanup();
  }
});

test("a completely visible fixture causes no scroll, including exact clientbox edges", () => {
  for (const [left, right] of [[103, 303], [120, 200]]) {
    const h = setup(); h.focus(h.target(left, right)); h.takeFrame().callback();
    assert.deepEqual(h.writes, []); h.cleanup();
  }
});

test("clones and non-HTMLElement focus targets never schedule a reveal", () => {
  const h = setup();
  h.focus(h.target(20, 90, false)); assert.equal(h.frames.size, 0);
  h.focus({ left: 20, right: 90, isConnected: true }); assert.equal(h.frames.size, 0);
  h.focus(null); assert.equal(h.frames.size, 0);
  assert.deepEqual(h.writes, []); h.cleanup();
});

test("a new focus cancels the older RAF and only reveals the active original", () => {
  const h = setup(); const first = h.target(20, 90), second = h.target(280, 350);
  h.focus(first); const firstId = [...h.frames.keys()][0];
  h.focus(second); assert.ok(h.cancelled.includes(firstId)); assert.equal(h.frames.size, 1);
  h.takeFrame().callback();
  assert.deepEqual(h.writes, [{ left: 47, behavior: "instant", keys: ["behavior", "left"] }]);
  assert.equal(first.reads, 0); h.cleanup();
});

test("focusout and unmount cancel scheduled work and remove both listeners", () => {
  const h = setup(); const target = h.target(20, 90);
  assert.equal(h.listenerCount(), 2);
  h.focus(target); const firstId = [...h.frames.keys()][0]; h.focusOut(target);
  assert.equal(h.frames.size, 0); assert.ok(h.cancelled.includes(firstId));
  h.focus(target); const secondId = [...h.frames.keys()][0]; h.cleanup();
  assert.equal(h.frames.size, 0); assert.ok(h.cancelled.includes(secondId)); assert.equal(h.listenerCount(), 0);
  h.focus(target); assert.equal(h.frames.size, 0); assert.deepEqual(h.writes, []);
});

test("already dequeued RAF cannot act after disposal, detachment or focus change", () => {
  for (const reason of ["unmount", "detached", "other-focus", "outside-viewport"] as const) {
    const h = setup(); const target = h.target(20, 90);
    h.focus(target); const { callback } = h.takeFrame();
    if (reason === "unmount") h.cleanup();
    if (reason === "detached") target.isConnected = false;
    if (reason === "other-focus") h.document.activeElement = h.target(150, 220);
    if (reason === "outside-viewport") h.viewportMembers.delete(target);
    callback(); assert.deepEqual(h.writes, [], reason); assert.equal(target.reads, 0, reason);
    h.cleanup();
  }
});

test("the listener uses the latest original-run ref without rebinding", () => {
  const h = setup(); const oldTarget = h.target(20, 90), newTarget = h.target(270, 330, false);
  h.originalRun.current = { contains: target => target === newTarget };
  h.focus(oldTarget); assert.equal(h.frames.size, 0);
  h.focus(newTarget); h.takeFrame().callback();
  assert.deepEqual(h.writes, [{ left: 27, behavior: "instant", keys: ["behavior", "left"] }]);
  h.cleanup();
});

test("missing viewport returns without listeners or scheduled work", () => {
  const h = setup({ viewportMissing: true });
  assert.equal(h.listenerCount(), 0); assert.equal(h.frames.size, 0); assert.deepEqual(h.writes, []); h.cleanup();
});
