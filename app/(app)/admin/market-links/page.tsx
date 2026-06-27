import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";
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

  return (
    <ComingSoon
      eyebrow="Owner Admin / Legacy archive"
      title="Legacy link registry archived"
      description="This old public-link registry remains protected for historical review only. New football data operations now live in the Football Data Center and provider-independent sync layer."
    />
  );
}
