import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isTouchLineLoginDraftLocale, normalizeTouchLineLoginLocale, normalizeTouchLineAuthReturnTo, normalizeTouchLineAuthLocale } from "../lib/touchlineArena/auth-i18n.ts";

import {
  touchlineArenaHref,
  touchlineClubHubHref,
} from "../lib/touchlineArena/arena-navigation.ts";
import { touchlineClubOwnerProfileHref } from "../lib/touchlineArena/club-owner-routes.ts";
import {
  resolveTouchLinePresentationLocale,
  resolveTouchLineRootLocale,
  touchlineDocumentDirection,
  touchlineLocaleRequestNeedsCanonicalRedirect,
  resolveTouchLineSavedPresentationLocale,
  TOUCHLINE_LOCALE_STORAGE_KEY,
} from "../lib/touchlineArena/root-locale.ts";
import {
  isTouchLineLocaleApproved,
  isTouchLineLocaleComplete,
  TOUCHLINE_APPROVED_LOCALES,
} from "../lib/touchlineArena/i18n.ts";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const landscapeBoundary = readFileSync(new URL("../components/touchline/TouchlineLandscapeBoundary.tsx", import.meta.url), "utf8");
const localeSync = readFileSync(new URL("../components/touchline/DocumentLocaleSync.tsx", import.meta.url), "utf8");
const comingSoon = readFileSync(new URL("../app/coming-soon/page.tsx", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

test("public canonicalization restores complete preferences without mutation redirects or loops", () => {
  const ast = ts.createSourceFile("proxy.ts", proxy, ts.ScriptTarget.Latest, true);
  const names = ["matchesRoute", "hasProtectedAuthReturn", "requestLocale", "canonicalPresentationLocaleRedirect"];
  const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""));
  assert.equal(selected.length, names.length);
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(selected.map(node => node.getText(ast)).join("\n") + "\nexports.redirect = canonicalPresentationLocaleRedirect;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, resolveTouchLinePresentationLocale, resolveTouchLineSavedPresentationLocale,
    touchlineLocaleRequestNeedsCanonicalRedirect, isTouchLineLoginDraftLocale, normalizeTouchLineLoginLocale,
    TOUCHLINE_LOCALE_STORAGE_KEY, normalizeTouchLineAuthReturnTo, normalizeTouchLineAuthLocale,
    NextResponse: { redirect: (url: URL, status: number) => ({ url: url.href, status, headers: new Headers() }) },
  });
  const redirect = exports.redirect as (request: unknown) => { url: string; status: number; headers: Headers } | null;
  const request = (path: string, cookie: string, method = "GET") => {
    const url = new URL(path, "https://touchline.example");
    return { method, nextUrl: Object.assign(url, { clone: () => new URL(url.href) }), cookies: { get: () => ({ value: cookie }) } };
  };
  const restored = redirect(request("/rankings?lang=en-GB", "pt-BR"));
  assert.equal(restored?.url, "https://touchline.example/rankings?lang=pt-BR");
  assert.equal(restored?.status, 307);
  assert.equal(restored?.headers.get("cache-control"), "private, no-store");
  assert.equal(redirect(request("/rankings?lang=pt-BR", "pt-BR")), null);
  assert.equal(redirect(request("/rankings?lang=es-ES", "es-ES"))?.url, "https://touchline.example/rankings?lang=en-GB");
  assert.equal(redirect(request("/login?lang=ar-SA", "pt-BR")), null);
  // URLSearchParams.get consumes the first value, just like the page's query
  // contract. A later value must not activate a draft or replace a preference.
  assert.equal(redirect(request("/rankings?lang=pt-BR&lang=es-ES", "")), null);
  assert.equal(redirect(request("/rankings?lang=es-ES&lang=pt-BR", ""))?.url,
    "https://touchline.example/rankings?lang=en-GB");
  const duplicateWithPreference = redirect(request("/rankings?lang=en-GB&lang=ar-SA", "pt-BR"));
  assert.equal(duplicateWithPreference?.url, "https://touchline.example/rankings?lang=pt-BR");
  assert.equal(duplicateWithPreference?.status, 307);
  assert.equal(duplicateWithPreference?.headers.get("cache-control"), "private, no-store");
  assert.equal(redirect(request("/login?lang=ar-SA&lang=pt-BR", "pt-BR")), null);
  assert.equal(redirect(request("/login?lang=en-GB&lang=ar-SA", "pt-BR"))?.url,
    "https://touchline.example/login?lang=pt-BR");
  for (const path of ["/api/data?lang=es-ES", "/auth/callback?lang=es-ES", "/_next/data?lang=es-ES", "/logo.svg?lang=es-ES"]) {
    assert.equal(redirect(request(path, "pt-BR")), null, path);
  }
  assert.equal(redirect(request("/rankings?lang=en-GB", "pt-BR", "POST")), null);
});

test("the approved locale vocabulary is exact while only reviewed catalogues render publicly", () => {
  assert.deepEqual(
    TOUCHLINE_APPROVED_LOCALES.map((locale) => locale.code),
    ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"],
  );
  assert.equal(isTouchLineLocaleApproved("de-DE"), true);
  assert.equal(isTouchLineLocaleApproved("nl-NL"), false);
  assert.equal(isTouchLineLocaleComplete("en-GB"), true);
  assert.equal(isTouchLineLocaleComplete("pt-BR"), true);
  assert.equal(isTouchLineLocaleComplete("es-ES"), false);
  assert.equal(isTouchLineLocaleComplete("ar-SA"), false);
  assert.equal(resolveTouchLinePresentationLocale("en-GB"), "en-GB");
  assert.equal(resolveTouchLinePresentationLocale("pt-BR"), "pt-BR");
  assert.equal(resolveTouchLinePresentationLocale("es-ES"), "en-GB");
  assert.equal(resolveTouchLinePresentationLocale("ar-SA"), "en-GB");
  assert.equal(resolveTouchLinePresentationLocale("invalid"), "en-GB");
  assert.equal(resolveTouchLinePresentationLocale(["pt-BR", "en-GB"]), "pt-BR");
  assert.equal(resolveTouchLineRootLocale("es-ES"), "en-GB");
});

test("incomplete locale URLs canonicalize before SSR while Arabic direction remains ready", () => {
  assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect("en-GB"), false);
  assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect("pt-BR"), false);
  assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect("es-ES"), true);
  assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect("de-DE"), true);
  assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect("ar-SA"), true);
  assert.equal(touchlineLocaleRequestNeedsCanonicalRedirect("invalid"), true);
  assert.equal(touchlineDocumentDirection("en-GB"), "ltr");
  assert.equal(touchlineDocumentDirection("ar-SA"), "rtl");
  assert.match(proxy, /function canonicalPresentationLocaleRedirect/);
  assert.match(proxy, /touchlineLocaleRequestNeedsCanonicalRedirect/);
  assert.match(proxy, /canonicalUrl\.searchParams\.set\("lang", requestLocale\(request, draftLocalesEnabled\)\)/);
  assert.match(proxy, /if \(savedLocale && requestedLocale !== savedLocale\)/);
  assert.match(proxy, /canonicalUrl\.searchParams\.set\("lang", savedLocale\)/);
  assert.ok(proxy.indexOf('canonicalUrl.searchParams.set("lang", savedLocale)') < proxy.indexOf('canonicalUrl.searchParams.set("lang", requestLocale(request, draftLocalesEnabled))'));
});

test("root document receives the request locale before hydration and has one reusable skip target", () => {
  assert.match(layout, /await headers\(\)/);
  assert.match(layout, /requestHeaders\.get\(TOUCHLINE_PRESENTATION_LOCALE_HEADER\)/);
  assert.match(layout, /<html lang=\{locale\} dir=\{draftLocalesEnabled \? "ltr" : touchlineDocumentDirection\(locale\)\} data-scroll-behavior="smooth">/);
  assert.match(layout, /<TouchlineLandscapeBoundary\s+skipLabel=\{skipLabel\}\s+locale=\{locale\} draftLocalesEnabled=\{allowDraftPresentation\}>/);
  assert.match(landscapeBoundary, /href="#touchline-main-content"/);
  assert.match(landscapeBoundary, /id="touchline-main-content"/);
  assert.match(landscapeBoundary, /tabIndex=\{-1\}/);
  assert.equal((landscapeBoundary.match(/href="#touchline-main-content"/g) ?? []).length, 1);
  assert.equal((landscapeBoundary.match(/id="touchline-main-content"/g) ?? []).length, 1);
  assert.match(layout, /<DocumentLocaleSync initialLocale=\{locale\}/);
  assert.match(proxy, /function nextResponseWithPresentationLocale/);
  assert.match(proxy, /TOUCHLINE_PRESENTATION_LOCALE_HEADER/);
});

test("client locale sync keeps the server locale when the URL has no explicit language", () => {
  assert.match(localeSync, /resolveTouchLinePresentationLocale/);
  assert.match(localeSync, /requestedLocale === null \? initialLocale : requestedLocale/);
  assert.match(localeSync, /touchlineDocumentDirection\(locale\)/);
  assert.doesNotMatch(localeSync, /document\.cookie\s*=|writeBrowserStorage/);
  assert.doesNotMatch(localeSync, /readBrowserStorage/);
});

test("the retired Coming Soon route preserves locale and redirects into the intro", () => {
  assert.match(comingSoon, /resolveTouchLineRootLocale\(params\.lang\)/);
  assert.match(comingSoon, /redirect\(`\/intro\?lang=\$\{encodeURIComponent\(locale\)\}`\)/);
  assert.doesNotMatch(comingSoon, /Coming soon|Em breve|TouchlineComingSoonLanding/);
});

test("generic public navigation keeps the same effective locale and never picks a club or owner", () => {
  assert.equal(touchlineArenaHref("es-ES"), "/clubowner?lang=en-GB");
  assert.equal(touchlineClubHubHref("es-ES"), "/touchline-clubs?lang=en-GB");
  assert.equal(touchlineClubHubHref("pt-BR"), "/touchline-clubs?lang=pt-BR");
  assert.equal(touchlineClubOwnerProfileHref("es-ES"), "/club-owner/me?lang=en-GB");
  assert.equal(touchlineClubOwnerProfileHref("pt-BR"), "/club-owner/me?lang=pt-BR");
});
