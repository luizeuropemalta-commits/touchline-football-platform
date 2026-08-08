import {
  redirectTouchlineClubOwnerSelfRoute,
  type ClubOwnerSelfRouteSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerSelfRouteRedirect";

export default async function ClubOwnerSelfProfilePage({
  searchParams,
}: {
  searchParams: ClubOwnerSelfRouteSearchParams;
}) {
  return redirectTouchlineClubOwnerSelfRoute({ area: "profile", searchParams });
}
