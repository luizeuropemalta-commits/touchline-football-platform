import { createClient } from "@/lib/supabase/server";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { loadTouchLineActiveRanking, loadTouchLinePublishedTopEleven } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineRankedCardCatalog } from "@/lib/touchlineArena/ranked-card-catalog-server";
import { countTouchlinePublishedPlayerCards } from "@/lib/touchlineArena/card-publication-read-model";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import TouchlineBrandHeader from "@/components/touchline/TouchlineBrandHeader";
import type { AccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import { getTouchlineTablesPresentationCopy } from "@/lib/touchlineArena/tables-presentation-i18n";
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

export async function generateMetadata(props: RankingsPageProps) {
  return generateRankingsMetadata(props, isTouchLineSiteLocalesEnabled("/rankings"));
}

async function generateRankingsMetadata({ searchParams }: RankingsPageProps, draftLocalesEnabled = false) {
  if (!draftLocalesEnabled) return { title: "TouchLine Rankings" };
  const { lang } = await searchParams;
  const locale = resolveTouchlineCatalogueLocale(lang, draftLocalesEnabled);
  const copy = getTouchLineRankingsCopy(locale, draftLocalesEnabled);
  return { title: copy.tablesTitle, description: copy.tablesDescription };
}

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

async function RoundBadge({ fixtures, locale, draftLocalesEnabled = false }: { fixtures: ReturnType<typeof readPublicCompetitionFixtures>; locale: string; draftLocalesEnabled?: boolean }) {
  const presentationCopy = getTouchlineTablesPresentationCopy(locale, draftLocalesEnabled);
  const names = [...new Set(selectArenaFixtureRound(await fixtures).map(fixture => fixture.roundName?.trim()).filter((name): name is string => Boolean(name)))];
  const round = names.length === 1 ? names[0] : null;
  return <span className={styles.status}><ShieldCheck aria-hidden="true" size={18} />
    {round ? `${presentationCopy.matchweek} ${round}` : presentationCopy.matchweekPending}
  </span>;
}

async function SportingContent({ data, locale, user, section, draftLocalesEnabled = false }: {
  data: ReturnType<typeof readSportingData>;
  locale: ReturnType<typeof normalizeTouchLineLocale>;
  user: { email?: string | null } | null;
  section: "overview" | "hero" | "podium" | "ending";
  draftLocalesEnabled?: boolean;
}) {
  const [activeRanking, , rankedCards, , publishedCardCount] = await data.complete;
  // No fabricated ClubOwner table may be presented as a published competition
  // ranking. It remains empty until its audited sporting snapshot is available.
  const touchLineEnglandTable: never[] = [];
  const copy = getTouchLineRankingsCopy(locale, draftLocalesEnabled);
  if (section === "ending") return <TouchlineRankingEnding draftLocalesEnabled={draftLocalesEnabled} copy={copy} locale={locale} touchLineEnglandTable={touchLineEnglandTable} />;
  if (section === "hero") return <TouchlineRankingsHero copy={copy} rankMode={activeRanking.phase === "ranked" ? copy.pointsMode : copy.marketMode} totalPublishedCards={publishedCardCount} totalRankedCards={rankedCards.length} />;
  const highlights = await data.highlights;
  if (section === "podium") return <TouchlineRankingPodium draftLocalesEnabled={draftLocalesEnabled} copy={copy} locale={locale} highlights={highlights} canEditCardEngine={Boolean(user && isOwnerEmail(user.email))} />;

  return (
      <TouchLineTablesClient draftLocalesEnabled={draftLocalesEnabled}
      canEditCardEngine={Boolean(user && isOwnerEmail(user.email))}
      copy={copy}
      locale={locale}
      highlights={highlights}
      />
  );
}

function BestXiPending({ locale, draftLocalesEnabled = false }: { locale: ReturnType<typeof normalizeTouchLineLocale>; draftLocalesEnabled?: boolean }) {
  const copy = getTouchLineRankingsCopy(locale, draftLocalesEnabled);
  const pending = getTouchlineTablesPresentationCopy(locale, draftLocalesEnabled).loadingRankings;
  return <div className={styles.bestXiPanel} aria-busy="true"><div className={styles.sectionHeading}><div><p>{copy.touchLineXi}</p><h2>{copy.seasonSelection}</h2></div><span>{copy.seasonSelectionRule}</span></div><div className={styles.pitch} role="status">{pending}</div><p className={styles.pitchHint}>{copy.seasonSelectionHint}</p></div>;
}

async function SportingFrame({ data, locale, user, draftLocalesEnabled = false }: {
  data: ReturnType<typeof readSportingData>;
  locale: ReturnType<typeof normalizeTouchLineLocale>;
  user: { email?: string | null } | null;
  draftLocalesEnabled?: boolean;
}) {
  // Leadership is fixed once for every card; the catalogue cannot gate this frame.
  const [activeRanking, coachRanking] = await data.leadership;
  const copy = getTouchLineRankingsCopy(locale, draftLocalesEnabled);
  const presentationCopy = getTouchlineTablesPresentationCopy(locale, draftLocalesEnabled);
  return <TouchlineCardLeadershipProvider value={buildTouchlineCardLeadershipValue(activeRanking, coachRanking)}>
    <TouchlineLivePresentationRefresh initialCoachRankingSnapshotId={coachRanking.snapshotId} initialPlayerRankingSnapshotId={activeRanking.snapshotId} />
    <Suspense fallback={<TouchlineRankingsHero copy={copy} rankMode={activeRanking.phase === "ranked" ? copy.pointsMode : copy.marketMode} totalPublishedCards={null} totalRankedCards={null} />}><SportingContent data={data} locale={locale} user={user} section="hero" draftLocalesEnabled={draftLocalesEnabled} /></Suspense>
    <section className={styles.selectionSection} id="best-xi"><div className={styles.rankStage}>
      <Suspense fallback={<BestXiPending locale={locale} draftLocalesEnabled={draftLocalesEnabled} />}><SportingContent data={data} locale={locale} user={user} section="overview" draftLocalesEnabled={draftLocalesEnabled} /></Suspense>
      <TouchlineFeaturedCoach draftLocalesEnabled={draftLocalesEnabled} coachRanking={coachRanking} copy={copy} locale={locale} />
    </div></section>
    <section className={styles.rankingHighlights} aria-label={presentationCopy.seasonHighlights}>
      <Suspense fallback={<TouchlineRankingPodiumPending draftLocalesEnabled={draftLocalesEnabled} locale={locale} />}><SportingContent data={data} locale={locale} user={user} section="podium" draftLocalesEnabled={draftLocalesEnabled} /></Suspense>
      <TouchlineCoachRankingTable draftLocalesEnabled={draftLocalesEnabled} coachRanking={coachRanking} copy={copy} locale={locale} />
    </section>
    <Suspense fallback={null}><SportingContent data={data} locale={locale} user={user} section="ending" draftLocalesEnabled={draftLocalesEnabled} /></Suspense>
  </TouchlineCardLeadershipProvider>;
}

type RankingsPageProps = { searchParams: Promise<{ lang?: string }> };

export default async function TouchLineTablesPage(props: RankingsPageProps) {
  return renderRankingsPage(props, isTouchLineSiteLocalesEnabled("/rankings"));
}

async function renderRankingsPage({ searchParams }: RankingsPageProps, draftLocalesEnabled = false) {
  const { lang } = await searchParams;
  const locale = resolveTouchlineCatalogueLocale(lang, draftLocalesEnabled);
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
  const viewer = await authentication;
  const rawUser = viewer?.data?.user;
  const verifiedViewer = Boolean(viewer && "error" in viewer && viewer.error === null);
  const user = verifiedViewer ? rawUser ?? null : null;
  const verifiedGuest = rawUser === null && viewer && "error" in viewer
    && (viewer.error === null || viewer.error instanceof AuthSessionMissingError);
  const accountLocaleContext: AccountLocaleContext = verifiedViewer && user && hasTouchLineArenaAccess(user)
    && typeof user.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
    ? { mode: "account", accountId: user.id }
    : verifiedGuest ? { mode: "guest" } : { mode: "unavailable" };
  const presentationCopy = getTouchlineTablesPresentationCopy(locale, draftLocalesEnabled);
  const pending = presentationCopy.loadingRankings;
  const navigationSurface = resolveTouchlineGlobalNavigationSurface({ isAuthenticated: Boolean(user), isAdmin: Boolean(user && isOwnerEmail(user.email)) });
  return <main className={styles.page} dir="ltr">
    <TouchlineBrandHeader href={`/rankings?lang=${encodeURIComponent(locale)}`} locale={locale} accountLocaleContext={accountLocaleContext} draftLocalesEnabled={draftLocalesEnabled} />
    <div className={styles.content}>
    <header className={styles.topbar}>
      <TouchlineGlobalNavigation locale={locale} draftLocalesEnabled={draftLocalesEnabled} currentRoute="rankings" surface={navigationSurface} className={styles.globalNavigation} showAudioControl={false} />
      <Suspense fallback={<span className={styles.status} role="status">{presentationCopy.loadingMatchweek}</span>}>
        <RoundBadge fixtures={fixtures} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
      </Suspense>
    </header>
    <Suspense fallback={<p role="status">{pending}</p>}>
      <SportingFrame data={data} locale={locale} user={user} draftLocalesEnabled={draftLocalesEnabled} />
    </Suspense>
    </div>
  </main>;
}
