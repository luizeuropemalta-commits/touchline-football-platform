import { CLUB_COACH_VALUES, inspectClubAcquisition, type ClubAcquisitionState } from "./club-acquisition.ts";
import { parseClubCommandAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";
import { inspectClubCoachLifecycle, parseClubCoachLifecycleCommand,
  type ClubCoachHireReceipt, type ClubCoachReleaseReceipt } from "./club-coach-lifecycle.ts";

type Row = Record<string, unknown>;
type Contract = NonNullable<ClubAcquisitionState["coach"]>;
export type ClubCoachLifecycleReceipt = ClubCoachReleaseReceipt | ClubCoachHireReceipt;
export type ClubCoachLifecycleResponse = Readonly<{
  ok: true; accountId: string; seasonId: string; state: ClubAcquisitionState;
  receipt: ClubCoachLifecycleReceipt; replayed: boolean;
}>;
const object = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Row, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const credits = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function parseContract(input: unknown): Contract | null {
  if (!object(input) || !exact(input, ["id", "tier", "valueEur"])
    || typeof input.id !== "string" || !/^[0-9]{1,16}$/.test(input.id)
    || typeof input.tier !== "string" || !Object.hasOwn(CLUB_COACH_VALUES, input.tier)
    || !credits(input.valueEur) || input.valueEur !== CLUB_COACH_VALUES[input.tier as Contract["tier"]]) return null;
  return { id: input.id, tier: input.tier as Contract["tier"], valueEur: input.valueEur };
}

/** Structural receipt validation only. Authentication, publication, transaction
 * ownership and durable commit must be established by the server adapter. */
export function parseClubCoachLifecycleReceipt(input: unknown, commandInput: unknown): ClubCoachLifecycleReceipt | null {
  const command = parseClubCoachLifecycleCommand(commandInput);
  if (!command || !object(input) || input.action !== command.action
    || input.key !== command.idempotencyKey || input.revision !== command.expectedRevision + 1
    || !credits(input.revision) || !credits(input.balanceCredits)) return null;
  const common = { key: command.idempotencyKey, revision: input.revision, balanceCredits: input.balanceCredits };
  if (command.action === "release-coach") {
    if (!exact(input, ["action", "key", "revision", "balanceCredits", "outgoingContract", "paidCredits", "feeCredits", "refundCredits"])) return null;
    const contract = parseContract(input.outgoingContract);
    if (!contract || contract.id !== command.currentCoachId || input.paidCredits !== contract.valueEur
      || !credits(input.paidCredits) || !credits(input.feeCredits) || !credits(input.refundCredits)
      || BigInt(input.feeCredits) * BigInt(10) !== BigInt(input.paidCredits)
      || BigInt(input.feeCredits) + BigInt(input.refundCredits) !== BigInt(input.paidCredits)) return null;
    return { ...common, action: "release-coach", outgoingContract: contract,
      paidCredits: input.paidCredits, feeCredits: input.feeCredits, refundCredits: input.refundCredits };
  }
  if (!exact(input, ["action", "key", "revision", "balanceCredits", "incomingContract", "signingCredits"])) return null;
  const contract = parseContract(input.incomingContract);
  if (!contract || contract.id !== command.incomingCoachId || input.signingCredits !== contract.valueEur) return null;
  return { ...common, action: "hire-coach", incomingContract: contract, signingCredits: contract.valueEur };
}

/** Compare persisted JSON values without depending on object insertion order.
 * Arrays retain order, and omitted fields differ from explicit undefined. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  if (!object(left) || !object(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

function parseSnapshot(input: unknown): ClubAcquisitionState | null {
  if (!object(input) || !exact(input, ["revision", "seasonId", "plan", "balanceEur", "coach", "players", "receipts",
    ...(Object.hasOwn(input, "formationCode") ? ["formationCode"] : [])])) return null;
  const state = input as ClubAcquisitionState;
  try {
    inspectClubAcquisition(state);
    inspectClubCoachLifecycle(state);
    if (state.coach !== null && !parseContract(state.coach)) return null;
    return state;
  } catch { return null; }
}

/**
 * Prospective local response contract; no transport, persistence or optimistic
 * wallet updates. `before` must be the original complete confirmed snapshot,
 * retained alongside the pending command. Expected identity is a guard, never
 * authority to select an account; callers must obtain it from verified auth.
 *
 * Historical replay with a newer snapshot stays unresolved (null). A recent
 * vacancy, coach or wallet cannot prove the outcome of an older command. Only
 * an operation-revision snapshot may be compared to its retained before-state.
 */
export function parseClubCoachLifecycleResponse(input: unknown, commandInput: unknown,
  trustedAuthority: ClubCommandAuthority, beforeInput: unknown): ClubCoachLifecycleResponse | null {
  const command = parseClubCoachLifecycleCommand(commandInput);
  const authority = parseClubCommandAuthority(trustedAuthority)?.authority;
  if (!authority || !command || !object(input)
    || !exact(input, ["ok", "accountId", "seasonId", "state", "receipt", "replayed"])
    || input.ok !== true || typeof input.replayed !== "boolean"
    || input.accountId !== authority.expectedAccountId || input.seasonId !== authority.expectedSeasonId) return null;
  const before = parseSnapshot(beforeInput), state = parseSnapshot(input.state);
  const receipt = parseClubCoachLifecycleReceipt(input.receipt, command);
  if (!before || !state || !receipt || before.seasonId !== authority.expectedSeasonId
    || state.seasonId !== authority.expectedSeasonId || before.revision !== command.expectedRevision
    || state.revision !== receipt.revision || state.plan !== before.plan
    || !sameValue(state.players, before.players) || !sameValue(state.receipts, before.receipts)
    || Object.hasOwn(state, "formationCode") !== Object.hasOwn(before, "formationCode")
    || state.formationCode !== before.formationCode) return null;
  let expectedBalance: bigint;
  if (receipt.action === "release-coach") {
    if (before.coach === null || state.coach !== null || !sameValue(before.coach, receipt.outgoingContract)) return null;
    expectedBalance = BigInt(before.balanceEur) + BigInt(receipt.refundCredits);
  } else {
    if (before.coach !== null || !sameValue(state.coach, receipt.incomingContract)) return null;
    expectedBalance = BigInt(before.balanceEur) - BigInt(receipt.signingCredits);
  }
  if (expectedBalance < BigInt(0) || expectedBalance > BigInt(Number.MAX_SAFE_INTEGER)
    || expectedBalance !== BigInt(receipt.balanceCredits) || state.balanceEur !== receipt.balanceCredits) return null;
  return { ok: true, accountId: authority.expectedAccountId, seasonId: authority.expectedSeasonId, state, receipt, replayed: input.replayed };
}
