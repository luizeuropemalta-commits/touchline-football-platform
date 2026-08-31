import "server-only";

import { toPublicFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-fixture";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { readPersistedFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-snapshot";
import {
  publicPremierSquadPlayerToCard,
  readPublicPremierSquad,
} from "@/lib/football-data/public-premier-squad-server";
import {
  TOUCHLINE_ENGLAND_CLUBS,
  type ClubOwnerSquadCard,
  type TouchLineClubVisual,
} from "@/lib/touchlineArena/demo-data";
import { applyTouchlineSeasonPoints } from "@/lib/touchlineArena/matchday-player-points";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";
import { readPublicSeasonPlayerPoints } from "@/lib/touchlineArena/public-season-player-points-server";
import {
  classifyTouchlineSocialFinalScoreGoalType,
  touchlineSocialFinalScoreGoalsMatchScore,
  type TouchlineSocialFinalScoreGoalKind,
} from "@/lib/touchlineArena/social-final-score-events";

const NUMERIC_ID = /^[0-9]{1,20}$/;

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
  fixtureId: string;
  capturedAt: string;
  startsAt: string;
  status: string;
  home: TouchLineClubVisual;
  away: TouchLineClubVisual;
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

/**
 * Read-only final-score draft. The source is the persisted Sportmonks feed,
 * final V3 settlement rows and the same published card read model used by the
 * site. It never turns a TouchLine-points total into a provider match rating.
 */
export async function readTouchlineSocialFinalScoreDraft(
  fixtureIdInput: string,
): Promise<TouchlineSocialFinalScoreDraftResult> {
  const fixtureId = fixtureIdInput.trim();
  if (!NUMERIC_ID.test(fixtureId)) return { ok: false, reason: "invalid-fixture-id" };

  const snapshot = await readPersistedFantasyFixtureFeed(fixtureId);
  if (!snapshot) return { ok: false, reason: "fixture-feed-unavailable" };
  const publicFeed = toPublicFantasyFixtureFeed(snapshot.feed);
  if (!publicFeed) return { ok: false, reason: "public-fixture-feed-unavailable" };
  const detail = await readPublicFantasyFixtureMatchDetail(fixtureId, publicFeed);
  if (!detail) return { ok: false, reason: "fixture-detail-unavailable" };
  if (touchlineFixtureState(detail.fixture) !== "finished") {
    return { ok: false, reason: "fixture-not-finished" };
  }

  const homeScore = detail.fixture.homeScore;
  const awayScore = detail.fixture.awayScore;
  if (!Number.isInteger(homeScore) || Number(homeScore) < 0 || !Number.isInteger(awayScore) || Number(awayScore) < 0) {
    return { ok: false, reason: "final-score-unavailable" };
  }
  const homeTeamId = String(detail.fixture.homeTeam?.id ?? "").trim();
  const awayTeamId = String(detail.fixture.awayTeam?.id ?? "").trim();
  const home = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === homeTeamId);
  const away = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === awayTeamId);
  if (!home || !away) return { ok: false, reason: "club-identity-unavailable" };

  const goalEvents = detail.events
    .flatMap((event) => {
      const kind = classifyTouchlineSocialFinalScoreGoalType(event.type);
      const teamId = String(event.teamId ?? "").trim();
      const playerName = event.playerName?.trim() ?? "";
      if (
        !kind
        || !NUMERIC_ID.test(event.id)
        || (teamId !== homeTeamId && teamId !== awayTeamId)
        || !playerName
        || !Number.isInteger(event.minute)
        || Number(event.minute) < 0
      ) return [];
      return [{
        id: event.id,
        teamId,
        playerName,
        relatedPlayerName: event.relatedPlayerName?.trim() || null,
        minute: Number(event.minute),
        extraMinute: Number.isInteger(event.extraMinute) && Number(event.extraMinute) > 0
          ? Number(event.extraMinute)
          : null,
        kind,
      }];
    })
    .sort((left, right) => left.minute - right.minute
      || (left.extraMinute ?? 0) - (right.extraMinute ?? 0)
      || left.id.localeCompare(right.id));
  if (!touchlineSocialFinalScoreGoalsMatchScore(goalEvents, {
    homeTeamId,
    awayTeamId,
    homeScore: Number(homeScore),
    awayScore: Number(awayScore),
  })) {
    return { ok: false, reason: "official-goal-timeline-incomplete" };
  }

  const rankedRatings = detail.playerStatistics
    .filter((row) => (
      row.settlementStatus === "final"
      && (row.appearanceStatus === "started" || row.appearanceStatus === "substitute")
      && typeof row.rating === "number"
      && Number.isFinite(row.rating)
      && (row.teamId === homeTeamId || row.teamId === awayTeamId)
    ))
    .sort((left, right) => Number(right.rating) - Number(left.rating)
      || Number(right.minutes ?? -1) - Number(left.minutes ?? -1)
      || left.playerId.localeCompare(right.playerId));
  const topRating = rankedRatings[0];
  if (!topRating || topRating.rating === null || !topRating.teamId) {
    return { ok: false, reason: "final-official-match-rating-unavailable" };
  }

  const topTeam = topRating.teamId === homeTeamId ? home : away;
  const squadResult = await readPublicPremierSquad(topRating.teamId);
  if (squadResult.status !== 200 || squadResult.body.ok === false) {
    return { ok: false, reason: "top-match-card-squad-unavailable" };
  }
  const topCard = (squadResult.body.rosterPlayers ?? squadResult.body.players)
    .map((player) => publicPremierSquadPlayerToCard(player, topTeam.name))
    .find((card) => String(card.id) === topRating.playerId);
  if (!topCard?.editorialCard || !topCard.cardTier || !topCard.canonicalPlayerId) {
    return { ok: false, reason: "top-match-card-unpublished" };
  }
  const seasonPoints = await readPublicSeasonPlayerPoints([topCard.canonicalPlayerId]);
  const decoratedCard = applyTouchlineSeasonPoints([topCard], seasonPoints)[0];
  if (!decoratedCard) return { ok: false, reason: "top-match-card-unavailable" };

  return {
    ok: true,
    data: {
      fixtureId,
      capturedAt: snapshot.capturedAt,
      startsAt: detail.fixture.startsAt ?? "",
      status: detail.fixture.status ?? "",
      home,
      away,
      score: { home: Number(homeScore), away: Number(awayScore) },
      goals: goalEvents,
      topMatchCard: {
        card: { ...decoratedCard, matchRating: topRating.rating },
        officialMatchRating: topRating.rating,
        team: topTeam,
      },
    },
  };
}
