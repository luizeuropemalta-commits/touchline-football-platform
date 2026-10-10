import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { parseTouchlinePublicFixtures } from "../lib/football-data/public-fixture-client.ts";

const source = readFileSync(new URL("../components/touchline/ClubHubLiveFixtureScore.tsx", import.meta.url), "utf8");

function mount(fetchResult: () => Promise<unknown>) {
  let effect: (() => void | (() => void)) | undefined;
  let tick: (() => void) | undefined;
  let fetches = 0;
  let refreshes = 0;
  const updates: unknown[] = [];
  const exports: { default?: (props: Record<string, unknown>) => unknown } = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText,
    {
      exports,
      React,
      document: { hidden: false },
      IntersectionObserver: class {
        callback: (entries: { isIntersecting: boolean }[]) => void;
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { this.callback = callback; }
        observe() { this.callback([{ isIntersecting: true }]); }
        disconnect() {}
      },
      window: { setInterval: (callback: () => void, ms: number) => { assert.equal(ms, 45_000); tick = callback; return 1; }, clearInterval: () => {} },
      fetch: async () => { fetches++; return fetchResult(); },
      require: (name: string) => {
        if (name === "react") return { useRef: () => ({ current: {} }), useState: (initial: unknown) => [initial, (next: unknown) => { updates.push(next); }], useEffect: (callback: typeof effect) => { effect = callback; } };
        if (name === "next/navigation") return { useRouter: () => ({ refresh: () => { refreshes++; } }) };
        if (name === "@/lib/football-data/public-fixture-client") return { parseTouchlinePublicFixtures };
        if (name === "@/lib/touchlineArena/match-centre") return { touchlineFixtureState: () => "upcoming", touchlineFixtureStatusLabel: () => "" };
        assert.fail(`Unexpected import: ${name}`);
      },
    },
  );
  assert.ok(exports.default);
  exports.default({ fixtureId: "100", initialFixture: null, locale: "pt-BR" });
  assert.ok(effect);
  const cleanup = effect();
  assert.ok(tick);
  return { tick, cleanup, updates, counts: () => ({ fetches, refreshes }) };
}

async function settle() {
  await new Promise<void>(resolve => setImmediate(resolve));
}

test("ClubHub does not issue a redundant server refresh immediately after initial render", async () => {
  const view = mount(async () => ({ ok: true, json: async () => ({ data: [] }) }));
  await settle();
  assert.deepEqual(view.counts(), { fetches: 0, refreshes: 0 });
  view.cleanup?.();
});

test("invalid HTTP200 DTO preserves last score without refreshing; valid and empty DTOs refresh official XI", async () => {
  const fixture = { id: "100", providerId: "100", homeTeam: { id: "1", providerId: "1", name: "Home" }, awayTeam: { id: "2", providerId: "2", name: "Away" }, homeScore: 2, awayScore: 1 };
  let payload: unknown = { data: [fixture] };
  const view = mount(async () => ({ ok: true, json: async () => payload }));
  view.tick(); await settle();
  assert.deepEqual(view.updates, [fixture]);
  assert.equal(view.counts().refreshes, 1);
  for (const invalid of [{}, { data: null }, { data: {} }, { data: [fixture, { ...fixture, homeScore: -1 }] }]) {
    payload = invalid;
    view.tick(); await settle();
    assert.equal(view.counts().refreshes, 1);
    assert.deepEqual(view.updates, [fixture]);
  }
  // An empty but valid durable feed may accompany a new server-owned XI. It
  // must not erase the last score, and retains the established refresh policy.
  payload = { data: [] };
  view.tick(); await settle();
  assert.equal(view.counts().refreshes, 2);
  assert.deepEqual(view.updates, [fixture]);
  view.cleanup?.();
});

test("ClubHub keeps periodic official-sheet refresh, but failed score fetch does not refresh the page", async () => {
  let fail: "none" | "network" | "http" = "none";
  const view = mount(async () => {
    if (fail === "network") throw new Error("network unavailable");
    if (fail === "http") return { ok: false };
    return { ok: true, json: async () => ({ data: [] }) };
  });
  await settle();
  view.tick();
  await settle();
  assert.deepEqual(view.counts(), { fetches: 1, refreshes: 1 });
  fail = "network";
  view.tick();
  await settle();
  assert.deepEqual(view.counts(), { fetches: 2, refreshes: 1 });
  fail = "http";
  view.tick();
  await settle();
  assert.deepEqual(view.counts(), { fetches: 3, refreshes: 1 });
  view.cleanup?.();
});
