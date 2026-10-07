import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import * as copy from "../lib/touchlineArena/football-search-i18n.ts";
import * as resolver from "../lib/touchlineArena/catalogue-locale.ts";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const componentPath = "components/player-database-search.tsx";
const pagePath = "app/(app)/football-search/page.tsx";
type NoticeProps = { locale?: string; mode?: string; draftLocalesEnabled?: boolean };
function load<T>(path: string, modules: Record<string, unknown>, suffix = "") {
  modules["@/lib/touchlineArena/site-locales-release"] = siteLocalePolicy;
  const exports = {} as T;
  runInNewContext(ts.transpileModule(read(path) + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require(id: string) { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; },
  });
  return exports;
}
function fixture(catalogue = copy) {
  const icon = () => React.createElement("svg");
  const Search = load<{PlayerDatabaseSearch: React.ComponentType<NoticeProps>}>(componentPath, { "react/jsx-runtime": jsx, "lucide-react": { ShieldCheck: icon }, "@/lib/touchlineArena/football-search-i18n": catalogue }).PlayerDatabaseSearch;
  const calls: NoticeProps[] = [];
  type Renderer = (props: {searchParams: Promise<{lang: string}>}, enabled?: boolean) => Promise<React.ReactNode>;
  const loaded = load<{default: Renderer; internal?: Renderer}>(pagePath, {
    "react/jsx-runtime": jsx,
    "next/link": { default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
    "lucide-react": { ArrowLeft: icon, DatabaseZap: icon },
    "@/components/player-database-search": { PlayerDatabaseSearch: (props: NoticeProps) => { calls.push(props); return React.createElement(Search, props); } },
    "@/lib/touchlineArena/auth-i18n": auth,
    "@/lib/touchlineArena/catalogue-locale": resolver,
    "@/lib/touchlineArena/football-search-i18n": catalogue,
  }, '\nexports.internal = typeof renderFootballSearchPage === "function" ? renderFootballSearchPage : undefined;');
  return { Search, page: loaded.default, internal: loaded.internal, calls };
}
const encoded = (text: string) => renderToStaticMarkup(React.createElement("span", {}, text)).slice(6, -7);

test("four complete draft strings name the actual ClubOwner destination and never open the global gates", () => {
  assert.deepEqual(Object.keys(copy.TOUCHLINE_FOOTBALL_SEARCH_CATALOGUES), locales);
  assert.deepEqual(copy.getTouchlineFootballSearchCopy("en-GB"), {
    back: "Back to ClubOwner", title: "TouchLine football search", editorialTitle: "Cards are managed by the editorial team", editorialDescription: "Each card is published manually, one player at a time, after editorial review.",
  });
  assert.deepEqual(copy.getTouchlineFootballSearchCopy("pt-BR"), {
    back: "Voltar ao ClubOwner", title: "Pesquisa de futebol TouchLine", editorialTitle: "Cards geridos pela equipa editorial", editorialDescription: "Cada card é publicado manualmente, jogador por jogador, depois de revisão editorial.",
  });
  for (const locale of locales) {
    const draft = copy.getTouchlineFootballSearchCopy(locale, true);
    assert.deepEqual(draft, copy.TOUCHLINE_FOOTBALL_SEARCH_CATALOGUES[locale]);
    assert.deepEqual(Object.keys(draft), ["back", "title", "editorialTitle", "editorialDescription"]);
    for (const value of Object.values(draft)) assert.ok(value.trim());
    assert.ok(draft.back.includes("ClubOwner"));
    assert.deepEqual(copy.getTouchlineFootballSearchCopy(locale), copy.TOUCHLINE_FOOTBALL_SEARCH_CATALOGUES[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
  }
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
  for (const invalid of [undefined, null, "__proto__", "constructor", "invalid"]) assert.deepEqual(copy.getTouchlineFootballSearchCopy(invalid, true), copy.getTouchlineFootballSearchCopy("en-GB"));
});

test("actual editorial notice renders both modes/all eight opted-in locales without generating search or publication actions", () => {
  const { Search } = fixture();
  for (const locale of locales) for (const enabled of [false, true]) for (const mode of ["full", "compact"]) {
    const expected = copy.getTouchlineFootballSearchCopy(locale, enabled);
    const html = renderToStaticMarkup(React.createElement(Search, { locale, mode, draftLocalesEnabled: enabled }));
    assert.ok(html.includes(encoded(expected.editorialTitle)));
    assert.equal(html.includes(encoded(expected.editorialDescription)), mode === "full");
    assert.ok(html.includes('role="status"'));
    assert.ok(html.includes('data-touchline-editorial-card-notice="true"'));
    assert.doesNotMatch(html, /<(?:input|button|form|a)\b/);
  }
  assert.doesNotMatch(read(componentPath), /fetch\(|useEffect|useRouter|localStorage|supabase|\.publish\(/);
  const sentinel = fixture({ ...copy, getTouchlineFootballSearchCopy: () => ({ back: "back", title: "title", editorialTitle: "<&> title", editorialDescription: '"<&> description' }) });
  const html = renderToStaticMarkup(React.createElement(sentinel.Search));
  assert.ok(html.includes("&lt;&amp;&gt; title"));
  assert.ok(html.includes("&quot;&lt;&amp;&gt; description"));
});

test("real route keeps opt-in false and existing ClubOwner destination with actual notice composition", async () => {
  for (const locale of locales) {
    const f = fixture();
    const html = renderToStaticMarkup(await f.page({ searchParams: Promise.resolve({ lang: locale }) }));
    const effective = resolver.resolveTouchlineCatalogueLocale(locale);
    const expected = copy.getTouchlineFootballSearchCopy(locale);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].draftLocalesEnabled, false);
    assert.equal(f.calls[0].locale, effective);
    assert.ok(html.includes(`href="${auth.touchLineAuthHref("/clubowner", effective)}"`));
    for (const text of Object.values(expected)) assert.ok(html.includes(encoded(text)));
  }
});

test("private search renderer composes eight real catalogues and preserves locale in its ClubOwner link", async () => {
  for (const locale of locales) for (const enabled of [true, false, undefined]) {
    const f = fixture();
    assert.equal(typeof f.internal, "function", "private renderFootballSearchPage seam must exist");
    const html = renderToStaticMarkup(await f.internal!({ searchParams: Promise.resolve({ lang: locale }) }, enabled));
    const effective = enabled ? locale : locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].locale, effective);
    assert.equal(f.calls[0].draftLocalesEnabled, enabled === true);
    assert.ok(html.includes(`href="/clubowner?lang=${effective}"`), `${locale}/${enabled} link`);
    assert.match(html, effective === "ar-SA" ? /dir="rtl"/ : /dir="ltr"/);
    for (const text of Object.values(copy.getTouchlineFootballSearchCopy(locale, enabled))) assert.ok(html.includes(encoded(text)));
    assert.doesNotMatch(html, /<(?:input|button|form)\b/);
  }
});

test("search public wrapper cannot be enabled by query or extra argument and forwards explicit link opt-in only privately", async () => {
  for (const locale of locales) {
    const f = fixture();
    const forged = { lang: locale, draftLocalesEnabled: true, draft: "true" };
    const html = renderToStaticMarkup(await f.page({ searchParams: Promise.resolve(forged) }, true));
    assert.equal(f.calls[0].draftLocalesEnabled, false);
    assert.ok(html.includes(`href="/clubowner?lang=${locale === "pt-BR" ? "pt-BR" : "en-GB"}"`));
  }
  const tree = ts.createSourceFile("page.tsx", read(pagePath), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "FootballSearchPage");
  assert.ok(page && ts.isFunctionDeclaration(page) && page.body);
  const returns = page.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1);
  const call = returns[0].expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.expression.getText(tree), "renderFootballSearchPage");
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/football-search")');
  const internal = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "renderFootballSearchPage");
  assert.ok(internal && ts.isFunctionDeclaration(internal));
  assert.equal(internal.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(internal.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false, false);
  assert.match(read(pagePath), /touchLineAuthHref\("\/clubowner", locale, draftLocalesEnabled\)/);
});

test("real search public entry follows server policy OFF/ON without changing editorial actions", async () => {
  try {
    for (const flag of [undefined, "false", "true"]) for (const locale of locales) {
      siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      const f = fixture();
      const html = renderToStaticMarkup(await f.page({searchParams:Promise.resolve({lang:locale})}));
      const effective = flag === "true" ? locale : locale === "pt-BR" ? "pt-BR" : "en-GB";
      assert.equal(f.calls[0].draftLocalesEnabled, flag === "true");
      assert.ok(html.includes(`href="/clubowner?lang=${effective}"`));
    }
  } finally { delete siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});
