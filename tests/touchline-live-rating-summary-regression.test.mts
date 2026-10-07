import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, React, Intl,
  require: (name: string) => {
    if (name === "react") return React;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/lib/")) return require(`../${name.slice(2)}.ts`);
    if (name === "@/components/logo") return { Logo: () => null };
    if (name.startsWith("@/components/") || name === "./TouchlineFixtureAlerts") return { default: () => null };
    assert.fail(`Unexpected import ${name}`);
  },
  fetch: () => assert.fail("SSR must not fetch"),
});

// Literal independent output oracles; never derive expected text from ratingCount.
const expected = {
  "en-GB": ["1 official rating", "2 official ratings"],
  "pt-BR": ["1 rating oficial", "2 ratings oficiais"],
  "es-ES": ["1 valoración oficial", "2 valoraciones oficiales"],
  "it-IT": ["1 voto ufficiale", "2 voti ufficiali"],
  "fr-FR": ["1 note officielle", "2 notes officielles"],
  "ar-SA": ["1 تقييم رسمي", "تقييمان رسميان"],
  "tr-TR": ["1 resmî puan", "2 resmî puan"],
  "de-DE": ["1 offizielle Bewertung", "2 offizielle Bewertungen"],
};
for (const [locale, labels] of Object.entries(expected)) for (const count of [1, 2]) {
  test(`real Live points summary renders ${locale} count ${count} and preserves factual ratings`, () => {
    const fixture = { id: "fixture-1", providerId: "19722203", roundId: "r1", roundName: "1", startsAt: "2026-10-03T11:30:00Z", status: "LIVE", liveMinute: 30, homeScore: 0, awayScore: 0,
      homeTeam: { id: "19", providerId: "19", name: "Arsenal" }, awayTeam: { id: "18", providerId: "18", name: "Chelsea" } };
    const statistics = Array.from({ length: count }, (_, i) => ({ playerId: `p${i}`, playerName: `Player ${i}`, teamId: "19", appearanceStatus: "started", minutes: 30, rating: i === 0 ? 0 : 7.5 }));
    const props = { initialFixtures: [fixture], initialFixtureId: fixture.id, initialLocale: locale, draftLocalesEnabled: true, initialNow: Date.parse("2026-10-03T12:00:00Z"), initialTimeZone: "Europe/Malta",
      initialMatchDetail: { fixture: { ...fixture, id: fixture.providerId }, capturedAt: "2026-10-03T12:00:00Z", events: [], lineups: [], playerStatistics: [...statistics, { playerId: "unrated", playerName: "Unrated", teamId: "18", rating: null }] } };
    const before = JSON.stringify(props);
    const html = renderToStaticMarkup(React.createElement(exports.default!, props));
    const summary = html.match(/<section class="pointsSummary">([\s\S]*?)<\/section>/)?.[1];
    assert.ok(summary, "real pointsSummary must render");
    assert.ok(summary.includes(`<strong>${labels[count - 1]}</strong>`), summary);
    assert.match(summary, /<b>0<\/b>/, "zero is an official rating, not missing");
    if (count === 2) assert.match(summary, /<b>7\.5<\/b>/);
    assert.equal(JSON.stringify(props), before, "presentation cannot change source facts");
  });
}
