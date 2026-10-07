import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { resolvePlayerSocialSubject } from "../lib/touchlineArena/player-social-client.ts";

const loadCopy = () => import("../lib/touchlineArena/card-zoom-i18n.ts");
const source = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8");
const baseline = {
  "en-GB": { hide: "Hide full performance", view: "View full performance", history: "Match history", recent: "Recent matches", full: "Full performance", close: "Close card", profile: "View profile", historyLink: "View TouchLine history", cardEngine: "Edit in Card Engine", performance: "Performance", performanceSubtitle: "Official match ratings and statistics" },
  // Five formerly English defaults are intentionally translated. Existing
  // six PT chrome labels and the English baseline stay byte-for-byte intact.
  "pt-BR": { hide: "Ocultar desempenho completo", view: "Ver desempenho completo", history: "Histórico de partidas", recent: "Últimas partidas", full: "Desempenho completo", close: "Fechar card", profile: "Ver perfil", historyLink: "Ver histórico TouchLine", cardEngine: "Editar no Card Engine", performance: "Desempenho", performanceSubtitle: "Notas e estatísticas oficiais da partida" },
};
type Copy = typeof baseline["en-GB"];
const chromeKeys = Object.keys(baseline["en-GB"]) as (keyof Copy)[];
const callerKeys = ["expandCard", "openCard", "openCurrentCard", "openMatchCard", "openGoalCard", "openUpgradedCard", "lastMatchRating", "officialPlayerProfile", "matchHistoryEntry"];
const chromeCopy = (copy: Copy) => Object.fromEntries(chromeKeys.map((key) => [key, copy[key]]));
type Details = Record<string, unknown>;
const details = (): Details => ({
  title: "Canonical player", positionKind: "goalkeeper", subtitle: "Contradictory forward",
  profileHref: "/profile?playerId=123", historyHref: "/history?id=123", cardEngineHref: "/admin/card?id=123",
  fields: [
    { label: "TOTAL", value: "0", group: "performance", kind: "rating-total" },
    ...Array.from({ length: 7 }, (_, i) => ({ label: `Fact ${i}`, value: i === 6 ? "—" : String(i), group: "performance", kind: "stat" })),
    { label: "Untranslated source history", historyDisplayLabel: "Canonical date", value: "0", group: "performance", kind: "history" },
  ],
});

// Full real component module and React rendering. Hook state selects actual
// compact/full branches; portal, browser effects and social I/O are boundaries.
function fixture(getCopy: (locale?: string | null) => Copy, full: boolean, documentLocale = "en-GB", resolveLocale: (locale?: string | null) => string = resolveTouchLinePresentationLocale) {
  let stateIndex = 0;
  const socialLocales: string[] = [];
  const modules: Record<string, unknown> = {
    react: { ...React, useLayoutEffect() {}, useRef: (current: unknown) => ({ current }), useState: () => [stateIndex++ === 0 ? true : full, () => {}] },
    "react/jsx-runtime": jsxRuntime, "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/components/touchline/a11y/TouchlineDialog": { useTouchlineDialog: () => ({ dialogProps: { role: "dialog" } }), useTouchlineDialogScrollLock() {} },
    "@/components/touchline/market/TouchlineMarketMarks": { TouchlineCoinMark: () => null },
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale: resolveLocale },
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale: resolveLocale },
    "@/lib/touchlineArena/player-social-client": { resolvePlayerSocialSubject },
    "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy: getCopy },
    "@/components/touchline/social/TouchlinePlayerSocialActions": { default: ({ locale }: { locale: string }) => { socialLocales.push(locale); return null; } },
  };
  const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(js, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; }, document: { body: {}, documentElement: { lang: documentLocale } } });
  return {
    socialLocales,
    render(props: Record<string, unknown>) { return renderToStaticMarkup(React.createElement(exports.default, { ariaLabel: "Canonical trigger", socialProviderId: "123", ...props }, "Artwork")); },
  };
}

test("actual zoom consumes all eleven catalogue entries, preserving brand, links, values and role/history semantics", () => {
  const used = new Set<string>();
  const copy = new Proxy(baseline["en-GB"], { get: (_, key) => { used.add(String(key)); return `copy_${String(key)}`; } });
  for (const full of [false, true]) {
    const input = details(), before = JSON.stringify(input);
    const html = fixture(() => copy, full).render({ locale: "en-GB", details: input });
    assert.ok(html.includes('aria-label="copy_close"'));
    for (const key of ["profile", "historyLink", "cardEngine", "performance", "performanceSubtitle"]) assert.ok(html.includes(`copy_${key}`), key);
    assert.ok(html.includes(full ? "copy_hide" : "copy_view"));
    assert.ok(html.includes(full ? "copy_history" : "copy_recent"));
    assert.equal((html.match(/class="statTile"/g) ?? []).length, 5);
    assert.match(html, /<span>Canonical date<\/span>0/);
    assert.match(html, /TouchLine Verified/);
    assert.match(html, /href="\/profile\?playerId=123"/);
    assert.match(html, />0</);
    assert.equal(JSON.stringify(input), before);
    assert.ok(!html.includes('class="contractAction"'));
  }
  assert.deepEqual([...used].sort(), Object.keys(baseline["en-GB"]).sort());
});

test("EN/PT copy preserves approved chrome and applies only the five authorized PT default corrections", async () => {
  const { getTouchlineCardZoomCopy } = await loadCopy();
  for (const locale of ["en-GB", "pt-BR"] as const) {
    assert.deepEqual(chromeCopy(getTouchlineCardZoomCopy(locale)), baseline[locale]);
    for (const full of [false, true]) {
      const html = fixture(getTouchlineCardZoomCopy, full, locale === "pt-BR" ? "en-GB" : "pt-BR").render({ locale, details: details() });
      for (const key of ["close", "profile", "historyLink", "cardEngine", "performance", "performanceSubtitle", full ? "hide" : "view", full ? "history" : "recent"] as (keyof Copy)[]) assert.ok(html.includes(baseline[locale][key]), `${locale}/${key}`);
    }
  }
});

test("explicit normalized locale reaches both chrome getters without a second EN/PT collapse", () => {
  // A seam probe, not locale activation: the real public gate is separately
  // covered below. The stub models a future admitted locale without editing it.
  for (const expected of ["es-ES", "ar-SA"]) {
    const normalizedInputs: (string | null | undefined)[] = [];
    const getterInputs: (string | null | undefined)[] = [];
    const sentinel = Object.fromEntries(Object.keys(baseline["en-GB"]).map((key) => [key, `${expected}_${key}`])) as Copy;
    const view = fixture((locale) => { getterInputs.push(locale); return sentinel; }, false, "pt-BR", (locale) => { normalizedInputs.push(locale); return expected; });
    const html = view.render({ locale: expected, details: { ...details(), performanceTitle: "Desempenho" } });
    assert.ok(normalizedInputs.length >= 1);
    assert.ok(normalizedInputs.every((locale) => locale === expected));
    assert.deepEqual(getterInputs, [expected, expected]);
    assert.ok(html.includes(`aria-label="${expected}_close"`));
    assert.ok(html.includes(`${expected}_view`));
    assert.deepEqual(view.socialLocales, [expected]);
  }
});

test("all eight catalogues have exact nonempty keys and protected brands; six remain draft and publicly gated", async () => {
  const mod = await loadCopy();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CARD_ZOOM_CATALOGUES).sort(), TOUCHLINE_APPROVED_LOCALES.map(({ code }) => code).sort());
  assert.equal(mod.TOUCHLINE_CARD_ZOOM_DRAFT_STATUS, "draft");
  assert.equal(mod.TOUCHLINE_CARD_ZOOM_DRAFT_LOCALES.length, 6);
  for (const [locale, copy] of Object.entries(mod.TOUCHLINE_CARD_ZOOM_CATALOGUES)) {
    assert.deepEqual(Object.keys(copy).sort(), [...chromeKeys, ...callerKeys].sort());
    for (const value of Object.values(copy)) assert.ok(typeof value === "string" && value.trim().length);
    assert.ok(copy.historyLink.includes("TouchLine")); assert.ok(copy.cardEngine.includes("Card Engine"));
    if (locale !== "en-GB" && locale !== "pt-BR") {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.deepEqual(chromeCopy(mod.getTouchlineCardZoomCopy(locale)), baseline["en-GB"]);
      assert.notEqual(copy.close, baseline["en-GB"].close);
      const html = fixture(mod.getTouchlineCardZoomCopy, false, "pt-BR").render({ locale, details: { ...details(), performanceTitle: "Desempenho" } });
      assert.match(html, /aria-label="Close card"/); assert.match(html, /View full performance/);
    }
  }
  for (const invalid of [undefined, null, "xx", "", "ar"]) assert.deepEqual(chromeCopy(mod.getTouchlineCardZoomCopy(invalid)), baseline["en-GB"]);
});

test("legacy no-locale title/document split and caller-provided labels remain authoritative", async () => {
  const { getTouchlineCardZoomCopy } = await loadCopy();
  for (const docLocale of ["en-GB", "pt-BR"]) {
    const view = fixture(getTouchlineCardZoomCopy, false, docLocale);
    const html = view.render({ details: { ...details(), performanceTitle: "Desempenho", performanceSubtitle: "Caller subtitle", profileLabel: "Caller profile", historyLabel: "Caller history", cardEngineLabel: "Caller editor" } });
    assert.ok(html.includes(docLocale === "pt-BR" ? 'aria-label="Fechar card"' : 'aria-label="Close card"'));
    assert.match(html, /Ver desempenho completo/);
    for (const text of ["Caller subtitle", "Caller profile", "Caller history", "Caller editor"]) assert.ok(html.includes(text));
    assert.deepEqual(view.socialLocales, ["pt-BR"]);
  }
});

test("catalogue integration does not introduce commercial actions or alter the legacy conditional label", async () => {
  const { getTouchlineCardZoomCopy } = await loadCopy();
  for (const locale of ["en-GB", "pt-BR"]) {
    assert.ok(!fixture(getTouchlineCardZoomCopy, false).render({ locale, details: details() }).includes('class="contractAction"'));
    const html = fixture(getTouchlineCardZoomCopy, false).render({ locale, contractHref: "/existing-authorized-target" });
    assert.match(html, /href="\/existing-authorized-target"/); assert.match(html, />Contratar</);
    const custom = fixture(getTouchlineCardZoomCopy, false).render({ locale, contractHref: "/existing-authorized-target", contractLabel: "Existing custom label" });
    assert.match(custom, />Existing custom label</);
  }
});
