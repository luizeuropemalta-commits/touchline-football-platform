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
    location: { hash }, scrollY: 0, innerHeight: 390,
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
  runInNewContext(compiled, {
    exports, Element, MutationObserver, window,
    document: {
      documentElement: { scrollHeight: 5000 },
      getElementById: (id: string) => elements.get(id) ?? null,
      querySelector: (selector: string) => selector === ".club-hub-shell" ? scope : null,
    },
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
    click(hash = lineupHash, overrides: Record<string, unknown> = {}) {
      // An icon nested in the anchor exercises closest(), as in the real nav.
      const link = new Element("link", hash, navigation), icon = new Element("icon", null, link);
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
