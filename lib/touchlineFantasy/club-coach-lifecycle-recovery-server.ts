import "server-only";
import { resolveServerReadWithin } from "../touchlineArena/server-read-deadline.ts";
import { parseClubCommandAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";
import { parseClubCoachLifecycleCommand, type ClubCoachLifecycleCommand } from "./club-coach-lifecycle.ts";
import { parseClubCoachLifecycleResponse, type ClubCoachLifecycleResponse } from "./club-coach-lifecycle-response.ts";

/** Must originate from verified server Auth and independently resolved season.
 * This type is not an authenticator; never construct it from request JSON. */
export type ClubCoachRecoveryVerifiedContext =
  | Readonly<{ status: "verified"; role: "customer" | "admin"; accountId: string; seasonId: string }>
  | Readonly<{ status: "guest" | "unavailable" }>;
export type ClubCoachRecoveryScope = Readonly<{ ownerId: string; seasonId: string; idempotencyKey: string }>;

/** Prospective atomic operation record. `before` is the ORIGINAL historical
 * snapshot, not today's collection and not a browser-supplied reconstruction. */
export type ClubCoachCommittedOperationRecord = Readonly<{
  schemaVersion: 1; accountId: string; seasonId: string;
  command: unknown; before: unknown; response: unknown;
}>;
export type ClubCoachRecoveryReadRepository = Readonly<{
  /** One committed record, filtered by ALL three scope fields. No writes,
   * current-collection fallback, provider request or separate receipt read. */
  readCommittedOperation(scope: ClubCoachRecoveryScope): Promise<unknown | null>;
}>;
type UnresolvedStatus = "disabled" | "auth_required" | "auth_unavailable" | "forbidden"
  | "invalid_request" | "context_changed" | "not_observed" | "conflict" | "unavailable";
export type ClubCoachLifecycleRecoveryResult =
  | Readonly<{ status: UnresolvedStatus; resolved: false }>
  | Readonly<{ status: "committed"; resolved: true; operationRevision: number;
    response: ClubCoachLifecycleResponse }>;

const unresolved = (status: UnresolvedStatus): ClubCoachLifecycleRecoveryResult => ({ status, resolved: false });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function sameCommand(left: ClubCoachLifecycleCommand, right: ClubCoachLifecycleCommand) {
  if (left.action !== right.action || left.idempotencyKey !== right.idempotencyKey || left.expectedRevision !== right.expectedRevision) return false;
  return left.action === "release-coach" && right.action === "release-coach"
    ? left.currentCoachId === right.currentCoachId
    : left.action === "hire-coach" && right.action === "hire-coach" && left.incomingCoachId === right.incomingCoachId;
}

/**
 * Dormant local integration boundary: no durable adapter, RPC, route or client
 * wiring exists yet. Capability defaults CLOSED. Passing mocked records proves
 * validation only, not authentication, transaction atomicity or a real commit.
 *
 * Historical recovery does not reapply market rules or compute a new balance.
 * A missing/invalid record stays unresolved; never auto-retry the original POST.
 * The returned snapshot belongs to the operation revision, NOT necessarily the
 * latest collection. A future client must fence account/season/generation and
 * avoid rolling back a newer confirmed view before accepting any snapshot.
 * The bounded read cannot cancel an adapter's already-started I/O, but a late
 * result never changes the returned unresolved outcome or causes another read.
 */
export async function readClubCoachLifecycleRecovery(
  repository: ClubCoachRecoveryReadRepository,
  verifiedContext: ClubCoachRecoveryVerifiedContext,
  requestEnvelope: unknown,
  capabilityEnabled = false,
): Promise<ClubCoachLifecycleRecoveryResult> {
  if (capabilityEnabled !== true) return unresolved("disabled");
  if (verifiedContext.status === "guest") return unresolved("auth_required");
  if (verifiedContext.status !== "verified") return unresolved("auth_unavailable");
  if (verifiedContext.role !== "customer") return unresolved("forbidden");
  const verified = parseClubCommandAuthority({ expectedAccountId: verifiedContext.accountId, expectedSeasonId: verifiedContext.seasonId });
  if (!verified) return unresolved("auth_unavailable");
  const envelope = parseClubCommandAuthority(requestEnvelope);
  const command = parseClubCoachLifecycleCommand(envelope?.command);
  if (!envelope || !command) return unresolved("invalid_request");
  const authority: ClubCommandAuthority = { ...verified.authority };
  if (authority.expectedAccountId !== envelope.authority.expectedAccountId
    || authority.expectedSeasonId !== envelope.authority.expectedSeasonId) return unresolved("context_changed");
  const scope = Object.freeze({ ownerId: authority.expectedAccountId, seasonId: authority.expectedSeasonId, idempotencyKey: command.idempotencyKey });
  try {
    // undefined means unconfirmed/unavailable; a genuine null alone means the
    // durable store completed the scoped lookup without finding an operation.
    const record = await resolveServerReadWithin<unknown>(repository.readCommittedOperation(scope), undefined, 8_000);
    if (record === null) return unresolved("not_observed");
    const keys = ["schemaVersion", "accountId", "seasonId", "command", "before", "response"];
    if (!object(record) || Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))
      || record.schemaVersion !== 1 || record.accountId !== authority.expectedAccountId || record.seasonId !== authority.expectedSeasonId) return unresolved("unavailable");
    const stored = parseClubCoachLifecycleCommand(record.command);
    if (!stored) return unresolved("unavailable");
    if (!sameCommand(stored, command)) return unresolved("conflict");
    const response = parseClubCoachLifecycleResponse(record.response, command, authority, record.before);
    if (!response) return unresolved("unavailable");
    return { status: "committed", resolved: true, operationRevision: response.receipt.revision,
      response: { ...response, replayed: true } };
  } catch { return unresolved("unavailable"); }
}
