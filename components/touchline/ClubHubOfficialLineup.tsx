import type { CSSProperties, ReactNode } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import { getTouchlineCardZoomCopy } from "@/lib/touchlineArena/card-zoom-i18n";
import { getTouchlineExactCardCopy } from "@/lib/touchlineArena/exact-card-i18n";
import { getTouchlineClubHubLineupCopy } from "@/lib/touchlineArena/club-hub-lineup-i18n";
import { getTouchlineClubHubContractLabel } from "@/lib/touchlineArena/club-hub-roster-i18n";
import { getTouchlineFantasyMarketWorkflowCopy } from "@/lib/touchlineFantasy/market-workflow-i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { touchlinePlayerPositionKind } from "@/lib/touchlineArena/position-aware-card-stats";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineGoalFacingPitchCard from "@/components/touchline/cards/TouchlineGoalFacingPitchCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import ClubHubCrestTrace from "@/components/touchline/ClubHubCrestTrace";
import ClubHubLiveFixtureScore from "@/components/touchline/ClubHubLiveFixtureScore";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import { isClubHubSquadPreviewWindow, type TouchLineClubLineup } from "@/lib/touchlineArena/club-lineup";
import type { TouchlineClubMatchPreviewTeam } from "@/lib/touchlineArena/club-match-preview";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";

import styles from "./ClubHubOfficialLineup.module.css";

type ClubHubOfficialLineupProps = {
  clubName: string;
  lineup: TouchLineClubLineup;
  locale: string;
  draftLocalesEnabled?: boolean;
  /** Isolates the static local visual fixture from card-ranking activity. */
  staticVisualQa?: boolean;
  labels: {
    nationality: string;
    points: string;
    totalPoints: string;
    cardPrice: string;
  };
  canEditCardEngine?: boolean;
  /** Public ClubHub pages suppress values without changing ClubOwner or QA defaults. */
  hideMarketValuePanel?: boolean;
  /** Canonically ranked club leaders, rendered beside the pitch. */
  leaderCards?: ReactNode;
  matchup?: {
    fixtureId: string | null;
    initialFixture: TouchlinePublicFixture | null;
    home: TouchlineClubMatchPreviewTeam;
    away: TouchlineClubMatchPreviewTeam;
    status: string;
    startsAt: string;
    startsAtIso?: string | null;
  } | null;
};

export default function ClubHubOfficialLineup({
  clubName,
  lineup,
  locale,
  draftLocalesEnabled = false,
  staticVisualQa = false,
  labels,
  canEditCardEngine = false,
  hideMarketValuePanel = false,
  leaderCards = null,
  matchup = null,
}: ClubHubOfficialLineupProps) {
  const zoomCopy = getTouchlineCardZoomCopy(locale, draftLocalesEnabled);
  const exactCopy = getTouchlineExactCardCopy(locale, draftLocalesEnabled);
  const lineupCopy = getTouchlineClubHubLineupCopy(locale, draftLocalesEnabled);
  const workflowCopy = getTouchlineFantasyMarketWorkflowCopy(locale, draftLocalesEnabled);
  const confirmed = lineup.status === "confirmed";
  const squadPreviewWindow = isClubHubSquadPreviewWindow({
    lineupStatus: lineup.status,
    startsAt: matchup?.startsAtIso,
    fixtureStatus: matchup?.initialFixture?.status,
  });
  const showPreviewContext = !confirmed && squadPreviewWindow;
  const title = confirmed
    ? lineupCopy.confirmedTitle
    : (showPreviewContext
      ? lineupCopy.previewTitle
      : lineupCopy.unconfirmedTitle);
  const accessibleTitle = title;

  // The Market formation is stored on a horizontal 105×68 coordinate plane:
  // goalkeeper at the left, attack at the right. Club Hub uses that same
  // canonical geometry on a regulation landscape field; the player cards
  // remain upright so names and artwork are naturally readable.
  const horizontalPitchPosition = (x: number, y: number) => ({ x, y });

  return (
    <section id="touchline-club-lineup" className={styles.shell} aria-label={`${clubName} ${accessibleTitle}`}>
      <TouchlineClubPerimeterTrace accent="#a3ff12" className={styles.perimeterTrace} />
      <header className={styles.header}>
        {confirmed ? (
          <div className={styles.confirmedHeading}>
            <h2>{title}</h2>
          </div>
        ) : showPreviewContext ? (
          <div>
            <span className={styles.eyebrow}>{lineupCopy.matchdayEyebrow}</span>
            <h2>{title}</h2>
            <p>{lineupCopy.previewNotice}</p>
          </div>
        ) : (
          <div>
            <span className={styles.eyebrow}>{lineupCopy.matchdayEyebrow}</span>
            <h2>{title}</h2>
            <p>{lineupCopy.illustrativeNotice}</p>
          </div>
        )}
        <div className={styles.statusPanel}>
          {matchup ? (
            <aside className={styles.matchup} aria-label={lineupCopy.matchupAria}>
              <span>{lineupCopy.matchupEyebrow}</span>
              <div className={styles.matchupTeams}>
                <div className={!matchup.home.logoUrl ? styles.matchupTeamPending : undefined}>
                  {matchup.home.logoUrl && matchup.home.accent ? <ClubHubCrestTrace accent={matchup.home.accent} className={styles.matchupCrest} src={matchup.home.logoUrl} /> : null}
                  <strong>{matchup.home.shortCode}</strong>
                </div>
                <ClubHubLiveFixtureScore draftLocalesEnabled={draftLocalesEnabled} fixtureId={matchup.fixtureId} initialFixture={matchup.initialFixture} locale={resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)} />
                <div className={!matchup.away.logoUrl ? styles.matchupTeamPending : undefined}>
                  {matchup.away.logoUrl && matchup.away.accent ? <ClubHubCrestTrace accent={matchup.away.accent} className={styles.matchupCrest} src={matchup.away.logoUrl} /> : null}
                  <strong>{matchup.away.shortCode}</strong>
                </div>
              </div>
              <small>{[matchup.status, matchup.startsAt].filter(Boolean).join(" · ")}</small>
            </aside>
          ) : null}
          <div className={styles.formationPanel}>
          <span className={`${styles.status} ${confirmed ? styles.confirmed : ""}`}>
            {confirmed
              ? lineupCopy.confirmedTitle
              : (showPreviewContext ? lineupCopy.previewTitle : lineupCopy.awaitingConfirmation)}
          </span>
          <span className={styles.syncLabel}>{workflowCopy.formation}</span>
          <strong className={styles.formation}>{lineup.formation}</strong>
          </div>
        </div>
      </header>

      <div className={styles.pitchAndLeaders}>
      <div className={styles.pitchViewport}>
        <TouchlinePitchSurface
          className={styles.pitch}
          orientation="horizontal"
          surfaceVariant="premium-stadium"
          ariaLabel={`${clubName} ${lineupCopy.pitchAriaSuffix}`}
        >
          <div className={styles.geometryLayer}>
            {lineup.players.length ? lineup.players.map(({ card, x, y }) => {
            const positionKind = touchlinePlayerPositionKind(card.position);
            const pitchPosition = horizontalPitchPosition(x, y);
            const cardReview = card.cardReview ?? evaluateTouchlineCardCompleteness({
              displayName: card.name,
              shirtNumber: card.shirtNumber,
              countryCode3: card.countryCode3,
              position: card.position,
              hasVerifiedMarketValue: Boolean(card.editorialCard),
              hasClubAsset: Boolean(findTouchLineClub(card.clubName)?.logoUrl),
            });
            const exactPlayer = squadCardToExactPlayer({ ...card, cardReview }, { useSuppliedTier: true });
            const tierKey = card.editorialCard?.tierKey ?? null;
            const profileHref = touchlinePlayerProfileHref({
                sportmonksPlayerId: card.id,
                name: card.name,
                clubName: card.clubName,
                position: card.position,
                shirtNumber: card.shirtNumber,
                countryCode3: card.countryCode3,
              }, locale);
            const tierAccent = tierKey
              ? touchlineCardTierPalette(tierKey).accent
              : TOUCHLINE_NEUTRAL_CARD_ACCENT;
            const tierLabel = tierKey ? touchlineCardTierName(tierKey, locale, draftLocalesEnabled) : undefined;
            return (
              <article
                key={card.id}
                className={styles.player}
                data-lineup-edge={pitchPosition.x <= 8 ? "left" : pitchPosition.x >= 92 ? "right" : undefined}
                style={{ "--lineup-x": `${pitchPosition.x}%`, "--lineup-y": `${pitchPosition.y}%` } as CSSProperties}
              >
                <TouchlineGoalFacingPitchCard className={styles.pitchCard} orientation="upright">
                  <TouchlineCardZoom draftLocalesEnabled={draftLocalesEnabled}
                    locale={locale}
                    ariaLabel={zoomCopy.expandCard.replace("{playerName}", () => card.name)}
                    contractHref={undefined}
                    contractLabel={getTouchlineClubHubContractLabel(locale, draftLocalesEnabled)}
                    contractValue={undefined}
                    contractTermLabel={undefined}
                    tierAccent={tierAccent}
                    tierLabel={tierLabel}
                    details={buildTouchlinePlayerCardZoomDetails({
                      locale,
                  draftLocalesEnabled,
                      name: card.name,
                      clubName: card.clubName,
                      position: card.position,
                      positionKind: positionKind === "unknown" ? undefined : positionKind,
                      nationality: card.countryCode3,
                      editorialCard: card.editorialCard,
                      cardReview,
                      activeContractCard: null,
                      extraFields: [
                        {
                          label: exactCopy.totalRating,
                          value: card.seasonTotalRating == null ? "—" : String(card.seasonTotalRating),
                          accent: true,
                          kind: "rating-total",
                          icon: "rating",
                          primary: true,
                        },
                        {
                          label: zoomCopy.lastMatchRating,
                          value: card.matchRating == null ? "—" : String(card.matchRating),
                          accent: true,
                          kind: "rating-last",
                          icon: "rating",
                        },
                        ...buildTouchlineVerifiedMatchFactFields({
                          statistics: card.matchStats,
                          position: card.position || card.role,
                        }, locale, draftLocalesEnabled),
                      ],
                      profileHref,
                      cardEngineHref: canEditCardEngine
                        ? touchlineCardEnginePlayerHref(card.canonicalPlayerId, locale)
                        : null,
                    })}
                    expandedContent={(
                      <TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled} runtimeLocaleOverride={locale}
                        player={exactPlayer}
                        showUnpublishedIdentity
                        labels={labels}
                        imageLoading="lazy"
                        playerProfileHref={profileHref}
                        staticRenderScale={390 / 430}
                        subscribeToRanking={!staticVisualQa}
                        enableInteractiveNeon={!staticVisualQa}
                        rankingMode={staticVisualQa ? "preview" : "live"}
                        forceNeonActive
                        hideMarketValuePanel={hideMarketValuePanel}
                      />
                    )}
                  >
                    <TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled} runtimeLocaleOverride={locale}
                      className={styles.card}
                      player={exactPlayer}
                      showUnpublishedIdentity
                      labels={labels}
                      imageLoading="lazy"
                      playerProfileHref={profileHref}
                      subscribeToRanking={!staticVisualQa}
                      enableInteractiveNeon={!staticVisualQa}
                      rankingMode={staticVisualQa ? "preview" : "live"}
                      hideMarketValuePanel={hideMarketValuePanel}
                      showProfileAction={false}
                      showSocialMetrics={false}
                    />
                  </TouchlineCardZoom>
                </TouchlineGoalFacingPitchCard>
              </article>
            );
            }) : (
              <div className={styles.empty}>{lineupCopy.emptyLineup}</div>
            )}
          </div>
        </TouchlinePitchSurface>
      </div>
      {leaderCards ? (
        <aside className={styles.positionLeaders} aria-label={lineupCopy.positionLeadersAria}>
          {leaderCards}
        </aside>
      ) : null}
      </div>
    </section>
  );
}
