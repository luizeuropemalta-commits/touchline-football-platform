import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as positionStats from "../lib/touchlineArena/position-aware-card-stats.ts";
import { normalizeTouchLineLocale, TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import * as coachCopy from "../lib/touchlineArena/coach-zoom-i18n.ts";
import { resolvePlayerSocialSubject } from "../lib/touchlineArena/player-social-client.ts";
import { localizedCountryLabel } from "../lib/touchlineArena/country-labels.ts";
import { touchlineCardTierName, touchlineCardTierPalette } from "../lib/touchlineArena/card-rules.ts";

type Component = React.ComponentType<Record<string, unknown>>;
type Module = Record<string, Component>;
const paths = {
  zoom: "../components/touchline/cards/TouchlineCardZoom.tsx",
  player: "../components/touchline/fantasy/TouchlineGameweekCard.tsx",
  coach: "../components/touchline/cards/TouchlineCoachCardZoom.tsx",
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(new URL(path, import.meta.url), "utf8")]));
const detail = (performanceTitle?: string) => ({
  title: "Canonical Player", subtitle: "Canonical Club · Striker", performanceTitle,
  fields: [
    { label: "Canonical identity", value: "CAN", group: "identity", kind: "identity", icon: "club" },
    { label: "Total Rating", value: "0", group: "performance", kind: "rating-total", icon: "rating" },
    ...Array.from({ length: 7 }, (_, index) => ({ label: `Fact ${index}`, value: String(index), group: "performance", kind: "stat", icon: "goal" })),
    { label: "Match history · Canonical Fixture", value: "—", group: "performance", kind: "history", icon: "history" },
  ],
  profileHref: "/touchline-players/canonical?playerId=123",
});

// Transpile the complete real components, not a reimplementation of locale
// resolution. DOM portals, effects, icon artwork and social I/O are boundaries;
// React creates and renders the actual JSX, panel and child prop handoffs.
function fixture(options: { docLang?: string; forbidDocumentLanguage?: boolean; states?: boolean[]; noDocument?: boolean } = {}) {
  let stateIndex = 0; const socialLocales: string[] = []; const zoomProps: Record<string, unknown>[] = [];
  const documentBoundary = {
    body: {}, documentElement: { get lang() { if (options.forbidDocumentLanguage) throw Error("explicit locale must not read document language"); return options.docLang ?? "en-GB"; } },
  };
  const reactBoundary = {
    ...React,
    useLayoutEffect() {},
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [options.states?.[stateIndex++] ?? initial, () => {}],
  };
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/position-aware-card-stats": positionStats,
    react: reactBoundary, "react/jsx-runtime": jsxRuntime,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/components/touchline/a11y/TouchlineDialog": { useTouchlineDialog: () => ({ dialogProps: { role: "dialog" } }), useTouchlineDialogScrollLock() {} },
    "@/components/touchline/market/TouchlineMarketMarks": { TouchlineCoinMark: () => null },
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/components/touchline/social/TouchlinePlayerSocialActions": { default: ({ locale }: { locale: string }) => { socialLocales.push(locale); return React.createElement("span", { "data-social-locale": locale }); } },
    "@/lib/touchlineArena/player-social-client": { resolvePlayerSocialSubject },
    "@/lib/touchlineArena/i18n": { normalizeTouchLineLocale },
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale },
    "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
    "@/lib/touchlineArena/exact-card-i18n": { getTouchlineExactCardCopy },
    "@/lib/touchlineArena/coach-zoom-i18n": coachCopy,
    "@/lib/touchlineArena/card-rules": { touchlineCardTierName, touchlineCardTierPalette },
    "@/lib/touchlineArena/country-labels": { localizedCountryLabel },
    "@/components/touchline/cards/TouchlineEliteExactCard": { default: () => null },
    "./TouchlineCoachCard": { default: () => null },
    // The caller contract is independent of conversion of football records.
    "@/lib/touchlineArena/demo-data": { squadCardToExactPlayer: (card: Record<string, unknown>) => ({ ...card, sportmonksPlayerId: 123 }) },
    "@/lib/touchlineArena/player-links": { touchlinePlayerProfileHref: () => "/touchline-players/canonical?playerId=123" },
    "@/lib/touchlineArena/card-zoom-details": { buildTouchlinePlayerCardZoomDetails: (input: Record<string, unknown>) => ({ ...detail("Performance"), title: input.name }) },
  };
  function compile(source: string): Module {
    const exports = {};
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(js, { exports, require: (name: string) => { assert.ok(name in modules, `unhandled import ${name}`); return modules[name]; }, ...(options.noDocument ? {} : { document: documentBoundary }) });
    return exports as Module;
  }
  const zoom = compile(sources.zoom);
  const ZoomBoundary = (props: Record<string, unknown>) => { zoomProps.push(props); return React.createElement(zoom.default, props); };
  modules["./TouchlineCardZoom"] = { default: ZoomBoundary };
  modules["@/components/touchline/cards/TouchlineCardZoom"] = { default: ZoomBoundary };
  return {
    zoom, socialLocales, zoomProps,
    renderZoom(props: Record<string, unknown>) {
      const { children = "Card artwork", ...zoomProps } = props;
      return renderToStaticMarkup(React.createElement(zoom.default, { ariaLabel: "Open canonical card", socialProviderId: "123", ...zoomProps }, children as React.ReactNode));
    },
    renderPanel(props: Record<string, unknown>) { return renderToStaticMarkup(React.createElement(zoom.TouchlineCardZoomDetailsPanel, props)); },
    renderCaller(kind: "player" | "coach", props: Record<string, unknown>) { const caller = compile(sources[kind]); return renderToStaticMarkup(React.createElement(caller.default, props)); },
  };
}

test("explicit zoom language overrides contradictory/absent title and document in panel, social and close", () => {
  for (const locale of ["pt-BR", "en-GB"]) {
    const pt = locale === "pt-BR";
    for (const performanceTitle of [pt ? "Performance" : "Desempenho", undefined, "Registo TouchLine"]) {
      const view = fixture({ docLang: pt ? "en-GB" : "pt-BR", states: [true, false] });
      const details = detail(performanceTitle), before = JSON.stringify(details);
      const html = view.renderZoom({ locale, details });
      assert.ok(html.includes(`aria-label="${pt ? "Fechar card" : "Close card"}"`));
      assert.ok(html.includes(pt ? "Ver desempenho completo" : "View full performance"));
      assert.ok(html.includes(pt ? "Últimas partidas" : "Recent matches"));
      assert.deepEqual(view.socialLocales, [locale]);
      assert.equal(JSON.stringify(details), before); assert.match(html, /Canonical Player/); assert.match(html, />0</);
      if (performanceTitle) assert.ok(html.includes(performanceTitle), "the caller owns its heading; locale must not replace content");
    }
  }
});

test("explicit locale path never reads document language and works without document for closed SSR", () => {
  const view = fixture({ forbidDocumentLanguage: true, states: [true, false] });
  assert.doesNotThrow(() => view.renderZoom({ locale: "pt-BR", details: detail("Performance") }));
  const server = fixture({ noDocument: true, states: [false] });
  assert.match(server.renderZoom({ locale: "pt-BR", details: detail() }), /aria-expanded="false"/);
});

test("panel standalone explicit locale is gated and controls both compact and expanded copy", () => {
  for (const locale of ["pt-BR", "en-GB", "fr-FR"]) {
    const pt = locale === "pt-BR";
    const view = fixture({ states: [true] });
    const html = view.renderPanel({ locale, details: detail(pt ? "Performance" : "Desempenho") });
    for (const value of pt ? ["Ocultar desempenho completo", "Desempenho completo", "Histórico de partidas"] : ["Hide full performance", "Full performance", "Match history"]) assert.ok(html.includes(value));
    assert.match(html, /Canonical Fixture/); assert.match(html, /Fact 6/);
  }
});

test("six draft locales and explicit invalid values cannot switch public zoom to title/document language", () => {
  const drafts = TOUCHLINE_APPROVED_LOCALES.map(value => value.code).slice(2);
  for (const locale of [...drafts, "", "constructor", "__proto__", "unknown"]) {
    const view = fixture({ docLang: "pt-BR", states: [true, false] });
    const html = view.renderZoom({ locale, details: detail("Desempenho") });
    assert.match(html, /aria-label="Close card"/); assert.match(html, /View full performance/); assert.deepEqual(view.socialLocales, ["en-GB"]);
  }
  for (const locale of drafts) assert.equal(isTouchLineLocaleComplete(locale), false);
});

test("omitted locale preserves legacy independent title and document fallbacks", () => {
  for (const docLang of ["pt-BR", "en-GB"]) for (const title of ["Desempenho", "Performance", undefined]) {
    const view = fixture({ docLang, states: [true, false] });
    const html = view.renderZoom({ details: detail(title) });
    assert.ok(html.includes(`aria-label="${docLang === "pt-BR" ? "Fechar card" : "Close card"}"`));
    assert.ok(html.includes(title === "Desempenho" ? "Ver desempenho completo" : "View full performance"));
    assert.deepEqual(view.socialLocales, [title === "Desempenho" ? "pt-BR" : "en-GB"]);
    const standalone = fixture({ states: [false] });
    assert.ok(standalone.renderPanel({ details: detail(title) }).includes(title === "Desempenho" ? "Ver desempenho completo" : "View full performance"));
  }
});

test("actual player and coach JSX pass their locale explicitly without changing canonical identity/details", () => {
  for (const locale of ["pt-BR", "en-GB", "ar-SA"]) {
    const view = fixture({ docLang: locale === "pt-BR" ? "en-GB" : "pt-BR", states: [true, false] });
    const html = view.renderCaller("player", { locale, card: { name: "Canonical Player", clubName: "Canonical Club", position: "Striker", seasonTotalRating: 0 } });
    assert.equal(view.zoomProps[0].locale, locale);
    assert.deepEqual(view.socialLocales, [resolveTouchLinePresentationLocale(locale)]);
    assert.ok(html.includes(locale === "pt-BR" ? "Fechar card" : "Close card"));
    const coachView = fixture({ docLang: locale === "pt-BR" ? "en-GB" : "pt-BR", states: [true, false] });
    const coachHtml = coachView.renderCaller("coach", { locale, coach: { displayName: "Canonical Coach" }, slot: { cardTier: "ruby-red" }, clubName: "Canonical Club", contract: null, profileHref: "/touchline-coaches/canonical" });
    assert.equal(coachView.zoomProps[0].locale, locale); assert.equal((coachView.zoomProps[0].details as { profileActionKind: string }).profileActionKind, "coach");
    assert.deepEqual(coachView.socialLocales, []); assert.match(coachHtml, /Canonical Coach/); assert.match(coachHtml, /Canonical Club/);
    assert.ok(coachHtml.includes(locale === "pt-BR" ? "Fechar card" : "Close card"));
  }
});

test("custom details and absent details keep their existing layout and social eligibility", () => {
  const empty = fixture({ docLang: "en-GB", states: [true] });
  const html = empty.renderZoom({ locale: "pt-BR", tierLabel: "Canonical Tier" });
  assert.match(html, /Fechar card/); assert.match(html, /Canonical Tier/); assert.deepEqual(empty.socialLocales, []);
  const custom = fixture({ docLang: "en-GB", states: [true] });
  const customHtml = custom.renderZoom({ locale: "pt-BR", details: detail(), detailsContent: React.createElement("b", null, "Custom canonical details") });
  assert.match(customHtml, /Custom canonical details/); assert.doesNotMatch(customHtml, /Ver desempenho completo|View full performance/);
  assert.deepEqual(custom.socialLocales, ["pt-BR"]);
});
