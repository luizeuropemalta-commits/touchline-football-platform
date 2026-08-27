import type { ClubOwnerSquadCard } from "./demo-data.ts";
import {
  TOUCHLINE_LIVE_COACHES,
  TOUCHLINE_LIVE_COACH_CLASSIFICATIONS,
  type TouchlineLiveCoachSnapshot,
} from "./live-coaches.ts";
import {
  TOUCHLINE_ARENA_MARKET_TIERS,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import type { TouchlineCoachClassification } from "./coach-classification.ts";

/** Commercial order is canonical: most valuable border first. */
export const TOUCHLINE_CLUBHUB_TIER_ORDER: readonly TouchlineCardTierKey[] =
  Object.freeze(TOUCHLINE_ARENA_MARKET_TIERS.map((tier) => tier.key));

export type TouchlinePlayerTierRepresentative = Readonly<{
  tierKey: TouchlineCardTierKey;
  card: ClubOwnerSquadCard | null;
}>;

export type TouchlineCoachTierRepresentative = Readonly<{
  tierKey: TouchlineCardTierKey;
  snapshot: TouchlineLiveCoachSnapshot | null;
  classification: TouchlineCoachClassification | null;
}>;

const FAMOUS_PLAYER_TIEBREAK = [
  "erling haaland",
  "mohamed salah",
  "bukayo saka",
  "cole palmer",
  "rodri",
  "declan rice",
  "bruno fernandes",
] as const;

function normalizedName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function famousPlayerRank(name: string) {
  const index = FAMOUS_PLAYER_TIEBREAK.indexOf(normalizedName(name) as (typeof FAMOUS_PLAYER_TIEBREAK)[number]);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function publishedMarketValue(card: ClubOwnerSquadCard) {
  const value = card.editorialCard?.marketValueEur;
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

/**
 * Selects one real, published player per border. Haaland is the explicitly
 * approved Diamond Gold representative; every other tier selects its highest
 * verified market value, then uses fame and player name only as deterministic
 * tiebreaks.
 */
export function selectTouchlinePlayerTierRepresentatives(
  cards: readonly ClubOwnerSquadCard[],
): readonly TouchlinePlayerTierRepresentative[] {
  return TOUCHLINE_CLUBHUB_TIER_ORDER.map((tierKey) => {
    const candidates = cards
      .filter((card) => card.editorialCard?.tierKey === tierKey)
      .sort((first, second) => {
        if (tierKey === "diamond-gold") {
          const firstIsHaaland = normalizedName(first.name) === "erling haaland";
          const secondIsHaaland = normalizedName(second.name) === "erling haaland";
          if (firstIsHaaland !== secondIsHaaland) return firstIsHaaland ? -1 : 1;
        }
        return publishedMarketValue(second) - publishedMarketValue(first)
          || famousPlayerRank(first.name) - famousPlayerRank(second.name)
          || first.name.localeCompare(second.name, "en-GB", { sensitivity: "base" });
      });

    return { tierKey, card: candidates[0] ?? null };
  });
}

function promotionRank(classification: TouchlineCoachClassification) {
  if (classification.promotionType === "champions") return 0;
  if (classification.promotionType === "runners-up") return 1;
  if (classification.promotionType === "playoff-winners") return 2;
  return 3;
}

/**
 * Orders the seven representatives by their immutable previous-season
 * evidence, then assigns that order to the seven commercial borders from
 * highest to entry. Official final position is authoritative; promotion route
 * follows completed top-flight positions and coach name is the final tiebreak.
 */
export function selectTouchlineCoachTierRepresentatives(): readonly TouchlineCoachTierRepresentative[] {
  const ranked = TOUCHLINE_LIVE_COACHES
    .flatMap((snapshot) => {
      const classification = TOUCHLINE_LIVE_COACH_CLASSIFICATIONS[snapshot.coach.providerId];
      return classification?.sourceSeasonId ? [{ snapshot, classification }] : [];
    })
    .sort((first, second) => {
      const firstPosition = first.classification.finalPosition ?? Number.MAX_SAFE_INTEGER;
      const secondPosition = second.classification.finalPosition ?? Number.MAX_SAFE_INTEGER;
      return firstPosition - secondPosition
        || promotionRank(first.classification) - promotionRank(second.classification)
        || first.snapshot.coach.displayName.localeCompare(
          second.snapshot.coach.displayName,
          "en-GB",
          { sensitivity: "base" },
        );
    })
    .slice(0, TOUCHLINE_CLUBHUB_TIER_ORDER.length);

  return TOUCHLINE_CLUBHUB_TIER_ORDER.map((tierKey, index) => {
    const representative = ranked[index];
    return {
      tierKey,
      snapshot: representative?.snapshot ?? null,
      classification: representative?.classification ?? null,
    };
  });
}
