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
import { TouchlineCardLeadershipProvider } from "@/components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "@/lib/touchlineArena/card-leadership-authority";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import styles from "./touchline-tables.module.css";

export const metadata = { title: "TouchLine Tables" };

function readSportingData(rankingPromise: ReturnType<typeof loadTouchLineActiveRanking>) {
  return Promise.all([
    rankingPromise,
    rankingPromise.then((activeRanking) => loadTouchLinePublishedTopEleven(activeRanking)),
    rankingPromise.then((activeRanking) => loadTouchLineRankedCardCatalog(activeRanking)),
    loadTouchLineCoachRanking(),
    countTouchlinePublishedPlayerCards(),
  ]);
}

async function RoundBadge({ fixtures, locale }: { fixtures: ReturnType<typeof readPublicCompetitionFixtures>; locale: string }) {
  const names = [...new Set(selectArenaFixtureRound(await fixtures).map(fixture => fixture.roundName?.trim()).filter((name): name is string => Boolean(name)))];
  const round = names.length === 1 ? names[0] : null;
  return <span className={styles.status}><ShieldCheck aria-hidden="true" size={18} />
    {round ? `${locale === "pt-BR" ? "Rodada" : "Matchweek"} ${round}` : locale === "pt-BR" ? "Rodada aguardando provider" : "Matchweek awaiting provider"}
  </span>;
}

async function SportingContent({ data, locale, user }: {
  data: ReturnType<typeof readSportingData>;
  locale: ReturnType<typeof normalizeTouchLineLocale>;
  user: { email?: string | null } | null;
}) {
  const [activeRanking, publishedTopEleven, rankedCards, coachRanking, publishedCardCount] = await data;
  // No fabricated ClubOwner table may be presented as a published competition
  // ranking. It remains empty until its audited sporting snapshot is available.
  const touchLineEnglandTable: never[] = [];
  const copy = getTouchLineRankingsCopy(locale);

  return (
    <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(activeRanking, coachRanking)}>
      <TouchlineLivePresentationRefresh
        initialCoachRankingSnapshotId={coachRanking.snapshotId}
        initialPlayerRankingSnapshotId={activeRanking.snapshotId}
      />
      <TouchLineTablesClient
      canEditCardEngine={Boolean(user && isOwnerEmail(user.email))}
      coachRanking={coachRanking}
      copy={copy}
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
    </TouchlineCardLeadershipProvider>
  );
}

export default async function TouchLineTablesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const locale = normalizeTouchLineLocale(lang);
  const ranking = loadTouchLineActiveRanking();
  const fixtures = readPublicCompetitionFixtures({ includeHistorical: true, limit: 240 });
  // The schedule belongs only to RoundBadge. Observe failures before auth
  // completes while retaining the original rejection for that boundary.
  void fixtures.catch(() => undefined);
  const data = readSportingData(ranking);
  // Observe early failures while auth is pending; the original promise still
  // rejects at the sporting boundary rather than inventing empty standings.
  void data.catch(() => undefined);
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const pending = locale === "pt-BR" ? "Carregando classificações…" : "Loading rankings…";
  const navigationSurface = resolveTouchlineGlobalNavigationSurface({ isAuthenticated: Boolean(user), isAdmin: Boolean(user && isOwnerEmail(user.email)) });
  return <main className={styles.page}>
    <header className={styles.topbar}>
      <TouchlineGlobalNavigation locale={locale} currentRoute="rankings" surface={navigationSurface} className={styles.globalNavigation} />
      <Suspense fallback={<span className={styles.status} role="status">{locale === "pt-BR" ? "Carregando rodada…" : "Loading matchweek…"}</span>}>
        <RoundBadge fixtures={fixtures} locale={locale} />
      </Suspense>
    </header>
    <Suspense fallback={<p role="status">{pending}</p>}>
      <SportingContent data={data} locale={locale} user={user} />
    </Suspense>
  </main>;
}
