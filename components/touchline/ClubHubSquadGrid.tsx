"use client";

import { useMemo, useState } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
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
  buildTouchlineMatchScoringBreakdownFields,
  buildTouchlineVerifiedMatchFactFields,
} from "@/lib/touchlineArena/card-zoom-details";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";

const INITIAL_CARD_COUNT = 8;
const CARD_BATCH_SIZE = 8;

function localizedPosition(value: string, pt: boolean) {
  if (!pt) return value;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("goalkeeper") || normalized === "gk") return "Goleiro";
  if (normalized.includes("defender") || ["cb", "lb", "rb", "df"].includes(normalized)) return "Defensor";
  if (normalized.includes("midfielder") || ["cm", "dm", "am", "mf"].includes(normalized)) return "Meio-campista";
  if (normalized.includes("attacker") || normalized.includes("forward") || ["st", "cf", "lw", "rw", "fw"].includes(normalized)) return "Atacante";
  return value;
}

type ClubHubSquadGridProps = {
  cards: ClubOwnerSquadCard[];
  locale: TouchLineLocale;
  labels: {
    nationality: string;
    points: string;
    totalPoints: string;
    cardPrice: string;
    currentClub: string;
  };
  openProfileLabel: string;
  canEditCardEngine?: boolean;
};

/**
 * Progressive ClubHub roster: the first useful group is interactive at once,
 * while off-screen card products are mounted only when the supporter asks for
 * them. This preserves the canonical card component without hydrating 25–30
 * heavy products during the first mobile render.
 */
export default function ClubHubSquadGrid({ cards, locale, labels, openProfileLabel, canEditCardEngine = false }: ClubHubSquadGridProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_CARD_COUNT);
  // The footballer remains present on every Club Hub surface. Published
  // profiles render in colour; incomplete editorial inputs use the same
  // premium grayscale card instead of silently removing the real player.
  const visibleCards = useMemo(() => cards.slice(0, visibleCount), [cards, visibleCount]);
  const hasMore = visibleCards.length < cards.length;
  const pt = locale === "pt-BR";

  return (
    <>
      <div className="club-hub-card-grid" aria-live="polite">
        {visibleCards.map((card, index) => {
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
          const tierLabel = tierKey ? touchlineCardTierName(tierKey, locale) : undefined;
          const profileHref = touchlinePlayerProfileHref({
            sportmonksPlayerId: card.id,
            name: card.name,
            clubName: card.clubName,
            position: card.position,
            shirtNumber: card.shirtNumber,
            countryCode3: card.countryCode3,
          }, locale);

          return (
            <article key={card.id} className="club-hub-card">
              <span className="club-hub-rank">#{index + 1}</span>
              <TouchlineCardZoom
                ariaLabel={`${pt ? "Ampliar card de" : "Expand card for"} ${card.name}`}
                contractHref={undefined}
                contractLabel={pt ? "Contratar" : "Contract player"}
                contractValue={undefined}
                contractTermLabel={undefined}
                tierAccent={tierAccent}
                tierLabel={tierLabel}
                details={buildTouchlinePlayerCardZoomDetails({
                  locale,
                  name: card.name,
                  clubName: card.clubName,
                  position: card.position,
                  nationality: card.countryCode3,
                  editorialCard: card.editorialCard,
                  cardReview,
                  activeContractCard: null,
                  touchlinePoints: card.seasonTouchlinePoints === undefined
                    ? card.touchlinePoints
                    : card.seasonTouchlinePoints,
                  extraFields: [
                    {
                      label: pt ? "Pontos da partida" : "Match points",
                      value: card.matchTouchlinePoints == null ? "—" : String(card.matchTouchlinePoints),
                      accent: true,
                    },
                    ...buildTouchlineVerifiedMatchFactFields({
                      statistics: card.matchStats,
                      position: card.position || card.role,
                    }, locale),
                    ...buildTouchlineMatchScoringBreakdownFields(card.matchPointContributions, locale),
                  ],
                  profileHref,
                  cardEngineHref: canEditCardEngine
                    ? touchlineCardEnginePlayerHref(card.canonicalPlayerId, locale)
                    : null,
                })}
                expandedContent={(
                  <TouchlineEliteExactCard
                    player={exactPlayer}
                    labels={labels}
                    imageLoading="lazy"
                    layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                    playerProfileHref={profileHref}
                    staticRenderScale={390 / 430}
                    forceNeonActive
                  />
                )}
              >
                <TouchlineEliteExactCard
                  className="club-hub-rendered-card"
                  player={exactPlayer}
                  labels={labels}
                  imageLoading={index < 4 ? "eager" : "lazy"}
                  staticRenderScale={180 / 430}
                  layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                  playerProfileHref={profileHref}
                  showProfileAction={false}
                    showSocialMetrics={false}
                    showMatchPoints
                />
              </TouchlineCardZoom>
              <div className="club-hub-card-meta">
                <a href={profileHref} aria-label={`${openProfileLabel}: ${card.name}`}>{openProfileLabel}</a>
                <small>
                  {localizedPosition(card.position, pt)} / {card.touchlinePoints} pts
                </small>
              </div>
            </article>
          );
        })}
      </div>

      <div className="club-hub-progressive-controls">
        <span>{pt ? `${visibleCards.length} de ${cards.length} jogadores exibidos` : `${visibleCards.length} of ${cards.length} players shown`}</span>
        {hasMore ? (
          <button type="button" onClick={() => setVisibleCount((current) => Math.min(cards.length, current + CARD_BATCH_SIZE))}>
            {pt ? `Ver mais ${Math.min(CARD_BATCH_SIZE, cards.length - visibleCards.length)}` : `View ${Math.min(CARD_BATCH_SIZE, cards.length - visibleCards.length)} more`}
          </button>
        ) : null}
      </div>
    </>
  );
}
