import type { ClubOwnerSquadCard, TouchLineClubVisual } from "./demo-data.ts";
import {
  compareTouchlineRankingPlayers,
  type TouchlineRankedPlayer,
} from "./card-ranking.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;

export type TouchlineMatchPreviewTableRow = Readonly<{
  providerTeamId: string;
  sportsRank: number;
  displayPosition: number;
  isTied: boolean;
  played: number;
  goalDifference: number;
  points: number;
}>;

export type TouchlineMatchPreviewLeader = Readonly<{
  card: ClubOwnerSquadCard;
  totalRating: number;
  overallRank: number;
  positionGroup: TouchlineRankedPlayer["positionGroup"];
  positionRank: number;
}>;

export type TouchlineMatchPreviewSide = Readonly<{
  club: TouchLineClubVisual & Readonly<{ logoUrl: string }>;
  table: TouchlineMatchPreviewTableRow;
  leader: TouchlineMatchPreviewLeader;
}>;

function normalised(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function eligibleSquadCard(card: ClubOwnerSquadCard) {
  return NUMERIC_ID.test(String(card.id))
    && UUID.test(String(card.canonicalPlayerId ?? ""))
    && Number.isInteger(card.shirtNumber)
    && Number(card.shirtNumber) > 0
    && Boolean(card.editorialCard)
    && card.editorialCard?.tierKey === card.cardTier
    && typeof card.seasonTotalRating === "number"
    && Number.isFinite(card.seasonTotalRating);
}

function selectLeader(input: Readonly<{
  club: TouchLineClubVisual;
  squad: readonly ClubOwnerSquadCard[];
  rankingPlayers: readonly TouchlineRankedPlayer[];
  globalRankByPlayerId: ReadonlyMap<string, number>;
}>): TouchlineMatchPreviewLeader | null {
  const providers = new Set<string>();
  const canonicalIds = new Set<string>();
  for (const card of input.squad) {
    const providerId = normalised(card.id);
    const canonicalId = normalised(card.canonicalPlayerId);
    if (!providerId || !canonicalId || providers.has(providerId) || canonicalIds.has(canonicalId)) {
      return null;
    }
    providers.add(providerId);
    canonicalIds.add(canonicalId);
  }

  const cardsByCanonicalId = new Map(input.squad.map((card) => (
    [normalised(card.canonicalPlayerId), card] as const
  )));
  const candidates = input.rankingPlayers.flatMap((ranked) => {
    const card = cardsByCanonicalId.get(normalised(ranked.playerId));
    return card
      && eligibleSquadCard(card)
      && normalised(ranked.providerPlayerId) === normalised(card.id)
      && ranked.totalRating !== null
      && Number.isFinite(ranked.totalRating)
      && ranked.totalRating === card.seasonTotalRating
      && ranked.clubName === input.club.name
      && card.clubName === input.club.name
      ? [{ ranked, card }]
      : [];
  }).sort((left, right) => compareTouchlineRankingPlayers(left.ranked, right.ranked));

  const winner = candidates[0];
  if (!winner) return null;
  const overallRank = input.globalRankByPlayerId.get(normalised(winner.ranked.playerId));
  if (!overallRank) return null;
  return {
    card: winner.card,
    totalRating: Number(winner.ranked.totalRating),
    overallRank,
    positionGroup: winner.ranked.positionGroup,
    positionRank: winner.ranked.positionRank,
  };
}

export function selectTouchlineMatchPreviewSides(input: Readonly<{
  homeClub: TouchLineClubVisual;
  awayClub: TouchLineClubVisual;
  homeSquad: readonly ClubOwnerSquadCard[];
  awaySquad: readonly ClubOwnerSquadCard[];
  tableRows: readonly TouchlineMatchPreviewTableRow[];
  rankingPlayers: readonly TouchlineRankedPlayer[];
}>): Readonly<{ home: TouchlineMatchPreviewSide; away: TouchlineMatchPreviewSide }> | null {
  if (input.homeClub.teamId === input.awayClub.teamId
    || !NUMERIC_ID.test(input.homeClub.teamId)
    || !NUMERIC_ID.test(input.awayClub.teamId)
    || !input.homeClub.logoUrl
    || !input.awayClub.logoUrl
    || !input.rankingPlayers.length) return null;

  const globallyRanked = [...input.rankingPlayers].sort(compareTouchlineRankingPlayers);
  const globalRankByPlayerId = new Map(globallyRanked.map((player, index) => (
    [normalised(player.playerId), index + 1] as const
  )));
  if (globalRankByPlayerId.size !== globallyRanked.length) return null;

  const tableRowFor = (teamId: string) => {
    const matches = input.tableRows.filter((row) => row.providerTeamId === teamId);
    const row = matches.length === 1 ? matches[0] : null;
    return row
      && Number.isInteger(row.sportsRank) && row.sportsRank > 0
      && Number.isInteger(row.displayPosition) && row.displayPosition > 0
      && Number.isInteger(row.played) && row.played >= 0
      && Number.isInteger(row.points) && row.points >= 0
      && Number.isInteger(row.goalDifference)
      ? row
      : null;
  };
  const homeTable = tableRowFor(input.homeClub.teamId);
  const awayTable = tableRowFor(input.awayClub.teamId);
  if (!homeTable || !awayTable) return null;

  const homeLeader = selectLeader({
    club: input.homeClub,
    squad: input.homeSquad,
    rankingPlayers: input.rankingPlayers,
    globalRankByPlayerId,
  });
  const awayLeader = selectLeader({
    club: input.awayClub,
    squad: input.awaySquad,
    rankingPlayers: input.rankingPlayers,
    globalRankByPlayerId,
  });
  if (!homeLeader || !awayLeader) return null;
  if (homeLeader.card.canonicalPlayerId === awayLeader.card.canonicalPlayerId
    || homeLeader.card.id === awayLeader.card.id) return null;

  return {
    home: {
      club: { ...input.homeClub, logoUrl: input.homeClub.logoUrl },
      table: homeTable,
      leader: homeLeader,
    },
    away: {
      club: { ...input.awayClub, logoUrl: input.awayClub.logoUrl },
      table: awayTable,
      leader: awayLeader,
    },
  };
}
