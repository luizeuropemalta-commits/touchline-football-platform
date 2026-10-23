import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { setImmediate } from "node:timers/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as matchCentre from "../lib/touchlineArena/match-centre.ts";
import { parseTouchlineLivePresentationState } from "../lib/touchlineArena/live-presentation-state.ts";
import { parseTouchlineSportsPublication } from "../lib/touchlineArena/sports-publication.ts";

test("the real score uses the shared publication and refresh boundary without a per-score poller", () => {
  const source = readFileSync(new URL("../components/touchline/ClubHubLiveFixtureScore.tsx", import.meta.url), "utf8");
  const reads: Array<{ seed: unknown[]; enabled: boolean }> = [];
  const refreshes: Array<{ serverRefreshAfterMs: number }> = [];
  let published: unknown[] | null = null;
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText, { exports, React, require(name: string) {
    if (name === "@/lib/touchlineArena/match-centre") return matchCentre;
    if (name === "@/lib/touchlineArena/sports-publication-client") return {
      useTouchlinePublishedLive(seed: unknown[], metadata: unknown, now: number, enabled: boolean) {
        assert.equal(metadata, null); assert.equal(now, 0);
        reads.push({ seed, enabled }); return { fixtures: published ?? seed };
      },
    };
    if (name === "@/components/touchline/TouchlineLivePresentationRefresh") return {
      default(props: { serverRefreshAfterMs: number }) { refreshes.push(props); return null; },
    };
    assert.fail(`Unexpected score dependency: ${name}`);
  } });
  assert.ok(exports.default);
  const fixture = { providerId: "fixture", status: "1H", homeScore: 0, awayScore: 0, liveMinute: 0 };
  const render = (fixtureId: string | null, liveUpdates = true) => {
    reads.length = 0; refreshes.length = 0;
    return renderToStaticMarkup(React.createElement(exports.default!, {
      fixtureId, initialFixture: fixture, locale: "en-GB", liveUpdates,
    }));
  };
  assert.match(render("fixture"), /0 — 0/);
  assert.equal(reads[0].seed[0], fixture);
  assert.equal(reads[0].enabled, true);
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].serverRefreshAfterMs, 45_000);
  published = [{ ...fixture, homeScore: 2, awayScore: 1 }];
  assert.match(render("fixture"), /2 — 1/);
  published = null;
  render("fixture", false);
  assert.equal(reads[0].enabled, false); assert.equal(refreshes.length, 0);
  render(null);
  assert.equal(reads[0].enabled, false); assert.equal(reads[0].seed.length, 0); assert.equal(refreshes.length, 0);
  render("different-fixture");
  assert.equal(reads[0].seed.length, 0, "another fixture cannot seed the shared reader");
  assert.doesNotMatch(source, /\bfetch\s*\(|\bsetInterval\s*\(|\bsetTimeout\s*\(|\buseEffect\s*\(/,
    "visibility, transport and request lifetime belong to the single shared store");
});

test("the shared score transport pauses while the tab is hidden, never overlaps and rejects late unmounted results", async () => {
  const source = readFileSync(new URL("../lib/touchlineArena/live-presentation-client-store.ts", import.meta.url), "utf8");
  const compiled = stripTypeScriptTypes(source.replace(/import[\s\S]*?from\s+"[^"]+";/g, "")).replaceAll("export ", "");
  const requests: Array<{ url: string; signal: AbortSignal; resolve: (response: unknown) => void }> = [];
  const events = new Map<string, Set<() => void>>();
  const timers = new Map<number, { run: () => void; delay: number }>();
  let nextTimer = 0;
  const document = { hidden: true,
    addEventListener(name: string, callback: () => void) { const callbacks = events.get(name) ?? new Set(); callbacks.add(callback); events.set(name, callbacks); },
    removeEventListener(name: string, callback: () => void) { events.get(name)?.delete(callback); },
  };
  const window = { ...document,
    setTimeout(run: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { run, delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  };
  const context = vm.createContext({ window, document, navigator: { onLine: true }, AbortController,
    parseTouchlineLivePresentationState, parseTouchlineSportsPublication,
    fetch: (url: string, options: { signal: AbortSignal }) => new Promise(resolve => { requests.push({ url, signal: options.signal, resolve }); }),
  });
  vm.runInContext(compiled, context);
  const store = vm.runInContext("touchlineLivePresentationStore", context) as {
    subscribe(listener: (read: { generation: number }, claimRefresh: () => boolean) => void): () => void;
    getSnapshot(): { generation: number } | null;
  };
  const visibility = (hidden: boolean) => { document.hidden = hidden; for (const callback of events.get("visibilitychange") ?? []) callback(); };
  const finish = async (index: number) => {
    requests[index].resolve({ ok: true, json: async () => ({ version: 1, available: true,
      playerRankingSnapshotId: "ranking-a", coachRankingSnapshotId: null, livePresentationSnapshotId: "digest-a",
      mode: "live", pollAfterMs: 10_000, resumeAt: null }) });
    await setImmediate();
  };
  let updates = 0, refreshes = 0;
  const listener = (_read: { generation: number }, claimRefresh: () => boolean) => { updates++; if (claimRefresh()) refreshes++; };
  // Separate score boundaries share one transport, not one timer per card.
  const firstStop = store.subscribe(listener);
  const secondStop = store.subscribe((read, claim) => listener(read, claim));
  assert.equal(requests.length, 0, "hidden tabs never start a request");
  visibility(false); visibility(false);
  assert.equal(requests.length, 1, "visible resumes cannot overlap an in-flight read");
  assert.equal(requests[0].url, "/api/touchline-arena/live-presentation-state");
  await finish(0);
  assert.equal(updates, 2); assert.equal(refreshes, 1);
  assert.equal(store.getSnapshot()?.generation, 1);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 10_000, "cadence is the accepted shared signal, not a score-local interval");
  visibility(true);
  assert.equal(timers.size, 0); assert.equal(requests.length, 1);
  visibility(false);
  assert.equal(requests.length, 2);
  firstStop(); secondStop();
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(timers.size, 0);
  assert.ok([...events.values()].every(callbacks => callbacks.size === 0));
  await finish(1);
  assert.equal(updates, 2); assert.equal(refreshes, 1);
  assert.equal(store.getSnapshot()?.generation, 1, "late unmounted responses cannot replace the accepted snapshot");
});
