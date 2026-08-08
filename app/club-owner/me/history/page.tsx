import {
  redirectTouchlineClubOwnerSelfRoute,
  type ClubOwnerSelfRouteSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerSelfRouteRedirect";

export default async function ClubOwnerSelfHistoryPage({
  searchParams,
}: {
  searchParams: ClubOwnerSelfRouteSearchParams;
}) {
  return redirectTouchlineClubOwnerSelfRoute({ area: "history", searchParams });
}
