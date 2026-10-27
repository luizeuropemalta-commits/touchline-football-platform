"use client";

import TouchlineCardZoom, { type TouchlineSigningActions } from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { getTouchlineExactCardCopy } from "@/lib/touchlineArena/exact-card-i18n";
import { touchlinePlayerPositionKind } from "@/lib/touchlineArena/position-aware-card-stats";
import { useTouchlineCardLeadershipAuthority } from "@/components/touchline/cards/TouchlineCardLeadershipProvider";
import { projectTouchlineSeasonCard } from "@/lib/touchlineArena/player-season-presentation";

export default function TouchlineGameweekCard({ card, locale, compact = false, displayWidth, fitContainer = false, imageLoading = "eager", draftLocalesEnabled = false, liveSeasonRating = false, replacementAction, removalAction, releaseAction, signingActions, lockedReason }: {
  card: ClubOwnerSquadCard;
  locale: string;
  draftLocalesEnabled?: boolean;
  /** Only current public season display; historical and contract reviews stay pinned. */
  liveSeasonRating?: boolean;
  compact?: boolean;
  displayWidth?: number;
  /** Grid thumbnails follow their column; transformed pitch cards retain an explicit scale. */
  fitContainer?: boolean;
  /** Thumbnail delivery only; an explicitly opened zoom stays eager. */
  imageLoading?: "eager" | "lazy";
  replacementAction?: { label: string; onSelect: () => void; disabled?: boolean };
  removalAction?: { label: string; onSelect: () => void; disabled?: boolean };
  releaseAction?: { label: string; onSelect: () => void; disabled?: boolean };
  signingActions?: TouchlineSigningActions;
  lockedReason?: string;
}) {
  const copy = getTouchlineExactCardCopy(locale, draftLocalesEnabled);
  const authority = useTouchlineCardLeadershipAuthority();
  const displayCard = projectTouchlineSeasonCard(card, authority, liveSeasonRating);
  const positionKind = touchlinePlayerPositionKind(card.position);
  const exact = squadCardToExactPlayer(displayCard);
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
  // Fluid comparison/gallery cards can grow beyond thumbnail size. Preserve
  // the original frame instead of stretching the 119px live asset.
  const useLiveCompactAsset = !fitContainer && resolvedDisplayWidth <= 119;
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
      value: displayCard.seasonTotalRating == null ? "—" : displayCard.seasonTotalRating.toFixed(2),
      accent: true,
      primary: true,
      kind: "rating-total",
    }],
    profileHref,
  });
  return <TouchlineCardZoom
    replacementAction={replacementAction}
    removalAction={replacementAction ? undefined : removalAction}
    releaseAction={releaseAction}
    signingActions={signingActions}
    lockedReason={lockedReason}
    locale={locale}
    draftLocalesEnabled={draftLocalesEnabled}
    ariaLabel={copy.cardAria.replace("{playerName}", () => card.name)}
    socialProviderId={String(exact.sportmonksPlayerId ?? "")}
    tierAccent={palette.accent}
    details={details}
    expandedContent={<TouchlineEliteExactCard
      player={exact}
      draftLocalesEnabled={draftLocalesEnabled}
      hideMarketValuePanel={false}
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
      hideMarketValuePanel={false}
      staticRenderScale={fitContainer ? undefined : resolvedDisplayWidth / 430}
      optimizeForLiveCompact={useLiveCompactAsset}
      imageLoading={imageLoading}
      runtimeLocaleOverride={locale}
      subscribeToRanking={false}
      enableInteractiveNeon={false}
      showCardActions={false}
      showProfileAction={false}
      showSocialMetrics={false}
      rankingMode="preview"
    />
  </TouchlineCardZoom>;
}
