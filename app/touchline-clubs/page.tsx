import { Suspense, type CSSProperties } from "react";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import TouchlineBrandHeader from "@/components/touchline/TouchlineBrandHeader";
import { loadAccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlineCoachCategoryShowcase from "@/components/touchline/TouchlineCoachCategoryShowcase";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import ClubHubCrestTrace from "@/components/touchline/ClubHubCrestTrace";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import ClubHubCardLink from "@/components/touchline/ClubHubCardLink";
import { loadTouchlineCurrentPlayerRankingView } from "@/lib/touchlineArena/current-player-ranking-server";
import { EMPTY_COACH_RANKING } from "@/lib/touchlineArena/coach-ranking-snapshot-server";
import { TOUCHLINE_ENGLAND_CLUBS_BY_RANK } from "@/lib/touchlineArena/demo-data";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineClubHubDirectoryCopy } from "@/lib/touchlineArena/club-hub-directory-i18n";
import { getTouchlineFantasyMarketWorkflowCopy } from "@/lib/touchlineFantasy/market-workflow-i18n";

import styles from "./touchline-clubs.module.css";

export const dynamic = "force-dynamic";

type ClubsPageProps = {
  searchParams: Promise<{
    lang?: string;
  }>;
};

function languageQuery(locale: TouchLineLocale) {
  return `lang=${encodeURIComponent(locale)}`;
}

async function ClubShowcase({ locale, draftLocalesEnabled = false }: { locale: TouchLineLocale; draftLocalesEnabled?: boolean }) {
  const [playerRead, coachRead] = await Promise.allSettled([
    loadTouchlineCurrentPlayerRankingView(), loadTouchLineCoachRanking(),
  ]);
  const playerRanking = playerRead.status === "fulfilled" ? playerRead.value : null;
  const coachRanking = coachRead.status === "fulfilled" ? coachRead.value : EMPTY_COACH_RANKING;
  const playerEntries = !playerRanking || playerRanking.phase === "unavailable" ? null : playerRanking.rows;
  return (
    <>
      <TouchlineLivePresentationRefresh
        initialPlayerRankingSnapshotId={playerRanking?.snapshotId ?? null}
        initialCurrentPlayerRankingRevision={playerRanking?.currentRevision ?? null}
        initialCoachRankingSnapshotId={coachRanking.snapshotId}
        initialCurrentCoachRankingRevision={coachRanking.currentRevision ?? null}
      />
      <TouchlineCoachCategoryShowcase draftLocalesEnabled={draftLocalesEnabled} locale={locale} playerEntries={playerEntries} coachRanking={coachRanking} />
    </>
  );
}

export default async function TouchlineClubsPage(props: ClubsPageProps) {
  return renderTouchlineClubsPage(props, isTouchLineSiteLocalesEnabled("/touchline-clubs"));
}

async function renderTouchlineClubsPage({ searchParams }: ClubsPageProps, draftLocalesEnabled = false) {
  const [params, accountLocaleContext] = await Promise.all([searchParams, loadAccountLocaleContext()]);
  const locale = resolveTouchlineCatalogueLocale(params.lang, draftLocalesEnabled);
  const dictionary = getTouchlineClubHubDirectoryCopy(locale, draftLocalesEnabled);
  const workflowCopy = getTouchlineFantasyMarketWorkflowCopy(locale, draftLocalesEnabled);
  const localeQuery = languageQuery(locale);

  return (
    <main dir="ltr" className={styles.shell}>
      <TouchlineBrandHeader draftLocalesEnabled={draftLocalesEnabled} href={`/touchline-clubs?${localeQuery}`} locale={locale} accountLocaleContext={accountLocaleContext} navigation={<TouchlineGlobalNavigation draftLocalesEnabled={draftLocalesEnabled} locale={locale} currentRoute="clubHub" surface="public" showAudioControl={false} />} />
      <div className={styles.content}>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>TouchLine England</span>
          <h1>{workflowCopy.chooseClub}</h1>
          <p>{dictionary.intro}</p>
        </div>
      </section>

      <section className={styles.clubGrid} aria-label={dictionary.hint}>
        {TOUCHLINE_ENGLAND_CLUBS_BY_RANK.map((club, index) => (
          <ClubHubCardLink
            key={club.teamId}
            href={`/touchline-clubs/${club.slug}?${localeQuery}`}
            className={styles.clubCard}
            pendingLabel={`${dictionary.openingClub}: ${club.name}`}
            style={{
              "--club-accent": club.accent,
              "--club-secondary": club.secondaryAccent,
            } as CSSProperties}
          >
            <TouchlineClubPerimeterTrace accent={club.accent} className={styles.clubCardTrace} />
            <span className={styles.clubIndex}>{String(index + 1).padStart(2, "0")}</span>
            {club.logoUrl ? (
              <ClubHubCrestTrace
                accent={club.accent}
                className={styles.logoWrap}
                loading={index < 6 ? "eager" : "lazy"}
                src={club.logoUrl}
              />
            ) : <span className={styles.logoWrap} aria-hidden="true">{club.shortCode}</span>}
            <span className={styles.clubInfo}>
              <strong>{club.name}</strong>
              <small>{club.shortCode} · TouchLine Verified</small>
            </span>
            <span className={styles.open}>{dictionary.open}</span>
          </ClubHubCardLink>
        ))}
      </section>

      <Suspense fallback={<p role="status">{dictionary.loadingCards}</p>}>
        <ClubShowcase draftLocalesEnabled={draftLocalesEnabled} locale={locale} />
      </Suspense>

      <footer className={styles.footer}>
        <span>{dictionary.clubs}</span>
        <span>{dictionary.hint}</span>
      </footer>
      </div>
    </main>
  );
}
