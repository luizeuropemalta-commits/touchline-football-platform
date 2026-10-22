import "server-only";
import type { ReleaseRecoveryReadRepository, ReleaseRecoveryScope } from "./club-release-recovery-server.ts";

type Row = Record<string, unknown>;
type Selection = {
  eq(column: string, value: string): Selection;
  maybeSingle(): PromiseLike<{ data: Row | null; error: unknown }>;
};
/** Inject a server-owned client. This adapter never creates clients or reads env. */
export type ReleaseRecoverySelectClient = {
  from(table: string): { select(columns: string): Selection };
};
export function createClubReleaseRecoveryReadRepository(client: ReleaseRecoverySelectClient): ReleaseRecoveryReadRepository {
  async function select(table: string, columns: string, scope: ReleaseRecoveryScope, keyed = true) {
    let query = client.from(table).select(columns)
      .eq("user_id", scope.ownerId).eq("season_id", scope.seasonId);
    if (keyed) query = query.eq("idempotency_key", scope.idempotencyKey);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error("RECOVERY_READ_UNAVAILABLE");
    return data;
  }
  return {
    async operation(scope) {
      const row = await select("touchline_club_collection_operations", "command,revision", scope);
      return row ? { command: row.command, revision: row.revision } : null;
    },
    receipt: scope => select("touchline_club_release_receipts",
      "idempotency_key,player_id,paid_credits,fee_credits,refund_credits,revision", scope),
    async snapshot(scope) {
      // Collections have no operation-key column. Anchor this read to that exact
      // owner's operation first, then read only its owner/season collection.
      if (!await select("touchline_club_collection_operations", "revision", scope)) return null;
      return (await select("touchline_club_collections", "state", scope, false))?.state ?? null;
    },
  };
}
