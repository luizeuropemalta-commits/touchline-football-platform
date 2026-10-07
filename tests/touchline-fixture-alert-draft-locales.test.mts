import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as copy from "../lib/touchlineArena/fixture-alert-i18n.ts";

const require = createRequire(import.meta.url);
const locales = ["en-GB", "pt-BR", ...copy.TOUCHLINE_FIXTURE_ALERT_DRAFT_LOCALES] as const;
const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineFixtureAlerts.tsx", import.meta.url), "utf8");

test("fixture alert catalogues require explicit draft opt-in and retain EN/PT defaults", () => {
  for (const locale of locales) {
    assert.equal(copy.getTouchlineFixtureAlertCopy(locale, true), copy.TOUCHLINE_FIXTURE_ALERT_CATALOGUES[locale]);
    assert.equal(copy.getTouchlineFixtureAlertCopy(locale), copy.TOUCHLINE_FIXTURE_ALERT_CATALOGUES[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
    assert.equal(copy.getTouchlineFixtureAlertCopy(locale, false), copy.getTouchlineFixtureAlertCopy(locale));
  }
  for (const locale of [undefined, null, "", "unknown", "constructor", "__proto__"]) {
    assert.equal(copy.getTouchlineFixtureAlertCopy(locale, true), copy.TOUCHLINE_FIXTURE_ALERT_CATALOGUES["en-GB"]);
  }
});

type Phase = "loading" | "saving" | "signed-out" | "disabled" | "error" | "ready";
function renderFixture(locale: string, phase: Phase, subscribed: boolean | null, draftLocalesEnabled?: boolean) {
  // State fixture exercises the actual presentation branches, not subscription effects.
  const states: unknown[] = [true, 0, subscribed, phase];
  let index = 0;
  const forbidden = () => { throw Error("Presentation must not trigger requests or state mutations"); };
  const modules: Record<string, unknown> = {
    react: {
      useState: () => [states[index++], forbidden],
      useId: () => "fixture-alert-panel",
      useRef: (current: unknown) => ({ current }),
      useEffect: () => undefined,
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "lucide-react": { Bell: () => createElement("span", { "data-icon": "bell" }) },
    "@/lib/touchlineArena/fixture-alert-i18n": copy,
  };
  const exports: { default?: (props: Record<string, unknown>) => ReactNode } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, fetch: forbidden, require(name: string) {
    if (name in modules) return modules[name];
    if (name.endsWith(".css")) return { default: {} };
    throw Error(`Unexpected fixture dependency: ${name}`);
  } });
  assert.ok(exports.default);
  return renderToStaticMarkup(createElement(exports.default, {
    fixtureId: "fixture-test", label: "Official Match", locale, draftLocalesEnabled,
  }));
}

test("actual fixture presentation uses opted-in copy in every status without initiating delivery", () => {
  const escaped = (value: string) => renderToStaticMarkup(createElement("span", null, value)).slice(6, -7);
  const cases = [
    ["loading", null, "loading"], ["saving", true, "saving"],
    ["signed-out", null, "signedOut"], ["disabled", null, "disabled"],
    ["error", null, "error"], ["ready", true, "saved"], ["ready", false, "notSaved"],
  ] as const;
  for (const locale of locales) {
    for (const [phase, subscribed, key] of cases) {
      const dictionary = copy.TOUCHLINE_FIXTURE_ALERT_CATALOGUES[locale];
      const html = renderFixture(locale, phase, subscribed, true);
      assert.ok(html.includes(escaped(dictionary[key])), `${locale}/${phase}/${subscribed}`);
      assert.ok(html.includes(escaped(dictionary.deliveryUnavailable)), locale);
      assert.ok(html.includes(`aria-label="${escaped(dictionary.alerts)}: Official Match"`));
      assert.ok(html.includes("Official Match"));
      if (phase === "ready" || phase === "saving") {
        assert.ok(html.includes(escaped(subscribed ? dictionary.removeMatch : dictionary.saveMatch)));
        assert.equal(html.includes('disabled=""'), phase === "saving");
      }
      if (phase === "error") assert.ok(html.includes(escaped(dictionary.checkAgain)));
      if (phase === "signed-out") {
        assert.ok(html.includes(escaped(dictionary.signIn)));
        assert.ok(html.includes(`href="/login?lang=${encodeURIComponent(locale)}"`));
      }
      const defaultHtml = renderFixture(locale, phase, subscribed);
      assert.ok(defaultHtml.includes(escaped(copy.getTouchlineFixtureAlertCopy(locale)[key])));
      if (locale === "en-GB" || locale === "pt-BR") assert.equal(defaultHtml, html);
    }
  }
});
