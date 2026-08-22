import { cookies } from "next/headers";
import { arenaPersistenceKeys } from "@/lib/touchlineArena/arena-persistence-namespace";
import { readAuthoritativeTouchlineRoster } from "@/lib/touchlineArena/authoritative-roster-server";
import { resolveTouchlineServerPageRoster } from "@/lib/touchlineArena/server-page-roster";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTouchLineActiveRanking, loadTouchLinePublishedTopEleven } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineRankedCardCatalog } from "@/lib/touchlineArena/ranked-card-catalog-server";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { compareTouchLineRankedCards } from "@/lib/touchlineArena/ranked-card-catalog";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import { formatTouchlineCommercialCardTotal } from "@/lib/touchlineArena/commercial-card-pricing";
import { resolveTouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import { resolveTouchlineTablesOwnerSummary } from "@/lib/touchlineArena/tables-owner-summary";
import { isOwnerEmail } from "@/lib/admin/owner";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { selectArenaFixtureRound } from "@/lib/touchlineArena/arena-fixture-round";
import TouchLineTablesClient from "./touchline-tables-client";

export const metadata = { title: "TouchLine Tables" };

export default async function TouchLineTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale = normalizeTouchLineLocale(lang);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let authoritativeRoster: Awaited<ReturnType<typeof readAuthoritativeTouchlineRoster>> | null = null;
  if (user && admin) {
    try {
      authoritativeRoster = await readAuthoritativeTouchlineRoster(admin, user.id);
    } catch {
      authoritativeRoster = null;
    }
  }
  const publicRosterCookieValue = user
    ? null
    : (await cookies()).get(arenaPersistenceKeys(
        { kind: "demo", demoId: "public-touchline-tables" },
        "club-owner-roster",
      ).cookieName)?.value;
  const rosterResolution = resolveTouchlineServerPageRoster({
    authenticatedUserId: user?.id,
    authoritativeRoster,
    publicCookieValue: publicRosterCookieValue,
  });
  if (rosterResolution.state === "unavailable") {
    console.error("[TouchLine] Tables roster unavailable", rosterResolution.error);
  }
  const rosterCards = rosterResolution.cards;
  const activeRanking = await loadTouchLineActiveRanking();
  const [publishedTopEleven, publicFixtures, rankedCards, coachRanking] = await Promise.all([
    loadTouchLinePublishedTopEleven(),
    readPublicCompetitionFixtures({ includeHistorical: true, limit: 240 }),
    loadTouchLineRankedCardCatalog(activeRanking),
    loadTouchLineCoachRanking(),
  ]);
  const selectedProviderRound = selectArenaFixtureRound(publicFixtures);
  const providerRoundNames = [...new Set(selectedProviderRound
    .map((fixture) => fixture.roundName?.trim())
    .filter((name): name is string => Boolean(name)))];
  const currentProviderRoundName = providerRoundNames.length === 1 ? providerRoundNames[0] : null;
  const isAuthenticatedClubOwner = Boolean(user && !isOwnerEmail(user.email));
  const ownerSummary = resolveTouchlineTablesOwnerSummary({
    isAuthenticatedClubOwner,
    ownedContractCount: authoritativeRoster?.ok
      ? authoritativeRoster.snapshot.ownedContractCount
      : 0,
    rosterCards,
  });
  // No fabricated owner or player leaderboard may be presented as a published
  // competition ranking. These remain empty until the audited ranking snapshot
  // is loaded through the server-owned publication path.
  const cardClubOwnerRank: never[] = [];
  const touchLineEnglandTable: never[] = [];
  const cardPlayerRank = [...rankedCards].sort(compareTouchLineRankedCards);
  const copy = getTouchLineRankingsCopy(locale);

  return (
    <TouchLineTablesClient
      canEditCardEngine={Boolean(user && isOwnerEmail(user.email))}
      cardClubOwnerRank={cardClubOwnerRank}
      cardPlayerRank={cardPlayerRank}
      coachRanking={coachRanking}
      copy={copy}
      currentProviderRoundName={currentProviderRoundName}
      locale={locale}
      rankMode={copy.marketMode}
      publishedTopEleven={publishedTopEleven}
      navigationSurface={resolveTouchlineGlobalNavigationSurface({
        isAuthenticated: Boolean(user),
        isAdmin: Boolean(user && isOwnerEmail(user.email)),
      })}
      rosterCards={rankedCards}
      totalCards={ownerSummary.cardsTracked}
      totalClubOwners={ownerSummary.clubOwners}
      totalOwnerValue={formatTouchlineCommercialCardTotal({
        numericPrice: ownerSummary.nominalValueGbp,
        competition: "england",
      })}
      touchLineEnglandTable={touchLineEnglandTable}
    />
  );
}
