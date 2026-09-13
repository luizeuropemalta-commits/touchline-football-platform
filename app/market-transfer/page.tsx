import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

export const dynamic = "force-dynamic";

type MarketTransferSearchParams = Promise<{
  lang?: string | string[];
}>;

async function marketLocale(searchParams: MarketTransferSearchParams) {
  const params = await searchParams;
  return normalizeTouchLineLocale(Array.isArray(params.lang) ? params.lang[0] : params.lang);
}

export async function generateMetadata({ searchParams }: {
  searchParams: MarketTransferSearchParams;
}): Promise<Metadata> {
  const locale = await marketLocale(searchParams);
  return locale === "pt-BR"
    ? {
        title: "TouchLine Markt · Equipe da rodada",
        description: "Escolha treinador, formação e os 11 cards da sua equipe TouchLine para a rodada.",
      }
    : {
        title: "TouchLine Markt · Gameweek XI",
        description: "Choose the coach, formation and 11 cards for your TouchLine Gameweek team.",
      };
}

export default async function MarketTransferPage({ searchParams }: {
  searchParams: MarketTransferSearchParams;
}) {
  const locale = await marketLocale(searchParams);
  // The embedded Market has no contract-intent consumer. Do not propagate
  // legacy query data into the ClubOwner profile where it could be mistaken
  // for a requested state change.
  const forwarded = new URLSearchParams({ lang: locale, tab: "market" });
  redirect(`/club-owner/me?${forwarded.toString()}#club-owner-market`);
}
