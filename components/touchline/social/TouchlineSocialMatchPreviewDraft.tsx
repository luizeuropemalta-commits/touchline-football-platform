import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineSocialDuelFrame from "@/components/touchline/social/TouchlineSocialDuelFrame";
import TouchlineSocialFixtureScoreboard from "@/components/touchline/social/TouchlineSocialFixtureScoreboard";
import type { TouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";
import { touchlineEnglishOrdinal } from "@/lib/touchlineArena/social-match-preview-caption";
import { TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION } from "@/lib/touchlineArena/social-match-preview-draft-server";
import {
  TOUCHLINE_SOCIAL_DUEL_FRAME,
  TOUCHLINE_SOCIAL_DUEL_FRAME_VERSION,
} from "@/lib/touchlineArena/social-duel-frame";
import { TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES } from "@/lib/touchlineArena/social-visual-tokens";

import styles from "./TouchlineSocialMatchPreviewDraft.module.css";

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
      data-template-version={TOUCHLINE_MATCH_PREVIEW_TEMPLATE_VERSION}
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-source-snapshot-at={draft.sourceSnapshotAt}
      data-starts-at={draft.startsAt}
      data-caption={draft.caption}
      data-home-team-key={draft.home.club.shortCode}
      data-away-team-key={draft.away.club.shortCode}
      data-lineup-fields="absent"
      data-duel-frame-version={TOUCHLINE_SOCIAL_DUEL_FRAME_VERSION}
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

      <TouchlineSocialFixtureScoreboard
        className={styles.fixture}
        mode="versus"
        home={draft.home.club}
        away={draft.away.club}
        eyebrow={kickOffLabel(draft.startsAt)}
        footer={draft.venue.name.toLocaleUpperCase("en-GB")}
      />

      <div className={styles.duelHeading}>
        <span>{TOUCHLINE_SOCIAL_DUEL_FRAME.heading}</span>
        <h1>WHO COMES OUT ON TOP?</h1>
      </div>

      <TouchlineSocialDuelFrame sides={[
        {
          teamId: draft.home.club.teamId,
          shortCode: draft.home.club.shortCode,
          clubName: draft.home.club.name,
          accent: draft.home.club.accent,
          secondaryAccent: draft.home.club.secondaryAccent,
          card: draft.home.leader.card,
          totalRating: draft.home.leader.totalRating,
        },
        {
          teamId: draft.away.club.teamId,
          shortCode: draft.away.club.shortCode,
          clubName: draft.away.club.name,
          accent: draft.away.club.accent,
          secondaryAccent: draft.away.club.secondaryAccent,
          card: draft.away.leader.card,
          totalRating: draft.away.leader.totalRating,
        },
      ]} />

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
