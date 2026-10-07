import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as navigation from "../lib/touchlineArena/global-navigation.ts";
import * as copy from "../lib/touchlineArena/navigation-i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";

const require = createRequire(import.meta.url);
const drafts = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

test("navigation copy opt-in selects authored languages without releasing public defaults", () => {
  for (const locale of drafts) {
    assert.equal(copy.getTouchlineNavigationCopy(locale, true), copy.TOUCHLINE_NAVIGATION_CATALOGUES[locale]);
    assert.equal(copy.getTouchlineNavigationCopy(locale), copy.TOUCHLINE_NAVIGATION_CATALOGUES["en-GB"]);
  }
  for (const locale of ["en-GB", "pt-BR"]) {
    assert.equal(copy.getTouchlineNavigationCopy(locale, true), copy.getTouchlineNavigationCopy(locale));
  }
  for (const locale of [null, undefined, "", "unknown", "constructor", "__proto__"]) {
    assert.equal(copy.getTouchlineNavigationCopy(locale, true), copy.TOUCHLINE_NAVIGATION_CATALOGUES["en-GB"]);
  }
});

function renderNavigation(locale: string, draftLocalesEnabled?: boolean) {
  const audio: Array<{ locale: string; allowDraftLocale?: boolean }> = [];
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/global-navigation": navigation,
    "@/lib/touchlineArena/navigation-i18n": copy,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/root-locale": rootLocale,
    "next/link": { default: ({ children, ...props }: { children: ReactNode }) => createElement("a", props, children) },
    "./TouchlineNavigationLabel": { default: ({ label, pendingLabel }: { label: string; pendingLabel: string }) => createElement("span", { "data-pending-label": pendingLabel }, label) },
    "@/components/auth-ambient-audio": { AuthAmbientAudio: (props: { locale: string; allowDraftLocale?: boolean }) => { audio.push(props); return null; } },
  };
  const exports: { default?: (props: Record<string, unknown>) => ReactNode } = {};
  const source = readFileSync(new URL("../components/touchline/TouchlineGlobalNavigation.tsx", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name in modules) return modules[name];
    if (name === "react/jsx-runtime") return require(name);
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name.endsWith(".css")) return { default: {} };
    throw Error(`Unexpected navigation dependency: ${name}`);
  } });
  assert.ok(exports.default);
  const html = renderToStaticMarkup(exports.default({ locale, draftLocalesEnabled, currentRoute: "market", surface: "authenticated", trustedContext: { club: { teamId: "official-id", slug: "official-club", name: "Official $& Club" } } }));
  return { html, audio, hrefs: Array.from(html.matchAll(/href="([^"]+)"/g), match => match[1]) };
}

test("actual navigation coordinates opted copy, audio and links while default URLs stay gated", () => {
  for (const locale of drafts) {
    const fallback = renderNavigation(locale);
    const opted = renderNavigation(locale, true);
    const dictionary = copy.TOUCHLINE_NAVIGATION_CATALOGUES[locale];
    assert.deepEqual(renderNavigation(locale, false).hrefs, fallback.hrefs);
    assert.ok(fallback.hrefs.every(href => href.includes("lang=en-GB")));
    assert.deepEqual(opted.hrefs, fallback.hrefs.map(href => href.replace("lang=en-GB", `lang=${locale}`)));
    for (const text of [dictionary.ariaLabel, dictionary.allClubs, dictionary.more, dictionary.opening]) {
      assert.ok(opted.html.includes(text), `${locale}: ${text}`);
    }
    assert.ok(opted.html.includes("Official $&amp; Club"));
    assert.equal(opted.audio[0].locale, locale);
    assert.equal(opted.audio[0].allowDraftLocale, true);
    assert.equal(fallback.audio[0].locale, "en-GB");
    assert.equal(fallback.audio[0].allowDraftLocale, false);
  }
  for (const locale of ["en-GB", "pt-BR"]) {
    assert.equal(renderNavigation(locale, true).html, renderNavigation(locale).html);
  }
});
