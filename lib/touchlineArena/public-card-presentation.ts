import {
  resolveTouchlineVerifiedPlayerEconomy,
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
  type TouchlineMarketValueSource,
} from "./card-rules.ts";

/**
 * Public-card presentation is deliberately narrower than inventory or a
 * ClubOwner contract. It answers only what can honestly be shown on a public
 * player card. A current-season contract remains an explicit, frozen
 * exception, because its stored tier/price are not recalculated here.
 */
export const TOUCHLINE_PUBLIC_CARD_STATES = ["verified", "pending", "unavailable", "error"] as const;

export type TouchlinePublicCardState = (typeof TOUCHLINE_PUBLIC_CARD_STATES)[number];
export type TouchlinePublicCardVisualState = TouchlinePublicCardState | "active-contract";

export type TouchlinePublicCardPresentationInput = {
  marketValue: number | string | null | undefined;
  marketValueSource?: TouchlineMarketValueSource | null;
  marketValueState?: TouchlinePublicCardState | null;
  classificationState?: TouchlinePublicCardState | null;
  cardTier?: TouchlineCardTierKey | null;
  cardPriceAuthority?: "active-contract" | null;
};

export type TouchlinePublicCardPresentation = Readonly<{
  marketValueState: TouchlinePublicCardState;
  classificationState: TouchlinePublicCardState;
  visualState: TouchlinePublicCardVisualState;
  hasVerifiedMarketValue: boolean;
  tierKey: TouchlineCardTierKey | null;
  canExposeCommercialPresentation: boolean;
  isActiveContract: boolean;
}>;

export const TOUCHLINE_NEUTRAL_CARD_ACCENT = "#94a3b8";
export const TOUCHLINE_NEUTRAL_CARD_SECONDARY = "#334155";

/**
 * The public projection is opt-in. Legacy card consumers intentionally keep
 * their established commercial presentation until they receive an explicit
 * server-owned state. This prevents a visual hardening rollout from changing
 * an existing offer, Free-season display or active-contract presentation.
 */
export function hasTouchlinePublicCardState(input: Pick<TouchlinePublicCardPresentationInput, "marketValueState" | "classificationState">) {
  return input.marketValueState != null || input.classificationState != null;
}

function isPublicCardState(value: unknown): value is TouchlinePublicCardState {
  return typeof value === "string" && (TOUCHLINE_PUBLIC_CARD_STATES as readonly string[]).includes(value);
}

function mostRestrictiveState(...states: Array<TouchlinePublicCardState | null | undefined>): TouchlinePublicCardState {
  if (states.includes("error")) return "error";
  if (states.includes("unavailable")) return "unavailable";
  if (states.includes("pending")) return "pending";
  return "verified";
}

/**
 * Resolves visual/card-commercial eligibility without creating a tier, price
 * or value from a fallback. This must be used by public card surfaces, while
 * inventory/wallet and active-contract persistence stay in their own layers.
 */
export function resolveTouchlinePublicCardPresentation(
  input: TouchlinePublicCardPresentationInput,
): TouchlinePublicCardPresentation {
  const economy = resolveTouchlineVerifiedPlayerEconomy({
    marketValue: input.marketValue,
    marketValueSource: input.marketValueSource,
  });
  const isActiveContract = input.cardPriceAuthority === "active-contract";
  const requestedMarketValueState = isPublicCardState(input.marketValueState)
    ? input.marketValueState
    : undefined;
  // A caller cannot mark an unreadable/raw value as verified merely by passing
  // a status string. The numeric value and its approved source must validate
  // independently before it may be exposed on a public card.
  const hasVerifiedMarketValue = economy.status === "resolved";
  const marketValueState = requestedMarketValueState === "verified"
    ? (hasVerifiedMarketValue ? "verified" : "unavailable")
    : requestedMarketValueState
      ?? (hasVerifiedMarketValue ? "verified" : "unavailable");
  const requestedClassificationState = isPublicCardState(input.classificationState)
    ? input.classificationState
    : undefined;
  const approvedTierKey = input.cardTier && touchlineArenaTierForKey(input.cardTier)
    ? input.cardTier
    : null;

  // A classification cannot be publicly commercial while its approved market
  // value is not verified. Keep the two fields distinct so a verified value
  // may remain visible even when the classification is temporarily unavailable.
  const requestedClassification = isActiveContract
    ? requestedClassificationState ?? "verified"
    : marketValueState === "verified"
      ? requestedClassificationState ?? "unavailable"
      : mostRestrictiveState(marketValueState, requestedClassificationState);
  // The tier is an approved seasonal classification, not a value-to-tier
  // calculation performed by a presentation component. A missing tier must
  // therefore remain unavailable instead of becoming a visual Ruby fallback.
  const classificationState = requestedClassification === "verified" && !approvedTierKey
    ? "unavailable"
    : requestedClassification;

  const canExposeCommercialPresentation = isActiveContract
    ? Boolean(approvedTierKey)
    : marketValueState === "verified"
      && classificationState === "verified"
      && hasVerifiedMarketValue
      && Boolean(approvedTierKey);
  const tierKey = canExposeCommercialPresentation
    ? approvedTierKey
    : null;

  return {
    marketValueState,
    classificationState,
    visualState: isActiveContract && tierKey ? "active-contract" : (tierKey ? "verified" : classificationState),
    hasVerifiedMarketValue: marketValueState === "verified" && hasVerifiedMarketValue,
    tierKey,
    canExposeCommercialPresentation: Boolean(tierKey),
    isActiveContract,
  };
}

export function touchlinePublicCardStatusLabel(
  state: TouchlinePublicCardVisualState,
  locale: string | null | undefined,
) {
  const pt = locale === "pt-BR";
  if (state === "error") return pt ? "Temporariamente indisponível" : "Temporarily unavailable";
  if (state === "unavailable") return pt ? "Indisponível" : "Unavailable";
  if (state === "pending") return pt ? "Pendente" : "Pending";
  return pt ? "Verificado" : "Verified";
}

export function touchlinePublicMarketValueStatusLabel(
  state: TouchlinePublicCardState,
  locale: string | null | undefined,
) {
  const pt = locale === "pt-BR";
  if (state === "error") return pt ? "Valor indisponível" : "Value unavailable";
  if (state === "unavailable") return pt ? "Valor indisponível" : "Value unavailable";
  if (state === "pending") return pt ? "Valor pendente" : "Market value pending";
  return pt ? "Verificado" : "Verified";
}
