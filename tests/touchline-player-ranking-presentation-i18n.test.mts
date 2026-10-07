import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as authAccess from "../lib/touchlineArena/auth-access.ts";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { touchlineRankingsDrafts, TOUCHLINE_RANKINGS_DRAFT_STATE } from "../lib/touchlineArena/locale-catalogues/rankings-drafts.ts";
import * as catalog from "../lib/touchlineArena/ranked-card-catalog.ts";
import * as demo from "../lib/touchlineArena/demo-data.ts";
import * as position from "../lib/touchlineArena/position-labels.ts";
import * as positionKind from "../lib/touchlineArena/position-aware-card-stats.ts";
import * as tiers from "../lib/touchlineArena/card-rules.ts";
import * as zoomDetails from "../lib/touchlineArena/card-zoom-details.ts";
import * as zoomCopy from "../lib/touchlineArena/card-zoom-i18n.ts";
import * as exactCopy from "../lib/touchlineArena/exact-card-i18n.ts";
import * as links from "../lib/touchlineArena/player-links.ts";
import * as navigation from "../lib/touchlineArena/arena-navigation.ts";
import * as globalNavigation from "../lib/touchlineArena/global-navigation.ts";
import * as engineLinks from "../lib/touchlineArena/card-engine-links.ts";
import * as presentation from "../lib/touchlineArena/public-card-presentation.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const en = {
  publishedRatingOrder: "TouchLine rating order",
  publishedRankingDescription: "The ranking includes published TouchLine cards only and is ordered by the sum of verified TouchLine ratings. The tier comes from the card-publication process.",
  playerRankingSummary: "TouchLine Player Cards Ranking summary",
  ratingSum: "Rating sum", topPlayerCards: "Top ranked TouchLine player cards",
  fullPlayerRanking: "Full TouchLine player card ranking", officialTopTwenty: "Top 20 · official cards", playerRank: "Rank",
};
const pt = {
  publishedRatingOrder: "Ordem por Nota TouchLine",
  publishedRankingDescription: "O ranking reúne apenas cards TouchLine publicados e é ordenado pela soma das notas TouchLine verificadas. O tier é definido pelo processo de publicação do card.",
  playerRankingSummary: "Resumo do ranking de cards de jogadores TouchLine",
  ratingSum: "Soma das notas", topPlayerCards: "Cards de jogadores TouchLine mais bem classificados",
  fullPlayerRanking: "Ranking completo de cards de jogadores TouchLine", officialTopTwenty: "Top 20 · cards oficiais", playerRank: "Posição",
};
const keys = Object.keys(en) as Array<keyof typeof en>;
const source = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
const dictionary = readFileSync(new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url), "utf8");

test("public ranking wrapper preserves omitted opt-in and the renderer defaults to false", () => {
  const page = ts.createSourceFile("ranking.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const routes = page.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.equal(routes.length, 1, "one real default ranking route");
  const route = routes[0];
  assert.ok(route.body);
  assert.equal(route.parameters.length, 1);
  assert.ok(ts.isIdentifier(route.parameters[0].name));
  assert.equal(route.body.statements.length, 1, "public wrapper only delegates");
  const statement = route.body.statements[0];
  assert.ok(ts.isReturnStatement(statement));
  const call = statement.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.ok(ts.isIdentifier(call.expression));
  assert.equal(call.expression.text, "renderPlayerCardRankings");
  assert.equal(call.arguments.length, 2, "public route supplies only the trusted runtime gate");
  assert.equal(call.arguments[1].getText(page), 'isTouchLineSiteLocalesEnabled("/touchline-player-card-rankings")');
  assert.ok(ts.isIdentifier(call.arguments[0]));
  assert.equal(call.arguments[0].text, route.parameters[0].name.text, "forward original route props");
  const renderers = page.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && node.name?.text === "renderPlayerCardRankings");
  assert.equal(renderers.length, 1);
  assert.equal(renderers[0].parameters[1]?.name.getText(page), "draftLocalesEnabled");
  assert.equal(renderers[0].parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword,
    "omitted public opt-in must resolve to literal false");
});

const compile = (text: string, modules: Record<string, unknown>) => {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, URLSearchParams, require: (name: string) => {
      if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy; assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`); return modules[name]; }, fetch: () => assert.fail("No HTTP"),
  }); return exports;
};
const getCopy = compile(dictionary, { "./catalogue-locale.ts": catalogueLocale, "./locale-catalogues/rankings-drafts.ts": { touchlineRankingsDrafts } }).getTouchLineRankingsCopy as (locale?: string | null) => Record<string, string>;
type Element = React.ReactElement<Record<string, unknown>>;
function nodes(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as React.ReactNode)] : []);
}
const text = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));
function cards(count: number): demo.ClubOwnerSquadCard[] {
  return Array.from({ length: count }, (_, index) => ({ ...demo.CLUB_OWNER_SQUAD_CARDS[0], id: `uuid-${index}`, canonicalPlayerId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name: `Official $&<Player ${index}>`, shortName: `Official ${index}`, clubName: demo.TOUCHLINE_ENGLAND_CLUBS[0].name, seasonTotalRating: index === 0 ? null : index - 1, publishedRanking: undefined, editorialCard: null }));
}
function harness(input: { lang?: string; future?: boolean; sentinel?: boolean; count?: number; phase?: string; user?: { email: string } | null; query?: Promise<{ lang?: string }> }) {
  const effective = catalogueLocale.resolveTouchlineCatalogueLocale(input.lang, input.future ?? false);
  const copy = input.future && effective !== "en-GB" && effective !== "pt-BR" ? touchlineRankingsDrafts[effective] : getCopy(effective);
  const sentinels = Object.fromEntries(keys.map(key => [key, `${effective}:${key}:$&<>`]));
  const seen: string[] = [], roster = cards(input.count ?? 1), snapshot = { phase: input.phase ?? "ranked", snapshotId: "unchanged-snapshot" };
  const exactCardProps: Record<string, unknown>[] = [];
  function Zoom(props: Record<string, unknown>) { return React.createElement("div", { "data-zoom": true }, props.children as React.ReactNode); }
  function Card(props: Record<string, unknown>) { exactCardProps.push(props); return React.createElement("i", { "data-art-boundary": true }); }
  function Navigation() { return null; }
  const modules = {
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/auth-access": authAccess,
    "@supabase/supabase-js": { AuthSessionMissingError },
    "@/components/touchline/TouchlineBrandHeader": { default: () => null },
    "react/jsx-runtime": jsx,
    "@/components/touchline/TouchlineClubPerimeterTrace": { default: () => null },
    "@/components/touchline/cards/TouchlineEliteExactCard": { default: Card },
    "@/components/touchline/cards/TouchlineCardZoom": { default: Zoom },
    "@/components/touchline/TouchlineGlobalNavigation": { default: Navigation },
    "@/components/touchline/TouchlineLivePresentationRefresh": { default: () => null },
    "@/components/touchline/cards/TouchlineCardLeadershipProvider": { TouchlineCardLeadershipProvider: ({ children }: { children: React.ReactNode }) => children },
    "@/lib/touchlineArena/card-leadership-authority": { buildTouchlineCardLeadershipValue: (state: unknown, coaches: unknown) => { assert.equal(state, snapshot); assert.equal(coaches, null); return {}; } },
    "@/lib/touchlineArena/position-labels": position,
    "@/lib/touchlineArena/position-aware-card-stats": positionKind,
    "@/lib/touchlineArena/card-zoom-i18n": zoomCopy,
    "@/lib/touchlineArena/exact-card-i18n": exactCopy,
    "@/lib/touchlineArena/demo-data": demo,
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { seen.push("auth"); return { data: { user: input.user ? { ...input.user, id: "10000000-0000-4000-8000-000000000001", app_metadata: { touchline_arena_access_v1: true } } : null }, error: null }; } } }) },
    "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: async () => { seen.push("ranking"); return snapshot; } },
    "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: async (state: unknown) => { assert.equal(state, snapshot); seen.push("catalogue"); return roster; } },
    "@/lib/touchlineArena/ranked-card-catalog": catalog,
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/rankings-i18n": { getTouchLineRankingsCopy: (locale: string) => { assert.equal(locale, effective); seen.push("copy"); return { ...copy, ...(input.sentinel ? sentinels : {}) }; } },
    "@/lib/touchlineArena/arena-navigation": navigation,
    "@/lib/touchlineArena/card-rules": tiers,
    "@/lib/touchlineArena/card-zoom-details": zoomDetails,
    "@/lib/touchlineArena/player-links": links,
    "@/lib/touchlineArena/public-card-presentation": presentation,
    "@/lib/admin/owner": { isOwnerEmail: (email: string) => email === "owner@example.test" },
    "@/lib/touchlineArena/global-navigation": globalNavigation,
    "@/lib/touchlineArena/card-engine-links": engineLinks,
  };
  const exports = compile(`${source}\nexport { renderPlayerCardRankings as testRender };`, modules);
  return { seen, effective, copy, roster, sentinels, exactCardProps, Zoom, Navigation, exports, run: () => (exports.testRender as (props: object, flag: boolean) => Promise<Element>)({ searchParams: input.query ?? Promise.resolve({ lang: input.lang }) }, input.future ?? false) };
}

test("player ranking real page consumes all eight new copy bindings", async () => {
  for (const lang of locales) {
    const h = harness({ lang, future: true, sentinel: true });
    const tree = await h.run(), html = renderToStaticMarkup(tree);
    for (const key of keys) assert.ok(html.includes(text(h.sentinels[key])), `${lang}:${key}`);
    assert.ok(h.seen.includes("copy"));
  }
});

test("player ranking additions preserve exact EN/PT and the restored main catalogue bytes", () => {
  for (const [locale, expected] of [["en-GB", en], ["pt-BR", pt]] as const) {
    const actual = getCopy(locale);
    assert.deepEqual(Object.fromEntries(keys.map(key => [key, actual[key]])), expected);
    assert.equal(Object.keys(actual).length, 45);
  }
  const remove = (content: string) => content.split("\n").filter(line => !keys.some(key => new RegExp(`^\\s+${key}:`).test(line))).join("\n");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  // The baseline is the exact HEAD file, also recorded in the QA successor
  // manifest (2026-09-26). Reverse only the separately authorized opt-in and
  // terminology deltas; keep its original hash guarding every other byte.
  let restored = remove(dictionary);
  const reverse = (current: string, baseline: string, occurrences = 1) => {
    assert.equal(restored.split(current).length - 1, occurrences, `authorized delta: ${current}`);
    restored = restored.split(current).join(baseline);
  };
  reverse('import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";\nimport { touchlineRankingsDrafts } from "./locale-catalogues/rankings-drafts.ts";', 'import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";');
  reverse('tablesTitle: "TouchLine Rankings"', 'tablesTitle: "TouchLine Tables"');
  reverse('tablesTitle: "Rankings TouchLine"', 'tablesTitle: "Tabelas TouchLine"');
  reverse('marketTransfer: "ClubOwner"', 'marketTransfer: "Market Transfer"', 2);
  // The two old labels differed; reverse each within its actual locale block.
  reverse('clubHub: "ClubHub",\n  completeRanking: "Complete ranking"', 'clubHub: "Club Hub",\n  completeRanking: "Complete ranking"');
  reverse('clubHub: "ClubHub",\n  completeRanking: "Ranking completo"', 'clubHub: "Central do clube",\n  completeRanking: "Ranking completo"');
  reverse('connectedDescription: "Connected to ClubOwner, ClubHub and the ClubOwner profile."', 'connectedDescription: "Connected to TouchLine Market Transfer, Club Hub and ClubOwner profile."');
  reverse('connectedDescription: "Conectado ao ClubOwner, ao ClubHub e ao perfil do ClubOwner."', 'connectedDescription: "Conectado ao TouchLine Market Transfer, à Central do Clube e ao perfil do ClubOwner."');
  reverse(`export type TouchlineRankingsCopy = Readonly<Record<keyof typeof en, string>>;

export function getTouchLineRankingsCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineRankingsCopy {
  const selected = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  if (selected === "en-GB") return en;
  if (selected === "pt-BR") return ptBR;
  return touchlineRankingsDrafts[selected];
}`, `export function getTouchLineRankingsCopy(locale?: string | null) {
  return normalizeTouchLineLocale(locale) === "pt-BR" ? ptBR : en;
}`);
  assert.equal(hash(restored), "378bed71612490694379fb5934edf49f4a657eb3728e94f276ea9b656f2aea6f");
});

// Independent semantic schema, not a claim that historical draft bytes or all
// translated wording were recovered; see full-suite-failure-triage-20261007.md.
test("player ranking drafts retain the independent 37-key schema and protected product names", () => {
  const legacyKeys = [
    "backToArena", "tablesTitle", "tablesDescription", "englandTable", "touchLineXi",
    "clubOwners", "publishedCards", "rankedCards", "demoTop20", "cardsTracked",
    "cardsTrackedDescription", "rankMode", "pointsLead", "pointsMode", "marketMode",
    "cards", "pointsShort", "ownerLeagueTable", "ownerLeagueRule", "seasonSelection",
    "seasonSelectionRule", "seasonSelectionHint", "seasonSelectionPending",
    "seasonSelectionPendingDescription", "rankingPending", "rankingPendingDescription",
    "rankingTitle", "rankingDescription", "mode", "liveOrder", "demoOrder",
    "marketTransfer", "clubHub", "completeRanking", "allOwnedCards", "connectedDescription", "club",
  ];
  const newKeys = ["publishedRatingOrder", "publishedRankingDescription", "playerRankingSummary",
    "ratingSum", "topPlayerCards", "fullPlayerRanking", "officialTopTwenty", "playerRank"];
  const draftLocales = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
  assert.equal(legacyKeys.length, 37);
  assert.equal(new Set([...legacyKeys, ...newKeys]).size, 45);
  assert.deepEqual(Object.keys(touchlineRankingsDrafts).sort(), [...draftLocales].sort());
  assert.equal(TOUCHLINE_RANKINGS_DRAFT_STATE, "draft");
  for (const locale of draftLocales) {
    assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
    assert.deepEqual(getCopy(locale), getCopy("en-GB"));
    const draft = touchlineRankingsDrafts[locale];
    assert.deepEqual(Object.keys(draft).filter(key => !newKeys.includes(key)).sort(), [...legacyKeys].sort());
    assert.deepEqual(Object.keys(draft).sort(), [...legacyKeys, ...newKeys].sort());
    assert.deepEqual(Object.keys(draft).sort(), Object.keys(getCopy("en-GB")).sort());
    for (const [key, value] of Object.entries(draft)) {
      assert.equal(typeof value, "string", `${locale}:${key}`);
      assert.ok(value.trim(), `${locale}:${key}`);
    }
    assert.equal(draft.touchLineXi, "TouchLine XI");
    assert.equal(draft.marketTransfer, "ClubOwner");
    assert.match(draft.clubOwners, /^ClubOwners?$/);
    assert.ok(draft.englandTable.includes("TouchLine England"));
  }
});

test("player ranking real output keeps EN/PT and isolated draft labels without publishing languages", async () => {
  for (const future of [false, true]) for (const lang of locales) {
    const h = harness({ lang, future }); const html = renderToStaticMarkup(await h.run());
    const expected = h.effective === "pt-BR" ? pt : h.effective === "en-GB" ? en : touchlineRankingsDrafts[h.effective];
    for (const key of keys) assert.ok(html.includes(text((expected as Record<string, string>)[key])), `${future}:${lang}:${key}`);
    assert.ok(html.includes("TouchLine England")); assert.ok(html.includes("ClubOwner"));
    assert.ok(!html.includes("Market Transfer"));
  }
  for (const lang of [undefined, "", "unknown", "pt"]) {
    const h = harness({ lang }); assert.equal(h.effective, "en-GB"); assert.ok(renderToStaticMarkup(await h.run()).includes(en.ratingSum));
  }
});

test("player ranking actual sort, top3/top20, totals, links and inactive commercial paths remain unchanged", async () => {
  const exactCardDeclarations = source.match(/<TouchlineEliteExactCard\b[^>]*>/g) ?? [];
  assert.equal(exactCardDeclarations.length, 4);
  assert.ok(exactCardDeclarations.every(declaration => /\bhideMarketValuePanel\b/.test(declaration)));

  for (const lang of ["en-GB", "pt-BR"]) for (const count of [0, 1, 3, 21]) {
    const h = harness({ lang, count }); const tree = await h.run(), all = nodes(tree), html = renderToStaticMarkup(tree);
    const featured = all.filter(n => n.props.className === "tl-card-rankings-rank"), rows = all.filter(n => n.props.className === "tl-card-rankings-row");
    assert.equal(featured.length, Math.min(count, 3)); assert.equal(rows.length, Math.min(count, 20));
    assert.equal(h.exactCardProps.length, featured.length + rows.length);
    for (const exactCard of h.exactCardProps) {
      assert.equal(exactCard.hideMarketValuePanel, true);
      assert.ok(
        h.roster.some(card => card.name === (exactCard.player as { name: string }).name),
        "the presentation opt-in must preserve the card player data",
      );
    }
    const ids = count === 0 ? [] : [...Array.from({ length: count - 1 }, (_, i) => `row-uuid-${count - 1 - i}`), "row-uuid-0"].slice(0, 20);
    assert.deepEqual(rows.map(n => n.props.id), ids);
    const metrics = all.find(n => n.props.className === "tl-card-rankings-metrics")!;
    const values = nodes(metrics).filter(n => n.type === "strong").map(n => n.props.children);
    assert.deepEqual(values.slice(0, 2), [count, count === 21 ? "190.00" : count === 3 ? "1.00" : "0.00"]);
    for (const zoom of all.filter(n => n.type === h.Zoom)) {
      assert.equal(zoom.props.contractHref, undefined); assert.equal(zoom.props.contractValue, undefined); assert.equal(zoom.props.contractTermLabel, undefined);
      const details = zoom.props.details as { title: string; fields: Array<{ kind?: string; value: string }> };
      const card = h.roster.find(card => card.name === details.title)!;
      assert.ok(card);
      assert.equal(details.fields.find(field => field.kind === "rating-total")?.value, card.seasonTotalRating == null ? "—" : String(card.seasonTotalRating));
    }
    const hrefs = all.filter(n => n.type === "a").map(n => n.props.href as string);
    if (count) {
      assert.ok(html.includes("Official $&amp;&lt;Player")); assert.ok(!html.includes("<Player"));
      assert.ok(hrefs.some(href => href.startsWith("/clubowner?lang=") && href.includes(`lang=${lang}`)));
      assert.ok(hrefs.some(href => href.startsWith("/touchline-clubs/") && href.endsWith(`?lang=${lang}`)));
    }
    assert.ok(!html.includes("Contract player")); assert.ok(!html.includes("Contratar"));
  }
});

test("player ranking preseason, identity authority, metadata and query wait are unchanged", async () => {
  for (const user of [null, { email: "customer@example.test" }, { email: "owner@example.test" }]) {
    const h = harness({ lang: "pt-BR", phase: "unavailable", user });
    const tree = await h.run(); assert.ok(renderToStaticMarkup(tree).includes("Ordem neutra de pré-temporada"));
    const all = nodes(tree), nav = all.find(n => n.type === h.Navigation)!;
    assert.equal(nav.props.surface, user?.email === "owner@example.test" ? "auth" : user ? "authenticated" : "public");
    for (const zoom of all.filter(n => n.type === h.Zoom)) assert.equal(Boolean((zoom.props.details as { cardEngineHref?: string }).cardEngineHref), user?.email === "owner@example.test");
    assert.equal(JSON.stringify(h.exports.metadata), JSON.stringify({ title: "TouchLine Player Cards Ranking" }));
  }
  let release!: (query: { lang?: string }) => void;
  const h = harness({ query: new Promise(resolve => { release = resolve; }) });
  let done = false; const pending = h.run().then(tree => { done = true; return tree; });
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(done, false); assert.deepEqual(h.seen.sort(), ["auth", "catalogue", "ranking"]);
  release({ lang: "en-GB" }); await pending;
  const rejection = new Error("query rejected");
  const fail = harness({ query: Promise.reject(rejection) }); await assert.rejects(fail.run(), error => error === rejection);
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-player-card-rankings")');
  const exported: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(wrapper.getText(tree), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: exported, ...releasePolicy, [call.expression.getText(tree)]: (props: unknown, enabled: boolean) => ({ props, enabled }),
  });
  const invoke = exported.default as (props: unknown) => Promise<{ props: unknown; enabled: boolean }>;
  try {
    for (const flag of [undefined, "false", "TRUE", "true"]) {
      if (flag === undefined) delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED;
      else releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      for (const lang of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
        const props = { searchParams: Promise.resolve({ lang, siteLocalesEnabled: true, draftLocalesEnabled: true, TOUCHLINE_SITE_LOCALES_ENABLED: "true" }) };
        const result = await invoke(props);
        assert.equal(result.props, props, "original route props are forwarded unchanged");
        assert.equal(result.enabled, flag === "true", lang);
      }
    }
  } finally { delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});
