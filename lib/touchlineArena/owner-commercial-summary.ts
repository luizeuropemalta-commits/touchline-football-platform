import type { ClubOwnerSquadCard } from "./demo-data.ts";

export type TouchlineOwnerCommercialSummary = Readonly<{
  cardsTracked: number;
  squadValueGbp: number;
}>;

/**
 * Resolves the account-level commercial summary from the same public card
 * projection rendered by TouchLine. Raw provider valuations, inventory sale
 * prices and browser state are deliberately not alternative authorities.
 */
export function resolveTouchlineOwnerCommercialSummary(input: Readonly<{
  ownedContractCount: number;
  rosterCards: readonly ClubOwnerSquadCard[];
}>): TouchlineOwnerCommercialSummary {
  if (
    !Number.isSafeInteger(input.ownedContractCount)
    || input.ownedContractCount < input.rosterCards.length
  ) {
    throw new Error("TouchLine tracked-card count must cover the published roster");
  }

  let totalAmountMinor = 0;
  for (const card of input.rosterCards) {
    const price = card.editorialCard?.cardPrice;
    if (!price) continue;
    if (price.currency !== "GBP") {
      throw new Error("TouchLine England card summary requires GBP publications");
    }
    if (price.amountMinor % 100 !== 0) {
      throw new Error("TouchLine nominal card values must use whole pounds");
    }
    totalAmountMinor += price.amountMinor;
  }

  if (!Number.isSafeInteger(totalAmountMinor)) {
    throw new Error("TouchLine nominal card total exceeds the safe integer range");
  }

  return Object.freeze({
    cardsTracked: input.ownedContractCount,
    squadValueGbp: totalAmountMinor / 100,
  });
}
