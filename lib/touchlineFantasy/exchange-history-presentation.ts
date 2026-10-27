/** Presentation contract only. An authenticated server must supply these facts;
 * this parser does not authenticate a caller, calculate a trade or change a wallet. */
export type ExchangeReceiptPlayer = Readonly<{ playerId: string; name: string; valueTc: number }>;
export type ExchangeHistoryReceipt = Readonly<{
  id: string;
  occurredAt: string;
  counterpart: Readonly<{ accountId: string; name: string }>;
  proposer: Readonly<{ accountId: string; name: string }>;
  given: ExchangeReceiptPlayer;
  received: ExchangeReceiptPlayer;
  difference: Readonly<{ direction: "paid" | "received" | "none"; amountTc: number }>;
  feeTc: number;
  bonusTc: number;
  balanceAfterTc: number;
}>;
export type ExchangeHistorySnapshot = Readonly<{
  version: 1;
  status: "confirmed";
  accountId: string;
  seasonId: string;
  collectionRevision: number;
  coverage: "complete" | "partial";
  /** Confirmed season aggregate, already credited to the single club balance.
   * Null means unavailable; never derive it from a possibly partial page. */
  seasonNegotiationIncomeTc: number | null;
  receipts: readonly ExchangeHistoryReceipt[];
}>;
type Scope = Readonly<{ ready: boolean; accountId?: string; seasonId?: string; collectionRevision?: number }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const amount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const name = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 200;
const timestamp = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
function player(value: unknown): ExchangeReceiptPlayer | null {
  return object(value) && uuid(value.playerId) && name(value.name) && amount(value.valueTc) && value.valueTc > 0
    ? Object.freeze({ playerId: value.playerId, name: value.name, valueTc: value.valueTc }) : null;
}
function party(value: unknown) {
  return object(value) && uuid(value.accountId) && name(value.name)
    ? Object.freeze({ accountId: value.accountId, name: value.name }) : null;
}

/** Reject the whole snapshot on ambiguity; do not turn a corrupt/missing ledger
 * into an empty history or zero income. Copy only public presentation fields. */
export function projectExchangeHistory(value: unknown, scope: Scope): ExchangeHistorySnapshot | null {
  if (!scope.ready || !uuid(scope.accountId) || !uuid(scope.seasonId) || !amount(scope.collectionRevision)
    || !object(value) || value.version !== 1 || value.status !== "confirmed"
    || value.accountId !== scope.accountId || value.seasonId !== scope.seasonId || value.collectionRevision !== scope.collectionRevision
    || (value.coverage !== "complete" && value.coverage !== "partial")
    || !(value.seasonNegotiationIncomeTc === null || amount(value.seasonNegotiationIncomeTc)) || !Array.isArray(value.receipts)) return null;
  const receipts: ExchangeHistoryReceipt[] = [], seen = new Set<string>();
  for (const raw of value.receipts) {
    if (!object(raw) || !uuid(raw.id) || seen.has(raw.id.toLowerCase()) || !timestamp(raw.occurredAt)
      || !amount(raw.feeTc) || !amount(raw.bonusTc) || !amount(raw.balanceAfterTc) || !object(raw.difference)
      || !amount(raw.difference.amountTc) || (raw.difference.direction !== "paid" && raw.difference.direction !== "received" && raw.difference.direction !== "none")
      || (raw.difference.direction === "none") !== (raw.difference.amountTc === 0)) return null;
    const given = player(raw.given), received = player(raw.received), counterpart = party(raw.counterpart), proposer = party(raw.proposer);
    if (!given || !received || given.playerId.toLowerCase() === received.playerId.toLowerCase() || !counterpart || !proposer
      || counterpart.accountId.toLowerCase() === scope.accountId.toLowerCase()
      || ![scope.accountId, counterpart.accountId].some(id => id.toLowerCase() === proposer.accountId.toLowerCase())) return null;
    seen.add(raw.id.toLowerCase());
    receipts.push(Object.freeze({ id: raw.id, occurredAt: raw.occurredAt, given, received, counterpart, proposer,
      difference: Object.freeze({ direction: raw.difference.direction as "paid" | "received" | "none", amountTc: raw.difference.amountTc }),
      feeTc: raw.feeTc, bonusTc: raw.bonusTc, balanceAfterTc: raw.balanceAfterTc }));
  }
  receipts.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id));
  return Object.freeze({ version: 1, status: "confirmed", accountId: scope.accountId, seasonId: scope.seasonId,
    collectionRevision: scope.collectionRevision, coverage: value.coverage as "complete" | "partial",
    seasonNegotiationIncomeTc: value.seasonNegotiationIncomeTc, receipts: Object.freeze(receipts) });
}
