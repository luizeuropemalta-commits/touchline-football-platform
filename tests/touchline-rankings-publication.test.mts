import ts from "typescript";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTouchLineRankingsCopy } from "../lib/touchlineArena/rankings-i18n.ts";
import { getTouchlineNavigationCopy } from "../lib/touchlineArena/navigation-i18n.ts";
import { getTouchlineTablesPresentationCopy } from "../lib/touchlineArena/tables-presentation-i18n.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const page = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
const copy = readFileSync(new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url), "utf8");
const projection = readFileSync(new URL("../lib/touchlineArena/rankings-highlight-projection.ts", import.meta.url), "utf8");

test("visible Rankings heading matches the navigation term while retaining TouchLine branding", () => {
  assert.equal(getTouchLineRankingsCopy("en-GB").tablesTitle, `TouchLine ${getTouchlineNavigationCopy("en-GB").rankings}`);
  assert.equal(getTouchLineRankingsCopy("pt-BR").tablesTitle, `${getTouchlineNavigationCopy("pt-BR").rankings} TouchLine`);
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const title = getTouchLineRankingsCopy(locale, true).tablesTitle;
    assert.ok(title.includes(getTouchlineNavigationCopy(locale, true).rankings), locale);
    assert.ok(title.includes("TouchLine"), locale);
  }
  assert.match(client, /<h1>\{copy\.tablesTitle\}<\/h1>/);
  assert.match(page, /title: "TouchLine Rankings"/);
});

test("external ranking links name ClubOwner and ClubHub without changing destinations", () => {
  const playerPage = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  assert.match(playerPage, /touchlineArenaPanelHref\("market", locale, draftLocalesEnabled\)/);
  assert.match(playerPage, /href=\{marketTransferHref\(club\?\.slug\)\}>\{copy\.marketTransfer\}/);
  assert.match(playerPage, /href=\{`\/touchline-clubs\/\$\{club\.slug\}\?\$\{localeQuery\}`\}>\{copy\.clubHub\}/);
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const labels = getTouchLineRankingsCopy(locale, true);
    assert.equal(labels.marketTransfer, "ClubOwner");
    assert.equal(labels.clubHub, "ClubHub");
  }
});

test("TouchLine Tables never present demo data as an official competition ranking", () => {
  assert.doesNotMatch(page, /rankClubOwnerCards|buildDemoClubOwnerStandings|buildTouchlineRankingSnapshot/);
  assert.match(page, /loadTouchLineActiveRanking\(\)/);
  assert.match(page, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.match(page, /const touchLineEnglandTable: never\[\] = \[\]/);
  assert.match(client, /function RankingPending/);
  assert.match(client, /touchLineEnglandTable\.length \?/);
  assert.match(copy, /rankingPending/);
});

test("TouchLine Tables shows one positional Best XI, coaches and the sporting ClubOwner Table", () => {
  assert.match(client, /data-best-eleven-player/);
  assert.match(client, /data-best-eleven-position/);
  assert.match(client, /data-top-coach-card/);
  assert.match(client, /id="coach-rankings"/);
  assert.match(client, /coachRanking\.rows\.slice\(0, 7\)/);
  assert.match(projection, /compareTouchLineRankedCards/);
  assert.match(projection, /filter\(\(card\) => card\.seasonTotalRating != null\)/);
  assert.match(projection, /sort\(compareTouchLineRankedCards\)/);
  assert.match(projection, /\.slice\(0, 3\)/);
  assert.match(page, /complete\.then\(\(\[, selection, cards\]\) => projectTouchlineRankingsHighlights\(cards, selection\)\)/);
  assert.match(page, /highlights=\{highlights\}/);
  assert.doesNotMatch(page, /rosterCards=\{rankedCards\}/);
  assert.match(page, /totalRankedCards=\{rankedCards\.length\}/);
  assert.match(client, /presentationCopy\.podiumTitle/);
  assert.equal(getTouchlineTablesPresentationCopy("pt-BR").podiumTitle, "Top 3 Cards da Temporada");
  assert.equal(getTouchlineTablesPresentationCopy("en-GB").podiumTitle, "Season Top 3 Cards");
  assert.match(client, /presentationCopy\.bestCoaches/);
  assert.equal(getTouchlineTablesPresentationCopy("pt-BR").bestCoaches, "Melhores treinadores");
  assert.equal(getTouchlineTablesPresentationCopy("en-GB").bestCoaches, "Best coaches");
  assert.match(client, /id="club-owner-table"/);
  assert.doesNotMatch(client, /cardClubOwnerRank|playerList|playerRankSection/);
  assert.doesNotMatch(copy, /Highest squad card value|Maiores valores de cards do elenco/);
});

test("TouchLine Tables distinguishes every published card from the current eligible ranking snapshot", () => {
  assert.match(page, /countTouchlinePublishedPlayerCards\(\)/);
  assert.match(client, /copy\.publishedCards/);
  assert.match(client, /totalPublishedCards \?\? "—"/);
  assert.match(client, /copy\.rankedCards/);
  assert.match(client, /totalRankedCards/);
  assert.doesNotMatch(client, /copy\.clubOwners/);
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
