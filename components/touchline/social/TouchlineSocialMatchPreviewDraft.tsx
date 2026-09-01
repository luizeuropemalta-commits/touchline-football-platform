import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import type { TouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";
import { touchlineEnglishOrdinal } from "@/lib/touchlineArena/social-match-preview-caption";
import { TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION } from "@/lib/touchlineArena/social-match-preview-draft-server";
import { TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES } from "@/lib/touchlineArena/social-visual-tokens";

import styles from "./TouchlineSocialMatchPreviewDraft.module.css";

const CARD_WIDTH = 292;

function kickOffLabel(startsAt: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Malta",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startsAt)).replace(",", " ·");
}

function sideStyle(accent: string, secondaryAccent: string) {
  return {
    "--preview-accent": accent,
    "--preview-secondary": secondaryAccent,
  } as CSSProperties;
}

export default function TouchlineSocialMatchPreviewDraftView({
  draft,
}: Readonly<{ draft: TouchlineSocialMatchPreviewDraft }>) {
  const canvasStyle = {
    ...TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES,
    "--preview-home-accent": draft.home.club.accent,
    "--preview-away-accent": draft.away.club.accent,
    "--preview-stadium": `url("${draft.venue.interiorImageUrl}")`,
  } as CSSProperties;
  return (
    <main
      className={styles.canvas}
      style={canvasStyle}
      data-social-art="touchline-match-preview"
      data-content-type="MATCH_PREVIEW"
      data-fixture-id={draft.fixtureId}
      data-template-version={TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION}
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-source-snapshot-at={draft.sourceSnapshotAt}
      data-starts-at={draft.startsAt}
      data-caption={draft.caption}
      data-home-team-id={draft.home.club.teamId}
      data-away-team-id={draft.away.club.teamId}
      data-lineup-fields="absent"
    >
      <div className={styles.stadium} aria-hidden="true" />
      <div className={styles.atmosphere} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.brand}>
          <Image src="/touchlineArena/brand/tl-shield-lime.svg" alt="" width={54} height={64} priority />
          <div><span>TOUCHLINE</span><strong>MATCH PREVIEW</strong></div>
        </div>
        <div className={styles.verified}>
          <span>TOUCHLINE VERIFIED</span>
          <strong>PREMIER LEAGUE · GAMEWEEK {draft.gameweekNumber}</strong>
        </div>
      </header>

      <section className={styles.fixture} aria-label={`${draft.home.club.name} versus ${draft.away.club.name}`}>
        <div className={styles.clubIdentity}>
          <Image src={draft.home.club.logoUrl} alt={`${draft.home.club.name} crest`} width={112} height={112} priority />
          <strong>{draft.home.club.name}</strong>
        </div>
        <div className={styles.fixtureCore}>
          <span>{kickOffLabel(draft.startsAt)}</span>
          <b>VS</b>
          <small>{draft.venue.name.toLocaleUpperCase("en-GB")}</small>
        </div>
        <div className={styles.clubIdentity}>
          <Image src={draft.away.club.logoUrl} alt={`${draft.away.club.name} crest`} width={112} height={112} priority />
          <strong>{draft.away.club.name}</strong>
        </div>
      </section>

      <div className={styles.duelHeading}>
        <span>LEADING TOUCHLINE CARDS</span>
        <h1>WHO COMES OUT ON TOP?</h1>
      </div>

      <section className={styles.duel} aria-label="Leading TouchLine cards">
        {[draft.home, draft.away].map((side) => (
          <article
            key={side.club.teamId}
            className={styles.contender}
            style={sideStyle(side.club.accent, side.club.secondaryAccent)}
            data-preview-team-id={side.club.teamId}
            data-preview-player-id={side.leader.card.id}
            data-preview-canonical-player-id={side.leader.card.canonicalPlayerId ?? undefined}
            data-preview-total-rating={side.leader.totalRating.toFixed(2)}
            data-preview-card-axis="0deg"
          >
            <div className={styles.cardFrame}>
              <TouchlineEliteExactCard
                player={squadCardToExactPlayer(side.leader.card, { useSuppliedTier: true })}
                staticRenderScale={CARD_WIDTH / 430}
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
            <div className={styles.contenderCopy}>
              <span>{side.club.shortCode} · CURRENT CLUB LEADER</span>
              <strong>{side.leader.card.name}</strong>
              <div><b>{side.leader.totalRating.toFixed(2)}</b><small>TOTAL RATING</small></div>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.tableStrip} aria-label="Current verified league positions">
        {[draft.home, draft.away].map((side) => (
          <div key={side.club.teamId}>
            <Image src={side.club.logoUrl} alt="" width={34} height={34} />
            <span>{side.club.shortCode}</span>
            <strong>{touchlineEnglishOrdinal(side.table.displayPosition)}</strong>
            <small>{side.table.points} PTS · {side.table.played} PLD</small>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <span>TOUCHLINE VERIFIED MATCH DATA</span>
        <strong>COMING SOON <i>•</i> CURRENTLY IN TESTING</strong>
      </footer>
    </main>
  );
}
