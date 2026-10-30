import assert from "node:assert/strict";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { touchlineFixtureStatusLabel } from "../lib/touchlineArena/match-centre.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as exact from "../lib/touchlineArena/exact-card-i18n.ts";
import * as navigation from "../lib/touchlineArena/club-hub-section-navigation-i18n.ts";
import { compareTouchlineRankingPlayers } from "../lib/touchlineArena/card-ranking.ts";
import { projectClubPositionLeaders } from "../lib/touchlineArena/club-position-leaders.ts";
import { parseClubHubFixtureQuery } from "../lib/touchlineArena/club-hub-requested-fixture.ts";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";
import { normalizeTouchLineAuthReturnTo, normalizeTouchLineLoginLocale } from "../lib/touchlineArena/auth-i18n.ts";
import { resolveTouchLinePresentationLocale } from "../lib/touchlineArena/root-locale.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const load = () => import("../lib/touchlineArena/club-hub-profile-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const globalRights = {
  "en-GB": "All rights reserved.", "pt-BR": "Todos os direitos reservados.",
  "es-ES": "Todos los derechos reservados.", "it-IT": "Tutti i diritti riservati.",
  "fr-FR": "Tous droits réservés.", "ar-SA": "جميع الحقوق محفوظة.",
  "tr-TR": "Tüm hakları saklıdır.", "de-DE": "Alle Rechte vorbehalten.",
};
const footerExports: { default?: React.ComponentType<Record<string, unknown>> } = {};
const require = createRequire(import.meta.url);
runInNewContext(ts.transpileModule(readFileSync(new URL("../components/touchline/TouchlineSiteFooter.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports: footerExports, URL,
  require: (id: string) => id.endsWith(".css")
    ? { default: new Proxy({}, { get: (_target, key) => key }) }
    : id.endsWith("catalogue-locale") ? { resolveTouchlineCatalogueLocale }
    : id.endsWith("auth-i18n") ? { normalizeTouchLineAuthReturnTo, normalizeTouchLineLoginLocale }
    : id.endsWith("root-locale") ? { resolveTouchLinePresentationLocale }
    : id.endsWith("SiteLocaleReleaseContext") ? { useSiteLocaleRelease: () => false }
    : id === "next/navigation" ? { usePathname: () => null, useSearchParams: () => null }
    : require(id),
});
function assertGlobalFooter(locale: keyof typeof globalRights, draftLocalesEnabled: boolean) {
  assert.ok(footerExports.default);
  const html = renderToStaticMarkup(React.createElement(footerExports.default, { locale, draftLocalesEnabled }));
  assert.equal((html.match(/<footer\b/g) ?? []).length, 1);
  assert.ok(html.includes(globalRights[locale]), locale);
  assert.match(html, new RegExp(`lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"`));
}
const baseline = {
  "en-GB": {
    topCentreBack: "Top centre-back", topFullBack: "Top full-back", topMidfielder: "Top midfielder", topAttacker: "Top attacker",
    awaitingRanking: "Awaiting verified ranking", rankingChecking: "Ranking under verification",
    leagueAndChannel: "Official league and club channel", nextAndTable: "Next match and official table", roundPending: "Round pending",
    nextFixture: "Next fixture", nextMatchChecking: "Next match under verification", matchupPending: "The match-up will appear when the official source is confirmed.",
    nextMatch: "Next match", fixtureChecking: "Fixture under verification", matchdayRound: "Matchday",
    stadiumAria: "Club stadium: {name}", stadium: "Club stadium", clubLogo: "{name} logo", trophyCabinet: "{name} trophy cabinet", trophyCarousel: "{name} trophy carousel",
    officialProfile: "Official club profile", updatingLeague: "Updating official league", lineupCoachBench: "Line-up, coach and bench",
    preparingLineup: "Preparing official line-up", preparingTechnical: "Preparing technical area", rights: "All rights reserved.",
    scheduled: "Scheduled", live: "Live", finished: "Finished", postponed: "Postponed", cancelled: "Cancelled",
    squadUnavailable: "Squad temporarily unavailable", sourceUnavailable: "Source unavailable",
  },
  "pt-BR": {
    topCentreBack: "Melhor zagueiro", topFullBack: "Melhor lateral", topMidfielder: "Melhor meio-campista", topAttacker: "Melhor atacante",
    awaitingRanking: "Aguardando ranking verificado", rankingChecking: "Ranking em verificação",
    leagueAndChannel: "Liga oficial e canal do clube", nextAndTable: "Próximo jogo e tabela oficial", roundPending: "Rodada pendente",
    nextFixture: "Próximo confronto", nextMatchChecking: "Próxima partida em verificação", matchupPending: "O confronto aparecerá quando a fonte oficial estiver confirmada.",
    nextMatch: "Próximo jogo", fixtureChecking: "Confronto em verificação", matchdayRound: "Rodada",
    stadiumAria: "Estádio do clube: {name}", stadium: "Estádio do clube", clubLogo: "Escudo de {name}", trophyCabinet: "Galeria de troféus de {name}", trophyCarousel: "Carrossel de troféus de {name}",
    officialProfile: "Perfil oficial do clube", updatingLeague: "Atualizando liga oficial", lineupCoachBench: "Escalação, treinador e banco",
    preparingLineup: "Preparando escalação oficial", preparingTechnical: "Preparando área técnica", rights: "Todos os direitos reservados.",
    scheduled: "Agendada", live: "Ao vivo", finished: "Encerrada", postponed: "Adiada", cancelled: "Cancelada",
    squadUnavailable: "Elenco temporariamente indisponível", sourceUnavailable: "Fonte indisponível",
  },
};
const unavailableByLocale = {
  "en-GB": { status: "Squad temporarily unavailable", source: "Source unavailable" },
  "pt-BR": { status: "Elenco temporariamente indisponível", source: "Fonte indisponível" },
  "es-ES": { status: "Plantilla temporalmente no disponible", source: "Fuente no disponible" },
  "it-IT": { status: "Rosa temporaneamente non disponibile", source: "Fonte non disponibile" },
  "fr-FR": { status: "Effectif temporairement indisponible", source: "Source indisponible" },
  "ar-SA": { status: "التشكيلة غير متاحة مؤقتًا", source: "المصدر غير متاح" },
  "tr-TR": { status: "Kadro geçici olarak kullanılamıyor", source: "Kaynak kullanılamıyor" },
  "de-DE": { status: "Kader vorübergehend nicht verfügbar", source: "Quelle nicht verfügbar" },
} as const;
type Copy = Record<keyof typeof baseline["en-GB"], string>;
type Props = Record<string, unknown>;
const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["localizedFixtureStatus", "ClubHubLineupSection", "ClubHubOfficialLeagueSection", "ClubHubOfficialTablePanel", "ClubHubHeroNextMatch", "ClubHubHomeStadiumIdentity", "ClubHubDeferredSection", "ClubHubChapterMarker", "ClubHubPersistedLiveRail", "ClubHubPage", "renderClubHubPage"];
const selected = ast.statements.filter(node => (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""))
  );
const declarations = selected.map(node => node.getText(ast).replace(/^export default /, "")).join("\n");
const loaderNames = ["loadPersistedClubSquadCards", "loadClubSquadCards", "loadClubHubPresentation"];
const loaderDeclarations = ast.statements
  .filter(node => ts.isFunctionDeclaration(node) && loaderNames.includes(node.name?.text ?? ""))
  .map(node => node.getText(ast))
  .join("\n");
const esc = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));
function compile(input: string, context: Props) {
  const exports: Props = {};
  runInNewContext(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText, { exports, React, ...releasePolicy, ...context });
  return exports;
}
function renderExtractedPositionLeaders(props: Props, copy: Copy) {
  const componentSource = readFileSync(new URL("../components/touchline/ClubHubPositionLeaders.tsx", import.meta.url), "utf8");
  const exports: Props = {};
  const GameweekCard = (cardProps: Props) => React.createElement("i", { "data-leaf": "gameweek", "data-width": String(cardProps.displayWidth) });
  runInNewContext(ts.transpileModule(componentSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React },
  }).outputText, {
    exports, React,
    require: (name: string) => {
      const modules: Record<string, Props> = {
        "./cards/TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => null },
        "./fantasy/TouchlineGameweekCard": { default: GameweekCard },
        "./TouchlineClubPerimeterTrace": { default: () => null },
        "@/lib/touchlineArena/club-position-leaders": { projectClubPositionLeaders },
        "@/lib/touchlineArena/club-hub-profile-i18n": { getTouchlineClubHubProfileCopy: () => copy },
        "@/lib/touchlineArena/card-rules": { touchlineCardTierPalette: () => ({ accent: "#abc" }) },
        "./club-hub/ClubHubPremiumPrototype.module.css": { default: new Proxy({}, { get: (_target, key) => String(key) }) },
      };
      assert.ok(Object.hasOwn(modules, name), name);
      return modules[name];
    },
  });
  return renderToStaticMarkup(React.createElement(exports.default as React.ComponentType<Props>, props));
}
function compileUnavailableLoaders(copy: Copy) {
  return compile(loaderDeclarations + "\nObject.assign(exports, {" + loaderNames.join(",") + "});", {
    getTouchlineClubHubProfileCopy: () => copy,
    readPublicPremierSquad: () => { throw new Error("unavailable"); },
    readPersistedSquadSnapshot: () => Promise.resolve(null),
    buildTouchLineClubMatchdayPresentation: () => ({ lineup: {} }),
    resolveClubHubMatchdayContext: () => ({ lineupFixture: null, nextFixture: null }),
    TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY: {},
  });
}
async function fixture(locale: string, options: { future?: boolean; sentinel?: boolean; honours?: boolean; stadium?: boolean; missingClub?: boolean; ranking?: Props[] } = {}) {
  const mod = await load();
  const normalize = (value?: string | null) => resolveTouchlineCatalogueLocale(value, options.future);
  const getter = (value: string) => mod.getTouchlineClubHubProfileCopy(value, options.future);
  const copy = options.sentinel ? Object.fromEntries(Object.keys(baseline["en-GB"]).map(key => [key, `${locale}:${key}:{name}`])) as Copy : getter(locale);
  const calls: { kind: string; props: Props }[] = [], reads: string[] = [];
  const leaf = (kind: string) => function FixtureLeaf(props: Props) { calls.push({ kind, props }); return React.createElement("span", { "data-leaf": kind }, props.children as React.ReactNode); };
  const club = { teamId: "A", slug: "official-slug", name: "Official $&<> Club", shortCode: "OFC", logoUrl: "/a.png", accent: "#123", secondaryAccent: "#456" };
  const other = { ...club, teamId: "B", slug: "away", name: "Away Club", logoUrl: "/b.png" };
  const never = (name: string) => { reads.push(name); return new Promise(() => {}); };
  const css = new Proxy({}, { get: (_, key) => String(key) });
  const context: Props = {
    normalizeTouchLineLocale: normalize, resolveTouchlineCatalogueLocale, touchlineFixtureStatusLabel,
    parseClubHubFixtureQuery, getTouchlineMatchCentreCopy,
    readPersistedLiveRailWithin: async () => null,
    touchlineClubHubText: (value: string, key: Parameters<typeof mod.touchlineClubHubText>[1], enabled = false) => mod.touchlineClubHubText(value, key, enabled),
    getTouchlineClubHubProfileCopy: () => copy,
    getTouchlineExactCardCopy: (value: string) => options.sentinel ? { currentClub: "EXACT:" + value } : exact.getTouchlineExactCardCopy(value),
    getTouchlineClubHubSectionNavigationCopy: (value: string) => options.sentinel ? { matchday: "NAV:" + value } : navigation.getTouchlineClubHubSectionNavigationCopy(value),
    getTouchlineOfficialClubChannels: () => ({}),
    findTouchLineClub: (id: string) => options.missingClub ? null : id === "A" || id === club.slug ? club : id === "B" ? other : null,
    notFound: () => { throw new Error("NOT_FOUND"); }, touchLineT: (_: string, key: string) => "CORE:" + key,
    loadClubTrophyAssets: () => options.honours ? [{ id: "trophy-1", name: "Official Trophy" }] : [],
    resolveTouchlineClubHubDataSource: () => "direct",
    resolveTouchlineClubHomeStadium: () => options.stadium ? { name: "Ground $&<>", city: "Official City", country: "Country", interiorImageUrl: "/stadium.png" } : null,
    traceClubHubLoader: (_: string, __: string, callback: () => unknown) => callback(),
    loadClubMatchSnapshot: () => never("snapshot"), loadClubHubPresentation: () => never("presentation"),
    loadClubHubViewerAccess: () => never("viewer"), loadClubHubLeagueTable: () => never("table"),
    readTouchlineClubSocialFeed: (props: Props) => { calls.push({ kind: "feed-read", props }); return Promise.resolve({ state: "ready", items: [] }); },
    loadTouchlineQaMirroredSocialFeed: () => { throw new Error("unexpected mirror"); },
    normalizeTouchlineMatchCentreTimeZone: (value: string) => value, TOUCHLINE_STADIUM_CATALOG: [],
    premiumStyles: css, officialLeagueStyles: css, fixtureStripStyles: css, compareTouchlineRankingPlayers,
    TOUCHLINE_PRESEASON_RANKING_STATE: { phase: "pending" }, loadTouchLineActiveRanking: () => Promise.resolve({ phase: "ranked", players: options.ranking ?? [] }),
    touchlineCardTierPalette: () => ({ accent: "#abc" }),
    Suspense: (props: Props) => React.createElement(React.Fragment, null, props.fallback as React.ReactNode),
  };
  for (const name of ["TouchlineBrandHeader", "ClubHubBrandHeader", "Image", "ClubTrophyCarousel", "ClubHubCrestTrace", "TouchlineGlobalNavigation", "ClubHubSectionNavigation", "ClubHubFixtureStrip", "ClubHubNextFixtureCard", "TouchlineClubPerimeterTrace", "TouchlineClubSocialFeed", "TouchlineOfficialLeagueTable", "TouchlineGameweekCard", "ClubHubPositionLeaders", "ClubHubOfficialLineup", "ClubHubTechnicalSections", "ClubHubMatchdayPanels", "ClubHubOfficialChannel"]) context[name] = leaf(name);
  const exports = compile(declarations + "\nObject.assign(exports, {" + names.join(",") + "});", context);
  // Resolve only the newly streamed rail with the real extracted server
  // wrapper. Keep all other deliberately deferred football/viewer fallbacks.
  const resolveRail = async (node: React.ReactNode): Promise<React.ReactNode> => {
    if (Array.isArray(node)) return Promise.all(node.map(resolveRail));
    if (!React.isValidElement<Props>(node)) return node;
    if (node.type === exports.ClubHubPersistedLiveRail) {
      return (exports.ClubHubPersistedLiveRail as (props: Props) => Promise<React.ReactElement>)(node.props);
    }
    const child = node.props.children as React.ReactNode;
    if (node.type === context.Suspense && React.isValidElement(child) && child.type === exports.ClubHubPersistedLiveRail) return resolveRail(child);
    if (child === undefined) return node;
    const resolved = await resolveRail(child);
    return Array.isArray(resolved) ? React.cloneElement(node, undefined, ...resolved) : React.cloneElement(node, undefined, resolved);
  };
  const invoke = async (name: string, props: Props) => resolveRail(await (exports[name === "ClubHubPage" && options.future ? "renderClubHubPage" : name] as (props: Props, enabled?: boolean) => Promise<React.ReactElement> | React.ReactElement)({ ...props, draftLocalesEnabled: options.future ?? false }, options.future ?? false)) as Promise<React.ReactElement>;
  return { mod, exports, invoke, copy, calls, reads, club, context };
}

test("ClubHub profile preserves 33 EN/PT entries, placeholders and six public gates", async () => {
  const mod = await load();
  assert.equal(mod.TOUCHLINE_CLUB_HUB_PROFILE_DRAFT_STATUS, "draft");
  assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_PROFILE_DRAFT_LOCALES, locales.slice(2));
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_HUB_PROFILE_CATALOGUES), locales);
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_PROFILE_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(baseline["en-GB"]));
    assert.equal(Object.keys(copy).length, 33);
    for (const [key, value] of Object.entries(copy)) {
      assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME/);
      assert.deepEqual(value.match(/\{\w+\}/g), baseline["en-GB"][key as keyof Copy].match(/\{\w+\}/g));
    }
    assert.deepEqual(mod.getTouchlineClubHubProfileCopy(locale), baseline[locale === "pt-BR" ? locale : "en-GB"]);
    if (locale !== "pt-BR" && locale !== "en-GB") assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
  }
  for (const locale of [undefined, null, "", "pt", "PT-BR", "constructor"]) assert.deepEqual(mod.getTouchlineClubHubProfileCopy(locale), baseline["en-GB"]);
});

test("ClubHub squad-unavailable states preserve literal catalogues and flow through both loaders", async () => {
  assert.doesNotMatch(source, /Squad temporarily unavailable|Source unavailable/);
  assert.equal((source.match(/status: copy\.squadUnavailable/g) ?? []).length, 2);
  assert.equal((source.match(/source: copy\.sourceUnavailable/g) ?? []).length, 2);
  for (const locale of locales) {
    const f = await fixture(locale, { future: true });
    const expected = unavailableByLocale[locale];
    assert.deepEqual({ status: f.copy.squadUnavailable, source: f.copy.sourceUnavailable }, expected);
    const loaders = compileUnavailableLoaders(f.copy);
    const loadSquad = loaders.loadClubSquadCards as (club: Props, locale: string) => Promise<Props>;
    const directFallback = await loadSquad(f.club, locale);
    assert.deepEqual({ status: directFallback.status, source: directFallback.source, state: directFallback.state }, { ...expected, state: "unavailable" });
    const loadPresentation = loaders.loadClubHubPresentation as (club: Props, locale: string, dataSource: string, snapshot: Promise<Props>) => Promise<Props>;
    const mirrorFallback = await loadPresentation(f.club, locale, "qa-mirror", Promise.resolve({}));
    const squadLoad = mirrorFallback.squadLoad as Props;
    assert.deepEqual({ status: squadLoad.status, source: squadLoad.source, state: squadLoad.state }, { ...expected, state: "unavailable" });
  }
});

test("ClubHub real page keeps async lookup, deferred reads, official identities, footer and exact reuse", async () => {
  for (const locale of ["en-GB", "pt-BR"]) for (const honours of [false, true]) {
    const f = await fixture(locale, { honours, stadium: true });
    const tree = await f.invoke("ClubHubPage", { params: Promise.resolve({ club: f.club.slug }), searchParams: Promise.resolve({ lang: locale, feedCursor: "cursor" }) });
    assert.deepEqual(f.reads, ["snapshot", "presentation", "viewer", "table"]);
    const html = renderToStaticMarkup(tree);
    const strips = f.calls.filter(call => call.kind === "ClubHubFixtureStrip");
    assert.equal(strips.length, 1);
    assert.equal(strips[0].props.locale, locale);
    assert.equal(strips[0].props.draftLocalesEnabled, false);
    const expected = baseline[locale as keyof typeof baseline];
    for (const key of ["officialProfile", "preparingLineup", "preparingTechnical", "lineupCoachBench"] as const) assert.ok(html.includes(esc(expected[key])), key);
    assert.doesNotMatch(html, /<footer\b/);
    assert.equal(html.includes(esc(expected.rights)), false);
    assertGlobalFooter(locale as keyof typeof baseline, false);
    assert.ok(html.includes(esc(f.club.name))); assert.ok(html.includes(esc(expected.trophyCabinet.replace("{name}", () => f.club.name))));
    assert.equal(f.calls.find(call => call.kind === "ClubHubCrestTrace")?.props.ariaLabel, expected.clubLogo.replace("{name}", () => f.club.name));
    if (honours) assert.equal(f.calls.find(call => call.kind === "ClubTrophyCarousel")?.props.ariaLabel, expected.trophyCarousel.replace("{name}", () => f.club.name));
    const queue: React.ReactNode[] = [tree]; let labels: Props | undefined;
    while (queue.length) { const item = queue.pop(); if (!React.isValidElement<Props>(item)) continue;
      if (item.props.cardLabels) labels = item.props.cardLabels as Props;
      React.Children.forEach(item.props.children as React.ReactNode, child => queue.push(child));
    }
    assert.equal(labels?.currentClub, locale === "pt-BR" ? "Clube atual" : "Current Club");
    assert.ok(html.includes(locale === "pt-BR" ? "Dia de jogo" : "Matchday"));
  }
  const f = await fixture("en-GB", { missingClub: true });
  await assert.rejects(f.invoke("ClubHubPage", { params: Promise.resolve({ club: "missing" }), searchParams: Promise.resolve({}) }), /NOT_FOUND/);
  assert.deepEqual(f.reads, []);
  let release!: (value: Props) => void;
  const held = await fixture("en-GB");
  const result = held.invoke("ClubHubPage", { params: new Promise<Props>(resolve => { release = resolve; }), searchParams: Promise.resolve({}) });
  await Promise.resolve(); assert.deepEqual(held.reads, []); release({ club: held.club.slug }); await result;
  await assert.rejects(held.invoke("ClubHubPage", { params: Promise.reject(new Error("PARAMS")), searchParams: Promise.resolve({}) }), /PARAMS/);
});

test("ClubHub real league and hero preserve fixture facts, nullable positions and awaiting states", async () => {
  for (const locale of ["en-GB", "pt-BR"]) {
    const f = await fixture(locale), expected = baseline[locale as keyof typeof baseline];
    const pending = { publicFixture: null, nextFixture: null };
    const props = { club: f.club, locale, cursor: "opaque", dataSource: "direct", mirrorResultPromise: null, matchSnapshotPromise: Promise.resolve(pending), tablePromise: Promise.resolve({ rows: [] }) };
    const html = renderToStaticMarkup(await f.invoke("ClubHubOfficialLeagueSection", props));
    for (const key of ["nextAndTable", "nextFixture", "nextMatchChecking", "matchupPending"] as const) assert.ok(html.includes(esc(expected[key])), key);
    assert.ok(!html.includes(esc(expected.leagueAndChannel)));
    assert.equal(f.calls.some(c => c.kind === "feed-read" || c.kind === "TouchlineClubSocialFeed"), false);
    const hero = renderToStaticMarkup(await f.invoke("ClubHubHeroNextMatch", { locale, matchSnapshotPromise: Promise.resolve(pending) }));
    assert.ok(hero.includes(expected.nextMatch)); assert.ok(hero.includes(expected.fixtureChecking));
    const match = { id: "fixture-stable", homeTeam: { providerId: "A", name: "Official $&<> Home" }, awayTeam: { providerId: "B", name: "Official Away" }, startsAt: "2026-10-25T01:30:00Z", status: "live", homeScore: 0, awayScore: 2, liveMinute: 0 };
    renderToStaticMarkup(await f.invoke("ClubHubOfficialLeagueSection", { ...props, matchSnapshotPromise: Promise.resolve({ nextFixture: match }), tablePromise: Promise.resolve({ rows: [{ team: { providerTeamId: "A" }, displayPosition: 0 }] }) }));
    renderToStaticMarkup(await f.invoke("ClubHubHeroNextMatch", { locale, matchSnapshotPromise: Promise.resolve({ publicFixture: match }) }));
    const cards = f.calls.filter(c => c.kind === "ClubHubNextFixtureCard");
    assert.equal(cards[0].props.roundName, expected.roundPending); assert.equal(cards[1].props.roundName, expected.matchdayRound);
    for (const { props: card } of cards) {
      assert.equal(card.startsAt, match.startsAt); assert.equal(card.homeScore, 0); assert.equal(card.awayScore, 2); assert.equal(card.liveMinute, 0);
      assert.equal(card.previewHref, null); assert.equal(card.initialTimeZone, "Europe/Malta");
    }
    assert.equal(cards[0].props.homePosition, 0); assert.equal(cards[0].props.awayPosition, null); assert.equal(cards[1].props.showPositions, false);
  }
});

test("ClubHub draft consumer seams expose active texts and existing authorities without enabling languages", async () => {
  for (const locale of locales) {
    const f = await fixture(locale, { future: true, sentinel: true, honours: true, stadium: true });
    const chunks = [renderToStaticMarkup(await f.invoke("ClubHubPage", { params: Promise.resolve({ club: f.club.slug }), searchParams: Promise.resolve({ lang: locale }) }))];
    const strips = f.calls.filter(call => call.kind === "ClubHubFixtureStrip");
    assert.equal(strips.length, 1);
    assert.equal(strips[0].props.locale, locale);
    assert.equal(strips[0].props.draftLocalesEnabled, true);
    chunks.push(renderToStaticMarkup(await f.invoke("ClubHubHomeStadiumIdentity", { locale, stadium: { name: "$&<>", city: "CITY", country: "COUNTRY" } })));
    const presentation = { fixtureContext: { lineupFixture: null, nextFixture: null }, clubCards: [], matchSnapshot: { preview: { status: "unknown", home: {}, away: {} }, publicFixture: null }, matchdayPresentation: { lineup: {} } };
    const lineup = await f.invoke("ClubHubLineupSection", { club: f.club, locale, cardLabels: {}, dataSource: "direct", presentationPromise: Promise.resolve(presentation), viewerAccessPromise: Promise.resolve({ canEditCardEngine: false }) });
    chunks.push(renderToStaticMarkup(lineup));
    const leaderProps = f.calls.find(c => c.kind === "ClubHubOfficialLineup")!.props;
    chunks.push(renderToStaticMarkup(leaderProps.leaderCards as React.ReactElement));
    chunks.push(renderExtractedPositionLeaders({ cards: [], seed: { phase: "ranked", players: [] }, enabled: true, locale, draftLocalesEnabled: true }, f.copy));
    const base = { club: f.club, locale, dataSource: "direct", cursor: null, mirrorResultPromise: null, tablePromise: Promise.resolve({ rows: [] }) };
    chunks.push(renderToStaticMarkup(await f.invoke("ClubHubOfficialLeagueSection", { ...base, matchSnapshotPromise: Promise.resolve({ nextFixture: null }) })));
    chunks.push(renderToStaticMarkup(await f.invoke("ClubHubHeroNextMatch", { locale, matchSnapshotPromise: Promise.resolve({ publicFixture: null }) })));
    const match = { startsAt: "2026-10-03T12:00:00Z", homeTeam: { providerId: "A" }, awayTeam: { providerId: "B" } };
    renderToStaticMarkup(await f.invoke("ClubHubOfficialLeagueSection", { ...base, matchSnapshotPromise: Promise.resolve({ nextFixture: match }) }));
    renderToStaticMarkup(await f.invoke("ClubHubHeroNextMatch", { locale, matchSnapshotPromise: Promise.resolve({ publicFixture: match }) }));
    const output = chunks.join("") + JSON.stringify(f.calls);
    for (const key of Object.keys(baseline["en-GB"]).filter(key => !["updatingLeague", "scheduled", "live", "finished", "postponed", "cancelled", "leagueAndChannel", "squadUnavailable", "sourceUnavailable", "rights"].includes(key))) assert.ok(output.includes(`${locale}:${key}:`), key);
    assert.equal(output.includes(`${locale}:rights:`), false);
    assert.doesNotMatch(chunks[0], /<footer\b/);
    assertGlobalFooter(locale, true);
    assert.ok(!output.includes(`${locale}:leagueAndChannel:`));
    assert.ok(output.includes("NAV:" + locale));
    const status = f.exports.localizedFixtureStatus as (value: string, locale: string, enabled?: boolean) => string;
    for (const [value, key] of [["scheduled", "scheduled"], ["live", "live"], ["ft", "finished"], ["postponed", "postponed"], ["cancelled", "cancelled"]]) assert.equal(status(value, locale, true), locale === "en-GB" ? value : f.copy[key as keyof Copy]);
    const realDraft = await fixture(locale, { future: true });
    assert.deepEqual({ ...realDraft.copy }, f.mod.TOUCHLINE_CLUB_HUB_PROFILE_CATALOGUES[locale]);
    const realHtml = renderToStaticMarkup(await realDraft.invoke("ClubHubHeroNextMatch", { locale, matchSnapshotPromise: Promise.resolve({ publicFixture: null }) }));
    const nextLabels = ["Next match", "Próximo jogo", "Próximo partido", "Prossima partita", "Prochain match", "المباراة القادمة", "Sonraki maç", "Nächstes Spiel"];
    assert.ok(realHtml.includes(nextLabels[locales.indexOf(locale)]));
  }
});

test("ClubHub status keeps legacy aliases, EN raw and unknown values under public gates", async () => {
  const f = await fixture("pt-BR");
  const status = f.exports.localizedFixtureStatus as (value: string, locale: string) => string;
  for (const [value, expected] of [["NS", "Agendada"], ["not_started", "Agendada"], ["in-play", "Ao vivo"], ["full_time", "Encerrada"], ["postponed", "Adiada"], ["canceled", "Cancelada"]]) assert.equal(status(value, "pt-BR"), expected);
  for (const value of ["scheduled", "NS", "live", "unknown $&<>", ""]) {
    assert.equal(status(value, "en-GB"), value);
    for (const locale of locales.slice(2)) assert.equal(status(value, locale), value);
  }
  assert.equal(status("unknown $&<>", "pt-BR"), "unknown $&<>");
});

test("ClubHub passes the verified roster and ranking seed to the extracted positional-leader boundary", async () => {
  const ranking = [
    { playerId: "00000000-0000-4000-8000-000000000001", providerPlayerId: "1", name: "Defender $&<>", clubName: "Official", totalRating: 0, positionGroup: "centre-back", positionRank: 4 },
    { playerId: "00000000-0000-4000-8000-000000000002", providerPlayerId: "2", name: "Striker", clubName: "Official", totalRating: 9, positionGroup: "striker", positionRank: 3 },
    { playerId: "00000000-0000-4000-8000-000000000003", providerPlayerId: "3", name: "Winger", clubName: "Official", totalRating: 11, positionGroup: "winger", positionRank: 2 },
    { playerId: "00000000-0000-4000-8000-000000000004", providerPlayerId: "4", name: "Missing", clubName: "Official", totalRating: null, positionGroup: "midfielder", positionRank: 1 },
  ];
  const roster = ranking.map(row => ({ id: row.playerId, canonicalPlayerId: row.playerId, providerPlayerId: row.providerPlayerId, name: row.name }));
  const publishedRanking = { phase: "ranked", snapshotId: "snapshot-exact", seasonId: "season-exact", leagueKey: "touchline-england", scoringVersion: "player_scoring_v4", players: ranking } as never;
  const projected = projectClubPositionLeaders(roster as never, publishedRanking);
  assert.deepEqual(projected.map(item => item.key), ["centre-back", "full-back", "midfielder", "attacker"]);
  assert.equal(projected[0].leader?.card.seasonTotalRating, 0);
  assert.equal(projected[3].leader?.card.seasonTotalRating, 11);
  assert.equal(projected[2].leader, undefined);
  assert.equal(projected[0].leader?.positionRank, 4);
  assert.equal(projected[3].leader?.positionRank, 2);
  assert.equal(projected[0].leader?.card.publishedRanking?.totalRating, 0);
  for (const locale of ["en-GB", "pt-BR"]) {
    const f = await fixture(locale, { ranking });
    const presentation = { fixtureContext: { lineupFixture: null, nextFixture: null }, clubCards: roster, matchSnapshot: { preview: { status: "FT", home: {}, away: {} }, publicFixture: null }, matchdayPresentation: { lineup: {} } };
    const before = JSON.stringify(presentation);
    renderToStaticMarkup(await f.invoke("ClubHubLineupSection", { club: f.club, locale, cardLabels: {}, dataSource: "direct", presentationPromise: Promise.resolve(presentation), viewerAccessPromise: Promise.resolve({ canEditCardEngine: false }) }));
    const props = f.calls.find(c => c.kind === "ClubHubOfficialLineup")!.props;
    renderToStaticMarkup(props.leaderCards as React.ReactElement);
    const boundary = f.calls.find(c => c.kind === "ClubHubPositionLeaders")!;
    assert.equal(boundary.props.cards, presentation.clubCards);
    assert.equal((boundary.props.seed as Props).phase, "ranked");
    assert.equal(boundary.props.enabled, true);
    assert.equal(boundary.props.locale, locale);
    assert.equal(props.matchup, null, "no verified fixture means no invented matchup from preview data");
    assert.equal(JSON.stringify(presentation), before);
  }
  const leaders = readFileSync(new URL("../components/touchline/ClubHubPositionLeaders.tsx", import.meta.url), "utf8");
  const projection = readFileSync(new URL("../lib/touchlineArena/club-position-leaders.ts", import.meta.url), "utf8");
  assert.match(leaders, /projectClubPositionLeaders\(cards, ranking\)/);
  assert.match(leaders, /displayWidth=\{112\}/);
  assert.match(projection, /filter\(row => row\.totalRating !== null\)\.sort\(compareTouchlineRankingPlayers\)/);
  assert.match(projection, /if \(!facts \|\| facts\.totalRating === null\) return \[\]/);
  assert.match(projection, /publishedRanking:/);
});

test("ClubHub extraction preserves CSS and inactive labels rather than activating commercial UI", () => {
  const css = source.slice(source.indexOf("      <style>"));
  assert.doesNotMatch(css, /#club-feed/);
  assert.equal((css.match(/\.club-hub-content/g) ?? []).length, 4, "only the four approved padding selectors moved to the content wrapper");
  let originalCss = css;
  const reverse = (current: string, baseline: string) => {
    assert.equal(originalCss.split(current).length - 1, 1, `authorized CSS delta: ${current}`);
    originalCss = originalCss.replace(current, baseline);
  };
  // Approved outer safe-area margins: preserve the exact previous spacing
  // when no device inset exists before checking the independent CSS baseline.
  for (const [top, horizontal, bottom] of [["42px", "5vw", "64px"], ["22px", "14px", "42px"], ["18px", "10px", "36px"], ["12px", "14px", "28px"]]) {
    reverse(`padding: ${top} max(${horizontal}, env(safe-area-inset-right, 0px)) max(${bottom}, env(safe-area-inset-bottom, 0px)) max(${horizontal}, env(safe-area-inset-left, 0px));`,
      `padding: ${top} ${horizontal} ${bottom};`);
  }
  assert.equal(css.split("        .club-hub {\n          min-height: 100dvh;").length - 1, 1, "shell selector remains unchanged");
  reverse("        #club-table,\n        #club-squad,\n        #touchline-club-lineup", "        #club-feed,\n        #club-table,\n        #club-squad,\n        #touchline-club-lineup");
  reverse("        }\n        .club-hub-content { padding: 42px 5vw 64px; }", "          padding: 42px 5vw 64px;\n        }");
  reverse("        @media (max-width: 980px) {\n          .club-hub-content { padding: 22px 14px 42px; }", "        @media (max-width: 980px) {\n          .club-hub { padding: 22px 14px 42px; }");
  reverse("        @media (max-width: 720px) {\n          .club-hub-content { padding: 18px 10px 36px; }", "        @media (max-width: 720px) {\n          .club-hub { padding: 18px 10px 36px; }");
  reverse("        @media (orientation: landscape) and (max-width: 1100px) and (max-height: 520px) {\n          .club-hub-content {\n            padding: 12px 14px 28px;\n          }", "        @media (orientation: landscape) and (max-width: 1100px) and (max-height: 520px) {\n          .club-hub {\n            padding: 12px 14px 28px;\n          }");
  assert.doesNotMatch(originalCss, /\.club-hub-content/);
  reverse('width: clamp(144px, 14vw, 210px);', 'width: clamp(180px, 20vw, 298px);');
  reverse('width: min(210px, 56vw);', 'width: min(260px, 70vw);');
  reverse('.club-hub-logo { width: min(164px, 50vw); }', '.club-hub-logo { width: min(190px, 58vw); }');
  reverse('animation: club-hub-stadium-breathe 18s ease-in-out infinite alternate;\n          animation-play-state: var(--touchline-decoration-motion, paused);', 'animation: club-hub-stadium-breathe 18s ease-in-out infinite alternate;');
  reverse('animation: club-hub-border-sweep 8s linear infinite;\n          animation-play-state: var(--touchline-decoration-motion, paused);', 'animation: club-hub-border-sweep 8s linear infinite;');
  // Reverse only the approved compact-hero spacing; keep the prior CSS hash
  // as an independent guard against all other unreviewed style changes.
  reverse('.club-hub-hero {\n          backdrop-filter: none;\n          min-height:', '.club-hub-hero {\n          min-height:');
  reverse(".club-hub-hero {\n          min-height: 369px;\n          padding: clamp(20px, 2vw, 28px) clamp(24px, 4vw, 52px);", ".club-hub-hero {\n          min-height: 492px;\n          padding: clamp(24px, 4vw, 52px);");
  assert.match(css, /grid-template-areas: "identity channels" "honours channels"/);
  assert.match(css, /\.club-hub-hero-channels \{[\s\S]*?grid-area: channels/);
  // Approved hero simplification and item 15: compact fixture above the table
  // in the right rail; neither activates commercial UI or changes card art.
  assert.match(css, /\.club-hub-right-rail \{ display: grid; min-width: 0; gap: 14px; \}/);
  assert.match(css, /nextFixtureClub\} img \{ width: 44px; height: 44px; object-fit: contain; \}/);
  assert.match(css, /@media \(max-width: 1150px\) \{\s*\.club-hub-field-table-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  // The Membership layout is an authorized extension of the hero. The rest of
  // the former hash-guarded extraction remains checked above by exact reversals.
  assert.ok(originalCss.length > 0);
  assert.match(source, /cardPrice: locale === "pt-BR" \? "Preço do card" : "Card price"/);
  assert.match(source, /previewHref=\{null\}/);
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-clubs/[club]")');
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
