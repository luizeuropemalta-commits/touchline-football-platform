import { Goal, ShieldCheck } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import type { TouchlineSocialConfirmedEventDraft } from "@/lib/touchlineArena/social-confirmed-event-draft-server";
import { formatTouchlineConfirmedEventMinute } from "@/lib/touchlineArena/social-confirmed-event-contract";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";

import styles from "./TouchlineSocialConfirmedEventDraft.module.css";

const CARD_WIDTH = 360;

export default function TouchlineSocialConfirmedEventDraftView({
  draft,
}: Readonly<{ draft: TouchlineSocialConfirmedEventDraft }>) {
  const goal = draft.contentType === "GOAL_CONFIRMED";
  const eventClub = draft.event.playerTeamId === draft.home.teamId ? draft.home : draft.away;
  const eventLabel = goal
    ? draft.event.kind === "own-goal" ? "OWN GOAL" : draft.event.kind === "penalty" ? "PENALTY GOAL" : "GOAL CONFIRMED"
    : draft.event.kind === "second-yellow-red" ? "SECOND YELLOW · RED CARD" : "RED CARD CONFIRMED";
  return (
    <main
      className={styles.canvas}
      style={{
        "--event-accent": goal ? eventClub.accent : "#ff365f",
        "--event-stadium": `url(${JSON.stringify(draft.venue.interiorImageUrl)})`,
      } as CSSProperties}
      data-social-art="touchline-confirmed-event"
      data-social-placement="story"
      data-content-type={draft.contentType}
      data-event-id={draft.eventId}
      data-template-version={goal ? "touchline-goal-confirmed-story-v1" : "touchline-red-card-confirmed-story-v1"}
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-source-snapshot-at={draft.sourceSnapshotAt}
      data-first-observed-at={draft.firstObservedAt}
      data-starts-at={draft.startsAt}
      data-caption={draft.caption}
    >
      <header className={styles.masthead}>
        <span><ShieldCheck size={21} /> TOUCHLINE VERIFIED</span>
        <strong>LIVE MATCH MOMENT</strong>
      </header>

      <section className={styles.scoreboard} aria-label={`${draft.home.name} ${draft.score.home}, ${draft.away.name} ${draft.score.away}`}>
        <article><Image src={draft.home.logoUrl!} alt={draft.home.name} width={150} height={150} priority /><strong>{draft.home.name}</strong></article>
        <div><small>GAMEWEEK {draft.gameweekNumber}</small><b>{draft.score.home}<i>—</i>{draft.score.away}</b><span>{formatTouchlineConfirmedEventMinute(draft.event.minute, draft.event.extraMinute)}</span></div>
        <article><Image src={draft.away.logoUrl!} alt={draft.away.name} width={150} height={150} priority /><strong>{draft.away.name}</strong></article>
      </section>

      <section className={styles.moment}>
        <div className={styles.copy}>
          <span className={styles.eventLabel}>
            {goal
              ? <Goal className={styles.eventIcon} aria-hidden="true" />
              : <i className={styles.redCardIcon} aria-hidden="true" />}
            {eventLabel}
          </span>
          <h1>{draft.event.playerName}</h1>
          <p>{eventClub.name}</p>
          <dl>
            <div><dt>TOTAL RATING</dt><dd>{draft.totalRating.toFixed(2)}</dd></div>
            <div><dt>MATCH RATING</dt><dd>{draft.matchRating === null ? "—" : draft.matchRating.toFixed(2)}</dd></div>
            <div><dt>TOUCHLINE POINTS</dt><dd>{draft.touchlinePoints > 0 ? "+" : ""}{draft.touchlinePoints}</dd></div>
          </dl>
        </div>
        <div className={styles.card} data-player-card-axis="0deg">
          <TouchlineEliteExactCard
            player={squadCardToExactPlayer({ ...draft.playerCard, matchRating: draft.matchRating }, { useSuppliedTier: true })}
            staticRenderScale={CARD_WIDTH / 430}
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
      </section>

      <footer className={styles.footer}>
        <span>TOUCHLINE VERIFIED MATCH DATA</span>
        <strong>COMING SOON <i>•</i> CURRENTLY IN TESTING</strong>
      </footer>
    </main>
  );
}
