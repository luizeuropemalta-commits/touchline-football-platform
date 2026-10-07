import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as detailsModule from "../lib/touchlineArena/card-zoom-details.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as positions from "../lib/touchlineArena/position-aware-card-stats.ts";
import * as positionLabels from "../lib/touchlineArena/position-labels.ts";
import * as rules from "../lib/touchlineArena/card-rules.ts";
import * as editorial from "../lib/touchlineArena/editorial-card-profile.ts";
import * as review from "../lib/touchlineArena/card-review-state.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { getTouchlinePlayerZoomIdentityCopy } from "../lib/touchlineArena/player-zoom-identity-i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";

const expected = {
  "en-GB": { goals: "Goals", assists: "Assists", defense: "DEF score", cleanSheets: "Clean sheets", cards: "Cards", yellowCards: "Yellow cards", redCards: "Red cards", saves: "Saves", goalsConceded: "Goals conceded", minutes: "Minutes", appearances: "Appearances", shotsOnTarget: "Shots on target", shotsOffTarget: "Shots off target", defensiveActionsTotal: "Defensive actions (DAT)", penaltySaves: "Penalty saves", penaltiesMissed: "Penalties missed", ownGoals: "Own goals", rating: "Rating" },
  "pt-BR": { goals: "Gols", assists: "Assistências", defense: "Pontuação DEF", cleanSheets: "Jogos sem sofrer gols", cards: "Cartões", yellowCards: "Cartões amarelos", redCards: "Cartões vermelhos", saves: "Defesas", goalsConceded: "Gols sofridos", minutes: "Minutos", appearances: "Aparições", shotsOnTarget: "Chutes no gol", shotsOffTarget: "Chutes para fora", defensiveActionsTotal: "Ações defensivas (DAT)", penaltySaves: "Pênaltis defendidos", penaltiesMissed: "Pênaltis perdidos", ownGoals: "Gols contra", rating: "Nota" },
};
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const statistics = { goals: 0, assists: 1, defense: 2, cleanSheets: 0, yellowCards: null, redCards: 0, shotsOnTarget: 4, shotsOffTarget: 5, penaltiesMissed: 0, ownGoals: 0, rating: null, saves: 7, penaltySaves: 0, goalsConceded: 1, cards: 8, minutes: 90, appearances: 2, defensiveActionsTotal: 9 };
const cases = {
  Forward: { ids: ["goals", "assists", "defense", "cleanSheets", "yellowCards", "redCards", "shotsOnTarget", "shotsOffTarget", "penaltiesMissed", "ownGoals", "rating"], icons: ["goal", "assist", "defense", "clean-sheet", "yellow-card", "red-card", "shots-on-target", "shots-off-target", "penalty-missed", "own-goal", "rating"], values: ["0", "1", "2", "0", "—", "0", "4", "5", "0", "0", "—"] },
  GK: { ids: ["goals", "assists", "cleanSheets", "saves", "penaltySaves", "goalsConceded", "yellowCards", "redCards", "ownGoals", "rating"], icons: ["goal", "assist", "clean-sheet", "saves", "saves", "goals-conceded", "yellow-card", "red-card", "own-goal", "rating"], values: ["0", "1", "0", "7", "0", "1", "—", "0", "0", "—"] },
  Unknown: { ids: ["goals", "assists", "cleanSheets", "yellowCards", "redCards", "ownGoals", "rating"], icons: ["goal", "assist", "clean-sheet", "yellow-card", "red-card", "own-goal", "rating"], values: ["0", "1", "0", "—", "0", "0", "—"] },
};

function loadModule(file: string, modules: Record<string, unknown>) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  return exports;
}

function builderWith(getTouchlineCardMatchFactLabels: (locale: string) => Record<string, string>) {
  return loadModule("../lib/touchlineArena/card-zoom-details.ts", {
    "./position-labels.ts": positionLabels, "./card-rules.ts": rules, "./editorial-card-profile.ts": editorial,
    "./card-review-state.ts": review, "./position-aware-card-stats.ts": positions,
    "./card-match-fact-i18n.ts": { getTouchlineCardMatchFactLabels },
    "./player-zoom-identity-i18n.ts": { getTouchlinePlayerZoomIdentityCopy },
  }).buildTouchlineVerifiedMatchFactFields as typeof detailsModule.buildTouchlineVerifiedMatchFactFields;
}

function renderPanel(facts: ReturnType<typeof detailsModule.buildTouchlineVerifiedMatchFactFields>, locale: string) {
  const panel = loadModule("../components/touchline/cards/TouchlineCardZoom.tsx", {
    react: { ...React, useState: () => [true, () => {}] }, "react/jsx-runtime": jsxRuntime,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: (_, name) => (props: Record<string, unknown>) => React.createElement("svg", { ...props, "data-icon": String(name) }) }),
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale },
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
    "@/components/touchline/a11y/TouchlineDialog": {}, "@/components/touchline/market/TouchlineMarketMarks": {},
    "@/components/touchline/social/TouchlinePlayerSocialActions": {}, "@/lib/touchlineArena/player-social-client": {},
  }).TouchlineCardZoomDetailsPanel as React.ComponentType<Record<string, unknown>>;
  const details = detailsModule.buildTouchlinePlayerCardZoomDetails({ locale, name: "Canonical player", extraFields: facts });
  return renderToStaticMarkup(React.createElement(panel, { details, locale }));
}

test("eighteen labels retain exact EN/PT and eight complete drafts with DEF/DAT protected", async () => {
  const catalogue = await import("../lib/touchlineArena/card-match-fact-i18n.ts");
  const all = catalogue.TOUCHLINE_CARD_MATCH_FACT_CATALOGUES;
  assert.deepEqual(Object.keys(all), locales);
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(all[locale], expected[locale]);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(all[locale]).sort(), Object.keys(expected["en-GB"]).sort());
    assert.equal(Object.values(all[locale]).length, 18);
    assert.ok(Object.values(all[locale]).every((label) => label.trim().length > 0));
    assert.match(all[locale].defense, /\bDEF\b/); assert.match(all[locale].defensiveActionsTotal, /\bDAT\b/);
  }
  assert.deepEqual(catalogue.TOUCHLINE_CARD_MATCH_FACT_DRAFT_LOCALES, locales.slice(2));
  assert.equal(catalogue.TOUCHLINE_CARD_MATCH_FACT_DRAFT_STATUS, "draft");
  for (const locale of [...locales.slice(2), "bad", "pt", "", null, undefined]) assert.equal(catalogue.getTouchlineCardMatchFactLabels(locale), all["en-GB"]);
  assert.equal(catalogue.getTouchlineCardMatchFactLabels("pt-BR"), all["pt-BR"]);
});

test("real consumer preserves allowlisted fourteen-stat union, order, icon, kind, zero and null", () => {
  const before = JSON.stringify(statistics);
  const union = new Set<string>();
  for (const locale of locales) for (const [position, wanted] of Object.entries(cases)) {
    const facts = detailsModule.buildTouchlineVerifiedMatchFactFields({ position, statistics }, locale);
    const baseline = expected[locale === "pt-BR" ? "pt-BR" : "en-GB"];
    assert.deepEqual(facts.map(({ label }) => label), wanted.ids.map((id) => baseline[id as keyof typeof baseline]));
    assert.deepEqual(facts.map(({ icon }) => icon), wanted.icons);
    assert.deepEqual(facts.map(({ value }) => value), wanted.values);
    assert.ok(facts.every(({ kind }) => kind === "stat"));
    wanted.ids.forEach((id) => union.add(id));
  }
  assert.equal(union.size, 14);
  for (const auxiliary of ["cards", "minutes", "appearances", "defensiveActionsTotal"]) assert.ok(!union.has(auxiliary));
  assert.equal(JSON.stringify(statistics), before);
  for (const empty of [null, undefined, {}]) assert.deepEqual(detailsModule.buildTouchlineVerifiedMatchFactFields({ position: "GK", statistics: empty }, "pt-BR"), []);
});

test("consumer forwards full locale to getter and renders translated facts without label-driven semantics", () => {
  const seen: string[] = [];
  const labels = Object.fromEntries(Object.keys(expected["en-GB"]).map((key) => [key, `Nota total preço gols ${key} بطاقات`]));
  const build = builderWith((locale) => { seen.push(locale); return labels; });
  for (const locale of locales) {
    const fields = build({ position: "GK", statistics }, locale);
    assert.deepEqual(Array.from(fields, ({ label }) => label), cases.GK.ids.map((id) => labels[id]));
    const html = renderPanel(fields, locale);
    for (const id of cases.GK.ids) assert.ok(html.includes(labels[id]), id);
    assert.doesNotMatch(html, /class="ratingHero"/);
    assert.match(html, /data-icon="ShieldCheck"/);
    assert.match(html, /data-icon="Hand"/);
    assert.match(html, /<strong>0<\/strong>/);
    assert.match(html, /<strong>—<\/strong>/);
  }
  assert.deepEqual(seen, locales);
});

test("all eight real catalogues can reach rendered consumer at getter seam without opening runtime gates", async () => {
  const { TOUCHLINE_CARD_MATCH_FACT_CATALOGUES: all } = await import("../lib/touchlineArena/card-match-fact-i18n.ts");
  const build = builderWith((locale) => all[locale as keyof typeof all]);
  for (const locale of locales) {
    const facts = build({ position: "Forward", statistics }, locale);
    const html = renderPanel(facts, locale);
    for (const field of facts) assert.ok(html.includes(field.label), `${locale}/${field.label}`);
    assert.doesNotMatch(html, /class="ratingHero"/);
  }
});
