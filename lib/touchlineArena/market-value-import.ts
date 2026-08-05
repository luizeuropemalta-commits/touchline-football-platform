export type TouchlineMarketValueImportRow = Readonly<{
  playerId: string;
  externalPlayerId?: string | null;
  sourceUrl?: string | null;
  marketValue: number | null;
  currency: "EUR" | "GBP" | "USD" | null;
  marketValueEur: number | null;
}>;

export type TouchlineMarketValueImportDecision = Readonly<{
  status: "ready" | "unchanged" | "pending" | "rejected";
  failureCode?: "missing-player" | "invalid-value" | "missing-eur-value";
}>;

function validAmount(value: number | null) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

/**
 * Validates an already-licensed import row. This function does not fetch any
 * provider and intentionally has no knowledge of a provider brand.
 */
export function decideTouchlineMarketValueImport(input: {
  row: TouchlineMarketValueImportRow;
  existing?: {
    marketValue: number | null;
    currency: string | null;
    marketValueEur: number | null;
    verifiedSeason: string | null;
  } | null;
  verifiedSeason: string;
}): TouchlineMarketValueImportDecision {
  if (!input.row.playerId.trim()) return { status: "rejected", failureCode: "missing-player" };
  if (!validAmount(input.row.marketValue) || !validAmount(input.row.marketValueEur)) {
    return { status: "rejected", failureCode: "invalid-value" };
  }
  if (input.row.marketValue !== null && !input.row.currency) {
    return { status: "rejected", failureCode: "invalid-value" };
  }
  if (input.row.marketValue !== null && input.row.marketValueEur === null) {
    return { status: "rejected", failureCode: "missing-eur-value" };
  }
  if (input.row.marketValue === null) return { status: "pending" };

  const existing = input.existing;
  if (
    existing
    && existing.marketValue === input.row.marketValue
    && existing.currency === input.row.currency
    && existing.marketValueEur === input.row.marketValueEur
    && existing.verifiedSeason === input.verifiedSeason
  ) {
    return { status: "unchanged" };
  }
  return { status: "ready" };
}
