import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { chromium, webkit } from "@playwright/test";
import * as navigation from "../lib/touchlineArena/global-navigation.ts";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";
import * as copy from "../lib/touchlineArena/navigation-i18n.ts";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";
import * as arenaShellCopy from "../lib/touchlineArena/arena-shell-i18n.ts";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url), "utf8");
const ast = ts.createSourceFile("live.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes: Record<string, ts.JsxElement[]> = { heading: [], fixtureCount: [] };
const headers: ts.JsxSelfClosingElement[] = [];
function visit(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "TouchlineBrandHeader") headers.push(node);
  if (ts.isJsxElement(node)) {
    if (node.openingElement.tagName.getText(ast) === "h1") nodes.heading.push(node);
    for (const name of Object.keys(nodes)) {
      if (node.openingElement.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === "className" && attr.initializer?.getText(ast) === `{styles.${name}}`)) nodes[name].push(node);
    }
  }
  node.forEachChild(visit);
}
visit(ast);
assert.equal(headers.length, 1);
for (const list of Object.values(nodes)) assert.equal(list.length, 1);
const styles = new Proxy({}, { get: (_, key) => String(key) });
function load(path: string, modules: Record<string, unknown>) {
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require(name: string) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name.endsWith(".css")) return { default: styles };
      assert.ok(name in modules, name); return modules[name];
    } });
  assert.ok(exports.default);
  return exports.default;
}
const audio = () => React.createElement("button", { "data-audio": true });
const controls = load("../components/touchline/TouchlinePageControls.tsx", {
  "next/navigation": { usePathname: () => "/live" },
  "./SiteLocaleReleaseContext": { useSiteLocaleRelease: () => false },
  "@/lib/touchlineArena/auth-i18n": authCopy,
  "@/components/auth-ambient-audio": { AuthAmbientAudio: audio },
  "@/components/auth-language-switcher": { AuthLanguageSwitcher: ({ context }: { context?: { mode: string } }) => React.createElement("select", { "data-language": true, "data-context": context?.mode }) },
});
const nav = load("../components/touchline/TouchlineGlobalNavigation.tsx", {
  "next/link": { default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
  "./TouchlineNavigationLabel": { default: ({ label }: { label: string }) => React.createElement("span", null, label) },
  "@/components/auth-ambient-audio": { AuthAmbientAudio: audio },
  "lucide-react": new Proxy({}, { get: () => () => null }),
  "@/lib/touchlineArena/global-navigation": navigation,
  "@/lib/touchlineArena/root-locale": rootLocale,
  "@/lib/touchlineArena/catalogue-locale": catalogue,
  "@/lib/touchlineArena/navigation-i18n": copy,
});
const navigationRail = load("../components/touchline/TouchlineNavigationRail.tsx", { react: React });
const signOut = load("../components/touchline/TouchlineSignOutButton.tsx", {
  react: React,
  "lucide-react": new Proxy({}, { get: () => () => null }),
  "@/lib/supabase/client": { createClient: () => assert.fail("Header rendering must not start sign-out") },
  "@/lib/touchlineArena/arena-shell-i18n": arenaShellCopy,
  "@/lib/touchlineArena/auth-i18n": authCopy,
});
const brandHeader = load("../components/touchline/TouchlineBrandHeader.tsx", {
  "@/components/logo": { Logo: ({ href, officialArena, minimalMark, subtitle }: Record<string, unknown>) => React.createElement("a", { href: String(href), "data-logo": true, "data-official": String(officialArena), "data-minimal": String(minimalMark) }, String(subtitle)) },
  "./TouchlinePageControls": { default: controls },
  "./TouchlineNavigationRail": { default: navigationRail },
  "./TouchlineSignOutButton": { default: signOut },
});
const exports: { render?: (locale: string, draft?: boolean) => React.ReactNode } = {};
runInNewContext(ts.transpileModule(`export function render(language, draftLocalesEnabled=false) {
 const dictionary=getTouchlineMatchCentreCopy(language,draftLocalesEnabled);
 const textDirection=language === "ar-SA" ? "rtl" : "ltr";
 const selected={id:'fixture $&'};
 const railOnly=false;
 const hideRecentResults=false;
 const accountLocaleContext={mode:'account',accountId:'trusted-id'};
 const schedule={currentFixtures:[1,2,3],recentResults:[1,2]};
 return <>${headers[0].getText(ast)}${nodes.heading[0].getText(ast)}${nodes.fixtureCount[0].getText(ast)}</>;
}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  exports, styles, getTouchlineMatchCentreCopy,
  TouchlineGlobalNavigation: nav, TouchlineBrandHeader: brandHeader,
  Logo: ({ href, officialArena, minimalMark, subtitle }: Record<string, unknown>) => React.createElement("a", { href: String(href), "data-logo": true, "data-official": String(officialArena), "data-minimal": String(minimalMark) }, String(subtitle)),
  require(name: string) { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
});

test("actual Live JSX uses canonical Logo interface and real nav/controls with one audio and language", () => {
  for (const [locale, draft] of [["pt-BR", false], ["ar-SA", true]] as const) {
    const html = renderToStaticMarkup(exports.render!(locale, draft));
    assert.equal((html.match(/data-logo="true"/g) ?? []).length, 1);
    assert.equal((html.match(/data-audio="true"/g) ?? []).length, 1);
    assert.equal((html.match(/data-language="true"/g) ?? []).length, 1);
    assert.equal((html.match(/class="link compactAction"/g) ?? []).length, 1);
    assert.ok(html.includes('data-context="account"'));
    assert.ok(html.includes('data-official="true" data-minimal="true"'));
    assert.ok(html.includes(`href="/live?lang=${locale}&amp;fixture=fixture%20%24%26"`));
    assert.match(html, /<header class="frame" dir="ltr" data-centered-navigation="true"/);
    assert.ok(html.indexOf('class="navigationSlot"') < html.indexOf('</header>'));
    assert.ok(html.indexOf('</header>') < html.indexOf('<h1 class="sr-only">'));
    assert.doesNotMatch(html, /class="pageTitle"/);
    assert.ok(!source.includes('className={styles.toolbarNavigation}'));
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.deepEqual([...html.matchAll(/<dd>(.*?)<\/dd>/g)].map(match => match[1]), ["3", "2"]);
    assert.ok(!html.includes("headerSignal"));
  }
});

test("compact lineup reuses shared button family while retaining touch/focus/destination guards", () => {
  assert.match(source, /className=\{`\$\{sharedControls\.link\} \$\{styles\.homeLineupLink\}`\} href=\{link\.href\}/);
  assert.match(source, /return available && club/);
  assert.match(source, /verifiedDetail\?\.lineups\.some/);
  assert.match(source, /\[selected\.homeTeam, selected\.awayTeam\]/);
  assert.match(css, /\.homeLineupLink\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.homeLineupLink:focus-visible/);
  assert.ok(!css.includes(".toolbarNavigation"), "Live must not override shared navigation button dimensions");
});

test("narrow shared header separates navigation from brand and a long locale error", async () => {
  const headerCss = readFileSync(new URL("../components/touchline/TouchlineBrandHeader.module.css", import.meta.url), "utf8");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
      await page.setContent(`<style>body{margin:0}*{box-sizing:border-box}[data-logo]{display:block;width:242px;height:72px}.controls{width:200px}.controls p{white-space:normal}nav{display:flex;gap:8px;flex-wrap:wrap}nav a{display:block;padding:12px}${headerCss}</style>${renderToStaticMarkup(exports.render!("pt-BR"))}`);
      await page.locator(".controls").evaluate(node => {
        const error = document.createElement("p");
        error.textContent = "Não foi possível confirmar o idioma. Recarregue a página para tentar novamente.";
        node.append(error);
      });
      const boxes = await page.locator("header").evaluate(node => {
        const brand = node.querySelector("[data-logo]")!.getBoundingClientRect();
        const controls = node.querySelector(".controls")!.getBoundingClientRect();
        const nav = node.querySelector(".navigationSlot")!.getBoundingClientRect();
        return { brandRight: brand.right, controlsLeft: controls.left, upperBottom: Math.max(brand.bottom, controls.bottom), navTop: nav.top, navRight: nav.right, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(boxes.brandRight <= boxes.controlsLeft, engine.name());
      assert.ok(boxes.navTop >= boxes.upperBottom + 11, engine.name());
      assert.ok(boxes.navRight <= boxes.width, engine.name());
      assert.equal(boxes.overflow, false, engine.name());
    } finally { await browser.close(); }
  }
});
