import type { TouchlineContractLifecycleState } from "./season-lifecycle.ts";
import type { TouchlineRenewalQuote } from "./renewal-quotes.ts";

export type TouchlineRenewalCenterItem = {
  quoteId: string;
  sourceContractId: string;
  playerId: string;
  position: string;
  lifecycleState: TouchlineContractLifecycleState;
  quote: TouchlineRenewalQuote;
};

export type TouchlineRenewalCenterSelectionError =
  | "duplicate-selection"
  | "unknown-quote"
  | "quote-not-ready"
  | "quote-expired"
  | "duplicate-player"
  | "insufficient-balance";

export type TouchlineRenewalCenterSummary = {
  totalContracts: number;
  renewedContracts: number;
  waitingContracts: number;
  notEligibleContracts: number;
  selectedQuoteIds: string[];
  selectedCount: number;
  selectedTotalTc: number;
  walletBalanceTc: number;
  walletAfterTc: number;
  selectedByPosition: Record<string, number>;
  canContinue: boolean;
  selectionError: TouchlineRenewalCenterSelectionError | null;
};

function nonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function uniqueId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function quoteIsExpired(quote: TouchlineRenewalQuote, now: number) {
  return quote.expiresAt !== null && Date.parse(quote.expiresAt) <= now;
}

/**
 * Derives a Renewal Center view from server-prepared quotes. It is deliberately
 * read-only: no client value from this structure can create a contract, move
 * Touch Credits, reserve supply or mark a quote as accepted.
 */
export function buildTouchlineRenewalCenterSummary(input: {
  items: readonly TouchlineRenewalCenterItem[];
  selectedQuoteIds: readonly string[];
  serverWalletBalanceTc: number;
  now: string;
}): TouchlineRenewalCenterSummary {
  const now = Date.parse(input.now);
  if (Number.isNaN(now)) throw new Error("Current time must be an ISO timestamp.");
  const walletBalanceTc = nonNegativeInteger(input.serverWalletBalanceTc);
  const itemsByQuoteId = new Map<string, TouchlineRenewalCenterItem>();
  for (const item of input.items) {
    const quoteId = uniqueId(item.quoteId, "Renewal quote ID");
    if (itemsByQuoteId.has(quoteId)) throw new Error("Renewal quote IDs must be unique.");
    itemsByQuoteId.set(quoteId, item);
  }

  const selectedQuoteIds = input.selectedQuoteIds.map((quoteId) => uniqueId(quoteId, "Selected quote ID"));
  const result: TouchlineRenewalCenterSummary = {
    totalContracts: input.items.length,
    renewedContracts: input.items.filter((item) => item.lifecycleState === "RENEWED").length,
    waitingContracts: input.items.filter((item) => (
      item.lifecycleState === "RENEWAL_AVAILABLE"
      || item.quote.status === "MARKET_VALUE_PENDING"
    )).length,
    notEligibleContracts: input.items.filter((item) => (
      item.lifecycleState === "NOT_ELIGIBLE" || item.quote.status === "NOT_ELIGIBLE"
    )).length,
    selectedQuoteIds,
    selectedCount: 0,
    selectedTotalTc: 0,
    walletBalanceTc,
    walletAfterTc: walletBalanceTc,
    selectedByPosition: {},
    canContinue: false,
    selectionError: null,
  };

  const seenQuotes = new Set<string>();
  const seenPlayers = new Set<string>();
  for (const quoteId of selectedQuoteIds) {
    if (seenQuotes.has(quoteId)) {
      result.selectionError = "duplicate-selection";
      return result;
    }
    seenQuotes.add(quoteId);

    const item = itemsByQuoteId.get(quoteId);
    if (!item) {
      result.selectionError = "unknown-quote";
      return result;
    }
    if (item.quote.status !== "READY" || item.quote.offer === null) {
      result.selectionError = "quote-not-ready";
      return result;
    }
    if (quoteIsExpired(item.quote, now)) {
      result.selectionError = "quote-expired";
      return result;
    }
    const playerId = uniqueId(item.playerId, "Player ID");
    if (seenPlayers.has(playerId)) {
      result.selectionError = "duplicate-player";
      return result;
    }
    seenPlayers.add(playerId);

    const position = uniqueId(item.position, "Player position");
    result.selectedCount += 1;
    result.selectedTotalTc += item.quote.offer.priceTc;
    result.selectedByPosition[position] = (result.selectedByPosition[position] ?? 0) + 1;
  }

  result.walletAfterTc = walletBalanceTc - result.selectedTotalTc;
  if (result.walletAfterTc < 0) {
    result.selectionError = "insufficient-balance";
    return result;
  }
  result.canContinue = result.selectedCount > 0;
  return result;
}
