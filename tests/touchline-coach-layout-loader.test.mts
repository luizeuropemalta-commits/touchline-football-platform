import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { loadCoachCardLayout } from "../lib/touchlineArena/coach-card-layout-loader.ts";

const turn = () => new Promise(resolve => setImmediate(resolve));
test("real loader shares pending fetch only and retries after success or failure", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let release!: (value: Response) => void;
  globalThis.fetch = (() => { calls++; return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch;
  try {
    const a = loadCoachCardLayout(), b = loadCoachCardLayout();
    assert.equal(a, b); assert.equal(calls, 1);
    release(new Response('{"x":1}')); assert.deepEqual(await a, { x: 1 });
    const c = loadCoachCardLayout(); assert.equal(calls, 2);
    release(new Response("", { status: 500 })); assert.equal(await c, null);
    globalThis.fetch = (() => { calls++; return Promise.reject(new Error("offline")); }) as typeof fetch;
    assert.equal(await loadCoachCardLayout(), null);
    assert.equal(await loadCoachCardLayout(), null); assert.equal(calls, 4);
  } finally { globalThis.fetch = original; }
});

function mount(options: { saved?: string; override?: object; load: () => Promise<unknown> }) {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCard.tsx", import.meta.url), "utf8");
  const start = source.indexOf("  useEffect(() => {\n    if (layoutOverride");
  const end = source.indexOf("  }, [layoutOverride]);", start) + "  }, [layoutOverride]);".length;
  assert.ok(start >= 0 && end > start);
  const listeners = new Map<string, (event: unknown) => void>();
  const values: unknown[] = [];
  let cleanup: (() => void) | undefined;
  runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    useEffect: (effect: () => (() => void) | undefined) => { cleanup = effect(); },
    layoutOverride: options.override,
    window: { localStorage: { getItem: () => options.saved }, addEventListener: (name: string, fn: (e: unknown) => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) },
    TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY: "layout", TOUCHLINE_COACH_CARD_LAYOUT_EVENT: "change",
    TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT: "default", normalizeTouchlineCoachCardLayout: (x: unknown) => x,
    setStoredLayout: (x: unknown) => values.push(x), loadCoachCardLayout: options.load,
    fetch: () => assert.fail("component must use shared loader"),
  });
  return { values, listeners, cleanup: () => cleanup?.() };
}
test("component prioritizes override/storage and ignores stale response after edit or cleanup", async () => {
  mount({ override: {}, load: () => assert.fail("override") });
  assert.equal(mount({ saved: '"saved"', load: () => assert.fail("storage") }).values[0], "saved");
  assert.equal(mount({ saved: "invalid", load: () => assert.fail("invalid storage") }).values[0], "default");
  let release!: (x: unknown) => void;
  const pending = new Promise(resolve => { release = resolve; });
  const a = mount({ load: () => pending }), b = mount({ load: () => pending }), c = mount({ load: () => pending });
  a.listeners.get("change")!({ detail: { layout: "edited" } });
  b.cleanup(); release("remote"); await turn();
  assert.deepEqual(a.values, ["edited"]); assert.deepEqual(b.values, []); assert.deepEqual(c.values, ["remote"]);
  assert.equal(b.listeners.size, 0);
});
