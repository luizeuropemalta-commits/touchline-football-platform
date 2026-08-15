import ClubOwnerSubstitutionRenderer, {
  CLUB_OWNER_SUBSTITUTION_METADATA,
} from "@/components/touchline/club-owner/ClubOwnerSubstitutionRenderer";
import { isOwnerEmail } from "@/lib/admin/owner";
import { PUBLIC_CLUB_OWNER_SLUG, resolveTouchlineClubOwnerPageIdentity } from "@/lib/touchlineArena/club-owner-page-identity";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

/**
 * This pathname was historically a public-demo endpoint. It is now a private
 * owner route when the authenticated ClubOwner's canonical slug is
 * `luiz-lopez`; the proxy keeps every other visitor in their own self-scoped
 * flow before this page can render.
 */
export default async function LuizLopezClubOwnerSubstitutionPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const clubOwnerUser = user && !isOwnerEmail(user.email) ? user : null;

  if (!resolveTouchlineClubOwnerPageIdentity(clubOwnerUser, PUBLIC_CLUB_OWNER_SLUG)) notFound();

  const requestedLang = Array.isArray(query.lang) ? query.lang[0] : query.lang;
  const lang = requestedLang === "pt-BR" ? "pt-BR" : "en-GB";

  return <ClubOwnerSubstitutionRenderer lang={lang} />;
}

export const metadata = CLUB_OWNER_SUBSTITUTION_METADATA;
