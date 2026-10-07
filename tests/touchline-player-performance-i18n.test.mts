import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { Activity, BarChart3 } from "lucide-react";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as statistics from "../lib/touchlineArena/player-season-statistics.ts";
import * as facts from "../lib/touchlineArena/card-match-fact-i18n.ts";
import * as zoom from "../lib/touchlineArena/card-zoom-i18n.ts";
import * as exact from "../lib/touchlineArena/exact-card-i18n.ts";
import * as appearance from "../lib/touchlineArena/player-appearance-presentation.ts";
import { buildTouchlineVerifiedMatchFactFields } from "../lib/touchlineArena/card-zoom-details.ts";
import { isSeasonPercentage, seasonPercentageFromCounts } from "../lib/football-data/season-statistic-ratios.ts";
import { formatTouchlineProfileTimestamp } from "../lib/touchlineArena/profile-timestamp.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const load = () => import("../lib/touchlineArena/player-performance-i18n.ts");
const loadStatisticLabels = () => import("../lib/touchlineArena/player-statistic-labels.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes(predicate: (node: ts.Node) => boolean, scope: ts.Node = ast) {
  const result: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(scope); return result;
}
const routes = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
  && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
assert.equal(routes.length, 1, "one real default player route");
const wrapperReturn = routes[0].body?.statements.find(ts.isReturnStatement)?.expression;
assert.ok(wrapperReturn && ts.isCallExpression(wrapperReturn));
assert.equal(wrapperReturn.expression.getText(), "renderPlayerProfilePage");
assert.equal(wrapperReturn.arguments[1]?.getText(), 'isTouchLineSiteLocalesEnabled("/touchline-players/[player]")');
const renderer = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "renderPlayerProfilePage");
assert.equal(renderer?.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
const routeBody = renderer?.body;
assert.ok(routeBody);
function initializer(name: string, scope: ts.Node = ast) {
  const found = nodes(node => ts.isVariableDeclaration(node) && node.name.getText() === name, scope) as ts.VariableDeclaration[];
  assert.equal(found.length, 1, name); assert.ok(found[0].initializer); return found[0].initializer.getText();
}
function run(code: string, context: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { ...context, exports, Intl, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; } });
  return exports;
}
const value = (code: string, context: Record<string, unknown>) => run("export const value = (" + code + ");", context).value;
const escape = (text: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, text));
const baseline = {
  "en-GB": { performance: "Season performance", currentSeason: "Current season", latestSeason: "Last completed season", currentFixture: "Current or selected fixture", currentMatchRating: "Current match rating", appearances: "Appearances", starts: "Starts", substituteAppearances: "Substitute appearances", ratedAppearances: "Rated appearances", officialData: "Official football data", performanceCopy: "Statistics reflect available match data. Unconfirmed participation does not establish an absence or its reason. Missing ratings are not estimated.", syncPending: "TouchLine Verified statistics are awaiting a complete player, season and fixture sync.", identityPending: "Verified player identity is currently unavailable.", updatedAt: "Updated", verifiedSeason: "Verified season", fullStats: "TouchLine Verified statistics", percentageExplanation: "Percentages calculated from available counts. Rates remain unavailable without compatible counts." },
  "pt-BR": { performance: "Desempenho na temporada", currentSeason: "Temporada atual", latestSeason: "Última temporada concluída", currentFixture: "Partida atual ou selecionada", currentMatchRating: "Nota da partida atual", appearances: "Jogos", starts: "Titularidades", substituteAppearances: "Entradas como substituto", ratedAppearances: "Partidas com nota", officialData: "Dados do futebol real", performanceCopy: "As estatísticas refletem os dados disponíveis por partida. Participação não confirmada não comprova ausência nem seu motivo. Notas indisponíveis não são estimadas.", syncPending: "As estatísticas TouchLine Verified aguardam sincronização completa de jogador, temporada e fixtures.", identityPending: "A identidade verificada do jogador está indisponível no momento.", updatedAt: "Atualizado", verifiedSeason: "Temporada verificada", fullStats: "Estatísticas TouchLine Verified", percentageExplanation: "Percentuais calculados a partir das contagens disponíveis. Sem contagens compatíveis, a taxa fica indisponível." },
} as const;
const season = (patch: Partial<statistics.TouchLinePlayerSeasonStatistics> = {}) => ({ ...statistics.emptyTouchLinePlayerSeasonStatistics(), ...patch });
const model = (current = false): statistics.TouchLinePlayerStatisticsReadModel => ({
  touchlinePlayerId: "CANONICAL_UUID", providerPlayerId: "101", mappingStatus: "verified",
  previousCompletedSeason: season(), currentSeason: season(), lastFiveMatches: [],
  matchHistory: [{ fixtureId: "FIXTURE_CANONICAL", fixtureName: "<script>official</script>", fixtureStartsAt: "2026-10-03T10:00:00Z",
    fixtureStatus: "FT", appearanceStatus: "started", minutes: 0, rating: 0, statistics: {}, latestSyncAt: null }],
  currentOrSelectedFixture: current ? { fixtureId: "FIXTURE_SELECTED", fixtureName: "Selected", fixtureStartsAt: null,
    fixtureStatus: "FT", appearanceStatus: "absent", minutes: null, rating: null, statistics: {}, latestSyncAt: null } : null,
});

test("coverage Portuguese is intentional; omitted/default English and status/count semantics remain exact", () => {
  for (const [locale, expected] of [[undefined, "Complete for scoring — unavailable provider details remain unavailable"], ["en-GB", "Complete for scoring — unavailable provider details remain unavailable"], ["pt-BR", "Cobertura completa para pontuação — detalhes indisponíveis no provedor permanecem indisponíveis"]] as const) {
    assert.equal(statistics.touchLinePlayerSeasonCoverageMessage(season({ coverageStatus: "complete_for_scoring" }), locale), expected);
  }
  for (const synchronized of [0, 1, 2, 3, 11, 100]) for (const expected of [null, 0, 1, 100]) {
    const data = season({ coverageStatus: "partial", synchronizedFixtureCount: synchronized, expectedFixtureCount: expected });
    assert.equal(statistics.touchLinePlayerSeasonCoverageMessage(data), "Partial data — " + synchronized + " of " + (expected ?? "?") + " eligible fixtures synchronised");
    assert.equal(statistics.touchLinePlayerSeasonCoverageMessage(data, "pt-BR"), "Dados parciais — partidas elegíveis sincronizadas: " + synchronized + " de " + (expected ?? "?"));
  }
  for (const status of ["complete", "unavailable"] as const) for (const locale of locales) assert.equal(statistics.touchLinePlayerSeasonCoverageMessage(season({ coverageStatus: status }), locale), null);
});

test("seventeen own messages plus two coverage messages preserve EN/PT and protected brands without opening six gates", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES), locales);
  const keys = Object.keys(mod.TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES["en-GB"]);
  assert.equal(keys.length, 19);
  const old = value(initializer("copy"), {}) as Record<string, Record<string, string>>;
  for (const locale of ["en-GB", "pt-BR"] as const) for (const [key, expected] of Object.entries(baseline[locale])) {
    assert.equal(mod.getTouchlinePlayerPerformanceCopy(locale)[key as keyof typeof baseline["en-GB"]], expected);
    if (key !== "percentageExplanation") assert.equal(old[locale === "pt-BR" ? "pt" : "en"][key === "currentMatchRating" ? "currentMatchPoints" : key], expected);
  }
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), keys);
    for (const entry of Object.values(copy)) if (typeof entry === "string") assert.ok(entry.trim());
    assert.match(copy.fullStats, /TouchLine Verified/); assert.match(copy.syncPending, /TouchLine Verified/);
  }
  assert.deepEqual(mod.TOUCHLINE_PLAYER_PERFORMANCE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_PLAYER_PERFORMANCE_DRAFT_STATUS, "draft");
  for (const locale of [...locales.slice(2), "constructor", "__proto__", "", null, undefined]) assert.equal(mod.getTouchlinePlayerPerformanceCopy(locale), mod.TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES["en-GB"]);
  for (const locale of locales.slice(2)) assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
});

function futureModule<T>(path: string, dependencies: Record<string, unknown>): T {
  const code = readFileSync(new URL("../" + path, import.meta.url), "utf8"), exports = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Intl, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports as T;
}

// Real panel functions, summary calculation and section JSX from the page.
// Fetch/auth and surrounding page layout are not executed. CSS is a name proxy.
// Future mode supplies the existing opt-in to real catalogue paths; no public gate changes.
async function consumer(locale: string, future = false, sentinel = false, statisticLabelOverride?: (code: string, fallback: string, locale: string) => string) {
  const catalogue = await load(), stats = statistics;
  const seen: string[] = [];
  const getPerformance = (requested: string, enabled = false) => {
    seen.push(requested);
    const copy = catalogue.getTouchlinePlayerPerformanceCopy(requested, enabled);
    return sentinel ? { ...copy, ...Object.fromEntries(Object.keys(baseline["en-GB"]).map(key => [key, "SENTINEL_" + key])) } : copy;
  };
  const factGetter = facts.getTouchlineCardMatchFactLabels;
  const exactGetter = exact.getTouchlineExactCardCopy;
  const zoomGetter = zoom.getTouchlineCardZoomCopy;
  const unavailable = appearance.touchlinePlayerAppearanceLabel;
  // Consumer wiring must honor the fourth argument supplied by the real
  // component. Only direct catalogue tests below use a forced opt-in wrapper.
  const statisticLabels = await loadStatisticLabels();
  const context: Record<string, unknown> = {
    locale, draftLocalesEnabled: future, getTouchlinePlayerPerformanceCopy: getPerformance, getTouchlineCardMatchFactLabels: factGetter,
    getTouchlineCardZoomCopy: zoomGetter, getTouchlineExactCardCopy: exactGetter,
    touchlinePlayerAppearanceLabel: appearance.touchlinePlayerAppearanceLabel, touchlinePlayerDataSourceLabel: appearance.touchlinePlayerDataSourceLabel,
    touchLinePlayerSeasonCoverageMessage: stats.touchLinePlayerSeasonCoverageMessage,
    formatOfficialSyncTime: formatTouchlineProfileTimestamp, isSeasonPercentage, seasonPercentageFromCounts,
    buildTouchlineVerifiedMatchFactFields, Activity, BarChart3,
    localizedStatLabel: statisticLabelOverride ?? statisticLabels.localizedStatLabel,
    normalizeTouchLineLocale: i18n.normalizeTouchLineLocale,
    resolveTouchlineCatalogueLocale: catalogueLocale.resolveTouchlineCatalogueLocale,
    styles: new Proxy({}, { get: (_, key) => String(key) }), React,
  };
  context.copy = value(initializer("copy"), context);
  context.profileChromeDrafts = value(initializer("profileChromeDrafts"), context);
  const profileCopy = nodes(node => ts.isFunctionDeclaration(node) && node.name?.text === "getTouchlinePlayerProfileCopy");
  assert.equal(profileCopy.length, 1);
  Object.assign(context, run("export " + profileCopy[0].getText(), context));
  for (const name of ["zoomCopy", "exactCopy", "matchFactLabels"]) context[name] = value(initializer(name, routeBody), context);
  context.text = value(initializer("text", routeBody), { ...context, touchlinePlayerAppearanceLabel: unavailable });
  const declarations = ["seasonSummaryEntries", "SeasonStatisticsPanel", "FixtureStatisticsPanel"].map(name => {
    const found = nodes(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(found.length, 1, name); return "export " + found[0].getText();
  }).join("\n");
  const exports = run(declarations, context);
  Object.assign(context, exports);
  const sections = nodes(node => ts.isJsxElement(node) && node.openingElement.tagName.getText() === "section"
    && node.openingElement.attributes.properties.some(property => ts.isJsxAttribute(property) && property.name.getText() === "id" && property.initializer?.getText() === '"official-performance"'));
  assert.equal(sections.length, 1);
  const sectionTree = (data: statistics.TouchLinePlayerStatisticsReadModel, total: number | null,
    matchStats: Record<string, number | null> = { goals: 0 }, position = "ST") => {
    const scope: Record<string, unknown> = { ...context, playerStatistics: data, exactPlayer: { matchStats }, cardFactPosition: position, totalRatingText: total };
    scope.performanceCopy = value(initializer("performanceCopy", routeBody), scope);
    return value(sections[0].getText(), scope) as React.ReactElement;
  };
  return { context, seen, copy: getPerformance(locale, future), sectionTree,
    seasonComponent: exports.SeasonStatisticsPanel, fixtureComponent: exports.FixtureStatisticsPanel,
    season: (data: statistics.TouchLinePlayerSeasonStatistics, total?: number | null) => renderToStaticMarkup(React.createElement(exports.SeasonStatisticsPanel as React.ComponentType<Record<string, unknown>>, { title: "UNCHANGED_TITLE", statistics: data, text: context.text, locale, draftLocalesEnabled: future, publishedTotalRating: total })),
    fixture: (data: statistics.TouchLinePlayerStatisticsReadModel) => renderToStaticMarkup(React.createElement(exports.FixtureStatisticsPanel as React.ComponentType<Record<string, unknown>>, { model: data, text: context.text, locale, draftLocalesEnabled: future, matchStats: { goals: 0, assists: null }, position: "ST" })),
    section: (data: statistics.TouchLinePlayerStatisticsReadModel, total: number | null) => renderToStaticMarkup(sectionTree(data, total)),
  };
}

test("real season summary keeps eleven entries, zero/null, aggregate fallback and published-null distinction", async () => {
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const h = await consumer(locale), empty = season();
    const data = season({ summary: { ...empty.summary, appearances: 0, starts: 1, substituteAppearances: 2, minutes: 3, goals: 4, assists: 5, rating: 6, totalRating: 77, ratedAppearances: 8, yellowCards: 9, redCards: null } });
    const labels = locale === "pt-BR" ? ["Jogos", "Titularidades", "Entradas como substituto", "Minutos", "Gols", "Assistências", "Nota", "Nota total", "Partidas com nota", "Cartões amarelos", "Cartões vermelhos"] : ["Appearances", "Starts", "Substitute appearances", "Minutes", "Goals", "Assists", "Rating", "Total rating", "Rated appearances", "Yellow cards", "Red cards"];
    for (const total of [undefined, null, 0]) {
      const html = h.season(data, total); assert.match(html, /data-stat-count="11"/);
      let offset = -1;
      for (const label of labels) { const next = html.indexOf("<small>" + escape(label) + "</small>"); assert.ok(next > offset, label); offset = next; }
      const expected = total === undefined ? "77" : total === null ? (locale === "pt-BR" ? "Indisponível" : "Unavailable") : "0";
      assert.ok(html.includes("<small>" + escape(labels[7]) + "</small><strong>" + expected + "</strong>"));
      assert.ok(html.includes("<small>" + labels[0] + "</small><strong>0</strong>"));
    }
    const html = h.season(empty); assert.ok(html.includes(escape(h.copy.syncPending))); assert.doesNotMatch(html, /data-stat-count/);
  }
});

test("real percentage branch retains counts, 0–100 and rounded decimal plus literal percent, never style-percent", async () => {
  const rates = ["33.33%", "33,33%", "33,33%", "33,33%", "33,33%", "٣٣٫٣٣%", "33,33%", "33,33%"];
  for (const [index, locale] of locales.entries()) {
    const h = await consumer(locale, true);
    const cases: Array<[Record<string, number>, string | null]> = [[{ passes: 3, "accurate-passes": 1 }, rates[index]],
      [{ passes: 5, "accurate-passes": 0 }, locale === "ar-SA" ? "٠%" : "0%"], [{ passes: 5, "accurate-passes": 5 }, locale === "ar-SA" ? "١٠٠%" : "100%"],
      [{ passes: 0, "accurate-passes": 0 }, null], [{ passes: 2, "accurate-passes": 3 }, null], [{}, null]];
    for (const [counts, expected] of cases) {
      const html = h.season(season({ positionStatistics: { "accurate-passes-percentage": 999, ...counts } }));
      const unavailable = (h.context.text as { unavailable: string }).unavailable;
      assert.ok(html.includes("<strong>" + escape(expected ?? unavailable) + "</strong>"));
      assert.ok(html.includes(escape(h.copy.percentageExplanation))); assert.doesNotMatch(html, /999%|3333/);
    }
  }
});

test("real fixture panel preserves present/absent current fixture and zero/null meanings", async () => {
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const h = await consumer(locale);
    const absent = h.fixture(model(false)); assert.ok(absent.includes(escape(h.copy.currentFixture)));
    assert.ok(absent.includes(locale === "pt-BR" ? "0 minutos" : "0 minutes"));
    assert.ok(absent.includes(locale === "pt-BR" ? "Nota: 0" : "Rating: 0"));
    const present = h.fixture(model(true));
    assert.ok(present.includes(escape(h.copy.currentMatchRating) + ": —"));
    assert.ok(present.includes(locale === "pt-BR" ? "Participação não confirmada" : "Participation unconfirmed"));
    assert.doesNotMatch(present, /<script>/);
  }
});

test("real section and panels render eight isolated catalogues, preserve names/time and complete/partial/empty states", async () => {
  const titles = ["Season performance", "Desempenho na temporada", "Rendimiento de la temporada", "Rendimento stagionale", "Performances de la saison", "الأداء خلال الموسم", "Sezon performansı", "Saisonleistung"];
  for (const [index, locale] of locales.entries()) {
    const h = await consumer(locale, true);
    for (const coverageStatus of ["complete", "complete_for_scoring", "partial", "unavailable"] as const) {
      const data = model(true);
      data.previousCompletedSeason = season({ coverageStatus, seasonName: '<img src=x onerror="bad"> 2099/00', competitionName: "Official $& Club", latestSyncAt: "2026-10-03T10:00:00Z", synchronizedFixtureCount: 0, expectedFixtureCount: null });
      data.currentSeason = season({ coverageStatus, positionStatistics: { "accurate-passes-percentage": 90 } });
      const html = h.section(data, null);
      assert.ok(html.includes(escape(titles[index]))); assert.ok(html.includes(escape(h.copy.latestSeason))); assert.ok(html.includes(escape(h.copy.currentSeason)));
      assert.ok(html.includes(escape(h.copy.currentFixture))); assert.ok(html.includes(escape(h.copy.currentMatchRating)));
      assert.ok(html.includes(escape(h.copy.percentageExplanation))); assert.ok(html.includes(escape(h.copy.syncPending)));
      assert.ok(html.includes(escape(h.copy.updatedAt))); assert.ok(html.includes(escape(h.copy.fullStats)));
      assert.ok(html.includes('dateTime="2026-10-03T10:00:00Z"') || html.includes('datetime="2026-10-03T10:00:00Z"'));
      assert.ok(html.includes(escape('<img src=x onerror="bad"> 2099/00'))); assert.ok(html.includes("Official $&amp; Club")); assert.doesNotMatch(html, /<img|<script>/);
      assert.equal((html.match(/data-partial-season-data/g) ?? []).length, ["partial", "complete_for_scoring"].includes(coverageStatus) ? 2 : 0);
    }
    assert.ok(h.seen.length > 2); assert.ok(h.seen.every(requested => requested === locale));
  }
});

test("consumer sentinel proves every own presentation binding and public drafts still render English", async () => {
  for (const locale of locales.slice(2)) {
    const h = await consumer(locale); assert.ok(h.section(model(false), null).includes("Season performance"));
    assert.equal(i18n.normalizeTouchLineLocale(locale), "en-GB");
  }
  const h = await consumer("ar-SA", true, true), data = model(true);
  data.previousCompletedSeason = season({ latestSyncAt: "2026-10-03T10:00:00Z" });
  data.currentSeason = season({ summary: { ...season().summary, appearances: 0 }, positionStatistics: { "accurate-passes-percentage": 99 } });
  const html = h.section(data, 0);
  for (const key of Object.keys(baseline["en-GB"]).filter(key => key !== "identityPending")) assert.ok(html.includes("SENTINEL_" + key), key);
  const biography = nodes(node => ts.isJsxElement(node) && node.openingElement.tagName.getText() === "p"
    && node.openingElement.attributes.getText().includes("styles.biography"));
  assert.equal(biography.length, 1);
  const scope = { ...h.context, performanceCopy: h.copy, canonicalIdentity: null, officialLookup: { providerPlayerId: "101" }, official: { player: null } };
  assert.ok(renderToStaticMarkup(value(biography[0].getText(), scope) as React.ReactElement).includes("SENTINEL_identityPending"));
});

test("real panel statistic labels require the component's explicit opt-in argument", async () => {
  const data = season({ positionStatistics: { bench: 0 } });
  const publicView = await consumer("es-ES");
  const draftView = await consumer("es-ES", true);
  assert.ok(publicView.season(data).includes("<small>Bench</small><strong>0</strong>"));
  assert.doesNotMatch(publicView.season(data), /En el banquillo/);
  assert.ok(draftView.season(data).includes("<small>En el banquillo</small><strong>0</strong>"));
  const { localizedStatLabel } = await loadStatisticLabels();
  assert.equal(localizedStatLabel("bench", "bench", "es-ES"), "Bench");
  assert.equal(localizedStatLabel("bench", "bench", "es-ES", false), "Bench");
  assert.equal(localizedStatLabel("bench", "bench", "es-ES", true), "En el banquillo");
});

test("coverage draft oracles preserve literal counts/question mark and both messages in all eight isolated catalogues", async () => {
  const mod = await load();
  const partial = [
    "Partial data — 0 of ? eligible fixtures synchronised",
    "Dados parciais — partidas elegíveis sincronizadas: 0 de ?",
    "Datos parciales — partidos elegibles sincronizados: 0 de ?",
    "Dati parziali — partite idonee sincronizzate: 0 su ?",
    "Données partielles — matchs admissibles synchronisés : 0 sur ?",
    "بيانات جزئية — المباريات المؤهلة التي تمت مزامنتها: 0 من ?",
    "Kısmi veri — eşitlenen uygun maç sayısı: 0 / ?",
    "Teildaten — synchronisierte berücksichtigte Spiele: 0 von ?",
  ];
  const complete = [
    "Complete for scoring — unavailable provider details remain unavailable",
    "Cobertura completa para pontuação — detalhes indisponíveis no provedor permanecem indisponíveis",
    "Cobertura completa para la puntuación — los detalles no disponibles del proveedor siguen sin estar disponibles",
    "Copertura completa per il punteggio — i dettagli non disponibili del fornitore restano non disponibili",
    "Couverture complète pour le calcul des points — les détails indisponibles du fournisseur restent indisponibles",
    "تغطية مكتملة لاحتساب النقاط — تظل تفاصيل مزوّد البيانات غير المتاحة غير متاحة",
    "Puanlama için kapsam tam — sağlayıcının mevcut olmayan ayrıntıları mevcut değil olarak kalır",
    "Vollständige Abdeckung für die Punkteberechnung — nicht verfügbare Anbieterdetails bleiben nicht verfügbar",
  ];
  for (const [index, locale] of locales.entries()) {
    const copy = mod.TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES[locale];
    assert.equal(copy.completeForScoring, complete[index]);
    for (const n of [0, 1, 2, 3, 11, 100]) for (const expected of ["?", 0, 1, 100] as const) {
      assert.equal(copy.partialCoverage(n, expected), partial[index].replace("0", String(n)).replace("?", String(expected)));
    }
    const h = await consumer(locale, true), data = season({ coverageStatus: "partial" });
    assert.ok(h.season(data).includes(escape(partial[index])));
    assert.ok(h.season({ ...data, coverageStatus: "complete_for_scoring" }).includes(escape(complete[index])));
  }
});

const legacyStatisticLabels = {
  appearances: "Jogos", starts: "Titularidades", minutes: "Minutos", goals: "Gols", assists: "Assistências",
  "yellow-cards": "Cartões amarelos", "red-cards": "Cartões vermelhos", fouls: "Faltas", offsides: "Impedimentos", penalties: "Pênaltis",
  "shots-total": "Finalizações", "shots-on-target": "Finalizações no gol", "shots-off-target": "Finalizações para fora", "shots-blocked": "Finalizações bloqueadas", "blocked-shots": "Chutes bloqueados",
  "hit-woodwork": "Bolas na trave", passes: "Passes", touches: "Toques na bola", "duels-lost": "Duelos perdidos", "backward-passes": "Passes para trás", "possession-lost": "Perdas de posse",
  "passes-in-final-third": "Passes no terço final", "cumulative-minutes-played": "Minutos acumulados", "long-balls-won-percentage": "Precisão dos lançamentos longos", "successful-crosses-percentage": "Precisão dos cruzamentos",
  "accurate-passes": "Passes certos", "accurate-passes-percentage": "Precisão dos passes", "key-passes": "Passes decisivos", "total-crosses": "Cruzamentos", "accurate-crosses": "Cruzamentos certos",
  "long-balls": "Lançamentos longos", "long-balls-won": "Lançamentos longos certos", "through-balls": "Passes em profundidade", "through-balls-won": "Passes em profundidade certos",
  tackles: "Desarmes", interceptions: "Interceptações", clearances: "Cortes", "total-duels": "Duelos", "duels-won": "Duelos vencidos", "aerial-won": "Duelos aéreos vencidos", "aerials-won": "Duelos aéreos vencidos", "aerial-duels-won": "Duelos aéreos vencidos",
  "dribble-attempts": "Tentativas de drible", "successful-dribbles": "Dribles certos", "dribbled-past": "Dribles sofridos", dispossessed: "Perdas de posse", "fouls-drawn": "Faltas sofridas", "goals-conceded": "Gols sofridos", saves: "Defesas",
  "saves-insidebox": "Defesas dentro da área", "error-lead-to-goal": "Erro que resultou em gol", "clean-sheets": "Jogos sem sofrer gol", cleansheets: "Jogos sem sofrer gol", yellowcards: "Cartões amarelos", redcards: "Cartões vermelhos", "minutes-played": "Minutos jogados", lineups: "Titularidades", bench: "No banco", captain: "Capitão", "team-wins": "Vitórias da equipe", "team-draws": "Empates da equipe", "team-lost": "Derrotas da equipe", "big-chances-created": "Grandes chances criadas", "big-chances-missed": "Grandes chances perdidas", "average-points-per-game": "Média de pontos por jogo", rating: "Nota",
} as const;

test("statistic labels reject inherited properties rather than returning a function or prototype", async () => {
  const { localizedStatLabel: label } = await loadStatisticLabels();
  for (const [code, fallback] of [["constructor", "Constructor"], ["prototype", "Prototype"], ["__proto__", " proto "], ["toString", "ToString"]]) {
    assert.equal(label(code, "safe_label", "pt-BR"), "Safe label", code);
    assert.equal(label("unknown", code, "pt-BR"), fallback);
  }
});

async function futureStatisticLabels(sentinel = false) {
  await loadStatisticLabels();
  const catalogue = await load();
  const compiled = futureModule<typeof import("../lib/touchlineArena/player-statistic-labels.ts")>("lib/touchlineArena/player-statistic-labels.ts", {
    "./catalogue-locale.ts": catalogueLocale,
    "./card-match-fact-i18n.ts": sentinel ? { getTouchlineCardMatchFactLabels: () => Object.fromEntries(Object.keys(facts.TOUCHLINE_CARD_MATCH_FACT_CATALOGUES["en-GB"]).map(key => [key, "FACT_" + key])) } : facts,
    "./player-performance-i18n.ts": sentinel ? { getTouchlinePlayerPerformanceCopy: () => ({ appearances: "PERFORMANCE_appearances", starts: "PERFORMANCE_starts" }) } : catalogue,
  });
  return { ...compiled, localizedStatLabel: (code: string, fallback: string, locale: string) => compiled.localizedStatLabel(code, fallback, locale, true) };
}

test("statistic labels expose six isolated draft matrices without publishing them or merging distinct codes", async () => {
  const mod = await loadStatisticLabels(), future = await futureStatisticLabels();
  assert.deepEqual(mod.TOUCHLINE_PLAYER_STATISTIC_LABEL_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_PLAYER_STATISTIC_LABEL_DRAFT_STATUS, "draft");
  const examples = {
    "en-GB": ["Raw fallback", "Raw fallback", "Raw fallback", "Raw fallback"],
    "pt-BR": ["Finalizações no gol", "Jogos sem sofrer gol", "Precisão dos passes", "No banco"],
    "es-ES": ["Tiros a puerta", "Porterías a cero", "Precisión de los pases", "En el banquillo"],
    "it-IT": ["Tiri in porta", "Partite senza subire gol", "Precisione dei passaggi", "In panchina"],
    "fr-FR": ["Tirs cadrés", "Matchs sans encaisser de but", "Précision des passes", "Sur le banc"],
    "ar-SA": ["التسديدات على المرمى", "مباريات بشباك نظيفة", "دقة التمرير", "على مقاعد البدلاء"],
    "tr-TR": ["İsabetli şutlar", "Gol yemeden tamamlanan maçlar", "Pas isabeti", "Yedek kulübesinde"],
    "de-DE": ["Schüsse aufs Tor", "Spiele ohne Gegentor", "Passgenauigkeit", "Auf der Bank"],
  } as const;
  for (const locale of locales) {
    for (const [index, code] of ["shots-on-target", "clean-sheets", "accurate-passes-percentage", "bench"].entries()) {
      assert.equal(future.localizedStatLabel(code, "raw_fallback", locale), examples[locale][index]);
    }
    for (const code of Object.keys(legacyStatisticLabels)) {
      const label = future.localizedStatLabel(code, "UNRECOGNIZED_SENTINEL", locale);
      assert.equal(typeof label, "string"); assert.ok(label.trim());
      if (locale !== "en-GB") assert.notEqual(label, "UNRECOGNIZED SENTINEL", `${locale}:${code}`);
    }
    for (const [alias, canonical] of [["aerials-won", "aerial-won"], ["aerial-duels-won", "aerial-won"], ["cleansheets", "clean-sheets"], ["yellowcards", "yellow-cards"], ["redcards", "red-cards"], ["lineups", "starts"]]) {
      assert.equal(future.localizedStatLabel(alias, "same fallback", locale), future.localizedStatLabel(canonical, "same fallback", locale));
    }
    for (const code of ["constructor", "prototype", "__proto__", "toString"]) assert.equal(future.localizedStatLabel(code, "safe_label", locale), "Safe label");
    assert.equal(future.localizedStatLabel("unknown", "official_$&_<Club>", locale), "Official $& <Club>");
    if (locale !== "en-GB") assert.notEqual(future.localizedStatLabel("shots-blocked", "raw", locale), future.localizedStatLabel("blocked-shots", "raw", locale));
    if (locales.slice(2).includes(locale as typeof locales[2])) {
      assert.equal(mod.localizedStatLabel("bench", "raw_fallback", locale), "Raw fallback");
      assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
    }
  }
});

test("statistic labels delegate compatible facts and performance while retaining three Portuguese overrides", async () => {
  const { localizedStatLabel: label } = await futureStatisticLabels(true);
  for (const locale of locales.slice(1)) {
    for (const [code, key] of [["minutes", "minutes"], ["goals", "goals"], ["assists", "assists"], ["yellowcards", "yellowCards"], ["redcards", "redCards"], ["goals-conceded", "goalsConceded"], ["saves", "saves"], ["rating", "rating"]]) assert.equal(label(code, "raw", locale), "FACT_" + key);
    assert.equal(label("appearances", "raw", locale), "PERFORMANCE_appearances");
    assert.equal(label("starts", "raw", locale), "PERFORMANCE_starts"); assert.equal(label("lineups", "raw", locale), "PERFORMANCE_starts");
    assert.equal(label("shots-on-target", "raw", locale), locale === "pt-BR" ? "Finalizações no gol" : "FACT_shotsOnTarget");
    assert.equal(label("shots-off-target", "raw", locale), locale === "pt-BR" ? "Finalizações para fora" : "FACT_shotsOffTarget");
    assert.equal(label("cleansheets", "raw", locale), locale === "pt-BR" ? "Jogos sem sofrer gol" : "FACT_cleanSheets");
  }
  assert.equal(label("goals", "raw_fallback", "en-GB"), "Raw fallback");
});

test("real statistic panel consumes imported labels, preserves order and values, and escapes fallback text", async () => {
  const literal = ["Bench", "No banco", "En el banquillo", "In panchina", "Sur le banc", "على مقاعد البدلاء", "Yedek kulübesinde", "Auf der Bank"];
  const data = season({ positionStatistics: { bench: 0, "custom-<Club>$&": 7, "shots-blocked": 3, "blocked-shots": 4, rating: 999 } });
  for (const [index, locale] of locales.entries()) {
    const h = await consumer(locale, true), html = h.season(data);
    assert.ok(html.includes("<small>" + escape(literal[index]) + "</small><strong>0</strong>"));
    assert.ok(html.includes("<small>Custom &lt;Club&gt;$&amp;</small><strong>7</strong>"));
    assert.doesNotMatch(html, /<Club>|999/);
    const calls: string[][] = [];
    const s = await consumer(locale, true, false, (code, fallback, requested) => { calls.push([code, fallback, requested]); return `LABEL:${requested}:${code}`; });
    const sentinelHtml = s.season(data);
    assert.deepEqual(calls, ["bench", "custom-<Club>$&", "shots-blocked", "blocked-shots"].map(code => [code, code, locale]));
    for (const [code, number] of [["bench", 0], ["custom-<Club>$&", 7], ["shots-blocked", 3], ["blocked-shots", 4]] as const) assert.ok(sentinelHtml.includes("<small>" + escape(`LABEL:${locale}:${code}`) + `</small><strong>${number}</strong>`));
  }
  const imports = nodes(node => ts.isImportDeclaration(node) && node.moduleSpecifier.getText() === '"@/lib/touchlineArena/player-statistic-labels"');
  assert.equal(imports.length, 1); assert.match(imports[0].getText(), /import \{ localizedStatLabel \}/);
});

// Prospective behavioral contract; historical byte digest/provenance is recorded
// in full-suite-failure-triage-20261007.md, not claimed to be recovered here.
test("real performance section preserves season provenance and published-rating ownership across locales", async () => {
  const freeze = (input: unknown): void => {
    if (input && typeof input === "object") {
      for (const child of Object.values(input)) freeze(child);
      Object.freeze(input);
    }
  };
  for (const locale of locales) for (const future of [false, true]) {
    const h = await consumer(locale, future);
    for (const total of [null, 0, 7.5]) {
      const data = model(true);
      data.previousCompletedSeason = season({ seasonName: "Previous official season" });
      data.currentSeason = season({ seasonName: "Current official season" });
      const matchStats = { goals: 0, assists: null, saves: 3 };
      const before = structuredClone({ data, matchStats });
      freeze(data); freeze(matchStats);
      const tree = h.sectionTree(data, total, matchStats, "GK");
      const panels: React.ReactElement<Record<string, unknown>>[] = [];
      const visit = (node: React.ReactNode): void => {
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (!React.isValidElement<Record<string, unknown>>(node)) return;
        if (node.type === h.seasonComponent || node.type === h.fixtureComponent) panels.push(node);
        visit(node.props.children as React.ReactNode);
      };
      visit(tree);
      assert.deepEqual(panels.map(panel => panel.type), [h.seasonComponent, h.seasonComponent, h.fixtureComponent]);
      const [previous, current, fixture] = panels.map(panel => panel.props);
      assert.equal(previous.statistics, data.previousCompletedSeason);
      assert.equal(current.statistics, data.currentSeason);
      assert.equal(previous.title, h.copy.latestSeason);
      assert.equal(current.title, h.copy.currentSeason);
      assert.equal(Object.hasOwn(previous, "publishedTotalRating"), false);
      assert.equal(Object.hasOwn(current, "publishedTotalRating"), true);
      assert.equal(current.publishedTotalRating, total);
      assert.equal(fixture.model, data);
      assert.equal(fixture.matchStats, matchStats);
      assert.equal(fixture.position, "GK");
      for (const panel of panels) {
        assert.equal(panel.props.locale, locale);
        assert.equal(panel.props.draftLocalesEnabled, future);
        assert.equal(panel.props.text, h.context.text);
      }
      assert.deepEqual({ data, matchStats }, before);
    }
  }
});

test("statistic label extraction preserves every PT legacy code and English readable fallback", async () => {
  const { localizedStatLabel: label } = await loadStatisticLabels();
  assert.equal(Object.keys(legacyStatisticLabels).length, 66);
  for (const [code, expected] of Object.entries(legacyStatisticLabels)) {
    assert.equal(label(code, "Official $& <Label>", "pt-BR"), expected, code);
    assert.equal(label(code, "Official $& <Label>", "en-GB"), "Official $& <Label>", code);
    assert.equal(label(code.toUpperCase().replaceAll("-", "_"), "unknown", "pt-BR"), expected);
    assert.equal(label("unknown", code.replaceAll("-", " "), "pt-BR"), expected);
  }
  assert.equal(label("goals", "assists", "pt-BR"), "Gols");
  assert.equal(label(" shots-total ", "raw__provider-label", "pt-BR"), "Raw provider label");
  assert.equal(label("anything", "", "en-GB"), "");
  assert.equal(label("anything", "raw__provider-label", "en-GB"), "Raw provider label");
  assert.equal(label("shots-blocked", "blocked-shots", "pt-BR"), "Finalizações bloqueadas");
  assert.equal(label("blocked-shots", "shots-blocked", "pt-BR"), "Chutes bloqueados");
  for (const locale of [...locales.slice(2), "pt", "unknown", "constructor"]) assert.equal(label("goals", "original_text", locale), "Original text");
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-players/[player]")');
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
