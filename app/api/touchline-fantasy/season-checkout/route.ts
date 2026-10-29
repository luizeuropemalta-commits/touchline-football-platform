import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownerEmails } from "@/lib/admin/owner";
import { resolveClubSeasonTestConfiguration } from "@/lib/stripe/club-season-test-catalogue";
import { createClubSeasonTestCheckout } from "@/lib/stripe/club-season-provider.server";
import { createClubSeasonOrderStore } from "@/lib/stripe/club-season-order-store.server";
import { authorizeClubSeasonCheckoutCustomer, beginClubSeasonCheckout, handleClubSeasonCheckout } from "@/lib/stripe/club-season-checkout-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleClubSeasonCheckout(request, {
    configured: () => resolveClubSeasonTestConfiguration().ok,
    async authenticate() {
      const client = await createClient();
      if (!client) return null;
      const { data, error } = await client.auth.getUser();
      return authorizeClubSeasonCheckoutCustomer(error ? null : data.user, ownerEmails());
    },
    async begin(ownerId, plan, expectedAmountMinor) {
      const admin = createAdminClient();
      if (!admin) throw new Error("SEASON_STORAGE_UNAVAILABLE");
      return beginClubSeasonCheckout({ ownerId, plan, expectedAmountMinor }, {
        store: createClubSeasonOrderStore(admin), createCheckout: createClubSeasonTestCheckout,
      });
    },
  });
}
