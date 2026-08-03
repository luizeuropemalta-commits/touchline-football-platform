import type { Metadata } from "next";

import ClubOwnerSeasonHistoryRenderer, {
  type ClubOwnerSeasonHistorySearchParams,
} from "@/components/touchline/club-owner/ClubOwnerSeasonHistoryRenderer";

export const metadata: Metadata = {
  title: "Histórico de Temporadas | TouchLine ClubOwner",
  description: "Histórico oficial pós-temporada do ClubOwner da TouchLine.",
};

export default async function ClubOwnerHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string }>;
  searchParams: ClubOwnerSeasonHistorySearchParams;
}) {
  const { owner } = await params;
  return <ClubOwnerSeasonHistoryRenderer ownerSlug={owner} searchParams={searchParams} />;
}
