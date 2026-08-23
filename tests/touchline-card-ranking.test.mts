import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_POSITION_RANKING_GROUPS,
  buildTouchlinePositionRankings,
  buildTouchlineRankingSnapshot,
  touchlinePositionRankingGroupFor,
  touchlineRankingSnapshotCanGoLive,
  touchlineTierForPositionRank,
  type TouchlineRankingPlayerInput,
} from "../lib/touchlineArena/card-ranking.ts";
import {
  auditTouchlineRankingDraft,
  buildSportmonksRankingDraft,
  keepLastPublishedRanking,
  publishTouchlineRankingSnapshot,
  touchlineRankingSnapshotChecksum,
  type TouchlineSportmonksRankingPlayer,
} from "../lib/touchlineArena/card-ranking-pipeline.ts";
import { buildTouchlineRankingPersistenceRecord } from "../lib/touchlineArena/card-ranking-persistence.ts";
import {
  TOUCHLINE_SELECTION_VERSION,
  buildTouchlineSelection,
} from "../lib/touchlineArena/touchline-selection.ts";

const positionFixtures: Array<[string, string]> = [
  ["GK", "goalkeeper"],
  ["CB", "centre-back"],
  ["RB", "full-back"],
  ["DM", "midfielder"],
  ["RW", "winger"],
  ["ST", "striker"],
];

function sportmonksPlayers(): TouchlineSportmonksRankingPlayer[] {
  return positionFixtures.flatMap(([position], groupIndex) =>
    Array.from({ length: 4 }, (_, playerIndex) => ({
      playerId: `${position}-${playerIndex}`,
      provider: "sportmonks" as const,
      providerPlayerId: groupIndex * 100 + playerIndex + 1,
      verified: true as const,
      sourceFixtureIds: [`fixture-${groupIndex + 1}`],
      name: `${position} Player ${playerIndex}`,
      clubName: "TouchLine Test Club",
      position,
      touchlinePoints: 30 - playerIndex,
      minutesPlayed: 900 - playerIndex,
      appearances: 10,
    })),
  );
}

test("normalizes the six official positional ranking groups", () => {
  for (const [position, expectedGroup] of positionFixtures) {
    assert.equal(touchlinePositionRankingGroupFor(position), expectedGroup);
  }
});

test("ranks every player exactly once and gives each positional leader Diamond Gold", () => {
  const players: TouchlineRankingPlayerInput[] = positionFixtures.flatMap(([position], groupIndex) =>
    Array.from({ length: 8 }, (_, playerIndex) => ({
      playerId: `${position}-${playerIndex}`,
      providerPlayerId: groupIndex * 100 + playerIndex,
      name: `${position} Player ${playerIndex}`,
      clubName: "TouchLine Test Club",
      position,
      touchlinePoints: 30 - playerIndex,
      minutesPlayed: 900 - playerIndex,
      appearances: 10,
    })),
  );

  const rankings = buildTouchlinePositionRankings(players);
  const rankedPlayers = rankings.flatMap((ranking) => ranking.players);

  assert.deepEqual(rankings.map((ranking) => ranking.group), [...TOUCHLINE_POSITION_RANKING_GROUPS]);
  assert.equal(rankedPlayers.length, players.length);
  assert.equal(new Set(rankedPlayers.map((player) => player.playerId)).size, players.length);

  for (const ranking of rankings) {
    assert.equal(ranking.players[0]?.tierKey, "diamond-gold");
    assert.equal(ranking.players[0]?.priceTc, 15);
    assert.equal(ranking.players.at(-1)?.tierKey, "ruby-red");
    assert.equal(ranking.players.at(-1)?.priceTc, 0);
  }
});

test("uses points, minutes, appearances and provider id as stable tie breakers", () => {
  const rankings = buildTouchlinePositionRankings([
    { playerId: "d", providerPlayerId: 40, name: "D", clubName: "Club", position: "ST", touchlinePoints: 10, minutesPlayed: 90, appearances: 2 },
    { playerId: "c", providerPlayerId: 30, name: "C", clubName: "Club", position: "ST", touchlinePoints: 10, minutesPlayed: 90, appearances: 2 },
    { playerId: "b", providerPlayerId: 20, name: "B", clubName: "Club", position: "ST", touchlinePoints: 10, minutesPlayed: 90, appearances: 3 },
    { playerId: "a", providerPlayerId: 10, name: "A", clubName: "Club", position: "ST", touchlinePoints: 10, minutesPlayed: 180, appearances: 2 },
  ]);

  const strikerIds = rankings.find((ranking) => ranking.group === "striker")?.players.map((player) => player.playerId);
  assert.deepEqual(strikerIds, ["a", "b", "c", "d"]);
});

test("splits the players below the leader across the six remaining tiers", () => {
  const tiers = Array.from({ length: 7 }, (_, index) => touchlineTierForPositionRank(index + 1, 7));
  assert.deepEqual(tiers, [
    "diamond-gold",
    "clear-diamond",
    "emerald-green",
    "radiant-gold",
    "amethyst-purple",
    "sapphire-blue",
    "ruby-red",
  ]);
});

test("rejects duplicate player ids before publishing a ranking", () => {
  assert.throws(
    () => buildTouchlinePositionRankings([
      { playerId: "same", name: "One", clubName: "Club", position: "GK", touchlinePoints: 1 },
      { playerId: "same", name: "Two", clubName: "Club", position: "ST", touchlinePoints: 2 },
    ]),
    /Duplicate playerId/,
  );
});

test("only an audited SportMonks snapshot can become live", () => {
  const base = {
    snapshotId: "round-1-v1",
    roundId: "round-1",
    generatedAt: "2026-08-15T18:00:00.000Z",
    players: [] as TouchlineRankingPlayerInput[],
  };

  assert.equal(touchlineRankingSnapshotCanGoLive(buildTouchlineRankingSnapshot(base)), false);
  assert.equal(touchlineRankingSnapshotCanGoLive(buildTouchlineRankingSnapshot({ ...base, status: "published", source: "simulation" })), false);
  assert.equal(touchlineRankingSnapshotCanGoLive(buildTouchlineRankingSnapshot({ ...base, status: "published", source: "sportmonks-audited" })), true);
});

test("market value cannot change ranking, tier or card price", () => {
  const players = [
    { playerId: "low-market", providerPlayerId: 2, name: "Low market", clubName: "Club", position: "ST", touchlinePoints: 20, minutesPlayed: 180, appearances: 2, marketValue: 1 },
    { playerId: "high-market", providerPlayerId: 1, name: "High market", clubName: "Club", position: "ST", touchlinePoints: 10, minutesPlayed: 900, appearances: 10, marketValue: 300_000_000 },
  ];
  const strikerPlayers = buildTouchlinePositionRankings(players).find((ranking) => ranking.group === "striker")?.players ?? [];

  assert.equal(strikerPlayers[0]?.playerId, "low-market");
  assert.equal(strikerPlayers[0]?.tierKey, "diamond-gold");
  assert.equal(strikerPlayers[0]?.priceTc, 15);
});

test("audits and atomically publishes a complete SportMonks ranking snapshot", () => {
  const players = sportmonksPlayers();
  const draft = buildSportmonksRankingDraft({
    snapshotId: "season-1-round-1-v1",
    roundId: "round-1",
    seasonId: "season-1",
    receivedAt: "2026-08-15T18:00:00.000Z",
    expectedPlayerCount: players.length,
    players,
  });
  const report = auditTouchlineRankingDraft(draft, "2026-08-15T18:01:00.000Z");

  assert.equal(report.passed, true);
  assert.equal(report.issues.length, 0);
  assert.equal(report.checks.every((check) => check.passed), true);
  assert.match(report.checksum ?? "", /^fnv1a32:[0-9a-f]{8}$/);

  const published = publishTouchlineRankingSnapshot(report, "2026-08-15T18:02:00.000Z");
  assert.equal(published.status, "published");
  assert.equal(published.source, "sportmonks-audited");
  assert.equal(touchlineRankingSnapshotCanGoLive(published), true);
  assert.equal(
    published.checksum,
    touchlineRankingSnapshotChecksum({
      seasonId: published.seasonId,
      priceTableVersion: published.priceTableVersion,
      snapshot: draft.snapshot,
      scoringVersion: published.scoringVersion,
      fixtureIds: published.fixtureIds,
    }),
  );
});

test("audits complete-for-scoring without pretending provider details are complete", () => {
  const players = sportmonksPlayers();
  const fixtureIds = [...new Set(players.flatMap((player) => player.sourceFixtureIds))].sort();
  const draft = buildSportmonksRankingDraft({
    snapshotId: "season-1-complete-for-scoring",
    roundId: "round-1",
    seasonId: "season-1",
    receivedAt: "2026-08-15T18:00:00.000Z",
    expectedPlayerCount: players.length,
    coverageStatus: "complete_for_scoring",
    fixtureIds,
    expectedFixtureIds: fixtureIds,
    totalScorePoints: players.reduce((total, player) => total + player.touchlinePoints, 0),
    players,
  });
  const report = auditTouchlineRankingDraft(draft, "2026-08-15T18:01:00.000Z");

  assert.equal(report.passed, true);
  assert.equal(report.snapshot?.coverageStatus, "complete_for_scoring");
});

test("publication audit rejects fixture-set and point-sum mismatches", () => {
  const players = sportmonksPlayers();
  const fixtureIds = [...new Set(players.flatMap((player) => player.sourceFixtureIds))].sort();
  const base = {
    snapshotId: "season-1-invalid-coverage",
    roundId: "round-1",
    seasonId: "season-1",
    receivedAt: "2026-08-15T18:00:00.000Z",
    expectedPlayerCount: players.length,
    fixtureIds,
    players,
  };
  const fixtureMismatch = auditTouchlineRankingDraft(buildSportmonksRankingDraft({
    ...base,
    expectedFixtureIds: fixtureIds.slice(1),
  }), "2026-08-15T18:01:00.000Z");
  const pointMismatch = auditTouchlineRankingDraft(buildSportmonksRankingDraft({
    ...base,
    totalScorePoints: 999_999,
  }), "2026-08-15T18:01:00.000Z");

  assert.ok(fixtureMismatch.issues.some((issue) => issue.code === "fixture-coverage-mismatch"));
  assert.ok(pointMismatch.issues.some((issue) => issue.code === "total-score-points-mismatch"));
});

test("rejects an incomplete provider payload and keeps the last published snapshot", () => {
  const players = sportmonksPlayers();
  const validDraft = buildSportmonksRankingDraft({
    snapshotId: "valid-v1",
    roundId: "round-1",
    seasonId: "season-1",
    receivedAt: "2026-08-15T18:00:00.000Z",
    expectedPlayerCount: players.length,
    players,
  });
  const current = publishTouchlineRankingSnapshot(
    auditTouchlineRankingDraft(validDraft, "2026-08-15T18:01:00.000Z"),
    "2026-08-15T18:02:00.000Z",
  );
  const brokenPlayers = players.filter((player) => player.position !== "GK").map((player, index) => (
    index === 0 ? { ...player, sourceFixtureIds: [] } : player
  ));
  const brokenDraft = buildSportmonksRankingDraft({
    snapshotId: "broken-v2",
    roundId: "round-2",
    seasonId: "season-1",
    receivedAt: "2026-08-22T18:00:00.000Z",
    expectedPlayerCount: players.length,
    players: brokenPlayers,
  });
  const brokenReport = auditTouchlineRankingDraft(brokenDraft, "2026-08-22T18:01:00.000Z");

  assert.equal(brokenReport.passed, false);
  assert.ok(brokenReport.issues.some((issue) => issue.code === "position-group-empty"));
  assert.ok(brokenReport.issues.some((issue) => issue.code === "player-count-mismatch"));
  assert.throws(() => publishTouchlineRankingSnapshot(brokenReport, "2026-08-22T18:02:00.000Z"), /passed ranking audit/);
  assert.equal(keepLastPublishedRanking(current, brokenReport, "2026-08-22T18:02:00.000Z"), current);
});

test("builds the complete 4-3-3 TouchLine Selection from the same snapshot", () => {
  const snapshot = buildTouchlineRankingSnapshot({
    snapshotId: "selection-v1",
    roundId: "round-1",
    generatedAt: "2026-08-15T18:00:00.000Z",
    players: sportmonksPlayers(),
  });
  const selection = buildTouchlineSelection(snapshot);

  assert.equal(selection.complete, true);
  assert.equal(selection.version, TOUCHLINE_SELECTION_VERSION);
  assert.equal(selection.sourceSnapshotId, snapshot.snapshotId);
  assert.equal(selection.players.length, 11);
  assert.equal(new Set(selection.players.map((slot) => slot.player.playerId)).size, 11);
  assert.deepEqual(
    Object.fromEntries(positionFixtures.map(([, group]) => [group, selection.players.filter((slot) => slot.group === group).length])),
    { goalkeeper: 1, "centre-back": 2, "full-back": 2, midfielder: 3, winger: 2, striker: 1 },
  );
});

test("persists the audited ranking and complete Selection as one publication candidate", () => {
  const players = sportmonksPlayers();
  const draft = buildSportmonksRankingDraft({
    snapshotId: "persistence-v1",
    roundId: "round-1",
    seasonId: "season-1",
    receivedAt: "2026-08-15T18:00:00.000Z",
    expectedPlayerCount: players.length,
    players,
  });
  const audit = auditTouchlineRankingDraft(draft, "2026-08-15T18:01:00.000Z");
  const selection = buildTouchlineSelection(audit.snapshot!);
  const record = buildTouchlineRankingPersistenceRecord({
    leagueKey: "touchline-england",
    expectedPlayerCount: players.length,
    audit,
    selection,
  });

  assert.equal(record.snapshotId, audit.snapshotId);
  assert.equal(record.checksum, audit.checksum);
  assert.equal(record.selectionPayload.sourceSnapshotId, record.snapshotId);
  assert.equal(record.selectionPayload.players.length, 11);
  assert.equal(record.auditReport.passed, true);
  assert.equal("snapshot" in record.auditReport, false);
});

test("rejects a Selection from a different ranking snapshot", () => {
  const players = sportmonksPlayers();
  const draft = buildSportmonksRankingDraft({
    snapshotId: "ranking-v1",
    roundId: "round-1",
    seasonId: "season-1",
    receivedAt: "2026-08-15T18:00:00.000Z",
    expectedPlayerCount: players.length,
    players,
  });
  const audit = auditTouchlineRankingDraft(draft, "2026-08-15T18:01:00.000Z");
  const selection = buildTouchlineSelection(buildTouchlineRankingSnapshot({
    snapshotId: "other-ranking-v1",
    roundId: "round-1",
    generatedAt: "2026-08-15T18:00:00.000Z",
    players,
  }));

  assert.throws(
    () => buildTouchlineRankingPersistenceRecord({
      leagueKey: "touchline-england",
      expectedPlayerCount: players.length,
      audit,
      selection,
    }),
    /same snapshot/,
  );
});
