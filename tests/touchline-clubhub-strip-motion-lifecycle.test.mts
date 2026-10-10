import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("strip.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect = "";
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("const node = viewport.current")) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect, "exercise the actual product animation effect");

function setup(paused = false, held = false) {
  let reads = 0, writes = 0, left = 0, width = 1000, next = 0;
  const frames = new Map<number, (time: number) => void>();
  const documentEvents = new Map<string, () => void>(), mediaEvents = new Map<string, () => void>();
  const document = { hidden: false, addEventListener: (type: string, cb: () => void) => documentEvents.set(type, cb), removeEventListener: (type: string) => documentEvents.delete(type) };
  const reduced = { matches: false, addEventListener: (type: string, cb: () => void) => mediaEvents.set(type, cb), removeEventListener: (type: string) => mediaEvents.delete(type) };
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {}, resize: () => void = () => {};
  let disconnected = 0;
  const node = {
    firstElementChild: {},
    get scrollWidth() { reads++; return width; }, get clientWidth() { reads++; return 200; },
    get scrollLeft() { return left; }, set scrollLeft(value: number) { writes++; left = value; },
  };
  const code = ts.transpileModule(`const run = ${effect}; run();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const cleanup = vm.runInNewContext(code, {
    viewport: { current: node }, paused, held, document, window: { matchMedia: () => reduced },
    requestAnimationFrame: (cb: (time: number) => void) => { frames.set(++next, cb); return next; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    IntersectionObserver: class { constructor(cb: typeof intersect) { intersect = cb; } observe() {} disconnect() { disconnected++; } },
    ResizeObserver: class { constructor(cb: typeof resize) { resize = cb; } observe() {} disconnect() { disconnected++; } },
  }) as (() => void) | undefined;
  return {
    frames, node, cleanup,
    stats: () => ({ reads, writes, disconnected }),
    intersect: (visible: boolean) => intersect([{ isIntersecting: visible }]),
    resize: (value: number) => { width = value; resize(); },
    hidden: (value: boolean) => { document.hidden = value; documentEvents.get("visibilitychange")?.(); },
    reduce: (value: boolean) => { reduced.matches = value; mediaEvents.get("change")?.(); },
    events: () => documentEvents.size + mediaEvents.size,
    tick: (time: number) => { const entries = [...frames]; frames.clear(); entries.forEach(([, cb]) => cb(time)); },
  };
}

test("strip has no offscreen RAF, caches geometry, and resumes without a time jump", () => {
  const h = setup();
  assert.equal(h.frames.size, 0);
  h.intersect(true); assert.equal(h.frames.size, 1);
  const reads = h.stats().reads;
  h.tick(100); h.tick(116); h.tick(132);
  assert.ok(h.node.scrollLeft > 0, "positive motion control");
  assert.equal(h.stats().reads, reads, "no geometry reads inside animation frames");
  h.intersect(false); assert.equal(h.frames.size, 0);
  const position = h.node.scrollLeft, writes = h.stats().writes;
  h.tick(5000); assert.equal(h.stats().writes, writes);
  h.intersect(true); h.tick(6000); assert.equal(h.node.scrollLeft, position);
  h.tick(6016); assert.ok(h.node.scrollLeft > position);
  h.cleanup?.(); assert.equal(h.frames.size, 0); assert.equal(h.events(), 0); assert.equal(h.stats().disconnected, 2);
  h.intersect(true); assert.equal(h.frames.size, 0, "late observer callback cannot restart disposed effect");
});

test("strip stops scheduling for hidden documents, reduced motion, no overflow, and manual holds", () => {
  const h = setup(); h.intersect(true);
  h.hidden(true); assert.equal(h.frames.size, 0);
  h.hidden(false); assert.equal(h.frames.size, 1);
  h.reduce(true); assert.equal(h.frames.size, 0);
  h.reduce(false); assert.equal(h.frames.size, 1);
  h.resize(200); assert.equal(h.frames.size, 0);
  h.resize(1200); assert.equal(h.frames.size, 1);
  h.cleanup?.();
  for (const [paused, held] of [[true, false], [false, true]]) {
    const stopped = setup(paused, held); stopped.intersect(true);
    assert.equal(stopped.frames.size, 0); assert.equal(stopped.events(), 0);
  }
});
