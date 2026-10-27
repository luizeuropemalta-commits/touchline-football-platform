import { CLUB_COACH_VALUES, type ClubAcquisitionState } from "./club-acquisition.ts";
import { CLUB_PLANS, assertClubRule, checkedCredits, quoteClubReturn } from "./club-market-rules.ts";
import type { PublishedClubCoachOffer } from "./club-coach-replacement.ts";

type CoachContract = NonNullable<ClubAcquisitionState["coach"]>;
/** Prospective lifecycle only; nullable reads do not activate persistence or hiring. */
export type ClubCoachLifecycleState = Readonly<Pick<ClubAcquisitionState,
  "revision" | "seasonId" | "plan" | "balanceEur"> & { coach: CoachContract | null }>;
type CommandBase = Readonly<{ expectedRevision: number; idempotencyKey: string }>;
export type ClubCoachReleaseCommand = CommandBase & Readonly<{ action: "release-coach"; currentCoachId: string }>;
export type ClubCoachHireCommand = CommandBase & Readonly<{ action: "hire-coach"; incomingCoachId: string }>;
export type ClubCoachLifecycleCommand = ClubCoachReleaseCommand | ClubCoachHireCommand;
export type ClubCoachLifecycleContext = Readonly<{ marketOpen: boolean; roundLocked: boolean }>;
type UpdatedState<T extends ClubCoachLifecycleState> = Omit<T, "coach"> & { readonly coach: CoachContract | null };
type ReceiptBase = Readonly<{ key: string; revision: number; balanceCredits: number }>;
export type ClubCoachReleaseReceipt = ReceiptBase & Readonly<{
  action: "release-coach"; outgoingContract: CoachContract; paidCredits: number; feeCredits: number; refundCredits: number;
}>;
export type ClubCoachHireReceipt = ReceiptBase & Readonly<{
  action: "hire-coach"; incomingContract: CoachContract; signingCredits: number;
}>;
const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9]{1,16}$/.test(value);

/** No prices, owner, balance, publication or eligibility supplied by request JSON. */
export function parseClubCoachLifecycleCommand(input: unknown): ClubCoachLifecycleCommand | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const idField = row.action === "release-coach" ? "currentCoachId" : row.action === "hire-coach" ? "incomingCoachId" : null;
  if (!idField || Object.keys(row).length !== 4
    || !["action", idField, "expectedRevision", "idempotencyKey"].every(key => Object.hasOwn(row, key))
    || !validId(row[idField]) || !Number.isSafeInteger(row.expectedRevision) || Number(row.expectedRevision) < 0
    || Number(row.expectedRevision) >= Number.MAX_SAFE_INTEGER || typeof row.idempotencyKey !== "string"
    || !/^[a-zA-Z0-9_-]{8,120}$/.test(row.idempotencyKey)) return null;
  const base = { expectedRevision: Number(row.expectedRevision), idempotencyKey: row.idempotencyKey };
  return idField === "currentCoachId"
    ? { ...base, action: "release-coach", currentCoachId: row.currentCoachId as string }
    : { ...base, action: "hire-coach", incomingCoachId: row.incomingCoachId as string };
}

function inspectContract(contract: CoachContract) {
  assertClubRule(contract && validId(contract.id), "CLUB_COACH_INVALID");
  assertClubRule(Object.hasOwn(CLUB_COACH_VALUES, contract.tier)
    && Number.isSafeInteger(contract.valueEur) && contract.valueEur === CLUB_COACH_VALUES[contract.tier], "CLUB_PRICE_INVALID");
}

/** Validates only the coach/economy envelope, NOT players, entitlement or persisted collection authority. */
export function inspectClubCoachLifecycle(state: ClubCoachLifecycleState) {
  assertClubRule(state && Object.hasOwn(CLUB_PLANS, state.plan), "CLUB_PLAN_INVALID");
  assertClubRule(typeof state.seasonId === "string" && state.seasonId.trim(), "CLUB_SEASON_REQUIRED");
  assertClubRule(Number.isSafeInteger(state.revision) && state.revision >= 0, "CLUB_REVISION_INVALID");
  assertClubRule(Number.isSafeInteger(state.balanceEur) && state.balanceEur >= 0, "CLUB_BALANCE_INVALID");
  assertClubRule(Object.hasOwn(state, "coach") && state.coach !== undefined, "CLUB_COACH_INVALID");
  if (state.coach !== null) inspectContract(state.coach);
}

function inspectTransition(state: ClubCoachLifecycleState, input: unknown, context: ClubCoachLifecycleContext) {
  inspectClubCoachLifecycle(state);
  const command = parseClubCoachLifecycleCommand(input);
  assertClubRule(command, "CLUB_INVALID_REQUEST");
  assertClubRule(command.expectedRevision === state.revision, "CLUB_STALE_REVISION");
  assertClubRule(context.marketOpen === true, "CLUB_MARKET_CLOSED");
  assertClubRule(context.roundLocked === false, "CLUB_COACH_ROUND_LOCKED");
  return command;
}

/**
 * Two separate prospective operations: release creates a genuine vacancy; hire fills it.
 * Neither function writes storage or establishes auth/atomicity/idempotent replay.
 * An adapter must validate the complete collection, lock/recheck round, entitlement,
 * catalogue and revision, and atomically persist EACH operation with its receipt.
 * Exact receipt replay must happen BEFORE calling these transitions again.
 * Preserve the original pending command after timeout; never infer success from vacancy.
 */
export function releaseClubCoach<T extends ClubCoachLifecycleState>(state: T, input: ClubCoachReleaseCommand,
  context: ClubCoachLifecycleContext): { state: UpdatedState<T>; receipt: ClubCoachReleaseReceipt } {
  const command = inspectTransition(state, input, context);
  assertClubRule(command.action === "release-coach", "CLUB_INVALID_REQUEST");
  assertClubRule(state.coach !== null, "CLUB_COACH_REQUIRED");
  assertClubRule(state.coach.id === command.currentCoachId, "CLUB_COACH_NOT_OWNED");
  const quote = quoteClubReturn(state.coach.valueEur, state.plan, "ordinary");
  const balanceCredits = checkedCredits(BigInt(state.balanceEur) + BigInt(quote.refund));
  const revision = state.revision + 1;
  const receipt: ClubCoachReleaseReceipt = { action: "release-coach", key: command.idempotencyKey,
    outgoingContract: { ...state.coach }, paidCredits: state.coach.valueEur,
    feeCredits: quote.fee, refundCredits: quote.refund, balanceCredits, revision };
  const next: UpdatedState<T> = { ...state, coach: null, balanceEur: balanceCredits, revision };
  inspectClubCoachLifecycle(next);
  return { state: next, receipt };
}

export function hireClubCoach<T extends ClubCoachLifecycleState>(state: T, input: ClubCoachHireCommand,
  context: ClubCoachLifecycleContext & Readonly<{ offer: PublishedClubCoachOffer | null }>): { state: UpdatedState<T>; receipt: ClubCoachHireReceipt } {
  const command = inspectTransition(state, input, context);
  assertClubRule(command.action === "hire-coach", "CLUB_INVALID_REQUEST");
  assertClubRule(state.coach === null, "CLUB_COACH_ALREADY_OWNED");
  const offer = context.offer;
  assertClubRule(offer?.published === true && offer.id === command.incomingCoachId, "CLUB_COACH_UNAVAILABLE");
  inspectContract(offer);
  assertClubRule(state.balanceEur >= offer.valueEur, "CLUB_INSUFFICIENT_BALANCE");
  const balanceCredits = checkedCredits(BigInt(state.balanceEur) - BigInt(offer.valueEur));
  const revision = state.revision + 1;
  const contract: CoachContract = { id: offer.id, tier: offer.tier, valueEur: offer.valueEur };
  const receipt: ClubCoachHireReceipt = { action: "hire-coach", key: command.idempotencyKey,
    incomingContract: { ...contract }, signingCredits: offer.valueEur, balanceCredits, revision };
  const next: UpdatedState<T> = { ...state, coach: contract, balanceEur: balanceCredits, revision };
  inspectClubCoachLifecycle(next);
  return { state: next, receipt };
}
