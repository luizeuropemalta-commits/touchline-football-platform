import {
  TOUCHLINE_CARD_STARTING_TIER_KEY,
  type TouchlineCardTierKey,
} from "./card-rules.ts";

export const TOUCHLINE_COACH_CLASSIFICATION_VERSION = "coach-reputation-2026-08-v1" as const;
export const TOUCHLINE_COACH_INITIAL_PAID_TIER: TouchlineCardTierKey = "sapphire-blue";

export const TOUCHLINE_ELITE_COACH_LEAGUES = [
  "premier-league",
  "la-liga",
  "serie-a",
  "bundesliga",
  "ligue-1",
] as const;

export type TouchlineEliteCoachLeague = (typeof TOUCHLINE_ELITE_COACH_LEAGUES)[number];
export type TouchlineCoachLeagueStrength = "elite" | "non-elite" | "unknown";
export type TouchlineCoachPromotionType = "champions" | "runners-up" | "playoff-winners" | null;

export type TouchlineCoachClassificationReason =
  | "elite-final-position"
  | "elite-relegation-free"
  | "promoted"
  | "newcomer"
  | "non-elite-fallback"
  | "classification-pending";

export type TouchlineCoachClassificationInput = Readonly<{
  coachProviderId: string;
  sourceLeagueId?: string | null;
  sourceLeagueName?: string | null;
  sourceClub?: string | null;
  sourceSeasonId?: string | null;
  finalPosition?: number | null;
  promotionType?: TouchlineCoachPromotionType;
  isNewcomer?: boolean;
  hasCompleteProfessionalSeason?: boolean;
}>;

export type TouchlineCoachClassification = Readonly<{
  coachProviderId: string;
  tierKey: TouchlineCardTierKey;
  classificationReason: TouchlineCoachClassificationReason;
  classificationSource: "last-complete-season" | "approved-fallback";
  classificationVersion: typeof TOUCHLINE_COACH_CLASSIFICATION_VERSION;
  sourceLeagueId: string | null;
  sourceLeagueName: string | null;
  sourceClub: string | null;
  sourceSeasonId: string | null;
  finalPosition: number | null;
  promotionType: TouchlineCoachPromotionType;
  leagueStrength: TouchlineCoachLeagueStrength;
}>;

const ELITE_POSITION_TIER_BANDS: ReadonlyArray<Readonly<{
  min: number;
  max: number;
  tierKey: TouchlineCardTierKey;
}>> = [
  { min: 1, max: 1, tierKey: "diamond-gold" },
  { min: 2, max: 5, tierKey: "clear-diamond" },
  { min: 6, max: 8, tierKey: "emerald-green" },
  { min: 9, max: 12, tierKey: "radiant-gold" },
  { min: 13, max: 16, tierKey: "amethyst-purple" },
  { min: 17, max: 17, tierKey: "sapphire-blue" },
  // Ruby Red stays explicitly free. It is only reached by this documented
  // complete-season relegation rule, never by a missing-data fallback.
  { min: 18, max: 20, tierKey: TOUCHLINE_CARD_STARTING_TIER_KEY },
];

function normalizedLeagueId(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function touchlineCoachLeagueStrength(sourceLeagueId?: string | null): TouchlineCoachLeagueStrength {
  const normalized = normalizedLeagueId(sourceLeagueId);
  if (!normalized) return "unknown";
  return (TOUCHLINE_ELITE_COACH_LEAGUES as readonly string[]).includes(normalized) ? "elite" : "non-elite";
}

export function touchlineCoachTierForEliteFinalPosition(finalPosition?: number | null) {
  if (!Number.isInteger(finalPosition) || !finalPosition || finalPosition < 1 || finalPosition > 20) return null;
  return ELITE_POSITION_TIER_BANDS.find((band) => finalPosition >= band.min && finalPosition <= band.max)?.tierKey ?? null;
}

/**
 * Classifies a coach from the last complete, evidenced professional season.
 * A current club is deliberately absent: hiring a coach cannot change the
 * reputation that the coach already earned. Unknown/non-elite histories use
 * the explicitly approved paid Sapphire Blue fallback instead of inventing a
 * high tier.
 */
export function classifyTouchlineCoach(input: TouchlineCoachClassificationInput): TouchlineCoachClassification {
  const leagueStrength = touchlineCoachLeagueStrength(input.sourceLeagueId);
  const common = {
    coachProviderId: input.coachProviderId,
    classificationVersion: TOUCHLINE_COACH_CLASSIFICATION_VERSION,
    sourceLeagueId: input.sourceLeagueId?.trim() || null,
    sourceLeagueName: input.sourceLeagueName?.trim() || null,
    sourceClub: input.sourceClub?.trim() || null,
    sourceSeasonId: input.sourceSeasonId?.trim() || null,
    finalPosition: Number.isInteger(input.finalPosition) ? input.finalPosition ?? null : null,
    promotionType: input.promotionType ?? null,
    leagueStrength,
  } as const;

  if (input.promotionType) {
    return { ...common, tierKey: TOUCHLINE_COACH_INITIAL_PAID_TIER, classificationReason: "promoted", classificationSource: "approved-fallback" };
  }
  if (input.isNewcomer || input.hasCompleteProfessionalSeason === false) {
    return { ...common, tierKey: TOUCHLINE_COACH_INITIAL_PAID_TIER, classificationReason: "newcomer", classificationSource: "approved-fallback" };
  }
  if (leagueStrength === "non-elite") {
    return { ...common, tierKey: TOUCHLINE_COACH_INITIAL_PAID_TIER, classificationReason: "non-elite-fallback", classificationSource: "approved-fallback" };
  }
  if (leagueStrength === "elite") {
    const tierKey = touchlineCoachTierForEliteFinalPosition(input.finalPosition);
    if (tierKey) {
      return {
        ...common,
        tierKey,
        classificationReason: tierKey === TOUCHLINE_CARD_STARTING_TIER_KEY ? "elite-relegation-free" : "elite-final-position",
        classificationSource: "last-complete-season",
      };
    }
  }
  return { ...common, tierKey: TOUCHLINE_COACH_INITIAL_PAID_TIER, classificationReason: "classification-pending", classificationSource: "approved-fallback" };
}

/** A captured classification is immutable through the active season. */
export function resolveTouchlineCoachSeasonClassification(input: Readonly<{
  activeSeasonId: string;
  capturedSeasonId?: string | null;
  captured?: TouchlineCoachClassification | null;
  candidate: TouchlineCoachClassification;
}>) {
  return input.captured && input.capturedSeasonId === input.activeSeasonId
    ? input.captured
    : input.candidate;
}
