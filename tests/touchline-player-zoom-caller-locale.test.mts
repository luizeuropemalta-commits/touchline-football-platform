import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields } from "../lib/touchlineArena/card-zoom-details.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { getTouchlineCardMatchFactLabels } from "../lib/touchlineArena/card-match-fact-i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import { normalizeTouchLineLocale, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { touchlinePlayerPositionKind } from "../lib/touchlineArena/position-aware-card-stats.ts";
import { touchlineCardTierName, touchlineCardTierPalette } from "../lib/touchlineArena/card-rules.ts";
import { getTouchlineClubHubContractLabel } from "../lib/touchlineArena/club-hub-roster-i18n.ts";
import { touchlineRankingZoomSelectionForCard } from "../lib/touchlineArena/touchline-ranking-zoom-selection.ts";

const callers = [
  ["components/touchline/ClubHubSquadGrid.tsx", 1],
  ["components/touchline/ClubHubOfficialLineup.tsx", 1],
  ["components/touchline/ClubHubMatchdayTechnicalArea.tsx", 1],
  ["components/touchline/TouchlinePlayerCardRankingsPublication.tsx", 3],
  ["app/rankings/touchline-tables-client.tsx", 2],
  ["app/touchline-players/[player]/page.tsx", 1],
] as const;
type Details = ReturnType<typeof buildTouchlinePlayerCardZoomDetails>;
type ZoomProps = { locale?: string; details: Details; children: React.ReactElement<Record<string, unknown>>; expandedContent: React.ReactElement<Record<string, unknown>>; contractHref?: string; tierAccent: string; tierLabel?: string; presentationMode?: string };

// Execute complete JSX nodes extracted from the actual callers. Page loading,
// authentication and the surrounding list are outside this contract fixture;
// builders and every expression/override inside the zoom JSX remain real.
function zoomExpressions(path: string) {
  const source = ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "TouchlineCardZoom") nodes.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return nodes;
}
const expressions = callers.flatMap(([path, count]) => {
  const nodes = zoomExpressions(path);
  assert.equal(nodes.length, count, `${path}: all zoom instances must be exercised`);
  return nodes.map((source, index) => ({ path, index, source, js: ts.transpileModule(`export const element = (${source});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText }));
});
const card = { id: "a0000000-0000-4000-8000-000000000123", canonicalPlayerId: "a0000000-0000-4000-8000-000000000123", providerPlayerId: "123", sportmonksPlayerId: 123, name: "Canonical Player", clubName: "Canonical Club", position: "ST", role: "ST", countryCode3: "ENG", editorialCard: null, cardReview: undefined, seasonTotalRating: 0, matchRating: null, matchStats: { goals: 0, assists: null } };
const labels = { totalRating: "PRESERVED_LABEL_OVERRIDE" };
const profileHref = "/touchline-players/canonical?playerId=123&keep=1#profile";
const rankingSource = ts.createSourceFile("ranking.tsx", readFileSync(new URL("../components/touchline/TouchlinePlayerCardRankingsPublication.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const tablesSource = ts.createSourceFile("tables.tsx", readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function sourceValue(name: string, context: Record<string, unknown>, source = rankingSource): unknown {
  const found: Array<ts.VariableDeclaration | ts.FunctionDeclaration> = [];
  function visit(node: ts.Node) { if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(source) === name) found.push(node);ts.forEachChild(node, visit); }
  visit(source);assert.equal(found.length, 1, `one actual ${name} binding`);
  const binding = ts.isVariableDeclaration(found[0]) ? found[0].initializer : found[0];
  assert.ok(binding);
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(`export const result = (${binding.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { ...context, exports });return exports.result;
}
function evaluate(expression: typeof expressions[number], locale: string, performanceTitle?: string) {
  const pt = locale === "pt-BR";
  const zoomDetails = buildTouchlinePlayerCardZoomDetails({ locale, name: card.name, clubName: card.clubName, position: card.position, profileHref });
  zoomDetails.performanceTitle = performanceTitle;
  const exports: Record<string, React.ReactElement<ZoomProps>> = {};
  const context: Record<string, unknown> = {
    exports, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
    locale, draftLocalesEnabled: false, hideMarketValuePanel: false, getTouchlineClubHubContractLabel, pt, isPortuguese: pt, portuguese: pt, card, exactPlayer: card, cardReview: undefined,
    zoomCopy: getTouchlineCardZoomCopy(locale), exactCopy: getTouchlineExactCardCopy(locale), matchFactLabels: getTouchlineCardMatchFactLabels(locale),
    getTouchlineCardZoomCopy, getTouchlineExactCardCopy,
    profileHref, canEditCardEngine: false, currentUser: null, officialChannels: {},
    labels, cardLabels: labels, tierKey: null, tierAccent: "#b8ff46", tierLabel: "CANONICAL_TIER",
    tierPalette: { accent: "#b8ff46" }, tierDisplayName: "CANONICAL_TIER",
    touchlineCardTierPalette, touchlineCardTierName, buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields,
    TOUCHLINE_NEUTRAL_CARD_ACCENT: "#b8ff46", squadCardToExactPlayer: (input: unknown) => input, touchlinePlayerProfileHref: () => profileHref,
    touchlinePlayerPositionKind, cardFactPosition: "ST", displayPosition: "Visible position", displayNationality: "ENG", editorialCard: null,
    positionKind: touchlinePlayerPositionKind(card.position),
    cumulativeRatingText: "0", text: { totalRating: "PRESERVED_TOTAL_OVERRIDE" },
    zoomMatchHistoryFields: [{ label: "Translated history prefix", historyDisplayLabel: "Canonical Fixture", value: "0", kind: "history", icon: "history" }],
    ariaLabel: "PRESERVED_ARIA_OVERRIDE", hasActiveContractOffer: false, marketHref: "/unchanged-market", previewTier: false,
    zoom: { details: zoomDetails, tierAccent: "#b8ff46", tierLabel: "CANONICAL_TIER", activeContractPrice: undefined },
    styles: new Proxy({}, { get: (_, key) => String(key) }), cardRenderScale: 0.5, staticVisualQa: false,
    TOUCHLINE_CARD_STUDIO_LAYOUT_KEY: "PRESERVED_LAYOUT_KEY",
    TouchlineCardZoom: "zoom-boundary", TouchlineEliteExactCard: "exact-card-boundary", CompactPlayerCard: "compact-card-boundary", ClubHubOfficialChannel: "official-channel-boundary",
  };
  if (expression.path === "components/touchline/TouchlinePlayerCardRankingsPublication.tsx") {
    Object.assign(context, { selected: { phase: "available", card }, selection: touchlineRankingZoomSelectionForCard(card as Parameters<typeof touchlineRankingZoomSelectionForCard>[0]), selectedSurface: "featured", touchlineRankingZoomSelectionForCard, selectedTriggerRef: { current: null }, headingRef: { current: null }, setSelection: () => {}, setSelectedSurface: () => {} });
    for (const name of ["editorialPresentation", "cardPresentation", "zoomPresentation", "selectedCard", "selectedZoom", "isSelected", "openSelected"]) context[name] = sourceValue(name, context);
    context.zoom = (context.cardPresentation as (card: unknown) => unknown)(card);
    (context.selectedZoom as { details: Details }).details.performanceTitle = performanceTitle;
  }
  if (expression.path === "app/rankings/touchline-tables-client.tsx") {
    Object.assign(context, {
      presentationMode: undefined, open: undefined, onOpenChange: () => {}, returnFocusRef: { current: null }, returnFocusFallbackRef: { current: null },
      selected: { phase: "available", card }, selection: touchlineRankingZoomSelectionForCard(card as Parameters<typeof touchlineRankingZoomSelectionForCard>[0]),
      selectedTriggerRef: { current: null }, headingRef: { current: null }, setSelection: () => {}, setSelectedSurface: () => {},
    });
    context.buildTablePlayerCardZoomPresentation = sourceValue("buildTablePlayerCardZoomPresentation", context, tablesSource);
    if (expression.index === 0) {
      const { children, ...presentation } = sourceValue("{ children, ...presentation }", context, tablesSource) as ZoomProps;
      presentation.details.performanceTitle = performanceTitle;
      Object.assign(context, { children, presentation });
    } else {
      for (const name of ["selectedCard", "selectedPresentation", "closeSelected"]) context[name] = sourceValue(name, context, tablesSource);
      (context.selectedPresentation as { details: Details }).details.performanceTitle = performanceTitle;
    }
  }
  runInNewContext(expression.js, context);
  return exports.element.props;
}

function makePanel() {
  const modules: Record<string, unknown> = {
    react: { ...React, useState: () => [false, () => {}] }, "react/jsx-runtime": jsxRuntime,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale },
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
    "@/components/touchline/a11y/TouchlineDialog": {}, "@/components/touchline/market/TouchlineMarketMarks": {},
    "@/components/touchline/social/TouchlinePlayerSocialActions": {}, "@/lib/touchlineArena/player-social-client": {},
  };
  const exports: Record<string, React.ComponentType<{ details: Details; locale?: string }>> = {};
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return (props: { details: Details; locale?: string }) => renderToStaticMarkup(React.createElement(exports.TouchlineCardZoomDetailsPanel, props));
}
const renderPanel = makePanel();

for (const expression of expressions) {
  const name = `${expression.path}#${expression.index + 1}`;
  test(`${name} forwards the caller's complete locale without deriving it from details`, () => {
    for (const locale of ["en-GB", "pt-BR", "es-ES", "ar-SA", "future-locale-sentinel"]) {
      const props = evaluate(expression, locale, locale === "pt-BR" ? "Performance" : "Desempenho");
      assert.equal(props.locale, locale);
      if (props.presentationMode === "trigger-only") {
        assert.equal(props.details, undefined);assert.equal(props.expandedContent, undefined);
      } else {
        assert.equal(props.details.title, card.name);
        assert.equal(props.details.profileHref, profileHref);
      }
      assert.equal(props.contractHref, undefined);
      assert.equal(props.tierAccent, "#b8ff46");
      const artworks = props.presentationMode === "trigger-only" ? [props.children] : props.presentationMode === "dialog-only" ? [props.expandedContent] : [props.children, props.expandedContent];
      assert.equal(artworks.length, props.presentationMode ? 1 : 2);
      for (const artwork of artworks) {
        assert.ok(artwork, "the actual visible or selected artwork must exist");
        assert.equal(artwork.props.player ?? artwork.props.card, card);
        if (expression.path.includes("ClubHub") || expression.path.includes("TouchlinePlayerCardRankingsPublication")) assert.equal(artwork.props.labels, labels);
        if (expression.path.includes("[player]")) assert.equal(artwork.props.runtimeLocaleOverride, locale);
        if (expression.path.includes("tables-client")) {
          // Rankings now delegates artwork labels to CompactPlayerCard; the
          // caller forwards locale/opt-in rather than a discarded label prop.
          assert.equal(artwork.type, "compact-card-boundary");
          assert.equal(artwork.props.locale, locale);
          assert.equal(artwork.props.draftLocalesEnabled, false);
          assert.equal(artwork.props.labels, undefined);
          assert.ok(props.details.fields.some(field => field.kind === "rating-total" && field.label === (locale === "pt-BR" ? "Nota total" : "Total rating") && field.value === "0"));
        }
      }
      if (expression.path.includes("[player]")) {
        assert.equal(props.details.positionKind, "outfield");
        assert.ok(props.details.fields.some((field) => field.label === "PRESERVED_TOTAL_OVERRIDE" && field.value === "0"));
        assert.ok(props.details.fields.some((field) => field.historyDisplayLabel === "Canonical Fixture"));
      }
    }
  });
  if (!expression.source.includes('presentationMode="trigger-only"')) test(`${name} actual prop controls panel copy despite contradictory/absent title; drafts stay gated`, () => {
    for (const requested of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
      const props = evaluate(expression, requested);
      for (const performanceTitle of [requested === "pt-BR" ? "Performance" : "Desempenho", undefined]) {
        const details = { ...props.details, performanceTitle, fields: [
          ...Array.from({ length: 7 }, (_, index) => ({ label: `Fact ${index}`, value: "0", group: "performance" as const, kind: "stat" as const, icon: "goal" })),
          { label: "Translated history prefix", historyDisplayLabel: "Canonical Fixture", value: "0", group: "performance" as const, kind: "history" as const, icon: "history" },
        ] };
        const html = renderPanel({ details, locale: props.locale });
        assert.ok(html.includes(requested === "pt-BR" ? "Ver desempenho completo" : "View full performance"), `${requested}/${performanceTitle}`);
        if (!["en-GB", "pt-BR"].includes(requested)) {
          assert.equal(isTouchLineLocaleComplete(requested), false);
          assert.equal(normalizeTouchLineLocale(requested), "en-GB");
        }
      }
    }
  });
}
