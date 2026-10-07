import type { Metadata } from "next";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { notFound, redirect } from "next/navigation";
import ClubOwnerMarketHeader from "@/components/touchline/ClubOwnerMarketHeader";
import TouchlineBrandHeader from "@/components/touchline/TouchlineBrandHeader";
import FantasyGameweekClient from "@/app/fantasy/FantasyGameweekClient";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlineMarketNotifications from "@/components/touchline/notifications/TouchlineMarketNotifications";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveTouchlineClubOwnerPageIdentity } from "@/lib/touchlineArena/club-owner-page-identity";
import { createClubOwnerAvatarContextReader } from "@/lib/touchlineArena/club-owner-avatar-context-server";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { loadTouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import styles from "./market-game.module.css";

import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineFantasyMarketWorkflowCopy } from "@/lib/touchlineFantasy/market-workflow-i18n";

export const dynamic = "force-dynamic";
type MarketTransferSearchParams = Promise<{
  lang?: string | string[];
  club?: string | string[];
}>;

type ClubOwnerPageProps = { searchParams: MarketTransferSearchParams };

async function marketLocale(searchParams: MarketTransferSearchParams, draftLocalesEnabled = false) {
  const params = await searchParams;
  return resolveTouchlineCatalogueLocale(Array.isArray(params.lang) ? params.lang[0] : params.lang, draftLocalesEnabled);
}

export async function generateMetadata(props: ClubOwnerPageProps): Promise<Metadata> {
  return generateClubOwnerMetadata(props, isTouchLineSiteLocalesEnabled("/clubowner"));
}

async function generateClubOwnerMetadata({ searchParams }: ClubOwnerPageProps, draftLocalesEnabled = false): Promise<Metadata> {
  const locale = await marketLocale(searchParams, draftLocalesEnabled);
  return {
    title: "ClubOwner · TouchLine",
    description: getTouchlineFantasyMarketWorkflowCopy(locale, draftLocalesEnabled).metadataDescription,
  };
}

export default async function MarketTransferPage(props: ClubOwnerPageProps) {
  // Keep public presentation gated until the complete dependency chain and visual QA pass.
  return renderClubOwnerPage(props, isTouchLineSiteLocalesEnabled("/clubowner"));
}

async function renderClubOwnerPage({ searchParams }: ClubOwnerPageProps, draftLocalesEnabled = false) {
  const locale = await marketLocale(searchParams, draftLocalesEnabled);
  const params = await searchParams;
  const clubSlug = Array.isArray(params.club) ? params.club[0] : params.club;
  const initialPlayerClubTeamId = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.slug === clubSlug)?.teamId ?? null;
  const destination = `/clubowner?lang=${encodeURIComponent(locale)}${initialPlayerClubTeamId ? `&club=${encodeURIComponent(clubSlug!)}` : ""}`;
  const readAvatarContext = createClubOwnerAvatarContextReader();
  const supabase = await createClient();
  const authentication = supabase ? await resolveServerReadWithin(
    supabase.auth.getUser(), null, 8_000,
  ) : null;
  const user = authentication?.error === null ? authentication.data?.user ?? null : null;
  if (!user) redirect(touchLineAuthEntryHref("/login", locale, destination, draftLocalesEnabled));
  // Retain the existing customer-only boundary; never borrow a demo identity.
  if (isOwnerEmail(user.email)) notFound();
  const [avatarContext, snapshot] = await Promise.all([
    readAvatarContext(authentication, user.id),
    resolveServerReadWithin(loadTouchlineFantasySnapshot(user), null, 8_000),
  ]);
  const clubOwner = resolveTouchlineClubOwnerPageIdentity(user, undefined, avatarContext?.avatarUrl);
  return <main className={styles.page} dir={draftLocalesEnabled ? "ltr" : undefined}>
    <TouchlineBrandHeader href={destination} locale={locale} accountLocaleContext={{ mode: "account", accountId: user.id }} draftLocalesEnabled={draftLocalesEnabled} />
    <div className={styles.content}>
      <TouchlineGlobalNavigation locale={locale} draftLocalesEnabled={draftLocalesEnabled} currentRoute="market" surface="authenticated" showAudioControl={false} />
      <ClubOwnerMarketHeader owner={clubOwner?.isAuthenticatedClubOwner ? clubOwner : null} locale={locale} draftLocalesEnabled={draftLocalesEnabled} accountId={user.id} avatarContext={avatarContext} />
      <TouchlineMarketNotifications locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
      <FantasyGameweekClient initialSnapshot={snapshot} locale={locale} draftLocalesEnabled={draftLocalesEnabled} embedded marketPage initialPlayerClubTeamId={initialPlayerClubTeamId} clubOwner={clubOwner ? { name: clubOwner.name, avatarUrl: clubOwner.avatarUrl } : undefined} />
    </div>
  </main>;
}
