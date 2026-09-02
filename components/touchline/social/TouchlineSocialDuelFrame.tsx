import type { CSSProperties } from "react";

import TouchlineSocialPublicExactCard from "@/components/touchline/social/TouchlineSocialPublicExactCard";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import {
  TOUCHLINE_SOCIAL_DUEL_FRAME,
  TOUCHLINE_SOCIAL_DUEL_FRAME_VERSION,
} from "@/lib/touchlineArena/social-duel-frame";

import styles from "./TouchlineSocialDuelFrame.module.css";

export type TouchlineSocialDuelSide = Readonly<{
  teamId: string;
  shortCode: string;
  clubName: string;
  accent: string;
  secondaryAccent: string;
  card: ClubOwnerSquadCard;
  totalRating: number;
}>;

function sideStyle(side: TouchlineSocialDuelSide) {
  return {
    "--preview-accent": side.accent,
    "--preview-secondary": side.secondaryAccent,
  } as CSSProperties;
}

function publicPresentationPlayer(side: TouchlineSocialDuelSide) {
  const {
    sportmonksPlayerId: _providerPlayerId,
    canonicalPlayerId: _canonicalPlayerId,
    formationPlayerId: _formationPlayerId,
    ...publicPlayer
  } = squadCardToExactPlayer(side.card, { useSuppliedTier: true });

  // This object crosses the React server/client boundary. Keep every technical
  // identity on the server; the artwork needs presentation fields only.
  return publicPlayer;
}

export default function TouchlineSocialDuelFrame({
  sides,
  ariaLabel = "Leading TouchLine cards",
}: Readonly<{
  sides: readonly [TouchlineSocialDuelSide, TouchlineSocialDuelSide];
  ariaLabel?: string;
}>) {
  return (
    <section
      className={styles.duel}
      aria-label={ariaLabel}
      data-touchline-duel-frame={TOUCHLINE_SOCIAL_DUEL_FRAME_VERSION}
      data-duel-card-count={TOUCHLINE_SOCIAL_DUEL_FRAME.contenderCount}
      data-duel-centre-mark={TOUCHLINE_SOCIAL_DUEL_FRAME.centreMark}
    >
      {sides.map((side) => (
        <article
          key={side.teamId}
          className={styles.contender}
          style={sideStyle(side)}
          data-preview-contender="true"
          data-preview-player-key={`${side.shortCode}:${side.card.name}`}
          data-preview-total-rating={side.totalRating.toFixed(2)}
          data-preview-card-axis={TOUCHLINE_SOCIAL_DUEL_FRAME.cardAxis}
        >
          <div className={styles.cardFrame}>
            <TouchlineSocialPublicExactCard
              player={publicPresentationPlayer(side)}
              renderScale={TOUCHLINE_SOCIAL_DUEL_FRAME.cardWidth / 430}
            />
          </div>
          <div className={styles.contenderCopy}>
            <span>{side.shortCode} · {TOUCHLINE_SOCIAL_DUEL_FRAME.leaderLabel}</span>
            <strong>{side.card.name}</strong>
            <div><b>{side.totalRating.toFixed(2)}</b><small>{TOUCHLINE_SOCIAL_DUEL_FRAME.ratingLabel}</small></div>
          </div>
        </article>
      ))}
    </section>
  );
}
