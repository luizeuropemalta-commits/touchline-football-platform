import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleClubReleaseRecovery } from "@/lib/touchlineFantasy/club-release-recovery-handler";
import { createClubReleaseRecoveryReadRepository, type ReleaseRecoverySelectClient } from "@/lib/touchlineFantasy/club-release-recovery-repository";
import { readClubReleaseRecoveryEvidence } from "@/lib/touchlineFantasy/club-release-recovery-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  // The privileged client is created only after verified identity, and every
  // repository query binds that identity plus the independently resolved season.
  let admin: ReturnType<typeof createAdminClient>;
  return handleClubReleaseRecovery(request, {
    authenticate: async () => {
      const client = await createClient();
      const auth = client ? await client.auth.getUser() : null;
      return auth?.error === null ? auth.data.user?.id ?? null : null;
    },
    currentSeason: async () => {
      admin = createAdminClient();
      if (!admin) return null;
      const { data, error } = await admin.from("touchline_fantasy_configs").select("season_id")
        .eq("competition_key", "england").eq("status", "active").single();
      return error ? null : data?.season_id ?? null;
    },
    read: async (owner, reference) => {
      if (!admin) throw new Error("CLUB_STORAGE_UNAVAILABLE");
      // Bound the generated database client to the adapter's read-only API;
      // comparing its recursive generic schema structurally exceeds TS depth.
      return readClubReleaseRecoveryEvidence(createClubReleaseRecoveryReadRepository(admin as unknown as ReleaseRecoverySelectClient), owner, reference);
    },
  });
}
