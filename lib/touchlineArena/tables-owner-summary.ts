import type { ClubOwnerSquadCard } from "./demo-data.ts";

export type TouchlineTablesOwnerSummary = Readonly<{
  clubOwners: number;
  cardsTracked: number;
  nominalValueGbp: number;
}>;

const EMPTY_SUMMARY: TouchlineTablesOwnerSummary = Object.freeze({
  clubOwners: 0,
  cardsTracked: 0,
  nominalValueGbp: 0,
});

/**
 * Builds the private account summary shown above the unpublished competition
 * tables. It consumes only the server-owned published-card projection already
 * attached to an authenticated roster; raw provider values, inventory prices
 * and browser state are not alternative authorities.
 */
export function resolveTouchlineTablesOwnerSummary(input: Readonly<{
  isAuthenticatedClubOwner: boolean;
  ownedContractCount: number;
  rosterCards: readonly ClubOwnerSquadCard[];
}>): TouchlineTablesOwnerSummary {
  if (!input.isAuthenticatedClubOwner) return EMPTY_SUMMARY;
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
    clubOwners: 1,
    cardsTracked: input.ownedContractCount,
    nominalValueGbp: totalAmountMinor / 100,
  });
}
