"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type CSSProperties } from "react";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import { useTouchlineCardLeadershipAuthority } from "@/components/touchline/cards/TouchlineCardLeadershipProvider";
import { getTouchlineCardZoomCopy } from "@/lib/touchlineArena/card-zoom-i18n";
import { getTouchlineExactCardCopy } from "@/lib/touchlineArena/exact-card-i18n";
import { localizedPositionLabel } from "@/lib/touchlineArena/position-labels";
import { touchlinePlayerPositionKind } from "@/lib/touchlineArena/position-aware-card-stats";
import { TOUCHLINE_CARD_STUDIO_LAYOUT_KEY, findTouchLineClub, squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { normalizeTouchLineLocale, touchLineT, type TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { getTouchLineRankingsCopy } from "@/lib/touchlineArena/rankings-i18n";
import { touchlineArenaPanelHref } from "@/lib/touchlineArena/arena-navigation";
import { touchlineCardTierName, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { buildTouchlinePlayerCardZoomDetails, buildTouchlineVerifiedMatchFactFields } from "@/lib/touchlineArena/card-zoom-details";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { TOUCHLINE_NEUTRAL_CARD_ACCENT } from "@/lib/touchlineArena/public-card-presentation";
import { touchlineCardEnginePlayerHref } from "@/lib/touchlineArena/card-engine-links";
import type { TouchlineActiveRankingState } from "@/lib/touchlineArena/card-ranking-live";
import { projectTouchlinePublishedRankingCatalog } from "@/lib/touchlineArena/published-ranking-catalog";
import { resolveTouchlineRankingZoomSelection, touchlineRankingZoomSelectionForCard, type TouchlineRankingZoomSelection } from "@/lib/touchlineArena/touchline-ranking-zoom-selection";

type Props = {
  catalogue: readonly ClubOwnerSquadCard[];
  seedRanking: TouchlineActiveRankingState;
  locale: TouchLineLocale;
  draftLocalesEnabled?: boolean;
  canEditCardEngine: boolean;
};

/** Public season order only. Editorial economy and latest-match history stay pinned. */
export default function TouchlinePlayerCardRankingsPublication({
  catalogue, seedRanking, locale, draftLocalesEnabled = false, canEditCardEngine,
}: Props) {
  const authority = useTouchlineCardLeadershipAuthority();
  const [selection, setSelection] = useState<TouchlineRankingZoomSelection | null>(null);
  const [selectedSurface, setSelectedSurface] = useState<"featured" | "table" | null>(null);
  const selectedTriggerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  // An absent context may use SSR; an accepted empty publication must not.
  const ranking = authority ? authority.playerRanking : seedRanking;
  const projection = projectTouchlinePublishedRankingCatalog(catalogue, ranking);
  const rankedCards = projection.cards;
  const topCards = rankedCards.slice(0, 3);
  const topTwentyCards = rankedCards.slice(0, 20);
  const selected = selection ? resolveTouchlineRankingZoomSelection(catalogue, ranking, selection) : null;
  const selectedCard = selected?.phase === "available" ? selected.card : null;
  const isSelected = (card: ClubOwnerSquadCard, surface: "featured" | "table") => {
    const identity = touchlineRankingZoomSelectionForCard(card);
    return Boolean(selection && identity && selectedSurface === surface && selection.playerId === identity.playerId
      && selection.providerPlayerId === identity.providerPlayerId);
  };
  const openSelected = (card: ClubOwnerSquadCard, open: boolean, trigger: HTMLElement | null, surface: "featured" | "table") => {
    if (!open) return;
    const identity = touchlineRankingZoomSelectionForCard(card);
    if (!identity) return;
    selectedTriggerRef.current = trigger;
    setSelectedSurface(surface);
    setSelection(identity);
  };
  const zoomCopy = getTouchlineCardZoomCopy(locale, draftLocalesEnabled);
  const exactCopy = getTouchlineExactCardCopy(locale, draftLocalesEnabled);
  const totalRatings = rankedCards.reduce((sum, card) => sum + (card.seasonTotalRating ?? 0), 0);
  const copy = getTouchLineRankingsCopy(locale, draftLocalesEnabled);
  const localeQuery = `lang=${encodeURIComponent(locale)}`;
  const marketTransferHref = (clubSlug?: string) => {
    const marketHref = touchlineArenaPanelHref("market", locale, draftLocalesEnabled);
    return clubSlug ? `${marketHref}&club=${encodeURIComponent(clubSlug)}` : marketHref;
  };
  const rankingModeLabel = projection.phase === "ready"
    ? copy.publishedRatingOrder
    : exactCopy.pending;
  const editorialCopy = {
    rankingDescription: copy.publishedRankingDescription,
  };
  const cardLabels = {
    nationality: draftLocalesEnabled ? exactCopy.nationality : touchLineT(normalizeTouchLineLocale(locale), "nationalityShort"),
    totalRating: exactCopy.totalRating,
  };
  const editorialPresentation = (card: (typeof rankedCards)[number]) => {
    const tierKey = card.editorialCard?.tierKey ?? null;

    return {
      tierKey,
      activeContractCard: null,
    };
  };
  const cardPresentation = (card: ClubOwnerSquadCard) => {
    const presentation = editorialPresentation(card);
    return {
      tierAccent: presentation.tierKey
        ? touchlineCardTierPalette(presentation.tierKey).accent
        : TOUCHLINE_NEUTRAL_CARD_ACCENT,
      tierLabel: presentation.tierKey ? touchlineCardTierName(presentation.tierKey, locale, draftLocalesEnabled) : undefined,
    };
  };
  const zoomPresentation = (card: ClubOwnerSquadCard) => {
    const positionKind = touchlinePlayerPositionKind(card.position);
    const profileHref = touchlinePlayerProfileHref(squadCardToExactPlayer(card), locale);
    return {
      ...cardPresentation(card),
      details: buildTouchlinePlayerCardZoomDetails({
        locale,
        draftLocalesEnabled,
        name: card.name,
        clubName: card.clubName,
        position: card.position,
        positionKind: positionKind === "unknown" ? undefined : positionKind,
        nationality: card.countryCode3,
        editorialCard: card.editorialCard,
        cardReview: card.cardReview,
        activeContractCard: null,
        extraFields: [
          {
            label: exactCopy.totalRating,
            value: card.seasonTotalRating === null || card.seasonTotalRating === undefined
              ? "—"
              : String(card.seasonTotalRating),
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
      }),
      activeContractPrice: undefined,
    };
  };
  const selectedZoom = selectedCard ? zoomPresentation(selectedCard) : null;

  return (
      <section className="tl-card-rankings-shell" data-ranking-publication={projection.phase}>
        <header className="tl-card-rankings-hero">
          <div>
            <span>TouchLine England</span>
            <h1 ref={headingRef} tabIndex={-1} data-ranking-zoom-focus-anchor="true">{copy.rankingTitle}</h1>
            <p>{editorialCopy.rankingDescription}</p>
          </div>
          <div className="tl-card-rankings-metrics" aria-label={copy.playerRankingSummary}>
            <article>
              <span>{copy.cards}</span>
              <strong>{projection.phase === "ready" ? rankedCards.length : "—"}</strong>
            </article>
            <article>
              <span>{copy.ratingSum}</span>
              <strong>{projection.phase === "ready" ? totalRatings.toFixed(2) : "—"}</strong>
            </article>
            <article className="is-mode">
              <span>{copy.mode}</span>
              <strong>{rankingModeLabel}</strong>
            </article>
          </div>
        </header>

        {projection.phase === "ready" ? <>
        <section className="tl-card-rankings-featured" aria-label={copy.topPlayerCards}>
          {topCards.map((card, index) => {
            const club = findTouchLineClub(card.clubName);
            const exactPlayer = squadCardToExactPlayer(card);
            const zoom = cardPresentation(card);
            const featuredSummary = [
              localizedPositionLabel(card.position, locale, draftLocalesEnabled),
            ].filter(Boolean).join(" / ");
            return (
              <article key={card.id} id={card.id} data-ranking-tier-frame={card.editorialCard?.tierKey ?? "unresolved"} style={{ "--tier-accent": zoom.tierAccent } as CSSProperties}>
                <TouchlineClubPerimeterTrace accent={card.editorialCard?.tierKey ? zoom.tierAccent : undefined} />
                <span className="tl-card-rankings-rank">#{index + 1}</span>
                <div className="tl-card-rankings-card">
                  <TouchlineCardZoom
                    presentationMode="trigger-only"
                    open={isSelected(card, "featured")}
                    onOpenChange={(open, trigger) => openSelected(card, open, trigger, "featured")}
                    locale={locale}
                    draftLocalesEnabled={draftLocalesEnabled}
                    ariaLabel={zoomCopy.openCard.replace("{playerName}", () => card.name)}
                    tierAccent={zoom.tierAccent}
                    tierLabel={zoom.tierLabel}
                  >
                    <TouchlineEliteExactCard
                      player={exactPlayer}
                      runtimeLocaleOverride={locale}
                      draftLocalesEnabled={draftLocalesEnabled}
                      hideMarketValuePanel={false}
                      labels={cardLabels}
                      layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                      imageLoading="lazy"
                      showProfileAction={false}
                      showSocialMetrics={false}
                    />
                  </TouchlineCardZoom>
                </div>
                <div className="tl-card-rankings-featured-copy">
                  <span>{club?.shortCode ?? card.clubName}</span>
                  <strong>{card.name}</strong>
                  <small>{featuredSummary}</small>
                  <div>
                    <a href={marketTransferHref(club?.slug)}>{copy.marketTransfer}</a>
                    {club ? <a href={`/touchline-clubs/${club.slug}?${localeQuery}`}>{copy.clubHub}</a> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="tl-card-rankings-board" aria-label={copy.fullPlayerRanking}>
          <div className="tl-card-rankings-board-head">
            <div>
              <span>{copy.completeRanking}</span>
              <strong>{copy.officialTopTwenty}</strong>
            </div>
            <small>{copy.connectedDescription}</small>
          </div>

          <div className="tl-card-rankings-list">
            {topTwentyCards.map((card, index) => {
              const club = findTouchLineClub(card.clubName);
              const exactPlayer = squadCardToExactPlayer(card);
              const zoom = cardPresentation(card);
              return (
                <article key={card.id} id={`row-${card.id}`} className="tl-card-rankings-row" data-ranking-tier-frame={card.editorialCard?.tierKey ?? "unresolved"} style={{ "--tier-accent": zoom.tierAccent } as CSSProperties}>
                  <TouchlineClubPerimeterTrace accent={card.editorialCard?.tierKey ? zoom.tierAccent : undefined} />
                  <span className="tl-card-rankings-row-rank" aria-label={`${copy.playerRank} ${index + 1}`}>#{index + 1}</span>
                  <div className="tl-card-rankings-row-card">
                    <TouchlineCardZoom
                      presentationMode="trigger-only"
                      open={isSelected(card, "table")}
                      onOpenChange={(open, trigger) => openSelected(card, open, trigger, "table")}
                      locale={locale}
                      draftLocalesEnabled={draftLocalesEnabled}
                      ariaLabel={zoomCopy.openCard.replace("{playerName}", () => card.name)}
                      tierAccent={zoom.tierAccent}
                      tierLabel={zoom.tierLabel}
                    >
                      <TouchlineEliteExactCard
                        player={exactPlayer}
                        runtimeLocaleOverride={locale}
                        draftLocalesEnabled={draftLocalesEnabled}
                        hideMarketValuePanel={false}
                        labels={cardLabels}
                        layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                        imageLoading="lazy"
                        showProfileAction={false}
                        showSocialMetrics={false}
                      />
                    </TouchlineCardZoom>
                  </div>
                  <div className="tl-card-rankings-row-main">
                    <strong>{card.name}</strong>
                    <small>{localizedPositionLabel(card.position, locale, draftLocalesEnabled)} / #{card.shirtNumber} / {card.countryCode3}</small>
                  </div>
                  <div className="tl-card-rankings-club">
                    {club?.logoUrl ? <img src={club.logoUrl} alt="" draggable={false} /> : null}
                    <span>{club?.shortCode ?? card.clubName}</span>
                  </div>
                  <div className="tl-card-rankings-actions">
                    <a href={marketTransferHref(club?.slug)}>{copy.marketTransfer}</a>
                    {club ? <a href={`/touchline-clubs/${club.slug}?${localeQuery}`}>{copy.club}</a> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        </> : (
          <section className="tl-card-rankings-board" role="status" aria-label={copy.fullPlayerRanking}>
            <div className="tl-card-rankings-board-head">
              <div>
                <span>{copy.rankingTitle}</span>
                <strong>{exactCopy.pending}</strong>
              </div>
              <small>{copy.rankingPendingDescription}</small>
            </div>
          </section>
        )}
        {/* Identity, not rank/list membership, owns this one persistent dialog. */}
        <TouchlineCardZoom
          presentationMode="dialog-only"
          open={selection !== null}
          onOpenChange={(open) => { if (!open) { setSelection(null); setSelectedSurface(null); } }}
          returnFocusRef={selectedTriggerRef}
          returnFocusFallbackRef={headingRef}
          locale={locale}
          draftLocalesEnabled={draftLocalesEnabled}
          ariaLabel={selectedCard ? zoomCopy.openCard.replace("{playerName}", () => selectedCard.name) : exactCopy.pending}
          tierAccent={selectedZoom?.tierAccent}
          tierLabel={selectedZoom?.tierLabel}
          details={selectedZoom?.details}
          detailsContent={selection && !selectedCard ? <p role="status" data-ranking-zoom-unavailable="true">{exactCopy.pending}</p> : undefined}
          expandedContent={selectedCard ? (
            <TouchlineEliteExactCard
              player={squadCardToExactPlayer(selectedCard)}
              runtimeLocaleOverride={locale}
              draftLocalesEnabled={draftLocalesEnabled}
              hideMarketValuePanel={false}
              labels={cardLabels}
              layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
              imageLoading="eager"
              showCardActions
              showProfileAction
              forceNeonActive
            />
          ) : null}
        >{null}</TouchlineCardZoom>
      </section>
  );
}
