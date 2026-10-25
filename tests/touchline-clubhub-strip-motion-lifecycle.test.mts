import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { fixtureStripFrameDistance, wrapFixtureStripOffset, normalizeFixtureStripScrollOffset } from "../lib/touchlineArena/fixture-strip-motion.ts";

const source = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("strip.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let geometryEffect = "", motionEffect = "", interactionEffect = "";
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") {
    const body = node.arguments[0]?.getText(ast) ?? "";
    if (body.includes("const measure =")) geometryEffect = body;
    if (body.includes("const reducedMotion =")) motionEffect = body;
    if (body.includes("const notify =")) interactionEffect = body;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(geometryEffect && motionEffect && interactionEffect, "exercise actual geometry, interaction and animation effects, not a reimplementation");

type Listener = (event?: { pointerType?: string }) => void;
function eventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, callback: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(callback);
    },
    removeEventListener(type: string, callback: Listener) { listeners.get(type)?.delete(callback); },
    emit(type: string, event?: { pointerType?: string }) { for (const callback of listeners.get(type) ?? []) callback(event); },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}
function setup(options: { width?: number; reduced?: boolean; intersectionObserver?: boolean; quantize?: (offset: number) => number } = {}) {
  let width = options.width ?? 1000, viewportWidth = 200, left = 1000, now = 100;
  let reads = 0, writes = 0, serial = 0, disconnected = 0, looping = width > viewportWidth;
  const frames = new Map<number, (time: number) => void>();
  const timers = new Map<number, { callback: () => void; due: number }>();
  const microtasks: Array<() => void> = [];
  const documentEvents = eventTarget(), windowEvents = eventTarget(), stripEvents = eventTarget(), nodeEvents = eventTarget(), mediaEvents = eventTarget();
  const originalFocus = {}, arrowFocus = {};
  let pendingScroll = false;
  const document = { ...documentEvents, hidden: false, activeElement: null as object | null };
  const reduced = { ...mediaEvents, matches: options.reduced ?? false };
  const strip = { ...stripEvents, contains: (element: unknown) => element === originalFocus || element === arrowFocus };
  const run = { getBoundingClientRect: () => { reads++; return { width }; }, contains: (element: unknown) => element === originalFocus };
  const node = { ...nodeEvents, parentElement: strip,
    get clientWidth() { reads++; return viewportWidth; },
    get scrollLeft() { return left; }, set scrollLeft(value: number) {
      writes++;
      const next = options.quantize ? options.quantize(value) : value;
      if (next !== left && options.quantize) pendingScroll = true;
      left = next;
    },
  };
  const cycleWidth = { current: looping ? width : 0 };
  const interaction = { current: { hovered: false, touching: false, resumeAfter: 0 } };
  const synchronizeMotion = { current: null as (() => void) | null };
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {}, resize: () => void = () => {};
  const context = vm.createContext({
    viewport: { current: node }, originalRun: { current: run }, cycleWidth, interaction, synchronizeMotion, canLoop: looping,
    setCanLoop: (value: boolean) => { looping = value; }, document,
    fixtureStripFrameDistance, wrapFixtureStripOffset, normalizeFixtureStripScrollOffset, performance: { now: () => now },
    queueMicrotask: (callback: () => void) => microtasks.push(callback),
    window: { ...windowEvents, matchMedia: () => reduced,
      setTimeout: (callback: () => void, delay: number) => { timers.set(++serial, { callback, due: now + delay }); return serial; },
      clearTimeout: (id: number) => timers.delete(id),
    },
    requestAnimationFrame: (callback: (time: number) => void) => { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    IntersectionObserver: options.intersectionObserver === false ? undefined : class { constructor(callback: typeof intersect) { intersect = callback; } observe() {} disconnect() { disconnected++; } },
    ResizeObserver: class { constructor(callback: typeof resize) { resize = callback; } observe() {} disconnect() { disconnected++; } },
  });
  const code = (body: string) => ts.transpileModule(`(${body})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let cleanupGeometry = vm.runInContext(code(geometryEffect), context) as (() => void) | undefined;
  let cleanupInteraction = vm.runInContext(code(interactionEffect), context) as (() => void) | undefined;
  let cleanupMotion = vm.runInContext(code(motionEffect), context) as (() => void) | undefined;
  function cleanup() {
    cleanupMotion?.(); cleanupInteraction?.(); cleanupGeometry?.();
    cleanupMotion = cleanupInteraction = cleanupGeometry = undefined;
  }
  function commitOverflow() {
    cleanupMotion?.(); cleanupGeometry?.();
    context.canLoop = looping;
    cleanupGeometry = vm.runInContext(code(geometryEffect), context);
    cleanupMotion = vm.runInContext(code(motionEffect), context);
  }
  return {
    node, cycleWidth, frames, timers, cleanup, commitOverflow, interaction, synchronizeMotion,
    strictReplay: () => {
      cleanup();
      cleanupGeometry = vm.runInContext(code(geometryEffect), context);
      cleanupInteraction = vm.runInContext(code(interactionEffect), context);
      cleanupMotion = vm.runInContext(code(motionEffect), context);
    },
    stats: () => ({ reads, writes, disconnected, looping }),
    listeners: () => documentEvents.count() + windowEvents.count() + stripEvents.count() + nodeEvents.count() + mediaEvents.count(),
    intersect: (visible: boolean) => intersect([{ isIntersecting: visible }]),
    resize: (nextWidth: number, nextViewport = viewportWidth) => { width = nextWidth; viewportWidth = nextViewport; resize(); },
    hidden: (value: boolean) => { document.hidden = value; documentEvents.emit("visibilitychange"); },
    reduce: (value: boolean) => { reduced.matches = value; mediaEvents.emit("change"); },
    focus: () => { document.activeElement = originalFocus; stripEvents.emit("focusin"); },
    blur: () => { stripEvents.emit("focusout"); document.activeElement = null; },
    flushMicrotasks: () => { microtasks.splice(0).forEach(callback => callback()); },
    hover: (value: boolean) => stripEvents.emit(value ? "pointerenter" : "pointerleave", { pointerType: "mouse" }),
    touch: (value: boolean) => value ? stripEvents.emit("pointerdown") : windowEvents.emit("pointerup"),
    wheel: () => nodeEvents.emit("wheel"),
    scroll: (value: number) => { node.scrollLeft = value; if (!options.quantize) nodeEvents.emit("scroll"); },
    flushScroll: () => {
      // Browser scroll events are queued and coalesced, not dispatched by the
      // setter. Include feedback writes from normalization without recursion.
      let events = 0;
      while (pendingScroll) {
        assert.ok(events++ < 10, "native scroll feedback must settle");
        pendingScroll = false;
        nodeEvents.emit("scroll");
      }
      return events;
    },
    tick: (time: number) => { now = time; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); },
    advance: (time: number) => { now = time; for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.callback(); } },
  };
}

test("offscreen and hidden strips schedule no animation; resume never catches up", () => {
  const h = setup(); assert.equal(h.frames.size, 0);
  h.intersect(true); assert.equal(h.frames.size, 1);
  const reads = h.stats().reads;
  h.tick(100); h.tick(150); assert.ok(h.node.scrollLeft > 1000);
  assert.equal(h.stats().reads, reads, "no geometry reads in animation frames");
  h.intersect(false); assert.equal(h.frames.size, 0);
  const position = h.node.scrollLeft;
  h.intersect(true); h.tick(10_000); assert.equal(h.node.scrollLeft, position);
  h.hidden(true); assert.equal(h.frames.size, 0);
  h.hidden(false); assert.equal(h.frames.size, 1); h.cleanup();
});

test("reduced motion and no overflow keep the loop stopped", () => {
  const h = setup({ reduced: true }); h.intersect(true); assert.equal(h.frames.size, 0);
  h.reduce(false); assert.equal(h.frames.size, 1); h.reduce(true); assert.equal(h.frames.size, 0); h.cleanup();
  const short = setup({ width: 180 }); assert.equal(short.frames.size, 0);
  assert.equal(short.listeners(), 6, "only passive interaction observation survives without overflow");
  short.cleanup(); assert.equal(short.listeners(), 0);
});

test("without IntersectionObserver document visibility and reduced-motion still pause safely", () => {
  const h = setup({ intersectionObserver: false }); assert.equal(h.frames.size, 1);
  h.hidden(true); assert.equal(h.frames.size, 0); h.hidden(false); assert.equal(h.frames.size, 1);
  h.reduce(true); assert.equal(h.frames.size, 0); h.cleanup(); assert.equal(h.listeners(), 0);
  const reduced = setup({ intersectionObserver: false, reduced: true }); assert.equal(reduced.frames.size, 0); reduced.cleanup();
});

test("focus pauses and focusout resumes only after activeElement changes", () => {
  const h = setup(); h.intersect(true); h.focus(); assert.equal(h.frames.size, 0);
  h.blur(); assert.equal(h.frames.size, 0);
  h.flushMicrotasks(); assert.equal(h.frames.size, 1); h.cleanup();
});

test("pointer and wheel interaction pause motion with a bounded quiet period", () => {
  const h = setup(); h.intersect(true);
  h.hover(true); assert.equal(h.frames.size, 0); h.hover(false); assert.equal(h.frames.size, 1);
  h.touch(true); assert.equal(h.frames.size, 0); h.touch(false); assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 1); h.advance(2600); assert.equal(h.frames.size, 1);
  h.wheel(); assert.equal(h.frames.size, 0); h.advance(5100); assert.equal(h.frames.size, 1); h.cleanup();
});

test("geometry resize preserves cycle progress and stops declaring overflow when content fits", () => {
  const h = setup(); h.scroll(1250); h.resize(800);
  assert.equal(h.cycleWidth.current, 800); assert.equal(h.node.scrollLeft, 1000);
  h.resize(180); assert.equal(h.stats().looping, false); assert.equal(h.cycleWidth.current, 0); h.cleanup();
});

test("both scroll seams normalize without moving a focused original link", () => {
  const h = setup(); h.scroll(995); assert.equal(h.node.scrollLeft, 1995);
  h.scroll(2005); assert.equal(h.node.scrollLeft, 1005);
  h.focus(); h.scroll(995); assert.equal(h.node.scrollLeft, 995); h.cleanup();
});

test("unmount releases timers, observers and listeners and fences queued callbacks", () => {
  const h = setup(); h.intersect(true); h.focus(); h.blur();
  h.cleanup(); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.listeners(), 0); assert.equal(h.stats().disconnected, 2);
  h.flushMicrotasks(); h.intersect(true); h.tick(10000);
  assert.equal(h.frames.size, 0, "late microtask or observer cannot restart a disposed loop");
});

test("hover before delayed overflow survives activation, deactivation and reactivation", () => {
  const h = setup({ width: 180 });
  h.hover(true);
  h.resize(1000); h.commitOverflow(); h.intersect(true);
  assert.equal(h.frames.size, 0, "an already-hovered strip must not begin moving when data arrives");
  h.resize(180); h.commitOverflow();
  assert.equal(h.synchronizeMotion.current, null);
  h.resize(1000); h.commitOverflow(); h.intersect(true);
  assert.equal(h.frames.size, 0);
  h.hover(false); assert.equal(h.frames.size, 1);
  h.cleanup(); assert.equal(h.listeners(), 0);
});

test("pointer held before overflow pauses until release and preserves its quiet period", () => {
  const h = setup({ width: 180 }); h.touch(true);
  h.resize(1000); h.commitOverflow(); h.intersect(true);
  assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  h.touch(false); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 1);
  h.advance(2599); assert.equal(h.frames.size, 0);
  h.advance(2600); assert.equal(h.frames.size, 1);
  h.cleanup();
});

test("wheel cooldown recorded without overflow is not discarded on activation", () => {
  const h = setup({ width: 180 }); h.wheel();
  h.advance(500); h.resize(1000); h.commitOverflow(); h.intersect(true);
  assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 1);
  h.advance(2599); assert.equal(h.frames.size, 0);
  h.advance(2600); assert.equal(h.frames.size, 1); h.cleanup();
});

test("StrictMode effect replay retains interaction without duplicate listeners or stale callbacks", () => {
  const h = setup(); h.intersect(true); h.hover(true);
  const listeners = h.listeners(), oldSynchronize = h.synchronizeMotion.current;
  h.strictReplay(); h.intersect(true);
  assert.equal(h.listeners(), listeners); assert.equal(h.frames.size, 0);
  oldSynchronize?.(); assert.equal(h.frames.size, 0);
  h.hover(false); assert.equal(h.frames.size, 1);
  h.touch(true); h.touch(false); assert.equal(h.timers.size, 1);
  const latestSynchronize = h.synchronizeMotion.current;
  h.cleanup(); assert.equal(h.synchronizeMotion.current, null);
  assert.equal(h.listeners(), 0); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  const before = { ...h.interaction.current };
  h.hover(true); h.touch(true); h.wheel(); latestSynchronize?.(); oldSynchronize?.();
  h.advance(10000); h.flushMicrotasks();
  assert.deepEqual(h.interaction.current, before);
  assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
});

for (const [rounding, quantize] of [["floor", Math.floor], ["round", Math.round]] as const) {
  for (const fps of [60, 120]) {
    test(`actual animation crosses fractional seams at ${fps}Hz with ${rounding} native scroll feedback`, () => {
      const width = 1473.4375;
      const h = setup({ width, quantize, reduced: true });
      h.intersect(true);
      h.scroll(width);
      const reducedPosition = h.node.scrollLeft, reducedWrites = h.stats().writes;
      h.flushScroll(); h.tick(100); h.tick(200);
      assert.equal(h.node.scrollLeft, reducedPosition, "reduced motion stays still at the quantized lower seam");
      assert.equal(h.stats().writes, reducedWrites, "normalization must not move a native reading within one pixel of the seam");
      assert.equal(h.frames.size, 0);

      h.scroll(2 * width - 2); h.flushScroll();
      h.reduce(false); h.tick(200);
      let distance = 0, crossings = 0;
      const reads = h.stats().reads;
      for (let frame = 1; frame <= 2 * fps; frame++) {
        const before = h.node.scrollLeft;
        h.tick(200 + frame * 1000 / fps);
        const animated = h.node.scrollLeft;
        h.flushScroll();
        assert.equal(h.node.scrollLeft, animated, "queued normalization must preserve the animation write");
        const step = ((animated - before) % width + width) % width;
        assert.ok(step >= 0 && step <= 2, `bounded frame movement: ${before} -> ${animated}`);
        distance += step;
        if (animated < before) crossings++;
      }
      assert.equal(crossings, 1, "the real animation crosses the upper seam once");
      // Less than one pixel can remain in the fractional frame accumulator,
      // and the single seam can lose/gain less than one native pixel.
      assert.ok(Math.abs(distance - 60) < 2, `fractional frame accumulation preserves 30px/s: ${distance}`);
      assert.equal(h.stats().reads, reads, "animation performs no geometry reads");

      h.reduce(true);
      const paused = h.node.scrollLeft;
      h.tick(10_000); h.flushScroll();
      assert.equal(h.node.scrollLeft, paused); assert.equal(h.frames.size, 0);
      h.reduce(false); h.tick(20_000); h.flushScroll();
      assert.equal(h.node.scrollLeft, paused, "resume does not catch up suspended time");
      h.scroll(width - 5);
      const beforeCleanup = h.stats().writes;
      h.cleanup();
      assert.equal(h.flushScroll(), 1, "deliver a native event already queued before cleanup");
      h.tick(30_000);
      assert.equal(h.stats().writes, beforeCleanup, "queued events cannot normalize after cleanup");
      assert.equal(h.listeners(), 0); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
    });
  }
}
