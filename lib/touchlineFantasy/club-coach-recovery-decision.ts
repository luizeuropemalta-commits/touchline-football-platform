import { inspectClubAcquisition, type ClubAcquisitionState } from "./club-acquisition.ts";
import { parseClubCommandAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";
import { inspectClubCoachLifecycle, parseClubCoachLifecycleCommand } from "./club-coach-lifecycle.ts";
import { parseClubCoachLifecycleResponse, type ClubCoachLifecycleReceipt } from "./club-coach-lifecycle-response.ts";

/** Retained by a future caller at dispatch, never reconstructed from today's wallet. */
export type ClubCoachRecoveryPending = Readonly<{
  authority: ClubCommandAuthority; generation: number; command: unknown; before: unknown;
}>;
/** Already confirmed caller context, not authentication inferred from a response. */
export type ClubCoachRecoveryCurrent = Readonly<{
  authority: ClubCommandAuthority; generation: number; command: unknown;
  confirmedState: ClubAcquisitionState | null;
}>;
type PendingReason = "context_changed" | "command_changed" | "unconfirmed" | "invalid_response" | "invalid_current" | "revision_conflict";
export type ClubCoachRecoveryDecision =
  | Readonly<{ status: "pending"; reason: PendingReason }>
  | Readonly<{ status: "confirmed"; receipt: ClubCoachLifecycleReceipt;
    snapshot: Readonly<{ action: "preserve" }> | Readonly<{ action: "replace"; state: ClubAcquisitionState }> }>;
const pending = (reason: PendingReason): ClubCoachRecoveryDecision => ({ status: "pending", reason });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const generation = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Compare confirmed JSON snapshots without depending on property insertion order. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  if (!object(left) || !object(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

/**
 * Dormant, pure client integration boundary: no fetch, hook, storage, capability
 * or optimistic money update. Context fences must be captured and maintained by
 * the future authenticated caller. This function cannot establish auth/commit.
 * A valid historical receipt may resolve the command WITHOUT replacing a newer
 * confirmed collection. Pending decisions authorize neither a retry nor a write.
 */
export function decideClubCoachRecovery(retained: ClubCoachRecoveryPending,
  current: ClubCoachRecoveryCurrent, recoveryInput: unknown): ClubCoachRecoveryDecision {
  const originalAuthority = parseClubCommandAuthority(retained.authority)?.authority;
  const activeAuthority = parseClubCommandAuthority(current.authority)?.authority;
  if (!originalAuthority || !activeAuthority || !sameValue(originalAuthority, activeAuthority)
    || !generation(retained.generation) || !generation(current.generation)
    || retained.generation !== current.generation) return pending("context_changed");
  const originalCommand = parseClubCoachLifecycleCommand(retained.command);
  const activeCommand = parseClubCoachLifecycleCommand(current.command);
  if (!originalCommand || !activeCommand || !sameValue(originalCommand, activeCommand)) return pending("command_changed");
  if (!object(recoveryInput) || recoveryInput.status !== "committed" || recoveryInput.resolved !== true) return pending("unconfirmed");
  const keys = ["status", "resolved", "operationRevision", "response"];
  if (Object.keys(recoveryInput).length !== keys.length || !keys.every(key => Object.hasOwn(recoveryInput, key))) return pending("invalid_response");
  // One canonical parser owns receipt, 10% fee, price, contract and before/after validation.
  const response = parseClubCoachLifecycleResponse(recoveryInput.response, originalCommand, originalAuthority, retained.before);
  if (!response || !response.replayed || recoveryInput.operationRevision !== response.receipt.revision) return pending("invalid_response");
  const latest = current.confirmedState;
  try {
    if (!latest) return pending("invalid_current");
    inspectClubAcquisition(latest);
    inspectClubCoachLifecycle(latest);
  } catch { return pending("invalid_current"); }
  if (latest.seasonId !== activeAuthority.expectedSeasonId || latest.revision < originalCommand.expectedRevision) return pending("invalid_current");
  if (latest.revision > response.state.revision) return { status: "confirmed", receipt: response.receipt, snapshot: { action: "preserve" } };
  if (latest.revision === response.state.revision) return sameValue(latest, response.state)
    ? { status: "confirmed", receipt: response.receipt, snapshot: { action: "preserve" } }
    : pending("revision_conflict");
  if (!sameValue(latest, retained.before)) return pending("revision_conflict");
  return { status: "confirmed", receipt: response.receipt, snapshot: { action: "replace", state: response.state } };
}
