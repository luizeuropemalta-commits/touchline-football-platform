import type { FootballDataProviderName, TouchlineCoach } from "@/lib/football-data/types";
import {
  TOUCHLINE_CARD_STARTING_TIER_KEY,
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "./card-rules.ts";

export const TOUCHLINE_COACH_CARD_APPAREL = "official-coach-photo-art" as const;
export const TOUCHLINE_COACH_RANKING_SIZE = 20;

/** Coaches reuse the one approved player-card tier/price catalogue. */
export const TOUCHLINE_COACH_PRICE_TABLE_VERSION = "2026-07-premier-v1";

/** Coach cards use the owner-approved official coach artworks, one per market tier. */
export const TOUCHLINE_COACH_CARD_ART: Readonly<Record<TouchlineCardTierKey, string>> = {
  "ruby-red": "/touchlineArena/cards/coaches/02_red_coach.png",
  "sapphire-blue": "/touchlineArena/cards/coaches/01_blue_coach.png",
  "emerald-green": "/touchlineArena/cards/coaches/03_green_coach.png",
  "amethyst-purple": "/touchlineArena/cards/coaches/04_purple_coach.png",
  "clear-diamond": "/touchlineArena/cards/coaches/05_silver_coach.png",
  "radiant-gold": "/touchlineArena/cards/coaches/06_gold_coach.png",
  "diamond-gold": "/touchlineArena/cards/coaches/07_golddiamond_coach.png",
};

export function touchlineCoachCardArtForTier(tier: TouchlineCardTierKey) {
  return TOUCHLINE_COACH_CARD_ART[tier] ?? TOUCHLINE_COACH_CARD_ART[TOUCHLINE_CARD_STARTING_TIER_KEY];
}

/**
 * Coach tier table follows football table language for the initial season seed:
 * - Diamond Gold belongs to the last-season champion / highest TL coach who is
 *   still eligible for the current Premier League season.
 * - Previous-season reputation defines only the starting border and price.
 * - TL Points, coach stats and coach rankings always start at zero.
 * - The border is fixed during the season and recalculated only for the next one.
 */
export const TOUCHLINE_COACH_TIER_BANDS: ReadonlyArray<{
  min: number;
  max: number;
  tierKey: TouchlineCardTierKey;
}> = [
  { min: 1, max: 1, tierKey: "diamond-gold" },
  { min: 2, max: 5, tierKey: "clear-diamond" },
  { min: 6, max: 8, tierKey: "emerald-green" },
  { min: 9, max: 12, tierKey: "radiant-gold" },
  { min: 13, max: 16, tierKey: "amethyst-purple" },
  { min: 17, max: 17, tierKey: "sapphire-blue" },
  { min: 18, max: 20, tierKey: "ruby-red" },
];

export function touchlineCoachTierForRankingPosition(position?: number | null): TouchlineCardTierKey {
  if (!Number.isInteger(position) || !position || position < 1 || position > TOUCHLINE_COACH_RANKING_SIZE) {
    return TOUCHLINE_CARD_STARTING_TIER_KEY;
  }
  return TOUCHLINE_COACH_TIER_BANDS.find((band) => position >= band.min && position <= band.max)?.tierKey
    ?? TOUCHLINE_CARD_STARTING_TIER_KEY;
}

export const TOUCHLINE_DEMO_COACH: TouchlineCoach = {
  id: "demo:coach:enzo-maresca",
  providerId: "demo-enzo-maresca",
  provider: "sportmonks",
  name: "Enzo Maresca",
  displayName: "Enzo Maresca",
  nationality: "Italy",
  teamId: "9",
  source: {
    provider: "sportmonks",
    providerId: "demo-enzo-maresca",
    externalUrl: "https://www.mancity.com/news/mens/enzo-maresca-on-manchester-city-appointment-63918340",
    raw: { demo: true, identitySource: "official-club" },
  },
};

export type TouchlineCoachScoreEvidence = {
  provider: FootballDataProviderName;
  providerEventIds: string[];
  scoringVersion: string;
};

export type TouchlineArenaCoachSlot = {
  entityType: "coach";
  rankingGroup: "coach";
  coach: TouchlineCoach | null;
  clubProviderId: string | null;
  touchlinePoints: number | null;
  scoreEvidence: TouchlineCoachScoreEvidence | null;
  status: "awaiting-verified-coach" | "awaiting-match-evidence" | "audited";
  rankingPosition: number | null;
  cardTier: TouchlineCardTierKey;
  apparel: typeof TOUCHLINE_COACH_CARD_APPAREL;
  cardPriceTc: number;
  cardPriceVersion: string;
};

export function createTouchlineArenaCoachSlot(
  coach: TouchlineCoach | null = null,
  rankingPosition: number | null = null,
  tierOverride?: TouchlineCardTierKey | null,
): TouchlineArenaCoachSlot {
  const cardTier = tierOverride ?? touchlineCoachTierForRankingPosition(rankingPosition);
  const canonicalTier = touchlineArenaTierForKey(cardTier);
  if (!canonicalTier) throw new Error(`Missing approved coach tier: ${cardTier}`);
  return {
    entityType: "coach",
    rankingGroup: "coach",
    coach,
    clubProviderId: coach?.teamId ?? null,
    touchlinePoints: null,
    scoreEvidence: null,
    status: coach ? "awaiting-match-evidence" : "awaiting-verified-coach",
    rankingPosition,
    cardTier,
    apparel: TOUCHLINE_COACH_CARD_APPAREL,
    cardPriceTc: canonicalTier.retailPriceTc,
    cardPriceVersion: TOUCHLINE_COACH_PRICE_TABLE_VERSION,
  };
}

export function touchlineCoachScoreCanBePublished(slot: TouchlineArenaCoachSlot) {
  return Boolean(
    slot.coach &&
      slot.status === "audited" &&
      Number.isFinite(slot.touchlinePoints) &&
      slot.scoreEvidence?.scoringVersion.trim() &&
      slot.scoreEvidence.providerEventIds.length > 0,
  );
}
