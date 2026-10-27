import { projectExchangeHistory, type ExchangeHistorySnapshot, type ExchangeReceiptPlayer } from "./exchange-history-presentation.ts";

type Party = Readonly<{ accountId: string; name: string }>;
/** Immutable ledger facts, written with both wallets in the acceptance transaction. */
export type CommittedExchangeReceipt = Readonly<{
  tradeId: string;
  seasonId: string;
  occurredAt: string;
  proposer: Party;
  accepter: Party;
  outgoing: ExchangeReceiptPlayer;
  incoming: ExchangeReceiptPlayer;
  quote: Readonly<{ feeTc: number; bonusTc: number; retiredTc: number; compensationTc: number }>;
  proposerBalanceAfterTc: number;
  accepterBalanceAfterTc: number;
}>;
const amount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
/** The season aggregate must come from the same consistent database read, not
 * this possibly paginated receipt list. Missing/foreign/corrupt rows fail closed. */
export function projectExchangeLedger(input: Readonly<{
  accountId: string; seasonId: string; collectionRevision: number;
  coverage: "complete" | "partial"; seasonNegotiationIncomeTc: number | null;
  receipts: readonly unknown[];
}>): ExchangeHistorySnapshot | null {
  const receipts = [];
  let pageIncome = BigInt(0);
  for (const row of input.receipts) {
    if (!object(row) || row.seasonId !== input.seasonId || !object(row.proposer) || !object(row.accepter)
      || !object(row.outgoing) || !object(row.incoming) || !object(row.quote)
      || row.proposer.accountId === row.accepter.accountId
      || !amount(row.proposerBalanceAfterTc) || !amount(row.accepterBalanceAfterTc)) return null;
    const { feeTc, bonusTc, retiredTc, compensationTc } = row.quote;
    if (!amount(feeTc) || !amount(bonusTc) || !amount(retiredTc)
      || bonusTc !== retiredTc || BigInt(feeTc) !== BigInt(bonusTc) + BigInt(retiredTc)
      || typeof compensationTc !== "number" || !Number.isSafeInteger(compensationTc)
      || !amount(row.outgoing.valueTc) || !amount(row.incoming.valueTc)
      || BigInt(compensationTc) !== BigInt(row.outgoing.valueTc) - BigInt(row.incoming.valueTc)) return null;
    const proposer = row.proposer.accountId === input.accountId;
    if (!proposer && row.accepter.accountId !== input.accountId) return null;
    const difference = proposer ? compensationTc : -compensationTc;
    if (!proposer) pageIncome += BigInt(bonusTc);
    receipts.push({ id: row.tradeId, occurredAt: row.occurredAt,
      counterpart: proposer ? row.accepter : row.proposer, proposer: row.proposer,
      given: proposer ? row.outgoing : row.incoming, received: proposer ? row.incoming : row.outgoing,
      difference: { direction: difference === 0 ? "none" : difference > 0 ? "received" : "paid", amountTc: Math.abs(difference) },
      feeTc: proposer ? feeTc : 0, bonusTc: proposer ? 0 : bonusTc,
      balanceAfterTc: proposer ? row.proposerBalanceAfterTc : row.accepterBalanceAfterTc });
  }
  // A partial page cannot establish the total, but a verified total must at
  // least cover it. A complete ledger must reconcile exactly. Null preserves
  // an unavailable aggregate instead of manufacturing a season total.
  if (input.seasonNegotiationIncomeTc !== null) {
    if (!amount(input.seasonNegotiationIncomeTc)) return null;
    const total = BigInt(input.seasonNegotiationIncomeTc);
    if (total < pageIncome || (input.coverage === "complete" && total !== pageIncome)) return null;
  }
  return projectExchangeHistory({ version: 1, status: "confirmed", ...input, receipts }, { ready: true,
    accountId: input.accountId, seasonId: input.seasonId, collectionRevision: input.collectionRevision });
}
