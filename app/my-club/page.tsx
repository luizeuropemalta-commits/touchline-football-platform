import type { Metadata } from "next";

import ClubOwnerProfileRenderer, {
  type ClubOwnerProfileSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerProfileRenderer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Club | TouchLine England",
  description: "Manage your TouchLine squad by position.",
};

/**
 * The canonical customer route. The component keeps the existing secure
 * `club_owner` authorization adapter internal while rendering only My Club.
 */
export default function MyClubPage({ searchParams }: {
  searchParams: ClubOwnerProfileSearchParams;
}) {
  return <ClubOwnerProfileRenderer searchParams={searchParams} />;
}
