import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as locales from "../lib/touchlineArena/i18n.ts";
import * as browserStorage from "../lib/touchlineArena/browser-storage.ts";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";

const require = createRequire(import.meta.url);
type Component = (props: Record<string, unknown>) => React.ReactNode;

function load(relative: string, modules: Record<string, unknown>): Record<string, Component> {
  const exports: Record<string, Component> = {};
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name in modules) return modules[name];
    if (name === "react/jsx-runtime") return require(name);
    if (name.endsWith(".css")) return { default: { controls: "controls" } };
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    throw Error(`Unexpected controls dependency: ${name}`);
  } });
  return exports;
}

function fixture() {
  const audio: Record<string, unknown>[] = [];
  const language: Record<string, unknown>[] = [];
  const accountMenu: Record<string, unknown>[] = [];
  const actualLanguage = load("../components/auth-language-switcher.tsx", {
    "@/lib/touchlineArena/i18n": locales,
    "@/lib/touchlineArena/browser-storage": browserStorage,
    "@/lib/touchlineArena/presentation-locale-intent": { rememberTouchlinePresentationLocaleIntent: () => false },
    "@/components/touchline/AccountLocaleMenu": { default: (props: Record<string, unknown>) => {
      accountMenu.push(props);
      return React.createElement("span", { "data-account-menu": true });
    } },
  }).AuthLanguageSwitcher;
  const controls = load("../components/touchline/TouchlinePageControls.tsx", {
    "next/navigation": { usePathname: () => "/live" },
    "./SiteLocaleReleaseContext": { useSiteLocaleRelease: () => false },
    "@/lib/touchlineArena/auth-i18n": authCopy,
    // Audio is a provider-owned boundary; this test does not create another player.
    "@/components/auth-ambient-audio": { AuthAmbientAudio: (props: Record<string, unknown>) => {
      audio.push(props);
      return React.createElement("button", { "data-audio-control": true }, "Sound");
    } },
    "@/components/auth-language-switcher": { AuthLanguageSwitcher: (props: Record<string, unknown>) => {
      language.push(props);
      return React.createElement(actualLanguage, props);
    } },
  }).default;
  return { audio, language, accountMenu, render: (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(controls, props)) };
}

test("shared controls default to existing gated language and one provider-owned audio control", () => {
  for (const locale of ["en-GB", "pt-BR", "ar-SA"]) {
    const view = fixture();
    const context = { mode: "account", accountId: "canonical-account-id" };
    const html = view.render({ locale, accountLocaleContext: context });
    assert.match(html, /^<div class="controls" dir="ltr">/);
    assert.equal(view.audio.length, 1);
    assert.equal(view.language.length, 1);
    assert.equal(view.audio[0].locale, locale);
    assert.equal(view.audio[0].allowDraftLocale, false);
    assert.equal(view.language[0].draftLocalesEnabled, false);
    assert.equal(view.language[0].context, context);
    assert.equal(view.accountMenu.length, 1);
    assert.equal(view.accountMenu[0].context, context);
    assert.equal(view.accountMenu[0].variant, "select");
    assert.ok(html.indexOf("data-audio-control") < html.indexOf("data-account-menu"));
    assert.doesNotMatch(html, /<audio|<video|<header|<select/);
  }
});

test("explicit draft opt-in composes the actual eight-language switcher without mirrored order", () => {
  for (const { code } of locales.TOUCHLINE_APPROVED_LOCALES) {
    const view = fixture();
    const html = view.render({ locale: code, accountLocaleContext: { mode: "unavailable" }, draftLocalesEnabled: true });
    assert.match(html, /^<div class="controls" dir="ltr">/);
    assert.equal(view.audio.length, 1);
    assert.equal(view.language.length, 1);
    assert.equal(view.audio[0].allowDraftLocale, true);
    assert.equal(view.language[0].locale, code);
    assert.equal(view.language[0].draftLocalesEnabled, true);
    assert.equal(view.accountMenu.length, 0);
    assert.equal((html.match(/<select\b/g) ?? []).length, 1);
    assert.equal((html.match(/<option\b/g) ?? []).length, 8);
    assert.ok(html.includes(`value="${code}" selected=""`));
    assert.ok(html.indexOf("data-audio-control") < html.indexOf("<select"));
    assert.doesNotMatch(html, /<audio|<video|<header/);
  }
});
