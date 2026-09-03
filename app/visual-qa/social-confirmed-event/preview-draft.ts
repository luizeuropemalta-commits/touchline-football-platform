import "server-only";

import { createHash } from "node:crypto";

import { readClubHubNextFixturePreview } from "@/app/visual-qa/clubhub-next-fixture-post/preview-draft";
import { createRankingVisualQaPreview } from "@/app/visual-qa/social-next-three/preview-drafts";
import type { TouchlineSocialConfirmedEventArtworkDraft } from "@/components/touchline/social/TouchlineSocialConfirmedEventDraft";
import {
  TOUCHLINE_PLAYER_SCORING_V3_VERSION,
  touchLinePointsFromSportmonksRating,
} from "@/lib/football-data/player-score-engine-v3";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { TOUCHLINE_STADIUM_CATALOG } from "@/lib/touchlineArena/stadium-catalog";

import joaoPedroBrighton from "./joao-pedro-brighton-canonical-snapshot.json";

function checksum(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

/**
 * Owner-facing layout proof only. It reuses canonical club/card/stadium assets
 * from the frozen QA snapshot, while the score, minute and event ratings stay
 * explicitly marked sample and can never enter the 043 reader or queue.
 */
export async function readTouchlineConfirmedGoalVisualQaPreview(): Promise<TouchlineSocialConfirmedEventArtworkDraft | null> {
  const matchPreview = await readClubHubNextFixturePreview();
  if (!matchPreview) return null;
  const { draft } = matchPreview;
  const playerCard = draft.home.leader.card;
  const sampleFacts = {
    kind: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    fixture: [draft.home.club.teamId, draft.away.club.teamId],
    player: playerCard.canonicalPlayerId,
    score: { home: 2, away: 1 },
    minute: 67,
    matchRating: 8.14,
    touchlinePoints: 5,
  } as const;
  const sourceChecksum = checksum(sampleFacts);
  return {
    sourceProvenance: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    visualQa: { sampleData: true, label: "VISUAL QA · SAMPLE DATA" },
    contentType: "GOAL_CONFIRMED",
    fixtureId: "local-visual-qa-goal",
    eventId: "local-visual-qa-event",
    capturedAt: draft.sourceSnapshotAt,
    firstObservedAt: draft.sourceSnapshotAt,
    confirmedAt: draft.sourceSnapshotAt,
    sourceSnapshotAt: draft.sourceSnapshotAt,
    startsAt: draft.startsAt,
    status: "VISUAL_QA_SAMPLE",
    seasonProviderId: draft.seasonProviderId,
    gameweekNumber: draft.gameweekNumber,
    venue: draft.venue,
    caption: "LOCAL VISUAL QA ONLY · FINAL COPY REQUIRES A VERIFIED 043 EVENT",
    sourceVersion: "touchline-confirmed-event-v1",
    sourceChecksum,
    sourceRevisionManifest: { localVisualQa: 1 },
    sourceRevisionChecksum: sourceChecksum,
    home: draft.home.club,
    away: draft.away.club,
    score: sampleFacts.score,
    event: {
      kind: "goal",
      scoringTeamId: draft.home.club.teamId,
      playerTeamId: draft.home.club.teamId,
      playerProviderId: playerCard.id,
      playerName: playerCard.name,
      minute: sampleFacts.minute,
      extraMinute: null,
    },
    playerCard,
    totalRating: draft.home.leader.totalRating,
    matchRating: sampleFacts.matchRating,
    touchlinePoints: sampleFacts.touchlinePoints,
  };
}

export async function readTouchlineGoalHatLayoutVisualQaPreview(): Promise<TouchlineSocialConfirmedEventArtworkDraft | null> {
  const matchPreview = await readClubHubNextFixturePreview();
  if (!matchPreview) return null;
  const playerCard = matchPreview.draft.away.leader.card;
  const home = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === joaoPedroBrighton.fixture.homeTeamId);
  const away = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === joaoPedroBrighton.fixture.awayTeamId);
  const venue = TOUCHLINE_STADIUM_CATALOG.find((candidate) => (
    candidate.homeTeamProviderId === joaoPedroBrighton.fixture.homeTeamId
  ));
  if (!home?.logoUrl || !away?.logoUrl || !venue?.interiorImageUrl
    || playerCard.id !== joaoPedroBrighton.event.playerProviderId
    || playerCard.canonicalPlayerId !== joaoPedroBrighton.event.playerCanonicalId
    || joaoPedroBrighton.event.scoringTeamId !== joaoPedroBrighton.fixture.homeTeamId
    || joaoPedroBrighton.event.result !== `${joaoPedroBrighton.event.scoreAfterEvent.home}-${joaoPedroBrighton.event.scoreAfterEvent.away}`
    || joaoPedroBrighton.settlement.scoringVersion !== "player_scoring_v3"
    || joaoPedroBrighton.settlement.status !== "final") return null;
  const sourceChecksum = checksum(joaoPedroBrighton);
  return {
    sourceProvenance: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    visualQa: { sampleData: true, label: "CANONICAL SNAPSHOT · OUTBOUND OFF" },
    contentType: "GOAL_CONFIRMED",
    fixtureId: joaoPedroBrighton.fixture.providerFixtureId,
    eventId: joaoPedroBrighton.event.providerEventId,
    capturedAt: joaoPedroBrighton.source.capturedAt,
    firstObservedAt: joaoPedroBrighton.event.sourceSyncedAt,
    confirmedAt: joaoPedroBrighton.event.sourceSyncedAt,
    sourceSnapshotAt: joaoPedroBrighton.source.capturedAt,
    startsAt: joaoPedroBrighton.fixture.startsAt,
    status: joaoPedroBrighton.fixture.status,
    seasonProviderId: "28083",
    gameweekNumber: joaoPedroBrighton.fixture.gameweekNumber,
    venue: { name: venue.name, interiorImageUrl: venue.interiorImageUrl },
    caption: "GOALLLLLL · JOÃO PEDRO · CHELSEA 3–0 BRIGHTON · 32'",
    sourceVersion: "touchline-confirmed-event-v1",
    sourceChecksum,
    sourceRevisionManifest: { canonicalFixture: 1, canonicalEvent: 1, finalSettlement: 1, publishedCard: 1 },
    sourceRevisionChecksum: sourceChecksum,
    home: { ...home, logoUrl: home.logoUrl },
    away: { ...away, logoUrl: away.logoUrl },
    score: joaoPedroBrighton.event.scoreAfterEvent,
    event: {
      kind: "goal",
      scoringTeamId: joaoPedroBrighton.event.scoringTeamId,
      playerTeamId: joaoPedroBrighton.event.playerTeamId,
      playerProviderId: playerCard.id,
      playerName: joaoPedroBrighton.event.playerName,
      minute: joaoPedroBrighton.event.minute,
      extraMinute: joaoPedroBrighton.event.extraMinute,
    },
    playerCard: {
      ...playerCard,
      clubName: home.name,
      seasonTotalRating: joaoPedroBrighton.settlement.totalRating,
      matchRating: joaoPedroBrighton.settlement.matchRating,
      touchlinePoints: joaoPedroBrighton.settlement.touchlinePoints,
      seasonStats: joaoPedroBrighton.settlement.seasonStats,
    },
    totalRating: joaoPedroBrighton.settlement.totalRating,
    matchRating: joaoPedroBrighton.settlement.matchRating,
    touchlinePoints: joaoPedroBrighton.settlement.touchlinePoints,
  };
}

/**
 * Replays the already owner-reviewed frozen Hat-trick artwork evidence through
 * the operational 043 renderer. It is deliberately non-publishable: live
 * generation must come from the confirmed-event reader after all three goals
 * have been reconciled independently.
 */
export function readTouchlineHatTrickVisualQaPreview(): TouchlineSocialConfirmedEventArtworkDraft | null {
  const ranking = createRankingVisualQaPreview("HAT_TRICK_HERO");
  const rankingCard = ranking.cards[0];
  const home = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === ranking.home?.teamId);
  const away = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === ranking.away?.teamId);
  const venue = TOUCHLINE_STADIUM_CATALOG.find((candidate) => candidate.homeTeamProviderId === home?.teamId);
  const moments = ranking.confirmedGoalMoments;
  const touchlinePoints = touchLinePointsFromSportmonksRating(rankingCard?.officialMatchRating);
  if (!rankingCard || !home?.logoUrl || !away?.logoUrl || !venue?.interiorImageUrl
    || !ranking.fixtureScore || !moments || moments.length !== 3 || touchlinePoints === null) return null;

  const confirmedGoalMoments = moments.map((moment, index) => ({
    eventId: `${ranking.fixtureId}:goal:${index + 1}`,
    kind: moment.kind,
    minute: moment.minute,
    extraMinute: moment.extraMinute,
    // The frozen 044 visual never persisted intermediate scores. Keep the
    // field structurally present for visual QA, but never expose this replay to
    // the canonical reader, generator or outbound queue.
    score: ranking.fixtureScore!,
  }));
  const sourceChecksum = checksum({
    ranking,
    confirmedGoalMoments,
    touchlinePoints,
    scoringVersion: TOUCHLINE_PLAYER_SCORING_V3_VERSION,
    migration: "043-visual-replay",
  });
  const terminalMoment = confirmedGoalMoments[2]!;
  return {
    sourceProvenance: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    visualQa: { sampleData: true, label: "FROZEN OWNER ARTWORK · OUTBOUND OFF" },
    contentType: "HAT_TRICK_HERO",
    fixtureId: ranking.fixtureId,
    eventId: terminalMoment.eventId,
    capturedAt: ranking.sourceSnapshotAt,
    firstObservedAt: ranking.firstObservedAt,
    confirmedAt: ranking.sourceSnapshotAt,
    sourceSnapshotAt: ranking.sourceSnapshotAt,
    startsAt: ranking.sourceSnapshotAt,
    status: "VISUAL_QA_FROZEN",
    seasonProviderId: "28083",
    gameweekNumber: ranking.gameweekNumber,
    venue: { name: venue.name, interiorImageUrl: venue.interiorImageUrl },
    caption: "LOCAL VISUAL QA ONLY · LIVE COPY REQUIRES THREE VERIFIED 043 GOALS",
    sourceVersion: "touchline-confirmed-event-v1",
    sourceChecksum,
    sourceRevisionManifest: {
      frozenOwnerArtwork: 1,
      module043Replay: 1,
      scoringVersionV3: 1,
    },
    sourceRevisionChecksum: sourceChecksum,
    home: { ...home, logoUrl: home.logoUrl },
    away: { ...away, logoUrl: away.logoUrl },
    score: ranking.fixtureScore,
    event: {
      kind: terminalMoment.kind,
      scoringTeamId: home.teamId,
      playerTeamId: home.teamId,
      playerProviderId: rankingCard.card.id,
      playerName: rankingCard.card.name,
      minute: terminalMoment.minute,
      extraMinute: terminalMoment.extraMinute,
    },
    confirmedGoalMoments,
    playerCard: {
      ...rankingCard.card,
      clubName: home.name,
      matchRating: rankingCard.officialMatchRating,
      seasonTotalRating: rankingCard.totalRating,
      touchlinePoints,
    },
    totalRating: rankingCard.totalRating,
    matchRating: rankingCard.officialMatchRating,
    touchlinePoints,
  };
}

export async function readTouchlineConfirmedRedCardVisualQaPreview(): Promise<TouchlineSocialConfirmedEventArtworkDraft | null> {
  const matchPreview = await readClubHubNextFixturePreview();
  if (!matchPreview) return null;
  const { draft } = matchPreview;
  const playerCard = draft.away.leader.card;
  const sampleFacts = {
    kind: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    fixture: [draft.home.club.teamId, draft.away.club.teamId],
    player: playerCard.canonicalPlayerId,
    score: { home: 1, away: 1 },
    minute: 72,
    matchRating: 5.8,
    touchlinePoints: -1,
  } as const;
  const sourceChecksum = checksum(sampleFacts);
  return {
    sourceProvenance: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    visualQa: { sampleData: true, label: "VISUAL QA · SAMPLE DATA" },
    contentType: "RED_CARD_CONFIRMED",
    fixtureId: "local-visual-qa-red-card",
    eventId: "local-visual-qa-red-card-event",
    capturedAt: draft.sourceSnapshotAt,
    firstObservedAt: draft.sourceSnapshotAt,
    confirmedAt: draft.sourceSnapshotAt,
    sourceSnapshotAt: draft.sourceSnapshotAt,
    startsAt: draft.startsAt,
    status: "VISUAL_QA_SAMPLE",
    seasonProviderId: draft.seasonProviderId,
    gameweekNumber: draft.gameweekNumber,
    venue: draft.venue,
    caption: "LOCAL VISUAL QA ONLY · FINAL COPY REQUIRES A VERIFIED 043 EVENT",
    sourceVersion: "touchline-confirmed-event-v1",
    sourceChecksum,
    sourceRevisionManifest: { localVisualQa: 1 },
    sourceRevisionChecksum: sourceChecksum,
    home: draft.home.club,
    away: draft.away.club,
    score: sampleFacts.score,
    event: {
      kind: "red-card",
      scoringTeamId: null,
      playerTeamId: draft.away.club.teamId,
      playerProviderId: playerCard.id,
      playerName: playerCard.name,
      minute: sampleFacts.minute,
      extraMinute: null,
    },
    playerCard,
    totalRating: draft.away.leader.totalRating,
    matchRating: sampleFacts.matchRating,
    touchlinePoints: sampleFacts.touchlinePoints,
  };
}

export async function readTouchlineConfirmedOwnGoalVisualQaPreview(): Promise<TouchlineSocialConfirmedEventArtworkDraft | null> {
  const matchPreview = await readClubHubNextFixturePreview();
  if (!matchPreview) return null;
  const { draft } = matchPreview;
  const playerCard = draft.home.leader.card;
  const sampleFacts = {
    kind: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    fixture: [draft.home.club.teamId, draft.away.club.teamId],
    player: playerCard.canonicalPlayerId,
    score: { home: 0, away: 1 },
    minute: 33,
    matchRating: 6.1,
    touchlinePoints: 0,
    eventKind: "own-goal",
  } as const;
  const sourceChecksum = checksum(sampleFacts);
  return {
    sourceProvenance: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    visualQa: { sampleData: true, label: "VISUAL QA · SAMPLE DATA" },
    contentType: "GOAL_CONFIRMED",
    fixtureId: "local-visual-qa-own-goal",
    eventId: "local-visual-qa-own-goal-event",
    capturedAt: draft.sourceSnapshotAt,
    firstObservedAt: draft.sourceSnapshotAt,
    confirmedAt: draft.sourceSnapshotAt,
    sourceSnapshotAt: draft.sourceSnapshotAt,
    startsAt: draft.startsAt,
    status: "VISUAL_QA_SAMPLE",
    seasonProviderId: draft.seasonProviderId,
    gameweekNumber: draft.gameweekNumber,
    venue: draft.venue,
    caption: "LOCAL VISUAL QA ONLY · OWN GOAL REQUIRES A VERIFIED 043 EVENT",
    sourceVersion: "touchline-confirmed-event-v1",
    sourceChecksum,
    sourceRevisionManifest: { localVisualQa: 1 },
    sourceRevisionChecksum: sourceChecksum,
    home: draft.home.club,
    away: draft.away.club,
    score: sampleFacts.score,
    event: {
      kind: "own-goal",
      scoringTeamId: draft.away.club.teamId,
      playerTeamId: draft.home.club.teamId,
      playerProviderId: playerCard.id,
      playerName: playerCard.name,
      minute: sampleFacts.minute,
      extraMinute: null,
    },
    playerCard,
    totalRating: draft.home.leader.totalRating,
    matchRating: sampleFacts.matchRating,
    touchlinePoints: sampleFacts.touchlinePoints,
  };
}
