import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Position = { left: number; top: number } | null;
type Listener = () => void;
function eventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    listeners,
    addEventListener(type: string, callback: Listener) {
      const group = listeners.get(type) ?? new Set<Listener>();
      group.add(callback); listeners.set(type, group);
    },
    removeEventListener(type: string, callback: Listener) { listeners.get(type)?.delete(callback); },
    emit(type: string) { for (const callback of listeners.get(type) ?? []) callback(); },
    count() { return [...listeners.values()].reduce((sum, group) => sum + group.size, 0); },
  };
}

for (const name of ["TouchlineMatchCardBadge", "TouchlinePlayerAvailabilityBadge"]) {
  const source = readFileSync(new URL(`../components/touchline/cards/${name}.tsx`, import.meta.url), "utf8");
  const file = ts.createSourceFile(`${name}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects: ts.ArrowFunction[] = [];
  let scrollHelper: ts.FunctionDeclaration | undefined;
  let keyHandler: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "useLayoutEffect" && ts.isArrowFunction(node.arguments[0])) {
      effects.push(node.arguments[0]);
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === "scrollTooltip") scrollHelper = node;
    if (ts.isJsxAttribute(node) && node.name.getText(file) === "onKeyDown"
      && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && ts.isArrowFunction(node.initializer.expression)) keyHandler = node.initializer.expression;
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(effects.length, 1);
  assert.ok(scrollHelper && keyHandler);
  const script = ts.transpileModule(`exports.install = ${effects[0].getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;

  // Exercise the actual effect with controlled geometry and event delivery.
  // This verifies placement/lifecycle, not native pinch or a browser CSS engine.
  function fixture({ visual = true, open = true, height = 260, contentHeight = 64 } = {}) {
    const windowEvents = eventTarget(), viewportEvents = eventTarget(), documentEvents = eventTarget();
    const viewport = { ...viewportEvents, width: 180, height, offsetLeft: 73, offsetTop: 41 };
    const frames = new Map<number, Listener>();
    const properties = new Map<string, string>();
    const metrics = { measurements: 0, styleWrites: 0, commits: 0, observed: 0, disconnected: 0, cancelledLeave: 0 };
    let serial = 0, position: Position = null;
    let resized: Listener = () => {};
    const anchor = { left: 360, top: 160, width: 30, height: 38, bottom: 198 };
    const tooltip = {
      style: {
        getPropertyValue(key: string) { return properties.get(key) ?? ""; },
        setProperty(key: string, value: string) { properties.set(key, value); metrics.styleWrites++; },
      },
      getBoundingClientRect() {
        metrics.measurements++;
        assert.ok(properties.has("--touchline-tooltip-available-width"), "constrain width before measuring the text");
        assert.ok(properties.has("--touchline-tooltip-available-height"), "constrain height before measuring the text");
        // The controlled box models a long tooltip constrained by the CSS var.
        return { width: Math.min(260, Number.parseFloat(properties.get("--touchline-tooltip-available-width")!)),
          height: Math.min(contentHeight, Number.parseFloat(properties.get("--touchline-tooltip-available-height")!)) };
      },
    };
    const windowObject = {
      ...windowEvents, visualViewport: visual ? viewport : null, innerWidth: 844, innerHeight: 390,
      requestAnimationFrame(callback: Listener) { frames.set(++serial, callback); return serial; },
      cancelAnimationFrame(id: number) { frames.delete(id); },
    };
    const exports = {} as { install: () => (() => void) | undefined };
    runInNewContext(script, {
      exports, open, window: windowObject, document: documentEvents,
      trigger: { current: { getBoundingClientRect: () => { metrics.measurements++; return anchor; } } },
      tooltip: { current: tooltip },
      setPosition(update: (previous: Position) => Position) {
        const next = update(position);
        if (next !== position) metrics.commits++;
        position = next;
      },
      setOpen() { throw new Error("geometry must not dismiss or activate the badge"); },
      cancelLeave() { metrics.cancelledLeave++; },
      ResizeObserver: class {
        constructor(callback: Listener) { resized = callback; }
        observe() { metrics.observed++; }
        disconnect() { metrics.disconnected++; }
      },
    });
    const cleanup = exports.install();
    function flush() {
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback();
    }
    return { cleanup, flush, frames, metrics, properties, viewport, windowObject, windowEvents, viewportEvents, documentEvents,
      position: () => position, resize: () => resized(), anchor };
  }

  test(`${name}: narrow visual viewport constrains width before placement, with both horizontal edges visible`, () => {
    const h = fixture();
    const width = Number.parseFloat(h.properties.get("--touchline-tooltip-available-width")!);
    assert.equal(width, 164);
    const position = h.position()!;
    assert.ok(position.left >= h.viewport.offsetLeft + 8);
    assert.ok(position.left + width <= h.viewport.offsetLeft + h.viewport.width - 8);
    assert.ok(position.top >= h.viewport.offsetTop + 8);
    assert.ok(position.top + 64 <= h.viewport.offsetTop + h.viewport.height - 8);
    const css = readFileSync(new URL(`../components/touchline/cards/${name}.module.css`, import.meta.url), "utf8");
    assert.match(css, /max-width:\s*min\(260px,\s*calc\(100vw - 32px\),\s*var\(--touchline-tooltip-available-width,\s*260px\)\)/);
    h.cleanup?.();
  });

  test(`${name}: window and visual viewport events share one frame and preserve unchanged position identity`, () => {
    const h = fixture();
    const initial = h.position(), measurements = h.metrics.measurements, writes = h.metrics.styleWrites;
    for (let i = 0; i < 4; i++) {
      h.windowEvents.emit("resize"); h.windowEvents.emit("scroll");
      h.viewportEvents.emit("resize"); h.viewportEvents.emit("scroll"); h.resize();
    }
    assert.equal(h.frames.size, 1);
    assert.equal(h.metrics.measurements, measurements, "events only schedule work");
    h.flush();
    assert.equal(h.metrics.measurements, measurements + 2);
    assert.equal(h.metrics.styleWrites, writes);
    assert.equal(h.position(), initial, "unchanged coordinates retain the original state object");
    assert.equal(h.metrics.commits, 1);
    h.viewport.width = 140; h.viewport.offsetLeft = 100;
    h.viewportEvents.emit("resize"); h.viewportEvents.emit("scroll"); h.flush();
    assert.equal(h.properties.get("--touchline-tooltip-available-width"), "124px");
    assert.notEqual(h.position(), initial);
    assert.ok(h.position()!.left + 124 <= 232);
    h.cleanup?.();
  });

  test(`${name}: cleanup cancels queued frames, observers and all viewport listeners`, () => {
    const h = fixture();
    h.viewportEvents.emit("scroll");
    const staleFrame = [...h.frames.values()][0];
    const before = { measurements: h.metrics.measurements, commits: h.metrics.commits };
    h.cleanup?.();
    assert.equal(h.frames.size, 0);
    assert.equal(h.windowEvents.count() + h.viewportEvents.count() + h.documentEvents.count(), 0);
    assert.equal(h.metrics.disconnected, 1);
    assert.equal(h.metrics.cancelledLeave, 1);
    staleFrame(); h.resize(); h.windowEvents.emit("resize"); h.viewportEvents.emit("scroll");
    assert.equal(h.frames.size, 0);
    assert.equal(h.metrics.measurements, before.measurements);
    assert.equal(h.metrics.commits, before.commits);
  });

  test(`${name}: missing visualViewport falls back to the window and closed badges do no work`, () => {
    const h = fixture({ visual: false });
    assert.equal(h.properties.get("--touchline-tooltip-available-width"), "828px");
    assert.equal(h.viewportEvents.count(), 0);
    h.cleanup?.();
    const closed = fixture({ open: false });
    assert.equal(closed.cleanup, undefined);
    assert.equal(closed.metrics.measurements, 0);
    assert.equal(closed.metrics.observed, 0);
    assert.equal(closed.windowEvents.count() + closed.viewportEvents.count() + closed.documentEvents.count(), 0);
  });

  test(`${name}: tall text fits between both visual viewport edges without discarding text`, () => {
    const h = fixture({ height: 70, contentHeight: 500 });
    assert.equal(h.properties.get("--touchline-tooltip-available-height"), "54px");
    assert.ok(h.position()!.top >= 49);
    assert.ok(h.position()!.top + 54 <= 103);
    const css = readFileSync(new URL(`../components/touchline/cards/${name}.module.css`, import.meta.url), "utf8");
    assert.match(css, /\.tooltipText\s*\{[^}]*max-height:[^}]*overflow:\s*auto;[^}]*overflow-wrap:\s*anywhere/s);
    assert.match(source, /ref=\{scrollContent\} className=\{styles.tooltipText\}>\{label\}/);
    h.cleanup?.();
  });

  test(`${name}: real keyboard handler scrolls the complete text and leaves Tab and focus alone`, () => {
    let top = 0, preventions = 0, propagations = 0;
    const content = {
      textContent: "UnbrokenLongPlayerName".repeat(20), clientHeight: 36, scrollHeight: 500,
      get scrollTop() { return top; },
      set scrollTop(value: number) { top = Math.max(0, Math.min(464, value)); },
    };
    const fullText = content.textContent;
    const exports = {} as { key: (event: { key: string; preventDefault(): void; stopPropagation(): void }) => void };
    const keyboardScript = `${(scrollHelper as ts.FunctionDeclaration).getText(file)}\nexports.key = ${(keyHandler as ts.ArrowFunction).getText(file)};`;
    runInNewContext(ts.transpileModule(keyboardScript, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, open: true, scrollContent: { current: content }, pointerType: { current: "touch" },
      setOpen() { throw new Error("scroll keys must not dismiss the tooltip"); },
    });
    const key = (key: string) => exports.key({ key, preventDefault() { preventions++; }, stopPropagation() { propagations++; } });
    key("ArrowDown"); assert.equal(top, 32);
    key("PageDown"); assert.equal(top, 52);
    key("PageUp"); assert.equal(top, 32);
    key("ArrowUp"); assert.equal(top, 0);
    key("End"); assert.equal(top, 464);
    key("Home"); assert.equal(top, 0);
    assert.equal(preventions, 6); assert.equal(propagations, 6);
    key("Tab"); assert.equal(preventions, 6); assert.equal(propagations, 6);
    content.scrollHeight = content.clientHeight;
    key("ArrowDown"); assert.equal(preventions, 6, "non-overflowing tooltip leaves page scroll keys untouched");
    assert.equal(content.textContent, fullText);
  });
}
