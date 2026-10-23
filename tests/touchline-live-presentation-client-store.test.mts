import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";
import { parseTouchlineLivePresentationState } from "../lib/touchlineArena/live-presentation-state.ts";
import { parseTouchlineSportsPublication, type TouchlineSportsPublication } from "../lib/touchlineArena/sports-publication.ts";

const source = readFileSync(new URL("../lib/touchlineArena/live-presentation-client-store.ts", import.meta.url), "utf8");
const compiled = stripTypeScriptTypes(source.replace(/import[\s\S]*?from\s+"[^"]+";/g, "")).replaceAll("export ", "");
const state = (revision = "a", live = true) => ({ version: 1, available: true,
  playerRankingSnapshotId: revision, coachRankingSnapshotId: null, livePresentationSnapshotId: `digest-${revision}`,
  mode: live ? "live" : "idle", pollAfterMs: live ? 10_000 : null, resumeAt: null });

function harness(browser = true) {
  const requests: Array<{ url: string; signal: AbortSignal; headers: (value: unknown) => void; body: (value: unknown) => void; reject: (value: unknown) => void }> = [];
  const events = new Map<string, Set<() => void>>();
  const timers = new Map<number, { delay: number; run: () => void }>();
  let nextTimer = 0;
  const navigator = { onLine: true };
  const document = { hidden: false,
    addEventListener: (key: string, fn: () => void) => { const set = events.get(key) ?? new Set(); set.add(fn); events.set(key, set); },
    removeEventListener: (key: string, fn: () => void) => events.get(key)?.delete(fn) };
  const window = { ...document,
    setTimeout: (run: () => void, delay: number) => { const id = ++nextTimer; timers.set(id, { run, delay }); return id; },
    clearTimeout: (id: number) => timers.delete(id) };
  const context = vm.createContext({ ...(browser ? { window, document, navigator } : {}), AbortController,
    parseTouchlineLivePresentationState, parseTouchlineSportsPublication,
    fetch: (url: string, options: { signal: AbortSignal }) => new Promise((headers, reject) => {
      let body!: (value: unknown) => void;
      const promise = new Promise(resolve => { body = resolve; });
      requests.push({ url, signal: options.signal, headers: (status: unknown) => headers({ ok: status === 200, json: () => promise }), body, reject });
    }) });
  vm.runInContext(compiled, context);
  type Read = { generation: number; requestEpoch: number; state: { playerRankingSnapshotId: string }; sportsPublication: TouchlineSportsPublication | null };
  const store = vm.runInContext("touchlineLivePresentationStore", context) as {
    subscribe: (listener: (read: Read, claim: () => boolean) => void, includeSports?: boolean) => () => void;
    getSnapshot: () => Read | null;
    getRequestEpoch: () => number;
    revalidate: () => void;
  };
  const event = (name: string) => { for (const callback of events.get(name) ?? []) callback(); };
  return { store, requests, timers, events,
    hidden: (value: boolean) => { document.hidden = value; event("visibilitychange"); },
    online: (value: boolean) => { navigator.onLine = value; event(value ? "online" : "offline"); },
    fire: (delay: number) => {
      const timer = [...timers.entries()].find(([, item]) => item.delay === delay);
      assert.ok(timer, `missing timer ${delay}`);
      timers.delete(timer[0]); timer[1].run();
    },
    headers: async (index: number, status = 200) => { requests[index].headers(status); await setImmediate(); },
    finish: async (index: number, payload: unknown = state()) => {
      requests[index].headers(200); requests[index].body(payload); await setImmediate();
    },
  };
}

test("multiple boundaries share one read, timer, event listener and refresh claim", async () => {
  const page = harness();
  const seen: number[] = [];
  let refreshes = 0;
  const unsubscribe = Array.from({ length: 30 }, () => page.store.subscribe((read, claim) => {
    seen.push(read.generation); if (claim()) refreshes += 1;
  }));
  assert.equal(page.requests.length, 1);
  assert.equal(page.events.get("online")?.size, 1);
  await page.finish(0);
  assert.equal(refreshes, 1);
  assert.deepEqual(seen, Array(30).fill(1));
  assert.equal(page.timers.size, 1);
  unsubscribe.slice(0, 29).forEach(stop => stop());
  page.fire(10_000);
  assert.equal(page.requests.length, 2);
  unsubscribe[29]();
  assert.equal(page.requests[1].signal.aborted, true);
  assert.equal(page.timers.size, 0);
  assert.equal([...page.events.values()].every(set => set.size === 0), true);
});

function sports(revision = "a", score = 2) {
  const time = "2026-10-23T08:00:00Z";
  return { version: 1, scopeKey: "touchline-england", publication: {
    snapshotId: "10000000-0000-4000-8000-000000000099", contentDigest: revision.repeat(32), publishedAt: time,
    playerRankingSnapshotId: null, coachRankingSnapshotId: null, liveScoreSnapshotDigest: revision.repeat(32),
  }, playerRanking: null, coachRanking: null, live: { fetchedAt: time, fixtures: [{
    id: "19722190", providerId: "19722190", startsAt: time, status: "1H", homeScore: score, awayScore: 0,
    homeTeam: { id: "19", providerId: "19", name: "Home" }, awayTeam: { id: "18", providerId: "18", name: "Away" },
  }] } };
}
const sportsSignal = (revision = "a") => ({ ...state(), playerRankingSnapshotId: null,
  livePresentationSnapshotId: revision.repeat(32) });

test("50 ranking consumers share the real store and coalesce mount revalidation into one follow-up signal", async () => {
  const page = harness();
  let subscribe!: (notify: () => void) => () => void;
  const exports: { useTouchlineRankingRead?: (enabled: boolean) => unknown } = {};
  const rankingSource = readFileSync(new URL("../lib/touchlineArena/card-ranking-client.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(rankingSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, window: {}, require(name: string) {
    if (name === "react") return { useSyncExternalStore(sub: typeof subscribe, get: () => unknown) { subscribe = sub; return get(); } };
    if (name === "./live-presentation-client-store") return { touchlineLivePresentationStore: page.store };
    if (name === "./card-ranking-live") return { TOUCHLINE_PRESEASON_RANKING_STATE: Object.freeze({ phase: "preseason" }) };
    assert.fail(`unexpected ranking dependency: ${name}`);
  } });
  assert.ok(exports.useTouchlineRankingRead);
  let notified = 0;
  const stops = Array.from({ length: 50 }, () => {
    exports.useTouchlineRankingRead!(true);
    return subscribe(() => { notified++; });
  });
  assert.equal(page.requests.length, 1, "mounts do not multiply in-flight signal requests");
  await page.finish(0, sportsSignal());
  await page.finish(1, { ok: true, data: sports() });
  assert.equal(notified, 50);
  assert.equal(page.requests.length, 3, "all new mounts require only one newer signal");
  await page.finish(2, sportsSignal());
  assert.equal(notified, 100);
  assert.equal(page.requests.length, 3, "the immutable sports payload is fetched only once");
  assert.equal(page.events.get("online")?.size, 1);
  assert.equal(page.timers.size, 1);
  stops.slice(0, 49).forEach(stop => stop());
  assert.equal(page.timers.size, 1, "remaining consumer keeps the shared transport alive");
  stops[49]();
  assert.equal(page.timers.size, 0);
  assert.ok([...page.events.values()].every(set => set.size === 0));
});

test("30 sports consumers accept one frozen payload with the signal, reuse it until publication changes", async () => {
  const page = harness();
  const seen: unknown[] = [];
  const stops = Array.from({ length: 30 }, () => page.store.subscribe(read => seen.push(read.sportsPublication), true));
  await page.finish(0, sportsSignal());
  assert.equal(seen.length, 0, "signal alone cannot update any consumer");
  assert.equal(page.requests.length, 2);
  assert.equal(page.requests[1].url, "/api/touchline-arena/sports-publication");
  await page.finish(1, { ok: true, data: sports() });
  assert.equal(seen.length, 30);
  assert.equal(new Set(seen).size, 1);
  const previous = page.store.getSnapshot()!.sportsPublication!;
  assert.equal(Object.isFrozen(previous.live.fixtures[0].homeTeam), true);
  page.fire(10_000); await page.finish(2, sportsSignal());
  assert.equal(page.requests.length, 3, "unchanged immutable publication needs no second payload request");
  assert.equal(page.store.getSnapshot()!.sportsPublication, previous);
  page.fire(10_000); await page.finish(3, sportsSignal("b"));
  assert.equal(page.store.getSnapshot()!.sportsPublication, previous);
  await page.finish(4, { ok: true, data: sports("b", 1) });
  assert.equal(page.store.getSnapshot()!.sportsPublication!.live.fixtures[0].homeScore, 1, "VAR correction replaces, not adds");
  assert.equal(previous.live.fixtures[0].homeScore, 2, "previous immutable snapshot is preserved");
  stops.forEach(stop => stop());
});

for (const failure of ["digest", "pointer", "malformed", "http", "pending"] as const) {
  test(`sports ${failure} preserves the entire previous read, not a half-updated signal`, async () => {
    const page = harness(); const stop = page.store.subscribe(() => undefined, true);
    await page.finish(0, sportsSignal()); await page.finish(1, { ok: true, data: sports() });
    const previous = page.store.getSnapshot();
    page.fire(10_000); await page.finish(2, sportsSignal("b"));
    const next = sports("b");
    if (failure === "digest") next.publication.contentDigest = "c".repeat(32);
    if (failure === "pointer") (next.publication as Record<string, unknown>).coachRankingSnapshotId = "other";
    if (failure === "malformed") next.live.fixtures[0].homeScore = -1;
    if (failure === "http") await page.headers(3, 503);
    else await page.finish(3, failure === "pending" ? { ok: false, status: "publication-pending" } : { ok: true, data: next });
    assert.equal(page.store.getSnapshot(), previous);
    page.fire(30_000); await page.finish(4, sportsSignal("b"));
    await page.finish(5, { ok: true, data: sports("b") });
    assert.notEqual(page.store.getSnapshot(), previous); stop();
  });
}

test("hidden payload body is cancelled and cannot roll back the resumed publication", async () => {
  const page = harness(); const stop = page.store.subscribe(() => undefined, true);
  await page.finish(0, sportsSignal()); await page.headers(1);
  page.hidden(true); page.hidden(false);
  await page.finish(2, sportsSignal("b")); await page.finish(3, { ok: true, data: sports("b") });
  await page.finish(1, { ok: true, data: sports() });
  assert.equal(page.requests[1].signal.aborted, true);
  assert.equal(page.store.getSnapshot()!.sportsPublication!.publication.contentDigest, "b".repeat(32)); stop();
});

test("a consumer seeded during an older request can demand one coalesced fresh read even when idle", async () => {
  const page = harness(); const stop = page.store.subscribe(() => undefined);
  const floor = page.store.getRequestEpoch();
  const stops = Array.from({ length: 10 }, () => page.store.subscribe(read => {
    if (read.requestEpoch <= floor) page.store.revalidate();
  }));
  await page.finish(0, state("old", false));
  assert.equal(page.requests.length, 2);
  await page.finish(1, state("fresh", false));
  assert.ok(page.store.getSnapshot()!.requestEpoch > floor);
  assert.equal(page.requests.length, 2);
  stop(); stops.forEach(stop => stop());
});

for (const pause of ["hidden", "offline"] as const) {
  test(`${pause} aborts; repeated resume shares a read and late bodies cannot overwrite`, async () => {
    const page = harness();
    const seen: string[] = [];
    const stop = page.store.subscribe(read => seen.push(read.state.playerRankingSnapshotId));
    await page.headers(0);
    if (pause === "hidden") { page.hidden(true); page.hidden(false); page.hidden(false); }
    else { page.online(false); page.online(true); page.online(true); }
    assert.equal(page.requests.length, 2);
    assert.equal(page.requests[0].signal.aborted, true);
    await page.finish(1, state("new"));
    await page.finish(0, state("old"));
    assert.deepEqual(seen, ["new"]);
    assert.equal(page.store.getSnapshot()?.generation, 1);
    stop();
  });
}

test("timeout releases a hung body without waiting for it to finish", async () => {
  const page = harness();
  const stop = page.store.subscribe(() => undefined);
  await page.headers(0);
  page.fire(8_000);
  assert.equal(page.requests[0].signal.aborted, true);
  page.fire(30_000);
  assert.equal(page.requests.length, 2);
  await page.finish(1, state("fresh"));
  await page.finish(0, state("expired"));
  assert.equal(page.store.getSnapshot()?.state.playerRankingSnapshotId, "fresh");
  assert.equal(page.timers.size, 1);
  stop();
});

for (const failure of ["http", "malformed", "unavailable", "network"] as const) {
  test(`${failure} preserves the last verified publication and schedules recovery`, async () => {
    const page = harness();
    let notifications = 0;
    const stop = page.store.subscribe(() => { notifications += 1; });
    await page.finish(0);
    const previous = page.store.getSnapshot();
    page.fire(10_000);
    if (failure === "http") await page.headers(1, 503);
    if (failure === "malformed") await page.finish(1, { ...state(), version: 9 });
    if (failure === "unavailable") await page.finish(1, { ...state("x", false), available: false });
    if (failure === "network") { page.requests[1].reject(new Error("offline")); await setImmediate(); }
    assert.equal(page.store.getSnapshot(), previous);
    assert.equal(notifications, 1);
    page.fire(30_000);
    await page.finish(2, state("corrected"));
    assert.equal(notifications, 2);
    stop();
  });
}

test("new subscribers do not replay a stale cached publication over SSR", async () => {
  const page = harness();
  const stopFirst = page.store.subscribe(() => undefined);
  await page.finish(0, state("old", false));
  const seen: string[] = [];
  const stopSecond = page.store.subscribe(read => seen.push(read.state.playerRankingSnapshotId));
  assert.deepEqual(seen, []);
  assert.equal(page.requests.length, 2, "idle publication must not strand the new subscriber");
  await page.finish(1, state("new", false));
  assert.deepEqual(seen, ["new"]);
  stopFirst(); stopSecond();
});

test("new routes immediately revalidate even when the old route already scheduled a poll", async () => {
  const page = harness();
  const first = page.store.subscribe(() => undefined);
  await page.finish(0);
  const seen: string[] = [];
  const second = page.store.subscribe(read => seen.push(read.state.playerRankingSnapshotId));
  const third = page.store.subscribe(() => undefined);
  assert.equal(page.requests.length, 2, "new mounts share one immediate read");
  assert.deepEqual(seen, [], "never replay the previous route's cached result");
  assert.deepEqual([...page.timers.values()].map(item => item.delay), [8_000], "old poll replaced by one deadline");
  await page.finish(1, state("new"));
  assert.deepEqual(seen, ["new"]);
  first(); second(); third();
});

test("unmount invalidates in-flight work but a later mount can read independently", async () => {
  const page = harness();
  let notifications = 0;
  page.store.subscribe(() => { notifications += 1; })();
  const stop = page.store.subscribe(() => { notifications += 1; });
  await page.finish(0);
  assert.equal(notifications, 0);
  await page.finish(1);
  assert.equal(notifications, 1);
  stop();
});

test("opaque publication identifiers may move backwards and are never lexically ordered", async () => {
  const page = harness();
  const stop = page.store.subscribe(() => undefined);
  await page.finish(0, state("z"));
  page.fire(10_000);
  await page.finish(1, state("a"));
  assert.equal(page.store.getSnapshot()?.state.playerRankingSnapshotId, "a");
  assert.equal(page.store.getSnapshot()?.generation, 2);
  assert.equal(Object.isFrozen(page.store.getSnapshot()), true);
  assert.equal(Object.isFrozen(page.store.getSnapshot()?.state), true);
  stop();
});

test("server import and subscription never read or mutate browser/request state", () => {
  const page = harness(false);
  page.store.subscribe(() => assert.fail("SSR notification"))();
  assert.equal(page.store.getSnapshot(), null);
  assert.equal(page.requests.length, 0);
});

test("idle tabs still discover later corrections without calling the provider", async () => {
  const page = harness(); const stop = page.store.subscribe(() => undefined);
  await page.finish(0, state("old", false)); page.fire(60_000);
  await page.finish(1, state("corrected", false));
  assert.equal(page.store.getSnapshot()!.state.playerRankingSnapshotId, "corrected");
  assert.deepEqual(page.requests.map(request => request.url), Array(2).fill("/api/touchline-arena/live-presentation-state")); stop();
});

test("revalidation during timeout resumes through one backoff; hidden abort waits for visibility", async () => {
  const page = harness(); const stop = page.store.subscribe(() => undefined);
  page.store.revalidate(); page.store.revalidate();
  page.fire(8_000); page.fire(30_000);
  assert.equal(page.requests.length, 2);
  page.store.revalidate(); page.hidden(true);
  assert.equal(page.timers.size, 0);
  page.hidden(false); await page.finish(2, state("resumed"));
  assert.equal(page.requests.length, 3);
  assert.equal(page.store.getSnapshot()!.state.playerRankingSnapshotId, "resumed"); stop();
});
