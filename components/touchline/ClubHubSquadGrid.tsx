"use client";

import { useMemo, useState, type CSSProperties } from "react";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import styles from "./ClubHubSquadGrid.module.css";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import { getTouchlineCardZoomCopy } from "@/lib/touchlineArena/card-zoom-i18n";
import { getTouchlineExactCardCopy } from "@/lib/touchlineArena/exact-card-i18n";
import { getTouchlineClubHubRosterCopy, getTouchlineClubHubContractLabel } from "@/lib/touchlineArena/club-hub-roster-i18n";
import { touchlinePlayerPositionKind } from "@/lib/touchlineArena/position-aware-card-stats";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  findTouchLineClub,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
} from "@/lib/touchlineArena/demo-data";
import {
  touchlineCardTierName,
  touchlineCardTierPalette,
} from "@/lib/touchlineArena/card-rules";
import {
  buildTouchlinePlayerCardZoomDetails,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import { localizedPositionLabel } from "@/lib/touchlineArena/position-labels";

const INITIAL_CARD_COUNT = 8;
const CARD_BATCH_SIZE = 8;

type ClubHubSquadGridProps = {
  cards: ClubOwnerSquadCard[];
  locale: TouchLineLocale;
  draftLocalesEnabled?: boolean;
  labels: {
    nationality: string;
    points: string;
    totalPoints: string;
    cardPrice: string;
    currentClub: string;
  };
  openProfileLabel: string;
  canEditCardEngine?: boolean;
  initialCardCount?: number;
  cardRenderScale?: number;
  hideMarketValuePanel?: boolean;
  className?: string;
};

/**
 * Progressive ClubHub roster: the first useful group is interactive at once,
 * while off-screen card products are mounted only when the supporter asks for
 * them. This preserves the canonical card component without hydrating 25–30
 * heavy products during the first mobile render.
 */
export default function ClubHubSquadGrid({ cards, locale, labels, openProfileLabel, canEditCardEngine = false, initialCardCount = INITIAL_CARD_COUNT, cardRenderScale = 180 / 430, hideMarketValuePanel = false, className, draftLocalesEnabled = false }: ClubHubSquadGridProps) {
  const [visibleCount, setVisibleCount] = useState(initialCardCount);
  // The footballer remains present on every Club Hub surface. Published
  // profiles render in colour; incomplete editorial inputs use the same
  // premium grayscale card instead of silently removing the real player.
  const visibleCards = useMemo(() => cards.slice(0, visibleCount), [cards, visibleCount]);
  const hasMore = visibleCards.length < cards.length;
  const zoomCopy = getTouchlineCardZoomCopy(locale, draftLocalesEnabled);
  const exactCopy = getTouchlineExactCardCopy(locale, draftLocalesEnabled);
  const rosterCopy = getTouchlineClubHubRosterCopy(locale, draftLocalesEnabled);

  return (
    <>
      <div className={["club-hub-card-grid", styles.grid, className].filter(Boolean).join(" ")} aria-live="polite">
        {visibleCards.map((card, index) => {
          const positionKind = touchlinePlayerPositionKind(card.position);
          const cardReview = card.cardReview ?? evaluateTouchlineCardCompleteness({
            displayName: card.name,
            shirtNumber: card.shirtNumber,
            countryCode3: card.countryCode3,
            position: card.position,
            hasVerifiedMarketValue: Boolean(card.editorialCard),
            hasClubAsset: Boolean(findTouchLineClub(card.clubName)?.logoUrl),
          });
          const exactPlayer = squadCardToExactPlayer({ ...card, cardReview });
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
            <article
              key={card.id}
              className={`club-hub-card ${styles.frame}`}
              style={{ "--tier-accent": tierAccent } as CSSProperties}
              data-squad-tier-frame={tierKey ?? "unresolved"}
            >
              <TouchlineClubPerimeterTrace accent={tierKey ? tierAccent : undefined} />
              <span className={`club-hub-rank ${styles.rank}`}>#{index + 1}</span>
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
                    layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                    playerProfileHref={profileHref}
                    staticRenderScale={390 / 430}
                    forceNeonActive
                    hideMarketValuePanel={hideMarketValuePanel}
                  />
                )}
              >
                <TouchlineEliteExactCard draftLocalesEnabled={draftLocalesEnabled} runtimeLocaleOverride={locale}
                  className={`club-hub-rendered-card ${styles.artwork}`}
                  player={exactPlayer}
                  showUnpublishedIdentity
                  labels={labels}
                  imageLoading="lazy"
                  initialRenderScale={cardRenderScale}
                  layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                  playerProfileHref={profileHref}
                    showProfileAction={false}
                    hideMarketValuePanel={hideMarketValuePanel}
                    showSocialMetrics={false}
                    showMatchRating
                />
              </TouchlineCardZoom>
              <div className={`club-hub-card-meta ${styles.meta}`}>
                <a href={profileHref} aria-label={`${openProfileLabel}: ${card.name}`}>{openProfileLabel}</a>
                <small>{localizedPositionLabel(card.position, locale, draftLocalesEnabled)}</small>
              </div>
            </article>
          );
        })}
      </div>

      <div className={`club-hub-progressive-controls ${styles.controls}`}>
        <span>{rosterCopy.shown.replace("{shown}", () => String(visibleCards.length)).replace("{total}", () => String(cards.length))}</span>
        {hasMore ? (
          <button type="button" onClick={() => setVisibleCount((current) => Math.min(cards.length, current + CARD_BATCH_SIZE))}>
            {rosterCopy.loadMore.replace("{count}", () => String(Math.min(CARD_BATCH_SIZE, cards.length - visibleCards.length)))}
          </button>
        ) : null}
      </div>
    </>
  );
}
