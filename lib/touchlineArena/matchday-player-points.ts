import type { TouchlinePublicFixturePlayerStatistics } from "@/lib/football-data/public-fantasy-fixture";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";

export type TouchlinePublicSeasonPlayerPoints = Readonly<{
  canonicalPlayerId: string;
  touchlinePoints: number | null;
  statistics: Readonly<{
    goals?: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
    cleanSheets?: number;
    saves?: number;
    goalsConceded?: number;
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
    const { goals, assists, yellowCards, redCards, cleanSheets, saves, goalsConceded } = statistic.statistics;
    const matchStats = {
      ...(goals === undefined ? {} : { goals }),
      ...(assists === undefined ? {} : { assists }),
      ...(cleanSheets === undefined ? {} : { cleanSheets }),
      ...(saves === undefined ? {} : { saves }),
      ...(goalsConceded === undefined ? {} : { goalsConceded }),
      ...(yellowCards === undefined ? {} : { yellowCards }),
      ...(redCards === undefined ? {} : { redCards }),
      ...(yellowCards === undefined || redCards === undefined ? {} : { cards: yellowCards + redCards }),
    };
    return {
      ...card,
      // Null means the persisted scoring fact is unavailable; a confirmed
      // zero remains zero and final fixture cards retain it after full time.
      matchTouchlinePoints: statistic.touchlinePoints,
      ...(Object.keys(matchStats).length ? { matchStats } : {}),
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
    return {
      ...card,
      seasonTouchlinePoints: statistic?.touchlinePoints ?? null,
      ...(statistic && Object.keys(statistic.statistics).length ? { seasonStats: statistic.statistics } : {}),
    };
  });
}
