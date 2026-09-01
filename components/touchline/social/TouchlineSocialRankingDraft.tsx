import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import {
  TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION,
  type TouchlineSocialRankingFamilyDraft,
} from "@/lib/touchlineArena/social-ranking-family-draft-server";
import { TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES } from "@/lib/touchlineArena/social-visual-tokens";

import styles from "./TouchlineSocialRankingDraft.module.css";

const TITLE = Object.freeze({
  GAMEWEEK_RANKING_PREVIEW: ["CURRENT TOP 3", "RANKING RACE"],
  GAMEWEEK_RANKING_FINAL: ["FINAL TOP 3", "GAMEWEEK RANKING"],
  PLAYER_DUEL: ["WHO COMES OUT ON TOP?", "TOUCHLINE CARD DUEL"],
  GAMEWEEK_HERO: ["CURRENT GAMEWEEK LEADER", "GAMEWEEK HERO"],
  TOP_PERFORMER: ["OFFICIAL MATCH RATING", "TOP PERFORMER"],
  HAT_TRICK_HERO: ["THREE GOALS. ONE HERO.", "HAT-TRICK HERO"],
} as const);

function cardScale(count: number) {
  return count === 1 ? 0.82 : count === 2 ? 0.69 : 0.58;
}

export default function TouchlineSocialRankingDraftView({
  draft,
}: Readonly<{ draft: TouchlineSocialRankingFamilyDraft }>) {
  const [eyebrow, title] = TITLE[draft.contentType];
  const css = {
    ...TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES,
    "--ranking-arena": `url("${draft.arenaImageUrl}")`,
    "--ranking-count": draft.cards.length,
  } as CSSProperties;
  return (
    <main
      className={styles.canvas}
      style={css}
      data-social-art="touchline-ranking-family"
      data-content-type={draft.contentType}
      data-template-version={TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION}
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-fixture-id={draft.fixtureId}
      data-scope-id={draft.scopeId ?? undefined}
      data-player-id={draft.playerId ?? undefined}
      data-card-count={draft.cards.length}
      data-public-source="TouchLine Verified"
    >
      <div className={styles.arena} aria-hidden="true" />
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.brand}>
          <Image src="/touchlineArena/brand/tl-shield-lime.svg" alt="" width={56} height={66} priority />
          <div><span>TOUCHLINE</span><strong>{title}</strong></div>
        </div>
        <div className={styles.verified}>
          <span>TOUCHLINE VERIFIED</span>
          <strong>PREMIER LEAGUE · GAMEWEEK {draft.gameweekNumber}</strong>
        </div>
      </header>

      <section className={styles.hero}>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        {draft.gameweekOpen && draft.contentType !== "PLAYER_DUEL" ? <p>GAMEWEEK STILL OPEN</p> : null}
      </section>

      {draft.home && draft.away ? (
        <section className={styles.fixture} aria-label={`${draft.home.name} versus ${draft.away.name}`}>
          <div><Image src={draft.home.logoUrl} alt={`${draft.home.name} crest`} width={72} height={72} /><strong>{draft.home.name}</strong></div>
          <b>VS</b>
          <div><Image src={draft.away.logoUrl} alt={`${draft.away.name} crest`} width={72} height={72} /><strong>{draft.away.name}</strong></div>
        </section>
      ) : null}

      <section className={styles.cards} aria-label="TouchLine ranking cards">
        {draft.cards.map((entry) => (
          <article key={entry.card.id} className={styles.card} data-rank={entry.overallRank} data-card-axis="0deg">
            <div className={styles.ordinal}>{entry.overallRank > 0 ? `#${entry.overallRank}` : "★"}</div>
            <div className={styles.cardFrame}>
              <TouchlineEliteExactCard
                player={squadCardToExactPlayer(entry.card, { useSuppliedTier: true })}
                staticRenderScale={cardScale(draft.cards.length)}
                ensureStaticNameFit
                runtimeLocaleOverride="en-GB"
                subscribeToRanking={false}
                enableInteractiveNeon={false}
                showCardActions={false}
                showProfileAction={false}
                showSocialMetrics={false}
                rankingMode="preview"
                forceNeonActive
                imageLoading="eager"
              />
            </div>
            <div className={styles.identity}>
              <span>{entry.card.clubName}</span>
              <strong>{entry.card.name}</strong>
              <div><b>{entry.totalRating.toFixed(2)}</b><small>TOTAL RATING</small></div>
              {entry.officialMatchRating !== null ? (
                <div className={styles.matchRating}><b>{entry.officialMatchRating.toFixed(2)}</b><small>OFFICIAL MATCH RATING</small></div>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      {draft.confirmedGoals !== null ? (
        <div className={styles.achievement}>{draft.confirmedGoals} CONFIRMED GOALS</div>
      ) : null}

      <footer className={styles.footer}>
        <span>TOUCHLINE VERIFIED</span>
        <strong>COMING SOON <i>•</i> CURRENTLY IN TESTING</strong>
      </footer>
    </main>
  );
}
