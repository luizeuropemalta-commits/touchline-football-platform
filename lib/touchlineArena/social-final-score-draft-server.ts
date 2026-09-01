import "server-only";

import { readPublicCompetitionFixtureByProviderId } from "@/lib/football-data/fixture-schedule-store";
import { toPublicFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-fixture";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { readPersistedFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-snapshot";
import {
  publicPremierSquadPlayerToCard,
  readPublicPremierSquad,
} from "@/lib/football-data/public-premier-squad-server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOUCHLINE_ENGLAND_CLUBS,
  type ClubOwnerSquadCard,
  type TouchLineClubVisual,
} from "@/lib/touchlineArena/demo-data";
import { applyTouchlineSeasonPoints } from "@/lib/touchlineArena/matchday-player-points";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";
import { readPublicSeasonPlayerPoints } from "@/lib/touchlineArena/public-season-player-points-server";
import { resolveTouchlineFixtureVenue } from "@/lib/touchlineArena/stadium-catalog";
import { buildTouchlineFinalResultCaption } from "@/lib/touchlineArena/social-final-result-caption";
import { checksumTouchlineFinalResultRenderSource } from "@/lib/touchlineArena/social-final-result-render-source";
import {
  classifyTouchlineSocialFinalScoreGoalType,
  touchlineSocialFinalScoreGoalsMatchScore,
  type TouchlineSocialFinalScoreGoalKind,
} from "@/lib/touchlineArena/social-final-score-events";
import { readTouchlineSocialSourceRevisionCheckpoint } from "@/lib/touchlineArena/social-source-revision-server";

const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMPETITION_PROVIDER_ID = "8";
const SOURCE_VERSION = "touchline-final-result-v1";
export const TOUCHLINE_FULL_TIME_TEMPLATE_VERSION = "touchline-full-time-feed-v1";
export const TOUCHLINE_FINAL_SCORE_TEMPLATE_VERSION = "touchline-final-score-story-v1";

function timestamp(value: unknown) {
  const candidate = String(value ?? "").trim();
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

export type TouchlineSocialFinalScoreGoal = Readonly<{
  id: string;
  teamId: string;
  playerName: string;
  relatedPlayerName: string | null;
  minute: number;
  extraMinute: number | null;
  kind: TouchlineSocialFinalScoreGoalKind;
}>;

export type TouchlineSocialFinalScoreDraft = Readonly<{
  sourceProvenance: "PERSISTED_VERIFIED_FINAL_RESULT";
  fixtureId: string;
  capturedAt: string;
  sourceSnapshotAt: string;
  startsAt: string;
  status: string;
  seasonProviderId: string;
  gameweekNumber: number;
  venue: Readonly<{ name: string; interiorImageUrl: string }>;
  caption: string;
  sourceVersion: typeof SOURCE_VERSION;
  sourceChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>;
  sourceRevisionChecksum: string;
  home: TouchLineClubVisual & Readonly<{ logoUrl: string }>;
  away: TouchLineClubVisual & Readonly<{ logoUrl: string }>;
  score: Readonly<{ home: number; away: number }>;
  goals: readonly TouchlineSocialFinalScoreGoal[];
  topMatchCard: Readonly<{
    card: ClubOwnerSquadCard;
    officialMatchRating: number;
    team: TouchLineClubVisual;
  }>;
}>;

export type TouchlineSocialFinalScoreDraftResult =
  | Readonly<{ ok: true; data: TouchlineSocialFinalScoreDraft }>
  | Readonly<{ ok: false; reason: string }>;

function clubForTeamId(teamId: string) {
  const matches = TOUCHLINE_ENGLAND_CLUBS.filter((club) => club.teamId === teamId && club.logoUrl);
  return matches.length === 1
    ? matches[0] as TouchLineClubVisual & Readonly<{ logoUrl: string }>
    : null;
}

/**
 * Canonical read-only 042 source. It uses one persisted TouchLine revision for
 * the exact fixture and fails closed unless the final score, goal timeline,
 * V3 player settlements, current coach settlement state and published Top
 * Match Card agree. No public consumer reads the upstream source directly.
 */
export async function readTouchlineSocialFinalScoreDraft(
  fixtureIdInput: string,
): Promise<TouchlineSocialFinalScoreDraftResult> {
  const fixtureId = fixtureIdInput.trim();
  if (!NUMERIC_ID.test(fixtureId)) return { ok: false, reason: "invalid-fixture-id" };
  const sourceReadStart = await readTouchlineSocialSourceRevisionCheckpoint([]);
  if (!sourceReadStart) return { ok: false, reason: "source-revision-unavailable" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "qa-read-model-unavailable" };

  const [snapshot, fixture, canonicalFixtureResult] = await Promise.all([
    readPersistedFantasyFixtureFeed(fixtureId),
    readPublicCompetitionFixtureByProviderId(fixtureId, { providedAdmin: admin }),
    admin.from("football_fixtures")
      .select("id,competition_id,season_id,round_id,home_club_id,away_club_id,source_updated_at")
      .eq("provider", "sportmonks")
      .eq("provider_fixture_id", fixtureId)
      .maybeSingle(),
  ]);
  const canonicalFixture = canonicalFixtureResult.data;
  if (!snapshot || !fixture || fixture.competitionId !== COMPETITION_PROVIDER_ID
    || canonicalFixtureResult.error || !canonicalFixture
    || ![canonicalFixture.id, canonicalFixture.competition_id, canonicalFixture.season_id,
      canonicalFixture.round_id, canonicalFixture.home_club_id, canonicalFixture.away_club_id]
      .every((value) => UUID.test(String(value ?? "")))) {
    return { ok: false, reason: "canonical-fixture-unavailable" };
  }
  const publicFeed = toPublicFantasyFixtureFeed(snapshot.feed);
  if (!publicFeed) return { ok: false, reason: "public-fixture-feed-unavailable" };
  const detail = await readPublicFantasyFixtureMatchDetail(fixtureId, publicFeed);
  if (!detail || touchlineFixtureState(fixture) !== "finished"
    || touchlineFixtureState(detail.fixture) !== "finished") {
    return { ok: false, reason: "fixture-not-finished" };
  }

  const startsAt = timestamp(fixture.startsAt);
  const capturedAt = timestamp(snapshot.capturedAt);
  const homeScore = fixture.homeScore;
  const awayScore = fixture.awayScore;
  const homeTeamId = String(fixture.homeTeam?.providerId ?? "").trim();
  const awayTeamId = String(fixture.awayTeam?.providerId ?? "").trim();
  const detailHomeTeamId = String(detail.fixture.homeTeam?.id ?? "").trim();
  const detailAwayTeamId = String(detail.fixture.awayTeam?.id ?? "").trim();
  if (!startsAt || !capturedAt || !Number.isSafeInteger(homeScore) || Number(homeScore) < 0
    || !Number.isSafeInteger(awayScore) || Number(awayScore) < 0
    || homeTeamId === awayTeamId || homeTeamId !== detailHomeTeamId || awayTeamId !== detailAwayTeamId
    || Number(homeScore) !== detail.fixture.homeScore || Number(awayScore) !== detail.fixture.awayScore) {
    return { ok: false, reason: "canonical-final-score-conflict" };
  }
  const home = clubForTeamId(homeTeamId);
  const away = clubForTeamId(awayTeamId);
  if (!home || !away) return { ok: false, reason: "club-identity-unavailable" };
  const venue = resolveTouchlineFixtureVenue(fixture);
  const gameweekMatch = String(fixture.roundName ?? "").match(/\d+/);
  const gameweekNumber = gameweekMatch ? Number(gameweekMatch[0]) : NaN;
  if (!venue?.name || !venue.interiorImageUrl || !Number.isSafeInteger(gameweekNumber) || gameweekNumber < 1) {
    return { ok: false, reason: "verified-match-context-unavailable" };
  }

  const goalEvents = detail.events.flatMap((event) => {
    const kind = classifyTouchlineSocialFinalScoreGoalType(event.type);
    const teamId = String(event.teamId ?? "").trim();
    const playerName = event.playerName?.trim() ?? "";
    if (!kind || !NUMERIC_ID.test(event.id) || (teamId !== homeTeamId && teamId !== awayTeamId)
      || !playerName || !Number.isSafeInteger(event.minute) || Number(event.minute) < 0) return [];
    return [{
      id: event.id,
      teamId,
      playerName,
      relatedPlayerName: event.relatedPlayerName?.trim() || null,
      minute: Number(event.minute),
      extraMinute: Number.isSafeInteger(event.extraMinute) && Number(event.extraMinute) > 0
        ? Number(event.extraMinute) : null,
      kind,
    }];
  }).sort((left, right) => left.minute - right.minute
    || (left.extraMinute ?? 0) - (right.extraMinute ?? 0)
    || left.id.localeCompare(right.id));
  if (!touchlineSocialFinalScoreGoalsMatchScore(goalEvents, {
    homeTeamId, awayTeamId, homeScore: Number(homeScore), awayScore: Number(awayScore),
  })) return { ok: false, reason: "official-goal-timeline-incomplete" };

  if (!detail.playerStatistics.length
    || detail.playerStatistics.some((row) => row.settlementStatus !== "final")) {
    return { ok: false, reason: "player-scoring-v3-not-final" };
  }
  const coachRows = await admin.from("touchline_coach_fixture_points")
    .select("settlement_status")
    .eq("fixture_id", String(canonicalFixture.id))
    .eq("scoring_version", "coach_scoring_v2");
  if (coachRows.error || !Array.isArray(coachRows.data) || coachRows.data.length === 0
    || coachRows.data.some((row) => row.settlement_status !== "final")) {
    return { ok: false, reason: "coach-scoring-v2-not-final" };
  }

  const rankedRatings = detail.playerStatistics.filter((row) => (
    (row.appearanceStatus === "started" || row.appearanceStatus === "substitute")
    && typeof row.rating === "number" && Number.isFinite(row.rating)
    && (row.teamId === homeTeamId || row.teamId === awayTeamId)
  )).sort((left, right) => Number(right.rating) - Number(left.rating)
    || Number(right.minutes ?? -1) - Number(left.minutes ?? -1)
    || left.playerId.localeCompare(right.playerId));
  const topRating = rankedRatings[0];
  if (!topRating || topRating.rating === null || !topRating.teamId) {
    return { ok: false, reason: "final-official-match-rating-unavailable" };
  }
  const topTeam = topRating.teamId === homeTeamId ? home : away;
  const squadResult = await readPublicPremierSquad(topRating.teamId, { providedAdmin: admin });
  if (squadResult.status !== 200 || squadResult.body.ok === false) {
    return { ok: false, reason: "top-match-card-squad-unavailable" };
  }
  const topCard = (squadResult.body.rosterPlayers ?? squadResult.body.players)
    .map((player) => publicPremierSquadPlayerToCard(player, topTeam.name))
    .find((card) => String(card.id) === topRating.playerId);
  if (!topCard?.editorialCard || !topCard.cardTier || !UUID.test(String(topCard.canonicalPlayerId ?? ""))) {
    return { ok: false, reason: "top-match-card-unpublished" };
  }
  const seasonPoints = await readPublicSeasonPlayerPoints([topCard.canonicalPlayerId!], { providedAdmin: admin });
  const decoratedCard = applyTouchlineSeasonPoints([topCard], seasonPoints)[0];
  if (!decoratedCard) return { ok: false, reason: "top-match-card-unavailable" };

  const caption = buildTouchlineFinalResultCaption({
    homeName: home.name,
    awayName: away.name,
    homeScore: Number(homeScore),
    awayScore: Number(awayScore),
    venueName: venue.name,
    gameweekNumber,
    goals: goalEvents,
    topCardName: decoratedCard.name,
    officialMatchRating: topRating.rating,
  });
  if (!caption.ok) return { ok: false, reason: `caption-${caption.reason.toLowerCase()}` };

  const sourceSnapshotAt = [capturedAt, timestamp(canonicalFixture.source_updated_at)]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  if (!sourceSnapshotAt) return { ok: false, reason: "source-timestamp-unavailable" };
  const baseSource = {
    sourceProvenance: "PERSISTED_VERIFIED_FINAL_RESULT" as const,
    fixtureId,
    capturedAt,
    sourceSnapshotAt,
    startsAt,
    status: fixture.status ?? detail.fixture.status ?? "FINISHED",
    seasonProviderId: String(fixture.seasonId ?? ""),
    gameweekNumber,
    venue: { name: venue.name, interiorImageUrl: venue.interiorImageUrl },
    caption: caption.caption,
    sourceVersion: SOURCE_VERSION,
    home,
    away,
    score: { home: Number(homeScore), away: Number(awayScore) },
    goals: goalEvents,
    topMatchCard: {
      card: { ...decoratedCard, matchRating: topRating.rating },
      officialMatchRating: topRating.rating,
      team: topTeam,
    },
  } as const;
  const sourceChecksum = checksumTouchlineFinalResultRenderSource(baseSource);
  if (!SHA256.test(sourceChecksum)) return { ok: false, reason: "source-checksum-invalid" };
  const sourceKeys = [
    `fixture-provider:${fixtureId}`,
    `fixture:${String(canonicalFixture.id).toLowerCase()}`,
    `competition:${String(canonicalFixture.competition_id).toLowerCase()}`,
    `season:${String(canonicalFixture.season_id).toLowerCase()}`,
    `round:${String(canonicalFixture.round_id).toLowerCase()}`,
    `club:${String(canonicalFixture.home_club_id).toLowerCase()}`,
    `club:${String(canonicalFixture.away_club_id).toLowerCase()}`,
    `player:${String(topCard.canonicalPlayerId).toLowerCase()}`,
  ];
  const sourceReadEnd = await readTouchlineSocialSourceRevisionCheckpoint(sourceKeys);
  if (!sourceReadEnd || sourceReadEnd.clockRevision !== sourceReadStart.clockRevision) {
    return { ok: false, reason: "source-revision-changed-during-read" };
  }
  return {
    ok: true,
    data: {
      ...baseSource,
      sourceChecksum,
      sourceRevisionManifest: sourceReadEnd.manifest,
      sourceRevisionChecksum: sourceReadEnd.checksum,
    },
  };
}
