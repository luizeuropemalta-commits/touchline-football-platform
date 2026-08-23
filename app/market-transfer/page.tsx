import ArenaClient from "@/app/arena/ArenaClient";
import type { Metadata } from "next";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchLineMarketCopy } from "@/lib/touchlineArena/market-i18n";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { readTouchlineFormationGeometryRegistry } from "@/lib/touchlineArena/formation-geometry-server";

type MarketTransferPageProps = {
  searchParams: Promise<{
    lang?: string | string[];
    contractPlayer?: string | string[];
    contractName?: string | string[];
    contractClub?: string | string[];
  }>;
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ searchParams }: MarketTransferPageProps): Promise<Metadata> {
  const params = await searchParams;
  const locale = normalizeTouchLineLocale(firstValue(params.lang));
  const copy = getTouchLineMarketCopy(locale);

  return {
    title: copy.fullProductName,
    description: copy.metadataDescription,
  };
}

export default async function MarketTransferPage({ searchParams }: MarketTransferPageProps) {
  const params = await searchParams;
  const locale = normalizeTouchLineLocale(firstValue(params.lang));
  const [supabase, initialTwoDimensionalFormationRegistry] = await Promise.all([
    createClient(),
    readTouchlineFormationGeometryRegistry(),
  ]);
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  return (
    <ArenaClient
      standaloneMarket
      initialPanel="market"
      initialIntroIntent="skip"
      initialLocale={locale}
      initialContractPlayerId={firstValue(params.contractPlayer)}
      initialContractPlayerName={firstValue(params.contractName)}
      initialContractClubId={firstValue(params.contractClub)}
      canEditCardEngine={Boolean(user && isOwnerEmail(user.email))}
      initialTwoDimensionalFormationRegistry={initialTwoDimensionalFormationRegistry}
    />
  );
}
