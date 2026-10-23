"use client";

import type { CSSProperties } from "react";
import { useTouchlineCardLeadershipAuthority } from "./cards/TouchlineCardLeadershipProvider";
import TouchlineGameweekCard from "./fantasy/TouchlineGameweekCard";
import TouchlineClubPerimeterTrace from "./TouchlineClubPerimeterTrace";
import { projectClubPositionLeaders } from "@/lib/touchlineArena/club-position-leaders";
import { getTouchlineClubHubProfileCopy } from "@/lib/touchlineArena/club-hub-profile-i18n";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import type { TouchlineActiveRankingState } from "@/lib/touchlineArena/card-ranking-live";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import styles from "./club-hub/ClubHubPremiumPrototype.module.css";

export default function ClubHubPositionLeaders({ cards, seed, enabled = false, locale, draftLocalesEnabled = false }: {
  cards: readonly ClubOwnerSquadCard[]; seed: TouchlineActiveRankingState; enabled?: boolean;
  locale: string; draftLocalesEnabled?: boolean;
}) {
  const authority = useTouchlineCardLeadershipAuthority();
  const ranking = enabled && authority?.playerRanking ? authority.playerRanking : seed;
  const copy = getTouchlineClubHubProfileCopy(locale, draftLocalesEnabled);
  return <>{projectClubPositionLeaders(cards, ranking).map(({ key, copyKey, leader }) => {
    const tierKey = leader?.card.editorialCard?.tierKey ?? null;
    const tierAccent = tierKey ? touchlineCardTierPalette(tierKey).accent : "#9eaaa5";
    return <article className={styles.lineupLeaderCard} data-clubhub-card-spotlight={`position-${key}`} key={key}
      data-leader-tier-frame={tierKey ?? "unresolved"} style={{ "--tier-accent": tierAccent } as CSSProperties}>
      <TouchlineClubPerimeterTrace accent={tierKey ? tierAccent : undefined} className={styles.lineupLeaderTrace} />
      <header><span>{copy[copyKey]}</span><strong>{leader?.card.name ?? copy.awaitingRanking}</strong></header>
      {leader ? <div className={styles.lineupLeaderVisual}>
        <TouchlineGameweekCard card={leader.card} locale={locale} displayWidth={112} draftLocalesEnabled={draftLocalesEnabled} />
      </div> : <div className={styles.lineupLeaderAwaiting} role="status">—</div>}
      <small>{leader ? `#${leader.positionRank}` : copy.rankingChecking}</small>
    </article>;
  })}</>;
}
