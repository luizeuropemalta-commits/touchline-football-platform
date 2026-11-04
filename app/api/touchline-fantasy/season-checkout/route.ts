import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownerEmails } from "@/lib/admin/owner";
import { resolveClubSeasonPaymentConfiguration } from "@/lib/stripe/club-season-configuration.server";
import { createClubSeasonCheckout } from "@/lib/stripe/club-season-provider.server";
import { createClubSeasonPaymentOrderStore } from "@/lib/stripe/club-season-order-store.server";
import { authorizeClubSeasonCheckoutCustomer, beginClubSeasonCheckout, handleClubSeasonCheckout } from "@/lib/stripe/club-season-checkout-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const resolved = resolveClubSeasonPaymentConfiguration("create");
  return handleClubSeasonCheckout(request, {
    configured: () => resolved.ok && !!resolved.config.profile,
    async authenticate() {
      const client = await createClient();
      if (!client) return null;
      const { data, error } = await client.auth.getUser();
      return authorizeClubSeasonCheckoutCustomer(error ? null : data.user, ownerEmails());
    },
    async begin(ownerId, plan, expectedAmountMinor) {
      if (!resolved.ok || !resolved.config.profile) throw new Error("SEASON_CHECKOUT_UNAVAILABLE");
      const { profile } = resolved.config;
      const admin = createAdminClient();
      if (!admin) throw new Error("SEASON_STORAGE_UNAVAILABLE");
      return beginClubSeasonCheckout({ ownerId, plan, expectedAmountMinor }, {
        profile, store: createClubSeasonPaymentOrderStore(admin, profile), createCheckout: createClubSeasonCheckout,
      });
    },
  });
}
