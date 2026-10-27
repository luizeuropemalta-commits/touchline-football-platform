import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { clubCollectionEnabled } from "./club-collection-server";
import type { ClubCoachLifecycleCommand } from "./club-coach-lifecycle";
import type { ClubCoachRecoveryReadRepository } from "./club-coach-lifecycle-recovery-server";
import type { PublishedClubCoachOffer } from "./club-coach-replacement";

/** Deliberately OFF unless separately approved after migration and QA smoke tests. */
export const clubCoachLifecycleEnabled = () => clubCollectionEnabled()
  && process.env.TOUCHLINE_CLUB_COACH_LIFECYCLE_ENABLED === "true";
export function createClubCoachLifecycleRepository(admin: NonNullable<ReturnType<typeof createAdminClient>>): ClubCoachRecoveryReadRepository {
  return { async readCommittedOperation(scope) {
    const { data, error } = await admin.from("touchline_club_coach_operations")
      .select("user_id,season_id,command,before_state,response")
      .eq("user_id", scope.ownerId).eq("season_id", scope.seasonId).eq("idempotency_key", scope.idempotencyKey).maybeSingle();
    if (error) throw new Error("CLUB_STORAGE_UNAVAILABLE");
    return data ? { schemaVersion: 1, accountId: data.user_id, seasonId: data.season_id,
      command: data.command, before: data.before_state, response: data.response } : null;
  } };
}
export async function commitClubCoachLifecycle(admin: NonNullable<ReturnType<typeof createAdminClient>>,
  ownerId: string, seasonId: string, command: ClubCoachLifecycleCommand,
  offer: (PublishedClubCoachOffer & { clubId: string }) | null) {
  const { data, error } = await admin.rpc("touchline_club_coach_lifecycle", {
    p_user_id: ownerId, p_season_id: seasonId, p_command: command, p_offer: offer,
  });
  if (error) throw new Error(error.message.match(/CLUB_[A-Z_]+/)?.[0] ?? "CLUB_STORAGE_UNAVAILABLE");
  return data as unknown;
}
