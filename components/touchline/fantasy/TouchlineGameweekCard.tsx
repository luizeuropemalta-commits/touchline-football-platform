"use client";

import TouchlineCardZoom from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";

export default function TouchlineGameweekCard({ card, locale, compact = false, displayWidth }: {
  card: ClubOwnerSquadCard;
  locale: string;
  compact?: boolean;
  displayWidth?: number;
}) {
  const exact = squadCardToExactPlayer(card);
  const palette = touchlineCardTierPalette(card.editorialCard?.tierKey ?? null);
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
    })}
    expandedContent={<TouchlineEliteExactCard
      player={exact}
      staticRenderScale={390 / 430}
      runtimeLocaleOverride={locale}
      subscribeToRanking={false}
      rankingMode="preview"
      forceNeonActive
    />}
  >
    <TouchlineEliteExactCard
      player={exact}
      staticRenderScale={(displayWidth ?? (compact ? 74 : 132)) / 430}
      optimizeForLiveCompact
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
