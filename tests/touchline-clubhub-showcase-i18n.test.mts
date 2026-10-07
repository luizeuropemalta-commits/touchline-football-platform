import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as tiers from "../lib/touchlineArena/card-tier-names.ts";
import * as rules from "../lib/touchlineArena/card-rules.ts";
import * as selection from "../lib/touchlineArena/clubhub-tier-showcase.ts";
import * as demo from "../lib/touchlineArena/demo-data.ts";
import * as gallery from "../lib/touchlineArena/coach-tier-gallery.ts";
import * as coach from "../lib/touchlineArena/coach-card.ts";
import * as competition from "../lib/touchlineArena/coach-competition-projection.ts";
import * as links from "../lib/touchlineArena/player-links.ts";
import type { TouchLineCoachRankingState } from "../lib/touchlineArena/coach-ranking-server.ts";

const load = () => import("../lib/touchlineArena/club-hub-showcase-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": {
    playerEyebrow: "TouchLine player borders", playerTitle: "Seven official player-card borders",
    playerDescription: "Ordered from the highest-value border to the entry border. Each card is a real published representative with the highest verified market value in its tier; Erling Haaland leads Golden Diamond.",
    coachEyebrow: "TouchLine coach borders", coachTitle: "Seven official coach-card borders",
    coachDescription: "Each representative keeps the same border as their official profile. Within each tier, approved previous-season results determine the representative. Borders without an eligible coach remain pending.",
    verifiedValue: "Verified market value", previousFinish: "Previous-season finish", promotedChampion: "Promoted champion", promotedPlayoff: "Promoted through play-offs", approvedFallback: "Approved promotion fallback",
    representativePending: "Representative pending", representativePendingDescription: "No current coach has approved evidence for this border. TouchLine will not borrow another coach’s position.",
    playerPending: "Published representative pending", playerPendingDescription: "No published card currently owns this border.",
    openPlayer: "Open player profile", openCoach: "Open coach profile", sourceNote: "Only published player cards and immutable coach classifications appear here. Missing evidence remains explicit.",
  },
  "pt-BR": {
    playerEyebrow: "Bordas de jogadores TouchLine", playerTitle: "As sete bordas oficiais dos cards de jogadores",
    playerDescription: "Ordem da borda de maior valor até a borda de entrada. Cada card é um representante real publicado com o maior valor de mercado verificado do seu tier; Erling Haaland lidera o Diamante Dourado.",
    coachEyebrow: "Bordas de treinadores TouchLine", coachTitle: "As sete bordas oficiais dos cards de treinadores",
    coachDescription: "Cada representante mantém a mesma borda do seu perfil oficial. Dentro de cada tier, os resultados aprovados da temporada anterior definem o representante. Bordas sem treinador elegível permanecem pendentes.",
    verifiedValue: "Valor de mercado verificado", previousFinish: "Posição na temporada anterior", promotedChampion: "Campeão promovido", promotedPlayoff: "Promovido pelos play-offs", approvedFallback: "Fallback de promoção aprovado",
    representativePending: "Representante pendente", representativePendingDescription: "Nenhum treinador atual possui evidência aprovada para esta borda. A TouchLine não empresta a posição de outro treinador.",
    playerPending: "Representante publicado pendente", playerPendingDescription: "Nenhum card publicado ocupa esta borda no momento.",
    openPlayer: "Abrir perfil do jogador", openCoach: "Abrir perfil do treinador", sourceNote: "Somente cards de jogadores publicados e classificações imutáveis de treinadores aparecem aqui. Evidência ausente permanece explícita.",
  },
};
type Copy = Record<keyof typeof baseline["en-GB"], string>;
const source = readFileSync(new URL("../components/touchline/TouchlineCoachCategoryShowcase.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("showcase.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const esc = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));

test("showcase preserves approved eighteen EN/PT messages and six public draft gates", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES), locales);
  assert.deepEqual(mod.TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(baseline["en-GB"])); assert.equal(Object.keys(copy).length, 18);
    for (const value of Object.values(copy)) { assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME/); }
    assert.ok(copy.playerDescription.includes("Erling Haaland")); assert.ok(copy.playerEyebrow.includes("TouchLine"));
    assert.deepEqual(copy.playerDescription.match(/\{\w+\}/g), locale === "pt-BR" ? null : ["{tierName}"]);
    if (locale === "en-GB" || locale === "pt-BR") assert.deepEqual(mod.getTouchlineClubHubShowcaseCopy(locale), baseline[locale]);
    else { assert.deepEqual(mod.getTouchlineClubHubShowcaseCopy(locale), baseline["en-GB"]); assert.equal(i18n.isTouchLineLocaleComplete(locale), false); }
  }
  for (const locale of [null, undefined, "", "constructor", "__proto__", "pt", "PT-BR"]) assert.deepEqual(mod.getTouchlineClubHubShowcaseCopy(locale), baseline["en-GB"]);
});

function compile(source: string, dependencies: Record<string, unknown>, context: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, require: (name: string) => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; }, ...context });
  return exports;
}
async function fixture(future = false, sentinels = false, tierSentinel?: string, representatives?: ReturnType<typeof selection.selectTouchlineCoachTierRepresentatives>) {
  const _mod = await load();
  const tierName = tiers.touchlineCardTierName;
  const requested: string[] = [], tierCalls: string[][] = [];
  const catalogue = compile(readFileSync(new URL("../lib/touchlineArena/club-hub-showcase-i18n.ts", import.meta.url), "utf8"), {
    "./i18n.ts": i18n,
    "./catalogue-locale.ts": catalogueLocale,
    "./card-tier-names.ts": { touchlineCardTierName: (tier: string, locale: string, enabled = false) => { tierCalls.push([tier, locale]); return tierSentinel ?? tierName(tier as tiers.TouchlineCardTierKey, locale, enabled); } },
  });
  const getter = catalogue.getTouchlineClubHubShowcaseCopy as typeof _mod.getTouchlineClubHubShowcaseCopy;
  const captures: { kind: string; props: Record<string, unknown> }[] = [];
  const leaf = (kind: string) => ({ default: (props: Record<string, unknown>) => { captures.push({ kind, props }); return React.createElement("span", { "data-leaf": kind }); } });
  const dependencies = {
    "next/link": { default: (props: Record<string, unknown>) => React.createElement("a", props, props.children as React.ReactNode) },
    "@/components/touchline/TouchlineClubPerimeterTrace": leaf("trace"),
    "@/components/touchline/cards/TouchlineEliteExactCard": leaf("player"),
    "@/components/touchline/cards/TouchlineCoachCardZoom": leaf("coach"),
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/club-hub-showcase-i18n": { getTouchlineClubHubShowcaseCopy: (locale: string, enabled = false) => {
      requested.push(locale); return sentinels ? Object.fromEntries(Object.keys(baseline["en-GB"]).map(key => [key, `${locale}:${key}`])) : getter(locale, enabled);
    } },
    "@/lib/touchlineArena/coach-tier-gallery": gallery, "@/lib/touchlineArena/coach-card": coach,
    "@/lib/touchlineArena/coach-competition-projection": competition, "@/lib/touchlineArena/clubhub-tier-showcase": representatives
      ? { ...selection, selectTouchlineCoachTierRepresentatives: () => representatives } : selection,
    "@/lib/touchlineArena/demo-data": demo,
    "@/lib/touchlineArena/player-links": links, "@/lib/touchlineArena/card-rules": { ...rules, touchlineCardTierName: tierName },
    "./TouchlineCoachCategoryShowcase.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const view = compile(source, dependencies);
  return { getter, tierCalls, captures, requested, render(locale: string, cards: demo.ClubOwnerSquadCard[], ranking: TouchLineCoachRankingState = unavailable) {
    captures.length = 0; requested.length = 0;
    const props = { locale, playerCards: cards, coachRanking: ranking, draftLocalesEnabled: future }, before = JSON.stringify(props);
    const html = renderToStaticMarkup(React.createElement(view.default as React.ComponentType<typeof props>, props));
    assert.equal(JSON.stringify(props), before); return html;
  } };
}
const unavailable: TouchLineCoachRankingState = { phase: "unavailable", snapshotId: null, seasonId: null, scoringVersion: null, fixtureIds: [], generatedAt: null, rows: [] };
function player(name: string, tierKey: tiers.TouchlineCardTierKey, value: number | null): demo.ClubOwnerSquadCard {
  const card: demo.ClubOwnerSquadCard = { id: name, canonicalPlayerId: "00000000-0000-4000-8000-000000000001", name, shortName: name, role: "forward", position: "ST", clubName: "Official $& Club <A>",
    shirtNumber: 9, countryCode3: "ENG", touchlinePoints: 0, marketValue: "Pending", marketValueSource: "verified-cache",
    editorialCard: { tierKey, cardPrice: { amountMinor: 1500, currency: "GBP" }, ...(value === null ? {} : { marketValueEur: value }), lastReviewedAt: "2026-08-27T00:00:00Z" } };
  // Explicit legacy boundary probe: the component's existing nullish fallback
  // tolerates null even though the canonical DTO only permits absent/number.
  if (value === null) Reflect.set(card.editorialCard!, "marketValueEur", null);
  return card;
}

test("real showcase forwards all eight isolated locales and safely interpolates the canonical tier", async () => {
  const view = await fixture(true, false, "Tier $& <official>");
  for (const locale of locales) {
    const text = view.getter(locale, true).playerDescription;
    if (locale === "pt-BR") assert.equal(text, baseline[locale].playerDescription);
    else { assert.ok(text.includes("Tier $& <official>")); assert.ok(!text.includes("{tierName}")); }
  }
  assert.ok(view.tierCalls.every(([tier]) => tier === "diamond-gold"));
  const sentinel = await fixture(true, true);
  for (const locale of locales) {
    const html = sentinel.render(locale, []);
    assert.deepEqual(sentinel.requested, [locale]);
    for (const key of ["playerEyebrow", "playerTitle", "playerDescription", "coachEyebrow", "coachTitle", "coachDescription", "playerPending", "playerPendingDescription", "representativePending", "representativePendingDescription", "sourceNote"]) assert.ok(html.includes(`${locale}:${key}`), `${locale}:${key}`);
    assert.ok(sentinel.captures.filter(row => row.kind === "coach").every(row => row.props.locale === locale));
  }
});

test("real eight-locale SSR preserves representatives, seven-tier order, names, links and zero/null market values", async () => {
  const view = await fixture(true);
  const cards = [player("Official $& Player <Z>", "ruby-red", 0), player("Null $& Player", "sapphire-blue", null), player("Erling Haaland", "diamond-gold", 180_000_000), player("Higher numeric value", "diamond-gold", 200_000_000)];
  for (const locale of locales) {
    const html = view.render(locale, cards), copy = view.getter(locale, true);
    for (const key of ["playerEyebrow", "playerTitle", "playerDescription", "coachEyebrow", "coachTitle", "coachDescription", "sourceNote"] as const) assert.ok(html.includes(esc(copy[key])), `${locale}:${key}`);
    assert.deepEqual([...html.matchAll(/data-tier="([^"]+)"/g)].map(match => match[1]), [...selection.TOUCHLINE_CLUBHUB_TIER_ORDER, ...selection.TOUCHLINE_CLUBHUB_TIER_ORDER]);
    const players = view.captures.filter(row => row.kind === "player"); assert.equal(players.length, 3);
    assert.ok(!html.includes("Higher numeric value")); assert.ok(html.includes("Official $&amp; Player &lt;Z&gt;"));
    for (const row of players) {
      assert.equal(row.props.runtimeLocaleOverride, locale);
      assert.equal(row.props.showCardActions, false);
      assert.equal(row.props.showSocialMetrics, false);
      assert.equal(row.props.hideMarketValuePanel, true, "the public showcase must not render a market-value panel");
    }
    for (const card of cards.slice(0, 3)) {
      assert.ok(html.includes(`aria-label="${esc(`${copy.openPlayer}: ${card.name}`)}"`));
      assert.ok(html.includes(esc(links.touchlinePlayerProfileHref(demo.squadCardToExactPlayer(card), locale))));
    }
    assert.ok(!html.includes(esc(copy.verifiedValue)), "the public showcase must not render its market-value label");
    const coaches = view.captures.filter(row => row.kind === "coach");
    const reps = selection.selectTouchlineCoachTierRepresentatives().filter(row => row.snapshot && row.classification);
    assert.equal(coaches.length, reps.length);
    coaches.forEach((row, index) => {
      const official = reps[index].snapshot!;
      assert.equal(row.props.coach, official.coach); assert.equal(row.props.locale, locale);
      assert.equal(row.props.competition, null); assert.equal(row.props.publishedTouchlinePoints, null); assert.equal(row.props.showLeadershipCrown, false);
      assert.ok(html.includes(esc(`${copy.openCoach}: ${official.coach.displayName}`)));
      assert.equal(row.props.profileHref, `/touchline-coaches/${encodeURIComponent(official.coach.providerId)}?lang=${encodeURIComponent(locale)}`);
    });
    const empty = view.render(locale, []); assert.equal(view.captures.filter(row => row.kind === "player").length, 0);
    assert.equal(empty.split(esc(copy.playerPendingDescription)).length - 1, 7);
  }
  const publicView = await fixture();
  for (const locale of locales.slice(2)) assert.ok(publicView.render(locale, []).includes(baseline["en-GB"].playerTitle));
});

test("real selector and ranking projection preserve publication absence, coach slots, crown ownership and zero points", async () => {
  const view = await fixture(true);
  const reps = selection.selectTouchlineCoachTierRepresentatives().filter(row => row.snapshot && row.classification);
  const ranking: TouchLineCoachRankingState = {
    ...unavailable, phase: "ranked", snapshotId: "snapshot-verified", seasonId: "2026-27", scoringVersion: "coach_scoring_v2", fixtureIds: ["fixture-verified"],
    rows: reps.map((rep, index) => ({ rank: index + 1, coachProviderId: rep.snapshot!.coach.providerId, coachName: rep.snapshot!.coach.displayName,
      clubName: "Official Club", touchlinePoints: index ? 0 : 3, wins: index ? 0 : 1, draws: 0, losses: 0, awayWins: 0,
      home: { wins: index ? 0 : 1, draws: 0, losses: 0, touchlinePoints: index ? 0 : 3 }, away: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 } })),
  };
  const absent = { ...player("Must not publish", "diamond-gold", 99), editorialCard: null };
  for (const locale of locales) {
    const html = view.render(locale, [absent], ranking);
    assert.ok(!html.includes("Must not publish")); assert.equal(view.captures.filter(row => row.kind === "player").length, 0);
    const coaches = view.captures.filter(row => row.kind === "coach");
    coaches.forEach((row, index) => {
      const rep = reps[index];
      assert.deepEqual(row.props.slot, coach.createTouchlineArenaCoachSlot(rep.snapshot!.coach, rep.classification!.finalPosition ?? null, rep.classification!.tierKey));
      assert.deepEqual(row.props.competition, competition.coachCompetitionFromRanking(ranking, rep.snapshot!.coach.providerId));
      assert.equal(row.props.publishedTouchlinePoints, index ? 0 : 3); assert.equal(row.props.showLeadershipCrown, index === 0);
      assert.equal(row.props.contract, null); assert.equal(row.props.assetLoading, "eager"); assert.equal(row.props.frameLoading, "eager");
    });
  }
});

test("real evidence helper retains final-position truthiness and all promotion branches", async () => {
  const view = await fixture(true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "coachEvidenceLabel")!;
  const code = ts.transpileModule(`${declaration.getText(ast)}\ncoachEvidenceLabel;`, { compilerOptions: { target: ts.ScriptTarget.ES2017 } }).outputText;
  const label = runInNewContext(code, {}) as (input: { finalPosition: number | null; promotionType: string | null }, copy: Copy) => string;
  for (const locale of locales) {
    const copy = view.getter(locale, true);
    assert.equal(label({ finalPosition: 2, promotionType: "champions" }, copy), `${copy.previousFinish}: 2`);
    assert.equal(label({ finalPosition: 0, promotionType: "champions" }, copy), `${copy.promotedChampion} · ${copy.approvedFallback}`);
    assert.equal(label({ finalPosition: null, promotionType: "playoff-winners" }, copy), `${copy.promotedPlayoff} · ${copy.approvedFallback}`);
    for (const promotionType of [null, "runners-up", "unknown"]) assert.equal(label({ finalPosition: null, promotionType }, copy), copy.approvedFallback);
  }
});

test("real JSX renders promotion and position evidence with synthetic records only at the selector boundary", async () => {
  const original = selection.selectTouchlineCoachTierRepresentatives();
  const first = original.find(row => row.snapshot && row.classification)!;
  const cases = [
    { finalPosition: 2, promotionType: "champions", keys: ["previousFinish"] },
    { finalPosition: 0, promotionType: "champions", keys: ["promotedChampion", "approvedFallback"] },
    { finalPosition: null, promotionType: "playoff-winners", keys: ["promotedPlayoff", "approvedFallback"] },
    { finalPosition: null, promotionType: "runners-up", keys: ["approvedFallback"] },
  ] as const;
  for (const item of cases) {
    const representatives = original.map(row => row.tierKey === first.tierKey ? {
      ...first, snapshot: { ...first.snapshot!, coach: { ...first.snapshot!.coach, displayName: "Official $& Coach <A>" } },
      classification: { ...first.classification!, finalPosition: item.finalPosition, promotionType: item.promotionType },
    } : { ...row, snapshot: null, classification: null });
    const view = await fixture(true, true, undefined, representatives);
    for (const locale of locales) {
      const html = view.render(locale, [player("Official $& Player", "ruby-red", 0)]);
      for (const key of [...item.keys, "openPlayer", "openCoach"]) assert.ok(html.includes(`${locale}:${key}`), `${locale}:${key}`);
      assert.ok(html.includes("Official $&amp; Coach &lt;A&gt;"));
      assert.equal(view.captures.filter(row => row.kind === "coach").length, 1);
    }
  }
});

test("showcase JSX, tier styling and evidence logic remain byte-identical to the admitted preimage", () => {
  const expected: Record<string, string> = { tierStyle: "9a8dfb2be2686c166f3cf1b0016a95addb3b8fd40434a314f11e2e26c314a8eb", coachEvidenceLabel: "25f8f180c73eafb7a25d092a68fbb6d6fb3ea1434790fd6e76d3b85e24e9449c" };
  for (const node of ast.statements) if (ts.isFunctionDeclaration(node)) {
    if (node.name?.text === "TouchlineCoachCategoryShowcase") {
      let preimage = node.body!.statements.find(ts.isReturnStatement)!.getText(ast);
      // Only the three later opt-in bindings are inverted. Public price-panel
      // removal was already in this admitted JSX digest and remains required.
      for (const [added, previous, count] of [
        ['touchlineCardTierName(tierKey, effectiveLocale, draftLocalesEnabled)', 'touchlineCardTierName(tierKey, effectiveLocale)', 2],
        ['<TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled}', '<TouchlineEliteExactCard', 1],
        ['<TouchlineCoachCardZoom draftLocalesEnabled={draftLocalesEnabled}', '<TouchlineCoachCardZoom', 1],
      ] as const) {
        assert.equal(preimage.split(added).length - 1, count, `exact authorized delta: ${added}`);
        preimage = preimage.split(added).join(previous);
      }
      assert.equal(hash(preimage), "f9f5982dcaf2ef3179487afdcc209ccf461281a237648f714511a7f3197dec69");
    }
    else assert.equal(hash(node.getText(ast)), expected[node.name!.text]);
  }
});
