import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { buildTouchlineCardLeadershipValue } from "../lib/touchlineArena/card-leadership-authority.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { projectTouchlinePublishedRankingAwards } from "../lib/touchlineArena/published-ranking-awards.ts";
import { touchlinePlayerLeadershipScope } from "../lib/touchlineArena/player-ranking-leadership.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const id = (index: number) => `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const provider = (index: number) => String(1000 + index);

function card(index: number): ClubOwnerSquadCard {
  return {
    id: id(index), canonicalPlayerId: id(index), providerPlayerId: provider(index), name: `Player ${index}`, shortName: `P${index}`,
    clubName: `Club ${index}`, role: "ST", position: "Striker", shirtNumber: index, countryCode3: "ENG", marketValue: "€1m",
    touchlinePoints: 900, seasonTotalRating: 999, matchRating: 7.2, matchStats: { goals: 1 },
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" },
  };
}

function ranking(snapshotId: string, totals: readonly number[], goals: readonly number[]): TouchlineActiveRankingState {
  const rows = totals.map((totalRating, index) => ({
    playerId: id(index), providerPlayerId: provider(index), totalRating, minutesPlayed: 90, appearances: 1,
    positionGroup: "striker" as const, positionRank: index + 1, groupSize: totals.length, tierKey: "diamond-gold" as const, priceTc: 999999,
  }));
  const winner = rows.reduce((best, row) => row.totalRating > best.totalRating ? row : best, rows[0]!);
  return {
    ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked", leagueKey: "touchline-england", snapshotId, seasonId: "season-2026",
    roundId: "round-8", publishedAt: "2026-10-23T12:00:00Z", scoringVersion: "player_scoring_v4", coverageStatus: "complete",
    fixtureIds: ["fixture-1"], expectedFixtureIds: ["fixture-1"], players: rows,
    leadershipDecision: { status: "unique-leader", scope: touchlinePlayerLeadershipScope(snapshotId), leader: { subjectType: "player", subjectId: winner.playerId } },
    cardGoals: { source: "published-card-goals-v1", snapshotId, rows: goals.map((value, index) => ({ playerId: id(index), goals: value })) },
  };
}

function awarded(catalogue: readonly ClubOwnerSquadCard[], seed: TouchlineActiveRankingState, live: TouchlineActiveRankingState | null) {
  const authority = buildTouchlineCardLeadershipValue(live, null);
  // Same null-vs-absent rule as the client podium: an accepted null withdraws
  // the award rather than reviving its SSR seed.
  return projectTouchlinePublishedRankingAwards(catalogue, authority.playerRanking === null ? null : authority.playerRanking ?? seed);
}

test("podium uses the shared authority A -> B -> A, including a goals-only candidate without borrowing price or score", () => {
  const catalogue = [card(0), card(1), card(2), card(3)];
  const a = ranking("A", [10, 9, 8], [1, 0, 0, 7]);
  const b = ranking("B", [10, 20, 8], [1, 0, 0, 7]);
  for (const [state, ball] of [[a, id(0)], [b, id(1)], [a, id(0)]] as const) {
    const awards = awarded(catalogue, a, state);
    assert.deepEqual(awards.goldenBall.awardedPlayerIds, [ball]);
    assert.deepEqual(awards.goldenBoot.awardedPlayerIds, [id(3)]);
    const boot = awards.goldenBoot.contenders[0]!;
    assert.equal(boot.seasonTotalRating, null);
    assert.equal(boot.editorialCard?.cardPrice.amountMinor, 1500);
    assert.equal(boot.touchlinePoints, 900);
  }
});

test("podium fails closed for withdrawal, editorial loss and Ball ties while preserving every tied Boot contender", () => {
  const catalogue = [card(0), card(1), card(2), card(3)];
  const tied = ranking("T", [10, 10, 8], [4, 4, 0, 0]);
  tied.leadershipDecision = { status: "tied", scope: touchlinePlayerLeadershipScope("T"), contenders: [0, 1].map(index => ({ subjectType: "player", subjectId: id(index) })) };
  const awards = awarded(catalogue, tied, tied);
  assert.deepEqual(awards.goldenBall.awardedPlayerIds, []);
  assert.deepEqual(awards.goldenBoot.awardedPlayerIds, [id(0), id(1)]);
  assert.equal(awarded(catalogue, tied, null).goldenBall.phase, "withdrawn");
  assert.equal(awarded([{ ...catalogue[0]!, editorialCard: null }, ...catalogue.slice(1)], tied, tied).rating.phase, "incomplete");
});

function jsxAttribute(opening: ts.JsxOpeningLikeElement, name: string) {
  return opening.attributes.properties.find((attribute): attribute is ts.JsxAttribute =>
    ts.isJsxAttribute(attribute) && attribute.name.text === name,
  );
}

function expressionText(attribute: ts.JsxAttribute | undefined, source: ts.SourceFile) {
  if (!attribute?.initializer) return undefined;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  return ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression
    ? attribute.initializer.expression.getText(source)
    : undefined;
}

function podiumFunction(source: ts.SourceFile) {
  let podium: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "TouchlineRankingPodium") podium = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(podium, "TouchlineRankingPodium must remain a real client component");
  return podium;
}

function isConditionalHost(node: ts.Node, boundary: ts.Node) {
  for (let cursor: ts.Node | undefined = node.parent; cursor && cursor !== boundary; cursor = cursor.parent) {
    if (ts.isConditionalExpression(cursor) || ts.isBinaryExpression(cursor) && cursor.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return true;
  }
  return false;
}

test("podium client projects one persistent dialog host while its selected identity can become unavailable", () => {
  const text = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("touchline-tables-client.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const podium = podiumFunction(source);
  const hosts: ts.JsxOpeningLikeElement[] = [];
  const triggerModes: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(source) === "TouchlineCardZoom") hosts.push(node);
      if (node.tagName.getText(source) === "TablePlayerCardZoom") {
        const mode = expressionText(jsxAttribute(node, "presentationMode"), source);
        if (mode) triggerModes.push(mode);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(podium);

  const dialogHosts = hosts.filter(host => expressionText(jsxAttribute(host, "presentationMode"), source) === "dialog-only");
  assert.equal(dialogHosts.length, 1, "award availability must never select a different dialog component type");
  const [dialog] = dialogHosts;
  assert.ok(dialog);
  assert.equal(isConditionalHost(dialog, podium), false, "the dialog host must not be conditional on selectedCard/editorial data");
  assert.equal(expressionText(jsxAttribute(dialog, "open"), source), "selection !== null");
  assert.equal(expressionText(jsxAttribute(dialog, "details"), source), "selectedPresentation?.details");
  assert.match(expressionText(jsxAttribute(dialog, "detailsContent"), source) ?? "", /selection\s*&&\s*!selectedPresentation/);
  assert.deepEqual(triggerModes, ["trigger-only", "trigger-only"], "Ball and Boot controls remain triggers, not competing dialog hosts");
});

test("podium source receives explicit seed/catalogue, preserves owner actions and has no name-preview fallback", () => {
  const source = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
  assert.match(source, /projectTouchlinePublishedRankingAwards\(catalogue, ranking\)/);
  assert.match(source, /return authority \? authority\.playerRanking : seed/);
  assert.match(source, /TablePlayerCardZoom[\s\S]*canEditCardEngine/);
  assert.match(source, /goldenBootCards\.map/);
  assert.match(source, /presentationMode="dialog-only"/);
  assert.match(source, /data-ranking-podium-focus-anchor/);
  assert.doesNotMatch(source, /goldenBootPreview|goldenBootState|haaland/i);
  assert.match(page, /livePlayerUpdates/);
  assert.match(page, /catalogue=\{rankedCards\}[\s\S]*seedRanking=\{activeRanking\}/);
  assert.match(page, /includeGoalCandidates:\s*true/);
});
