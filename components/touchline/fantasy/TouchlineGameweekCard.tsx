"use client";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";

export default function TouchlineGameweekCard({ card, locale, compact = false, displayWidth }: {
  card: ClubOwnerSquadCard;
  locale: string;
  compact?: boolean;
  displayWidth?: number;
}) {
  const exact = squadCardToExactPlayer(card);
  const palette = touchlineCardTierPalette(card.editorialCard?.tierKey ?? null);
  // Public profile links use TouchLine presentation identity only. Provider
  // identifiers remain server-side and never leak into a card URL.
  const profileHref = touchlinePlayerProfileHref({
    name: exact.name,
    clubName: exact.clubName,
    position: exact.position,
    shirtNumber: exact.shirtNumber,
    countryCode3: exact.countryCode3,
  }, locale, { previewTier: exact.cardTier });
  const resolvedDisplayWidth = displayWidth ?? (compact ? 74 : 132);
  const useLiveCompactAsset = resolvedDisplayWidth <= 119;
  return <TouchlineCardZoom
    ariaLabel={`${card.name} TouchLine card`}
    tierAccent={palette.accent}
    details={buildTouchlinePlayerCardZoomDetails({
      locale,
      name: card.name,
      clubName: card.clubName,
      position: card.position,
      nationality: card.countryCode3,
      editorialCard: card.editorialCard,
      marketValue: card.marketValue,
      marketValueState: card.marketValueState,
      extraFields: [{
        label: locale === "pt-BR" ? "Rating total" : "Total Rating",
        value: card.seasonTotalRating == null ? "—" : card.seasonTotalRating.toFixed(2),
        accent: true,
        primary: true,
        kind: "rating-total",
      }],
      profileHref,
    })}
    expandedContent={<TouchlineEliteExactCard
      player={exact}
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
      staticRenderScale={resolvedDisplayWidth / 430}
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
