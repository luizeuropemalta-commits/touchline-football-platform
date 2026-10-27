import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { touchlineFixtureStatusLabel, type TouchlineLiveReadMetadata } from "../lib/touchlineArena/match-centre.ts";
import { clubHubStripState } from "../lib/touchlineArena/club-hub-fixture-strip.ts";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";
import type { TouchlinePublicFixture } from "../lib/football-data/public-fixture.ts";

const source = readFileSync(new URL("../components/touchline/ClubHubLiveFixtureScore.tsx", import.meta.url), "utf8");
const NOW = Date.parse("2026-10-25T15:15:00Z");
const fresh: TouchlineLiveReadMetadata = { state: "persisted-live-snapshot", degraded: false, fetchedAt: "2026-10-25T15:14:00Z" };
const fixture: TouchlinePublicFixture = { id: "100", providerId: "100", homeTeam: { id: "1", providerId: "1", name: "Home" },
  awayTeam: { id: "2", providerId: "2", name: "Away" }, homeScore: 2, awayScore: 1, status: "FT" };

function render(props: Record<string, unknown> = {}, projected: TouchlinePublicFixture | TouchlinePublicFixture[] = fixture, metadata: TouchlineLiveReadMetadata | null = null) {
  const subscriptions: { seed: unknown[]; enabled: boolean }[] = [];
  let boundaries = 0;
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, {
    exports, React, Date: class extends Date { static now() { return NOW; } },
    fetch: () => assert.fail("score component must never fetch"),
    require(name: string) {
      if (name === "@/lib/touchlineArena/sports-publication-client") return {
        useTouchlinePublishedLive: (seed: unknown[], initialMetadata: unknown, now: number, enabled: boolean) => {
          assert.equal(initialMetadata, null); assert.equal(Number.isFinite(now), true);
          subscriptions.push({ seed, enabled }); return { fixtures: enabled && seed.length ? (Array.isArray(projected) ? projected : [projected]) : seed, metadata };
        },
      };
      if (name === "@/components/touchline/TouchlineLivePresentationRefresh") return {
        default: () => { boundaries++; return null; },
      };
      if (name === "@/lib/touchlineArena/match-centre") return { touchlineFixtureStatusLabel };
      if (name === "@/lib/touchlineArena/club-hub-fixture-strip") return { clubHubStripState };
      if (name === "@/lib/touchlineArena/match-centre-i18n") return { getTouchlineMatchCentreCopy };
      assert.fail(`Unexpected import: ${name}`);
    },
  });
  assert.ok(exports.default);
  const html = renderToStaticMarkup(React.createElement(exports.default, {
    fixtureId: "100", initialFixture: fixture, locale: "pt-BR", ...props,
  }));
  return { html, text: html.replace(/<[^>]*>/g, ""), subscriptions, boundaries };
}

test("ClubHub score consumes the shared publication and renders corrections without its own requests or timer", () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|setInterval|setTimeout|useRouter|IntersectionObserver/);
  const result = render({}, { ...fixture, homeScore: 1 });
  assert.match(result.html, /aria-live="polite"/);
  assert.match(result.text, /1 — 1 Encerrado/);
  assert.equal(result.subscriptions.length, 1);
  assert.equal(result.subscriptions[0].enabled, true);
  assert.equal(result.boundaries, 1, "server-owned XI shares the route refresh boundary");
});

test("preview and unknown fixture do not subscribe; missing seed waits for canonical SSR identity", () => {
  for (const props of [{ liveUpdates: false }, { fixtureId: null }]) {
    const result = render(props);
    assert.equal(result.subscriptions[0].enabled, false);
    assert.equal(result.boundaries, 0);
    assert.match(result.text, props.fixtureId === null ? /^VS$/ : /2 — 1/);
  }
  const empty = render({ initialFixture: null });
  assert.equal(empty.subscriptions[0].seed.length, 0);
  assert.equal(empty.boundaries, 1, "a publication change may reveal the server-owned XI");
  assert.match(empty.text, /^VS$/);
  const mismatch = render({ fixtureId: "999" });
  assert.equal(mismatch.subscriptions[0].seed.length, 0, "names are never identity");
  assert.match(mismatch.text, /^VS$/, "a mismatched initial fixture cannot be used as fallback");
});

test("ClubHub in-play status uses the strip freshness contract while preserving verified zero scores", () => {
  const live = { ...fixture, status: "2nd Half", homeScore: 0, awayScore: 0, startsAt: "2026-10-25T14:00:00Z", liveMinute: 61 };
  for (const metadata of [null, { ...fresh, degraded: true }, { ...fresh, fetchedAt: "2026-10-25T15:09:59Z" }, { ...fresh, fetchedAt: "2026-10-25T15:16:00Z" }]) {
    const { text } = render({ initialFixture: live }, live, metadata);
    assert.match(text, /0 — 0 Dados ao vivo em atualização/);
    assert.doesNotMatch(text, /61′|2º tempo/);
  }
  assert.match(render({ initialFixture: live }, live, fresh).text, /0 — 0 61′/);
  assert.match(render({ initialFixture: live }, { ...live, liveMinute: undefined }, fresh).text, /0 — 0 2º tempo/);
  assert.match(render({ initialFixture: live }, { ...live, status: "FT" }, { ...fresh, degraded: true }).text, /0 — 0 Encerrado/);
  const future = render({ initialFixture: live }, { ...live, startsAt: "2026-10-25T16:00:00Z" }, fresh).text;
  assert.match(future, /^0 — 0$/);
  assert.doesNotMatch(future, /61′|2º tempo/, "a future kickoff cannot be promoted by the raw half or minute");
});

test("past NS and omitted/mismatched publication never promote an old half to current live status", () => {
  const live = { ...fixture, status: "2nd Half", startsAt: "2026-10-25T14:00:00Z", homeScore: 0, awayScore: 0 };
  const pending = { ...live, status: "Not Started" };
  assert.match(render({ initialFixture: live }, pending, { ...fresh, degraded: true }).text, /0 — 0 Aguardando atualização oficial/);
  assert.match(render({ initialFixture: live }, [], fresh).text, /0 — 0 Dados ao vivo em atualização/);
  const neighbour = { ...fixture, id: "999", providerId: "999", homeScore: 9, awayScore: 8 };
  const selected = render({ initialFixture: live }, [neighbour, pending], fresh).text;
  assert.match(selected, /0 — 0 Aguardando atualização oficial/);
  assert.doesNotMatch(selected, /9 — 8/);
  assert.match(render({ initialFixture: live }, [neighbour], fresh).text, /0 — 0 Dados ao vivo em atualização/);
});

test("score and full freshness status have separate wrapping boxes in one polite announcement", () => {
  const live = { ...fixture, status: "2nd Half", startsAt: "2026-10-25T14:00:00Z", homeScore: 0, awayScore: 0 };
  const result = render({ initialFixture: live }, live);
  assert.match(result.html, /<b aria-live="polite"><span data-clubhub-fixture-score="">0 — 0<\/span><span data-clubhub-fixture-status=""> Dados ao vivo em atualização<\/span><\/b>/);
  assert.equal(result.text, "0 — 0 Dados ao vivo em atualização");
  assert.doesNotMatch(result.html, /aria-hidden|title=/, "freshness is visible content, not hidden or tooltip-only");
});

test("static official lineup explicitly isolates its score from live subscriptions", () => {
  const lineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  assert.match(lineup, /<ClubHubLiveFixtureScore liveUpdates=\{liveUpdates && !staticVisualQa\}/);
});
