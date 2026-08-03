import ClubOwnerProfileRenderer, {
  type ClubOwnerProfileSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerProfileRenderer";

export default async function DynamicClubOwnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string }>;
  searchParams: ClubOwnerProfileSearchParams;
}) {
  const { owner } = await params;
  return <ClubOwnerProfileRenderer ownerSlug={owner} searchParams={searchParams} />;
}
