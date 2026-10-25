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

function renderNavigation(locale: string, draftLocalesEnabled?: boolean, {
  currentRoute = "market", surface = "authenticated", moreLabel,
}: { currentRoute?: navigation.TouchlineGlobalNavigationRoute; surface?: navigation.TouchlineGlobalNavigationSurface; moreLabel?: string } = {}) {
  const audio: Array<{ locale: string; allowDraftLocale?: boolean }> = [];
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/global-navigation": navigation,
    "@/lib/touchlineArena/navigation-i18n": moreLabel === undefined ? copy : {
      ...copy,
      getTouchlineNavigationCopy: (locale?: string | null, enabled = false) => ({
        ...copy.getTouchlineNavigationCopy(locale, enabled), more: moreLabel,
      }),
    },
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
  const html = renderToStaticMarkup(exports.default({ locale, draftLocalesEnabled, currentRoute, surface, trustedContext: { club: { teamId: "official-id", slug: "official-club", name: "Official $& Club" } } }));
  return { html, audio, hrefs: Array.from(html.matchAll(/href="([^"]+)"/g), match => match[1]) };
}

test("primary ClubOwner link announces current page only for authenticated market in all eight locales", () => {
  const cases = [
    { surface: "authenticated", currentRoute: "market", current: true },
    { surface: "public", currentRoute: "market", current: false },
    { surface: "auth", currentRoute: "market", current: false },
    { surface: "authenticated", currentRoute: "live", current: false },
    { surface: "authenticated", currentRoute: "clubProfile", current: false },
    { surface: "authenticated", currentRoute: "rankings", current: false },
    { surface: "authenticated", currentRoute: "inbox", current: false },
  ] as const;
  for (const locale of ["en-GB", "pt-BR", ...drafts]) for (const scenario of cases) {
    const { html, hrefs } = renderNavigation(locale, true, scenario);
    const primary = html.match(/<a\b[^>]*>/)?.[0];
    assert.ok(primary, `${locale}/${scenario.surface}/${scenario.currentRoute}: primary link exists`);
    assert.equal(primary.includes('aria-current="page"'), scenario.current);
    if (!scenario.current) assert.doesNotMatch(primary, /aria-current=/);
    const destination = scenario.surface === "public" ? "account" : scenario.surface === "auth" ? "admin" : "clubowner";
    const language = scenario.surface === "auth" && locale !== "pt-BR" ? "en-GB" : locale;
    assert.equal(hrefs[0], `/${destination}?lang=${language}`, "current-state semantics never change destination or locale");
    assert.equal(hrefs.filter(href => href === hrefs[0]).length, 1, "primary destination stays unique");
    if (scenario.currentRoute === "market") {
      assert.equal((html.match(/aria-current="page"/g) ?? []).length, scenario.current ? 1 : 0);
    }
  }
});

test("actual navigation coordinates opted copy, audio and links while default URLs stay gated", () => {
  for (const locale of drafts) {
    const fallback = renderNavigation(locale);
    const opted = renderNavigation(locale, true);
    const dictionary = copy.TOUCHLINE_NAVIGATION_CATALOGUES[locale];
    assert.deepEqual(renderNavigation(locale, false).hrefs, fallback.hrefs);
    assert.ok(fallback.hrefs.every(href => href.includes("lang=en-GB")));
    assert.deepEqual(opted.hrefs, fallback.hrefs.map(href => href.replace("lang=en-GB", `lang=${locale}`)));
    // SUPERSEDED: the global row now names the generic ClubHub, not an
    // all-clubs/contextual-club badge (CURRENT_STATE navigation decision).
    for (const text of [dictionary.ariaLabel, dictionary.clubHub, dictionary.more, dictionary.opening]) {
      assert.ok(opted.html.includes(text), `${locale}: ${text}`);
    }
    assert.doesNotMatch(opted.html, /Official \$&(?:amp;)? Club|official-club|official-id/);
    assert.ok(opted.hrefs.includes(`/touchline-clubs?lang=${locale}`));
    assert.equal(opted.audio[0].locale, locale);
    assert.equal(opted.audio[0].allowDraftLocale, true);
    assert.equal(fallback.audio[0].locale, "en-GB");
    assert.equal(fallback.audio[0].allowDraftLocale, false);
  }
  for (const locale of ["en-GB", "pt-BR"]) {
    assert.equal(renderNavigation(locale, true).html, renderNavigation(locale).html);
  }
});

test("a retained navigation label escapes markup while preserving literal dollar-ampersand text", () => {
  // Synthetic copy exercises the real summary span, not a retired contextual
  // club badge. This does not modify a published catalogue or destination.
  const label = 'More $& <img src=x onerror="unsafe()">';
  const baseline = renderNavigation("pt-BR", true);
  const rendered = renderNavigation("pt-BR", true, { moreLabel: label });
  assert.ok(rendered.html.includes('<span>More $&amp; &lt;img src=x onerror=&quot;unsafe()&quot;&gt;</span>'));
  assert.doesNotMatch(rendered.html, /<img\b|<script\b/);
  assert.deepEqual(rendered.hrefs, baseline.hrefs);
  // Each render uses a separate VM realm. Compare all enumerable props in
  // host objects instead of treating distinct realm prototypes as a change.
  assert.deepEqual(rendered.audio.map(props => ({ ...props })), baseline.audio.map(props => ({ ...props })));
});
