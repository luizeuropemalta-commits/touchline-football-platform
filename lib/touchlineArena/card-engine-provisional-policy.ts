export const TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR = 1_000_000 as const;
export const TOUCHLINE_PROVISIONAL_MISSING_SHIRT = "PROVISIONAL_MISSING_SHIRT" as const;
export const TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE = "PROVISIONAL_MISSING_MARKET_VALUE" as const;

export type TouchlineProvisionalFieldStatus =
  | typeof TOUCHLINE_PROVISIONAL_MISSING_SHIRT
  | typeof TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE;

export type TouchlineProvisionalFieldPlan = Readonly<{
  shirtNumber: Readonly<{ value: number; provenance: TouchlineProvisionalFieldStatus }> | null;
  marketValue: Readonly<{ valueEur: number; provenance: TouchlineProvisionalFieldStatus }> | null;
}>;

function positiveShirt(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 999;
}

/** Pure policy used by the migration/runner: approved human data always wins. */
export function planTouchlineCardProvisionalFields(input: Readonly<{
  canonicalPlayerId: string;
  canonicalShirtNumber?: number | null;
  approvedManualShirtNumber?: number | null;
  verifiedMarketValueEur?: number | null;
  approvedManualMarketValueEur?: number | null;
}>): TouchlineProvisionalFieldPlan {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.canonicalPlayerId.trim())) {
    throw new Error("A canonical player UUID is required for provisional Card Engine data.");
  }
  const hasShirt = positiveShirt(input.approvedManualShirtNumber) || positiveShirt(input.canonicalShirtNumber);
  const hasMarketValue = Number.isSafeInteger(input.approvedManualMarketValueEur)
    && (input.approvedManualMarketValueEur ?? -1) >= 0
    || Number.isSafeInteger(input.verifiedMarketValueEur)
    && (input.verifiedMarketValueEur ?? -1) >= 0;
  return Object.freeze({
    shirtNumber: hasShirt ? null : Object.freeze({ value: 0, provenance: TOUCHLINE_PROVISIONAL_MISSING_SHIRT }),
    marketValue: hasMarketValue ? null : Object.freeze({ valueEur: TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR, provenance: TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE }),
  });
}

export function shouldResolveTouchlineProvisionalShirt(input: Readonly<{
  currentValue: number | null;
  currentProvenance: string | null;
  approvedManualValue: number | null;
  officialLineupValue: number | null;
}>) {
  return input.currentValue === 0
    && input.currentProvenance === TOUCHLINE_PROVISIONAL_MISSING_SHIRT
    && !positiveShirt(input.approvedManualValue)
    && positiveShirt(input.officialLineupValue);
}

export function shouldResolveTouchlineProvisionalMarketValue(input: Readonly<{
  currentValueEur: number | null;
  currentProvenance: string | null;
  currentStatus: string | null;
  currentConfidence: string | null;
  trustedValueEur: number | null;
}>) {
  return input.currentValueEur === TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR
    && input.currentProvenance === TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE
    && input.currentStatus === "provisional"
    && input.currentConfidence === "provisional"
    && Number.isSafeInteger(input.trustedValueEur)
    && (input.trustedValueEur ?? -1) >= 0;
}
