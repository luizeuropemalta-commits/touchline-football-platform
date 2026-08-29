import "server-only";

import { toPublicFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-fixture";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { readPersistedFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-snapshot";
import {
  publicPremierSquadPlayerToCard,
  readPublicPremierSquad,
} from "@/lib/football-data/public-premier-squad-server";
import { buildTouchLineClubMatchdayPresentation } from "@/lib/touchlineArena/club-lineup";
import { createTouchlineArenaCoachSlot, type TouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { findTouchLineClub, type ClubOwnerSquadCard, type TouchLineClubVisual } from "@/lib/touchlineArena/demo-data";
import {
  touchlineCoachClassificationForProviderId,
  touchlineLiveCoachForTeam,
} from "@/lib/touchlineArena/live-coaches";
import {
  applyTouchlineMatchdayPoints,
  applyTouchlineSeasonPoints,
} from "@/lib/touchlineArena/matchday-player-points";
import { readPublicSeasonPlayerPoints } from "@/lib/touchlineArena/public-season-player-points-server";
import { readTouchlineFormationGeometryRegistry } from "@/lib/touchlineArena/formation-geometry-server";
import { validateTouchlineSocialLineupContract } from "@/lib/touchlineArena/social-lineup-contract";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";

const NUMERIC_ID = /^[0-9]{1,20}$/;

export type TouchlineSocialLineupDraft = Readonly<{
  fixtureId: string;
  capturedAt: string;
  lineupAvailableAt: string;
  startsAt: string;
  status: string;
  score: Readonly<{
    state: "finished";
    home: number;
    away: number;
  }> | null;
  side: "home" | "away";
  formation: string;
  club: TouchLineClubVisual;
  opponent: TouchLineClubVisual;
  home: TouchLineClubVisual;
  away: TouchLineClubVisual;
  coach: Readonly<{
    identity: NonNullable<ReturnType<typeof touchlineLiveCoachForTeam>>;
    slot: TouchlineArenaCoachSlot;
  }>;
  players: readonly Readonly<{ card: ClubOwnerSquadCard; x: number; y: number }>[];
}>;

export type TouchlineSocialLineupDraftResult =
  | Readonly<{ ok: true; data: TouchlineSocialLineupDraft }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Read-only social draft source. It consumes the same published-card and
 * persisted Sportmonks projections as ClubHub; it never calls the provider,
 * writes a fixture or manufactures a missing card.
 */
export async function readTouchlineSocialLineupDraft(input: {
  fixtureId: string;
  teamId: string;
}): Promise<TouchlineSocialLineupDraftResult> {
  const fixtureId = input.fixtureId.trim();
  const teamId = input.teamId.trim();
  if (!NUMERIC_ID.test(fixtureId) || !NUMERIC_ID.test(teamId)) {
    return { ok: false, reason: "invalid-identifiers" };
  }

  const snapshot = await readPersistedFantasyFixtureFeed(fixtureId);
  if (!snapshot) return { ok: false, reason: "fixture-feed-unavailable" };
  const publicFeed = toPublicFantasyFixtureFeed(snapshot.feed);
  const detail = await readPublicFantasyFixtureMatchDetail(fixtureId, publicFeed);
  if (!detail) return { ok: false, reason: "fixture-detail-unavailable" };
  const contract = validateTouchlineSocialLineupContract(detail, teamId);
  if (!contract.ok) return contract;
  const matchState = touchlineFixtureState(detail.fixture);
  const homeScore = detail.fixture.homeScore;
  const awayScore = detail.fixture.awayScore;
  const score = matchState === "finished"
    && Number.isInteger(homeScore) && Number(homeScore) >= 0
    && Number.isInteger(awayScore) && Number(awayScore) >= 0
    ? { state: "finished" as const, home: Number(homeScore), away: Number(awayScore) }
    : null;

  const homeTeamId = String(detail.fixture.homeTeam?.id ?? "").trim();
  const awayTeamId = String(detail.fixture.awayTeam?.id ?? "").trim();
  const home = findTouchLineClub(homeTeamId);
  const away = findTouchLineClub(awayTeamId);
  const club = findTouchLineClub(teamId);
  const opponent = contract.value.side === "home" ? away : home;
  if (!home || !away || !club || !opponent) return { ok: false, reason: "club-identity-unavailable" };
  const coachIdentity = touchlineLiveCoachForTeam(teamId);
  const coachClassification = touchlineCoachClassificationForProviderId(coachIdentity?.coach.providerId);
  if (!coachIdentity || !coachClassification) return { ok: false, reason: "canonical-coach-unavailable" };

  const [squadResult, coachRanking] = await Promise.all([
    readPublicPremierSquad(teamId),
    loadTouchLineCoachRanking(),
  ]);
  if (squadResult.status !== 200 || squadResult.body.ok === false) {
    return { ok: false, reason: "published-squad-unavailable" };
  }
  const rosterCards = (squadResult.body.rosterPlayers ?? squadResult.body.players)
    .map((player) => publicPremierSquadPlayerToCard(player, club.name));
  const starterIds = new Set(contract.value.starterPlayerIds);
  const starterCards = rosterCards.filter((card) => starterIds.has(String(card.id)));
  if (starterCards.length !== 11 || starterCards.some((card) => !card.editorialCard || !card.cardTier)) {
    return { ok: false, reason: "published-starting-xi-unavailable" };
  }

  const seasonPoints = await readPublicSeasonPlayerPoints(
    rosterCards.flatMap((card) => card.canonicalPlayerId ? [card.canonicalPlayerId] : []),
  );
  const decoratedCards = applyTouchlineMatchdayPoints(
    applyTouchlineSeasonPoints(rosterCards, seasonPoints),
    detail.playerStatistics,
  );
  const formationGeometryRegistry = await readTouchlineFormationGeometryRegistry();
  const presentation = buildTouchLineClubMatchdayPresentation({
    club,
    squadCards: decoratedCards,
    officialLineup: snapshot.feed.lineups,
    formation: contract.value.formation,
    fixtureId,
    formationGeometryRegistry,
  });
  if (presentation.lineup.status !== "confirmed" || presentation.lineup.players.length !== 11) {
    return { ok: false, reason: "canonical-lineup-renderer-rejected-xi" };
  }

  const renderedIds = presentation.lineup.players.map(({ card }) => String(card.id));
  if (new Set(renderedIds).size !== 11 || renderedIds.some((id) => !starterIds.has(id))) {
    return { ok: false, reason: "canonical-lineup-identity-mismatch" };
  }
  const officialShirts = new Map(detail.lineups
    .filter((member) => member.teamId === teamId && member.isStarter === true)
    .map((member) => [String(member.playerId), member.jerseyNumber] as const));
  if (presentation.lineup.players.some(({ card }) => officialShirts.get(String(card.id)) !== card.shirtNumber)) {
    return { ok: false, reason: "canonical-card-shirt-mismatch" };
  }

  const coachRankingRow = coachRanking.phase === "ranked"
    ? coachRanking.rows.find((candidate) => candidate.coachProviderId === coachIdentity.coach.providerId) ?? null
    : null;
  const baseCoachSlot = createTouchlineArenaCoachSlot(
    coachIdentity.coach,
    coachRankingRow?.rank ?? coachClassification.finalPosition ?? null,
    coachClassification.tierKey,
  );
  const coachSlot = coachRankingRow && coachRanking.scoringVersion
    ? {
      ...baseCoachSlot,
      touchlinePoints: coachRankingRow.touchlinePoints,
      status: "audited" as const,
      scoreEvidence: {
        provider: "sportmonks" as const,
        providerEventIds: [...coachRanking.fixtureIds],
        scoringVersion: coachRanking.scoringVersion,
      },
    }
    : baseCoachSlot;

  return {
    ok: true,
    data: {
      fixtureId,
      capturedAt: snapshot.capturedAt,
      lineupAvailableAt: contract.value.lineupAvailableAt,
      startsAt: detail.fixture.startsAt ?? "",
      status: detail.fixture.status ?? "",
      score,
      side: contract.value.side,
      formation: contract.value.formation,
      club,
      opponent,
      home,
      away,
      coach: { identity: coachIdentity, slot: coachSlot },
      players: presentation.lineup.players,
    },
  };
}
