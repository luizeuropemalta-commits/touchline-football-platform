import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import { buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields } from "../lib/touchlineArena/card-zoom-details.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";

const source = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8");
type Details = ReturnType<typeof buildTouchlinePlayerCardZoomDetails>;
const expectedIcons = {
  goal: "Goal", assist: "Footprints", defense: "Shield", "clean-sheet": "ShieldCheck", cards: "Award", "yellow-card": "Award", "red-card": "Award",
  saves: "Hand", "goals-conceded": "Goal", "shots-on-target": "Target", "shots-off-target": "Target", "penalty-missed": "Activity", "own-goal": "Goal",
  rating: "Star", minutes: "Clock3", appearances: "Trophy",
};

// Real panel and builder. Icons are named SVG markers at the artwork boundary
// so tests inspect the selected icon, not a duplicate selection algorithm.
function renderPanel(details: Details, locale = "en-GB", full = false) {
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    react: { ...React, useState: () => [full, () => {}] }, "react/jsx-runtime": jsxRuntime,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: (_, name) => (props: Record<string, unknown>) => React.createElement("svg", { ...props, "data-icon": String(name) }) }),
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale },
    "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
    "@/components/touchline/a11y/TouchlineDialog": {}, "@/components/touchline/market/TouchlineMarketMarks": {},
    "@/components/touchline/social/TouchlinePlayerSocialActions": {}, "@/lib/touchlineArena/player-social-client": {},
  };
  const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(js, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return renderToStaticMarkup(React.createElement(exports.TouchlineCardZoomDetailsPanel, { details, locale }));
}

test("explicit fact icon tokens win over translated and deliberately contradictory labels", () => {
  for (const [icon, expected] of Object.entries(expectedIcons)) {
    for (const label of ["Untranslated canonical label", "Preço Nota total Gols", "بطاقات", "Total rating club"]) {
      const details: Details = { title: "Canonical player", fields: [{ label, value: "0", group: "performance", kind: "stat", icon }] };
      const html = renderPanel(details);
      assert.match(html, new RegExp(`data-icon="${expected}"`), `${icon}/${label}`);
      assert.equal((html.match(/data-icon=/g) ?? []).length, 1);
      assert.ok(!html.includes('class="ratingHero"'));
      assert.match(html, />0</);
    }
  }
});

test("real verified facts carry stat kind and stable icons without changing canonical order, selection or zero/null", () => {
  const statistics = { goals: 0, assists: 1, defense: 2, cleanSheets: 0, yellowCards: null, redCards: 0, shotsOnTarget: 4, shotsOffTarget: 5, penaltiesMissed: 0, ownGoals: 0, rating: null, saves: 7, penaltySaves: 0, goalsConceded: 1, cards: 8, minutes: 90, appearances: 2, defensiveActionsTotal: 9 };
  const expected = {
    Forward: { icons: ["goal", "assist", "defense", "clean-sheet", "yellow-card", "red-card", "shots-on-target", "shots-off-target", "penalty-missed", "own-goal", "rating"], values: ["0", "1", "2", "0", "—", "0", "4", "5", "0", "0", "—"] },
    GK: { icons: ["goal", "assist", "clean-sheet", "saves", "saves", "goals-conceded", "yellow-card", "red-card", "own-goal", "rating"], values: ["0", "1", "0", "7", "0", "1", "—", "0", "0", "—"] },
    Unknown: { icons: ["goal", "assist", "clean-sheet", "yellow-card", "red-card", "own-goal", "rating"], values: ["0", "1", "0", "—", "0", "0", "—"] },
  };
  const before = JSON.stringify(statistics);
  for (const locale of ["en-GB", "pt-BR"]) for (const [position, wanted] of Object.entries(expected)) {
    const facts = buildTouchlineVerifiedMatchFactFields({ position, statistics }, locale);
    assert.deepEqual(facts.map(({ icon }) => icon), wanted.icons);
    assert.deepEqual(facts.map(({ value }) => value), wanted.values);
    assert.ok(facts.every(({ kind }) => kind === "stat"));
    const details = buildTouchlinePlayerCardZoomDetails({ locale, name: "Canonical player", position, extraFields: facts });
    const html = renderPanel(details, locale, true);
    assert.ok(!html.includes('class="ratingHero"'), "selected-match rating is a fact, never season total");
    for (const fact of facts) assert.ok(html.includes(fact.label));
  }
  assert.equal(JSON.stringify(statistics), before);
  assert.deepEqual(buildTouchlineVerifiedMatchFactFields({ position: "GK", statistics: {} }, "en-GB"), []);
  assert.deepEqual(buildTouchlineVerifiedMatchFactFields({ position: "GK", statistics: null }, "en-GB"), []);
});

test("Portuguese clean-sheet fact intentionally renders ShieldCheck, just like English", () => {
  for (const locale of ["pt-BR", "en-GB"]) {
    const fields = buildTouchlineVerifiedMatchFactFields({ position: "Forward", statistics: { cleanSheets: 0 } }, locale);
    const details = buildTouchlinePlayerCardZoomDetails({ locale, name: "Canonical player", extraFields: fields });
    const html = renderPanel(details, locale);
    assert.match(html, /data-icon="ShieldCheck"/);
    assert.doesNotMatch(html, /data-icon="Goal"/);
    assert.ok(html.includes(locale === "pt-BR" ? "Jogos sem sofrer gols" : "Clean sheets"));
  }
});

test("absent/unknown icon and kind retain the exact legacy label fallbacks", () => {
  const cases = [
    { icon: undefined, label: "Jogos sem sofrer gols", expected: "Goal" },
    { icon: "unknown-token", label: "Jogos sem sofrer gols", expected: "Goal" },
    { icon: "rank", label: "Posição na competição", expected: "UserRound" },
    { icon: "rank", label: "Competition rank", expected: "Activity" },
    { icon: "status", label: "Status do card", expected: "Award" },
    { icon: "home", label: "Casa", expected: "Activity" },
    { icon: "away", label: "Away", expected: "Activity" },
    { icon: "verified", label: "Verified identity", expected: "Activity" },
    { icon: "constructor", label: "Goals", expected: "Goal" },
    { icon: "toString", label: "Defesas", expected: "Hand" },
  ];
  for (const { icon, label, expected } of cases) {
    const html = renderPanel({ title: "Legacy", fields: [{ label, value: "0", group: "performance", icon }] });
    assert.match(html, new RegExp(`data-icon="${expected}"`));
  }
  const legacy = buildTouchlinePlayerCardZoomDetails({ locale: "en-GB", name: "Legacy", extraFields: [{ label: "Total rating", value: "0" }, { label: "Last match rating", value: "—" }, { label: "Match history · Canonical date", value: "7" }] });
  const html = renderPanel(legacy);
  assert.match(html, /class="ratingHero"/); assert.match(html, /<strong>0<\/strong>/);
  assert.match(html, /<span>Canonical date<\/span>7/);
});
