import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getClubOwnerPlanShowcaseCopy } from "../lib/touchlineArena/club-owner-plan-showcase.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";

const source = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("header.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node));
assert.ok(declaration);
const css = new Proxy({}, { get: (_, key) => String(key) });
const icon = () => React.createElement("svg", { "aria-hidden": true });
let opened = false;
const Header = vm.runInNewContext(ts.transpileModule(
  `${declaration.getText(tree).replace(/^export default\s+/, "")}\nClubOwnerMarketHeader;`,
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText, {
  React, useState: () => [opened, (value: boolean) => { opened = value; }],
  styles: css, controls: css, planStyles: css,
  CalendarDays: icon, Camera: icon, ChevronRight: icon, TouchlineCoinMark: icon,
  Image: () => React.createElement("img", { alt: "" }),
  useConfirmedClubCollection: () => ({ verificationStatus: "confirmed" }),
  CLUB_ACQUISITION_BUDGETS: {},
  getTouchlineClubOwnerMarketCopy: () => ({ plan: "Plano", planActionUnavailable: "Indisponível" }),
  getClubOwnerPlanShowcaseCopy, resolveTouchlineCatalogueLocale,
  getClubOwnerProfileMetricsCopy: () => ({}), getClubCollectionBudgetCopy: () => ({}),
  ClubOwnerPlanCard: ({ tier }: { tier: string }) => React.createElement("div", { "data-card-tier": tier }),
  ClubOwnerPlanOnboarding: ({ open }: { open: boolean }) => React.createElement("div", { "data-explore-open": String(open) }),
});
const props = { owner: null, locale: "pt-BR", plan: { active: true, expiresAt: null }, activePlanKey: "vip", remainingMarketPower: 123 };

test("main action uses actual plural translations without changing benefit action", () => {
  for (const [locale, text] of Object.entries({
    "en-GB": "View plans", "pt-BR": "Ver planos", "es-ES": "Ver planes",
    "it-IT": "Vedi piani", "fr-FR": "Voir les offres", "ar-SA": "عرض الخطط",
    "tr-TR": "Planları gör", "de-DE": "Pläne ansehen",
  })) {
    const html = renderToStaticMarkup(React.createElement(Header, { ...props, locale, draftLocalesEnabled: true }));
    assert.ok(html.includes(`>${text}<`));
  }
  const gated = renderToStaticMarkup(React.createElement(Header, { ...props, locale: "de-DE" }));
  assert.ok(gated.includes(">View plans<"));
  assert.doesNotMatch(source, /\{labels\.viewPlan\}/);
});

test("account card follows actual entitlement and ignores development preview", () => {
  for (const tier of ["vip", "standard", "master", "beta", "pro"]) {
    const html = renderToStaticMarkup(React.createElement(Header, { ...props, activePlanKey: tier, planPreview: "standard" }));
    assert.ok(html.includes(`data-card-tier="${tier}"`));
    assert.ok(html.includes(`data-plan-preview="${tier}"`));
    assert.doesNotMatch(html, /planArrow|planBrowse|role="tab"/);
    assert.ok(html.indexOf("Ver planos") < html.indexOf("data-account-plan-card"));
  }
  assert.doesNotMatch(source, /visualTier|setVisualTier|onPreviewChange|initialPlan=/);
});

test("opening exploration cannot recolour account or mutate displayed balance", () => {
  opened = false;
  const element = Header(props);
  const bank = element.props.children[1];
  const heading = bank.props.children[0];
  heading.props.children[2].props.onClick();
  assert.equal(opened, true);
  const html = renderToStaticMarkup(React.createElement(Header, props));
  assert.match(html, /data-explore-open="true"/);
  assert.match(html, /data-card-tier="vip"/);
  assert.match(html, /<strong>123<\/strong>/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage/);
});

test("unconfirmed or inactive entitlement never invents a paid account card", () => {
  for (const override of [{ activePlanKey: null }, { plan: null }, { plan: { active: false } }]) {
    const html = renderToStaticMarkup(React.createElement(Header, { ...props, ...override }));
    assert.doesNotMatch(html, /data-account-plan-card|data-card-tier/);
    assert.match(html, /Indisponível/);
    assert.match(html, /Ver planos/);
  }
});
