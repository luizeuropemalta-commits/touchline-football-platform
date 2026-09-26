import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";
import { parseTouchlineLivePresentationState, mergeTouchlineLivePresentationRevision, touchlineLivePresentationRevisionChanged } from "../lib/touchlineArena/live-presentation-state.ts";

async function lifecycle() {
  let refreshes = 0;
  let readingBody = false;
  const pending: Array<(value: unknown) => void> = [];
  const cleanups: Array<() => void> = [];
  const listeners = new Map<string, () => void>();
  let nextTimer = 0;
  const timers = new Map<number, { run: () => void; delay: number }>();
  const navigator = { onLine: true };
  const document = { hidden: false, addEventListener: (key: string, fn: () => void) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) };
  const window = { ...document, setTimeout: (run: () => void, delay: number) => { const id = ++nextTimer; timers.set(id, { run, delay }); return id; }, clearTimeout: (id: number) => timers.delete(id) };
  const context = vm.createContext({
    document, window, navigator, AbortController,
    useRef: (current: unknown) => ({ current }),
    useEffect: (fn: () => (() => void) | undefined) => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
    useRouter: () => ({ refresh: () => { refreshes += 1; } }),
    startTransition: (fn: () => void) => fn(),
    parseTouchlineLivePresentationState, mergeTouchlineLivePresentationRevision, touchlineLivePresentationRevisionChanged,
    fetch: async () => {
      const body = new Promise(resolve => { pending.push(resolve); });
      return { ok: true, json: () => { readingBody = true; return body; } };
    },
  });
  const source = readFileSync(new URL("../components/touchline/TouchlineLivePresentationRefresh.tsx", import.meta.url), "utf8");
  vm.runInContext(stripTypeScriptTypes(source.replace(/import[\s\S]*?from\s+"[^"]+";/g, "")).replace("export default ", ""), context);
  vm.runInContext('TouchlineLivePresentationRefresh({ initialPlayerRankingSnapshotId: "old" })', context);
  for (let i = 0; i < 10 && !readingBody; i += 1) await Promise.resolve();
  assert.equal(readingBody, true, "pause must occur after response headers, during body read");
  return {
    stop: () => cleanups.forEach(fn => fn()),
    hide: () => { document.hidden = true; listeners.get("visibilitychange")?.(); },
    offline: () => { navigator.onLine = false; listeners.get("offline")?.(); },
    show: () => { document.hidden = false; listeners.get("visibilitychange")?.(); },
    online: () => { navigator.onLine = true; listeners.get("online")?.(); },
    requests: () => pending.length,
    delays: () => [...timers.values()].map(timer => timer.delay),
    expire: () => {
      const next = timers.entries().next().value;
      if (next) { timers.delete(next[0]); next[1].run(); }
    },
    finish: async (request = 0, revision = "new") => {
      pending[request]({ version: 1, available: true, playerRankingSnapshotId: revision, coachRankingSnapshotId: null, mode: "idle", pollAfterMs: null, resumeAt: null });
      await setImmediate();
      return refreshes;
    },
  };
}

for (const [pause, resume] of [["hide", "show"], ["offline", "online"]] as const) {
  test(`${resume} starts one fresh read and ignores the older body`, async () => {
    const page = await lifecycle();
    page[pause]();
    page[resume]();
    page[resume]();
    assert.equal(page.requests(), 2, "repeated resume must not duplicate the in-flight read");
    assert.equal(await page.finish(1, "fresh"), 1);
    assert.equal(await page.finish(0, "stale"), 1, "old response must not replace fresh data");
    page.stop();
    assert.deepEqual(page.delays(), []);
  });
}

test("an expired body retries after backoff and accepts the next verified revision", async () => {
  const page = await lifecycle();
  page.expire();
  assert.equal(await page.finish(), 0);
  assert.deepEqual(page.delays(), [30_000]);
  page.expire();
  assert.equal(page.requests(), 2);
  assert.equal(await page.finish(1), 1);
  page.stop();
  assert.deepEqual(page.delays(), []);
});

test("a current verified response refreshes the mounted page", async () => {
  const page = await lifecycle();
  assert.equal(await page.finish(), 1);
  page.stop();
});

for (const event of ["stop", "hide", "offline", "expire"] as const) {
  test(`a body arriving after ${event} cannot refresh the page`, async () => {
    const page = await lifecycle();
    page[event]();
    assert.equal(await page.finish(), 0);
    page.stop();
  });
}
