import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import {
  buildTouchlineRankingSummaryIndex, projectTouchlinePublishedRankingSummary,
  type TouchlineRankingSummaryIndex,
} from "../lib/touchlineArena/published-ranking-summary.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import {
  allowsInheritedCardLeadership, buildTouchlineCardLeadershipValue, EMPTY_CARD_LEADERSHIP_AUTHORITY,
  type TouchlineCardLeadershipAuthority,
} from "../lib/touchlineArena/card-leadership-authority.ts";
import { getTouchLineRankingsCopy } from "../lib/touchlineArena/rankings-i18n.ts";
import { TOUCHLINE_APPROVED_LOCALES } from "../lib/touchlineArena/i18n.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function card(n: number): ClubOwnerSquadCard {
  return { id: id(n), canonicalPlayerId: id(n), providerPlayerId: String(100 + n), name: `Player ${n}`, shortName: `P${n}`,
    clubName: "Arsenal", role: "ST", position: "ST", shirtNumber: n, marketValue: "€1m", touchlinePoints: 0,
    seasonTotalRating: 999, matchStats: { goals: 500 },
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" } };
}
function ranking(snapshotId: string, count = 7, totalRating: number | null = 10): TouchlineActiveRankingState {
  return { ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked", leagueKey: "touchline-england", snapshotId,
    seasonId: "season-2026", roundId: "round-8", publishedAt: "2026-10-23T12:00:00Z", scoringVersion: "player_scoring_v4",
    coverageStatus: "complete", fixtureIds: ["19722190"], expectedFixtureIds: ["19722190"],
    players: Array.from({ length: count }, (_, index) => ({ playerId: id(index + 1), providerPlayerId: String(101 + index),
      totalRating, minutesPlayed: 90, appearances: 1, positionGroup: "striker", positionRank: index + 1, groupSize: count,
      tierKey: "ruby-red", priceTc: 99999 })),
    leadershipDecision: null,
    cardGoals: { source: "published-card-goals-v1", snapshotId, rows: Array.from({ length: Math.max(count, 8) }, (_, index) => ({
      playerId: id(index + 1), goals: index === 7 ? 20 : 0,
    })) },
  };
}
const catalogue = Array.from({ length: 8 }, (_, index) => card(index + 1));

test("summary index is a compact unique public identity binding, never a duplicate card DTO", () => {
  const before = JSON.stringify(catalogue);
  const index = buildTouchlineRankingSummaryIndex(catalogue);
  assert.ok(index);
  assert.equal(index.length, catalogue.length);
  for (const [offset, identity] of index.entries()) {
    assert.deepEqual(Object.keys(identity).sort(), ["playerId", "providerPlayerId"]);
    assert.deepEqual(identity, { playerId: id(offset + 1), providerPlayerId: String(101 + offset) });
  }
  assert.equal(JSON.stringify(catalogue), before);
  assert.deepEqual(buildTouchlineRankingSummaryIndex([]), []);
  assert.equal(buildTouchlineRankingSummaryIndex(null), null);
  assert.equal(buildTouchlineRankingSummaryIndex(undefined), null);
  for (const invalid of [
    [...catalogue, { ...card(9), canonicalPlayerId: id(1).toUpperCase() }],
    [...catalogue, { ...card(9), providerPlayerId: " 101 " }],
    [{ ...card(1), canonicalPlayerId: "not-a-uuid" }],
    [{ ...card(1), providerPlayerId: " " }],
    [{ ...card(1), editorialCard: null }],
  ]) assert.equal(buildTouchlineRankingSummaryIndex(invalid), null);
});

test("membership follows A -> B -> A, excludes goals-only extras, and includes null/zero/negative ratings", () => {
  const index = buildTouchlineRankingSummaryIndex(catalogue);
  const a = ranking("A"), b = ranking("B", 8);
  for (const [state, count] of [[a, 7], [b, 8], [a, 7]] as const) {
    const result = projectTouchlinePublishedRankingSummary(index, state);
    assert.deepEqual(result, { phase: "ready", totalRankedCards: count });
    assert.ok(result.totalRankedCards! <= index!.length, "count is bounded by verified unique bindings");
  }
  for (const total of [null, 0, -25]) {
    const state = ranking(`all-${total}`, 7, total);
    assert.equal(state.leadershipDecision, null, "membership does not manufacture a prize or a finite score");
    assert.deepEqual(projectTouchlinePublishedRankingSummary(index, state), { phase: "ready", totalRankedCards: 7 });
  }
});

test("unknown or mismatched ranked identities never produce a partial count, including null-rated rows", () => {
  const index = buildTouchlineRankingSummaryIndex(catalogue);
  for (const total of [30, null]) {
    const unknown = ranking("unknown", 9, total);
    assert.deepEqual(projectTouchlinePublishedRankingSummary(index, unknown), {
      phase: "incomplete", totalRankedCards: null, reason: "unknown-player",
    });
    assert.deepEqual(projectTouchlinePublishedRankingSummary(buildTouchlineRankingSummaryIndex([...catalogue, card(9)]), unknown), {
      phase: "ready", totalRankedCards: 9,
    });
  }
  const mismatched = ranking("mismatch");
  mismatched.players = mismatched.players.map((row, offset) => offset ? row : { ...row, providerPlayerId: "different" });
  assert.deepEqual(projectTouchlinePublishedRankingSummary(index, mismatched), {
    phase: "incomplete", totalRankedCards: null, reason: "provider-mismatch",
  });
  const duplicate = ranking("duplicate");
  duplicate.players = [...duplicate.players, duplicate.players[0]!];
  assert.equal(projectTouchlinePublishedRankingSummary(index, duplicate).phase, "incomplete");
  const duplicateProvider = ranking("duplicate-provider");
  duplicateProvider.players = duplicateProvider.players.map((row, offset) => offset === 1 ? { ...row, providerPlayerId: "101" } : row);
  assert.equal(projectTouchlinePublishedRankingSummary(index, duplicateProvider).totalRankedCards, null);
  assert.equal(projectTouchlinePublishedRankingSummary([...index!, index![0]!], ranking("forged-index")).totalRankedCards, null);
});

test("unavailable/empty catalogue differs from a confirmed withdrawal and empty ranked payload is not fake zero", () => {
  for (const index of [null, []] as const) {
    assert.equal(projectTouchlinePublishedRankingSummary(index, ranking("ranked")).totalRankedCards, null);
    for (const state of [null, TOUCHLINE_PRESEASON_RANKING_STATE]) {
      assert.deepEqual(projectTouchlinePublishedRankingSummary(index, state), { phase: "withdrawn", totalRankedCards: 0 });
    }
  }
  const empty = { ...ranking("empty"), players: [] };
  assert.deepEqual(projectTouchlinePublishedRankingSummary([], empty), { phase: "incomplete", totalRankedCards: null, reason: "invalid-ranking" });
});

function declaration(relativePath: string, name: string) {
  const source = ts.createSourceFile(relativePath, readFileSync(new URL(relativePath, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = source.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node, `${name} must be the actual product function`);
  return node.getText(source);
}

// Evaluate the actual Hero and actual authority-route guard, with a real React
// context/SSR render. This does not claim browser transport or hydration proof.
const AuthorityContext = React.createContext<TouchlineCardLeadershipAuthority | null>(null);
let pathname = "/rankings";
const exports: Record<string, unknown> = {};
const heroSource = declaration("../app/rankings/touchline-tables-client.tsx", "TouchlineRankingsHero");
const guardSource = declaration("../components/touchline/cards/TouchlineCardLeadershipProvider.tsx", "useTouchlineCardLeadershipAuthority");
runInNewContext(ts.transpileModule(`${guardSource}\n${heroSource}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports, AuthorityContext, useContext: React.useContext, usePathname: () => pathname,
  allowsInheritedCardLeadership, EMPTY_CARD_LEADERSHIP_AUTHORITY, projectTouchlinePublishedRankingSummary,
  styles: { hero: "hero", summary: "summary" },
  require: (name: string) => name === "react/jsx-runtime" ? jsx : assert.fail(`Unexpected Hero dependency: ${name}`),
  fetch: () => assert.fail("Hero must not fetch"), setInterval: () => assert.fail("Hero must not poll"),
});
type HeroProps = {
  copy: ReturnType<typeof getTouchLineRankingsCopy>; rankMode: string;
  totalPublishedCards: number | null; totalRankedCards: number | null; catalogueIndex?: TouchlineRankingSummaryIndex;
};
const Hero = exports.TouchlineRankingsHero as (props: HeroProps) => React.ReactElement;
function renderHero(authority: TouchlineCardLeadershipAuthority | null, props: HeroProps, route = "/rankings") {
  pathname = route;
  let captured: React.ReactElement<Record<string, unknown>> | undefined;
  function Capture() { captured = Hero(props) as React.ReactElement<Record<string, unknown>>; return captured; }
  const html = renderToStaticMarkup(React.createElement(AuthorityContext.Provider, { value: authority }, React.createElement(Capture)));
  assert.ok(captured);
  const entries: Record<string, unknown> = {};
  const visit = (node: React.ReactNode): void => {
    for (const child of React.Children.toArray(node)) {
      if (!React.isValidElement<{ children?: React.ReactNode }>(child)) continue;
      if (child.type === "dl") {
        for (const row of React.Children.toArray(child.props.children)) {
          assert.ok(React.isValidElement<{ children?: React.ReactNode }>(row));
          const [label, value] = React.Children.toArray(row.props.children);
          assert.ok(React.isValidElement<{ children?: React.ReactNode }>(label));
          assert.ok(React.isValidElement<{ children?: React.ReactNode }>(value));
          entries[String(label.props.children)] = value.props.children;
        }
      }
      visit(child.props.children);
    }
  };
  visit(captured);
  return { html, entries };
}

test("actual Hero follows accepted membership/mode in eight languages while editorial count stays SSR", () => {
  const index = buildTouchlineRankingSummaryIndex(catalogue);
  for (const { code: locale } of TOUCHLINE_APPROVED_LOCALES) {
    const copy = getTouchLineRankingsCopy(locale, true);
    const props = { copy, rankMode: "SSR-only mode", totalPublishedCards: 987, totalRankedCards: 777, catalogueIndex: index };
    const a = ranking("A"), b = ranking("B", 8);
    for (const [state, count] of [[a, 7], [b, 8], [a, 7], [ranking("all-null", 7, null), 7]] as const) {
      const rendered = renderHero(buildTouchlineCardLeadershipValue(state, null), props);
      assert.equal(rendered.entries[copy.rankedCards], count, locale);
      assert.equal(rendered.entries[copy.rankMode], copy.pointsMode, locale);
      assert.equal(rendered.entries[copy.publishedCards], 987, "the sports envelope is not the editorial global count");
      assert.ok(rendered.html.includes("<h1>"));
    }
    for (const state of [null, TOUCHLINE_PRESEASON_RANKING_STATE]) {
      const rendered = renderHero(buildTouchlineCardLeadershipValue(state, null), props);
      assert.equal(rendered.entries[copy.rankedCards], 0, locale);
      assert.equal(rendered.entries[copy.rankMode], copy.marketMode, locale);
    }
    const unknown = buildTouchlineCardLeadershipValue(ranking("unknown", 9), null);
    assert.equal(renderHero(unknown, props).entries[copy.rankedCards], "—");
    assert.equal(renderHero(unknown, { ...props, catalogueIndex: buildTouchlineRankingSummaryIndex([...catalogue, card(9)]) }).entries[copy.rankedCards], 9);
  }
});

test("actual Hero distinguishes absent provider, loading index, explicit withdrawal and private-route EMPTY", () => {
  const copy = getTouchLineRankingsCopy("en-GB", true);
  const props = { copy, rankMode: "SSR-only mode", totalPublishedCards: 987, totalRankedCards: 777,
    catalogueIndex: buildTouchlineRankingSummaryIndex(catalogue) };
  const standalone = renderHero(null, props);
  assert.equal(standalone.entries[copy.rankedCards], 777);
  assert.equal(standalone.entries[copy.rankMode], "SSR-only mode");
  for (const catalogueIndex of [undefined, null, []]) {
    const loading = renderHero(buildTouchlineCardLeadershipValue(ranking("A"), null), { ...props, catalogueIndex });
    assert.equal(loading.entries[copy.rankedCards], "—", "a missing catalogue cannot revive SSR count or pretend zero");
    assert.equal(loading.entries[copy.rankMode], copy.pointsMode);
  }
  for (const route of ["/admin", "/admin/cards", "/preview", "/visual-qa", "/audit"]) {
    for (const authority of [null, buildTouchlineCardLeadershipValue(ranking("A"), null)]) {
      const guarded = renderHero(authority, props, route);
      assert.equal(guarded.entries[copy.rankedCards], 0, route);
      assert.equal(guarded.entries[copy.rankMode], copy.marketMode, route);
      assert.equal(guarded.entries[copy.publishedCards], 987, "a public editorial count is separate from guarded competition authority");
    }
  }
  assert.equal(renderHero(null, { ...props, totalPublishedCards: null, totalRankedCards: null }).entries[copy.publishedCards], "—");
});
