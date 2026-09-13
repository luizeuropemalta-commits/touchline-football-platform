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
        title: "Meu Clube · TouchLine",
        description: "Gerencie seu XI TouchLine por posição.",
      }
    : {
        title: "My Club · TouchLine",
        description: "Manage your TouchLine XI by position.",
      };
}

export default async function MarketTransferPage({ searchParams }: {
  searchParams: MarketTransferSearchParams;
}) {
  const locale = await marketLocale(searchParams);
  // The embedded Market has no contract-intent consumer. Do not propagate
  // legacy query data into My Club where it could be mistaken
  // for a requested state change.
  const forwarded = new URLSearchParams({ lang: locale, tab: "market" });
  redirect(`/my-club?${forwarded.toString()}#my-club-squad`);
}
