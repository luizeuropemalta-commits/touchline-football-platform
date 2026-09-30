import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import FantasyGameweekClient from "@/app/fantasy/FantasyGameweekClient";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveTouchlineClubOwnerPageIdentity } from "@/lib/touchlineArena/club-owner-page-identity";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { loadTouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import styles from "./market-game.module.css";

import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

export const dynamic = "force-dynamic";

type MarketTransferSearchParams = Promise<{
  lang?: string | string[];
  club?: string | string[];
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
        title: "Mercado · TouchLine",
        description: "Gerencie seu XI TouchLine por posição.",
      }
    : {
        title: "Market · TouchLine",
        description: "Manage your TouchLine XI by position.",
      };
}

export default async function MarketTransferPage({ searchParams }: {
  searchParams: MarketTransferSearchParams;
}) {
  const locale = await marketLocale(searchParams);
  const params = await searchParams;
  const clubSlug = Array.isArray(params.club) ? params.club[0] : params.club;
  const initialPlayerClubTeamId = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.slug === clubSlug)?.teamId ?? null;
  const destination = `/market-transfer?lang=${encodeURIComponent(locale)}${initialPlayerClubTeamId ? `&club=${encodeURIComponent(clubSlug!)}` : ""}`;
  const supabase = await createClient();
  const user = supabase ? await resolveServerReadWithin(
    supabase.auth.getUser().then(({ data }) => data.user), null, 8_000,
  ) : null;
  if (!user) redirect(touchLineAuthEntryHref("/login", locale, destination));
  // Retain the existing customer-only boundary; never borrow a demo identity.
  if (isOwnerEmail(user.email)) notFound();
  const clubOwner = resolveTouchlineClubOwnerPageIdentity(user);
  const snapshot = await resolveServerReadWithin(loadTouchlineFantasySnapshot(user), null, 8_000);
  const pt = locale === "pt-BR";
  return <main className={styles.page}>
    <div className={styles.content}>
      <TouchlineGlobalNavigation locale={locale} currentRoute="market" surface="authenticated" />
      <header className={styles.heading}><div><span>TOUCHLINE</span><h1>{pt ? "Mercado" : "Market"}</h1><p>{pt ? "Seu XI. Seu treinador. Seu jogo." : "Your XI. Your coach. Your game."}</p></div><Link href={`/intro?lang=${encodeURIComponent(locale)}&intro=first`}>{pt ? "Ver intro" : "Watch intro"}</Link></header>
      <FantasyGameweekClient initialSnapshot={snapshot} locale={locale} embedded marketPage initialPlayerClubTeamId={initialPlayerClubTeamId} clubOwner={clubOwner ? { name: clubOwner.name, avatarUrl: clubOwner.avatarUrl } : undefined} />
    </div>
  </main>;
}
