import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { touchlineFixtureState, touchlineFixtureStatusLabel } from "../lib/touchlineArena/match-centre.ts";

const source = readFileSync(new URL("../components/touchline/ClubHubLiveFixtureScore.tsx", import.meta.url), "utf8");
const fixture = { id: "100", providerId: "100", homeTeam: { id: "1", providerId: "1", name: "Home" },
  awayTeam: { id: "2", providerId: "2", name: "Away" }, homeScore: 2, awayScore: 1, status: "FT" };

function render(props: Record<string, unknown> = {}, projected = fixture) {
  const subscriptions: { seed: unknown[]; enabled: boolean }[] = [];
  let boundaries = 0;
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, {
    exports, React,
    fetch: () => assert.fail("score component must never fetch"),
    require(name: string) {
      if (name === "@/lib/touchlineArena/sports-publication-client") return {
        useTouchlinePublishedLive: (seed: unknown[], metadata: unknown, now: number, enabled: boolean) => {
          assert.equal(metadata, null); assert.equal(Number.isFinite(now), true);
          subscriptions.push({ seed, enabled }); return { fixtures: enabled && seed.length ? [projected] : seed };
        },
      };
      if (name === "@/components/touchline/TouchlineLivePresentationRefresh") return {
        default: () => { boundaries++; return null; },
      };
      if (name === "@/lib/touchlineArena/match-centre") return { touchlineFixtureState, touchlineFixtureStatusLabel };
      assert.fail(`Unexpected import: ${name}`);
    },
  });
  assert.ok(exports.default);
  const html = renderToStaticMarkup(React.createElement(exports.default, {
    fixtureId: "100", initialFixture: fixture, locale: "pt-BR", ...props,
  }));
  return { html, subscriptions, boundaries };
}

test("ClubHub score consumes the shared publication and renders corrections without its own requests or timer", () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|setInterval|setTimeout|useRouter|IntersectionObserver/);
  const result = render({}, { ...fixture, homeScore: 1 });
  assert.match(result.html, /aria-live="polite"/);
  assert.match(result.html, /1 — 1 · Encerrado/);
  assert.equal(result.subscriptions.length, 1);
  assert.equal(result.subscriptions[0].enabled, true);
  assert.equal(result.boundaries, 1, "server-owned XI shares the route refresh boundary");
});

test("preview and unknown fixture do not subscribe; missing seed waits for canonical SSR identity", () => {
  for (const props of [{ liveUpdates: false }, { fixtureId: null }]) {
    const result = render(props);
    assert.equal(result.subscriptions[0].enabled, false);
    assert.equal(result.boundaries, 0);
    assert.match(result.html, /2 — 1/);
  }
  const empty = render({ initialFixture: null });
  assert.equal(empty.subscriptions[0].seed.length, 0);
  assert.equal(empty.boundaries, 1, "a publication change may reveal the server-owned XI");
  assert.match(empty.html, />VS</);
  const mismatch = render({ fixtureId: "999" });
  assert.equal(mismatch.subscriptions[0].seed.length, 0, "names are never identity");
});

test("static official lineup explicitly isolates its score from live subscriptions", () => {
  const lineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  assert.match(lineup, /<ClubHubLiveFixtureScore liveUpdates=\{liveUpdates && !staticVisualQa\}/);
});
