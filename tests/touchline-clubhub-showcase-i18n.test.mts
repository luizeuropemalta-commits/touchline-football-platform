import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as rules from "../lib/touchlineArena/card-rules.ts";
import * as demo from "../lib/touchlineArena/demo-data.ts";
import * as coach from "../lib/touchlineArena/coach-card.ts";
import * as competition from "../lib/touchlineArena/coach-competition-projection.ts";
import { legacyCoachCatalogue } from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { buildTouchlineCardLeadershipValue } from "../lib/touchlineArena/card-leadership-authority.ts";
import { localizedCountryLabel } from "../lib/touchlineArena/country-labels.ts";
import { resolveTouchlineCoachZoomPresentation } from "../lib/touchlineArena/coach-zoom-i18n.ts";
import * as links from "../lib/touchlineArena/player-links.ts";
import * as copy from "../lib/touchlineArena/club-hub-showcase-i18n.ts";
import type { TouchLineCoachRankingState } from "../lib/touchlineArena/coach-ranking-server.ts";
import type { TouchlineClubHubRankedPlayer } from "../components/touchline/TouchlineCoachCategoryShowcase";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const source = readFileSync(new URL("../components/touchline/TouchlineCoachCategoryShowcase.tsx", import.meta.url), "utf8");
const esc = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));
const unavailable: TouchLineCoachRankingState = { phase: "unavailable", snapshotId: null, seasonId: null, scoringVersion: null, fixtureIds: [], generatedAt: null, rows: [] };

// Explicitly synthetic ranking transport. Real immutable seed identities/tiers
// exercise the presentation only; this is not evidence of current football facts.
function ranking(ranks = [1, 2, 3, 4, 5, 6, 7, 8]): TouchLineCoachRankingState {
  const catalogue = { ...legacyCoachCatalogue(), phase: "ready" as const, revision: 1 };
  return { ...unavailable, phase: "ranked", snapshotId: "synthetic-current-publication", seasonId: "2026-27", scoringVersion: "coach_scoring_v2", catalogue,
    rows: catalogue.current.slice(0, ranks.length).map(({ coach }, index) => ({ rank: ranks[index], coachProviderId: coach.providerId,
      coachName: coach.displayName, clubName: demo.TOUCHLINE_ENGLAND_CLUBS.find(club => club.teamId === coach.teamId)!.name,
      touchlinePoints: index ? 0 : 3, wins: index ? 0 : 1, draws: 0, losses: 0, awayWins: 0,
      home: { wins: index ? 0 : 1, draws: 0, losses: 0, touchlinePoints: index ? 0 : 3 }, away: { wins: 0, draws: 0, losses: 0, touchlinePoints: 0 } })) };
}
function players(): TouchlineClubHubRankedPlayer[] {
  return [1, 3, 4, 6, 8, 9, 12, 15].map((officialRank, index) => ({ officialRank, card: {
    id: `synthetic-${index}`, canonicalPlayerId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, providerPlayerId: String(100 + index),
    name: `Official $& Player <${index}>`, shortName: `Player ${index}`, role: "forward", position: "ST", clubName: "Manchester City", shirtNumber: 9,
    countryCode3: "ENG", touchlinePoints: 999, marketValue: "€1000000", marketValueSource: "verified-cache",
    publishedRanking: { snapshotId: "synthetic-current-publication", providerPlayerId: String(100 + index), totalRating: index ? 0 : 9.75, minutesPlayed: 90, appearances: 1 },
    editorialCard: { tierKey: index % 2 ? "sapphire-blue" : "ruby-red", cardPrice: { amountMinor: 1500, currency: "GBP" }, marketValueEur: 1000000, lastReviewedAt: "2026-11-04T00:00:00Z" },
  } }));
}
function compile(source: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, Intl, require: (name: string) => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; } });
  return exports;
}
function fixture(future = false, sentinels = false) {
  const captures: { kind: string; props: Record<string, unknown> }[] = [], requested: string[] = [];
  const leaf = (kind: string) => ({ default: (props: Record<string, unknown>) => { captures.push({ kind, props }); return React.createElement("span", { "data-leaf": kind }); } });
  const css = { default: new Proxy({}, { get: (_, key) => String(key) }) };
  const view = compile(source, {
    "next/link": { default: (props: Record<string, unknown>) => React.createElement("a", props, props.children as React.ReactNode) },
    "@/components/touchline/TouchlineClubPerimeterTrace": leaf("trace"),
    "@/components/touchline/cards/TouchlineEliteExactCard": leaf("player"),
    "@/components/touchline/cards/TouchlineCoachCardZoom": leaf("coach"),
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/club-hub-showcase-i18n": { getTouchlineClubHubShowcaseCopy: (locale: string, enabled = false) => {
      requested.push(locale); return sentinels ? Object.fromEntries(Object.keys(copy.TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES["en-GB"]).map(key => [key, `${locale}:${key}`])) : copy.getTouchlineClubHubShowcaseCopy(locale, enabled);
    } },
    "@/lib/touchlineArena/coach-card": coach, "@/lib/touchlineArena/coach-competition-projection": competition,
    "@/lib/touchlineArena/demo-data": demo, "@/lib/touchlineArena/player-links": links, "@/lib/touchlineArena/card-rules": rules,
    "./TouchlineCoachCategoryShowcase.module.css": css, "./TouchlineGlobalNavigation.module.css": css,
  });
  let authority: ReturnType<typeof buildTouchlineCardLeadershipValue> | null = null;
  const CoachZoom = compile(readFileSync(new URL("../components/touchline/cards/TouchlineCoachCardZoom.tsx", import.meta.url), "utf8"), {
    "@/lib/touchlineArena/card-rules": rules, "@/lib/touchlineArena/country-labels": { localizedCountryLabel },
    "@/lib/touchlineArena/coach-zoom-i18n": { resolveTouchlineCoachZoomPresentation }, "@/lib/touchlineArena/coach-competition-projection": competition,
    "./TouchlineCardLeadershipProvider": { useTouchlineCardLeadershipAuthority: () => authority }, "./TouchlineCoachCard": leaf("resolved-coach"), "./TouchlineCardZoom": leaf("zoom"),
  }).default as (props: Record<string, unknown>) => React.ReactElement<{ children: React.ReactElement<Record<string, unknown>>; expandedContent: React.ReactElement<Record<string, unknown>> }>;
  return { captures, requested, render(locale: string, entries: readonly TouchlineClubHubRankedPlayer[] | null, state: TouchLineCoachRankingState = unavailable) {
    captures.length = 0; requested.length = 0;
    const props = { locale, playerEntries: entries, coachRanking: state, draftLocalesEnabled: future }, before = JSON.stringify(props);
    const html = renderToStaticMarkup(React.createElement(view.default as React.ComponentType<typeof props>, props));
    assert.equal(JSON.stringify(props), before); return html;
  }, resolveCoach(props: Record<string, unknown>, state: TouchLineCoachRankingState) {
    authority = buildTouchlineCardLeadershipValue(null, state);
    const resolved = CoachZoom(props).props; return [resolved.children.props, resolved.expandedContent.props];
  } };
}

test("current ranking showcase copy covers eight locales while preserving the existing release gate", () => {
  assert.deepEqual(Object.keys(copy.TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES), locales);
  assert.deepEqual(copy.TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(copy.TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_STATUS, "draft");
  assert.equal(copy.getTouchlineClubHubShowcaseCopy("pt-BR").playerTitle, "Ranking atual de jogadores");
  assert.equal(copy.getTouchlineClubHubShowcaseCopy("pt-BR").coachTitle, "Ranking atual de treinadores");
  for (const locale of locales) {
    const value = copy.getTouchlineClubHubShowcaseCopy(locale, true);
    assert.deepEqual(Object.keys(value), Object.keys(copy.TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES["en-GB"]));
    for (const text of Object.values(value)) { assert.ok(text.trim()); assert.doesNotMatch(text, /TODO|FIXME|\{tierName\}|Erling Haaland/); }
    if (locale !== "en-GB" && locale !== "pt-BR") { assert.equal(i18n.isTouchLineLocaleComplete(locale), false); assert.deepEqual(copy.getTouchlineClubHubShowcaseCopy(locale), copy.getTouchlineClubHubShowcaseCopy("en-GB")); }
  }
  for (const locale of [undefined, null, "", "constructor", "__proto__", "pt", "PT-BR"]) assert.deepEqual(copy.getTouchlineClubHubShowcaseCopy(locale), copy.getTouchlineClubHubShowcaseCopy("en-GB"));
});

test("real showcase binds localized states, metrics and links without manufacturing seven placeholders", () => {
  const view = fixture(true, true);
  for (const locale of locales) {
    const empty = view.render(locale, [], { ...ranking(), phase: "preseason", snapshotId: null, scoringVersion: null, rows: [] });
    assert.deepEqual(view.requested, [locale]);
    for (const key of ["playerEyebrow", "playerTitle", "playerDescription", "coachEyebrow", "coachTitle", "coachDescription", "viewPlayers", "viewCoaches", "empty", "sourceNote"]) assert.ok(empty.includes(`${locale}:${key}`), key);
    assert.equal(view.captures.length, 0);
    const unavailableHtml = view.render(locale, null);
    assert.equal(unavailableHtml.split(`${locale}:unavailable`).length - 1, 2);
    assert.doesNotMatch(unavailableHtml, /data-tier=|data-coach-representative|<img/);
    const html = view.render(locale, players(), ranking());
    for (const key of ["playerMetric", "coachMetric", "openPlayer", "openCoach"]) assert.ok(html.includes(`${locale}:${key}`), key);
    assert.ok(html.includes(`/touchline-player-card-rankings?lang=${locale}`)); assert.ok(html.includes(`/rankings?lang=${locale}#coach-rankings`));
  }
});

test("real eight-locale SSR preserves transported top7 ranks, duplicate borders, identities, metric zero and full-quality card props", () => {
  const view = fixture(true), entries = players(), state = ranking();
  for (const locale of locales) {
    const html = view.render(locale, entries, state);
    assert.deepEqual([...html.matchAll(/class="rank">#(\d+)</g)].map(match => Number(match[1])), [1, 3, 4, 6, 8, 9, 12, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal((html.match(/data-ranking-leader="true"/g) ?? []).length, 2);
    assert.deepEqual([...html.matchAll(/data-tier="([^"]+)"/g)].slice(0, 7).map(match => match[1]), entries.slice(0, 7).map(entry => entry.card.editorialCard!.tierKey));
    assert.ok(!html.includes("Official $&amp; Player &lt;7&gt;")); assert.ok(html.includes("Official $&amp; Player &lt;0&gt;"));
    const playerLeaves = view.captures.filter(row => row.kind === "player"); assert.equal(playerLeaves.length, 7);
    playerLeaves.forEach(({ props }, index) => {
      assert.deepEqual(props.player, demo.squadCardToExactPlayer(entries[index].card)); assert.equal(props.runtimeLocaleOverride, locale);
      assert.equal(props.optimizeForLiveCompact, false); assert.equal(props.initialRenderScale, .34);
      assert.equal(props.showCardActions, false); assert.equal(props.showSocialMetrics, false); assert.equal(props.hideMarketValuePanel, false); assert.equal(props.subscribeToRanking, false);
      assert.ok(html.includes(esc(links.touchlinePlayerProfileHref(demo.squadCardToExactPlayer(entries[index].card), locale)!)));
    });
    const dictionary = copy.getTouchlineClubHubShowcaseCopy(locale, true), number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    assert.ok(html.includes(esc(`${number.format(9.75)} ${dictionary.playerMetric}`))); assert.ok(html.includes(esc(`${number.format(0)} ${dictionary.playerMetric}`)));
    assert.ok(!html.includes(esc(`${number.format(999)} ${dictionary.playerMetric}`)), "legacy touchlinePoints cannot become rating");
  }
});

test("coach compact and zoom retain immutable classification and canonical competition/crown instead of gallery position", () => {
  const view = fixture(true), state = ranking();
  for (const locale of locales) {
    view.render(locale, [], state);
    const leaves = view.captures.filter(row => row.kind === "coach"); assert.equal(leaves.length, 7);
    leaves.forEach(({ props }, index) => {
      const confirmed = state.catalogue!.current[index];
      assert.equal(props.coach, confirmed.coach);
      assert.deepEqual(props.slot, coach.createTouchlineArenaCoachSlot(confirmed.coach, confirmed.classification.finalPosition, confirmed.classification.tierKey));
      assert.deepEqual(props.competition, competition.coachCompetitionFromRanking(state, confirmed.coach.providerId));
      assert.equal(props.locale, locale); assert.equal(props.liveCompetitionUpdates, true); assert.equal(props.contract, null);
      assert.equal(props.assetLoading, "eager"); assert.equal(props.frameLoading, "eager");
      assert.equal(props.frameDisplaySizes, "(max-width: 410px) max(112px, 50vw), (max-width: 760px) 50vw, (max-width: 1180px) 25vw, 206px");
      assert.equal(Object.hasOwn(props, "showLeadershipCrown"), false);
      for (const resolved of view.resolveCoach(props, state)) { assert.equal(resolved.publishedTouchlinePoints, index ? 0 : 3); assert.equal(resolved.showLeadershipCrown, index === 0); }
    });
    const withoutLeader = { ...state, rows: state.rows.slice(1) };
    const html = view.render(locale, [], withoutLeader);
    assert.doesNotMatch(html, /data-ranking-leader="true"/);
    // A rank-gap sentinel tests transport only; it is deliberately not passed
    // to the canonical leadership parser, which requires sequential ranks.
    assert.ok(html.includes('class="rank">#2<'));
  }
});

test("missing published player or current coach fails closed without promoting eighth, history or legacy", () => {
  const view = fixture(true), entries = players(), state = ranking();
  for (const broken of [{ ...entries[0], card: { ...entries[0].card, editorialCard: null } }, { ...entries[0], officialRank: 0 }, { ...entries[0], card: { ...entries[0].card, publishedRanking: undefined } }]) {
    const html = view.render("pt-BR", [broken, ...entries.slice(1)], state);
    assert.equal(view.captures.filter(row => row.kind === "player").length, 0); assert.ok(html.includes(copy.getTouchlineClubHubShowcaseCopy("pt-BR").unavailable));
  }
  for (const catalogue of [legacyCoachCatalogue(), { ...state.catalogue!, current: state.catalogue!.current.slice(1) }]) {
    view.render("pt-BR", entries, { ...state, catalogue }); assert.equal(view.captures.filter(row => row.kind === "coach").length, 0);
  }
  const one = view.render("pt-BR", entries.slice(0, 1), { ...state, rows: state.rows.slice(0, 1) });
  assert.equal((one.match(/data-tier=/g) ?? []).length, 2, "fewer than seven confirmed entries stay fewer than seven");
});
