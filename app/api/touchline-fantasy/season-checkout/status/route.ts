import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownerEmails } from "@/lib/admin/owner";
import { resolveClubSeasonTestConfiguration } from "@/lib/stripe/club-season-test-catalogue";
import { authorizeClubSeasonCheckoutCustomer } from "@/lib/stripe/club-season-checkout-service";
import { handleClubSeasonCheckoutStatus } from "@/lib/stripe/club-season-checkout-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleClubSeasonCheckoutStatus(request, {
    configured: () => resolveClubSeasonTestConfiguration().ok,
    async authenticate() {
      const client = await createClient();
      if (!client) return null;
      const { data, error } = await client.auth.getUser();
      return error ? null : authorizeClubSeasonCheckoutCustomer(data.user, ownerEmails());
    },
    async read(ownerId, sessionId) {
      const admin = createAdminClient();
      if (!admin) throw new Error("Storage unavailable");
      const { data, error } = await admin.from("touchline_club_season_test_orders")
        .select("user_id,session_id,state,plan,season_ends_at")
        .eq("user_id", ownerId).eq("session_id", sessionId)
        .abortSignal(AbortSignal.timeout(5_000)).maybeSingle();
      if (error) throw new Error("Storage unavailable");
      return data;
    },
  });
}
