export type TouchlineMarketContractReleaseRequest = {
  cardId: string;
  idempotencyKey: string;
};

export type TouchlineMarketContractReleaseRequestError =
  | "invalid-body"
  | "unexpected-field"
  | "invalid-card-id"
  | "invalid-idempotency-key";

export type TouchlineMarketContractReleaseRequestResult =
  | { ok: true; value: TouchlineMarketContractReleaseRequest }
  | { ok: false; error: TouchlineMarketContractReleaseRequestError };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(["cardId", "idempotencyKey"]);

export function parseTouchlineMarketContractReleaseRequest(
  body: unknown,
): TouchlineMarketContractReleaseRequestResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid-body" };
  }

  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((field) => !ALLOWED_FIELDS.has(field))) {
    return { ok: false, error: "unexpected-field" };
  }

  const cardId = typeof record.cardId === "string"
    ? record.cardId.trim().toLowerCase()
    : "";
  if (!UUID_PATTERN.test(cardId)) {
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
    value: { cardId, idempotencyKey },
  };
}
