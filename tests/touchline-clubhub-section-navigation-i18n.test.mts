import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";

const load = () => import("../lib/touchlineArena/club-hub-section-navigation-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const expected = {
  "en-GB": { table: "Table", matchday: "Matchday", squad: "Squad", sectionsAria: "ClubHub sections", backToTop: "Back to top", top: "Top" },
  "pt-BR": { table: "Tabela", matchday: "Dia de jogo", squad: "Elenco", sectionsAria: "Seções do ClubHub", backToTop: "Voltar ao topo", top: "Topo" },
  "es-ES": { table: "Clasificación", matchday: "Día de partido", squad: "Plantilla", sectionsAria: "Secciones de ClubHub", backToTop: "Volver arriba", top: "Arriba" },
  "it-IT": { table: "Classifica", matchday: "Giorno della partita", squad: "Rosa", sectionsAria: "Sezioni di ClubHub", backToTop: "Torna in cima", top: "In cima" },
  "fr-FR": { table: "Classement", matchday: "Jour de match", squad: "Effectif", sectionsAria: "Sections de ClubHub", backToTop: "Retour en haut", top: "Haut" },
  "ar-SA": { table: "الترتيب", matchday: "يوم المباراة", squad: "قائمة الفريق", sectionsAria: "أقسام ClubHub", backToTop: "العودة إلى الأعلى", top: "الأعلى" },
  "tr-TR": { table: "Puan durumu", matchday: "Maç günü", squad: "Kadro", sectionsAria: "ClubHub bölümleri", backToTop: "Başa dön", top: "Baş" },
  "de-DE": { table: "Tabelle", matchday: "Spieltag", squad: "Kader", sectionsAria: "ClubHub-Bereiche", backToTop: "Nach oben", top: "Oben" },
} as const;
type Copy = Record<keyof typeof expected["en-GB"], string>;
const source = readFileSync(new URL("../components/touchline/club-hub/ClubHubSectionNavigation.tsx", import.meta.url), "utf8");
const targets = ["#club-table", "#touchline-club-lineup", "#club-squad", "#club-hub-top"];
const escape = (text: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, text));

test("section navigation keeps six exact EN/PT messages, eight draft rows and closed public gates", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_CATALOGUES), locales);
  assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_CATALOGUES[locale], expected[locale]);
    assert.deepEqual(mod.getTouchlineClubHubSectionNavigationCopy(locale), expected[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
    if (locale !== "en-GB" && locale !== "pt-BR") assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
  }
  for (const locale of [null, undefined, "", "pt", "constructor", "__proto__"]) assert.deepEqual(mod.getTouchlineClubHubSectionNavigationCopy(locale), expected["en-GB"]);
});

function compile(input: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, require: (name: string) => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, ...globals });
  return exports;
}
type State = { visible: boolean; active: string | null };
async function consumer(future: boolean, sentinel = false, controlled?: State) {
  await load();
  const requests: string[] = [], scrolls: unknown[] = [], media: string[] = [];
  let reduced = false, stateIndex = 0, effects = 0;
  const catalogue = compile(readFileSync(new URL("../lib/touchlineArena/club-hub-section-navigation-i18n.ts", import.meta.url), "utf8"), {
    "./catalogue-locale.ts": catalogueLocale,
  });
  const exports = compile(source, {
    react: controlled ? { ...React, useState: () => {
      const value = stateIndex++ === 0 ? controlled.visible : controlled.active; return [value, () => assert.fail("Effects are not executed in controlled-state rendering")];
    }, useEffect: () => { effects++; } } : React,
    "lucide-react": icons,
    "@/lib/touchlineArena/club-hub-section-navigation-i18n": { getTouchlineClubHubSectionNavigationCopy: (locale: string) => {
      requests.push(locale);
      return sentinel ? Object.fromEntries(Object.keys(expected["en-GB"]).map(key => [key, `${locale}:${key}`]))
        : (catalogue.getTouchlineClubHubSectionNavigationCopy as (locale: string, flag: boolean) => Copy)(locale, future);
    } },
    "../TouchlineGlobalNavigation.module.css": { default: { link: "shared-link" } },
    "./ClubHubSectionNavigation.module.css": { default: { navigation: "section-nav", backToTop: "back-top", backLabel: "back-label" } },
  }, { window: { matchMedia: (query: string) => { media.push(query); return { matches: reduced }; }, scrollTo: (value: unknown) => { scrolls.push(value); } },
    document: new Proxy({}, { get: () => assert.fail("SSR must not access document") }) });
  const Component = exports.default as (props: { locale: string; draftLocalesEnabled: boolean }) => React.ReactElement<Record<string, unknown>>;
  return { requests, scrolls, media, motion(value: boolean) { reduced = value; }, render(locale: string) {
    requests.length = 0; stateIndex = 0; effects = 0;
    const tree = controlled ? Component({ locale, draftLocalesEnabled: future }) : React.createElement(Component, { locale, draftLocalesEnabled: future });
    const html = renderToStaticMarkup(tree);
    if (controlled) { assert.equal(stateIndex, 2); assert.equal(effects, 2); }
    return { tree, html };
  } };
}

test("real React SSR uses eight isolated catalogues with table navigation, targets and initially hidden top link remain unchanged", async () => {
  for (const future of [false, true]) {
    const view = await consumer(future);
    for (const locale of locales) {
      const copy = expected[future ? locale : locale === "pt-BR" ? "pt-BR" : "en-GB"];
      const { html } = view.render(locale);
      assert.deepEqual(view.requests, [locale]);
      for (const value of Object.values(copy)) assert.ok(html.includes(escape(value)), `${locale}:${value}`);
      assert.ok(html.includes(`<span>${escape(copy.table)}</span>`)); assert.ok(html.includes(`aria-label="${escape(copy.sectionsAria)}"`));
      assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), targets);
      assert.ok(html.includes('aria-hidden="true"')); assert.ok(html.includes('data-visible="false"')); assert.ok(html.includes('tabindex="-1"'));
      assert.ok(!html.includes('aria-current="location"')); assert.equal(view.scrolls.length, 0);
    }
  }
});

test("actual JSX receives per-key sentinels and preserves visibility, focus order and active-location states", async () => {
  for (const visible of [false, true]) for (const active of [null, "club-table", "touchline-club-lineup", "club-squad"]) {
    const view = await consumer(true, true, { visible, active });
    for (const locale of locales) {
      const { html } = view.render(locale);
      for (const key of Object.keys(expected["en-GB"])) assert.ok(html.includes(`${locale}:${key}`), key);
      const anchors = [...html.matchAll(/<a ([^>]+)>/g)].map(match => match[1]);
      assert.equal(anchors.length, 4);
      anchors.forEach((value, index) => {
        assert.ok(value.includes(`href="${targets[index]}"`)); assert.ok(value.includes('class="shared-link'));
        assert.equal(value.includes('aria-current="location"'), index < 3 && targets[index] === `#${active}`);
      });
      assert.ok(anchors[3].includes(`aria-hidden="${!visible}"`)); assert.ok(anchors[3].includes(`data-visible="${visible}"`));
      assert.ok(anchors[3].includes(`tabindex="${visible ? 0 : -1}"`));
    }
  }
});

test("unchanged actual top handler leaves reduced-motion native navigation and otherwise requests instant origin scroll", async () => {
  const view = await consumer(false, false, { visible: true, active: "club-squad" });
  const { tree } = view.render("pt-BR");
  assert.ok("children" in tree.props);
  const anchors = React.Children.toArray(tree.props.children as React.ReactNode).filter((item): item is React.ReactElement<{ href: string; onClick?: (event: { preventDefault(): void }) => void }> => React.isValidElement(item) && item.type === "a");
  const top = anchors.find(node => node.props.href === "#club-hub-top")!;
  assert.equal(typeof top.props.onClick, "function");
  let prevented = 0;
  view.motion(true); top.props.onClick!({ preventDefault() { prevented++; } });
  assert.equal(prevented, 0); assert.equal(view.scrolls.length, 0);
  view.motion(false); top.props.onClick!({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1); assert.equal(JSON.stringify(view.scrolls), JSON.stringify([{ top: 0, left: 0, behavior: "instant" }]));
  assert.deepEqual(view.media, ["(prefers-reduced-motion: reduce)", "(prefers-reduced-motion: reduce)"]);
});

test("effects, link callback and top handler retain exact preimage bytes; the real page passes its full locale", () => {
  const ast = ts.createSourceFile("navigation.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects: string[] = [], callbacks: string[] = [];
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") effects.push(hash(node.getText(ast)));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "items.map") callbacks.push(hash(node.getText(ast)));
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === "onClick") callbacks.push(hash(node.getText(ast)));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.deepEqual(effects, ["571f410db3b9ccdd16e74458e265065e470252d270245df9ddbfc17394106171", "b6868469c1c13145970f87eeb158142e4fecf6291123736527b452f06a217a8d"]);
  assert.deepEqual(callbacks, ["bfad31bf91eb142100dde66a390175a64833b47fd41b625a9e4abb4f00fa6883", "9e2a7d7c9f120501e235047bc774ee5610fde66fc7991a7ee2ee50861539601d"]);
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const pageAst = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes: ts.JsxSelfClosingElement[] = [];
  const find = (node: ts.Node) => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(pageAst) === "ClubHubSectionNavigation") nodes.push(node); ts.forEachChild(node, find); };
  find(pageAst); assert.equal(nodes.length, 1);
  const code = ts.transpileModule(`(${nodes[0].getText(pageAst)});`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2017 } }).outputText;
  for (const locale of locales) {
    const element = runInNewContext(code, { React, locale, draftLocalesEnabled: false, ClubHubSectionNavigation: () => null }) as React.ReactElement<{ locale: string }>;
    assert.equal(element.props.locale, locale);
  }
});
