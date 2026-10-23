"use client";

import type { CSSProperties, ReactNode } from "react";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { localizedPositionLabel } from "@/lib/touchlineArena/position-labels";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";

/** Same composition as the existing ClubOwner market. Parent uses its canonical grid CSS. */
export default function TouchlineMarketPlayerTile({ card, locale, draftLocalesEnabled = false, liveSeasonRating = false, children }: {
  card: ClubOwnerSquadCard; locale: string; draftLocalesEnabled?: boolean; liveSeasonRating?: boolean; children?: ReactNode;
}) {
  const tierKey = card.editorialCard?.tierKey;
  const palette = tierKey ? touchlineCardTierPalette(tierKey) : null;
  return <article data-market-tier-frame={tierKey ?? "unresolved"}
    style={{ "--tier-accent": palette?.accent } as CSSProperties}>
    <TouchlineClubPerimeterTrace accent={palette?.accent} />
    <span><TouchlineGameweekCard liveSeasonRating={liveSeasonRating} card={card} locale={locale} draftLocalesEnabled={draftLocalesEnabled} displayWidth={126} fitContainer /></span>
    <div><strong>{card.name}</strong><small>{localizedPositionLabel(card.position, locale, draftLocalesEnabled)}</small><em>{card.clubName}</em>{children}</div>
  </article>;
}
