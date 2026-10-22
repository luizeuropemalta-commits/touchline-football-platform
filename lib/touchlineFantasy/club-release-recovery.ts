import { inspectClubAcquisition, type ClubAcquisitionState } from "./club-acquisition.ts";
import { clubCommandMatchesAuthority, parseClubCommandAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";
import { isClubReleaseReceipt, parseClubReleaseCommand, type ClubReleaseCommand } from "./club-release.ts";

/** Untrusted reference only: no storage, expiry, authentication or retry policy. */
export type ClubReleaseRecoveryReference = Readonly<ClubCommandAuthority & ClubReleaseCommand & {
  schemaVersion: 1; createdAt: number;
}>;
export function parseClubReleaseRecoveryReference(input: unknown): ClubReleaseRecoveryReference | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { schemaVersion, createdAt, ...envelope } = input as Record<string, unknown>;
  if (schemaVersion !== 1 || !Number.isSafeInteger(createdAt) || Number(createdAt) < 0) return null;
  const parsed = parseClubCommandAuthority(envelope);
  const command = parseClubReleaseCommand(parsed?.command);
  return parsed && command ? { schemaVersion, createdAt: Number(createdAt), ...parsed.authority, ...command } : null;
}
type UnresolvedStatus = "not_observed" | "unavailable" | "conflict";
/** Caller-owned generation captured before a read, never supplied by a response. */
export type ClubReleaseRecoveryContext = Readonly<ClubCommandAuthority & { epoch: number }>;
export type ClubReleaseRecoveryResult =
  | Readonly<{ status: UnresolvedStatus; resolved: false }>
  | Readonly<{ status: "committed"; resolved: true; operationRevision: number;
    context: ClubReleaseRecoveryContext; snapshot: ClubAcquisitionState | null }>;

/**
 * Validates a prospective status DTO against a reference and authenticated context.
 * Caller must establish trustedContext through verified auth, not this parser.
 * Snapshot may contain a newer contract for the same player; absence proves nothing.
 */
export function parseClubReleaseRecoveryResult(
  input: unknown, referenceInput: unknown, trustedContext: ClubReleaseRecoveryContext,
): ClubReleaseRecoveryResult | null {
  const reference = parseClubReleaseRecoveryReference(referenceInput);
  if (!Number.isSafeInteger(trustedContext.epoch) || trustedContext.epoch < 0
    || !reference || !clubCommandMatchesAuthority(trustedContext, reference.expectedAccountId, reference.expectedSeasonId)
    || !input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (!clubCommandMatchesAuthority(trustedContext, String(value.accountId), String(value.seasonId))) return null;
  const command = parseClubReleaseCommand(value.command);
  if (!command || command.action !== reference.action || command.playerId !== reference.playerId
    || command.idempotencyKey !== reference.idempotencyKey || command.expectedRevision !== reference.expectedRevision) return null;
  if (value.status === "not_observed" || value.status === "unavailable" || value.status === "conflict")
    return { status: value.status, resolved: false };
  if (value.status !== "committed" || !isClubReleaseReceipt(value.receipt, reference)) return null;
  const receipt = value.receipt as Record<string, unknown>;
  const revision = value.operationRevision;
  if (!Number.isSafeInteger(revision) || revision !== reference.expectedRevision + 1
    || receipt.revision !== revision) return null;
  const confirmation = { status: "committed" as const, resolved: true as const,
    operationRevision: Number(revision), context: { ...trustedContext } };
  if (value.snapshot === undefined || value.snapshot === null) return { ...confirmation, snapshot: null };
  try {
    const snapshot = value.snapshot as ClubAcquisitionState;
    inspectClubAcquisition(snapshot);
    if (snapshot.seasonId !== reference.expectedSeasonId || snapshot.revision < Number(revision)) return null;
    return { ...confirmation, snapshot };
  } catch { return null; }
}

/** No arithmetic/refund is performed. Never overwrite a newer confirmed snapshot. */
export function selectClubReleaseRecoverySnapshot(
  current: ClubAcquisitionState | null, result: ClubReleaseRecoveryResult,
  currentContext: ClubReleaseRecoveryContext,
): ClubAcquisitionState | null {
  if (!result.resolved || !result.snapshot
    || !Number.isSafeInteger(currentContext.epoch) || currentContext.epoch < 0
    || result.context.epoch !== currentContext.epoch
    || !clubCommandMatchesAuthority(currentContext, result.context.expectedAccountId, result.context.expectedSeasonId)) return current;
  if (current) {
    inspectClubAcquisition(current);
    if (current.seasonId !== result.snapshot.seasonId || current.revision >= result.snapshot.revision) return current;
  }
  return result.snapshot;
}
