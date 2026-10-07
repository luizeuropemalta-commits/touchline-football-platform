import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import type { TouchlineCardZoomDetails } from "../components/touchline/cards/TouchlineCardZoom.tsx";
import { touchlineCardTierName, touchlineCardTierPalette } from "../lib/touchlineArena/card-rules.ts";
import { localizedCountryLabel } from "../lib/touchlineArena/country-labels.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import * as coachCopy from "../lib/touchlineArena/coach-zoom-i18n.ts";

const competition = { snapshotId: "snapshot", seasonId: "season", seasonLabel: "Canonical season", rank: 3, scoringVersion: "coach_scoring_v2", totalTouchlinePoints: 0, home: { wins: 2, draws: 1, losses: 0, touchlinePoints: 7 }, away: { wins: 0, draws: 1, losses: 3, touchlinePoints: -3 } };
const contract = { id: "contract", coachProviderId: "789", clubProviderId: "123", status: "active", startedAt: "2026-01-01", endedAt: null, endReason: null, scoringVersion: "coach_scoring_v2", totalTouchlinePoints: 41, home: { wins: 4, draws: 1, losses: 0, touchlinePoints: 13 }, away: { wins: 3, draws: 2, losses: 0, touchlinePoints: 28 }, currentFixture: { fixtureId: "fixture", context: "away", status: "live", startsAt: null, provisionalPoints: 0 }, fixtureHistory: [] };

type ZoomProps = { locale: string; details: TouchlineCardZoomDetails; expandedContent: React.ReactElement<Record<string, unknown>>; children: React.ReactElement<Record<string, unknown>>; ariaLabel: string };
const modules: Record<string, unknown> = {
  "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
  react: { ...React, useState: () => [true, () => {}] }, "react/jsx-runtime": jsxRuntime,
  "react-dom": { createPortal: (children: React.ReactNode) => children },
  "lucide-react": new Proxy({}, { get: (_, name) => (props: Record<string, unknown>) => React.createElement("svg", { ...props, "data-icon": String(name) }) }),
  "@/lib/touchlineArena/card-rules": { touchlineCardTierName, touchlineCardTierPalette },
  "@/lib/touchlineArena/country-labels": { localizedCountryLabel },
  "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale },
  "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
  "@/lib/touchlineArena/coach-zoom-i18n": coachCopy,
  "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  "@/components/touchline/a11y/TouchlineDialog": {}, "@/components/touchline/market/TouchlineMarketMarks": {},
  "@/components/touchline/social/TouchlinePlayerSocialActions": {}, "@/lib/touchlineArena/player-social-client": {},
  "./TouchlineCoachCard": { default: () => null }, "./TouchlineCardZoom": { default: () => null },
};
function compile(file: string) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Intl, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  return exports;
}
// Real producer and real panel. Artwork and portal/DOM effects stay at the
// boundary; no duplicate field/record/icon/grouping implementation is used.
const Coach = compile("../components/touchline/cards/TouchlineCoachCardZoom.tsx").default as (props: Record<string, unknown>) => React.ReactElement<ZoomProps>;
const Panel = compile("../components/touchline/cards/TouchlineCardZoom.tsx").TouchlineCardZoomDetailsPanel as React.ComponentType<{ details: TouchlineCardZoomDetails; locale: string }>;
function produce(locale: string, records: { competition: typeof competition | null; contract: typeof contract | null } = { competition, contract }) {
  return Coach({ locale, coach: { providerId: "789", displayName: "Canonical Coach", nationality: "Portugal", dateOfBirth: "1980-02-03" }, slot: { cardTier: "ruby-red" }, clubName: "Canonical Club", countryCode3: "POR", profileHref: "/touchline-coaches/789?lang=preserved", publishedTouchlinePoints: 999, showLeadershipCrown: true, ...records }).props;
}
function render(details: TouchlineCardZoomDetails, locale: string) {
  return renderToStaticMarkup(React.createElement(Panel, { details, locale }));
}
function icons(html: string) { return [...html.matchAll(/data-icon="([^"]+)"/g)].map((match) => match[1]); }

test("coach producer declares canonical grouping and distinct rank tokens without translating labels", () => {
  for (const locale of ["pt-BR", "en-GB", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const { details } = produce(locale);
    const fields = details.fields.filter(({ group }) => group === "performance");
    assert.deepEqual(Array.from(fields, ({ kind }) => kind), ["stat", "rating-total", "stat", "stat", "stat", "stat"]);
    assert.deepEqual(Array.from(fields, ({ icon }) => icon), [locale === "pt-BR" ? "coach-rank-position" : "coach-rank", "rating", "coach-home", "coach-home", "coach-away", "coach-away"]);
    assert.deepEqual(Array.from(details.fields.filter(({ group }) => group === "identity"), ({ icon }) => icon), ["coach-club", "coach-nationality", "coach-role", "coach-birth", "coach-tier"]);
    assert.equal(fields[1].label, "TouchLine Points"); assert.equal(fields[1].primary, true);
  }
});

test("all coach icon tokens beat contradictory labels while retaining existing locale-specific rank design", () => {
  for (const locale of ["pt-BR", "en-GB"]) {
    const original = produce(locale).details;
    const poisoned = { ...original, fields: original.fields.map((field) => ({ ...field, label: "Preço Nota total gols Match history posição" })) };
    const html = render(poisoned, locale);
    assert.deepEqual(icons(html), ["Building2", "Flag", "UserRound", "History", "Medal", "Star", locale === "pt-BR" ? "UserRound" : "Activity", "Activity", "Activity", "Activity", "Activity"]);
    assert.equal((html.match(/class="ratingHero"/g) ?? []).length, 1);
    assert.equal((html.match(/class="statTile"/g) ?? []).length, 5);
    assert.doesNotMatch(html, /class="historyGrid"/);
  }
});

test("current PT/EN icons, competition precedence, names, exact values and card props remain unchanged", () => {
  const before = JSON.stringify({ competition, contract });
  for (const locale of ["pt-BR", "en-GB"]) {
    const props = produce(locale);
    const fields = props.details.fields.filter(({ group }) => group === "performance");
    assert.deepEqual(Array.from(fields, ({ value }) => value), ["#3", "0", "2-1-0", "7", "0-1-3", "-3"]);
    const html = render(props.details, locale);
    assert.deepEqual(icons(html), ["Building2", "Flag", "UserRound", "History", "Medal", "Star", locale === "pt-BR" ? "UserRound" : "Activity", "Activity", "Activity", "Activity", "Activity"]);
    assert.equal(props.details.title, "Canonical Coach"); assert.ok(props.details.subtitle?.startsWith("Canonical Club · "));
    assert.equal(props.details.performanceSubtitle, "Canonical season");
    assert.equal(props.details.profileHref, "/touchline-coaches/789?lang=preserved");
    assert.equal(props.details.profileActionKind, "coach"); assert.equal(props.locale, locale);
    for (const card of [props.children, props.expandedContent]) {
      assert.equal(card.props.publishedTouchlinePoints, 999); assert.equal(card.props.showLeadershipCrown, true);
      assert.equal(card.props.fixtureContext, "away"); assert.equal(card.props.locale, locale);
    }
    const contractOnly = produce(locale, { competition: null, contract });
    assert.deepEqual(Array.from(contractOnly.details.fields.filter(({ group }) => group === "performance"), ({ value }) => value), ["41", "4-1-0", "13", "3-2-0", "28"]);
  }
  assert.equal(JSON.stringify({ competition, contract }), before);
});

test("missing record remains verification/evidence, never fake points or match-history grouping", () => {
  for (const locale of ["pt-BR", "en-GB"]) {
    const props = produce(locale, { competition: null, contract: null });
    const fields = props.details.fields.filter(({ group }) => group === "performance");
    assert.deepEqual(Array.from(fields, ({ kind }) => kind), ["stat", "stat"]);
    assert.deepEqual(Array.from(fields, ({ icon }) => icon), ["coach-verified", "coach-evidence"]);
    const html = render(props.details, locale);
    assert.deepEqual(icons(html), ["Building2", "Flag", "UserRound", "History", "Medal", "Activity", "History"]);
    assert.doesNotMatch(html, /class="ratingHero"/); assert.doesNotMatch(html, /class="historyGrid"/);
    assert.ok(html.includes(locale === "pt-BR" ? "Aguardando dados verificados" : "Awaiting verified data"));
    const poisoned = { ...props.details, fields: props.details.fields.map((field) => ({ ...field, label: "Total rating Match history gols" })) };
    assert.deepEqual(icons(render(poisoned, locale)), icons(html));
  }
});

test("legacy icon and grouping fallback remain unchanged outside explicit coach tokens", () => {
  const fields = [
    { label: "Posição na competição", value: "#3", icon: "rank" }, { label: "Competition rank", value: "#3", icon: "rank" },
    { label: "Casa", value: "0", icon: "home" }, { label: "Away", value: "0", icon: "away" },
    { label: "Verified identity", value: "yes", icon: "verified" }, { label: "Match evidence", value: "pending", icon: "history" },
    { label: "Goals", value: "0", icon: "constructor" },
  ].map((field) => ({ ...field, group: "performance" as const }));
  const html = render({ title: "Legacy", fields }, "en-GB");
  assert.deepEqual(icons(html), ["UserRound", "Activity", "Activity", "Activity", "Activity", "History", "ChartNoAxesCombined", "ChevronDown", "Goal"]);
  const old = render({ title: "Legacy", fields: [{ label: "Total rating", value: "0", group: "performance", primary: true }, { label: "Match history · Original fixture", value: "7", group: "performance", icon: "history" }] }, "en-GB");
  assert.match(old, /class="ratingHero"/); assert.match(old, /<span>Original fixture<\/span>7/);
});
