import type { ReactNode } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import { getTouchlineCardZoomCopy } from "@/lib/touchlineArena/card-zoom-i18n";
import { getTouchlineExactCardCopy } from "@/lib/touchlineArena/exact-card-i18n";
import { getTouchlineClubHubRosterCopy } from "@/lib/touchlineArena/club-hub-roster-i18n";
import { resolveTouchlineCoachZoomPresentation } from "@/lib/touchlineArena/coach-zoom-i18n";
import { getTouchlineFantasyMarketWorkflowCopy } from "@/lib/touchlineFantasy/market-workflow-i18n";
import { touchlinePlayerPositionKind } from "@/lib/touchlineArena/position-aware-card-stats";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import type { TouchLineClubMatchdayPresentation } from "@/lib/touchlineArena/club-lineup";
import { squadCardToExactPlayer, findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";

import styles from "./ClubHubMatchdayTechnicalArea.module.css";

type ClubHubMatchdayTechnicalAreaProps = {
  clubName: string;
  technical: TouchLineClubMatchdayPresentation["technical"];
  locale: string;
  draftLocalesEnabled?: boolean;
  coachCard: ReactNode;
  canEditCardEngine?: boolean;
  /** Public ClubHub pages suppress values without changing ClubOwner or QA defaults. */
  hideMarketValuePanel?: boolean;
  labels: {
    nationality: string;
    points: string;
    totalPoints: string;
    cardPrice: string;
  };
};

/**
 * The Club Hub always keeps the coach and a nine-card bench close to the
 * pitch. Until the official sheet is persisted, the cards are explicitly a
 * squad preview; no player is presented as a confirmed substitute early.
 */
export default function ClubHubMatchdayTechnicalArea({
  clubName,
  technical,
  locale,
  draftLocalesEnabled = false,
  coachCard,
  canEditCardEngine = false,
  hideMarketValuePanel = false,
  labels,
}: ClubHubMatchdayTechnicalAreaProps) {
  const rosterCopy = getTouchlineClubHubRosterCopy(locale, draftLocalesEnabled);
  const coachCopy = resolveTouchlineCoachZoomPresentation(locale, draftLocalesEnabled).copy;
  const workflowCopy = getTouchlineFantasyMarketWorkflowCopy(locale, draftLocalesEnabled);
  const zoomCopy = getTouchlineCardZoomCopy(locale, draftLocalesEnabled);
  const exactCopy = getTouchlineExactCardCopy(locale, draftLocalesEnabled);
  const confirmed = technical.state === "confirmed";
  const bench = (confirmed ? technical.bench : technical.previewBench).slice(0, 9);
  const coachLabel = coachCopy.firstTeamCoach;
  const benchLabel = rosterCopy.bench;
  const status = confirmed
    ? rosterCopy.confirmed
    : rosterCopy.preview;

  return (
    <section
      className={styles.shell}
      data-matchday-sheet={confirmed ? "confirmed" : "preview"}
      aria-label={rosterCopy.technicalAria.replace("{clubName}", () => clubName)}
    >
      <TouchlineClubPerimeterTrace accent="#a3ff12" className={styles.perimeterTrace} />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{rosterCopy.staff}</span>
          <h2>{workflowCopy.technicalArea}</h2>
        </div>
        <span className={`${styles.status} ${confirmed ? styles.confirmed : ""}`} aria-live="polite">{status}</span>
      </header>

      <div className={styles.content}>
        <section className={styles.coach} aria-label={coachLabel}>
          <span className={styles.label}>{coachLabel}</span>
          {coachCard ?? <p>{rosterCopy.coachUnavailable}</p>}
        </section>

        <section className={styles.bench} aria-label={`${benchLabel} (${bench.length})`}>
          <div className={styles.benchHeader}>
            <div>
              <span className={styles.label}>{benchLabel}</span>
              <p aria-hidden="true" />
            </div>
            <strong>{bench.length}/9</strong>
          </div>
          {bench.length ? (
            <ol className={styles.cards}>
              {bench.map((card, index) => {
                const positionKind = touchlinePlayerPositionKind(card.position);
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
                const tierAccent = tierKey
                  ? touchlineCardTierPalette(tierKey).accent
                  : TOUCHLINE_NEUTRAL_CARD_ACCENT;
                const tierLabel = tierKey ? touchlineCardTierName(tierKey, locale, draftLocalesEnabled) : undefined;
                const profileHref = touchlinePlayerProfileHref({
                  sportmonksPlayerId: card.id,
                  name: card.name,
                  clubName: card.clubName,
                  position: card.position,
                  shirtNumber: card.shirtNumber,
                  countryCode3: card.countryCode3,
                }, locale);
                return (
                  <li key={card.id}>
                    <span className={styles.cardNumber}>{index + 1}</span>
                    <TouchlineCardZoom draftLocalesEnabled={draftLocalesEnabled}
                      locale={locale}
                      ariaLabel={zoomCopy.expandCard.replace("{playerName}", () => card.name)}
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
                          subscribeToRanking={false}
                          enableInteractiveNeon={false}
                          rankingMode="live"
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
                        staticRenderScale={104 / 430}
                        subscribeToRanking={false}
                        enableInteractiveNeon={false}
                        rankingMode="preview"
                        hideMarketValuePanel={hideMarketValuePanel}
                        showProfileAction={false}
                        showSocialMetrics={false}
                        showMatchRating
                      />
                    </TouchlineCardZoom>
                  </li>
                );
              })}
            </ol>
          ) : <p className={styles.empty}>{rosterCopy.awaiting}</p>}
        </section>
      </div>
    </section>
  );
}
