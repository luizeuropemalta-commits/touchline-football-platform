import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";
import { parseTouchlineLivePresentationState, mergeTouchlineLivePresentationRevision, touchlineLivePresentationRevisionChanged } from "../lib/touchlineArena/live-presentation-state.ts";

async function lifecycle(seeds = [{ initialPlayerRankingSnapshotId: "old" }] as Array<{
  initialPlayerRankingSnapshotId?: string; initialCoachRankingSnapshotId?: string;
  serverRefreshAfterMs?: number; serverRefreshAt?: number | null; serverRefreshScope?: string;
}>) {
  let now = 1_000_000;
  let transitionPending = false;
  let holdTransition = false;
  const transition = (fn: () => void) => { transitionPending = true; fn(); };
  let refreshes = 0;
  let failNextRefresh = false;
  let readingBody = false;
  const pending: Array<(value: unknown) => void> = [];
  const refs: Array<{ current: unknown }> = [];
  const effects: Array<{ dependencies: readonly unknown[]; cleanup?: () => void }> = [];
  let refCursor = 0;
  let effectCursor = 0;
  let router = { refresh: () => { refreshes += 1; if (failNextRefresh) { failNextRefresh = false; throw new Error("synthetic synchronous refresh failure"); } } };
  const listeners = new Map<string, () => void>();
  let nextTimer = 0;
  const timers = new Map<number, { run: () => void; delay: number }>();
  const navigator = { onLine: true };
  const document = { hidden: false, addEventListener: (key: string, fn: () => void) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) };
  const window = { ...document, setTimeout: (run: () => void, delay: number) => { const id = ++nextTimer; timers.set(id, { run, delay }); return id; }, clearTimeout: (id: number) => timers.delete(id) };
  const context = vm.createContext({
    document, window, navigator, AbortController, Date: class extends Date { static now() { return now; } },
    useRef: (current: unknown) => {
      const index = refCursor++;
      return refs[index] ?? (refs[index] = { current });
    },
    useEffect: (fn: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
      const index = effectCursor++;
      const previous = effects[index];
      if (previous && dependencies.length === previous.dependencies.length
        && dependencies.every((value, position) => Object.is(value, previous.dependencies[position]))) return;
      previous?.cleanup?.();
      effects[index] = { dependencies, cleanup: fn() };
    },
    useRouter: () => router,
    useTransition: () => [transitionPending, transition],
    parseTouchlineLivePresentationState, mergeTouchlineLivePresentationRevision, touchlineLivePresentationRevisionChanged,
    fetch: async () => {
      const body = new Promise(resolve => { pending.push(resolve); });
      return { ok: true, json: () => { readingBody = true; return body; } };
    },
  });
  const storeSource = readFileSync(new URL("../lib/touchlineArena/live-presentation-client-store.ts", import.meta.url), "utf8");
  vm.runInContext(stripTypeScriptTypes(storeSource.replace(/import[\s\S]*?from\s+"[^"]+";/g, "")).replaceAll("export ", ""), context);
  const source = readFileSync(new URL("../components/touchline/TouchlineLivePresentationRefresh.tsx", import.meta.url), "utf8");
  vm.runInContext(stripTypeScriptTypes(source.replace(/import[\s\S]*?from\s+"[^"]+";/g, "")).replace("export default ", ""), context);
  const render = () => {
    refCursor = 0;
    effectCursor = 0;
    for (const seed of seeds) {
      context.seed = seed;
      vm.runInContext('TouchlineLivePresentationRefresh(seed)', context);
    }
  };
  render();
  for (let i = 0; i < 10 && !readingBody; i += 1) await Promise.resolve();
  assert.equal(readingBody, true, "pause must occur after response headers, during body read");
  return {
    stop: () => effects.forEach(effect => { effect.cleanup?.(); effect.cleanup = undefined; }),
    rerender: async (restartEffect = false) => {
      if (restartEffect) router = { refresh: router.refresh };
      render();
      await setImmediate();
    },
    replaceSeed: (seed: typeof seeds[number]) => { seeds = [seed]; render(); },
    hide: () => { document.hidden = true; listeners.get("visibilitychange")?.(); },
    offline: () => { navigator.onLine = false; listeners.get("offline")?.(); },
    show: () => { document.hidden = false; listeners.get("visibilitychange")?.(); },
    online: () => { navigator.onLine = true; listeners.get("online")?.(); },
    requests: () => pending.length,
    advance: (ms: number) => { now += ms; },
    failNextRefresh: () => { failNextRefresh = true; },
    holdTransition: () => { holdTransition = true; },
    releaseTransition: () => { transitionPending = false; render(); },
    delays: () => [...timers.values()].map(timer => timer.delay),
    expire: () => {
      const next = timers.entries().next().value;
      if (next) { timers.delete(next[0]); next[1].run(); }
    },
    finish: async (request = 0, revision = "new", liveRevision?: string | null, coachRevision: string | null = null) => {
      pending[request]({ version: 1, available: true, playerRankingSnapshotId: revision, coachRankingSnapshotId: coachRevision,
        ...(liveRevision !== undefined ? { livePresentationSnapshotId: liveRevision } : {}), mode: "idle", pollAfterMs: null, resumeAt: null });
      await setImmediate();
      if (transitionPending) {
        render();
        if (!holdTransition) { transitionPending = false; render(); }
      }
      return refreshes;
    },
  };
}

test("player and coach boundaries share a route refresh without suppressing either mask", async () => {
  const page = await lifecycle([{ initialPlayerRankingSnapshotId: "old" }, { initialCoachRankingSnapshotId: "coach-old" }]);
  assert.equal(page.requests(), 1);
  assert.equal(await page.finish(0, "old", undefined, "coach-new"), 1);
  page.online();
  assert.equal(await page.finish(1, "new", undefined, "coach-newer"), 2,
    "both changed masks still refresh the route once");
  page.online();
  assert.equal(await page.finish(2, "new", undefined, "coach-newer"), 2);
  page.stop();
});

test("late SSR props cannot reset the client's acknowledged publication", async () => {
  const page = await lifecycle();
  assert.equal(await page.finish(0, "new", "digest-new"), 1);
  page.replaceSeed({ initialPlayerRankingSnapshotId: "stale-server-tree" });
  page.online();
  assert.equal(await page.finish(1, "new", "digest-new"), 1);
  page.stop();
});

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

test("the first known Live publication refreshes even when idle and rankings are unchanged", async () => {
  const page = await lifecycle();
  assert.equal(await page.finish(0, "old", "score-b"), 1,
    "without a server-rendered digest, the first publication may be newer than the rendered score");
  assert.deepEqual(page.delays(), [60_000], "the first refresh has already happened; the idle recheck only discovers later corrections");
  page.online();
  assert.equal(page.requests(), 2);
  assert.equal(await page.finish(1, "old", "score-b"), 1);
  page.online();
  assert.equal(await page.finish(2, "old", "score-c"), 2);
  page.stop();
});

test("the acknowledged Live digest survives rerenders and polling-effect restarts", async () => {
  const page = await lifecycle();
  assert.equal(await page.finish(0, "old", "score-b"), 1);
  await page.rerender();
  assert.equal(page.requests(), 1, "unchanged effect dependencies must not restart polling");
  await page.rerender(true);
  assert.equal(page.requests(), 2);
  assert.equal(await page.finish(1, "old", "score-b"), 1, "the same digest must not cause a refresh loop");
  page.stop();
  assert.deepEqual(page.delays(), []);
});

test("absent and null Live revisions do not refresh or erase an acknowledged publication", async () => {
  const page = await lifecycle();
  assert.equal(await page.finish(0, "old"), 0);
  page.online();
  assert.equal(await page.finish(1, "old", null), 0);
  page.online();
  assert.equal(await page.finish(2, "old", "score-b"), 1);
  page.online();
  assert.equal(await page.finish(3, "old", null), 1);
  page.online();
  assert.equal(await page.finish(4, "old", "score-b"), 1);
  page.stop();
});

test("unmounted bodies stay ignored and a new mount acknowledges its own first publication", async () => {
  const previous = await lifecycle();
  previous.stop();
  assert.equal(await previous.finish(0, "old", "score-b"), 0);
  assert.deepEqual(previous.delays(), []);
  const page = await lifecycle();
  assert.equal(await page.finish(0, "old", "score-b"), 1);
  page.stop();
});

test("server facts refresh on an accepted unchanged digest and coalesce across boundaries", async () => {
  const page = await lifecycle([{ serverRefreshAfterMs: 10_000 }, { serverRefreshAfterMs: 10_000 }]);
  assert.equal(await page.finish(0, "old", "same"), 1);
  page.advance(9_999); page.online();
  assert.equal(await page.finish(1, "old", "same"), 1);
  page.advance(1); page.online();
  assert.equal(await page.finish(2, "old", "same"), 2, "one route refresh, not one per table/card");
  page.stop();
});

test("a context wake is acknowledged once even when the publication never changes", async () => {
  const page = await lifecycle([{ serverRefreshAt: 1_001_000 }]);
  assert.equal(await page.finish(0, "old", "same"), 1);
  page.advance(1_000); page.online();
  assert.equal(await page.finish(1, "old", "same"), 2);
  page.advance(60_000); page.online();
  assert.equal(await page.finish(2, "old", "same"), 2);
  page.stop();
});

test("synchronous refresh failure retains the due wake for the next accepted read", async () => {
  const page = await lifecycle([{ serverRefreshAt: 1_001_000 }]);
  assert.equal(await page.finish(0, "old", "same"), 1);
  page.advance(1_000); page.failNextRefresh(); page.online();
  assert.equal(await page.finish(1, "old", "same"), 2);
  page.online();
  assert.equal(await page.finish(2, "old", "same"), 3, "failed router refresh cannot consume the wake");
  page.online();
  assert.equal(await page.finish(3, "old", "same"), 3, "successful retry acknowledges it once");
  page.stop();
});

test("pending route refresh holds all boundaries while sports reads continue", async () => {
  const page = await lifecycle([{ serverRefreshAfterMs: 10_000 }, { initialCoachRankingSnapshotId: "old" }]);
  page.holdTransition();
  assert.equal(await page.finish(0, "old", "same", "old"), 1);
  page.advance(20_000); page.online();
  assert.equal(await page.finish(1, "new", "new", "new"), 1);
  page.releaseTransition(); page.online();
  assert.equal(await page.finish(2, "new", "new", "new"), 2, "unacknowledged update catches up after commit");
  page.stop();
});

test("rerender beyond T-24 or T-1 cannot discard an unacknowledged context wake", async () => {
  const page = await lifecycle([{ serverRefreshAt: 1_001_000, serverRefreshScope: "fixture:100" }]);
  assert.equal(await page.finish(0, "old", "same"), 1);
  page.advance(2_000);
  page.replaceSeed({ serverRefreshAt: 1_010_000, serverRefreshScope: "fixture:100" });
  page.online(); assert.equal(await page.finish(1, "old", "same"), 2);
  page.advance(9_000);
  page.replaceSeed({ serverRefreshAt: null, serverRefreshScope: "fixture:100" });
  page.online(); assert.equal(await page.finish(2, "old", "same"), 3);
  page.replaceSeed({ serverRefreshAt: 1_001_000, serverRefreshScope: "fixture:100" });
  page.online(); assert.equal(await page.finish(3, "old", "same"), 3, "late props cannot replay an acknowledged boundary");
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
