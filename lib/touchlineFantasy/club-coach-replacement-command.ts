import { CLUB_COACH_VALUES, inspectClubAcquisition, type ClubAcquisitionState } from "./club-acquisition.ts";
import { clubCommandMatchesAuthority, parseClubCommandAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";
import type { ClubCoachReplacementCommand, ClubCoachReplacementReceipt } from "./club-coach-replacement.ts";

export type ClubCoachReplacementRequest = Readonly<ClubCoachReplacementCommand & { action: "replace-coach" }>;
type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Row, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
// Catalogue ids and persisted selected_coach_id are numeric provider identifiers,
// not player UUIDs. Membership/publication still require server lookup.
const coachId = (value: unknown): value is string => typeof value === "string" && /^[0-9]{1,16}$/.test(value);

/** Persisted JSON equality: property order is irrelevant, array order and
 * omitted versus explicitly undefined properties remain significant. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => Object.hasOwn(right, index) && sameValue(value, right[index]));
  if (!object(left) || !object(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

export function parseClubCoachReplacementCommand(input: unknown): ClubCoachReplacementRequest | null {
  if (!object(input) || !exact(input, ["action", "currentCoachId", "incomingCoachId", "expectedRevision", "idempotencyKey"])
    || input.action !== "replace-coach" || !coachId(input.currentCoachId) || !coachId(input.incomingCoachId)
    || input.currentCoachId === input.incomingCoachId || !integer(input.expectedRevision)
    || input.expectedRevision >= Number.MAX_SAFE_INTEGER || typeof input.idempotencyKey !== "string"
    || !/^[a-zA-Z0-9_-]{8,120}$/.test(input.idempotencyKey)) return null;
  return { action: "replace-coach", currentCoachId: input.currentCoachId, incomingCoachId: input.incomingCoachId,
    expectedRevision: input.expectedRevision, idempotencyKey: input.idempotencyKey };
}

/** trustedAuthority must originate from verified auth + active season, not this envelope. */
export function parseClubCoachReplacementEnvelope(input: unknown, trustedAuthority: ClubCommandAuthority) {
  const trusted = parseClubCommandAuthority(trustedAuthority);
  const parsed = parseClubCommandAuthority(input);
  const command = parseClubCoachReplacementCommand(parsed?.command);
  if (!trusted || !parsed || !command || !clubCommandMatchesAuthority(trusted.authority,
    parsed.authority.expectedAccountId, parsed.authority.expectedSeasonId)) return null;
  return { authority: { ...parsed.authority }, command } as const;
}

export function isClubCoachReplacementReceipt(input: unknown, commandInput: unknown): input is ClubCoachReplacementReceipt {
  const command = parseClubCoachReplacementCommand(commandInput);
  if (!command || !object(input) || !exact(input, ["key", "outgoingCoachId", "incomingCoachId", "paidCredits", "feeCredits", "refundCredits", "signingCredits", "balanceCredits", "revision"])) return false;
  const { paidCredits: paid, feeCredits: fee, refundCredits: refund, signingCredits: signing, balanceCredits: balance, revision } = input;
  if (![paid, fee, refund, signing, balance, revision].every(integer) || Number(paid) <= 0 || Number(signing) <= 0) return false;
  return input.key === command.idempotencyKey && input.outgoingCoachId === command.currentCoachId
    && input.incomingCoachId === command.incomingCoachId && revision === command.expectedRevision + 1
    && Object.values(CLUB_COACH_VALUES).some(price => price === paid) && Object.values(CLUB_COACH_VALUES).some(price => price === signing)
    && BigInt(Number(fee)) === (BigInt(Number(paid)) * BigInt(10) + BigInt(50)) / BigInt(100)
    && BigInt(Number(refund)) + BigInt(Number(fee)) === BigInt(Number(paid));
}

export type ClubCoachReplacementResponse = Readonly<{
  ok: true; accountId: string; seasonId: string; state: ClubAcquisitionState;
  receipt: ClubCoachReplacementReceipt; replayed: boolean;
}>;

/** Retain the original confirmed before-state while an operation is pending, even after a timeout. */
export function parseClubCoachReplacementResponse(input: unknown, commandInput: unknown,
  trustedAuthority: ClubCommandAuthority, before: ClubAcquisitionState): ClubCoachReplacementResponse | null {
  const command = parseClubCoachReplacementCommand(commandInput);
  if (!parseClubCommandAuthority(trustedAuthority) || !command || !object(input)
    || !exact(input, ["ok", "accountId", "seasonId", "state", "receipt", "replayed"])
    || input.ok !== true || typeof input.replayed !== "boolean"
    || input.accountId !== trustedAuthority.expectedAccountId || input.seasonId !== trustedAuthority.expectedSeasonId
    || !isClubCoachReplacementReceipt(input.receipt, command)) return null;
  try {
    inspectClubAcquisition(before);
    const state = input.state as ClubAcquisitionState;
    inspectClubAcquisition(state);
    // The legacy atomic replacement is not the separate vacant-coach hire flow.
    if (before.coach === null || state.coach === null) return null;
    const receipt = input.receipt;
    if (before.seasonId !== trustedAuthority.expectedSeasonId || before.revision !== command.expectedRevision
      || before.coach.id !== command.currentCoachId || before.coach.valueEur !== receipt.paidCredits
      || state.seasonId !== trustedAuthority.expectedSeasonId || state.revision < receipt.revision
      || (!input.replayed && state.revision !== receipt.revision)
      || BigInt(before.balanceEur) + BigInt(receipt.refundCredits) - BigInt(receipt.signingCredits) !== BigInt(receipt.balanceCredits)) return null;
    // An operation-revision snapshot may change only the coach and wallet.
    // A newer replay snapshot can legitimately include subsequent operations.
    if (state.revision === receipt.revision && (state.coach.id !== command.incomingCoachId
      || state.coach.valueEur !== receipt.signingCredits || state.balanceEur !== receipt.balanceCredits
      || state.plan !== before.plan || !sameValue(state.players, before.players)
      || !sameValue(state.receipts, before.receipts)
      || Object.hasOwn(state, "formationCode") !== Object.hasOwn(before, "formationCode")
      || state.formationCode !== before.formationCode)) return null;
    return { ok: true, accountId: trustedAuthority.expectedAccountId, seasonId: trustedAuthority.expectedSeasonId,
      state, receipt: { ...receipt }, replayed: input.replayed };
  } catch { return null; }
}

/** Accept a parsed response only. A late receipt never rolls back a newer view. */
export function selectClubCoachReplacementSnapshot(current: ClubAcquisitionState | null,
  result: ClubCoachReplacementResponse, authority: ClubCommandAuthority): ClubAcquisitionState | null {
  if (!parseClubCommandAuthority(authority) || !clubCommandMatchesAuthority(authority, result.accountId, result.seasonId)) return current;
  try {
    inspectClubAcquisition(result.state);
    if (result.state.seasonId !== authority.expectedSeasonId || result.state.coach === null) return current;
    if (current) {
      inspectClubAcquisition(current);
      if (current.seasonId !== authority.expectedSeasonId || current.revision >= result.state.revision) return current;
    }
    return result.state;
  } catch { return current; }
}
