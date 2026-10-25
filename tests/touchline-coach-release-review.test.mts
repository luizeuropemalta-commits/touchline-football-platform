import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import * as rules from "../lib/touchlineFantasy/club-market-rules.ts";
import * as copy from "../lib/touchlineFantasy/coach-release-review-i18n.ts";
import * as locales from "../lib/touchlineArena/catalogue-locale.ts";

type Props = { state: acquisition.ClubAcquisitionState; coachName: string; locale: string; onClose: () => void };
const source = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerCoachReleaseDialog.tsx", import.meta.url), "utf8");
function fixture() {
  let frozen: unknown;
  const modules: Record<string, unknown> = {
    react: { ...React, useRef: () => ({ current: null }), useState: (initialize: () => unknown) => {
      frozen ??= initialize(); return [frozen];
    } },
    "react/jsx-runtime": jsx,
    "react-dom": { createPortal: (node: React.ReactNode) => node },
    "@/components/touchline/a11y/TouchlineDialog": {
      useTouchlineDialog: ({ label }: { label: string }) => ({ dialogProps: { role: "dialog", "aria-label": label } }),
      useTouchlineDialogScrollLock: () => undefined,
    },
    "@/lib/touchlineFantasy/club-acquisition": acquisition,
    "@/lib/touchlineFantasy/club-market-rules": rules,
    "@/lib/touchlineFantasy/coach-release-review-i18n": copy,
    "@/lib/touchlineArena/catalogue-locale": locales,
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, document: { body: {} }, require: (name: string) => {
    if (name.endsWith(".module.css")) return { default: {} };
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  }, fetch: () => assert.fail("A review must never send a request") });
  const Dialog = exports.ClubOwnerCoachReleaseDialog as (props: Props) => React.ReactElement<Props> | null;
  return (props: Props) => {
    const wrapper = Dialog(props);
    if (!wrapper) return { html: "", tree: null };
    const tree = (wrapper.type as (props: Props) => React.ReactNode)(wrapper.props);
    return { html: renderToStaticMarkup(tree), tree };
  };
}
const state = (): acquisition.ClubAcquisitionState => ({
  revision: 3, seasonId: "2026", plan: "standard", balanceEur: 100_000_000,
  coach: { id: "owned-coach", tier: "sapphire-blue", valueEur: 10_000_000 },
  players: [], receipts: [], formationCode: "4-3-3",
});
const props = (snapshot = state(), locale = "en-GB"): Props => ({
  state: snapshot, coachName: "Owned coach", locale, onClose: () => undefined,
});

test("review uses original coach contract and ordinary fee for every paid plan without changing state", () => {
  for (const plan of ["standard", "master", "vip"] as const) {
    const snapshot = { ...state(), plan };
    const before = structuredClone(snapshot);
    const { html } = fixture()(props(snapshot));
    for (const value of ["10,000,000 TC", "1,000,000 TC", "9,000,000 TC", "100,000,000 TC", "109,000,000 TC"])
      assert.ok(html.includes(value), value);
    assert.ok(html.includes("10%"));
    assert.ok(html.includes("90%"));
    assert.match(html, /<button[^>]*disabled=""[^>]*>Confirm release<\/button>/);
    assert.deepEqual(snapshot, before);
  }
});

test("review supplies every locale, with an explicit unavailable status and Arabic direction", () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const labels = copy.getCoachReleaseReviewCopy(locale);
    const { html } = fixture()(props(state(), locale));
    for (const value of Object.values(labels)) assert.ok(value.trim());
    assert.ok(html.includes(labels.releaseLabel), locale);
    assert.ok(html.includes(labels.unavailable), locale);
    assert.ok(html.includes(labels.projectionNote), locale);
    assert.ok(html.includes(`dir="${locale === "ar-SA" ? "rtl" : "ltr"}"`));
    assert.match(html, /<button[^>]*disabled=""/);
  }
  assert.deepEqual(copy.getCoachReleaseReviewCopy("invalid"), copy.getCoachReleaseReviewCopy("en-GB"));
});

test("missing, malformed and Beta contracts never mount a financial review", () => {
  const invalid = [
    { ...state(), coach: null },
    { ...state(), coach: undefined },
    { ...state(), coach: { ...state().coach!, valueEur: 1 } },
    { ...state(), balanceEur: -1 },
    { ...state(), plan: "beta", coach: { id: "coach", tier: "ruby-red", valueEur: 5_000_000 } },
  ];
  for (const snapshot of invalid) assert.equal(fixture()(props(snapshot as acquisition.ClubAcquisitionState)).html, "");
  assert.equal(fixture()({ ...props(), coachName: " " }).html, "");
});

test("changed revision, coach, season or balance hides the frozen quote", () => {
  for (const next of [
    { ...state(), revision: 4 },
    { ...state(), seasonId: "2027" },
    { ...state(), balanceEur: 99_000_000 },
    { ...state(), coach: { ...state().coach!, id: "another-coach" } },
  ]) {
    const render = fixture(); render(props());
    const { html } = render(props(next));
    assert.ok(html.includes(copy.getCoachReleaseReviewCopy("en-GB").changed));
    assert.ok(!html.includes("109,000,000 TC"));
    assert.ok(!html.includes("Original signing value"));
  }
});

test("overflow never produces an unsafe projected balance", () => {
  const { html } = fixture()(props({ ...state(), balanceEur: Number.MAX_SAFE_INTEGER }));
  assert.match(html, /Balance after release · projection<\/dt><dd>—<\/dd>/);
});
