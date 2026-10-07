import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineClubHubContractLabel } from "../lib/touchlineArena/club-hub-roster-i18n.ts";
import { buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields } from "../lib/touchlineArena/card-zoom-details.ts";
import { touchlinePlayerPositionKind } from "../lib/touchlineArena/position-aware-card-stats.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { getTouchlineCardMatchFactLabels } from "../lib/touchlineArena/card-match-fact-i18n.ts";
import { touchlineCardTierName, touchlineCardTierPalette } from "../lib/touchlineArena/card-rules.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { isTouchLineLocaleComplete, normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";

const callers = [
  ["components/touchline/ClubHubSquadGrid.tsx", 1],
  ["components/touchline/ClubHubOfficialLineup.tsx", 1],
  ["components/touchline/ClubHubMatchdayTechnicalArea.tsx", 1],
  ["app/touchline-player-card-rankings/page.tsx", 2],
  ["app/rankings/touchline-tables-client.tsx", 1],
  ["components/touchline/fantasy/TouchlineGameweekCard.tsx", 1],
] as const;
type Details = ReturnType<typeof buildTouchlinePlayerCardZoomDetails>;
type Props = { details: Details; locale: string; contractHref?: string };
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX };
const compiled = new Map<string, string>();
function evaluate(source: string, context: Record<string, unknown>) {
  if (!compiled.has(source)) compiled.set(source, ts.transpileModule(`export const result = (${source});`, { compilerOptions: options }).outputText);
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled.get(source)!, { ...context, exports, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; } });
  return exports.result;
}
const expressions = callers.flatMap(([path, count]) => {
  const source = ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const jsx: ts.Node[] = [], declarations = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "TouchlineCardZoom") jsx.push(node);
    if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(source), node.initializer.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(jsx.length, count, `${path}: all real JSX nodes`);
  return jsx.map((node, index) => ({ path, index, source: node.getText(source), declarations }));
});
const statistics = { goals: 0, assists: null, defense: 9, cleanSheets: 1, saves: 4, penaltySaves: 0, goalsConceded: 2, yellowCards: 0, redCards: 0, ownGoals: 0, rating: 7, shotsOnTarget: 3, shotsOffTarget: 2, penaltiesMissed: 0 };
const profileHref = "/canonical-player?keep=1#profile";

// Execute the seven real JSX nodes, their real position initializer and the
// ranking closure. Only surrounding page loading and artwork are boundaries.
function produce(expression: typeof expressions[number], locale: string, position: string | null | undefined) {
  const card = { id: "canonical-id", canonicalPlayerId: "123", name: "Canonical $& Player", clubName: "Canonical Club", position, role: "CM", countryCode3: "ENG", editorialCard: null, seasonTotalRating: 0, matchRating: null, matchStats: statistics };
  const context: Record<string, unknown> = {
    draftLocalesEnabled: false, getTouchlineClubHubContractLabel,
    card, exact: card, exactPlayer: card, locale, pt: locale === "pt-BR", isPortuguese: locale === "pt-BR",
    zoomCopy: getTouchlineCardZoomCopy(locale), exactCopy: getTouchlineExactCardCopy(locale), copy: getTouchlineExactCardCopy(locale),
    buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields, touchlinePlayerPositionKind,
    squadCardToExactPlayer: (value: unknown) => value, touchlinePlayerProfileHref: () => profileHref,
    touchlineCardTierName, touchlineCardTierPalette, TOUCHLINE_NEUTRAL_CARD_ACCENT: "#b8ff46",
    profileHref, canEditCardEngine: false, cardReview: undefined, currentUser: null,
    tierKey: null, tierAccent: "#b8ff46", tierLabel: undefined, palette: { accent: "#b8ff46" },
    labels: {}, cardLabels: {}, styles: new Proxy({}, { get: (_, key) => String(key) }),
    TOUCHLINE_CARD_STUDIO_LAYOUT_KEY: "preserved-layout", staticVisualQa: false, cardRenderScale: 0.5,
    // Matches the default prop on all three ClubHub artwork consumers.
    hideMarketValuePanel: false,
    fitContainer: false, resolvedDisplayWidth: 132, useLiveCompactAsset: false,
    TouchlineCardZoom: "zoom-boundary", TouchlineEliteExactCard: "artwork-boundary", CompactPlayerCard: "compact-boundary",
  };
  // Absence is intentional in the RED fixture: old callers do not provide
  // positionKind, so the assertion fails on behavior, not a harness reference.
  const binding = expression.declarations.get("positionKind");
  if (binding) context.positionKind = evaluate(binding, context);
  if (expression.path === "app/touchline-player-card-rankings/page.tsx") {
    context.editorialPresentation = evaluate(expression.declarations.get("editorialPresentation")!, context);
    const closure = evaluate(expression.declarations.get("zoomPresentation")!, context) as (input: unknown) => unknown;
    context.zoom = closure(card);
  }
  if (expression.path === "components/touchline/fantasy/TouchlineGameweekCard.tsx") {
    const detailsBinding = expression.declarations.get("details");
    assert.ok(detailsBinding, "actual Gameweek details initializer");
    context.details = evaluate(detailsBinding, context);
  }
  const before = JSON.stringify(card);
  const element = evaluate(expression.source, context) as React.ReactElement<Props>;
  assert.equal(JSON.stringify(card), before);
  assert.equal(element.props.locale, locale);
  assert.equal(element.props.details.title, card.name);
  assert.equal(element.props.details.profileHref, profileHref);
  assert.equal(element.props.contractHref, undefined);
  return element.props.details;
}

const panelSource = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8");
function renderPanel(details: Details, locale: string, full = false) {
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    react: { ...React, useState: () => [full, () => {}] }, "react/jsx-runtime": jsxRuntime,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale },
    "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
    "@/components/touchline/a11y/TouchlineDialog": {}, "@/components/touchline/market/TouchlineMarketMarks": {},
    "@/components/touchline/social/TouchlinePlayerSocialActions": {}, "@/lib/touchlineArena/player-social-client": {},
  };
  const exports: Record<string, React.ComponentType<{ details: Details; locale: string }>> = {};
  if (!compiled.has(panelSource)) compiled.set(panelSource, ts.transpileModule(panelSource, { compilerOptions: options }).outputText);
  runInNewContext(compiled.get(panelSource)!, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return renderToStaticMarkup(React.createElement(exports.TouchlineCardZoomDetailsPanel, { details, locale }));
}
const tiles = (html: string, className = "statTile") => [...html.matchAll(new RegExp(`<div class="${className}">(.*?)</div>`, "g"))].map((match) => match[1].replace(/<[^>]*>/g, ""));
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
const cases = [
  { raw: "GK", kind: "goalkeeper" }, { raw: "Goalkeeper", kind: "goalkeeper" }, { raw: "goleiro", kind: "goalkeeper" },
  { raw: "ST", kind: "outfield" }, { raw: "unknown", kind: undefined },
  { raw: null, kind: undefined }, { raw: undefined, kind: undefined }, { raw: "guarda-redes", kind: undefined },
] as const;

for (const expression of expressions) test(`${expression.path}#${expression.index + 1}: canonical position controls real zoom, unknown preserves legacy`, () => {
  for (const locale of locales) for (const { raw, kind } of cases) {
    const details = produce(expression, locale, raw);
    assert.equal(details.positionKind, kind, `${locale}/${raw}: raw position, never the default CM role`);
    const gameweek = expression.path.includes("GameweekCard");
    const actualFacts = details.fields.filter((field) => field.group === "performance" && field.kind === "stat");
    // Existing fact projection is deliberately unchanged, including ClubHub's
    // separate legacy role fallback. Gameweek supplies no match-stat fields.
    const factsPosition = expression.path.includes("tables") ? raw : raw || "CM";
    const expectedFacts = gameweek ? [] : buildTouchlineVerifiedMatchFactFields({ position: factsPosition, statistics }, locale);
    assert.deepEqual(actualFacts.map(({ label, value, icon, kind }) => ({ label, value, icon, kind })), expectedFacts.map(({ label, value, icon, kind }) => ({ label, value, icon, kind })));
    const rating = details.fields.find((field) => field.kind === "rating-total");
    assert.equal(rating?.value, gameweek ? "0.00" : "0");
    if (!gameweek) assert.equal(details.fields.find((field) => field.kind === "rating-last")?.value, "—");

    // At the shared panel boundary, supply the same canonical facts to Gameweek
    // without adding facts to its product caller. This proves its semantic prop
    // will constrain a populated panel without manufacturing live statistics.
    const panelFacts = buildTouchlineVerifiedMatchFactFields({ position: raw || "CM", statistics }, locale).map((field) => ({ ...field, value: field.value ?? "—", group: "performance" as const }));
    const populated = { ...details, fields: [...details.fields.filter((field) => field.kind !== "stat"), ...panelFacts] };
    const goalkeeper = kind === "goalkeeper" || (kind === undefined && raw === "guarda-redes");
    const expectedCount = goalkeeper ? 5 : 6;
    const html = renderPanel(populated, locale);
    assert.equal(tiles(html).length, expectedCount, `${locale}/${raw}: compact limit`);
    const full = renderPanel(populated, locale, true);
    assert.equal(tiles(full).length + tiles(full, "fullStat").length, panelFacts.length);
    assert.ok(full.includes('href="/canonical-player?keep=1#profile"'));
    assert.ok(full.includes("—"));
    assert.ok(tiles(full, "fullStat").some((tile) => tile.endsWith("—")), "unavailable fact remains in the expanded section, not zero");
    if (raw === "GK" || raw === "ST") {
      const copy = getTouchlineCardMatchFactLabels(locale);
      const first = raw === "GK"
        ? [`${copy.goals}0`, `${copy.cleanSheets}1`, `${copy.saves}4`, `${copy.penaltySaves}0`, `${copy.goalsConceded}2`]
        : [`${copy.goals}0`, `${copy.defense}9`, `${copy.cleanSheets}1`, `${copy.yellowCards}0`, `${copy.redCards}0`, `${copy.shotsOnTarget}3`];
      assert.deepEqual(tiles(html), first, "canonical order/values, not translated subtitle classification");
      const contradictory = { ...populated, subtitle: raw === "GK" ? "TRANSLATED STRIKER SENTINEL" : "Goalkeeper · Goleiro · guarda-redes" };
      assert.deepEqual(tiles(renderPanel(contradictory, locale)), first, "explicit semantic kind wins over contradictory display text");
    }
    if (!["en-GB", "pt-BR"].includes(locale)) {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.equal(normalizeTouchLineLocale(locale), "en-GB");
    }
  }
});
