import type { TouchlinePublicFixturePlayerStatistics } from "@/lib/football-data/public-fantasy-fixture";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import {
  projectTouchlineCardStatsByPosition,
  type TouchlineCardStats,
} from "./position-aware-card-stats.ts";

export type TouchlinePublicSeasonPlayerPoints = Readonly<{
  canonicalPlayerId: string;
  touchlinePoints: number | null;
  /** Canonical cumulative provider rating. Null remains an explicit absence. */
  totalRating?: number | null;
  statistics: Readonly<{
    goals?: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
    cleanSheets?: number;
    saves?: number;
    goalsConceded?: number;
    shotsOnTarget?: number;
    shotsOffTarget?: number;
    defensiveActionsTotal?: number;
    defense?: number;
    penaltySaves?: number;
    penaltiesMissed?: number;
    ownGoals?: number;
    rating?: number;
  }>;
}>;

/**
 * Applies one persisted fixture's allowlisted scoring projection to card
 * presentation. This is a view-only adapter: it neither recalculates points
 * nor writes card, roster, contract or provider state.
 */
export function applyTouchlineMatchdayPoints(
  cards: readonly ClubOwnerSquadCard[],
  statistics: readonly TouchlinePublicFixturePlayerStatistics[],
) {
  const byProviderPlayerId = new Map(
    statistics.map((statistic) => [statistic.playerId, statistic] as const),
  );
  return cards.map((card) => {
    const statistic = byProviderPlayerId.get(String(card.id));
    if (!statistic) return card;
    const { goals, assists, yellowCards, redCards, cleanSheets, saves, goalsConceded, shotsOnTarget, shotsOffTarget, defensiveActionsTotal, defense, penaltySaves, penaltiesMissed, ownGoals } = statistic.statistics;
    const unscopedMatchStats = {
      ...(goals === undefined ? {} : { goals }),
      ...(assists === undefined ? {} : { assists }),
      ...(cleanSheets === undefined ? {} : { cleanSheets }),
      ...(saves === undefined ? {} : { saves }),
      ...(goalsConceded === undefined ? {} : { goalsConceded }),
      ...(yellowCards === undefined ? {} : { yellowCards }),
      ...(redCards === undefined ? {} : { redCards }),
      ...(shotsOnTarget === undefined ? {} : { shotsOnTarget }),
      ...(shotsOffTarget === undefined ? {} : { shotsOffTarget }),
      ...(defensiveActionsTotal === undefined ? {} : { defensiveActionsTotal }),
      ...(defense === undefined ? {} : { defense }),
      ...(penaltySaves === undefined ? {} : { penaltySaves }),
      ...(penaltiesMissed === undefined ? {} : { penaltiesMissed }),
      ...(ownGoals === undefined ? {} : { ownGoals }),
      ...(yellowCards === undefined || redCards === undefined ? {} : { cards: yellowCards + redCards }),
      rating: statistic.rating,
    } satisfies TouchlineCardStats;
    const matchStats = projectTouchlineCardStatsByPosition({
      position: card.position || card.role,
      statistics: unscopedMatchStats,
    });
    return {
      ...card,
      // Null means the persisted scoring fact is unavailable; a confirmed
      // zero remains zero and final fixture cards retain it after full time.
      matchTouchlinePoints: statistic.touchlinePoints,
      // The same persisted fixture row owns the provider rating shown by the
      // shared card and Zoom. Keep null explicit; never derive it from stats
      // or from the preserved legacy points field.
      matchRating: statistic.rating,
      ...(matchStats && Object.keys(matchStats).length ? { matchStats } : {}),
      ...(statistic.contributions.length
        ? {
          matchPointContributions: statistic.contributions.map((contribution) => ({
            role: contribution.role,
            eventType: contribution.eventType,
            minute: contribution.minute,
            points: contribution.points,
            ...(contribution.ruleCode === undefined ? {} : { ruleCode: contribution.ruleCode }),
            ...(contribution.quantity === undefined ? {} : { quantity: contribution.quantity }),
            ...(contribution.unitPoints === undefined ? {} : { unitPoints: contribution.unitPoints }),
            ...(contribution.factValue === undefined ? {} : { factValue: contribution.factValue }),
            ...(contribution.detail === undefined ? {} : { detail: contribution.detail }),
          })),
        }
        : {}),
    };
  });
}

/**
 * Keeps the card's historic field intact for legacy/demo consumers while the
 * public card presentation gets an explicit canonical season projection.
 * An absent database fact stays null — it is never silently converted to 0.
 */
export function applyTouchlineSeasonPoints(
  cards: readonly ClubOwnerSquadCard[],
  statistics: readonly TouchlinePublicSeasonPlayerPoints[],
) {
  const byCanonicalPlayerId = new Map(
    statistics.map((statistic) => [statistic.canonicalPlayerId, statistic] as const),
  );
  return cards.map((card) => {
    const canonicalPlayerId = String(card.canonicalPlayerId ?? "").trim();
    const statistic = canonicalPlayerId ? byCanonicalPlayerId.get(canonicalPlayerId) : null;
    const seasonStats = projectTouchlineCardStatsByPosition({
      position: card.position || card.role,
      statistics: statistic?.statistics,
    });
    return {
      ...card,
      seasonTouchlinePoints: statistic?.touchlinePoints ?? null,
      // The Club Hub already consumes this same server-owned season
      // projection for stats. Keep the audited cumulative rating alongside it
      // so every card surface renders the exact canonical total, never a
      // locally derived value or a legacy score fallback.
      seasonTotalRating: statistic?.totalRating ?? null,
      ...(seasonStats && Object.keys(seasonStats).length ? { seasonStats } : {}),
    };
  });
}
