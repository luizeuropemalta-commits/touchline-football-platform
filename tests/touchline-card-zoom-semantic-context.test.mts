import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineCardMatchFactLabels } from "../lib/touchlineArena/card-match-fact-i18n.ts";
import { buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields } from "../lib/touchlineArena/card-zoom-details.ts";
import { touchlinePlayerPositionKind } from "../lib/touchlineArena/position-aware-card-stats.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";

const zoomSource = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.tsx", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const profileTree = ts.createSourceFile("page.tsx", profileSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
type Details = ReturnType<typeof buildTouchlinePlayerCardZoomDetails>;

function compile(source: string, context: Record<string, unknown> = {}) {
  const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(js, { exports, ...context });
  return exports;
}

// Real panel JSX and builder; effects, icon artwork and unused portal/social
// imports are boundaries. No replacement of grouping or role selection.
function renderPanel(details: Details, full = false) {
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    react: { ...React, useState: () => [full, () => {}] },
    "react/jsx-runtime": jsxRuntime,
    "react-dom": { createPortal: (children: React.ReactNode) => children },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "./TouchlineCardZoom.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/lib/touchlineArena/root-locale": { resolveTouchLinePresentationLocale },
    "@/lib/touchlineArena/card-zoom-i18n": { getTouchlineCardZoomCopy },
    "@/components/touchline/a11y/TouchlineDialog": {},
    "@/components/touchline/market/TouchlineMarketMarks": {},
    "@/components/touchline/social/TouchlinePlayerSocialActions": {},
    "@/lib/touchlineArena/player-social-client": {},
  };
  const real = compile(zoomSource, { require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return renderToStaticMarkup(React.createElement(real.TouchlineCardZoomDetailsPanel, { details, locale: "en-GB" }));
}

const facts = Array.from({ length: 7 }, (_, index) => ({ label: `Fact ${index}`, value: index === 6 ? "—" : String(index), group: "performance" as const, kind: "stat" as const }));
const baseDetails = (): Details => ({ title: "Canonical player", subtitle: "Canonical club · Forward", fields: facts });
const compactCount = (html: string) => (html.match(/class="statTile"/g) ?? []).length;

test("explicit canonical position wins over absent or contradictory translated subtitles", () => {
  for (const [positionKind, expected] of [["goalkeeper", 5], ["outfield", 6], ["unknown", 6]] as const) {
    for (const subtitle of [undefined, "Goleiro", "Forward", "حارس مرمى", "Keeper Club · Forward"]) {
      const details = { ...baseDetails(), positionKind, subtitle };
      const before = JSON.stringify(details);
      const compact = renderPanel(details);
      assert.equal(compactCount(compact), expected, `${positionKind}/${subtitle}`);
      assert.match(compact, />0</);
      const full = renderPanel(details, true);
      for (let index = 0; index < 7; index++) assert.ok(full.includes(`Fact ${index}`));
      assert.equal(JSON.stringify(details), before);
    }
  }
});

test("metadata omission preserves legacy goalkeeper and history presentation", () => {
  for (const subtitle of ["Goalkeeper", "Goleiro", "guarda-redes", "Keeper"]) assert.equal(compactCount(renderPanel({ ...baseDetails(), subtitle })), 5);
  assert.equal(compactCount(renderPanel(baseDetails())), 6);
  for (const prefix of ["Match history", "Histórico da partida"]) {
    const details = { ...baseDetails(), fields: [{ label: `${prefix} · Legacy date`, value: "0", kind: "history" as const, group: "performance" as const }] };
    for (const full of [false, true]) assert.match(renderPanel(details, full), /<span>Legacy date<\/span>0/);
  }
});

test("history display metadata is literal in compact/full views, including empty and prefix-like values", () => {
  for (const historyDisplayLabel of ["Canonical date", "", "Match history · Keep this literal", "٣ أكتوبر ٢٠٢٦"]) {
    const details = { ...baseDetails(), fields: [{ label: "Historique des matchs · Not the display date", historyDisplayLabel, value: "—", kind: "history" as const, group: "performance" as const }] };
    for (const full of [false, true]) {
      const html = renderPanel(details, full);
      assert.ok(html.includes(`<span>${historyDisplayLabel}</span>—`));
      assert.ok(!html.includes("Not the display date"));
    }
  }
});

test("shared builder transports explicit role/history and preserves omitted role metadata", () => {
  for (const position of ["GK", "Forward", undefined]) {
    const details = buildTouchlinePlayerCardZoomDetails({ locale: "pt-BR", name: "Player", position, extraFields: [{ label: "History label", value: "0", kind: "history", historyDisplayLabel: "Canonical fixture date" }] });
    assert.equal(details.positionKind, undefined);
    assert.equal(details.fields.at(-1)?.historyDisplayLabel, "Canonical fixture date");
    assert.equal(details.fields.at(-1)?.value, "0");
  }
  const details = buildTouchlinePlayerCardZoomDetails({ locale: "en-GB", name: "Player", position: "Position text must stay", positionKind: "goalkeeper", profileHref: "/profile?lang=en-GB", extraFields: [{ label: "History", value: "—", kind: "history", historyDisplayLabel: "" }] });
  assert.equal(details.positionKind, "goalkeeper");
  assert.equal(details.subtitle, "Position text must stay");
  assert.equal(details.fields[0]?.value, "Position text must stay");
  assert.equal(details.fields.at(-1)?.historyDisplayLabel, "");
  assert.equal(details.profileHref, "/profile?lang=en-GB");
});

test("builder to panel retains legacy guarda-redes limit unless unknown is explicitly supplied", () => {
  const input = { locale: "pt-BR", name: "Canonical keeper", position: "guarda-redes", extraFields: facts };
  const legacy = buildTouchlinePlayerCardZoomDetails(input);
  assert.equal(legacy.subtitle, "guarda-redes");
  assert.equal(compactCount(renderPanel(legacy)), 5, "omitted metadata must retain legacy keeper composition");
  const explicitUnknown = buildTouchlinePlayerCardZoomDetails({ ...input, positionKind: "unknown" });
  assert.equal(explicitUnknown.positionKind, "unknown");
  assert.equal(compactCount(renderPanel(explicitUnknown)), 6, "explicit unknown must not infer role from display text");
  assert.deepEqual(explicitUnknown.fields, legacy.fields);
});

function initializer(name: string) {
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) { if (ts.isVariableDeclaration(node) && node.name.getText(profileTree) === name) expression = node.initializer; ts.forEachChild(node, visit); }
  visit(profileTree); assert.ok(expression, name); return expression.getText(profileTree);
}

test("actual profile history mapping and card JSX pass canonical role while preserving visible position and values", () => {
  for (const locale of ["en-GB", "pt-BR"]) {
    let captured: Details | undefined;
    const context = {
      draftLocalesEnabled: false,
      zoomCopy: getTouchlineCardZoomCopy(locale), matchFactLabels: getTouchlineCardMatchFactLabels(locale),
      locale, isPortuguese: locale === "pt-BR", text: { unavailable: "Unavailable", minutes: "Minutes", totalRating: "Total rating" },
      playerStatistics: { matchHistory: [{ fixtureStartsAt: "2026-10-03T12:00:00Z", appearanceStatus: "started", minutes: 0, rating: 0 }] },
      touchlinePlayerAppearanceLabel: () => "Started", formatOfficialSyncTime: (value: string) => `DATE:${value}`,
      touchlinePlayerPositionKind, buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields,
      editorialCard: { tierKey: "radiant-gold", marketValueEur: 9000, marketValueState: "verified" },
      cardFactPosition: "GK", displayPosition: "Position text must stay", displayNationality: "Canonical country",
      card: { name: "Canonical player", clubName: "Canonical club", position: "Forward" },
      exactPlayer: { matchRating: 0, totalRating: 0, position: "GK", matchStats: { saves: 0 } },
      hasActiveContractOffer: false, marketHref: "/clubowner", tierPalette: { accent: "#123456" }, tierDisplayName: "Elite",
      profileHref: "/profile?lang=en-GB", currentUser: null, cumulativeRatingText: "0", previewTier: false,
      TOUCHLINE_CARD_STUDIO_LAYOUT_KEY: "canonical", TouchlineEliteExactCard: () => null,
      TouchlineCardZoom: ({ details }: { details: Details }) => { captured = details; return null; },
      require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
    };
    const real = compile(`const zoomMatchHistoryFields = ${initializer("zoomMatchHistoryFields")}; export const ProfileCard = () => (${initializer("socialCardVisual")})("Open card");`, context);
    renderToStaticMarkup(React.createElement(real.ProfileCard));
    assert.ok(captured);
    assert.equal(captured.positionKind, "goalkeeper");
    assert.equal(captured.subtitle, "Canonical club · Position text must stay");
    assert.equal(captured.profileHref, context.profileHref);
    const history = captured.fields.find((field) => field.kind === "history");
    assert.equal(history?.historyDisplayLabel, "DATE:2026-10-03T12:00:00Z");
    assert.equal(history?.value, `Started · 0 minutes · ${locale === "pt-BR" ? "Nota" : "Rating"} 0`);
    assert.match(renderPanel(captured), /<span>DATE:2026-10-03T12:00:00Z<\/span>/);
  }
});
