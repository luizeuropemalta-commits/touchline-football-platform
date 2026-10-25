import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { normalizeTouchLineAuthReturnTo, normalizeTouchLineLoginLocale } from "../lib/touchlineArena/auth-i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(new URL("../components/touchline/TouchlineSiteFooter.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/touchline/TouchlineSiteFooter.module.css", import.meta.url), "utf8");
const exports: { default?: (props: unknown) => unknown } = {};
let runtimePath: string | null = null;
let runtimeQuery = new URLSearchParams();
let runtimeRelease = false;
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, {
  exports, URL,
  require: (id: string) => id.endsWith(".css")
    ? { default: new Proxy({}, { get: (_target, key) => key }) }
    : id.endsWith("catalogue-locale") ? { resolveTouchlineCatalogueLocale }
    : id.endsWith("auth-i18n") ? { normalizeTouchLineAuthReturnTo, normalizeTouchLineLoginLocale }
    : id.endsWith("root-locale") ? { resolveTouchLinePresentationLocale }
    : id.endsWith("SiteLocaleReleaseContext") ? { useSiteLocaleRelease: () => runtimeRelease }
    : id === "next/navigation" ? { usePathname: () => runtimePath, useSearchParams: () => runtimeQuery }
    : require(id),
});

function render(locale = "en-GB", instagramUrl?: string, draftLocalesEnabled = true) {
  return renderToStaticMarkup(React.createElement(exports.default, { locale, instagramUrl, draftLocalesEnabled }));
}

const translations = {
  "en-GB": "All rights reserved.", "pt-BR": "Todos os direitos reservados.",
  "es-ES": "Todos los derechos reservados.", "it-IT": "Tutti i diritti riservati.",
  "fr-FR": "Tous droits réservés.", "ar-SA": "جميع الحقوق محفوظة.",
  "tr-TR": "Tüm hakları saklıdır.", "de-DE": "Alle Rechte vorbehalten.",
};

for (const [locale, text] of Object.entries(translations)) {
  test(`footer renders real markup in ${locale} with icon-only accessible link`, () => {
    const html = render(locale, "https://www.instagram.com/touchline_test/");
    assert.ok(html.includes(text));
    assert.match(html, new RegExp(`lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"`));
    assert.equal((html.match(/<footer /g) ?? []).length, 1);
    assert.equal((html.match(/<a /g) ?? []).length, 1);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /aria-label="[^"]*TouchLine[^"]*"/);
    assert.match(html, /<svg [^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.match(html, /class="link social"/);
    assert.match(html, /TouchLine\. /);
    assert.equal(html.slice(html.indexOf("<a "), html.indexOf("</a>")).replace(/<[^>]*>/g, ""), "");
  });
}

test("no unconfigured, unsafe, non-profile or unrelated social target is rendered", () => {
  for (const value of [undefined, "", "not a URL", "javascript:alert(1)", "http://instagram.com/touchline_test",
    "https://instagram.com.evil.test/touchline_test", "https://evil.test/instagram.com/touchline_test",
    "https://instagram.com/", "https://instagram.com/accounts/login/", "https://instagram.com/reels/",
    "https://instagram.com/p/abc", "https://instagram.com/explore", "https://user:password@instagram.com/touchline_test/",
    "https://instagram.com:8443/touchline_test/", "https://instagram.com/a/b", "https://instagram.com/space%20name/"]) {
    const html = render("pt-BR", value);
    assert.doesNotMatch(html, /<a |<svg /, String(value));
    assert.ok(html.includes(translations["pt-BR"]));
  }
});

test("valid configured profile is preserved without guessing another account", () => {
  for (const url of ["https://instagram.com/touchline_test", "https://www.instagram.com/touchline.test/", "https://instagram.com/touchline_test/?igsh=test"]) {
    assert.ok(render("en-GB", url).includes(`href="${url}"`));
  }
});

test("footer honours the existing locale release resolver", () => {
  const language = resolveTouchlineCatalogueLocale("de-DE", false);
  assert.ok(render("de-DE", undefined, false).includes(translations[language]));
  assert.match(render("not-a-locale"), /lang="en-GB"/);
});

test("footer uses existing touch controls, safe areas, and no fixed positioning or animation", () => {
  assert.match(source, /TouchlineGlobalNavigation\.module\.css/);
  assert.match(css, /flex-wrap:nowrap/);
  assert.match(css, /\.footer small\s*\{\s*flex:1 1 0; min-width:0;/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /width:44px; min-height:44px/);
  assert.match(css, /box-sizing:border-box/);
  for (const side of ["left", "right", "bottom"]) assert.ok(css.includes(`env(safe-area-inset-${side})`));
  assert.doesNotMatch(css, /position:fixed|position:absolute|animation:|@keyframes/);
});

test("persistent root footer follows client navigation locale without a second store", () => {
  runtimePath = "/clubowner"; runtimeRelease = true;
  for (const [locale, text] of Object.entries(translations)) {
    runtimeQuery = new URLSearchParams({ lang: locale });
    const html = render("en-GB", "https://instagram.com/touchline_test");
    assert.ok(html.includes(text), locale);
    assert.match(html, new RegExp(`lang="${locale}"`));
  }
  runtimeRelease = false;
  runtimeQuery = new URLSearchParams({ lang: "de-DE" });
  assert.ok(render("en-GB").includes(translations["en-GB"]));
  runtimePath = "/login";
  assert.ok(render("en-GB").includes(translations["de-DE"]));
  runtimeQuery.set("returnTo", "/admin");
  assert.ok(render("en-GB").includes(translations["en-GB"]));
  runtimePath = "/admin"; runtimeRelease = true;
  assert.ok(render("en-GB").includes(translations["en-GB"]));
  runtimePath = null; runtimeRelease = false; runtimeQuery = new URLSearchParams();
});

test("old ClubHub and auth copyright are removed, preserving auth links and status", () => {
  const club = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../components/auth-layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(club, /<footer className="club-hub-footer"|copyrightYear/);
  assert.doesNotMatch(auth, /\{copy\.rights\}/);
  assert.match(auth, /\{copy\.marketOnline\}/);
  assert.match(auth, /<Link href=\{publicArenaHref\}/);
});
