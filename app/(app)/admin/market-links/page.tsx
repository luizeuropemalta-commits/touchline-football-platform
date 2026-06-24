import { notFound } from "next/navigation";
import { MarketLinkRegistryAdmin } from "@/components/market-link-registry-admin";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MarketLinkRegistryPage() {
  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isOwnerEmail(user.email)) notFound();

  return <MarketLinkRegistryAdmin />;
}
