import Link from "next/link";
import type { CSSProperties } from "react";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCoachCardZoom from "@/components/touchline/cards/TouchlineCoachCardZoom";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { coachCompetitionFromRanking } from "@/lib/touchlineArena/coach-competition-projection";
import type { TouchLineCoachRankingState } from "@/lib/touchlineArena/coach-ranking-server";
import { TOUCHLINE_ENGLAND_CLUBS, squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineClubHubShowcaseCopy } from "@/lib/touchlineArena/club-hub-showcase-i18n";
import { touchlineCardTierName, touchlineCardTierPalette, type TouchlineCardTierKey } from "@/lib/touchlineArena/card-rules";
import navigationStyles from "./TouchlineGlobalNavigation.module.css";
import styles from "./TouchlineCoachCategoryShowcase.module.css";

/** Derived by the shared current-ranking authority, never by this gallery. */
export type TouchlineClubHubRankedPlayer = Readonly<{ card: ClubOwnerSquadCard; officialRank: number }>;
type Props = Readonly<{
  locale: string;
  draftLocalesEnabled?: boolean;
  /** null means unavailable; [] means the current publication has no eligible rows. */
  playerEntries: readonly TouchlineClubHubRankedPlayer[] | null;
  coachRanking: TouchLineCoachRankingState;
}>;

function tierStyle(tierKey: TouchlineCardTierKey) {
  const palette = touchlineCardTierPalette(tierKey);
  return { "--tier-accent": palette.accent, "--tier-secondary": palette.secondary } as CSSProperties;
}

export default function TouchlineCoachCategoryShowcase({ locale, playerEntries, coachRanking, draftLocalesEnabled = false }: Props) {
  const effectiveLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const dictionary = getTouchlineClubHubShowcaseCopy(effectiveLocale, draftLocalesEnabled);
  const number = new Intl.NumberFormat(effectiveLocale, { maximumFractionDigits: 2 });
  // The server supplies the global current order and original position. Missing
  // identities never promote a lower row, fabricate a card or borrow a colour.
  const players = playerEntries?.slice(0, 7) ?? null;
  const validPlayers = players?.every(({ card, officialRank }) => card.editorialCard
    && touchlinePlayerProfileHref(squadCardToExactPlayer(card), effectiveLocale)
    && Number.isSafeInteger(officialRank) && officialRank > 0
    && typeof card.publishedRanking?.totalRating === "number" && Number.isFinite(card.publishedRanking.totalRating)) ? players : null;
  const currentCoaches = coachRanking.catalogue?.phase === "ready" ? coachRanking.catalogue.current : null;
  const coaches = coachRanking.phase === "preseason" && currentCoaches ? [] : coachRanking.phase === "ranked" && coachRanking.snapshotId && coachRanking.seasonId
    && coachRanking.scoringVersion === "coach_scoring_v2" && currentCoaches
    ? coachRanking.rows.slice(0, 7).map(row => ({ row, snapshot: currentCoaches.find(entry => entry.coach.providerId === row.coachProviderId) })) : null;
  const validCoaches = coaches?.every(({ row, snapshot }) => Number.isSafeInteger(row.rank) && row.rank > 0
    && Number.isFinite(row.touchlinePoints) && snapshot
    && TOUCHLINE_ENGLAND_CLUBS.some(club => club.teamId === snapshot.coach.teamId)) ? coaches : null;

  return (
    <div className={styles.showcases}>
      <section className={styles.surface} aria-labelledby="touchline-player-border-title">
        <header className={styles.header}>
          <span className={styles.eyebrow}>{dictionary.playerEyebrow}</span>
          <h2 id="touchline-player-border-title">{dictionary.playerTitle}</h2>
          <p>{dictionary.playerDescription}</p>
        </header>
        {validPlayers?.length ? <ul className={styles.grid} data-touchline-ranking="players">
          {validPlayers.map(({ card, officialRank }) => {
            const exactPlayer = squadCardToExactPlayer(card);
            const tierKey = card.editorialCard!.tierKey;
            const profileHref = touchlinePlayerProfileHref(exactPlayer, effectiveLocale)!;
            return <li key={card.canonicalPlayerId ?? card.id} className={styles.card} style={tierStyle(tierKey)} data-tier={tierKey} data-ranking-leader={officialRank === 1}>
              <TouchlineClubPerimeterTrace accent={touchlineCardTierPalette(tierKey).accent} />
              <Link className={styles.cardLink} href={profileHref} aria-label={`${dictionary.openPlayer}: ${card.name}`}>
                <span className={styles.rank}>#{officialRank}</span>
                <span className={styles.playerCardVisual}>
                  <TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled}
                    player={exactPlayer} imageLoading="lazy" initialRenderScale={0.34}
                    optimizeForLiveCompact={false} runtimeLocaleOverride={effectiveLocale}
                    subscribeToRanking={false} enableInteractiveNeon={false}
                    showCardActions={false} showProfileAction={false} showSocialMetrics={false}
                    hideMarketValuePanel={false} rankingMode="live"
                  />
                </span>
                <span className={styles.identity}>
                  <small>{touchlineCardTierName(tierKey, effectiveLocale, draftLocalesEnabled)}</small>
                  <strong>{card.name}</strong><span>{card.clubName}</span>
                  <em>{number.format(card.publishedRanking!.totalRating!)} {dictionary.playerMetric}</em>
                </span>
              </Link>
            </li>;
          })}
        </ul> : <p className={styles.empty} role="status">{validPlayers ? dictionary.empty : dictionary.unavailable}</p>}
        <footer className={styles.footer}><Link className={navigationStyles.link} href={`/touchline-player-card-rankings?lang=${encodeURIComponent(effectiveLocale)}`}>{dictionary.viewPlayers}</Link></footer>
      </section>
      <section className={styles.surface} aria-labelledby="touchline-coach-border-title">
        <header className={styles.header}>
          <span className={styles.eyebrow}>{dictionary.coachEyebrow}</span>
          <h2 id="touchline-coach-border-title">{dictionary.coachTitle}</h2>
          <p>{dictionary.coachDescription}</p>
        </header>
        {validCoaches?.length ? <ul className={styles.grid} data-touchline-ranking="coaches">
          {validCoaches.map(({ row, snapshot }) => {
            const confirmed = snapshot!;
            const tierKey = confirmed.classification.tierKey;
            const club = TOUCHLINE_ENGLAND_CLUBS.find(candidate => candidate.teamId === confirmed.coach.teamId)!;
            const coachHref = `/touchline-coaches/${encodeURIComponent(confirmed.coach.providerId)}?lang=${encodeURIComponent(effectiveLocale)}`;
            const cardSlot = createTouchlineArenaCoachSlot(confirmed.coach, confirmed.classification.finalPosition, tierKey);
            const competition = coachCompetitionFromRanking(coachRanking, confirmed.coach.providerId);
            return <li key={confirmed.coach.providerId} className={styles.card} style={tierStyle(tierKey)} data-tier={tierKey} data-ranking-leader={row.rank === 1}>
              <TouchlineClubPerimeterTrace accent={touchlineCardTierPalette(tierKey).accent} />
              <div className={styles.cardLink}>
                <span className={styles.rank}>#{row.rank}</span>
                <span className={styles.coachCardVisual}>
                  <TouchlineCoachCardZoom draftLocalesEnabled={draftLocalesEnabled}
                    coach={confirmed.coach} slot={cardSlot} clubName={club.name}
                    clubLogoUrl={club.logoUrl} clubAccent={club.accent} countryCode3={confirmed.countryCode3}
                    locale={effectiveLocale} contract={null} competition={competition} liveCompetitionUpdates
                    profileHref={coachHref} assetLoading="eager" frameLoading="eager"
                    frameDisplaySizes="(max-width: 410px) max(112px, 50vw), (max-width: 760px) 50vw, (max-width: 1180px) 25vw, 206px"
                  />
                </span>
                <Link className={styles.identity} href={coachHref} aria-label={`${dictionary.openCoach}: ${confirmed.coach.displayName}`}>
                  <small>{touchlineCardTierName(tierKey, effectiveLocale, draftLocalesEnabled)}</small>
                  <strong>{confirmed.coach.displayName}</strong><span>{club.name}</span>
                  <em>{number.format(row.touchlinePoints)} {dictionary.coachMetric}</em>
                </Link>
              </div>
            </li>;
          })}
        </ul> : <p className={styles.empty} role="status">{validCoaches ? dictionary.empty : dictionary.unavailable}</p>}
        <footer className={styles.footer}><Link className={navigationStyles.link} href={`/rankings?lang=${encodeURIComponent(effectiveLocale)}#coach-rankings`}>{dictionary.viewCoaches}</Link></footer>
        <p className={styles.note}>{dictionary.sourceNote}</p>
      </section>
    </div>
  );
}
