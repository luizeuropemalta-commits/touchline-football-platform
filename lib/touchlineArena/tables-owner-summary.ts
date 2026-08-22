import type { ClubOwnerSquadCard } from "./demo-data.ts";
import { resolveTouchlineOwnerCommercialSummary } from "./owner-commercial-summary.ts";

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
  const commercialSummary = resolveTouchlineOwnerCommercialSummary(input);

  return Object.freeze({
    clubOwners: 1,
    cardsTracked: commercialSummary.cardsTracked,
    nominalValueGbp: commercialSummary.squadValueGbp,
  });
}
