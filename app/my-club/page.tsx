import type { Metadata } from "next";

import { redirect } from "next/navigation";
import type { ClubOwnerProfileSearchParams } from "@/components/touchline/club-owner/ClubOwnerProfileRenderer";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Club | TouchLine England",
  description: "Manage your TouchLine squad by position.",
};

/**
 * The canonical customer route. The component keeps the existing secure
 * `club_owner` authorization adapter internal while rendering only My Club.
 */
export default async function MyClubPage({ searchParams }: {
  searchParams: ClubOwnerProfileSearchParams;
}) {
  const params = await searchParams;
  const forwarded = new URLSearchParams({ lang: normalizeTouchLineLocale(params.lang) });
  if (params.club) forwarded.set("club", params.club);
  redirect(`/market-transfer?${forwarded.toString()}`);
}
