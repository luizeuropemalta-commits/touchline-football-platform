import { CLUB_COACH_VALUES, inspectClubAcquisition, type ClubAcquisitionState } from "./club-acquisition.ts";
import { assertClubRule, checkedCredits, quoteClubReturn } from "./club-market-rules.ts";

type Coach = NonNullable<ClubAcquisitionState["coach"]>;
export type ClubCoachReplacementCommand = Readonly<{
  currentCoachId: string;
  incomingCoachId: string;
  expectedRevision: number;
  idempotencyKey: string;
}>;
export type PublishedClubCoachOffer = Coach & Readonly<{ published: boolean }>;
export type ClubCoachReplacementContext = Readonly<{
  /** Both values must be resolved by the server, never from request JSON. */
  marketOpen: boolean;
  roundLocked: boolean;
  offer: PublishedClubCoachOffer | null;
}>;
export type ClubCoachReplacementReceipt = Readonly<{
  key: string;
  outgoingCoachId: string;
  incomingCoachId: string;
  paidCredits: number;
  feeCredits: number;
  refundCredits: number;
  signingCredits: number;
  balanceCredits: number;
  revision: number;
}>;

/**
 * Pure proposal, not authorization or persistence. The adapter must authenticate,
 * lock owner/season and round, recheck publication, and commit coach + wallet +
 * receipt atomically. Idempotency readback belongs to that transaction: do not
 * call this transition again against the resulting state to replay a receipt.
 * Existing player contracts, allocation and historical round snapshots stay intact.
 */
export function replaceClubCoach(state: ClubAcquisitionState,
  command: ClubCoachReplacementCommand, context: ClubCoachReplacementContext) {
  assertClubRule(state.coach && typeof state.coach.id === "string" && state.coach.id.trim(), "CLUB_COACH_INVALID");
  inspectClubAcquisition(state);
  assertClubRule(state.plan !== "beta", "CLUB_COLLECTION_PAID_PLAN_REQUIRED");
  assertClubRule(typeof command.idempotencyKey === "string" && /^[a-zA-Z0-9_-]{8,120}$/.test(command.idempotencyKey), "CLUB_IDEMPOTENCY_INVALID");
  assertClubRule(Number.isSafeInteger(command.expectedRevision) && command.expectedRevision >= 0, "CLUB_REVISION_INVALID");
  assertClubRule(command.expectedRevision === state.revision, "CLUB_STALE_REVISION");
  assertClubRule(state.revision < Number.MAX_SAFE_INTEGER, "CLUB_REVISION_INVALID");
  assertClubRule(typeof command.currentCoachId === "string" && command.currentCoachId === state.coach.id, "CLUB_COACH_NOT_OWNED");
  assertClubRule(typeof command.incomingCoachId === "string" && command.incomingCoachId.trim(), "CLUB_COACH_UNAVAILABLE");
  assertClubRule(command.incomingCoachId !== command.currentCoachId, "CLUB_COACH_ALREADY_OWNED");
  assertClubRule(context.marketOpen === true, "CLUB_MARKET_CLOSED");
  // Undefined is not evidence that the competition is unlocked.
  assertClubRule(context.roundLocked === false, "CLUB_COACH_ROUND_LOCKED");
  const offer = context.offer;
  assertClubRule(offer?.published === true && offer.id === command.incomingCoachId, "CLUB_COACH_UNAVAILABLE");
  assertClubRule(Object.hasOwn(CLUB_COACH_VALUES, offer.tier)
    && Number.isSafeInteger(offer.valueEur) && offer.valueEur === CLUB_COACH_VALUES[offer.tier], "CLUB_PRICE_INVALID");
  const quote = quoteClubReturn(state.coach.valueEur, state.plan, "ordinary");
  // BigInt avoids intermediate overflow when refund and purchase offset each other.
  const balance = BigInt(state.balanceEur) + BigInt(quote.refund) - BigInt(offer.valueEur);
  assertClubRule(balance >= BigInt(0), "CLUB_INSUFFICIENT_BALANCE");
  const balanceCredits = checkedCredits(balance);
  const receipt: ClubCoachReplacementReceipt = {
    key: command.idempotencyKey, outgoingCoachId: state.coach.id, incomingCoachId: offer.id,
    paidCredits: state.coach.valueEur, feeCredits: quote.fee, refundCredits: quote.refund,
    signingCredits: offer.valueEur, balanceCredits, revision: state.revision + 1,
  };
  const next: ClubAcquisitionState = {
    ...state, revision: receipt.revision, balanceEur: balanceCredits,
    coach: { id: offer.id, tier: offer.tier, valueEur: offer.valueEur },
  };
  inspectClubAcquisition(next);
  return { state: next, receipt };
}
