export const TOUCHLINE_MARKET_CHECKOUT_MAX_ITEMS = 35;

export type TouchlineMarketCheckoutRequest = {
  cardIds: string[];
  idempotencyKey: string;
};

export type TouchlineMarketCheckoutRequestError =
  | "invalid-body"
  | "empty-cart"
  | "too-many-items"
  | "duplicate-card"
  | "invalid-card-id"
  | "invalid-idempotency-key";

export type TouchlineMarketCheckoutRequestResult =
  | { ok: true; value: TouchlineMarketCheckoutRequest }
  | { ok: false; error: TouchlineMarketCheckoutRequestError };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseTouchlineMarketCheckoutRequest(body: unknown): TouchlineMarketCheckoutRequestResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid-body" };
  }

  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.cardIds)) return { ok: false, error: "empty-cart" };

  const cardIds = record.cardIds
    .filter((cardId): cardId is string => typeof cardId === "string")
    .map((cardId) => cardId.trim().toLowerCase());
  if (!cardIds.length || cardIds.length !== record.cardIds.length) {
    return { ok: false, error: "empty-cart" };
  }
  if (cardIds.length > TOUCHLINE_MARKET_CHECKOUT_MAX_ITEMS) {
    return { ok: false, error: "too-many-items" };
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return { ok: false, error: "duplicate-card" };
  }
  if (cardIds.some((cardId) => !UUID_PATTERN.test(cardId))) {
    return { ok: false, error: "invalid-card-id" };
  }

  const idempotencyKey = typeof record.idempotencyKey === "string"
    ? record.idempotencyKey.trim()
    : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 120) {
    return { ok: false, error: "invalid-idempotency-key" };
  }

  return {
    ok: true,
    value: { cardIds, idempotencyKey },
  };
}
