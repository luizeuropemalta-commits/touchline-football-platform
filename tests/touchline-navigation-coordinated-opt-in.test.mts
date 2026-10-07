import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as arena from "../lib/touchlineArena/arena-navigation.ts";
import * as navigation from "../lib/touchlineArena/global-navigation.ts";
import * as copy from "../lib/touchlineArena/navigation-i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";

const require = createRequire(import.meta.url);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

function destinations(locale: string, flag?: boolean) {
  return [
    arena.touchlineArenaHref(locale, flag),
    arena.touchlineArenaDemoHref(locale, flag),
    arena.touchlineClubHubHref(locale, null, flag),
    arena.touchlineClubHubHref(locale, "Official Club", flag),
    arena.touchlineArenaPanelHref("market", locale, flag),
    arena.touchlineArenaPanelHref("formation", locale, flag),
    arena.touchlineArenaPanelHref("bench", locale, flag),
    arena.touchlineArenaPanelHref("live", locale, flag),
    arena.touchlineArenaPanelHref("watch", locale, flag),
    arena.touchlineArenaPanelHref("rankings", locale, flag),
    arena.touchlineArenaPanelHref("news", locale, flag),
    arena.touchlineArenaContractHref({ locale, playerId: "unchanged-id", playerName: "Official Name", clubId: "club-id" }, flag),
    navigation.touchlineGlobalNavigationArenaHref(locale, flag),
  ];
}

test("coordinated helpers preserve eight locales only on explicit opt-in and retain exact destinations", () => {
  const paths = ["/clubowner", "/clubowner", "/touchline-clubs", "/touchline-clubs/Official%20Club", "/clubowner", "/clubowner", "/clubowner", "/live", "/live", "/rankings", "/live", "/clubowner", "/clubowner"];
  for (const locale of locales) {
    for (const flag of [undefined, false, true]) {
      const effective = flag || locale === "pt-BR" ? locale : "en-GB";
      destinations(locale, flag).forEach((href, index) => {
        const url = new URL(href, "https://touchline.test");
        assert.equal(url.pathname, paths[index]);
        assert.equal(url.search, `?lang=${effective}`);
        assert.equal(url.hash, index === 5 || index === 6 ? "#my-club-xi-pitch" : "");
      });
      for (const surface of ["public", "auth", "authenticated"] as const) {
        assert.deepEqual(navigation.resolveTouchlineGlobalNavigationItems(locale, surface, flag), [
          { key: "clubHub", href: `/touchline-clubs?lang=${effective}` },
          { key: "live", href: `/live?lang=${effective}` },
          { key: "rankings", href: `/rankings?lang=${effective}` },
        ]);
      }
    }
  }
  for (const invalid of ["", "ar", "constructor", "__proto__", "xx-XX"]) {
    assert.ok(destinations(invalid, true).every(href => new URL(href, "https://touchline.test").searchParams.get("lang") === "en-GB"));
  }
  assert.equal(navigation.resolveTouchlineGlobalNavigationSurface({ isAuthenticated: true, isAdmin: true }), "auth");
});

function renderNavigation(locale: string, draftLocalesEnabled?: boolean) {
  const audio: Array<{ locale: string; allowDraftLocale?: boolean }> = [];
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/global-navigation": navigation,
    "@/lib/touchlineArena/navigation-i18n": copy,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/root-locale": rootLocale,
    "next/link": { default: ({ children, ...props }: { children: ReactNode }) => createElement("a", props, children) },
    "./TouchlineNavigationLabel": { default: ({ label }: { label: string }) => createElement("span", null, label) },
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
  const html = renderToStaticMarkup(exports.default({ locale, draftLocalesEnabled, currentRoute: "rankings", surface: "authenticated", trustedContext: { club: { teamId: "official-id", slug: "not-a-generic-destination", name: "Official <Club>" } } }));
  return { html, audio, hrefs: Array.from(html.matchAll(/href="([^"]+)"/g), match => match[1]) };
}

test("real global navigation forwards the same opted locale to destination helpers, labels and audio", () => {
  for (const locale of locales) {
    for (const flag of [undefined, false, true]) {
      const effective = flag || locale === "pt-BR" ? locale : "en-GB";
      const result = renderNavigation(locale, flag);
      assert.deepEqual(result.hrefs, ["/clubowner", "/touchline-clubs", "/live", "/rankings", "/rankings"].map(path => `${path}?lang=${effective}`));
      assert.equal(result.audio.length, 1);
      assert.equal(result.audio[0].locale, effective);
      assert.equal(result.audio[0].allowDraftLocale, flag ?? false);
      assert.ok(result.html.includes("Official &lt;Club&gt;"));
      assert.ok(result.html.includes(copy.TOUCHLINE_NAVIGATION_CATALOGUES[effective].allClubs));
      assert.ok(result.html.includes('aria-current="page"'));
      assert.ok(!result.hrefs.some(href => href.includes("not-a-generic-destination") || href.includes("/admin")));
    }
  }
});
