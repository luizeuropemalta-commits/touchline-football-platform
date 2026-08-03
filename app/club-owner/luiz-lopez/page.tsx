import ClubOwnerProfileRenderer, {
  type ClubOwnerProfileSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerProfileRenderer";
import { PUBLIC_CLUB_OWNER_SLUG } from "@/lib/touchlineArena/club-owner-page-identity";

export default function LuizLopezClubOwnerPage({
  searchParams,
}: {
  searchParams: ClubOwnerProfileSearchParams;
}) {
  return (
    <ClubOwnerProfileRenderer
      ownerSlug={PUBLIC_CLUB_OWNER_SLUG}
      searchParams={searchParams}
    />
  );
}
