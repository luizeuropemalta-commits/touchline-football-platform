import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as feed from "../lib/touchlineArena/player-profile-feed-i18n.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("profile.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const route = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "renderPlayerProfilePage") as ts.FunctionDeclaration;
assert.ok(route?.body);
const statements = route.body.statements.filter(node =>
  ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ["feedCopy", "playerSocialPosts"].includes(declaration.name.getText(ast)))
  || ts.isIfStatement(node) && node.thenStatement.getText(ast).includes("playerSocialPosts.unshift("));
assert.equal(statements.length, 3);
type Post = { id: string; kind: string; title: string; body: string; meta: string; badge: string; visual?: string; visualTheme: string; visualValue?: string; baseLikeCount?: number; metrics: Array<{ label: string; value: string }> };
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const playerName = '<b>Official $& {clubName}</b>';
const clubName = 'Official & "Club"';
function posts(locale: string, optIn = false, options: { production?: boolean; preview?: boolean; verified?: boolean; published?: boolean; tier?: boolean } = {}) {
  const exports: { result?: Post[] } = {};
  const card = Object.freeze({ id: "id-123", name: playerName, clubName, countryCode3: "BRA" });
  const official = Object.freeze({ status: "verified", player: options.verified === false ? null : Object.freeze({ displayName: playerName }) });
  runInNewContext(ts.transpileModule(`${statements.map(node => node.getText(ast)).join("\n")}\nexport const result = playerSocialPosts;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, ...feed, locale, draftLocalesEnabled: optIn, isPortuguese: locale === "pt-BR",
    card, official, hasPublishedEditorialCard: options.published !== false,
    tier: options.tier === false ? null : { key: "emerald" }, tierDisplayName: options.tier === false ? null : "FACTUAL_TIER",
    cumulativeRatingText: "0", accent: "#123456", officialSyncTime: "FACTUAL_DATE",
    displayNationality: "Official country", displayPosition: "GK", profileFlagUrl: "/flag.svg", profileCountryCode3: "BRA",
    text: { totalRating: getTouchlineExactCardCopy(locale, optIn).totalRating },
    zoomCopy: getTouchlineCardZoomCopy(locale, optIn), socialCardVisual: (label: string) => label,
    previewTier: options.preview === false ? null : { key: "emerald" },
    process: { env: { NODE_ENV: options.production ? "production" : "development" } },
  });
  return JSON.parse(JSON.stringify(exports.result)) as Post[];
}

test("real page post construction preserves EN/PT copy, demo facts and ordering", () => {
  const expected = {
    "en-GB": {
      titles: [`Full time: outstanding display from ${playerName}`, `${playerName} scored for ${clubName}`, "The editorial team updated the card tier", "Player availability update", "Editorial card profile published", "Official player data updated"],
      bodies: ["Example of an automatic full-time post with the verified TouchLine rating.", "The TouchLine Verified goal update generates this communication automatically for every follower of the player.", "Visual example of an editorial change independent of any valuation.", "When TouchLine verifies an injury, suspension or doubt for the next match, followers receive an update like this.", "The tier appears when the editorial team publishes this card.", `Verified football profile for ${playerName}. Match events will be published here without revealing any ClubOwner strategy.`],
      meta: ["Demo · after the match", "Demo · 67 minutes", "Demo · editorial review", "Demo · football alert", "TouchLine", "FACTUAL_DATE"],
      badges: ["Rating 8.7 · simulated total rating 38.0", "1 goal · verified TouchLine rating", "Tier updated · FACTUAL_TIER", "Simulated status · awaiting confirmation", "FACTUAL_TIER", "Official country · GK"],
    },
    "pt-BR": {
      titles: [`Fim de jogo: grande atuação de ${playerName}`, `${playerName} marcou para o ${clubName}`, "A equipa editorial atualizou o tier do card", "Atualização de disponibilidade do atleta", "Perfil editorial do card publicado", "Dados oficiais do atleta atualizados"],
      bodies: ["Exemplo de publicação automática após o encerramento da partida com a nota TouchLine verificada.", "A atualização de gol verificada pela TouchLine gera esta comunicação automaticamente para todos os seguidores do atleta.", "Exemplo visual de uma alteração editorial independente de qualquer valuation.", "Quando a TouchLine verificar lesão, suspensão ou dúvida para a próxima partida, os seguidores recebem uma atualização como esta.", "O tier aparece quando a equipa editorial publica este card.", `Perfil esportivo verificado para ${playerName}. Eventos de partida serão publicados aqui sem revelar qualquer estratégia de ClubOwner.`],
      meta: ["Demonstração · após a partida", "Demonstração · 67 minutos", "Demonstração · revisão editorial", "Demonstração · alerta esportivo", "TouchLine", "FACTUAL_DATE"],
      badges: ["Nota 8,7 · nota total simulada 38,0", "1 gol · nota TouchLine verificada", "Categoria atualizada · FACTUAL_TIER", "Situação simulada · aguardando confirmação", "FACTUAL_TIER", "Official country · GK"],
    },
  };
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const actual = posts(locale);
    assert.deepEqual(actual.map(post => post.title), expected[locale].titles);
    assert.deepEqual(actual.map(post => post.body), expected[locale].bodies);
    assert.deepEqual(actual.map(post => post.meta), expected[locale].meta);
    assert.deepEqual(actual.map(post => post.badge), expected[locale].badges);
    assert.deepEqual(actual, posts(locale, true));
  }
});

test("eight real opt-in paths preserve canonical and demo data without synthesizing extra posts", () => {
  assert.deepEqual(Object.keys(feed.TOUCHLINE_PLAYER_PROFILE_FEED_CATALOGUES), locales);
  for (const locale of locales) {
    const copy = feed.getTouchlinePlayerProfileFeedCopy(locale, true);
    assert.ok(Object.values(copy).every(value => value.trim()));
    const actual = posts(locale, true);
    assert.deepEqual(actual.map(post => post.id), ["simulation-final-whistle-id-123", "simulation-goal-id-123", "simulation-tier-id-123", "simulation-availability-id-123", "card-status-id-123-emerald", "official-profile-id-123-verified"]);
    assert.deepEqual(actual.map(post => post.kind), ["simulation", "simulation", "simulation", "simulation", "official", "official"]);
    assert.deepEqual(actual.map(post => post.visualTheme), ["match", "goal", "evolution", "availability", "market", "profile"]);
    assert.deepEqual(actual.slice(0, 4).map(post => post.baseLikeCount), [11420, 3018, 2764, 864]);
    assert.deepEqual(actual[0].metrics.map(metric => metric.value), [locale === "pt-BR" ? "8,7" : "8.7", "90", "38.0"]);
    assert.deepEqual(actual[1].metrics.map(metric => metric.value), ["1", "67'", "8.7"]);
    assert.equal(actual[4].metrics[0].value, "0");
    assert.equal(actual[5].meta, "FACTUAL_DATE");
    assert.equal(actual[5].visualValue, "BRA");
    assert.equal(actual[4].title, copy.publishedTitle);
    assert.equal(actual[5].title, copy.officialUpdated);
    assert.ok(actual[5].body.includes(playerName)); assert.ok(actual[5].body.includes("ClubOwner"));
    assert.ok(actual[1].title.includes(playerName)); assert.ok(actual[1].title.includes(clubName));
    assert.equal(actual[2].title, copy.tierTitle); assert.equal(actual[3].title, copy.availabilityTitle);
    if (locale !== "en-GB" && locale !== "pt-BR") {
      assert.deepEqual(posts(locale), posts("en-GB"));
      assert.equal(isTouchLineLocaleComplete(locale), false);
    }
    for (const options of [{ production: true }, { preview: false }, { production: true, preview: false }]) {
      assert.deepEqual(posts(locale, true, options).map(post => post.kind), ["official", "official"]);
    }
    const unavailable = posts(locale, true, { production: true, verified: false, published: false, tier: false });
    assert.equal(unavailable[0].id, "card-status-id-123-unpublished");
    assert.equal(unavailable[0].title, copy.cardTitle); assert.equal(unavailable[0].badge, `0 ${copy.totalRatingSuffix}`);
    assert.equal(unavailable[0].metrics.length, 1);
    assert.equal(unavailable[1].title, copy.officialUnavailable); assert.equal(unavailable[1].body, copy.waitingBody);
  }
});

test("page forwards explicit flag to feed while keeping route gate off and name substitutions literal", () => {
  const feedNodes: ts.JsxSelfClosingElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "TouchlineSocialFeed") feedNodes.push(node);
    node.forEachChild(visit);
  }
  visit(ast); assert.equal(feedNodes.length, 1);
  const flag = feedNodes[0].attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.getText(ast) === "draftLocalesEnabled") as ts.JsxAttribute;
  assert.ok(flag && flag.initializer && ts.isJsxExpression(flag.initializer));
  assert.equal(flag.initializer.expression?.getText(ast), "draftLocalesEnabled");
  assert.ok(source.includes("return renderPlayerProfilePage(props, isTouchLineSiteLocalesEnabled(\"/touchline-players/[player]\"))"));
  assert.equal(route.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
  assert.equal(feed.formatTouchlinePlayerProfileFeedText("{playerName} / {clubName}", { playerName, clubName }), `${playerName} / ${clubName}`);
  assert.equal(feed.getTouchlinePlayerProfileFeedCopy("invalid", true), feed.getTouchlinePlayerProfileFeedCopy("en-GB"));
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
