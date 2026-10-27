import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const lineupId = "touchline-club-lineup";
const lineupHash = `#${lineupId}`;
// Execute the complete current component, not a copied version of its effect.
const compiled = ts.transpileModule(readFileSync(new URL(
  "../components/touchline/club-hub/ClubHubSectionNavigation.tsx", import.meta.url,
), "utf8"), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

type Listener = (event: Record<string, unknown>) => void;
class Events {
  listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

function mount({ hash = lineupHash, existing = false } = {}) {
  const calls: { id: string; block: string; inline: string; behavior: string }[] = [];
  class Element extends Events {
    id: string;
    href: string | null;
    parent: Element | null;
    constructor(id: string, href: string | null = null, parent: Element | null = null) {
      super(); this.id = id; this.href = href; this.parent = parent;
    }
    closest(selector: string): Element | null {
      assert.equal(selector, "a[href]");
      return this.href !== null ? this : this.parent?.closest(selector) ?? null;
    }
    contains(node: Element): boolean { return node === this || Boolean(node.parent && this.contains(node.parent)); }
    getAttribute(name: string) { assert.equal(name, "href"); return this.href; }
    getBoundingClientRect() { return { top: 2200 }; }
    scrollIntoView(options: { block: string; inline: string; behavior: string }) {
      calls.push({ id: this.id, block: options.block, inline: options.inline, behavior: options.behavior });
    }
  }
  const scope = new Element("scope"), navigation = new Element("nav", null, scope);
  const elements = new Map<string, Element>();
  if (existing) elements.set(lineupId, new Element(lineupId));
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  const window = Object.assign(new Events(), {
    location: { hash }, scrollX: 0, scrollY: 0, innerHeight: 390,
    requestAnimationFrame(callback: () => void) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
  });
  const observers: MutationObserver[] = [];
  class MutationObserver {
    callback: () => void;
    connected = false;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe(node: unknown, options: { childList: boolean; subtree: boolean }) {
      assert.equal(node, scope); assert.equal(options.childList, true); assert.equal(options.subtree, true);
      this.connected = true;
    }
    disconnect() { this.connected = false; }
  }
  const effects: (() => void | (() => void))[] = [];
  const exports: { default?: (props: { locale: string }) => unknown } = {};
  const jsx = (type: unknown, props: Record<string, unknown>) => {
    if (type === "nav") (props.ref as { current: unknown }).current = navigation;
    return { type, props };
  };
  const document = {
    activeElement: null as Element | null,
    documentElement: { scrollHeight: 5000 },
    getElementById: (id: string) => elements.get(id) ?? null,
    querySelector: (selector: string) => selector === ".club-hub-shell" ? scope : null,
  };
  runInNewContext(compiled, {
    exports, Element, MutationObserver, window, document,
    require(name: string) {
      if (name === "react") return {
        useEffect: (effect: () => void | (() => void)) => effects.push(effect),
        useState: (initial: unknown) => [initial, () => {}],
        useRef: (current: unknown) => ({ current }),
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "lucide-react") return { ArrowUp: "svg", CalendarDays: "svg", TableProperties: "svg", UsersRound: "svg" };
      if (name === "@/lib/touchlineArena/club-hub-section-navigation-i18n") return {
        getTouchlineClubHubSectionNavigationCopy: () => ({ table: "table", matchday: "matchday", squad: "squad", sectionsAria: "sections", backToTop: "top", top: "top" }),
      };
      if (["../TouchlineGlobalNavigation.module.css", "./ClubHubSectionNavigation.module.css"].includes(name)) {
        return { default: { link: "link", navigation: "navigation", backToTop: "backToTop", backLabel: "backLabel" } };
      }
      throw new Error(`Unexpected component dependency: ${name}`);
    },
  }, { timeout: 1000 });
  assert.equal(typeof exports.default, "function");
  exports.default!({ locale: "pt-BR" });
  const cleanups = effects.map(effect => effect());
  assert.equal(observers.length, 1, "real section effect registered its observer");
  assert.equal(navigation.listenerCount(), 1, "real nav ref attached the click listener");
  const mutate = () => { for (const observer of observers) if (observer.connected) observer.callback(); };
  const flush = () => {
    const queued = [...frames.values()]; frames.clear();
    for (const callback of queued) callback();
  };
  return {
    calls, window, navigation, frames, observers, mutate, flush,
    arrive(id = lineupId) { elements.set(id, new Element(id)); mutate(); },
    click(hash = lineupHash, overrides: Record<string, unknown> = {}, focused = false) {
      // An icon nested in the anchor exercises closest(), as in the real nav.
      const link = new Element("link", hash, navigation), icon = new Element("icon", null, link);
      if (focused) document.activeElement = link;
      navigation.emit("click", { target: icon, button: 0, defaultPrevented: false, ...overrides });
    },
    cleanup() { for (const cleanup of cleanups.reverse()) cleanup?.(); },
  };
}

test("real navigation effect consumes a delayed anchor once and leaves existing anchors to native navigation", () => {
  const app = mount();
  assert.equal(app.calls.length, 0);
  app.arrive(); app.flush();
  assert.deepEqual(app.calls, [{ id: lineupId, block: "start", inline: "nearest", behavior: "instant" }]);
  app.mutate(); app.window.emit("scroll"); app.window.emit("resize"); app.flush();
  assert.equal(app.calls.length, 1);
  app.cleanup();
  const existing = mount({ existing: true });
  existing.mutate(); existing.flush();
  assert.equal(existing.calls.length, 0);
  existing.cleanup();
});

for (const [event, detail] of [
  ["wheel", {}], ["touchstart", {}],
  ...["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "]
    .map(key => ["keydown", { key }] as const),
] as const) {
  test(`real navigation cancels pending arrival on ${event} ${JSON.stringify(detail)}`, () => {
    const app = mount();
    app.arrive(); // The target exists but its mutation frame has not run yet.
    app.window.emit(event, detail); app.flush();
    app.mutate(); app.flush();
    assert.equal(app.calls.length, 0);
    app.cleanup();
  });
}

test("real navigation keeps pending arrival for a non-scroll key", () => {
  const app = mount();
  app.window.emit("keydown", { key: "a" }); app.arrive(); app.flush();
  assert.equal(app.calls.length, 1); app.cleanup();
});

test("scroll-only position change before delayed arrival does not steal the chosen position (isolated sequence, not native gesture proof)", t => {
  const app = mount();
  try {
    // This exercises the current effect's event path only. A native scrollbar
    // drag must independently prove that it produces this sequence; a mocked
    // scroll event (or its isTrusted flag) cannot establish that provenance.
    app.window.scrollY = 400;
    app.window.emit("scroll");
    app.flush();
    assert.equal(app.calls.length, 0, "the missing target cannot be scrolled to yet");
    assert.equal(app.window.location.hash, lineupHash);
    app.arrive();
    app.flush();
    t.diagnostic(JSON.stringify({
      boundary: "real component effect with controlled scroll-only event; no browser or native input",
      chosenScrollY: app.window.scrollY,
      hash: app.window.location.hash,
      scrollIntoViewCalls: app.calls,
    }));
    assert.equal(app.calls.length, 0, "delayed arrival must not invoke scrollIntoView after a separate position change");
  } finally { app.cleanup(); }
});

test("a scroll event without a position change preserves delayed arrival", () => {
  const app = mount();
  try {
    app.window.emit("scroll"); app.flush();
    app.arrive(); app.window.emit("scroll"); app.flush();
    assert.equal(app.calls.length, 1);
    app.window.scrollY = 2200; app.window.emit("scroll"); app.mutate(); app.flush();
    assert.equal(app.calls.length, 1, "a resolved arrival remains consumed");
  } finally { app.cleanup(); }
});

test("keyboard activation captures the position already reached by native focus without imperative link scrolling", () => {
  const app = mount({ hash: "" });
  try {
    // The browser test separately proves the scoped CSS makes native focus
    // scrolling immediate. Here the effect receives that settled position.
    app.window.scrollY = 400;
    app.click(lineupHash, { detail: 0 }, true); app.window.location.hash = lineupHash;
    assert.equal(app.calls.length, 0);
    assert.equal(app.window.scrollY, 400);
    app.window.emit("scroll"); app.window.emit("hashchange"); app.flush();
    app.arrive(); app.flush();
    assert.deepEqual(app.calls.map(call => call.id), [lineupId]);
  } finally { app.cleanup(); }
});

test("a subsequent scroll still cancels a keyboard-armed intent, including before scroll dispatch", () => {
  for (const dispatch of [true, false]) {
    const app = mount({ hash: "" });
    try {
      app.window.scrollY = 400;
      app.click(lineupHash, { detail: 0 }, true); app.window.location.hash = lineupHash;
      app.window.scrollY = 600;
      if (dispatch) app.window.emit("scroll");
      app.arrive(); app.flush();
      assert.equal(app.calls.length, 0);
    } finally { app.cleanup(); }
  }
});

test("keyboard activation of an existing anchor keeps native navigation untouched", () => {
  const app = mount({ existing: true });
  try {
    app.click(lineupHash, { detail: 0 }, true); app.flush();
    assert.equal(app.calls.length, 0);
  } finally { app.cleanup(); }
});

test("changed position cancels arrival even when its scroll event is still queued", () => {
  const app = mount();
  try {
    app.window.scrollY = 400;
    app.arrive(); app.flush();
    assert.equal(app.calls.length, 0, "the mutation frame must check position before consuming the missing-target intent");
    app.window.emit("scroll"); app.flush();
    assert.equal(app.calls.length, 0);
  } finally { app.cleanup(); }
});

test("an explicit same-hash click rearms arrival at the new position after scroll-only cancellation", () => {
  const app = mount();
  try {
    app.window.scrollY = 400; app.window.emit("scroll"); app.flush();
    app.click();
    app.window.emit("hashchange"); app.window.emit("scroll"); app.flush();
    assert.equal(app.calls.length, 0);
    app.arrive(); app.flush();
    assert.equal(app.calls.length, 1);
    assert.equal(app.calls[0].id, lineupId);
  } finally { app.cleanup(); }
});

test("horizontal position changes cancel the old intent while a new hash captures its own position", () => {
  const app = mount();
  try {
    app.window.scrollX = 40; app.window.emit("scroll"); app.flush();
    app.arrive(); app.flush();
    assert.equal(app.calls.length, 0);
    app.window.location.hash = "#club-table"; app.window.emit("hashchange");
    app.window.emit("scroll"); app.flush();
    app.arrive("club-table"); app.flush();
    assert.equal(app.calls.length, 1); assert.equal(app.calls[0].id, "club-table");
  } finally { app.cleanup(); }
});

test("real navigation honors changed hashes even before hashchange dispatch", () => {
  const app = mount();
  app.window.location.hash = "#club-hub-top";
  app.arrive(); app.flush();
  app.window.emit("hashchange"); app.mutate(); app.flush();
  assert.equal(app.calls.length, 0); app.cleanup();
});

test("real navigation follows a new missing section rather than the old pending section", () => {
  const app = mount();
  app.window.location.hash = "#club-table"; app.window.emit("hashchange");
  app.arrive(); app.flush();
  assert.equal(app.calls.length, 0);
  app.arrive("club-table"); app.flush();
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0].id, "club-table"); app.cleanup();
});

test("a queued hashchange cannot rearm a clicked intent cancelled by wheel", () => {
  const app = mount({ hash: "" });
  app.click(); app.window.location.hash = lineupHash;
  app.window.emit("wheel"); app.window.emit("hashchange");
  app.arrive(); app.flush();
  assert.equal(app.calls.length, 0); app.cleanup();
});

test("an explicit same-hash click rearms a cancelled missing anchor without a hashchange event", () => {
  const app = mount();
  app.window.emit("wheel"); app.click();
  app.arrive(); app.flush();
  assert.equal(app.calls.length, 1); app.cleanup();
});

test("modified and prevented clicks cannot rearm a cancelled intent", () => {
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const app = mount();
    app.window.emit("wheel"); app.click(lineupHash, overrides); app.arrive(); app.flush();
    assert.equal(app.calls.length, 0); app.cleanup();
  }
});

test("real effect cleanup removes every listener, observer and queued animation frame", () => {
  const app = mount();
  app.arrive(); assert.equal(app.frames.size, 1);
  app.cleanup();
  assert.equal(app.frames.size, 0);
  assert.equal(app.window.listenerCount(), 0);
  assert.equal(app.navigation.listenerCount(), 0);
  assert.ok(app.observers.every(observer => !observer.connected));
  app.mutate(); app.window.emit("hashchange"); app.window.emit("scroll"); app.click(); app.flush();
  assert.equal(app.calls.length, 0);
});
