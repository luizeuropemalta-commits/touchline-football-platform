import type { Metadata } from "next";
import { redirect } from "next/navigation";

import FantasyGameweekClient from "@/app/fantasy/FantasyGameweekClient";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";
import { resolveTouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { loadTouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";

export const dynamic = "force-dynamic";

type MarketTransferSearchParams = Promise<{ lang?: string | string[] }>;

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
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/market-transfer?lang=${locale}`)}`);
  const snapshot = await loadTouchlineFantasySnapshot(user);
  return <main>
    <TouchlineGlobalNavigation locale={locale} currentRoute="market" surface={resolveTouchlineGlobalNavigationSurface({ isAuthenticated: true, isAdmin: isOwnerEmail(user.email) })} />
    <FantasyGameweekClient initialSnapshot={snapshot} locale={locale} />
  </main>;
}
