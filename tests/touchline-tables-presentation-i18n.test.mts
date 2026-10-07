import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as performance from "../lib/touchlineArena/player-performance-i18n.ts";
import * as clubs from "../lib/touchlineArena/demo-data.ts";
import * as coaches from "../lib/touchlineArena/live-coaches.ts";
import * as slots from "../lib/touchlineArena/coach-card.ts";
import * as tiers from "../lib/touchlineArena/card-rules.ts";
import * as round from "../lib/touchlineArena/arena-fixture-round.ts";
import * as pitch from "../lib/touchlineArena/top-eleven-broadcast-layout.ts";
import * as rankingPoints from "../lib/touchlineArena/ranking-points-i18n.ts";
import { getTouchLineRankingsCopy } from "../lib/touchlineArena/rankings-i18n.ts";
import { getTouchlineTablesPresentationCopy } from "../lib/touchlineArena/tables-presentation-i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
type Locale = typeof locales[number];
const load = () => import("../lib/touchlineArena/tables-presentation-i18n.ts");
const clientSource = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../app/rankings/touchline-tables.module.css", import.meta.url), "utf8");
const en = {
  incompleteSelection: "The published selection does not yet resolve all 11 canonical cards; no partial XI is shown.",
  topCoachEyebrow: "NO. 1 COACH", bestCoach: "Best coach", topCoachDescription: "Current leader from official season results.", seasonLeader: "SEASON LEADER",
  coachRankingEyebrow: "SEASON RANKING", bestCoaches: "Best coaches", coachRankingDescription: "Top 7 by canonical points. Ties use wins, away wins and canonical identity.", coachStandings: "Coach standings",
  wins: "Wins", winsShort: "W", draws: "Draws", drawsShort: "D", losses: "Losses", lossesShort: "L",
  podiumEyebrow: "OVERALL PODIUM", podiumTitle: "Season Top 3 Cards", podiumDescription: "The three highest accumulated Ratings, updated automatically.",
  loadingRankings: "Loading rankings…", positionHeading: "POS", clubHeading: "CLUB", pointsHeading: "POINTS",
  matchweek: "Matchweek", matchweekPending: "Matchweek awaiting provider", seasonHighlights: "Season highlights", loadingMatchweek: "Loading matchweek…",
};
const pt = {
  incompleteSelection: "A seleção publicada ainda não resolve os 11 cards canônicos; nenhuma seleção incompleta é exibida.",
  topCoachEyebrow: "TREINADOR Nº 1", bestCoach: "Melhor treinador", topCoachDescription: "Líder atual pelos resultados oficiais da temporada.", seasonLeader: "LÍDER DA TEMPORADA",
  coachRankingEyebrow: "RANKING DA TEMPORADA", bestCoaches: "Melhores treinadores", coachRankingDescription: "Top 7 pelos pontos canônicos. Empates seguem vitórias, vitórias fora e identidade canônica.", coachStandings: "Classificação dos treinadores",
  wins: "Vitórias", winsShort: "V", draws: "Empates", drawsShort: "E", losses: "Derrotas", lossesShort: "D",
  podiumEyebrow: "PÓDIO GERAL", podiumTitle: "Top 3 Cards da Temporada", podiumDescription: "Os três maiores Ratings acumulados, atualizados automaticamente.",
  loadingRankings: "Carregando classificações…", positionHeading: "POS", clubHeading: "CLUBE", pointsHeading: "PONTOS",
  matchweek: "Rodada", matchweekPending: "Rodada aguardando provider", seasonHighlights: "Destaques da temporada", loadingMatchweek: "Carregando rodada…",
};
const draftLoading = ["Cargando clasificaciones…", "Caricamento delle classifiche…", "Chargement des classements…", "جارٍ تحميل الترتيبات…", "Sıralamalar yükleniyor…", "Ranglisten werden geladen…"];
const draftPositionHeadings = ["POS", "POS", "POS", "المركز", "POZ", "POS"];
const escape = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));
function compile(source: string, modules: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (name: string) => {
      if (name === "@/lib/touchlineArena/site-locales-release") return releasePolicy;
      if (Object.hasOwn(modules, name)) return modules[name];
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.startsWith("@/components/")) return { default: (props: { children?: React.ReactNode }) => React.createElement("div", null, props.children) };
      return new Proxy({}, { get: () => () => assert.fail(`Unexpected collaborator ${name}`) });
    }, fetch: () => assert.fail("No requests"),
  }); return exports;
}
type Element = React.ReactElement<Record<string, unknown>>;
function nodes(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as React.ReactNode)] : []);
}
// Card/zoom internals are outside this slice. Preserve the actual wrapper tree,
// callbacks, positions and card props, but do not relaunch their own SSR suites.
function cardBoundary(node: React.ReactNode): React.ReactNode {
  return React.Children.map(node, child => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return child;
    if (typeof child.type === "function" && child.type.name === "TablePlayerCardZoom") return React.createElement("i", { "data-card-id": (child.props.card as { id: string }).id });
    return React.cloneElement(child, {}, cardBoundary(child.props.children as React.ReactNode));
  });
}
function html(node: React.ReactNode) { return renderToStaticMarkup(React.createElement(React.Fragment, null, cardBoundary(node))); }

test("public tables card renders suppress the value panel without changing their controls", () => {
  const cards = clientSource.match(/<TouchlineEliteExactCard\b[\s\S]*?\/>/g) ?? [];

  assert.equal(cards.length, 1);
  assert.match(cards[0], /\bhideMarketValuePanel\b/);
  assert.match(cards[0], /showCardActions=\{expanded\}/);
  assert.match(cards[0], /showSocialMetrics=\{expanded\}/);
});

async function harness(locale: Locale = "en-GB", draftLocalesEnabled = false, sentinel = false) {
  const effective = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const calls: string[] = [];
  const presentation = sentinel ? { getTouchlineTablesPresentationCopy: (value: string) => { calls.push(value); return Object.fromEntries(Object.keys(en).map(key => [key, `${key}:$&<>`])); } }
    : { getTouchlineTablesPresentationCopy: (value: string) => getTouchlineTablesPresentationCopy(value, draftLocalesEnabled) };
  const copy = getTouchLineRankingsCopy(locale, draftLocalesEnabled);
  const shared = {
    react: React, "react/jsx-runtime": jsx, "lucide-react": icons,
    "next/image": { default: (props: { src: string; alt: string }) => React.createElement("img", { src: props.src, alt: props.alt }) },
    "@/lib/touchlineArena/tables-presentation-i18n": presentation,
    "@/lib/touchlineArena/player-performance-i18n": { getTouchlinePlayerPerformanceCopy: (value: string, enabled = false) => sentinel ? { currentSeason: "currentSeason:$&<>" } : performance.getTouchlinePlayerPerformanceCopy(value, enabled) },
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale },
    "@/lib/touchlineArena/rankings-i18n": { getTouchLineRankingsCopy: () => copy },
    "@/lib/touchlineArena/demo-data": clubs, "@/lib/touchlineArena/live-coaches": coaches,
    "@/lib/touchlineArena/coach-card": slots, "@/lib/touchlineArena/card-rules": tiers,
    "@/lib/touchlineArena/coach-ranking-gems": { touchlineCoachRankingGem: () => null },
    "@/lib/touchlineArena/coach-ranking-club": { touchlineCoachRankingClubLogo: () => null },
    "@/lib/touchlineArena/top-eleven-broadcast-layout": pitch,
    "@/lib/touchlineArena/ranking-points-i18n": rankingPoints,
  };
  const client = compile(clientSource, shared);
  const empty = { phase: "unavailable", rows: [], snapshotId: null, seasonId: null, scoringVersion: null, fixtureIds: [] };
  const rows = Array.from({ length: 9 }, (_, index) => ({ coachProviderId: coaches.TOUCHLINE_LIVE_COACHES[index].coach.providerId, rank: index + 1, coachName: `Official $&<Coach${index}>`, clubName: "Official $&<Club>", wins: 0, draws: 2, losses: 3, touchlinePoints: 0, home: { wins: 0, draws: 1, losses: 2, touchlinePoints: 0 }, away: { wins: 0, draws: 1, losses: 1, touchlinePoints: 0 } }));
  const ranked = { ...empty, phase: "ranked", rows, snapshotId: "snapshot", seasonId: "season", scoringVersion: "version" };
  const render = (name: string, props: Record<string, unknown> = {}) => (client[name] as (props: Record<string, unknown>) => Element)({ locale: effective, draftLocalesEnabled, copy, canEditCardEngine: false, ...props });
  const page = compile(`${pageSource}\nexports.RoundBadge = RoundBadge; exports.BestXiPending = BestXiPending; exports.SportingFrame = SportingFrame;`, {
    ...shared, "./touchline-tables-client": client,
    "@/lib/touchlineArena/arena-fixture-round": round,
    "@/components/touchline/cards/TouchlineCardLeadershipProvider": { TouchlineCardLeadershipProvider: ({ children }: { children: React.ReactNode }) => children },
    "@/lib/touchlineArena/card-leadership-authority": { buildTouchlineCardLeadershipValue: () => ({}) },
  });
  return { client, page, calls, effective, copy, empty, ranked, render };
}

test("tables new getter is consumed by the actual podium pending component", async () => {
  const h = await harness("pt-BR", false, true);
  assert.ok(html(h.render("TouchlineRankingPodiumPending")).includes("podiumTitle:$&amp;&lt;&gt;"));
  assert.ok(h.calls.length > 0);
});

test("tables keeps logical properties inside a fixed physical LTR page without mirrored leader decoration", () => {
  for (const pattern of [
    /\.summary div \+ div \{ border-inline-start:/,
    /\.sectionHeading > span \{[^}]*text-align: end;/,
    /\.positionLabel \{[^}]*inset-inline-end:/,
    /\.podiumRank \{[^}]*inset-inline-start:/,
    /\.clubOwnerTableHeader span:last-child \{ text-align: end;/,
    /\.topCoachIdentity \{[^}]*text-align: start;/,
  ]) assert.match(stylesSource, pattern);
  assert.match(pageSource, /<main className=\{styles\.page\} dir="ltr">/);
  assert.doesNotMatch(stylesSource, /:global\(\[dir="rtl"\]\)\s*\.coachList/);
  assert.match(stylesSource, /\.coachList li:first-child \{[^}]*linear-gradient\(90deg,[^}]*inset 3px 0/);
  assert.match(clientSource, /left: `\$\{point\.x\}%`, top: `\$\{point\.y\}%`/);
  assert.doesNotMatch(stylesSource, /\.positionLabel \{[^}]*\bright:/);
  assert.doesNotMatch(stylesSource, /\.podiumRank \{[^}]*\bleft:/);
  assert.doesNotMatch(stylesSource, /\.clubOwnerTableHeader span:last-child \{ text-align: right;/);
});

test("tables 26-key catalogue keeps exact EN/PT and six unpublished drafts", async () => {
  const mod = await load();
  assert.equal(Object.keys(en).length, 26);
  assert.deepEqual(mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES["en-GB"], en);
  assert.deepEqual(mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES["pt-BR"], pt);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES), locales);
  assert.deepEqual(mod.TOUCHLINE_TABLES_PRESENTATION_DRAFT_LOCALES, locales.slice(2)); assert.equal(mod.TOUCHLINE_TABLES_PRESENTATION_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const text = mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[locale];
    assert.deepEqual(Object.keys(text).sort(), Object.keys(en).sort());
    Object.values(text).forEach(value => assert.ok(value.trim()));
    assert.match(text.incompleteSelection, /11/); assert.match(text.coachRankingDescription, /7/); assert.match(text.podiumTitle, /3/);
    assert.deepEqual(mod.getTouchlineTablesPresentationCopy(locale), locale === "pt-BR" ? pt : en);
    assert.deepEqual(mod.getTouchlineTablesPresentationCopy(locale, true), text);
    if (locale !== "en-GB" && locale !== "pt-BR") {
      const draftIndex = locales.indexOf(locale) - 2;
      assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
      assert.equal(text.loadingRankings, draftLoading[draftIndex]);
      assert.equal(text.positionHeading, draftPositionHeadings[draftIndex]);
    }
  }
  for (const locale of [null, undefined, "", "pt", "unknown", "constructor"]) assert.deepEqual(mod.getTouchlineTablesPresentationCopy(locale), en);
});

test("tables actual exported panels consume every presentation key with safe sentinels", async () => {
  const consumed = new Set<string>();
  for (const locale of locales) {
    const h = await harness(locale, true, true);
    const panels = [h.render("default", { highlights: { gameweekBest: { phase: "unavailable", reason: "incomplete-card-catalogue" } } }),
      h.render("TouchlineFeaturedCoach", { coachRanking: h.ranked }), h.render("TouchlineCoachRankingTable", { coachRanking: h.ranked }),
      h.render("TouchlineRankingPodiumPending"), h.render("TouchlineRankingEnding", { touchLineEnglandTable: [] })];
    let output = panels.map(html).join("");
    const Badge = h.page.RoundBadge as (props: object) => Promise<Element>;
    output += html(await Badge({ fixtures: Promise.resolve([]), locale }));
    output += html(await Badge({ fixtures: Promise.resolve([{ id: "fixture", startsAt: "2099-01-01T12:00:00Z", status: "NS", roundName: "Round $&<9>", homeTeam: { providerId: "1" }, awayTeam: { providerId: "2" } }]), locale }));
    const frame = await (h.page.SportingFrame as (props: object) => Promise<Element>)({ data: { leadership: Promise.resolve([{ phase: "ranked" }, h.ranked]), complete: new Promise(() => {}) }, locale, user: null });
    assert.equal(nodes(frame).find(node => node.props.className === "rankingHighlights")?.props["aria-label"], "seasonHighlights:$&<>");
    consumed.add("seasonHighlights");
    for (const key of Object.keys(en).filter(key => key !== "loadingMatchweek" && key !== "seasonHighlights")) { assert.ok(output.includes(escape(`${key}:$&<>`)), `${locale}:${key}`); consumed.add(key); }
    const coachElement = nodes(panels[1]).find(node => node.props.competition)!;
    assert.equal((coachElement.props.competition as { seasonLabel: string }).seasonLabel, "currentSeason:$&<>");
    assert.ok(output.includes("Official $&amp;&lt;Coach0&gt;")); assert.ok(!output.includes("<Coach0>")); assert.ok(output.includes("positionHeading:$&amp;&lt;&gt;")); assert.ok(output.includes("CLUBOWNER"));
  }
  assert.equal(consumed.size, 25, "loadingMatchweek belongs to the real async page test");
});

test("tables panels consume explicitly opted-in copy, preserving top7 order, zero and absent data", async () => {
  const mod = await load();
  for (const draftLocalesEnabled of [false, true]) for (const locale of locales) {
    const h = await harness(locale, draftLocalesEnabled), copy = mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[h.effective];
    const pending = html(h.render("TouchlineRankingPodiumPending"));
    assert.ok(pending.includes(escape(copy.podiumTitle))); assert.ok(pending.includes(escape(copy.loadingRankings))); assert.ok(pending.includes('aria-busy="true"'));
    for (const state of [h.empty, h.ranked]) {
      const table = html(h.render("TouchlineCoachRankingTable", { coachRanking: state }));
      assert.ok(table.includes(escape(copy.bestCoaches)));
      if (state.phase === "ranked") {
        assert.deepEqual([...table.matchAll(/data-coach-rank="(\d+)"/g)].map(m => Number(m[1])), [1, 2, 3, 4, 5, 6, 7]);
        assert.ok(table.includes(`<abbr title="${escape(copy.wins)}" aria-label="${escape(copy.wins)}">${escape(copy.winsShort)}</abbr>`));
        assert.ok(table.includes("<dd>0</dd>")); assert.ok(!table.includes("Coach7"));
      } else assert.ok(table.includes('role="status"'));
      const featured = h.render("TouchlineFeaturedCoach", { coachRanking: state });
      assert.ok(html(featured).includes(escape(copy.bestCoach)));
      const zoom = nodes(featured).find(node => node.props.competition);
      assert.equal(Boolean(zoom), state.phase === "ranked");
      if (zoom) { assert.equal(zoom.props.showLeadershipCrown, true); assert.equal(zoom.props.publishedTouchlinePoints, 0); assert.ok((zoom.props.profileHref as string).endsWith(`?lang=${h.effective}`)); }
    }
    const incomplete = html(h.render("default", { highlights: { gameweekBest: { phase: "unavailable", reason: "incomplete-card-catalogue" } } }));
    assert.ok(incomplete.includes(escape(copy.incompleteSelection))); assert.ok(!incomplete.includes("data-best-eleven-player"));
    const ordinary = html(h.render("default", { highlights: { gameweekBest: { phase: "unavailable", reason: "no-published-selection" } } }));
    assert.ok(!ordinary.includes(escape(copy.incompleteSelection)));
    const podium = html(h.render("TouchlineRankingPodium", { highlights: { topPlayerCards: [{ id: "uuid", canonicalPlayerId: "canonical", shortName: "$&<Player>", clubName: "Official club", position: "GK", editorialCard: null }] } }));
    assert.ok(podium.includes('data-player-podium-rank="1"')); assert.ok(podium.includes("$&amp;&lt;Player&gt;"));
    assert.ok(html(h.render("TouchlineRankingPodium", { highlights: { topPlayerCards: [] } })).includes('role="status"'));
  }
});

test("tables actual RoundBadge preserves canonical names, missing and conflicting rounds", async () => {
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const h = await harness(locale), Badge = h.page.RoundBadge as (props: object) => Promise<Element>;
    const one = { id: "a", startsAt: "2099-01-01T12:00:00Z", status: "NS", roundName: "  9 $&<R>  ", homeTeam: { providerId: "1" }, awayTeam: { providerId: "2" } };
    assert.ok(html(await Badge({ fixtures: Promise.resolve([one]), locale })).includes(escape(`${locale === "pt-BR" ? "Rodada" : "Matchweek"} 9 $&<R>`)));
    for (const fixtures of [[], [{ ...one, roundName: null }], [one, { ...one, id: "b", roundName: "10", homeTeam: { providerId: "3" }, awayTeam: { providerId: "4" } }]]) assert.ok(html(await Badge({ fixtures: Promise.resolve(fixtures), locale })).includes(locale === "pt-BR" ? "Rodada aguardando provider" : "Matchweek awaiting provider"));
  }
});

test("tables ready XI preserves eleven coordinates and identities while totals distinguish zero from null", async () => {
  const positions = [["gk", 16, 50], ["lb", 36, 18], ["lcb", 36, 39], ["rcb", 36, 61], ["rb", 36, 82], ["lcm", 57, 26], ["cm", 57, 50], ["rcm", 57, 74], ["lw", 78, 20], ["st", 78, 50], ["rw", 78, 80]] as const;
  for (const locale of locales) {
    const h = await harness(locale, true);
    const selection = [...positions.map(([id]) => ({ slot: { id, label: id.toUpperCase() }, card: { id, canonicalPlayerId: `canonical-${id}`, shortName: `$&<${id}>` } })), { slot: { id: "unknown", label: "UNKNOWN" }, card: { id: "unknown", canonicalPlayerId: "do-not-project", shortName: "Unknown" } }];
    const tree = h.render("default", { highlights: { gameweekBest: { phase: "ready", slots: selection } } });
    const articles = nodes(tree).filter(n => n.props["data-best-eleven-player"]);
    assert.equal(articles.length, 11);
    positions.forEach(([id, x, y], index) => {
      assert.equal(articles[index].props["data-best-eleven-player"], `canonical-${id}`);
      assert.equal(articles[index].props["data-best-eleven-position"], id.toUpperCase());
      assert.equal((articles[index].props.style as React.CSSProperties).left, `${x}%`);
      assert.equal((articles[index].props.style as React.CSSProperties).top, `${y}%`);
    });
    const output = html(tree);
    assert.ok(output.includes("$&amp;&lt;gk&gt;")); assert.ok(!output.includes("do-not-project"));
    for (const total of [0, null]) {
      const hero = h.render("TouchlineRankingsHero", { totalPublishedCards: total, totalRankedCards: total, rankMode: "mode-$&<>" });
      assert.deepEqual(nodes(hero).filter(n => n.type === "dd").map(n => n.props.children), [total ?? "—", total ?? "—", "mode-$&<>"]);
    }
    const owner = html(h.render("TouchlineRankingEnding", { touchLineEnglandTable: [{ id: "owner", name: "$&<Owner>", clubName: "$&<Club>", avatarUrl: null, touchlinePoints: 0 }] }));
    assert.ok(owner.includes("<b>01</b>")); assert.ok(owner.includes("$&amp;&lt;Owner&gt;")); assert.ok(owner.includes("<strong>0</strong>"));
    const Pending = h.page.BestXiPending as (props: object) => Element;
    const pending = html(Pending({ locale, copy: h.copy }));
    assert.ok(pending.includes(escape((await load()).TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[locale].loadingRankings)));
  }
});

test("tables actual async page consumes loading labels without changing query or auth scheduling", async () => {
  for (const lang of [...locales, "", "unknown", undefined]) {
    const calls: string[] = []; let release!: (user: object) => void;
    const auth = new Promise<object>(done => { release = done; });
    const presentation = { getTouchlineTablesPresentationCopy: (value: string) => { calls.push(`copy:${value}`); return { loadingRankings: "rankings:$&<>", loadingMatchweek: "matchweek:$&<>" }; } };
    const modules = {
      react: React, "react/jsx-runtime": jsx, "@/lib/touchlineArena/i18n": i18n,
      "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale },
      "@/lib/touchlineArena/tables-presentation-i18n": presentation,
      "@/lib/touchlineArena/ranking-load-diagnostics": { createRankingLoadDiagnostics: () => ({ measure: (_key: string, fn: () => unknown) => fn(), seal: () => undefined }) },
      "@/lib/touchlineArena/card-ranking-server": { loadTouchLineActiveRanking: async () => { calls.push("ranking"); return {}; }, loadTouchLinePublishedTopEleven: async () => { calls.push("xi"); return null; } },
      "@/lib/touchlineArena/ranked-card-catalog-server": { loadTouchLineRankedCardCatalog: async () => { calls.push("catalogue"); return []; } },
      "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => { calls.push("coach"); return {}; } },
      "@/lib/touchlineArena/card-publication-read-model": { countTouchlinePublishedPlayerCards: async () => { calls.push("count"); return 0; } },
      "@/lib/football-data/fixture-schedule-store": { readPublicCompetitionFixtures: async () => { calls.push("fixtures"); return []; } },
      "@/lib/touchlineArena/rankings-highlight-projection": { projectTouchlineRankingsHighlights: () => ({}) },
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: () => { calls.push("auth"); return auth; } } }) },
      "@/lib/admin/owner": { isOwnerEmail: () => false },
      "@/lib/touchlineArena/global-navigation": { resolveTouchlineGlobalNavigationSurface: () => "public" },
    };
    const Page = compile(pageSource, modules).default as (props: object) => Promise<Element>;
    let settled = false; const pending = Page({ searchParams: Promise.resolve({ lang }) }).then(tree => { settled = true; return tree; });
    await new Promise<void>(done => setImmediate(done)); assert.equal(settled, false);
    assert.deepEqual(calls.filter(x => !x.startsWith("copy:")).sort(), ["auth", "catalogue", "coach", "count", "fixtures", "ranking", "xi"]);
    release({ data: { user: null } }); const tree = await pending;
    const suspense = nodes(tree).filter(n => n.type === React.Suspense);
    assert.equal(suspense.length, 2); assert.equal(html(suspense[0].props.fallback as React.ReactNode).includes("matchweek:$&amp;&lt;&gt;"), true);
    assert.equal(html(suspense[1].props.fallback as React.ReactNode).includes("rankings:$&amp;&lt;&gt;"), true);
    assert.ok(calls.includes(`copy:${i18n.normalizeTouchLineLocale(lang)}`));
  }
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/rankings")');
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
