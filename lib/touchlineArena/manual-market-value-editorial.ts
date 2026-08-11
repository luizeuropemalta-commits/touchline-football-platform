import {
  resolveTouchlineCardClassification,
  type TouchlineCardClassification,
} from "./card-engine.ts";
import { PLAYER_MARKET_TIER_POLICY_VERSION } from "./player-market-tiers.ts";
import {
  resolveTouchlinePublicEditorialCardPresentation,
  type TouchlineEditorialCardRecord,
  type TouchlineCardPublicationState,
  type TouchlinePublicEditorialCardPresentation,
} from "./editorial-card-profile.ts";

/**
 * Private editorial input for a player card. It is deliberately separate from
 * any provider payload: a human editor enters and reviews this value inside
 * TouchLine, then the shared card rule calculates the tier and nominal price.
 */
export type TouchlineManualMarketValueEditorialInput = Readonly<{
  playerId: string;
  effectiveSeason: string;
  marketValueEur: number;
  publicationState: TouchlineCardPublicationState;
  lastReviewedAt: string;
  internalNote?: string;
  internalSource?: string;
}>;

export type TouchlineManualMarketValueEditorialDecision = Readonly<{
  input: TouchlineManualMarketValueEditorialInput;
  classification: TouchlineCardClassification;
  editorialCard: TouchlineEditorialCardRecord;
}>;

/**
 * Builds the sole editorial card decision for one manual value. It has no
 * database, network, provider or checkout dependency. Invalid input returns
 * null rather than manufacturing a tier, price or publishable card.
 */
export function prepareTouchlineManualMarketValueEditorialDecision(
  input: TouchlineManualMarketValueEditorialInput,
  existing?: Pick<TouchlineCardClassification, "tierKey" | "nominalPrice" | "effectiveSeason" | "policyVersion"> | null,
): TouchlineManualMarketValueEditorialDecision | null {
  if (
    !Number.isSafeInteger(input.marketValueEur)
    || input.marketValueEur < 0
    || !input.effectiveSeason.trim()
  ) return null;

  const classification = resolveTouchlineCardClassification({
    approvedMarketValueEur: input.marketValueEur,
    effectiveSeason: input.effectiveSeason.trim(),
    policyVersion: PLAYER_MARKET_TIER_POLICY_VERSION,
    existing,
  });
  if (!classification) return null;

  const editorialCard: TouchlineEditorialCardRecord = Object.freeze({
    playerId: input.playerId,
    tierKey: classification.tierKey,
    cardPrice: Object.freeze({ amountMinor: classification.nominalPrice * 100, currency: "GBP" }),
    publicationState: input.publicationState,
    lastReviewedAt: input.lastReviewedAt,
    ...(input.internalNote === undefined ? {} : { internalNote: input.internalNote }),
    ...(input.internalSource === undefined ? {} : { internalSource: input.internalSource }),
  });

  return Object.freeze({ input: Object.freeze({ ...input }), classification, editorialCard });
}

/**
 * Public cards receive the normal small editorial projection only after an
 * explicit publish action. The manual EUR input and internal evidence stay on
 * the server/admin boundary.
 */
export function resolveTouchlineManualMarketValuePublicCardPresentation(
  decision: TouchlineManualMarketValueEditorialDecision | null | undefined,
): TouchlinePublicEditorialCardPresentation | null {
  return decision
    ? resolveTouchlinePublicEditorialCardPresentation(decision.editorialCard)
    : null;
}
