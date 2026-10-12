import type { Metadata } from "next";
import { headers } from "next/headers";
import { normalizeTouchlineMatchCentreTimeZone } from "@/lib/touchlineArena/match-centre";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { notFound, redirect } from "next/navigation";
import ClubOwnerMarketHeader from "@/components/touchline/ClubOwnerMarketHeader";
import { clubOwnerRankingPoints, clubOwnerRankingPosition } from "@/lib/touchlineArena/club-owner-profile-metrics";
import TouchlineBrandHeader from "@/components/touchline/TouchlineBrandHeader";
import FantasyGameweekClient from "@/app/fantasy/FantasyGameweekClient";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { resolveTouchlineClubOwnerPageIdentity } from "@/lib/touchlineArena/club-owner-page-identity";
import { createClubOwnerAvatarContextReader } from "@/lib/touchlineArena/club-owner-avatar-context-server";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { toTouchlineLiveFixtures } from "@/lib/touchlineArena/stadium-catalog";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { resolveServerReadWithin } from "@/lib/touchlineArena/server-read-deadline";
import { loadTouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import { isTouchlineFantasyMarketAccess } from "@/lib/touchlineFantasy/market-plan-policy";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import styles from "./market-game.module.css";

import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineFantasyMarketWorkflowCopy } from "@/lib/touchlineFantasy/market-workflow-i18n";

export const dynamic = "force-dynamic";
type MarketTransferSearchParams = Promise<{
  lang?: string | string[];
  club?: string | string[];
  planPreview?: string | string[];
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
  const planPreviewValue = Array.isArray(params.planPreview) ? params.planPreview[0] : params.planPreview;
  const planPreview = process.env.NODE_ENV === "development" && (planPreviewValue === "pro" || planPreviewValue === "standard")
    ? planPreviewValue : null;
  const initialPlayerClubTeamId = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.slug === clubSlug)?.teamId ?? null;
  const destination = `/clubowner?lang=${encodeURIComponent(locale)}${initialPlayerClubTeamId ? `&club=${encodeURIComponent(clubSlug!)}` : ""}${planPreview ? `&planPreview=${planPreview}` : ""}`;
  // Operator-verified hosted retention is independent of auth/schema presence.
  // These private QA capabilities remain OFF unless explicitly configured.
  const avatarSelectionEnabled = process.env.TOUCHLINE_CLUB_OWNER_AVATAR_SELECTION_ENABLED === "true";
  const retentionReady = process.env.TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY === "true";
  const readAvatarContext = createClubOwnerAvatarContextReader();
  const supabase = await createClient();
  const authentication = supabase ? await resolveServerReadWithin(
    supabase.auth.getUser(), null, 8_000,
  ) : null;
  const user = authentication?.error === null ? authentication.data?.user ?? null : null;
  if (!user) redirect(touchLineAuthEntryHref("/login", locale, destination, draftLocalesEnabled));
  // Retain the existing customer-only boundary; never borrow a demo identity.
  if (isOwnerEmail(user.email)) notFound();
  const scheduleNow = Date.now();
  const [avatarContext, snapshot, persistedFixtures] = await Promise.all([
    readAvatarContext(authentication, user.id),
    resolveServerReadWithin(loadTouchlineFantasySnapshot(user), null, 8_000),
    resolveServerReadWithin(readPublicCompetitionFixtures({
      includeHistorical: true, limit: 240,
      from: new Date(scheduleNow - 7 * 86_400_000).toISOString(),
      through: new Date(scheduleNow + 14 * 86_400_000).toISOString(),
    }), [], 8_000),
  ]);
  const clubOwner = resolveTouchlineClubOwnerPageIdentity(user, undefined, avatarContext?.avatarUrl);
  const liveTimeZone = normalizeTouchlineMatchCentreTimeZone((await headers()).get("x-vercel-ip-timezone"));
  const initialLiveFixtures = toTouchlineLiveFixtures(persistedFixtures);
  const initialLiveNow = Date.now();
  const marketAccess = snapshot && isTouchlineFantasyMarketAccess(snapshot.marketAccess) ? snapshot.marketAccess : null;
  const activePlanKey = snapshot?.entitlementActive === true && snapshot?.plan?.active === true
    ? marketAccess?.planKey ?? null : null;
  const realUnlimited = snapshot?.entitlementActive === true && marketAccess?.planKey === "vip";
  const remainingMarketPower = snapshot?.entitlementActive === true && typeof marketAccess?.budgetEur === "number"
    ? Math.max(0, marketAccess.budgetEur - (snapshot.userGameweek?.totalMarketValueEur ?? 0)) : null;
  return <main className={styles.page} dir={draftLocalesEnabled ? "ltr" : undefined}>
    <TouchlineBrandHeader href={destination} locale={locale} accountLocaleContext={{ mode: "account", accountId: user.id }} draftLocalesEnabled={draftLocalesEnabled} navigation={<TouchlineGlobalNavigation locale={locale} draftLocalesEnabled={draftLocalesEnabled} currentRoute="market" surface="authenticated" showAudioControl={false} />} />
    <div className={styles.content}>
      <ClubOwnerMarketHeader owner={clubOwner?.isAuthenticatedClubOwner ? clubOwner : null} locale={locale} rankingPoints={clubOwnerRankingPoints(snapshot?.seasonRanking)} rankingPosition={clubOwnerRankingPosition(snapshot?.seasonRanking)} remainingMarketPower={remainingMarketPower} realUnlimited={realUnlimited} plan={snapshot?.plan ?? null} activePlanKey={activePlanKey} activePlanBudget={activePlanKey ? marketAccess?.budgetEur : undefined} planPreview={planPreview} draftLocalesEnabled={draftLocalesEnabled} accountId={user.id} avatarContext={avatarContext} avatarSelectionEnabled={avatarSelectionEnabled} retentionReady={retentionReady} />
      <FantasyGameweekClient initialSnapshot={snapshot} locale={locale} liveTimeZone={liveTimeZone} draftLocalesEnabled={draftLocalesEnabled} embedded marketPage initialLiveFixtures={initialLiveFixtures} initialLiveNow={initialLiveNow} initialPlayerClubTeamId={initialPlayerClubTeamId} clubOwner={clubOwner ? { name: clubOwner.name, avatarUrl: clubOwner.avatarUrl } : undefined} />
    </div>
  </main>;
}
