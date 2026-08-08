import {
  redirectTouchlineClubOwnerSelfRoute,
  type ClubOwnerSelfRouteSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerSelfRouteRedirect";

export default async function ClubOwnerSelfSubstitutionPage({
  searchParams,
}: {
  searchParams: ClubOwnerSelfRouteSearchParams;
}) {
  return redirectTouchlineClubOwnerSelfRoute({ area: "substitution", searchParams });
}
