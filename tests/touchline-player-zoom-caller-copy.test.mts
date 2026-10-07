import assert from "node:assert/strict";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineClubHubContractLabel } from "../lib/touchlineArena/club-hub-roster-i18n.ts";
import { touchlinePlayerAppearanceLabel } from "../lib/touchlineArena/player-appearance-presentation.ts";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields } from "../lib/touchlineArena/card-zoom-details.ts";
import { getTouchlineCardZoomCopy, TOUCHLINE_CARD_ZOOM_CATALOGUES, TOUCHLINE_CARD_ZOOM_DRAFT_LOCALES, TOUCHLINE_CARD_ZOOM_DRAFT_STATUS } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { getTouchlineCardMatchFactLabels } from "../lib/touchlineArena/card-match-fact-i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { isTouchLineLocaleComplete, normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";
import { touchlinePlayerPositionKind } from "../lib/touchlineArena/position-aware-card-stats.ts";
import { touchlineCardTierName, touchlineCardTierPalette } from "../lib/touchlineArena/card-rules.ts";

const callers = [
  ["components/touchline/ClubHubSquadGrid.tsx", 1],
  ["components/touchline/ClubHubOfficialLineup.tsx", 1],
  ["components/touchline/ClubHubMatchdayTechnicalArea.tsx", 1],
  ["app/touchline-player-card-rankings/page.tsx", 2],
  ["app/rankings/touchline-tables-client.tsx", 1],
  ["app/touchline-players/[player]/page.tsx", 1],
] as const;
const sources = new Map(callers.map(([path]) => [path, ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)]));
type Path = typeof callers[number][0];
type Details = ReturnType<typeof buildTouchlinePlayerCardZoomDetails>;
type Props = { details: Details; ariaLabel: string; locale: string; contractHref?: string; children: React.ReactElement; expandedContent: React.ReactElement };
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const expected = {
  "en-GB": { expandCard: "Expand card for {playerName}", openCard: "Open card for {playerName}", openCurrentCard: "Open current card for {playerName}", openMatchCard: "Open match card for {playerName}", openGoalCard: "Open goal card for {playerName}", openUpgradedCard: "Open upgraded card for {playerName}", lastMatchRating: "Last match rating", officialPlayerProfile: "Official player profile", matchHistoryEntry: "Match history" },
  "pt-BR": { expandCard: "Ampliar card de {playerName}", openCard: "Ampliar card de {playerName}", openCurrentCard: "Ampliar card atual de {playerName}", openMatchCard: "Ampliar card da partida de {playerName}", openGoalCard: "Ampliar card do gol de {playerName}", openUpgradedCard: "Ampliar card evoluído de {playerName}", lastMatchRating: "Nota da última partida", officialPlayerProfile: "Perfil oficial do atleta", matchHistoryEntry: "Histórico da partida" },
};
function nodes(path: Path, predicate: (node: ts.Node) => boolean) {
  const found: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(sources.get(path)!);
  return found;
}
function initializer(path: Path, name: string, functionName?: string) {
  const found = nodes(path, (node) => {
    if (!ts.isVariableDeclaration(node) || node.name.getText() !== name) return false;
    if (!functionName) return true;
    let parent: ts.Node | undefined = node.parent;
    while (parent && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
    return !!parent && ts.isFunctionDeclaration(parent) && parent.name?.text === functionName;
  }) as ts.VariableDeclaration[];
  assert.equal(found.length, 1, `${path}: one real ${name} initializer`);
  assert.ok(found[0].initializer);
  return found[0].initializer.getText();
}
function evaluate(source: string, context: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const js = ts.transpileModule(`export const result = (${source});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(js, { ...context, exports, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; } });
  return exports.result;
}
const expressions = callers.flatMap(([path, count]) => {
  const found = nodes(path, (node) => ts.isJsxElement(node) && node.openingElement.tagName.getText() === "TouchlineCardZoom");
  assert.equal(found.length, count);
  return found.map((node, index) => ({ path, index, source: node.getText() }));
});

// The seven actual JSX nodes and ranking's real presentation closure execute
// with real builders. Only surrounding page fetching/artwork are boundaries.
function contextFor(path: Path, locale: string, value: number | null, sentinel = false, requireBindings = true) {
  const card = { id: "canonical-id", canonicalPlayerId: "123", sportmonksPlayerId: 123, name: "Canonical $& <Player>", clubName: "Canonical Club", position: "ST", role: "ST", countryCode3: "ENG", editorialCard: null, cardReview: undefined, seasonTotalRating: value, matchRating: value, matchStats: { goals: 0, assists: null } };
  const seen: Array<[string, string]> = [];
  const zoomGetter = (requested: string) => { seen.push(["zoom", requested]); return sentinel ? { ...getTouchlineCardZoomCopy("en-GB"), ...Object.fromEntries(Object.keys(expected["en-GB"]).map((key) => [key, key.includes("Card") ? `TRANSLATED_${key} {playerName}` : `TRANSLATED_${key}`])) } : getTouchlineCardZoomCopy(requested); };
  const exactGetter = (requested: string) => { seen.push(["exact", requested]); return { ...getTouchlineExactCardCopy(requested), ...(sentinel ? { totalRating: "TRANSLATED_TOTAL" } : {}) }; };
  const factGetter = (requested: string) => { seen.push(["facts", requested]); return { ...getTouchlineCardMatchFactLabels(requested), ...(sentinel ? { rating: "TRANSLATED_SCORE" } : {}) }; };
  const context: Record<string, unknown> = {
    draftLocalesEnabled: false,
    hideMarketValuePanel: false, getTouchlineClubHubContractLabel,
    locale, pt: locale === "pt-BR", isPortuguese: locale === "pt-BR", portuguese: locale === "pt-BR", card, exactPlayer: card, cardReview: undefined,
    getTouchlineCardZoomCopy: zoomGetter, getTouchlineExactCardCopy: exactGetter, getTouchlineCardMatchFactLabels: factGetter, touchlinePlayerAppearanceLabel,
    profileHref: "/canonical-profile?keep=1#anchor", canEditCardEngine: false, currentUser: null,
    labels: { totalRating: "PRESERVED_ARTWORK_OVERRIDE" }, cardLabels: { totalRating: "PRESERVED_ARTWORK_OVERRIDE" },
    tierKey: null, tierAccent: "#b8ff46", tierLabel: undefined, tierPalette: { accent: "#b8ff46" }, tierDisplayName: undefined,
    touchlineCardTierPalette, touchlineCardTierName, TOUCHLINE_NEUTRAL_CARD_ACCENT: "#b8ff46",
    squadCardToExactPlayer: (input: unknown) => input, touchlinePlayerProfileHref: () => "/canonical-profile?keep=1#anchor",
    buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields, touchlinePlayerPositionKind,
    positionKind: touchlinePlayerPositionKind(card.position),
    cardFactPosition: "ST", displayPosition: "Visible position", displayNationality: "ENG", editorialCard: null,
    cumulativeRatingText: value === null ? "—" : String(value),
    copy: { en: { totalRating: "LEGACY_TOTAL", unavailable: "Unavailable", minutes: "Minutes" }, pt: { totalRating: "LEGACY_TOTAL", unavailable: "Indisponível", minutes: "Minutos" } },
    zoomMatchHistoryFields: [], ariaLabel: "PRESERVED_ARIA_OVERRIDE", hasActiveContractOffer: false, marketHref: "/unchanged-market", previewTier: false,
    styles: new Proxy({}, { get: (_, key) => String(key) }), cardRenderScale: 0.5, staticVisualQa: false,
    TOUCHLINE_CARD_STUDIO_LAYOUT_KEY: "PRESERVED_LAYOUT_KEY", TouchlineCardZoom: "zoom-boundary", TouchlineEliteExactCard: "exact-boundary", CompactPlayerCard: "compact-boundary",
  };
  for (const name of ["zoomCopy", "exactCopy"]) context[name] = requireBindings ? evaluate(initializer(path, name), context) : name === "zoomCopy" ? zoomGetter(locale) : exactGetter(locale);
  if (path.includes("[player]")) {
    const profileContext = { ...context,
      copy: evaluate(initializer(path, "copy"), context),
      profileChromeDrafts: evaluate(initializer(path, "profileChromeDrafts"), context),
      resolveTouchlineCatalogueLocale: catalogueLocale.resolveTouchlineCatalogueLocale,
      normalizeTouchLineLocale,
    };
    const getter = nodes(path, node => ts.isFunctionDeclaration(node) && node.name?.text === "getTouchlinePlayerProfileCopy")[0];
    assert.ok(getter, "real profile getter must exist");
    context.getTouchlinePlayerProfileCopy = evaluate(getter.getText(), profileContext);
    context.matchFactLabels = requireBindings ? evaluate(initializer(path, "matchFactLabels"), context) : factGetter(locale);
    context.text = evaluate(initializer(path, "text", "renderPlayerProfilePage"), context);
  }
  if (path === "app/touchline-player-card-rankings/page.tsx") {
    context.editorialPresentation = evaluate(initializer(path, "editorialPresentation"), context);
    const presentation = evaluate(initializer(path, "zoomPresentation"), context) as (input: unknown) => unknown;
    context.zoom = presentation(card);
  }
  if (path === "app/rankings/touchline-tables-client.tsx") context.player = evaluate(initializer(path, "player", "TablePlayerCardZoom"), context);
  return { context, seen, card };
}

const panelExports: Record<string, React.ComponentType<{ details: Details; locale: string }>> = {};
const modules: Record<string, unknown> = {
  "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
  react: { ...React, useState: () => [false, () => {}] }, "react/jsx-runtime": jsxRuntime, "react-dom": { createPortal: (children: React.ReactNode) => children },
  "lucide-react": new Proxy({}, { get: (_, name) => (props: Record<string, unknown>) => React.createElement("svg", { ...props, "data-icon": String(name) }) }),
  "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale }, "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
  "@/components/touchline/a11y/TouchlineDialog": {}, "@/components/touchline/market/TouchlineMarketMarks": {}, "@/components/touchline/social/TouchlinePlayerSocialActions": {}, "@/lib/touchlineArena/player-social-client": {},
};
runInNewContext(ts.transpileModule(readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: panelExports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });

test("nine caller labels preserve exact EN/PT, placeholders, eight catalogues and six draft gates", () => {
  assert.deepEqual(Object.keys(TOUCHLINE_CARD_ZOOM_CATALOGUES), locales);
  for (const locale of locales) {
    const copy = TOUCHLINE_CARD_ZOOM_CATALOGUES[locale] as Record<string, string>;
    for (const key of Object.keys(expected["en-GB"])) {
      assert.ok(copy[key]?.trim(), `${locale}/${key}`);
      assert.equal((copy[key].match(/\{playerName\}/g) ?? []).length, key.includes("Card") ? 1 : 0);
      if (locale === "en-GB" || locale === "pt-BR") assert.equal(copy[key], expected[locale][key as keyof typeof expected["en-GB"]]);
    }
    if (locale !== "en-GB" && locale !== "pt-BR") {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.equal(normalizeTouchLineLocale(locale), "en-GB");
      assert.equal(getTouchlineCardZoomCopy(locale), TOUCHLINE_CARD_ZOOM_CATALOGUES["en-GB"]);
    }
  }
  assert.deepEqual(TOUCHLINE_CARD_ZOOM_DRAFT_LOCALES, locales.slice(2));
  assert.equal(TOUCHLINE_CARD_ZOOM_DRAFT_STATUS, "draft");
});

test("all seven actual producers explicitly carry total/last semantics before translated labels", () => {
  for (const expression of expressions) {
    const { context } = contextFor(expression.path, "en-GB", 0, false, false);
    const props = (evaluate(expression.source, context) as React.ReactElement<Props>).props;
    const total = props.details.fields.find((field) => field.label === "Total rating" || field.label === "LEGACY_TOTAL");
    const last = props.details.fields.find((field) => field.label === "Last match rating");
    assert.ok(total, expression.path); assert.ok(last, expression.path);
    assert.equal(total.kind, "rating-total", expression.path);
    assert.equal(total.icon, "rating", expression.path); assert.equal(total.primary, true, expression.path);
    assert.equal(last.kind, "rating-last", expression.path); assert.equal(last.icon, "rating", expression.path);
  }
});

for (const expression of expressions) test(`${expression.path}#${expression.index + 1}: real copy and explicit ratings survive translation, zero and unavailable`, () => {
  for (const locale of [...locales, "future-locale-sentinel"]) for (const sentinel of [false, true]) for (const value of [0, null]) {
    const { context, seen, card } = contextFor(expression.path, locale, value, sentinel);
    const props = (evaluate(expression.source, context) as React.ReactElement<Props>).props;
    const totalLabel = sentinel ? "TRANSLATED_TOTAL" : getTouchlineExactCardCopy(locale).totalRating;
    const lastLabel = sentinel ? "TRANSLATED_lastMatchRating" : expected[locale === "pt-BR" ? "pt-BR" : "en-GB"].lastMatchRating;
    const totals = props.details.fields.filter((field) => field.kind === "rating-total");
    const lasts = props.details.fields.filter((field) => field.kind === "rating-last");
    assert.equal(totals.length, 1); assert.equal(lasts.length, 1);
    assert.equal(totals[0].label, totalLabel); assert.equal(lasts[0].label, lastLabel);
    assert.equal(totals[0].primary, true);
    for (const field of [...totals, ...lasts]) { assert.equal(field.icon, "rating"); assert.equal(field.value, value === null ? "—" : "0"); assert.equal(field.accent, true); }
    assert.equal(props.details.title, card.name); assert.equal(props.details.profileHref, "/canonical-profile?keep=1#anchor");
    assert.equal(props.locale, locale); assert.equal(props.contractHref, undefined);
    assert.deepEqual(seen, expression.path.includes("[player]") ? [["zoom", locale], ["exact", locale], ["facts", locale]] : [["zoom", locale], ["exact", locale]]);
    const copy = context.zoomCopy as Record<string, string>;
    assert.equal(props.ariaLabel, expression.path.includes("[player]") ? "PRESERVED_ARIA_OVERRIDE" : copy[expression.path.includes("ClubHub") ? "expandCard" : "openCard"].replace("{playerName}", () => card.name));
    if (expression.path.includes("[player]")) assert.equal(props.details.eyebrow, copy.officialPlayerProfile);
    const html = renderToStaticMarkup(React.createElement(panelExports.TouchlineCardZoomDetailsPanel, { details: props.details, locale: props.locale }));
    assert.match(html, /class="ratingHero"/); assert.match(html, /data-icon="Star"/); assert.match(html, /data-icon="CircleGauge"/);
    assert.ok(html.includes(totalLabel)); assert.ok(html.includes(lastLabel));
    assert.match(html, value === null ? /<strong>—<\/strong>/ : /<strong>0<\/strong>/);
  }
});

test("profile history and all four actual social-card labels preserve names, dates, values and overrides", () => {
  const path: Path = "app/touchline-players/[player]/page.tsx";
  const calls = nodes(path, (node) => ts.isCallExpression(node) && node.expression.getText() === "socialCardVisual") as ts.CallExpression[];
  assert.equal(calls.length, 4);
  for (const locale of locales) for (const sentinel of [false, true]) {
    const { context, card } = contextFor(path, locale, 0, sentinel);
    Object.assign(context, {
      playerStatistics: { matchHistory: [{ appearanceStatus: "played", minutes: 0, rating: 0, fixtureStartsAt: "canonical-time" }, { appearanceStatus: "unknown", minutes: null, rating: null, fixtureStartsAt: null }] },
      touchlinePlayerAppearanceLabel: (status: string) => `CANONICAL_${status}`,
      formatOfficialSyncTime: (value: string | null) => value === null ? null : "CANONICAL_DATE",
    });
    const fields = evaluate(initializer(path, "zoomMatchHistoryFields"), context) as Array<{ label: string; value: string; historyDisplayLabel: string; kind: string }>;
    const copy = context.zoomCopy as Record<string, string>;
    const text = context.text as Record<string, string>;
    const rating = (context.matchFactLabels as Record<string, string>).rating;
    assert.equal(fields[0].label, `${copy.matchHistoryEntry} · CANONICAL_DATE`);
    assert.equal(fields[0].value, `CANONICAL_played · 0 ${text.minutes.toLowerCase()} · ${rating} 0`);
    assert.equal(fields[1].value, `CANONICAL_unknown · ${text.unavailable} · ${rating} —`);
    assert.equal(fields[1].historyDisplayLabel, text.unavailable); assert.ok(fields.every((field) => field.kind === "history"));
    const keys = ["openCurrentCard", "openMatchCard", "openGoalCard", "openUpgradedCard"];
    calls.forEach((call, index) => assert.equal(evaluate(call.arguments[0].getText(), context), copy[keys[index]].replace("{playerName}", () => card.name)));
  }
});

test("profile's real helper copy contract accepts the shared total label without widening other literals", () => {
  const path: Path = "app/touchline-players/[player]/page.tsx";
  const aliases = nodes(path, (node) => ts.isTypeAliasDeclaration(node) && node.name.text === "ProfileCopy");
  assert.equal(aliases.length, 1);
  const textTypes = nodes(path, (node) => (ts.isParameter(node) || ts.isPropertySignature(node)) && node.name?.getText() === "text") as Array<ts.ParameterDeclaration | ts.PropertySignature>;
  assert.equal(textTypes.length, 3);
  for (const node of textTypes) assert.equal(node.type?.getText(), "ProfileCopy");
  // Compile only extracted source contracts in memory. No app build or full
  // project typecheck; expected-errors also prove non-total literals stay strict.
  const code = `type Omit<T, K> = { [P in keyof T as P extends K ? never : P]: T[P] };
    const copy = ${initializer(path, "copy")};
    ${aliases[0].getText()}
    declare const locale: string;
    declare const draftLocalesEnabled: boolean;
    declare function getTouchlinePlayerProfileCopy(locale: string, draftLocalesEnabled: boolean): ProfileCopy;
    declare const exactCopy: { totalRating: string };
    declare const zoomCopy: { history: string };
    declare const matchFactLabels: { minutes: string; rating: string };
    declare function touchlinePlayerAppearanceLabel(status: null, locale: string, draftLocalesEnabled: boolean): string;
    const text = ${initializer(path, "text", "renderPlayerProfilePage")};
    const accepted: ProfileCopy = text;
    const translated: ProfileCopy = { ...copy.en, totalRating: "TRANSLATED" };
    // @ts-expect-error unrelated literals remain exact
    const rejected: ProfileCopy = { ...copy.en, goals: "UNAPPROVED", totalRating: "TRANSLATED" };`;
  const options = { noLib: true, noEmit: true, strict: true, target: ts.ScriptTarget.ES2022 };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => name === "profile-copy-probe.ts" ? ts.createSourceFile(name, code, options.target, true) : undefined;
  const program = ts.createProgram(["profile-copy-probe.ts"], options, host);
  assert.deepEqual(program.getSemanticDiagnostics().map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")), []);
});
