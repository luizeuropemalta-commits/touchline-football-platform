import { CLUB_OWNER_SUBSTITUTION_METADATA } from "@/components/touchline/club-owner/ClubOwnerSubstitutionRenderer";
import {
  redirectTouchlineClubOwnerSelfRoute,
  type ClubOwnerSelfRouteSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerSelfRouteRedirect";

/**
 * Retired public-demo endpoint. When this legacy URL reaches the route, it
 * enters the authenticated self flow; the proxy blocks a foreign explicit
 * owner URL before streaming any ClubOwner surface.
 */
export default async function TouchLineSubstitutionPage({
  searchParams,
}: {
  searchParams: ClubOwnerSelfRouteSearchParams;
}) {
  return redirectTouchlineClubOwnerSelfRoute({ area: "substitution", searchParams });
}

export const metadata = CLUB_OWNER_SUBSTITUTION_METADATA;
