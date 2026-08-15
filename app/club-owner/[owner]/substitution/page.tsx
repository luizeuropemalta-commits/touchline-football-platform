import ClubOwnerSubstitutionRenderer, {
  CLUB_OWNER_SUBSTITUTION_METADATA,
} from "@/components/touchline/club-owner/ClubOwnerSubstitutionRenderer";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveTouchlineClubOwnerPageIdentity } from "@/lib/touchlineArena/club-owner-page-identity";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function DynamicClubOwnerSubstitutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { owner } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const clubOwnerUser = user && !isOwnerEmail(user.email) ? user : null;

  // The substitution surface may show the isolated public ClubOwner demo, or
  // the signed-in ClubOwner's own squad. It must never make an arbitrary slug
  // resolve to either one of those identities.
  if (!resolveTouchlineClubOwnerPageIdentity(clubOwnerUser, owner)) notFound();

  const requestedLang = Array.isArray(query.lang) ? query.lang[0] : query.lang;
  const lang = requestedLang === "pt-BR" ? "pt-BR" : "en-GB";

  return <ClubOwnerSubstitutionRenderer lang={lang} />;
}

export const metadata = CLUB_OWNER_SUBSTITUTION_METADATA;
