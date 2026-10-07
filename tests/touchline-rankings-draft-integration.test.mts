import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import ts from "typescript";

const siteLocaleEnv: Record<string, string | undefined> = {};
const siteLocalePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: siteLocalePolicy, process: { env: siteLocaleEnv } });
import { AuthSessionMissingError } from "@supabase/supabase-js";
import * as rankings from "../lib/touchlineArena/rankings-i18n.ts";
import * as presentation from "../lib/touchlineArena/tables-presentation-i18n.ts";
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as fixtureRound from "../lib/touchlineArena/arena-fixture-round.ts";

type Element = React.ReactElement<Record<string, unknown>>;
const route = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/rankings/touchline-tables.module.css", import.meta.url), "utf8");
function compile(source: string, modules: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports,
    require: (name: string) => {
      if (name === "@/lib/touchlineArena/site-locales-release") return siteLocalePolicy;
      if (Object.hasOwn(modules, name)) return modules[name];
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsx;
      if (name === "lucide-react") return icons;
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === "@/lib/touchlineArena/rankings-i18n") return rankings;
      if (name === "@/lib/touchlineArena/tables-presentation-i18n") return presentation;
      if (name === "@/lib/touchlineArena/catalogue-locale") return catalogue;
      if (name === "@/lib/touchlineArena/i18n") return i18n;
      if (name.startsWith("@/components/")) return { default: (props: { children?: React.ReactNode }) => React.createElement("div", null, props.children) };
      return new Proxy({}, { get: () => () => assert.fail(`Unexpected collaborator ${name}`) });
    },
    fetch: () => assert.fail("No network"),
  });
  return exports;
}
function nodes(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as React.ReactNode)] : []);
}

test("actual Rankings panels propagate opt-in while default remains English", () => {
  const mod = compile(client);
  const Pending = mod.TouchlineRankingPodiumPending as (props: object) => Element;
  for (const [locale, expected] of [["es-ES", "Cargando clasificaciones…"], ["ar-SA", "جارٍ تحميل الترتيبات…"]]) {
    const opted = renderToStaticMarkup(Pending({ locale, draftLocalesEnabled: true }));
    assert.ok(opted.includes(expected));
    assert.ok(renderToStaticMarkup(Pending({ locale })).includes("Loading rankings…"));
    const podium = (mod.TouchlineRankingPodium as (props: object) => Element)({
      locale, draftLocalesEnabled: true, canEditCardEngine: false,
      copy: rankings.getTouchLineRankingsCopy(locale, true),
      highlights: { topPlayerCards: [{ id: "id", canonicalPlayerId: "canonical", shortName: "Official name", clubName: "Official club", position: "GK", editorialCard: null }] },
    });
    const card = nodes(podium).find(node => node.props.card);
    assert.equal(card?.props.draftLocalesEnabled, true);
    assert.equal(card?.props.locale, locale);
    assert.equal(card?.props.canEditCardEngine, false);
  }
});

test("Rankings route stays gated and brand reuses one verified auth result", async () => {
  const account = { id: "12345678-1234-1234-1234-123456789abc", email: "test@example.invalid" };
  for (const { user, error, expected } of [
    { user: null, error: null, expected: { mode: "guest" } },
    { user: account, error: null, expected: { mode: "account", accountId: account.id } },
    { user: null, error: new AuthSessionMissingError(), expected: { mode: "guest" } },
    { user: null, error: new Error("Authentication unavailable"), expected: { mode: "unavailable" } },
    { user: null, error: { name: "AuthSessionMissingError" }, expected: { mode: "unavailable" } },
    { user: account, error: new AuthSessionMissingError(), expected: { mode: "unavailable" } },
  ]) {
    let authCalls = 0;
    const Page = compile(route, {
      "@supabase/supabase-js": { AuthSessionMissingError },
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { authCalls++; return { data: { user }, error }; } } }) },
      "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => true },
      "@/lib/admin/owner": { isOwnerEmail: () => false },
      "@/lib/touchlineArena/global-navigation": { resolveTouchlineGlobalNavigationSurface: () => "public" },
      "@/lib/touchlineArena/ranking-load-diagnostics": { createRankingLoadDiagnostics: () => ({ measure: (_key: string, fn: () => unknown) => fn(), seal: () => undefined }) },
      "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: async () => ({}), loadTouchLinePublishedTopEleven: async () => null },
      "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: async () => [] },
      "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => ({}) },
      "@/lib/touchlineArena/card-publication-read-model": { countTouchlinePublishedPlayerCards: async () => 0 },
      "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: async () => [] },
      "@/lib/touchlineArena/rankings-highlight-projection": { projectTouchlineRankingsHighlights: () => ({}) },
    }).default as (props: object) => Promise<Element>;
    const tree = await Page({ searchParams: Promise.resolve({ lang: "ar-SA" }) });
    assert.equal(authCalls, 1);
    assert.equal(tree.props.dir, "ltr");
    const brand = nodes(tree).find(node => node.props.accountLocaleContext);
    assert.ok(brand);
    assert.equal(brand.props.locale, "en-GB");
    assert.equal(brand.props.draftLocalesEnabled, false);
    assert.equal(brand.props.href, "/rankings?lang=en-GB");
    assert.equal(JSON.stringify(brand.props.accountLocaleContext), JSON.stringify(expected));
    const nav = nodes(tree).find(node => node.props.currentRoute === "rankings");
    assert.equal(nav?.props.showAudioControl, false);
    assert.equal(nav?.props.draftLocalesEnabled, false);
    assert.equal(nav?.props.locale, "en-GB");
  }
});

test("Rankings physical frame does not mirror leader decoration and preserves pitch coordinates", () => {
  assert.doesNotMatch(css, /:global\(\[dir="rtl"\]\)\s*\.coachList/);
  assert.match(client, /left: `\$\{point\.x\}%`, top: `\$\{point\.y\}%`/);
  assert.match(client, /data-best-eleven-player=\{card\.canonicalPlayerId\}/);
});

function internalFixture() {
  let authCalls = 0;
  const active = { phase: "ranked", snapshotId: "player-snapshot" };
  const coach = { phase: "ranked", snapshotId: "coach-snapshot" };
  const cards = [{ id: "official-card", shortName: "Official Name" }];
  const highlights = Object.freeze({ sentinel: "real-projection-boundary" });
  const leafNames = ["TouchlineRankingsHero", "TouchlineFeaturedCoach", "TouchlineCoachRankingTable", "TouchlineRankingPodium", "TouchlineRankingPodiumPending", "TouchlineRankingEnding", "default"];
  const leaves = Object.fromEntries(leafNames.map(name => [name, function RankingLeaf() { return null; }]));
  const mod = compile(`${route}\nexports.internalPage = typeof renderRankingsPage === "function" ? renderRankingsPage : undefined;\nexports.RoundBadge = RoundBadge; exports.SportingContent = SportingContent; exports.BestXiPending = BestXiPending; exports.SportingFrame = SportingFrame;`, {
    "@supabase/supabase-js": { AuthSessionMissingError },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { authCalls++; return { data: { user: null }, error: null }; } } }) },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => false },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/touchlineArena/global-navigation": { resolveTouchlineGlobalNavigationSurface: () => "public" },
    "@/lib/touchlineArena/ranking-load-diagnostics": { createRankingLoadDiagnostics: () => ({ measure: (_key: string, fn: () => unknown) => fn(), seal: () => undefined }) },
    "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: async () => active, loadTouchLinePublishedTopEleven: async () => null },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: async () => cards },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => coach },
    "@/lib/touchlineArena/card-publication-read-model": { countTouchlinePublishedPlayerCards: async () => 7 },
    "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: async () => [] },
    "@/lib/touchlineArena/rankings-highlight-projection": { projectTouchlineRankingsHighlights: () => highlights },
    "@/lib/touchlineArena/arena-fixture-round": fixtureRound,
    "@/lib/touchlineArena/card-leadership-authority": { buildTouchlineCardLeadershipValue: () => ({}) },
    "@/components/touchline/cards/TouchlineCardLeadershipProvider": { TouchlineCardLeadershipProvider: function LeadershipBoundary() { return null; } },
    "./touchline-tables-client": leaves,
  });
  const invoke = async (name: string, props: object, enabled?: boolean) => {
    assert.equal(typeof mod[name], "function", `${name} must be an actual private render seam`);
    return await (mod[name] as (props: object, enabled?: boolean) => Element | Promise<Element>)(props, enabled);
  };
  const data = { complete: Promise.resolve([active, null, cards, coach, 7]), leadership: Promise.resolve([active, coach]), highlights: Promise.resolve(highlights) };
  return { mod, leaves, invoke, data, highlights, authCalls: () => authCalls };
}

test("private Rankings renderer propagates all eight locales through the page and sporting frame", async () => {
  for (const { code: locale } of i18n.TOUCHLINE_APPROVED_LOCALES) {
    const h = internalFixture();
    const tree = await h.invoke("internalPage", { searchParams: Promise.resolve({ lang: locale }) }, true);
    assert.equal(tree.props.dir, "ltr");
    assert.equal(h.authCalls(), 1);
    const entries = nodes(tree);
    for (const entry of entries.filter(node => node.props.accountLocaleContext || node.props.currentRoute || node.type === h.mod.RoundBadge || node.type === h.mod.SportingFrame)) {
      assert.equal(entry.props.locale, locale);
      assert.equal(entry.props.draftLocalesEnabled, true);
    }
    const frameEntry = entries.find(node => node.type === h.mod.SportingFrame);
    const badgeEntry = entries.find(node => node.type === h.mod.RoundBadge);
    assert.ok(frameEntry && badgeEntry);
    const badge = await h.invoke("RoundBadge", badgeEntry.props);
    assert.ok(renderToStaticMarkup(badge).includes(presentation.getTouchlineTablesPresentationCopy(locale, true).matchweekPending));
    const frame = await h.invoke("SportingFrame", frameEntry.props);
    const frameNodes = nodes(frame);
    const sections = frameNodes.filter(node => node.type === h.mod.SportingContent);
    assert.deepEqual(sections.map(node => node.props.section), ["hero", "overview", "podium", "ending"]);
    for (const section of sections) {
      assert.equal(section.props.draftLocalesEnabled, true);
      assert.equal(section.props.locale, locale);
      const content = await h.invoke("SportingContent", section.props);
      assert.equal((content.props.copy as { tablesTitle: string }).tablesTitle, rankings.getTouchLineRankingsCopy(locale, true).tablesTitle);
      if (section.props.section !== "hero") assert.equal(content.props.draftLocalesEnabled, true);
      if (section.props.section === "hero") {
        assert.equal(content.props.totalPublishedCards, 7);
        assert.equal(content.props.totalRankedCards, 1);
      }
      if (section.props.section === "ending") assert.equal((content.props.touchLineEnglandTable as unknown[]).length, 0);
      if (section.props.section === "overview" || section.props.section === "podium") assert.equal(content.props.highlights, h.highlights);
    }
    const suspense = frameNodes.filter(node => node.type === React.Suspense);
    const fallbacks = suspense.flatMap(node => nodes(node.props.fallback as React.ReactNode));
    const pending = fallbacks.find(node => node.type === h.mod.BestXiPending);
    assert.ok(pending);
    assert.equal(pending.props.draftLocalesEnabled, true);
    const pendingHtml = renderToStaticMarkup(await h.invoke("BestXiPending", pending.props));
    assert.ok(pendingHtml.includes(presentation.getTouchlineTablesPresentationCopy(locale, true).loadingRankings));
    for (const entry of [...frameNodes, ...fallbacks].filter(node => node.type === h.leaves.TouchlineFeaturedCoach || node.type === h.leaves.TouchlineCoachRankingTable || node.type === h.leaves.TouchlineRankingPodiumPending)) {
      assert.equal(entry.props.locale, locale);
      assert.equal(entry.props.draftLocalesEnabled, true);
    }
  }
});

test("private Rankings defaults and public wrapper remain closed despite forged query opt-in", async () => {
  for (const enabled of [undefined, false]) {
    const h = internalFixture();
    const root = await h.invoke("internalPage", { searchParams: Promise.resolve({ lang: "ar-SA" }) }, enabled);
    const brand = nodes(root).find(node => node.props.accountLocaleContext)!;
    assert.equal(brand.props.locale, "en-GB");
    assert.equal(brand.props.draftLocalesEnabled, false);
  }
  const h = internalFixture();
  const root = await h.invoke("default", { searchParams: Promise.resolve({ lang: "ar-SA", draftLocalesEnabled: true }) });
  assert.equal(nodes(root).find(node => node.props.accountLocaleContext)!.props.locale, "en-GB");
  for (const name of ["RoundBadge", "SportingContent", "BestXiPending", "SportingFrame"]) {
    const result = await h.invoke(name, { locale: "ar-SA", fixtures: Promise.resolve([]), data: h.data, user: null, section: "overview" });
    if (name === "RoundBadge") assert.ok(renderToStaticMarkup(result).includes("Matchweek awaiting provider"));
    if (name === "BestXiPending") assert.ok(renderToStaticMarkup(result).includes("Loading rankings…"));
    if (name === "SportingContent") assert.equal(result.props.draftLocalesEnabled, false);
    if (name === "SportingFrame") assert.equal(nodes(result).find(node => node.type === h.leaves.TouchlineFeaturedCoach)!.props.draftLocalesEnabled, false);
  }
});

test("Rankings exposes only the gated Next page and preserves public title-only metadata", async () => {
  const tree = ts.createSourceFile("page.tsx", route, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "TouchLineTablesPage");
  assert.ok(page && ts.isFunctionDeclaration(page) && page.body);
  const result = page.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(result && ts.isCallExpression(result));
  assert.equal(result.expression.getText(tree), "renderRankingsPage");
  assert.equal(result.arguments.length, 2);
  assert.equal(result.arguments[1].getText(tree), 'isTouchLineSiteLocalesEnabled("/rankings")');
  const internal = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "renderRankingsPage");
  assert.ok(internal && ts.isFunctionDeclaration(internal));
  assert.equal(internal.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(internal.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false, false);
  const generateMetadata = internalFixture().mod.generateMetadata;
  assert.equal(typeof generateMetadata, "function");
  const metadata = await (generateMetadata as (props: object) => Promise<{ title: string }>)({ searchParams: Promise.resolve({ lang: "ar-SA", draftLocalesEnabled: true }) });
  assert.equal(metadata.title, "TouchLine Rankings");
  assert.deepEqual(Object.keys(metadata), ["title"]);
});

test("real Rankings entry keeps default OFF and preserves all eight public locales under ON", async () => {
  try {
    for (const flag of [undefined, "false", "true"]) for (const {code} of i18n.TOUCHLINE_APPROVED_LOCALES) {
      siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      const h = internalFixture();
      const tree = await h.invoke("default", {searchParams:Promise.resolve({lang:code})});
      const brand = nodes(tree).find(node => node.props.accountLocaleContext)!;
      assert.equal(brand.props.locale, flag === "true" ? code : code === "pt-BR" ? "pt-BR" : "en-GB");
      assert.equal(brand.props.draftLocalesEnabled, flag === "true");
    }
  } finally { delete siteLocaleEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});
