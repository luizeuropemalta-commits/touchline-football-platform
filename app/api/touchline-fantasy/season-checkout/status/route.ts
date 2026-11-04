import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownerEmails } from "@/lib/admin/owner";
import { resolveClubSeasonPaymentConfiguration } from "@/lib/stripe/club-season-configuration.server";
import { authorizeClubSeasonCheckoutCustomer } from "@/lib/stripe/club-season-checkout-service";
import { handleClubSeasonCheckoutStatus } from "@/lib/stripe/club-season-checkout-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resolved = resolveClubSeasonPaymentConfiguration("status");
  const payment = resolved.ok && resolved.config.mode === "live"
    ? { mode: "live" as const, accountId: resolved.config.accountId } : undefined;
  return handleClubSeasonCheckoutStatus(request, {
    configured: () => resolved.ok, payment,
    async authenticate() {
      const client = await createClient();
      if (!client) return null;
      const { data, error } = await client.auth.getUser();
      return error ? null : authorizeClubSeasonCheckoutCustomer(data.user, ownerEmails());
    },
    async read(ownerId, sessionId) {
      const admin = createAdminClient();
      if (!admin) throw new Error("Storage unavailable");
      let query = admin.from("touchline_club_season_test_orders")
        .select(payment ? "user_id,session_id,state,plan,season_ends_at,payment_mode,provider_account" : "user_id,session_id,state,plan,season_ends_at")
        .eq("user_id", ownerId).eq("session_id", sessionId);
      if (payment) query = query.eq("payment_mode", payment.mode).eq("provider_account", payment.accountId);
      const { data, error } = await query.abortSignal(AbortSignal.timeout(5_000)).maybeSingle();
      if (error) throw new Error("Storage unavailable");
      return data;
    },
  });
}
