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
import TouchLineTablesClient, { TouchlineCoachRankingTable, TouchlineRankingPodium, TouchlineRankingPodiumPending, TouchlineRankingEnding, TouchlineRankingsHero, TouchlineFeaturedCoach } from "./touchline-tables-client";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import { TouchlineCardLeadershipProvider } from "@/components/touchline/cards/TouchlineCardLeadershipProvider";
import { buildTouchlineCardLeadershipValue } from "@/lib/touchlineArena/card-leadership-authority";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import styles from "./touchline-tables.module.css";
import { createRankingLoadDiagnostics } from "@/lib/touchlineArena/ranking-load-diagnostics";
import { projectTouchlineRankingsHighlights } from "@/lib/touchlineArena/rankings-highlight-projection";

export const metadata = { title: "TouchLine Tables" };

function readSportingData(rankingPromise: ReturnType<typeof loadTouchLineActiveRanking>, diagnostics: ReturnType<typeof createRankingLoadDiagnostics>) {
  const topXI = diagnostics.measure("topXI", () => rankingPromise.then((activeRanking) => loadTouchLinePublishedTopEleven(activeRanking)));
  const catalog = diagnostics.measure("catalog", () => rankingPromise.then((activeRanking) => loadTouchLineRankedCardCatalog(activeRanking)));
  const coach = diagnostics.measure("coach", () => loadTouchLineCoachRanking());
  const count = diagnostics.measure("count", () => countTouchlinePublishedPlayerCards());
  const complete = Promise.all([
    rankingPromise,
    topXI, catalog, coach, count,
  ]);
  const leadership = Promise.all([rankingPromise, coach]);
  void leadership.catch(() => undefined);
  const highlights = complete.then(([, selection, cards]) => projectTouchlineRankingsHighlights(cards, selection));
  void highlights.catch(() => undefined);
  return { complete, leadership, highlights };
}

async function RoundBadge({ fixtures, locale }: { fixtures: ReturnType<typeof readPublicCompetitionFixtures>; locale: string }) {
  const names = [...new Set(selectArenaFixtureRound(await fixtures).map(fixture => fixture.roundName?.trim()).filter((name): name is string => Boolean(name)))];
  const round = names.length === 1 ? names[0] : null;
  return <span className={styles.status}><ShieldCheck aria-hidden="true" size={18} />
    {round ? `${locale === "pt-BR" ? "Rodada" : "Matchweek"} ${round}` : locale === "pt-BR" ? "Rodada aguardando provider" : "Matchweek awaiting provider"}
  </span>;
}

async function SportingContent({ data, locale, user, section }: {
  data: ReturnType<typeof readSportingData>;
  locale: ReturnType<typeof normalizeTouchLineLocale>;
  user: { email?: string | null } | null;
  section: "overview" | "hero" | "podium" | "ending";
}) {
  const [activeRanking, , rankedCards, , publishedCardCount] = await data.complete;
  // No fabricated ClubOwner table may be presented as a published competition
  // ranking. It remains empty until its audited sporting snapshot is available.
  const touchLineEnglandTable: never[] = [];
  const copy = getTouchLineRankingsCopy(locale);
  if (section === "ending") return <TouchlineRankingEnding copy={copy} locale={locale} touchLineEnglandTable={touchLineEnglandTable} />;
  if (section === "hero") return <TouchlineRankingsHero copy={copy} rankMode={activeRanking.phase === "ranked" ? copy.pointsMode : copy.marketMode} totalPublishedCards={publishedCardCount} totalRankedCards={rankedCards.length} />;
  const highlights = await data.highlights;
  if (section === "podium") return <TouchlineRankingPodium copy={copy} locale={locale} highlights={highlights} canEditCardEngine={Boolean(user && isOwnerEmail(user.email))} />;

  return (
      <TouchLineTablesClient
      canEditCardEngine={Boolean(user && isOwnerEmail(user.email))}
      copy={copy}
      locale={locale}
      highlights={highlights}
      />
  );
}

function BestXiPending({ locale }: { locale: ReturnType<typeof normalizeTouchLineLocale> }) {
  const copy = getTouchLineRankingsCopy(locale);
  const pending = locale === "pt-BR" ? "Carregando classificações…" : "Loading rankings…";
  return <div className={styles.bestXiPanel} aria-busy="true"><div className={styles.sectionHeading}><div><p>{copy.touchLineXi}</p><h2>{copy.seasonSelection}</h2></div><span>{copy.seasonSelectionRule}</span></div><div className={styles.pitch} role="status">{pending}</div><p className={styles.pitchHint}>{copy.seasonSelectionHint}</p></div>;
}

async function SportingFrame({ data, locale, user }: {
  data: ReturnType<typeof readSportingData>;
  locale: ReturnType<typeof normalizeTouchLineLocale>;
  user: { email?: string | null } | null;
}) {
  // Leadership is fixed once for every card; the catalogue cannot gate this frame.
  const [activeRanking, coachRanking] = await data.leadership;
  const copy = getTouchLineRankingsCopy(locale);
  return <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(activeRanking, coachRanking)}>
    <TouchlineLivePresentationRefresh initialCoachRankingSnapshotId={coachRanking.snapshotId} initialPlayerRankingSnapshotId={activeRanking.snapshotId} />
    <Suspense fallback={<TouchlineRankingsHero copy={copy} rankMode={activeRanking.phase === "ranked" ? copy.pointsMode : copy.marketMode} totalPublishedCards={null} totalRankedCards={null} />}><SportingContent data={data} locale={locale} user={user} section="hero" /></Suspense>
    <section className={styles.selectionSection} id="best-xi"><div className={styles.rankStage}>
      <Suspense fallback={<BestXiPending locale={locale} />}><SportingContent data={data} locale={locale} user={user} section="overview" /></Suspense>
      <TouchlineFeaturedCoach coachRanking={coachRanking} copy={copy} locale={locale} />
    </div></section>
    <section className={styles.rankingHighlights} aria-label={locale === "pt-BR" ? "Destaques da temporada" : "Season highlights"}>
      <Suspense fallback={<TouchlineRankingPodiumPending locale={locale} />}><SportingContent data={data} locale={locale} user={user} section="podium" /></Suspense>
      <TouchlineCoachRankingTable coachRanking={coachRanking} copy={copy} locale={locale} />
    </section>
    <Suspense fallback={null}><SportingContent data={data} locale={locale} user={user} section="ending" /></Suspense>
  </TouchlineCardLeadershipProvider>;
}

export default async function TouchLineTablesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const locale = normalizeTouchLineLocale(lang);
  const diagnostics = createRankingLoadDiagnostics();
  const ranking = diagnostics.measure("activeRanking", () => loadTouchLineActiveRanking());
  const fixtures = diagnostics.measure("fixtures", () => readPublicCompetitionFixtures({ includeHistorical: true, limit: 240 }));
  // The schedule belongs only to RoundBadge. Observe failures before auth
  // completes while retaining the original rejection for that boundary.
  void fixtures.catch(() => undefined);
  const data = readSportingData(ranking, diagnostics);
  // Observe early failures while auth is pending; the original promise still
  // rejects at the sporting boundary rather than inventing empty standings.
  void data.complete.catch(() => undefined);
  const authentication = diagnostics.measure("auth", async () => {
    const supabase = await createClient();
    return supabase ? await supabase.auth.getUser() : { data: { user: null } };
  });
  diagnostics.seal();
  const { data: { user } } = await authentication;
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
      <SportingFrame data={data} locale={locale} user={user} />
    </Suspense>
  </main>;
}
