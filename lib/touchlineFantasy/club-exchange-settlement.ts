import { inspectClubAcquisition, type ClubAcquisitionState, type PublishedClubOffer } from "./club-acquisition.ts";
import { validateExchangePair, type ExchangeAllocation } from "./exchange-eligibility.ts";
import { assertClubRule, checkedCredits, quoteClubExchange } from "./club-market-rules.ts";

/** Server-owned inputs only. The database must revalidate and commit both states,
 * reservations, contracts and receipts atomically. This function performs no writes. */
export type ExchangeSettlementSide = Readonly<{
  /** Authenticated repository scope; must match allocation ownership. */
  accountId: string;
  state: ClubAcquisitionState;
  allocation: ExchangeAllocation;
  allowedClubIds: readonly string[] | null;
}>;
export function settleClubExchange(input: Readonly<{
  /** Confirmed competition season window, independent of the lineup lock. */
  seasonOpen: boolean;
  proposer: ExchangeSettlementSide;
  accepter: ExchangeSettlementSide;
  outgoing: PublishedClubOffer;
  incoming: PublishedClubOffer;
  proposalId: string;
  expectedProposerRevision: number;
  expectedAccepterRevision: number;
}>) {
  const { proposer, accepter, outgoing, incoming } = input;
  assertClubRule(input.seasonOpen === true, "CLUB_SEASON_CLOSED");
  assertClubRule(input.proposalId.trim(), "CLUB_PROPOSAL_REQUIRED");
  for (const side of [proposer, accepter]) {
    inspectClubAcquisition(side.state);
    assertClubRule(side.accountId === side.allocation.ownerId && side.accountId.trim(), "CLUB_OWNER_MISMATCH");
    assertClubRule(side.state.plan !== "beta" || side.allowedClubIds !== null, "CLUB_ALLOWLIST_REQUIRED");
    assertClubRule(side.state.plan === side.allocation.plan, "CLUB_PLAN_MISMATCH");
    assertClubRule(side.state.players.length === side.allocation.players.length
      && side.state.players.every(p => side.allocation.players.some(a => a.playerId === p.playerId
        && a.area === p.area && a.slot === p.slot && a.position === p.position)), "CLUB_ALLOCATION_MISMATCH");
    assertClubRule(side.state.revision < Number.MAX_SAFE_INTEGER, "CLUB_REVISION_INVALID");
  }
  assertClubRule(proposer.state.seasonId === accepter.state.seasonId, "CLUB_SEASON_MISMATCH");
  assertClubRule(proposer.state.revision === input.expectedProposerRevision
    && accepter.state.revision === input.expectedAccepterRevision, "CLUB_STALE_REVISION");
  const pair = validateExchangePair(proposer.allocation, accepter.allocation, outgoing.playerId, incoming.playerId, input.proposalId);
  for (const [offer, target, position] of [[incoming, proposer, pair.outgoing.position], [outgoing, accepter, pair.incoming.position]] as const) {
    assertClubRule(offer.published && Number.isSafeInteger(offer.valueEur) && offer.valueEur > 0, "CLUB_OFFER_UNAVAILABLE");
    assertClubRule(offer.position === position, "CLUB_POSITION_MISMATCH");
    assertClubRule(target.allowedClubIds === null || target.allowedClubIds.includes(offer.clubId), "CLUB_CLUB_NOT_ALLOWED");
  }
  const quote = quoteClubExchange(outgoing.valueEur, incoming.valueEur, proposer.state.plan);
  function replace(side: ExchangeSettlementSide, leaving: string, received: PublishedClubOffer, delta: number): ClubAcquisitionState {
    const balanceEur = checkedCredits(BigInt(side.state.balanceEur) + BigInt(delta));
    assertClubRule(balanceEur >= 0, "CLUB_INSUFFICIENT_BALANCE");
    const next = { ...side.state, revision: side.state.revision + 1, balanceEur,
      players: side.state.players.map(p => p.playerId !== leaving ? p : ({
        playerId: received.playerId, clubId: received.clubId, position: received.position,
        area: p.area, slot: p.slot, valueEur: received.valueEur,
        ...(received.primaryDetail === undefined ? {} : { primaryDetail: received.primaryDetail }),
      })) };
    inspectClubAcquisition(next);
    return next;
  }
  return { quote,
    proposer: replace(proposer, outgoing.playerId, incoming, quote.proposerDelta),
    accepter: replace(accepter, incoming.playerId, outgoing, quote.accepterDelta),
  };
}
