/**
 * Public, non-commercial card completeness policy.
 *
 * This is intentionally separate from player identity: a verified footballer
 * stays visible even while their editorial game card needs attention.  Keep
 * the list limited to values the current shirt-back card actually renders or
 * needs in order to derive an approved commercial presentation.
 */
export const TOUCHLINE_CARD_REVIEW_FIELDS = [
  "display_name",
  "shirt_number",
  "nationality",
  "position",
  "market_value",
  "club_asset",
] as const;

export type TouchlineCardReviewField = typeof TOUCHLINE_CARD_REVIEW_FIELDS[number];
export type TouchlineCardReviewState = "COMPLETE" | "REVIEW_REQUIRED";

export type TouchlineCardReviewPresentation = Readonly<{
  state: TouchlineCardReviewState;
  missingFields: readonly TouchlineCardReviewField[];
}>;

export type TouchlineCardCompletenessInput = Readonly<{
  displayName?: string | null;
  shirtNumber?: number | string | null;
  countryCode3?: string | null;
  position?: string | null;
  hasVerifiedMarketValue: boolean;
  hasClubAsset: boolean;
}>;

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasShirtNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  return typeof value === "string" && /^\d+$/.test(value.trim()) && Number(value) > 0;
}

/**
 * The only public source for REVIEW_REQUIRED.  It never calculates a tier,
 * price or a substitute nationality.  Provider and editor values must already
 * have been resolved by the server before reaching this function.
 */
export function evaluateTouchlineCardCompleteness(
  input: TouchlineCardCompletenessInput,
): TouchlineCardReviewPresentation {
  const missingFields: TouchlineCardReviewField[] = [];
  if (!hasText(input.displayName)) missingFields.push("display_name");
  if (!hasShirtNumber(input.shirtNumber)) missingFields.push("shirt_number");
  if (!hasText(input.countryCode3) || input.countryCode3?.trim().toUpperCase() === "N/A") missingFields.push("nationality");
  if (!hasText(input.position)) missingFields.push("position");
  if (!input.hasVerifiedMarketValue) missingFields.push("market_value");
  if (!input.hasClubAsset) missingFields.push("club_asset");
  return Object.freeze({
    state: missingFields.length ? "REVIEW_REQUIRED" : "COMPLETE",
    missingFields: Object.freeze(missingFields),
  });
}

export function touchlineCardReviewFieldLabel(field: TouchlineCardReviewField, locale = "en-GB") {
  const portuguese = locale === "pt-BR";
  const labels: Record<TouchlineCardReviewField, string> = {
    display_name: portuguese ? "Nome de exibição" : "Display name",
    shirt_number: portuguese ? "Número da camisa" : "Shirt number",
    nationality: portuguese ? "Nacionalidade" : "Nationality",
    position: portuguese ? "Posição" : "Position",
    market_value: portuguese ? "Valor de mercado" : "Market Value",
    club_asset: portuguese ? "Asset do clube" : "Club asset",
  };
  return labels[field];
}
