import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
} from "../lib/touchlineArena/root-locale.ts";
import {
  isTouchLineLocaleApproved,
  isTouchLineLocaleComplete,
  TOUCHLINE_APPROVED_LOCALES,
} from "../lib/touchlineArena/i18n.ts";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const localeSync = readFileSync(new URL("../components/touchline/DocumentLocaleSync.tsx", import.meta.url), "utf8");
const comingSoon = readFileSync(new URL("../app/coming-soon/page.tsx", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

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
  assert.match(proxy, /canonicalUrl\.searchParams\.set\("lang", requestLocale\(request\)\)/);
});

test("root document receives the request locale before hydration and has one reusable skip target", () => {
  assert.match(layout, /await headers\(\)/);
  assert.match(layout, /requestHeaders\.get\(TOUCHLINE_PRESENTATION_LOCALE_HEADER\)/);
  assert.match(layout, /<html lang=\{locale\} dir=\{touchlineDocumentDirection\(locale\)\}>/);
  assert.match(layout, /href="#touchline-main-content"/);
  assert.match(layout, /id="touchline-main-content" tabIndex=\{-1\}/);
  assert.match(layout, /<DocumentLocaleSync initialLocale=\{locale\}/);
  assert.match(proxy, /function nextResponseWithPresentationLocale/);
  assert.match(proxy, /TOUCHLINE_PRESENTATION_LOCALE_HEADER/);
});

test("client locale sync keeps the server locale when the URL has no explicit language", () => {
  assert.match(localeSync, /resolveTouchLinePresentationLocale/);
  assert.match(localeSync, /requestedLocale === null \? initialLocale : requestedLocale/);
  assert.match(localeSync, /touchlineDocumentDirection\(locale\)/);
  assert.match(localeSync, /if \(requestedLocale !== null\)/);
  assert.doesNotMatch(localeSync, /readBrowserStorage/);
});

test("Coming Soon resolves both content and metadata through the public locale boundary", () => {
  assert.match(comingSoon, /export async function generateMetadata/);
  assert.match(comingSoon, /resolveTouchLinePresentationLocale\(params\.lang\)/);
  assert.match(comingSoon, /TouchLine Arena — Coming soon/);
  assert.match(comingSoon, /TouchLine Arena is being prepared to enter the pitch/);
  assert.match(comingSoon, /<TouchlineComingSoonLanding locale=\{locale\}/);
});

test("generic public navigation keeps the same effective locale and never picks a club or owner", () => {
  assert.equal(touchlineArenaHref("es-ES"), "/arena?lang=en-GB");
  assert.equal(touchlineClubHubHref("es-ES"), "/touchline-clubs?lang=en-GB");
  assert.equal(touchlineClubHubHref("pt-BR"), "/touchline-clubs?lang=pt-BR");
  assert.equal(touchlineClubOwnerProfileHref("es-ES"), "/club-owner/me?lang=en-GB");
  assert.equal(touchlineClubOwnerProfileHref("pt-BR"), "/club-owner/me?lang=pt-BR");
});
