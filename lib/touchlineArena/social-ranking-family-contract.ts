import {
  compareTouchlineRankingPlayers,
  type TouchlineRankedPlayer,
} from "./card-ranking.ts";
import type { ClubOwnerSquadCard } from "./demo-data.ts";
import { classifyTouchlineConfirmedMatchEvent } from "./social-confirmed-event-contract.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;

export const TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES = [
  "GAMEWEEK_RANKING_PREVIEW",
  "GAMEWEEK_RANKING_FINAL",
  "PLAYER_DUEL",
  "GAMEWEEK_HERO",
  "TOP_PERFORMER",
  "HAT_TRICK_HERO",
] as const;

export type TouchlineSocialRankingContentType =
  (typeof TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES)[number];

export type TouchlineSocialRankingCard = Readonly<{
  card: ClubOwnerSquadCard;
  totalRating: number;
  overallRank: number;
  positionRank: number;
  positionGroup: TouchlineRankedPlayer["positionGroup"];
}>;

export type TouchlineFixtureSettlementCandidate = Readonly<{
  playerId: string;
  providerPlayerId: string;
  officialMatchRating: number;
  minutesPlayed: number;
  settlementStatus: "final" | "provisional";
}>;

function normalised(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function eligiblePublishedCard(card: ClubOwnerSquadCard) {
  return NUMERIC_ID.test(String(card.id))
    && UUID.test(String(card.canonicalPlayerId ?? ""))
    && Number.isInteger(card.shirtNumber)
    && Number(card.shirtNumber) > 0
    && Boolean(card.editorialCard)
    && card.editorialCard?.tierKey === card.cardTier;
}

/**
 * Selects the public Top 3 from one immutable V3 ranking snapshot. The order
 * deliberately reuses the product ranking comparator; social output cannot
 * introduce another tie-break rule.
 */
export function selectTouchlineSocialRankingTopThree(input: Readonly<{
  rankingPlayers: readonly TouchlineRankedPlayer[];
  cards: readonly ClubOwnerSquadCard[];
}>): readonly TouchlineSocialRankingCard[] | null {
  const cardsByCanonicalId = new Map<string, ClubOwnerSquadCard>();
  for (const card of input.cards) {
    const canonicalId = normalised(card.canonicalPlayerId);
    if (!canonicalId || cardsByCanonicalId.has(canonicalId)) return null;
    cardsByCanonicalId.set(canonicalId, card);
  }
  const ranked = [...input.rankingPlayers].sort(compareTouchlineRankingPlayers);
  if (!ranked.length || new Set(ranked.map((row) => normalised(row.playerId))).size !== ranked.length) {
    return null;
  }
  const podium = ranked.slice(0, 3);
  if (podium.length !== 3) return null;
  const selected = podium.flatMap((row, index) => {
    const card = cardsByCanonicalId.get(normalised(row.playerId));
    if (!card || !eligiblePublishedCard(card)
      || normalised(row.providerPlayerId) !== normalised(card.id)
      || row.totalRating === null || !Number.isFinite(row.totalRating)
      || card.seasonTotalRating !== row.totalRating
      || card.clubName !== row.clubName) return [];
    return [{
      card,
      totalRating: row.totalRating,
      overallRank: index + 1,
      positionRank: row.positionRank,
      positionGroup: row.positionGroup,
    } satisfies TouchlineSocialRankingCard];
  });
  return selected.length === 3 ? Object.freeze(selected) : null;
}

/** Highest official Match Rating; minutes and provider ID are visual tie-breaks only. */
export function selectTouchlineTopPerformer(input: Readonly<{
  settlements: readonly TouchlineFixtureSettlementCandidate[];
  cards: readonly ClubOwnerSquadCard[];
  requireFinal: boolean;
}>): TouchlineSocialRankingCard | null {
  const cardsByCanonicalId = new Map(input.cards.map((card) => (
    [normalised(card.canonicalPlayerId), card] as const
  )));
  if (cardsByCanonicalId.size !== input.cards.length) return null;
  const rows = input.settlements.filter((row) => (
    UUID.test(row.playerId)
    && NUMERIC_ID.test(row.providerPlayerId)
    && Number.isFinite(row.officialMatchRating)
    && row.officialMatchRating >= 0
    && row.officialMatchRating <= 10
    && Number.isInteger(row.minutesPlayed)
    && row.minutesPlayed >= 0
    && (!input.requireFinal || row.settlementStatus === "final")
  )).sort((left, right) => (
    right.officialMatchRating - left.officialMatchRating
    || right.minutesPlayed - left.minutesPlayed
    || left.providerPlayerId.localeCompare(right.providerPlayerId, "en")
  ));
  const winner = rows.find((row) => {
    const card = cardsByCanonicalId.get(normalised(row.playerId));
    return card && eligiblePublishedCard(card)
      && typeof card.seasonTotalRating === "number"
      && Number.isFinite(card.seasonTotalRating)
      && normalised(card.id) === normalised(row.providerPlayerId);
  });
  if (!winner) return null;
  const card = cardsByCanonicalId.get(normalised(winner.playerId))!;
  return {
    card: { ...card, matchRating: winner.officialMatchRating },
    totalRating: Number(card.seasonTotalRating),
    overallRank: 0,
    positionRank: 0,
    positionGroup: "midfielder",
  };
}

export function countTouchlineConfirmedHatTrickGoals(
  events: readonly Readonly<{ playerId: string; kind: "goal" | "penalty" | "own-goal" }>[],
  playerId: string,
) {
  const identity = normalised(playerId);
  if (!NUMERIC_ID.test(identity)) return 0;
  return events.filter((event) => (
    normalised(event.playerId) === identity && (event.kind === "goal" || event.kind === "penalty")
  )).length;
}

/**
 * Converts one persisted event into a hat-trick scoring fact only after the
 * shared confirmed-event contract accepts it. Rescinded, overturned, pending,
 * VAR/review and unknown statuses stay fail-closed in discovery and rendering.
 */
export function touchlineConfirmedHatTrickGoalFact(input: Readonly<{
  playerId: string | null | undefined;
  type: string | null | undefined;
  status: string | null | undefined;
  info: string | null | undefined;
  addition: string | null | undefined;
}>) {
  const playerId = normalised(input.playerId);
  if (!NUMERIC_ID.test(playerId)) return null;
  const kind = classifyTouchlineConfirmedMatchEvent(input);
  return kind === "goal" || kind === "penalty"
    ? { playerId, kind } as const
    : null;
}

export function touchlineGameweekIsFinal(input: Readonly<{
  fixtures: readonly Readonly<{ id: string; status: string }>[];
  settlements: readonly Readonly<{ fixtureId: string; status: string }>[];
}>) {
  if (!input.fixtures.length) return false;
  const fixtureIds = new Set(input.fixtures.map((fixture) => normalised(fixture.id)));
  if (fixtureIds.size !== input.fixtures.length
    || input.fixtures.some((fixture) => !UUID.test(fixture.id) || fixture.status.toLowerCase() !== "finished")) {
    return false;
  }
  const settlementFixtureIds = new Set<string>();
  for (const settlement of input.settlements) {
    const fixtureId = normalised(settlement.fixtureId);
    if (!fixtureIds.has(fixtureId) || settlement.status.toLowerCase() !== "final") return false;
    settlementFixtureIds.add(fixtureId);
  }
  return settlementFixtureIds.size === fixtureIds.size;
}
