import {
  isTouchlineCommercialOperationInScope,
  type TouchlineCommercialCurrency,
  type TouchlineCommercialCompetition,
} from "./commercial-activation.ts";

export type TouchlineCommercialActivationQuoteItem = {
  inventoryId: string;
  amountMinor: number;
};

/**
 * Server-owned quote shape for a future initial competition activation.
 * No function in this module resolves a price, tax, card or payment method.
 */
export type TouchlineCommercialActivationQuote = {
  quoteId: string;
  competition: TouchlineCommercialCompetition;
  currency: TouchlineCommercialCurrency;
  maintenanceAmountMinor: number;
  cardItems: TouchlineCommercialActivationQuoteItem[];
  taxAmountMinor: number;
  totalAmountMinor: number;
  expiresAt: string;
};

export type TouchlineCommercialActivationIntent = {
  quoteId: string;
  idempotencyKey: string;
};

export type TouchlineCommercialActivationQuoteError =
  | "commercial-operation-out-of-scope"
  | "invalid-quote-id"
  | "invalid-amount"
  | "duplicate-inventory"
  | "invalid-expiry"
  | "total-mismatch";

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;

function nonNegativeMinorAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function validateTouchlineCommercialActivationQuote(
  quote: TouchlineCommercialActivationQuote,
  now: string | Date = new Date(),
): TouchlineCommercialActivationQuoteError | null {
  if (!isTouchlineCommercialOperationInScope({
    competition: quote.competition,
    currency: quote.currency,
  })) return "commercial-operation-out-of-scope";
  if (!OPAQUE_ID_PATTERN.test(quote.quoteId)) return "invalid-quote-id";
  if (!nonNegativeMinorAmount(quote.maintenanceAmountMinor)
    || !nonNegativeMinorAmount(quote.taxAmountMinor)
    || !nonNegativeMinorAmount(quote.totalAmountMinor)
    || quote.cardItems.some((item) => !OPAQUE_ID_PATTERN.test(item.inventoryId) || !nonNegativeMinorAmount(item.amountMinor))) {
    return "invalid-amount";
  }
  if (new Set(quote.cardItems.map((item) => item.inventoryId)).size !== quote.cardItems.length) return "duplicate-inventory";
  const expiry = Date.parse(quote.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= new Date(now).getTime()) return "invalid-expiry";
  const expectedTotal = quote.maintenanceAmountMinor
    + quote.taxAmountMinor
    + quote.cardItems.reduce((total, item) => total + item.amountMinor, 0);
  return expectedTotal === quote.totalAmountMinor ? null : "total-mismatch";
}

/**
 * Browser-safe submission shape. Financial values are intentionally omitted;
 * the future server endpoint must load and validate the quoted operation again.
 */
export function parseTouchlineCommercialActivationIntent(
  body: unknown,
): TouchlineCommercialActivationIntent | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const quoteId = typeof record.quoteId === "string" ? record.quoteId.trim() : "";
  const idempotencyKey = typeof record.idempotencyKey === "string" ? record.idempotencyKey.trim() : "";
  if (!OPAQUE_ID_PATTERN.test(quoteId) || idempotencyKey.length < 8 || idempotencyKey.length > 120) return null;
  return { quoteId, idempotencyKey };
}
