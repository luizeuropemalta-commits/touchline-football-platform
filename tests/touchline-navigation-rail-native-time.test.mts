import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const code = ts.transpileModule(readFileSync(new URL("../components/touchline/TouchlineNavigationRail.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness(type = "time") {
  const frames = new Map<number, () => void>();
  const listeners = new Map<string, (event: { target: unknown }) => void>();
  let nextId = 0, left = 276, scrollCalls = 0, effect: (() => () => void) | undefined;
  class Element {
    isConnected = true;
    matches(selector: string) { assert.equal(selector, 'input[type="time"]'); return type === "time"; }
    getBoundingClientRect() { return { left, right: left + 144 }; }
  }
  const target = new Element(), document = { activeElement: target as unknown };
  const rail = { isConnected: true, ownerDocument: document, scrollWidth: 1160, clientWidth: 353, clientLeft: 0,
    getBoundingClientRect: () => ({ left: 16 }),
    scrollBy({ left: delta }: { left: number }) { left -= delta; scrollCalls++; },
    addEventListener(name: string, listener: (event: { target: unknown }) => void, capture: boolean) { assert.equal(capture, true); listeners.set(name, listener); },
    removeEventListener(name: string, listener: unknown, capture: boolean) { assert.equal(capture, true); assert.equal(listeners.get(name), listener); listeners.delete(name); },
  };
  type Props = { ref: { current: unknown }; onFocusCapture(event: unknown): void; onBlurCapture(): void };
  const exports: { default?: (props: unknown) => { props: Props } } = {};
  runInNewContext(code, { exports, HTMLElement: Element,
    require(name: string) {
      if (name === "react/jsx-runtime") return jsx;
      assert.equal(name, "react");
      return { useRef: (current: unknown) => ({ current }), useCallback: (fn: unknown) => fn,
        useEffect: (fn: () => () => void) => { effect = fn; } };
    },
    requestAnimationFrame(callback: () => void) { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    getComputedStyle(node: unknown) { return node === rail ? { overflowX: "auto" } : { outlineWidth: "1px", outlineOffset: "3px" }; },
  });
  const rendered = exports.default!({ className: "rail", children: null });
  rendered.props.ref.current = rail;
  const cleanup = effect!();
  return { frames, listeners, target, document, cleanup, position: () => left, calls: () => scrollCalls,
    focus: () => listeners.get("focus")!({ target }),
    synthetic: () => rendered.props.onFocusCapture({ currentTarget: rail, target }),
    blur: () => rendered.props.onBlurCapture(),
    tick() { const item = frames.entries().next().value; assert.ok(item); frames.delete(item[0]); item[1](); } };
}

test("native time focus without focusin reveals the control and uses exactly one follow-up frame", () => {
  const h = harness(); h.focus(); assert.equal(h.position(), 218); assert.equal(h.calls(), 1);
  assert.equal(h.frames.size, 1); h.tick(); assert.equal(h.frames.size, 0);
});

test("time focusin does not duplicate native reveal; ordinary inputs retain the React path", () => {
  const time = harness(); time.focus(); time.synthetic(); assert.equal(time.calls(), 1); assert.equal(time.frames.size, 1);
  const text = harness("text"); text.focus(); assert.equal(text.calls(), 0); assert.equal(text.frames.size, 0);
  text.synthetic(); assert.equal(text.calls(), 1); text.tick(); assert.equal(text.frames.size, 0);
});

test("blur and unmount cancel the one pending frame and native listener is removed", () => {
  const h = harness(); h.focus(); h.blur(); assert.equal(h.frames.size, 0);
  h.focus(); h.cleanup(); assert.equal(h.frames.size, 0); assert.equal(h.listeners.size, 0);
});
