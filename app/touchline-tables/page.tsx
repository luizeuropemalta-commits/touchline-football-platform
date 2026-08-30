import { createClient } from "@/lib/supabase/server";
import { loadTouchLineActiveRanking, loadTouchLinePublishedTopEleven } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineRankedCardCatalog } from "@/lib/touchlineArena/ranked-card-catalog-server";
import { countTouchlinePublishedPlayerCards } from "@/lib/touchlineArena/card-publication-read-model";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import { resolveTouchlineGlobalNavigationSurface } from "@/lib/touchlineArena/global-navigation";
import { isOwnerEmail } from "@/lib/admin/owner";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { selectArenaFixtureRound } from "@/lib/touchlineArena/arena-fixture-round";
import TouchLineTablesClient from "./touchline-tables-client";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";

export const metadata = { title: "TouchLine Tables" };

export default async function TouchLineTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale = normalizeTouchLineLocale(lang);
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const activeRanking = await loadTouchLineActiveRanking();
  const [publishedTopEleven, publicFixtures, rankedCards, coachRanking, publishedCardCount] = await Promise.all([
    loadTouchLinePublishedTopEleven(),
    readPublicCompetitionFixtures({ includeHistorical: true, limit: 240 }),
    loadTouchLineRankedCardCatalog(activeRanking),
    loadTouchLineCoachRanking(),
    countTouchlinePublishedPlayerCards(),
  ]);
  const selectedProviderRound = selectArenaFixtureRound(publicFixtures);
  const providerRoundNames = [...new Set(selectedProviderRound
    .map((fixture) => fixture.roundName?.trim())
    .filter((name): name is string => Boolean(name)))];
  const currentProviderRoundName = providerRoundNames.length === 1 ? providerRoundNames[0] : null;
  // No fabricated ClubOwner table may be presented as a published competition
  // ranking. It remains empty until its audited sporting snapshot is available.
  const touchLineEnglandTable: never[] = [];
  const copy = getTouchLineRankingsCopy(locale);

  return (
    <>
      <TouchlineLivePresentationRefresh
        initialCoachRankingSnapshotId={coachRanking.snapshotId}
        initialPlayerRankingSnapshotId={activeRanking.snapshotId}
      />
      <TouchLineTablesClient
      canEditCardEngine={Boolean(user && isOwnerEmail(user.email))}
      coachRanking={coachRanking}
      copy={copy}
      currentProviderRoundName={currentProviderRoundName}
      locale={locale}
      rankMode={activeRanking.phase === "ranked" ? copy.pointsMode : copy.marketMode}
      publishedTopEleven={publishedTopEleven}
      navigationSurface={resolveTouchlineGlobalNavigationSurface({
        isAuthenticated: Boolean(user),
        isAdmin: Boolean(user && isOwnerEmail(user.email)),
      })}
      rosterCards={rankedCards}
      totalPublishedCards={publishedCardCount}
      totalRankedCards={rankedCards.length}
      touchLineEnglandTable={touchLineEnglandTable}
      />
    </>
  );
}
