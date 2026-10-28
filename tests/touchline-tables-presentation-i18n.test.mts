import * as coachCatalogue from "../lib/touchlineArena/coach-catalogue-contract.ts";
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
import * as positionLabels from "../lib/touchlineArena/position-labels.ts";
import * as ownerStandings from "../lib/touchlineArena/club-owner-standings.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { projectTouchlinePublishedRankingAwards } from "../lib/touchlineArena/published-ranking-awards.ts";
import * as rankingZoom from "../lib/touchlineArena/touchline-ranking-zoom-selection.ts";
import * as rankingSummary from "../lib/touchlineArena/published-ranking-summary.ts";
import { touchlinePlayerLeadershipScope } from "../lib/touchlineArena/player-ranking-leadership.ts";
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
// Source baseline only: MANAGER’S CROWN is the owner's provisional naming;
// matching this catalogue does not constitute rendered visual acceptance.
const en = {
  incompleteSelection: "The published selection does not yet resolve all 11 canonical cards; no partial XI is shown.",
  topCoachEyebrow: "MANAGER’S CROWN", bestCoach: "Best coach", topCoachDescription: "Current leader from official season results.", seasonLeader: "SEASON LEADER",
  coachRankingEyebrow: "SEASON RANKING", bestCoaches: "Best coaches", coachRankingDescription: "Top 7 by canonical points. Ties use wins, away wins and canonical identity.", coachStandings: "Coach standings",
  wins: "Wins", winsShort: "W", draws: "Draws", drawsShort: "D", losses: "Losses", lossesShort: "L",
  podiumEyebrow: "OVERALL PODIUM", podiumTitle: "Season Awards", podiumDescription: "Best Player, Golden Boot and Best Coach. Every award uses its own published authority.",
  bestPlayerEyebrow: "GOLDEN BALL", bestPlayer: "Best player", goldenBootEyebrow: "GOLDEN BOOT", goldenBoot: "Top scorer", goldenBootPreview: "GOLDEN BOOT PREVIEW", goldenBootPreviewDescription: "QA placeholder until verified goals are published", goldenBootPending: "The Golden Boot will appear after its goals authority is published.",
  loadingRankings: "Loading rankings…", positionHeading: "POS", clubHeading: "CLUB", pointsHeading: "POINTS",
  matchweek: "Matchweek", matchweekPending: "Matchweek awaiting provider", seasonHighlights: "Season highlights", loadingMatchweek: "Loading matchweek…",
};
const pt = {
  incompleteSelection: "A seleção publicada ainda não resolve os 11 cards canônicos; nenhuma seleção incompleta é exibida.",
  topCoachEyebrow: "MANAGER’S CROWN", bestCoach: "Melhor treinador", topCoachDescription: "Líder atual pelos resultados oficiais da temporada.", seasonLeader: "LÍDER DA TEMPORADA",
  coachRankingEyebrow: "RANKING DA TEMPORADA", bestCoaches: "Melhores treinadores", coachRankingDescription: "Top 7 pelos pontos canônicos. Empates seguem vitórias, vitórias fora e identidade canônica.", coachStandings: "Classificação dos treinadores",
  wins: "Vitórias", winsShort: "V", draws: "Empates", drawsShort: "E", losses: "Derrotas", lossesShort: "D",
  podiumEyebrow: "PÓDIO GERAL", podiumTitle: "Prêmios da Temporada", podiumDescription: "Melhor Jogador, Artilheiro e Melhor Treinador. Cada prêmio usa sua própria autoridade publicada.",
  bestPlayerEyebrow: "BOLA DE OURO", bestPlayer: "Melhor jogador", goldenBootEyebrow: "CHUTEIRA DE OURO", goldenBoot: "Artilheiro", goldenBootPreview: "PRÉVIA DA CHUTEIRA DE OURO", goldenBootPreviewDescription: "Referência de QA até a publicação dos gols verificados", goldenBootPending: "A Chuteira de Ouro aparecerá após a autoridade de gols ser publicada.",
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

function awardsFixture({ tied = false, noRatedCandidate = false } = {}) {
  const playerId = (index: number) => `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  const catalogue: clubs.ClubOwnerSquadCard[] = Array.from({ length: 2 }, (_, index) => ({
    id: playerId(index), canonicalPlayerId: playerId(index), providerPlayerId: String(100 + index),
    name: index === 0 ? "$&<Player>" : "Published scorer", shortName: index === 0 ? "$&<Player>" : "Published scorer",
    clubName: "Official club", role: "ST", position: "ST", shirtNumber: index + 1, countryCode3: "ENG",
    marketValue: "€1m", touchlinePoints: 999, seasonTotalRating: 999,
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" },
  }));
  const snapshotId = "published-awards";
  const seedRanking: TouchlineActiveRankingState = {
    ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked", snapshotId, seasonId: "season-2026",
    scoringVersion: "player_scoring_v4", coverageStatus: "complete_for_scoring", publishedAt: "2026-10-23T10:00:00Z",
    fixtureIds: ["fixture-1"], expectedFixtureIds: ["fixture-1"], totalScorePoints: 0,
    players: catalogue.slice(0, noRatedCandidate ? 1 : 2).map((card, index) => ({
      playerId: card.canonicalPlayerId!, providerPlayerId: card.providerPlayerId!,
      totalRating: noRatedCandidate ? null : tied ? 10 : 10 - index,
      minutesPlayed: 90, appearances: 1, positionGroup: "striker", positionRank: index + 1,
      groupSize: noRatedCandidate ? 1 : 2, tierKey: "ruby-red", priceTc: tiers.touchlineArenaTierForKey("ruby-red")!.retailPriceTc,
    })),
    leadershipDecision: tied
      ? { status: "tied", scope: touchlinePlayerLeadershipScope(snapshotId), contenders: catalogue.map(card => ({ subjectType: "player", subjectId: card.canonicalPlayerId! })) }
      : { status: "unique-leader", scope: touchlinePlayerLeadershipScope(snapshotId), leader: { subjectType: "player", subjectId: playerId(0) } },
    cardGoals: { source: "published-card-goals-v1", snapshotId,
      rows: catalogue.map((card, index) => ({ playerId: card.canonicalPlayerId!, goals: tied ? 5 : index === 0 ? 0 : 5 })) },
  };
  return { catalogue, seedRanking };
}

// Capture the actual component result under React's SSR dispatcher. Calling a
// hooked component as an ordinary test function would bypass its real contract.
function captureRenderedTree(Component: (props: Record<string, unknown>) => Element, props: Record<string, unknown>): Element {
  let tree: Element | undefined;
  function Capture() { tree = Component(props); return null; }
  renderToStaticMarkup(React.createElement(Capture));
  assert.ok(tree);
  return tree;
}

test("public tables cards preserve football market values without changing their controls", () => {
  const cards = clientSource.match(/<TouchlineEliteExactCard\b[\s\S]*?\/>/g) ?? [];

  assert.equal(cards.length, 1);
  assert.match(cards[0], /\bhideMarketValuePanel=\{false\}/);
  assert.match(cards[0], /showCardActions=\{expanded\}/);
  assert.match(cards[0], /showSocialMetrics=\{expanded\}/);
});

async function harness(locale: Locale = "en-GB", draftLocalesEnabled = false, sentinel = false, authority: { playerRanking: TouchlineActiveRankingState | null } | null = null) {
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
    "@/lib/touchlineArena/coach-catalogue-contract": coachCatalogue,
    "@/lib/touchlineArena/coach-card": slots, "@/lib/touchlineArena/card-rules": tiers,
    "@/lib/touchlineArena/coach-ranking-gems": { touchlineCoachRankingGem: () => null },
    "@/lib/touchlineArena/coach-ranking-club": { touchlineCoachRankingClubLogo: () => null },
    "@/lib/touchlineArena/top-eleven-broadcast-layout": pitch,
    "@/lib/touchlineArena/ranking-points-i18n": rankingPoints,
    "@/lib/touchlineArena/position-labels": positionLabels,
    "@/lib/touchlineArena/club-owner-standings": ownerStandings,
    "@/components/touchline/cards/TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => authority },
    "@/lib/touchlineArena/published-ranking-awards": { projectTouchlinePublishedRankingAwards },
    "@/lib/touchlineArena/touchline-ranking-zoom-selection": rankingZoom,
    "@/lib/touchlineArena/published-ranking-summary": rankingSummary,
  };
  const client = compile(clientSource, shared);
  const empty = { phase: "unavailable", rows: [], snapshotId: null, seasonId: null, scoringVersion: null, fixtureIds: [] };
  // A ranking row must name the canonical club for this historical coach/team pair.
  // Keep adversarial coach names to preserve the original escaping assertions.
  const rows = Array.from({ length: 9 }, (_, index) => ({ coachProviderId: coaches.TOUCHLINE_LIVE_COACHES[index].coach.providerId, rank: index + 1, coachName: `Official $&<Coach${index}>`, clubName: clubs.TOUCHLINE_ENGLAND_CLUBS.find(club => club.teamId === coaches.TOUCHLINE_LIVE_COACHES[index].coach.teamId)!.name, wins: 0, draws: 2, losses: 3, touchlinePoints: 0, home: { wins: 0, draws: 1, losses: 2, touchlinePoints: 0 }, away: { wins: 0, draws: 1, losses: 1, touchlinePoints: 0 } }));
  const ranked = { ...empty, phase: "ranked", rows, snapshotId: "snapshot", seasonId: "season", scoringVersion: "version" };
  const render = (name: string, props: Record<string, unknown> = {}) => {
    const tree = captureRenderedTree(client[name] as (props: Record<string, unknown>) => Element, {
      locale: effective, draftLocalesEnabled, copy, canEditCardEngine: false,
      catalogue: [], seedRanking: TOUCHLINE_PRESEASON_RANKING_STATE, ...props,
    });
    return name === "TouchlineFeaturedCoach" && typeof tree.type === "function"
      ? captureRenderedTree(tree.type as (props: Record<string, unknown>) => Element, tree.props)
      : tree;
  };
  const page = compile(`${pageSource}\nexports.RoundBadge = RoundBadge; exports.BestXiPending = BestXiPending; exports.SportingFrame = SportingFrame;`, {
    ...shared, "./touchline-tables-client": client,
    "@/lib/touchlineArena/arena-fixture-round": round,
    "@/components/touchline/cards/TouchlineCardLeadershipProvider": { TouchlineCardLeadershipProvider: ({ children }: { children: React.ReactNode }) => children },
    "@/lib/touchlineArena/card-leadership-authority": { buildTouchlineCardLeadershipValue: () => ({}) },
  });
  return { client, page, calls, effective, copy, empty, ranked, render };
}

test("hero keeps all eight locales while the shared publication controls ranking membership and mode", async () => {
  const fixture = awardsFixture({ noRatedCandidate: true });
  const catalogueIndex = rankingSummary.buildTouchlineRankingSummaryIndex(fixture.catalogue);
  assert.ok(catalogueIndex);
  const unknownRanking: TouchlineActiveRankingState = { ...fixture.seedRanking, players: [{
    ...fixture.seedRanking.players[0], playerId: "a0000000-0000-4000-8000-000000000003", providerPlayerId: "103",
  }] };
  for (const locale of locales) {
    const copy = getTouchLineRankingsCopy(locale, true);
    for (const { authority, expectedCount, expectedMode } of [
      { authority: null, expectedCount: 9, expectedMode: "Standalone SSR mode" },
      { authority: { playerRanking: fixture.seedRanking }, expectedCount: 1, expectedMode: copy.pointsMode },
      { authority: { playerRanking: unknownRanking }, expectedCount: "—", expectedMode: copy.pointsMode },
      { authority: { playerRanking: null }, expectedCount: 0, expectedMode: copy.marketMode },
    ]) {
      const h = await harness(locale, true, false, authority);
      const tree = h.render("TouchlineRankingsHero", {
        catalogueIndex, totalPublishedCards: 37, totalRankedCards: 9, rankMode: "Standalone SSR mode",
      });
      assert.deepEqual(nodes(tree).filter(node => node.type === "dt").map(node => node.props.children),
        [copy.publishedCards, copy.rankedCards, copy.rankMode], locale);
      assert.deepEqual(nodes(tree).filter(node => node.type === "dd").map(node => node.props.children),
        [37, expectedCount, expectedMode], `${locale}: editorial count stays separate from the accepted sports publication`);
      assert.ok(html(tree).includes(escape(copy.tablesTitle)), locale);
    }
  }
});

test("podium preserves coach and verified goals-only scorer when no player has a published rating", async () => {
  const h = await harness("pt-BR", true);
  const fixture = awardsFixture({ noRatedCandidate: true });
  const output = html(h.render("TouchlineRankingPodium", {
    coachRanking: h.ranked, ...fixture,
  }));
  assert.match(output, /data-ranking-award="best-player"/);
  assert.match(output, /data-ranking-award="golden-boot"/);
  assert.ok(output.includes(`data-card-id="${fixture.catalogue[1].id}"`));
  assert.ok(!output.includes(`data-card-id="${fixture.catalogue[0].id}"`));
  assert.match(output, /Official \$&amp;&lt;Coach0&gt;/);
});

test("podium leaves a tied Ball pending and renders every published joint Golden Boot leader", async () => {
  const h = await harness("en-GB", true);
  const fixture = awardsFixture({ tied: true });
  const tree = h.render("TouchlineRankingPodium", fixture);
  const bestPlayer = nodes(tree).find(node => node.props["data-ranking-award"] === "best-player")!;
  const boot = nodes(tree).find(node => node.props["data-ranking-award"] === "golden-boot")!;
  assert.equal(nodes(bestPlayer).filter(node => node.props.card).length, 0);
  assert.ok(html(bestPlayer).includes('role="status"'));
  assert.deepEqual(nodes(boot).filter(node => node.props.card).map(node => (node.props.card as clubs.ClubOwnerSquadCard).canonicalPlayerId), fixture.catalogue.map(card => card.canonicalPlayerId));
  assert.doesNotMatch(html(tree), /GOLDEN BOOT PREVIEW|QA placeholder|Haaland/);
});

test("podium respects explicit publication withdrawal and never resurrects a seed or preview scorer", async () => {
  const h = await harness("en-GB", true, false, { playerRanking: null });
  const tree = h.render("TouchlineRankingPodium", {
    ...awardsFixture(), highlights: { goldenBootState: "preview", goldenBootCard: { id: "preview-haaland", shortName: "Haaland" } },
  });
  const output = html(tree);
  assert.equal(nodes(tree).filter(node => node.props.card).length, 0);
  assert.ok(output.includes(getTouchlineTablesPresentationCopy("en-GB", true).goldenBootPending));
  assert.doesNotMatch(output, /data-card-id|Haaland|GOLDEN BOOT PREVIEW/);
});

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

test("tables award catalogue keeps exact EN/PT and six unpublished drafts", async () => {
  const mod = await load();
  assert.equal(Object.keys(en).length, 33);
  assert.deepEqual(mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES["en-GB"], en);
  assert.deepEqual(mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES["pt-BR"], pt);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES), locales);
  assert.deepEqual(mod.TOUCHLINE_TABLES_PRESENTATION_DRAFT_LOCALES, locales.slice(2)); assert.equal(mod.TOUCHLINE_TABLES_PRESENTATION_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const text = mod.TOUCHLINE_TABLES_PRESENTATION_CATALOGUES[locale];
    assert.deepEqual(Object.keys(text).sort(), Object.keys(en).sort());
    Object.values(text).forEach(value => assert.ok(value.trim()));
    assert.match(text.incompleteSelection, /11/); assert.match(text.coachRankingDescription, /7/); assert.ok(text.podiumTitle.length > 3);
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

test("tables actual exported panels consume active presentation keys and never render legacy preview copy", async () => {
  const consumed = new Set<string>();
  for (const locale of locales) {
    const h = await harness(locale, true, true);
    const panels = [h.render("default", { highlights: { gameweekBest: { phase: "unavailable", reason: "incomplete-card-catalogue" } } }),
      h.render("TouchlineFeaturedCoach", { coachRanking: h.ranked }), h.render("TouchlineCoachRankingTable", { coachRanking: h.ranked }),
      h.render("TouchlineRankingPodium", { coachRanking: h.ranked, ...awardsFixture() }),
      h.render("TouchlineRankingPodium", { coachRanking: h.ranked }),
      h.render("TouchlineRankingPodiumPending"), h.render("TouchlineRankingEnding", { touchLineEnglandTable: [] })];
    let output = panels.map(html).join("");
    const Badge = h.page.RoundBadge as (props: object) => Promise<Element>;
    output += html(await Badge({ fixtures: Promise.resolve([]), locale }));
    output += html(await Badge({ fixtures: Promise.resolve([{ id: "fixture", startsAt: "2099-01-01T12:00:00Z", status: "NS", roundName: "Round $&<9>", homeTeam: { providerId: "1" }, awayTeam: { providerId: "2" } }]), locale }));
    const frame = await (h.page.SportingFrame as (props: object) => Promise<Element>)({ data: { leadership: Promise.resolve([{ phase: "ranked" }, h.ranked]), complete: new Promise(() => {}) }, locale, user: null });
    assert.equal(nodes(frame).find(node => node.props.className === "rankingHighlights")?.props["aria-label"], "seasonHighlights:$&<>");
    consumed.add("seasonHighlights");
    for (const key of Object.keys(en).filter(key => !["loadingMatchweek", "seasonHighlights", "goldenBootPreview", "goldenBootPreviewDescription"].includes(key))) { assert.ok(output.includes(escape(`${key}:$&<>`)), `${locale}:${key}`); consumed.add(key); }
    for (const legacyKey of ["goldenBootPreview", "goldenBootPreviewDescription"]) assert.ok(!output.includes(escape(`${legacyKey}:$&<>`)), `${locale}:legacy preview copy cannot describe a real award`);
    const coachElement = nodes(panels[1]).find(node => node.props.competition)!;
    assert.equal((coachElement.props.competition as { seasonLabel: string }).seasonLabel, "currentSeason:$&<>");
    assert.ok(output.includes("Official $&amp;&lt;Coach0&gt;")); assert.ok(!output.includes("<Coach0>")); assert.ok(output.includes("positionHeading:$&amp;&lt;&gt;")); assert.ok(output.includes("CLUBOWNER"));
  }
  assert.equal(consumed.size, 30, "loadingMatchweek has its async-page test; two legacy preview keys must remain unrendered");
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
    const podium = html(h.render("TouchlineRankingPodium", awardsFixture()));
    assert.ok(podium.includes('data-ranking-award="best-player"')); assert.ok(podium.includes("$&amp;&lt;Player&gt;"));
    assert.ok(html(h.render("TouchlineRankingPodium")).includes('role="status"'));
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
    const owner = html(h.render("TouchlineRankingEnding", { touchLineEnglandTable: [{ rank: 1, name: "$&<Owner>", touchlinePoints: 0 }] }));
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
      "@/lib/touchlineArena/club-owner-standings-server": { loadClubOwnerStandings: async () => { calls.push("owners"); return { status: "ready", rows: [] }; } },
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
    assert.deepEqual(calls.filter(x => !x.startsWith("copy:")).sort(), ["auth", "catalogue", "coach", "count", "fixtures", "owners", "ranking", "xi"]);
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
