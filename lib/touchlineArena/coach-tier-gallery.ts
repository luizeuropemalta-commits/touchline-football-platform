import {
  TOUCHLINE_COACH_CARD_ART,
  TOUCHLINE_COACH_TIER_BANDS,
} from "./coach-card.ts";
import { touchlineCardTierName, type TouchlineCardTierKey } from "./card-rules.ts";

export type TouchlineCoachTierGalleryItem = Readonly<{
  tierKey: TouchlineCardTierKey;
  label: Readonly<{ en: string; pt: string }>;
  completedSeasonPosition: Readonly<{ min: number; max: number }>;
  compactArtUrl: string;
}>;

function toCompactCoachArtUrl(sourceUrl: string) {
  return sourceUrl
    .replace("/touchlineArena/cards/coaches/", "/touchlineArena/cards/templates/live-compact/coaches/")
    .replace(/\.png$/, ".webp");
}

/**
 * A presentational framework only. It contains no coach person, club, price,
 * availability, current ranking, market value or provider data.
 */
export const TOUCHLINE_COACH_TIER_GALLERY: readonly TouchlineCoachTierGalleryItem[] =
  TOUCHLINE_COACH_TIER_BANDS.map((band) => ({
    tierKey: band.tierKey,
    label: {
      en: touchlineCardTierName(band.tierKey, "en"),
      pt: touchlineCardTierName(band.tierKey, "pt-BR"),
    },
    completedSeasonPosition: { min: band.min, max: band.max },
    compactArtUrl: toCompactCoachArtUrl(TOUCHLINE_COACH_CARD_ART[band.tierKey]),
  }));
