import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as navigation from "../lib/touchlineArena/global-navigation.ts";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";
import * as copy from "../lib/touchlineArena/navigation-i18n.ts";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url), "utf8");
const ast = ts.createSourceFile("live.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes: Record<string, ts.JsxElement[]> = { header: [], toolbar: [], fixtureCount: [] };
function visit(node: ts.Node) {
  if (ts.isJsxElement(node)) {
    for (const name of Object.keys(nodes)) {
      if (node.openingElement.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === "className" && attr.initializer?.getText(ast) === `{styles.${name}}`)) nodes[name].push(node);
    }
  }
  node.forEachChild(visit);
}
visit(ast);
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
const exports: { render?: (locale: string, draft?: boolean) => React.ReactNode } = {};
runInNewContext(ts.transpileModule(`export function render(language, draftLocalesEnabled=false) {
 const dictionary=getTouchlineMatchCentreCopy(language,draftLocalesEnabled);
 const selected={id:'fixture $&'};
 const accountLocaleContext={mode:'account',accountId:'trusted-id'};
 const schedule={currentFixtures:[1,2,3],recentResults:[1,2]};
 return <>${nodes.header[0].getText(ast)}${nodes.toolbar[0].getText(ast)}${nodes.fixtureCount[0].getText(ast)}</>;
}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  exports, styles, getTouchlineMatchCentreCopy,
  TouchlineGlobalNavigation: nav, TouchlinePageControls: controls,
  Logo: ({ href, officialArena, minimalMark, subtitle }: Record<string, unknown>) => React.createElement("a", { href: String(href), "data-logo": true, "data-official": String(officialArena), "data-minimal": String(minimalMark) }, String(subtitle)),
  require(name: string) { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
});

test("actual Live JSX uses canonical Logo interface and real nav/controls with one audio and language", () => {
  for (const [locale, draft] of [["pt-BR", false], ["ar-SA", true]] as const) {
    const html = renderToStaticMarkup(exports.render!(locale, draft));
    assert.equal((html.match(/data-logo="true"/g) ?? []).length, 1);
    assert.equal((html.match(/data-audio="true"/g) ?? []).length, 1);
    assert.equal((html.match(/data-language="true"/g) ?? []).length, 1);
    assert.ok(html.includes('data-context="account"'));
    assert.ok(html.includes('data-official="true" data-minimal="true"'));
    assert.ok(html.includes(`href="/live?lang=${locale}&amp;fixture=fixture%20%24%26"`));
    assert.match(html, /class="header" dir="ltr"/);
    assert.match(html, /class="toolbar" dir="ltr"/);
    assert.deepEqual([...html.matchAll(/<dd>(.*?)<\/dd>/g)].map(match => match[1]), ["3", "2"]);
    assert.ok(!html.includes("headerSignal"));
  }
});

test("compact lineup reuses shared button family while retaining touch/focus/destination guards", () => {
  assert.match(source, /className=\{`\$\{sharedControls\.link\} \$\{styles\.homeLineupLink\}`\} href=\{homeLineupHref\} onClick=\{openSelectedLineup\}/);
  assert.match(source, /homeLineupAvailable && homeLineupHref/);
  assert.match(source, /verifiedDetail\?\.lineupAvailableAt/);
  assert.match(source, /selectedCanonicalState === "live" \|\| selectedCanonicalState === "finished"/);
  assert.match(css, /\.homeLineupLink\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.homeLineupLink:focus-visible/);
  assert.match(css, /\.toolbar\s*\{[^}]*flex-wrap:\s*wrap[^}]*direction:\s*ltr/s);
  assert.match(css, /\.toolbar \.toolbarNavigation\s*\{[^}]*padding:\s*0/s);
});
