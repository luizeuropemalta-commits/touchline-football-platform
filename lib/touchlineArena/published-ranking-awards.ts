import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { ClubOwnerSquadCard } from "./demo-data";
import { parseTouchlinePublicEditorialCardPresentation } from "./editorial-card-profile.ts";
import { cardGoalsLeadership, parseCardGoalsPublication } from "./card-goals-leadership.ts";
import { leadershipCrownEligibility } from "./leadership-decision.ts";
import { parsePublishedTouchlinePlayerLeadership, touchlinePlayerLeadershipScope } from "./player-ranking-leadership.ts";
import {
  projectTouchlinePublishedRankingCatalog,
  type TouchlinePublishedRankingCatalog,
  type TouchlinePublishedRankingCatalogFailure,
} from "./published-ranking-catalog.ts";

type AwardEmpty = Readonly<{
  contenders: readonly ClubOwnerSquadCard[];
  awardedPlayerIds: readonly string[];
}>;

export type TouchlinePublishedAwardProjection =
  | Readonly<{
      phase: "ready";
      snapshotId: string;
      metric: "total-rating" | "goals";
      value: number;
      status: "unique-leader" | "tied";
      contenders: readonly ClubOwnerSquadCard[];
      /** Ball: only the explicit unique decision. Boot: all positive joint leaders. */
      awardedPlayerIds: readonly string[];
    }>
  | (AwardEmpty & Readonly<{ phase: "withdrawn" }>)
  | (AwardEmpty & Readonly<{
      phase: "pending";
      reason: "no-rated-candidates" | "leadership-unavailable" | "goals-unavailable" | "no-positive-goals";
    }>)
  | (AwardEmpty & Readonly<{
      phase: "incomplete";
      reason: TouchlinePublishedRankingCatalogFailure | "invalid-card-goals" | "leadership-mismatch";
      missingPlayerIds: readonly string[];
    }>);

export type TouchlinePublishedRankingAwards = Readonly<{
  /** Classification is not permission to decorate the first card with a Ball. */
  rating: TouchlinePublishedRankingCatalog;
  podium: readonly ClubOwnerSquadCard[];
  goldenBall: TouchlinePublishedAwardProjection;
  goldenBoot: TouchlinePublishedAwardProjection;
}>;

const EMPTY_CARDS: readonly ClubOwnerSquadCard[] = Object.freeze([]);
const EMPTY_IDS: readonly string[] = Object.freeze([]);
const EMPTY_AWARD: AwardEmpty = Object.freeze({ contenders: EMPTY_CARDS, awardedPlayerIds: EMPTY_IDS });
const canonicalId = (card: ClubOwnerSquadCard) => (card.canonicalPlayerId ?? card.id).trim().toLowerCase();
const normalizedProvider = (value: string | number | null | undefined) => String(value ?? "").trim().toLowerCase();

function incomplete(
  reason: Extract<TouchlinePublishedAwardProjection, { phase: "incomplete" }>["reason"],
  missingPlayerIds: readonly string[] = EMPTY_IDS,
): TouchlinePublishedAwardProjection {
  return { ...EMPTY_AWARD, phase: "incomplete", reason, missingPlayerIds: [...new Set(missingPlayerIds)].sort() };
}

function pending(reason: Extract<TouchlinePublishedAwardProjection, { phase: "pending" }>["reason"]): TouchlinePublishedAwardProjection {
  return { ...EMPTY_AWARD, phase: "pending", reason };
}

function projectGoldenBall(
  ranking: TouchlineActiveRankingState,
  rating: Extract<TouchlinePublishedRankingCatalog, { phase: "ready" }>,
): TouchlinePublishedAwardProjection {
  const first = rating.cards[0];
  if (!first) return pending("no-rated-candidates");
  const decision = parsePublishedTouchlinePlayerLeadership({
    value: ranking.leadershipDecision,
    snapshotId: rating.snapshotId,
    playerIds: ranking.players.map(row => row.playerId),
  });
  if (!decision || decision.status === "unavailable") return pending("leadership-unavailable");
  if (decision.status === "withdrawn") return { ...EMPTY_AWARD, phase: "withdrawn" };

  const value = first.seasonTotalRating!;
  const ratingLeaders = rating.cards.filter(card => card.seasonTotalRating === value);
  if (decision.status === "tied") {
    const publishedIds = new Set(decision.contenders.map(subject => subject.subjectId.trim().toLowerCase()));
    if (publishedIds.size !== ratingLeaders.length || ratingLeaders.some(card => !publishedIds.has(canonicalId(card)))) {
      return incomplete("leadership-mismatch");
    }
    // A published tie remains a tie. A stable display order is not a grant.
    return { phase: "ready", snapshotId: rating.snapshotId, metric: "total-rating", value,
      status: "tied", contenders: ratingLeaders, awardedPlayerIds: EMPTY_IDS };
  }

  const firstId = canonicalId(first);
  const leaderRows = ranking.players.filter(row => row.totalRating === value);
  // The catalogue binds UUIDs canonically, but the persisted leadership
  // contract preserves its exact subject spelling. Check the original row's
  // identity rather than changing either side of that authority contract.
  const firstRow = leaderRows.find(row => row.playerId.trim().toLowerCase() === firstId);
  const tiebreakAvailable = leaderRows.length <= 1
    || leaderRows.every(row => row.minutesPlayed != null && row.appearances != null);
  if (!firstRow || !tiebreakAvailable || !leadershipCrownEligibility(decision,
    { subjectType: "player", subjectId: firstRow.playerId }, touchlinePlayerLeadershipScope(rating.snapshotId))) {
    return incomplete("leadership-mismatch");
  }
  return { phase: "ready", snapshotId: rating.snapshotId, metric: "total-rating", value,
    status: "unique-leader", contenders: [first], awardedPlayerIds: [firstId] };
}

function projectGoldenBoot(
  catalogue: readonly ClubOwnerSquadCard[],
  ranking: TouchlineActiveRankingState,
  rating: Extract<TouchlinePublishedRankingCatalog, { phase: "ready" }>,
): TouchlinePublishedAwardProjection {
  if (ranking.cardGoals == null) return pending("goals-unavailable");
  const goals = parseCardGoalsPublication(ranking.cardGoals, rating.snapshotId);
  if (!goals) return incomplete("invalid-card-goals");
  // Rating projection has already checked uniqueness and canonical/provider
  // identity throughout the explicit catalogue, including goals-only cards.
  const cardsById = new Map(catalogue.map(card => [canonicalId(card), card]));
  const rowsById = new Map(ranking.players.map(row => [row.playerId.trim().toLowerCase(), row]));
  const missing = goals.rows.filter(row => !parseTouchlinePublicEditorialCardPresentation(cardsById.get(row.playerId)?.editorialCard))
    .map(row => row.playerId);
  if (missing.length) return incomplete("missing-published-card", missing);
  if (goals.rows.some(row => {
    const ranked = rowsById.get(row.playerId);
    return ranked && normalizedProvider(ranked.providerPlayerId) !== normalizedProvider(cardsById.get(row.playerId)!.providerPlayerId);
  })) return incomplete("provider-mismatch");

  const decision = cardGoalsLeadership(goals);
  if (decision.status !== "unique-leader" && decision.status !== "tied") return pending("no-positive-goals");
  const ids = decision.status === "unique-leader"
    ? [decision.leader.subjectId]
    : decision.contenders.map(subject => subject.subjectId);
  const projectedById = new Map(rating.cards.map(card => [canonicalId(card), card]));
  const contenders = ids.map(id => projectedById.get(id) ?? {
    ...cardsById.get(id)!,
    // Goals do not prove a rating. Withdraw any old catalogue rating/evidence
    // without rewriting editorial economy, match facts or season statistics.
    seasonTotalRating: null,
    publishedRanking: undefined,
  });
  const value = goals.rows.find(row => row.playerId === ids[0])!.goals!;
  return { phase: "ready", snapshotId: rating.snapshotId, metric: "goals", value,
    status: decision.status, contenders, awardedPlayerIds: ids };
}

/**
 * Pure projection from one already admitted publication and its explicit full
 * rating + goals catalogue. Never pass just an old top3/top20. Unknown identities
 * require a server catalogue refresh; this function never reads another source.
 * The server must establish catalogue provenance/editorial publication. Here we
 * check canonical/provider uniqueness and published presentation shape; a goal
 * row has only a canonical UUID, so a goals-only provider binding comes from that
 * trusted catalogue, not from a made-up rating row or a name/provider fallback.
 *
 * No creation-time watermark: an admitted A -> B -> A is a valid correction.
 * Classification/podium and award grants are deliberately distinct. Neither
 * sorting nor position #1 can manufacture the Ball's persisted leadership.
 */
export function projectTouchlinePublishedRankingAwards(
  catalogue: readonly ClubOwnerSquadCard[],
  ranking: TouchlineActiveRankingState | null,
): TouchlinePublishedRankingAwards {
  let rating = projectTouchlinePublishedRankingCatalog(catalogue, ranking);
  if (rating.phase === "ready") {
    const missing = rating.cards.filter(card => !parseTouchlinePublicEditorialCardPresentation(card.editorialCard)).map(canonicalId);
    if (missing.length) rating = { phase: "incomplete", reason: "missing-published-card", missingPlayerIds: missing.sort(), cards: EMPTY_CARDS };
  }
  if (rating.phase !== "ready") {
    const award: TouchlinePublishedAwardProjection = rating.phase === "withdrawn"
      ? { ...EMPTY_AWARD, phase: "withdrawn" }
      : incomplete(rating.reason, rating.missingPlayerIds);
    return { rating, podium: EMPTY_CARDS, goldenBall: award, goldenBoot: award };
  }
  return {
    rating, podium: rating.cards.slice(0, 3),
    goldenBall: projectGoldenBall(ranking!, rating),
    goldenBoot: projectGoldenBoot(catalogue, ranking!, rating),
  };
}
