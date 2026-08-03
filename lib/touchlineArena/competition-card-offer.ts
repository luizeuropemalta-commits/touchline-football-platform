import { touchlineCommercialCurrencyForCompetition, type TouchlineCommercialCompetition } from "./commercial-activation.ts";
import { formatTouchlineCommercialCardPrice, resolveTouchlineCommercialCardPrice } from "./commercial-card-pricing.ts";
import { touchlineCoachCardArtForTier } from "./coach-card.ts";
import type { TouchlineCoachClassification } from "./coach-classification.ts";
import { touchlineArenaTierForKey, type TouchlineCardTierKey } from "./card-rules.ts";

export type TouchlineCardOfferSubjectType = "player" | "coach";

export type TouchlineCompetitionCardOffer = Readonly<{
  subjectType: TouchlineCardOfferSubjectType;
  subjectId: string;
  competitionId: TouchlineCommercialCompetition;
  seasonId: string;
  tierId: TouchlineCardTierKey;
  tierKey: TouchlineCardTierKey;
  tierName: string;
  borderAsset: string;
  amountMinor: number;
  displayPrice: string;
  currency: "GBP" | "EUR" | "BRL";
  classificationReason: string;
  classificationSource: string;
}>;

/**
 * Canonical server-side offer contract. Tier classification can differ by
 * subject, but border, nominal price, currency and minor units always come
 * from the one approved competition price table.
 */
export function resolveCompetitionCardOffer(input: Readonly<{
  subjectType: TouchlineCardOfferSubjectType;
  subjectId: string;
  competitionId: TouchlineCommercialCompetition;
  seasonId: string;
  tierKey: TouchlineCardTierKey;
  classification?: Pick<TouchlineCoachClassification, "classificationReason" | "classificationSource"> | null;
}>): TouchlineCompetitionCardOffer {
  const tier = touchlineArenaTierForKey(input.tierKey);
  if (!tier) throw new Error(`Missing approved tier: ${input.tierKey}`);
  const commercial = resolveTouchlineCommercialCardPrice({ tierKey: input.tierKey, competition: input.competitionId });
  return {
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    competitionId: input.competitionId,
    seasonId: input.seasonId,
    tierId: tier.key,
    tierKey: tier.key,
    tierName: tier.label,
    borderAsset: input.subjectType === "coach" ? touchlineCoachCardArtForTier(tier.key) : tier.frameUrl,
    amountMinor: commercial.amountMinor,
    displayPrice: formatTouchlineCommercialCardPrice(commercial),
    currency: touchlineCommercialCurrencyForCompetition(input.competitionId),
    classificationReason: input.classification?.classificationReason ?? "authoritative-player-market-tier",
    classificationSource: input.classification?.classificationSource ?? "authoritative-player-market-value",
  };
}
