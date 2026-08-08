import {
  redirectTouchlineClubOwnerSelfRoute,
  type ClubOwnerSelfRouteSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerSelfRouteRedirect";

export default async function ClubOwnerSelfRenewalsPage({
  searchParams,
}: {
  searchParams: ClubOwnerSelfRouteSearchParams;
}) {
  return redirectTouchlineClubOwnerSelfRoute({ area: "renewals", searchParams });
}
