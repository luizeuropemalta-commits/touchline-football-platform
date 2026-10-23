import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { chromium } from "@playwright/test";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as tiers from "../lib/touchlineArena/card-tier-names.ts";
import * as rules from "../lib/touchlineArena/card-rules.ts";
import * as selection from "../lib/touchlineArena/clubhub-tier-showcase.ts";
import * as demo from "../lib/touchlineArena/demo-data.ts";
import * as gallery from "../lib/touchlineArena/coach-tier-gallery.ts";
import * as coach from "../lib/touchlineArena/coach-card.ts";
import * as competition from "../lib/touchlineArena/coach-competition-projection.ts";
import { buildTouchlineCardLeadershipValue } from "../lib/touchlineArena/card-leadership-authority.ts";
import { localizedCountryLabel } from "../lib/touchlineArena/country-labels.ts";
import { resolveTouchlineCoachZoomPresentation } from "../lib/touchlineArena/coach-zoom-i18n.ts";
import * as links from "../lib/touchlineArena/player-links.ts";
import type { TouchLineCoachRankingState } from "../lib/touchlineArena/coach-ranking-server.ts";

const load = () => import("../lib/touchlineArena/club-hub-showcase-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": {
    playerEyebrow: "TouchLine player borders", playerTitle: "Seven official player-card borders",
    playerDescription: "Ordered from the highest-value border to the entry border. Each card is a real published representative with the highest verified market value in its tier; Erling Haaland leads Golden Diamond.",
    coachEyebrow: "TouchLine coach borders", coachTitle: "Seven official coach-card borders",
    coachDescription: "A complete verified current ranking selects the representative for each border. If that ranking is unavailable, the last verified representative remains visible rather than guessing a colour.",
    verifiedValue: "Verified market value", previousFinish: "Previous-season finish", promotedChampion: "Promoted champion", promotedPlayoff: "Promoted through play-offs", approvedFallback: "Approved promotion fallback",
    representativePending: "Representative pending", representativePendingDescription: "No current coach has approved evidence for this border. TouchLine will not borrow another coach’s position.",
    playerPending: "Published representative pending", playerPendingDescription: "No published card currently owns this border.",
    openPlayer: "Open player profile", openCoach: "Open coach profile", sourceNote: "Only published player cards and verified coach-ranking snapshots appear here. Missing evidence remains explicit.",
  },
  "pt-BR": {
    playerEyebrow: "Bordas de jogadores TouchLine", playerTitle: "As sete bordas oficiais dos cards de jogadores",
    playerDescription: "Ordem da borda de maior valor até a borda de entrada. Cada card é um representante real publicado com o maior valor de mercado verificado do seu tier; Erling Haaland lidera o Diamante Dourado.",
    coachEyebrow: "Bordas de treinadores TouchLine", coachTitle: "As sete bordas oficiais dos cards de treinadores",
    coachDescription: "Um ranking atual completo e verificado seleciona o representante de cada borda. Se esse ranking não estiver disponível, o último representante verificado permanece visível sem adivinhar uma cor.",
    verifiedValue: "Valor de mercado verificado", previousFinish: "Posição na temporada anterior", promotedChampion: "Campeão promovido", promotedPlayoff: "Promovido pelos play-offs", approvedFallback: "Fallback de promoção aprovado",
    representativePending: "Representante pendente", representativePendingDescription: "Nenhum treinador atual possui evidência aprovada para esta borda. A TouchLine não empresta a posição de outro treinador.",
    playerPending: "Representante publicado pendente", playerPendingDescription: "Nenhum card publicado ocupa esta borda no momento.",
    openPlayer: "Abrir perfil do jogador", openCoach: "Abrir perfil do treinador", sourceNote: "Somente cards de jogadores publicados e snapshots verificados do ranking de treinadores aparecem aqui. Evidência ausente permanece explícita.",
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
      ? { ...selection, selectTouchlineCoachTierRepresentativesFromRanking: () => representatives.map((row) => ({ ...row, rankingRow: null })) } : selection,
    "@/lib/touchlineArena/demo-data": demo,
    "@/lib/touchlineArena/player-links": links, "@/lib/touchlineArena/card-rules": { ...rules, touchlineCardTierName: tierName },
    "./TouchlineCoachCategoryShowcase.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const view = compile(source, dependencies);
  let coachAuthority: ReturnType<typeof buildTouchlineCardLeadershipValue> | null = null;
  const CoachZoom = compile(readFileSync(new URL("../components/touchline/cards/TouchlineCoachCardZoom.tsx", import.meta.url), "utf8"), {
    "@/lib/touchlineArena/card-rules": rules,
    "@/lib/touchlineArena/country-labels": { localizedCountryLabel },
    "@/lib/touchlineArena/coach-zoom-i18n": { resolveTouchlineCoachZoomPresentation },
    "@/lib/touchlineArena/coach-competition-projection": competition,
    "./TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => coachAuthority },
    "./TouchlineCoachCard": leaf("resolved-coach"), "./TouchlineCardZoom": leaf("zoom"),
  }).default as (props: Record<string, unknown>) => React.ReactElement<{
    children: React.ReactElement<Record<string, unknown>>;
    expandedContent: React.ReactElement<Record<string, unknown>>;
  }>;
  return { getter, tierCalls, captures, requested,
    resolveCoach(props: Record<string, unknown>, ranking: TouchLineCoachRankingState) {
      coachAuthority = buildTouchlineCardLeadershipValue(null, ranking);
      const original = JSON.stringify(props);
      const resolved = CoachZoom(props).props;
      assert.equal(JSON.stringify(props), original);
      return [resolved.children.props, resolved.expandedContent.props];
    },
    render(locale: string, cards: demo.ClubOwnerSquadCard[], ranking: TouchLineCoachRankingState = unavailable) {
      captures.length = 0; requested.length = 0;
      const props = { locale, playerCards: cards, coachRanking: ranking, draftLocalesEnabled: future }, before = JSON.stringify(props);
      const html = renderToStaticMarkup(React.createElement(view.default as React.ComponentType<typeof props>, props));
      assert.equal(JSON.stringify(props), before); return html;
    },
  };
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
      assert.equal(row.props.hideMarketValuePanel, false, "public cards preserve football market value while commercial card prices stay absent");
    }
    for (const card of cards.slice(0, 3)) {
      assert.ok(html.includes(`aria-label="${esc(`${copy.openPlayer}: ${card.name}`)}"`));
      assert.ok(html.includes(esc(links.touchlinePlayerProfileHref(demo.squadCardToExactPlayer(card), locale))));
    }
    assert.ok(!html.includes(esc(copy.verifiedValue)), "the outer showcase must not duplicate the value label owned by the card");
    const coaches = view.captures.filter(row => row.kind === "coach");
    const reps = selection.selectTouchlineCoachTierRepresentatives().filter(row => row.snapshot && row.classification);
    assert.equal(coaches.length, reps.length);
    coaches.forEach((row, index) => {
      const official = reps[index].snapshot!;
      assert.equal(row.props.coach, official.coach); assert.equal(row.props.locale, locale);
      assert.equal(row.props.competition, null);
      assert.equal(row.props.liveCompetitionUpdates, true);
      assert.equal(Object.hasOwn(row.props, "publishedTouchlinePoints"), false);
      assert.equal(Object.hasOwn(row.props, "showLeadershipCrown"), false);
      for (const card of view.resolveCoach(row.props, unavailable)) {
        assert.equal(card.publishedTouchlinePoints, null); assert.equal(card.showLeadershipCrown, false);
      }
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
      assert.equal(row.props.liveCompetitionUpdates, true);
      assert.equal(Object.hasOwn(row.props, "publishedTouchlinePoints"), false);
      assert.equal(Object.hasOwn(row.props, "showLeadershipCrown"), false);
      for (const card of view.resolveCoach(row.props, ranking)) {
        assert.equal(card.publishedTouchlinePoints, index ? 0 : 3); assert.equal(card.showLeadershipCrown, index === 0);
      }
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

test("showcase JSX, tier styling and evidence logic retain the admitted preimage except approved locale, value, pending-state and live-publication changes", () => {
  const expected: Record<string, string> = { tierStyle: "9a8dfb2be2686c166f3cf1b0016a95addb3b8fd40434a314f11e2e26c314a8eb", coachEvidenceLabel: "dfadad058ffafad7a157dc1a1600e7b7a35cc408013cd3d5bb84ec5584478d4f" };
  for (const node of ast.statements) if (ts.isFunctionDeclaration(node)) {
    if (node.name?.text === "TouchlineCoachCategoryShowcase") {
      let preimage = node.body!.statements.find(ts.isReturnStatement)!.getText(ast);
      // Invert only the admitted locale bindings and the explicitly authorized
      // restoration of football market value (not commercial card price), plus
      // the public live-record opt-in replacing frozen point/crown props.
      for (const [added, previous, count] of [
        ['touchlineCardTierName(tierKey, effectiveLocale, draftLocalesEnabled)', 'touchlineCardTierName(tierKey, effectiveLocale)', 2],
        ['<TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled}', '<TouchlineEliteExactCard', 1],
        ['<TouchlineCoachCardZoom draftLocalesEnabled={draftLocalesEnabled}', '<TouchlineCoachCardZoom', 1],
        ['hideMarketValuePanel={false}', 'hideMarketValuePanel', 1],
        ['                        liveCompetitionUpdates\n', '                        publishedTouchlinePoints={competition?.totalTouchlinePoints ?? null}\n                        showLeadershipCrown={competition?.rank === 1}\n', 1],
      ] as const) {
        assert.equal(preimage.split(added).length - 1, count, `exact authorized delta: ${added}`);
        preimage = preimage.split(added).join(previous);
      }
      // The explicit pending-state placeholder replaces headless coach artwork;
      // the evidence selector and all populated coach-card branches stay fixed.
      assert.equal(hash(preimage), "2cc102d7c3d13796c026aa6f42f738a7223c63894f3daa1e379c45de2e3ea234");
    }
    else assert.equal(hash(node.getText(ast)), expected[node.name!.text]);
  }
});

test("pending Ruby coach is a complete branded state at desktop and phone widths", async () => {
  const view = await fixture(true);
  const shield = readFileSync(new URL("../public/touchlineArena/brand/tl-shield-lime.svg", import.meta.url)).toString("base64");
  const css = readFileSync(new URL("../components/touchline/TouchlineCoachCategoryShowcase.module.css", import.meta.url), "utf8");
  const html = view.render("pt-BR", []).replaceAll("/touchlineArena/brand/tl-shield-lime.svg", `data:image/svg+xml;base64,${shield}`);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.setContent(`<style>body{margin:0;background:#07100e;color:#fff}${css}</style>${html}`);
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const pending = page.locator('[data-coach-representative="pending"]');
      assert.equal(await pending.count(), 1);
      assert.equal(await pending.getByText("Representante pendente").isVisible(), true);
      assert.equal(await pending.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.TOUCHLINE_VISUAL_CAPTURE && width === 1600) await pending.screenshot({ path: process.env.TOUCHLINE_VISUAL_CAPTURE });
    }
  } finally { await browser.close(); }
});
