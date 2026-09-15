import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareTouchLineRankedCards } from "../lib/touchlineArena/ranked-card-catalog.ts";
import { classifyTouchlinePlayerLeadershipPublication } from "../lib/touchlineArena/player-ranking-leadership.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const base = { totalRating: 20, minutesPlayed: 180, appearances: 2 };

test("overall artwork leadership uses minutes, appearances and provider ID in canonical order", () => {
  for (const [first, second] of [
    [{ ...base, minutesPlayed: 170, providerPlayerId: "1" }, { ...base, providerPlayerId: "2" }],
    [{ ...base, appearances: 1, providerPlayerId: "1" }, { ...base, providerPlayerId: "2" }],
    [{ ...base, providerPlayerId: "20" }, { ...base, providerPlayerId: "100" }],
  ]) {
    const decision = classifyTouchlinePlayerLeadershipPublication({ snapshotId: "published-test", rankingPayload: { players: [{ ...first, playerId: firstId }, { ...second, playerId: secondId }] } });
    assert.equal(decision.status, "unique-leader");
    if (decision.status === "unique-leader") assert.equal(decision.leader.subjectId, secondId);
  }
});

test("ranked cards preserve published tiebreak evidence rather than newer season statistics", () => {
  const makeCard = (id: string, providerPlayerId: string, minutes: number, appearances: number) => ({
    id, canonicalPlayerId: id, providerPlayerId, name: id, clubName: "Club", position: "CM", role: "MID", seasonTotalRating: 20,
    seasonStats: { minutes: id === firstId ? 999 : 1, appearances: id === firstId ? 99 : 1 },
    publishedRanking: { snapshotId: "published-test", providerPlayerId, totalRating: 20, minutesPlayed: minutes, appearances },
  }) as ClubOwnerSquadCard;
  assert.ok(compareTouchLineRankedCards(makeCard(firstId, "1", 170, 2), makeCard(secondId, "2", 180, 2)) > 0);
  assert.ok(compareTouchLineRankedCards(makeCard(firstId, "1", 180, 1), makeCard(secondId, "2", 180, 2)) > 0);
  assert.ok(compareTouchLineRankedCards(makeCard(firstId, "20", 180, 2), makeCard(secondId, "100", 180, 2)) > 0);
});

test("a published null total never becomes a newer mutable total in the ranked catalog", () => {
  const source = readFileSync(new URL("../lib/touchlineArena/ranked-card-catalog-server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /seasonTotalRating: ranking\.totalRating \?\?/);
  assert.match(source, /publishedRanking:/);
  const server = readFileSync(new URL("../lib/touchlineArena/card-ranking-server.ts", import.meta.url), "utf8");
  assert.match(server, /minutesPlayed: player\.minutesPlayed/);
  assert.match(server, /appearances: player\.appearances/);
});

test("ClubHub uses the canonical published ranking comparator rather than UUID tie order", () => {
  const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /sort\(compareTouchlineRankingPlayers\)/);
  assert.doesNotMatch(source, /normalizedPlayerIdentity\(left\.playerId\)\.localeCompare/);
});

test("profile card, summary, current-season panel and zoom share the published total including null", () => {
  const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("const totalRatingText = competition.totalRating;"), "Profile must not prefer mutable currentSeason");
  assert.ok(!source.includes("value: playerStatistics.currentSeason.summary.totalRating"), "Zoom must use the same published total");
  assert.ok(source.includes("value: cumulativeRatingText"));
  assert.ok(source.includes("publishedTotalRating={totalRatingText}"), "Current-season panel must not present a conflicting total");
});

test("private weekly art card uses the same scoped rating as its headline, not the season total", () => {
  const source = readFileSync(new URL("../components/touchline/social/TouchlineSocialRankingsLive.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("seasonTotalRating: player.totalRating"), "Weekly preview must not show accumulated season rating on the card");
  assert.ok(source.includes("squadCardToExactPlayer(scopedCard,"));
});
