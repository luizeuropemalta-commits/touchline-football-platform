import "server-only";
import { parseClubReleaseRecoveryReference, parseClubReleaseRecoveryResult, type ClubReleaseRecoveryResult } from "./club-release-recovery.ts";
import { parseClubReleaseCommand } from "./club-release.ts";

export type ReleaseRecoveryScope = Readonly<{ ownerId: string; seasonId: string; idempotencyKey: string }>;
/** Implementations MUST filter every read by all scope fields; no mutation interface. */
export type ReleaseRecoveryReadRepository = Readonly<{
  operation(scope: ReleaseRecoveryScope): Promise<{ command: unknown; revision: unknown } | null>;
  receipt(scope: ReleaseRecoveryScope): Promise<unknown>;
  snapshot?: (scope: ReleaseRecoveryScope) => Promise<unknown>;
}>;
type Rejected = Readonly<{ status: "auth_required" | "context_changed" | "invalid_request"; resolved: false }>;

/**
 * NOT authentication: verifiedOwnerId must come from server auth.getUser(), never
 * request parameters. No gate/market/entitlement dependency: historical reads only.
 * Epoch is caller-owned correlation, not authorization. No route is wired here.
 */
export async function readClubReleaseRecovery(
  repository: ReleaseRecoveryReadRepository,
  verifiedOwnerId: string | null,
  referenceInput: unknown,
  epoch: number,
  includeSnapshot = false,
): Promise<ClubReleaseRecoveryResult | Rejected> {
  if (!verifiedOwnerId) return { status: "auth_required", resolved: false };
  const reference = parseClubReleaseRecoveryReference(referenceInput);
  if (!reference || !Number.isSafeInteger(epoch) || epoch < 0) return { status: "invalid_request", resolved: false };
  if (verifiedOwnerId !== reference.expectedAccountId) return { status: "context_changed", resolved: false };
  const scope = Object.freeze({ ownerId: verifiedOwnerId, seasonId: reference.expectedSeasonId, idempotencyKey: reference.idempotencyKey });
  const context = { expectedAccountId: verifiedOwnerId, expectedSeasonId: scope.seasonId, epoch };
  const command = parseClubReleaseCommand({
    action: reference.action, playerId: reference.playerId, expectedRevision: reference.expectedRevision, idempotencyKey: scope.idempotencyKey,
  })!;
  try {
    const operation = await repository.operation(scope);
    if (!operation) return { status: "not_observed", resolved: false };
    const stored = parseClubReleaseCommand(operation.command);
    if (!stored || stored.action !== command.action || stored.playerId !== command.playerId
      || stored.expectedRevision !== command.expectedRevision || stored.idempotencyKey !== command.idempotencyKey)
      return { status: "conflict", resolved: false };
    const receipt = await repository.receipt(scope);
    const dto = { status: "committed", accountId: verifiedOwnerId, seasonId: scope.seasonId,
      command, operationRevision: operation.revision, receipt };
    const confirmation = parseClubReleaseRecoveryResult(dto, reference, context);
    if (!confirmation) return { status: "unavailable", resolved: false };
    if (!includeSnapshot || !repository.snapshot) return confirmation;
    // Receipt confirmation survives an unavailable optional collection read.
    try {
      const snapshot = await repository.snapshot(scope);
      return parseClubReleaseRecoveryResult({ ...dto, snapshot }, reference, context) ?? confirmation;
    } catch { return confirmation; }
  } catch { return { status: "unavailable", resolved: false }; }
}
