import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { clubHubStripSeedNeedsRecovery, parseClubHubStripSnapshot } from "../lib/touchlineArena/club-hub-fixture-strip.ts";
import * as fixtureStripMotion from "../lib/touchlineArena/fixture-strip-motion.ts";
import { selectTouchlinePublishedRailFixtures } from "../lib/touchlineArena/sports-publication-live-view.ts";

// Execute the real component's bootstrap effect without a browser, network,
// or shared publication transport. Browser/visual verification is separate.
function harness(fetcher: typeof fetch, initialFixtures?: unknown[]) {
  const effects: Array<() => void | (() => void)> = [];
  const writes: Array<{ index: number; value: unknown }> = [];
  const timers = new Map<number, () => void>();
  let index = 0;
  const react = {
    useState: (value: unknown) => {
      const current = index++;
      return [value, (next: unknown) => writes.push({ index: current, value: next })];
    },
    useMemo: (compute: () => unknown) => compute(),
    useRef: () => ({ current: null }),
    useEffect: (effect: () => void | (() => void)) => effects.push(effect),
  };
  const exports: { default?: (props: unknown) => unknown } = {};
  const source = readFileSync(new URL("../components/touchline/ClubHubFixtureStrip.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, {
    exports, AbortController, fetch: fetcher,
    window: {
      setTimeout: (callback: () => void) => { const id = timers.size + 1; timers.set(id, callback); return id; },
      clearTimeout: (id: number) => timers.delete(id),
    },
    require: (id: string) => {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
      if (id.endsWith(".css")) return { default: {} };
      if (id.endsWith("sports-publication-live-view")) return { selectTouchlinePublishedRailFixtures };
      if (id.endsWith("sports-publication-client")) return { useTouchlinePublishedLive: () => ({ fixtures: [], metadata: null }) };
      if (id.endsWith("match-centre-i18n")) return { getTouchlineMatchCentreCopy: () => ({}) };
      if (id.endsWith("club-hub-fixture-strip-i18n")) return { getClubHubStripCopy: () => ({}) };
      if (id.endsWith("club-hub-fixture-strip")) return { clubHubStripSeedNeedsRecovery, parseClubHubStripSnapshot };
      if (id.endsWith("fixture-strip-motion")) return fixtureStripMotion;
      if (id.endsWith("local-kickoff")) return {};
      throw new Error(`Unexpected import ${id}`);
    },
  });
  exports.default!({ locale: "en-GB", initialFixtures });
  const cleanup = effects[1]();
  return { writes, timers, cleanup };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("bootstrap timeout reports failure, aborts request, and releases timer", async () => {
  let signal: AbortSignal | undefined;
  const state = harness(((_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    signal = options.signal as AbortSignal;
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  })) as typeof fetch);
  [...state.timers.values()][0]();
  await settle();
  assert.equal(signal?.aborted, true);
  assert.deepEqual(state.writes, [{ index: 1, value: true }]);
  assert.equal(state.timers.size, 0);
});

test("unmount cancellation does not publish an error or later response", async () => {
  const state = harness(((_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  })) as typeof fetch);
  state.cleanup?.();
  await settle();
  assert.deepEqual(state.writes, []);
  assert.equal(state.timers.size, 0);
});

test("HTTP failure terminates loading without a fabricated snapshot", async () => {
  const state = harness((async () => ({ ok: false })) as typeof fetch);
  await settle();
  assert.deepEqual(state.writes, [{ index: 1, value: true }]);
  assert.equal(state.timers.size, 0);
});

test("valid empty persisted response terminates loading as an empty schedule", async () => {
  const state = harness((async () => ({ ok: true, json: async () => ({ ok: true, data: [], state: "partial-persisted-schedule", degraded: true }) })) as typeof fetch);
  await settle();
  assert.equal(state.writes[0]?.index, 0);
  assert.deepEqual((state.writes[0]?.value as { fixtures: unknown[] }).fixtures, []);
  assert.deepEqual(state.writes[1], { index: 1, value: false });
  assert.equal(state.timers.size, 0);
});

test("server-provided fixtures skip the bootstrap endpoint entirely", () => {
  let calls = 0;
  const state = harness((async () => { calls++; throw new Error("Unexpected call"); }) as typeof fetch, []);
  assert.equal(calls, 0);
  assert.equal(state.timers.size, 0);
  assert.deepEqual(state.writes, []);
});
