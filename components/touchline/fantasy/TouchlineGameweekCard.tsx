"use client";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { getTouchlineExactCardCopy } from "@/lib/touchlineArena/exact-card-i18n";
import { touchlinePlayerPositionKind } from "@/lib/touchlineArena/position-aware-card-stats";

export default function TouchlineGameweekCard({ card, locale, compact = false, displayWidth, fitContainer = false, draftLocalesEnabled = false }: {
  card: ClubOwnerSquadCard;
  locale: string;
  draftLocalesEnabled?: boolean;
  compact?: boolean;
  displayWidth?: number;
  /** Grid thumbnails follow their column; transformed pitch cards retain an explicit scale. */
  fitContainer?: boolean;
}) {
  const copy = getTouchlineExactCardCopy(locale, draftLocalesEnabled);
  const positionKind = touchlinePlayerPositionKind(card.position);
  const exact = squadCardToExactPlayer(card);
  const palette = touchlineCardTierPalette(card.editorialCard?.tierKey ?? null);
  // Public profile links use TouchLine presentation identity only. Provider
  // identifiers remain server-side and never leak into a card URL.
  const profileHref = touchlinePlayerProfileHref({
    canonicalPlayerId: card.editorialCard ? exact.canonicalPlayerId : null,
    name: exact.name,
    clubName: exact.clubName,
    position: exact.position,
    shirtNumber: exact.shirtNumber,
    countryCode3: exact.countryCode3,
  }, locale, { previewTier: exact.cardTier });
  const resolvedDisplayWidth = displayWidth ?? (compact ? 74 : 132);
  const useLiveCompactAsset = resolvedDisplayWidth <= 119;
  const details = buildTouchlinePlayerCardZoomDetails({
    locale,
    draftLocalesEnabled,
    name: card.name,
    clubName: card.clubName,
    position: card.position,
    positionKind: positionKind === "unknown" ? undefined : positionKind,
    nationality: card.countryCode3,
    editorialCard: card.editorialCard,
    marketValue: card.marketValue,
    marketValueState: card.marketValueState,
    extraFields: [{
      label: copy.totalRating,
      value: card.seasonTotalRating == null ? "—" : card.seasonTotalRating.toFixed(2),
      accent: true,
      primary: true,
      kind: "rating-total",
    }],
    profileHref,
  });
  return <TouchlineCardZoom
    locale={locale}
    draftLocalesEnabled={draftLocalesEnabled}
    ariaLabel={copy.cardAria.replace("{playerName}", () => card.name)}
    socialProviderId={String(exact.sportmonksPlayerId ?? "")}
    tierAccent={palette.accent}
    details={details}
    expandedContent={<TouchlineEliteExactCard
      player={exact}
      draftLocalesEnabled={draftLocalesEnabled}
      hideMarketValuePanel
      staticRenderScale={390 / 430}
      runtimeLocaleOverride={locale}
      subscribeToRanking={false}
      rankingMode="preview"
      forceNeonActive
      playerProfileHref={profileHref}
    />}
  >
    <TouchlineEliteExactCard
      player={exact}
      draftLocalesEnabled={draftLocalesEnabled}
      hideMarketValuePanel
      staticRenderScale={fitContainer ? undefined : resolvedDisplayWidth / 430}
      optimizeForLiveCompact={useLiveCompactAsset}
      runtimeLocaleOverride={locale}
      subscribeToRanking={false}
      enableInteractiveNeon={false}
      showCardActions={false}
      showProfileAction={false}
      showSocialMetrics={false}
      rankingMode="preview"
      forceNeonActive
    />
  </TouchlineCardZoom>;
}
