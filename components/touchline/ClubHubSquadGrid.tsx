"use client";

import { useMemo, useState } from "react";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
} from "@/lib/touchlineArena/demo-data";
import {
  resolveTouchlineVerifiedPlayerEconomy,
  touchlineCardTierName,
  touchlineCardTierPalette,
} from "@/lib/touchlineArena/card-rules";
import { formatTouchlineVerifiedCommercialCardPrice } from "@/lib/touchlineArena/commercial-card-pricing";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineArenaContractHref } from "@/lib/touchlineArena/arena-navigation";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";

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
  clubId: string;
  locale: TouchLineLocale;
  labels: {
    nationality: string;
    points: string;
    totalPoints: string;
    cardPrice: string;
    currentClub: string;
  };
  openProfileLabel: string;
};

/**
 * Progressive ClubHub roster: the first useful group is interactive at once,
 * while off-screen card products are mounted only when the supporter asks for
 * them. This preserves the canonical card component without hydrating 25–30
 * heavy products during the first mobile render.
 */
export default function ClubHubSquadGrid({ cards, clubId, locale, labels, openProfileLabel }: ClubHubSquadGridProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_CARD_COUNT);
  const visibleCards = useMemo(() => cards.slice(0, visibleCount), [cards, visibleCount]);
  const hasMore = visibleCards.length < cards.length;
  const pt = locale === "pt-BR";

  return (
    <>
      <div className="club-hub-card-grid" aria-live="polite">
        {visibleCards.map((card, index) => {
          const exactPlayer = squadCardToExactPlayer(card);
          const economy = resolveTouchlineVerifiedPlayerEconomy({
            marketValue: card.marketValue,
            marketValueSource: card.marketValueSource,
          });
          const updating = pt ? "Em atualização" : "Updating";
          const zoomTier = economy.status === "resolved" ? economy.tierKey : card.cardTier;
          const profileHref = touchlinePlayerProfileHref({
            sportmonksPlayerId: card.id,
            name: card.name,
            clubName: card.clubName,
            position: card.position,
            shirtNumber: card.shirtNumber,
            countryCode3: card.countryCode3,
          }, locale, { previewTier: card.cardTier });

          return (
            <article key={card.id} className="club-hub-card">
              <span className="club-hub-rank">#{index + 1}</span>
              <TouchlineCardZoom
                ariaLabel={`${pt ? "Ampliar card de" : "Expand card for"} ${card.name}`}
                contractHref={touchlineArenaContractHref({ locale, playerId: card.id, playerName: card.name, clubId })}
                contractLabel={pt ? "Contratar" : "Contract player"}
                contractValue={formatTouchlineVerifiedCommercialCardPrice({
                  marketValue: card.marketValue,
                  marketValueSource: card.marketValueSource,
                  competition: "england",
                  locale,
                })}
                contractTermLabel={pt ? "Contrato · 1 temporada" : "Contract · 1 season"}
                tierAccent={touchlineCardTierPalette(zoomTier).accent}
                tierLabel={economy.status === "resolved" ? touchlineCardTierName(economy.tierKey, locale) : updating}
                details={buildTouchlinePlayerCardZoomDetails({
                  locale,
                  name: card.name,
                  clubName: card.clubName,
                  position: card.position,
                  nationality: card.countryCode3,
                  marketValue: card.marketValue,
                  marketValueSource: card.marketValueSource,
                  touchlinePoints: card.touchlinePoints,
                  profileHref,
                })}
                expandedContent={(
                  <TouchlineEliteExactCard
                    player={exactPlayer}
                    labels={labels}
                    imageLoading="lazy"
                    layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                    playerProfileHref={profileHref}
                    forceNeonActive
                  />
                )}
              >
                <TouchlineEliteExactCard
                  className="club-hub-rendered-card"
                  player={exactPlayer}
                  labels={labels}
                  imageLoading={index < 4 ? "eager" : "lazy"}
                  initialRenderScale={180 / 430}
                  layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                  playerProfileHref={profileHref}
                  showProfileAction={false}
                  showSocialMetrics={false}
                />
              </TouchlineCardZoom>
              <div className="club-hub-card-meta">
                <a href={profileHref} aria-label={`${openProfileLabel}: ${card.name}`}>{openProfileLabel}</a>
                <small>
                  {localizedPosition(card.position, pt)} / {economy.status === "resolved" ? card.marketValue : (pt ? "Valor de mercado pendente" : "Market value pending")} / {card.touchlinePoints} pts
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
