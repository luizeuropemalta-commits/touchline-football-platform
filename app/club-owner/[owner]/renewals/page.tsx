import type { Metadata } from "next";

import ClubOwnerRenewalCenterRenderer, {
  type ClubOwnerRenewalSearchParams,
} from "@/components/touchline/club-owner/ClubOwnerRenewalCenterRenderer";

export const metadata: Metadata = {
  title: "Central de Renovações | TouchLine ClubOwner",
  description: "Cotações sazonais verificadas para o ClubOwner da TouchLine.",
};

export default async function ClubOwnerRenewalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string }>;
  searchParams: ClubOwnerRenewalSearchParams;
}) {
  const { owner } = await params;
  return <ClubOwnerRenewalCenterRenderer ownerSlug={owner} searchParams={searchParams} />;
}
