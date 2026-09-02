import { Goal, ShieldCheck } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineSocialFixtureScoreboard from "@/components/touchline/social/TouchlineSocialFixtureScoreboard";
import type { TouchlineSocialConfirmedEventDraft } from "@/lib/touchlineArena/social-confirmed-event-draft-server";
import { formatTouchlineConfirmedEventMinute } from "@/lib/touchlineArena/social-confirmed-event-contract";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES } from "@/lib/touchlineArena/social-visual-tokens";

import styles from "./TouchlineSocialConfirmedEventDraft.module.css";

const CARD_WIDTH = 460;

export type TouchlineSocialConfirmedEventArtworkDraft = Omit<
  TouchlineSocialConfirmedEventDraft,
  "sourceProvenance"
> & Readonly<{
  sourceProvenance: TouchlineSocialConfirmedEventDraft["sourceProvenance"] | "LOCAL_NON_PUBLISHABLE_VISUAL_QA";
  visualQa?: Readonly<{ sampleData: true; label: string }>;
}>;

export default function TouchlineSocialConfirmedEventDraftView({
  draft,
  placement = "story",
}: Readonly<{ draft: TouchlineSocialConfirmedEventArtworkDraft; placement?: "feed" | "story" }>) {
  const isVisualQa = draft.sourceProvenance === "LOCAL_NON_PUBLISHABLE_VISUAL_QA";
  const cardWidth = placement === "feed" ? 330 : CARD_WIDTH;
  const goal = draft.contentType === "GOAL_CONFIRMED";
  const eventClub = draft.event.playerTeamId === draft.home.teamId ? draft.home : draft.away;
  const eventLabel = goal
    ? draft.event.kind === "own-goal" ? "OWN GOAL" : draft.event.kind === "penalty" ? "PENALTY GOAL" : "GOAL"
    : draft.event.kind === "second-yellow-red" ? "SECOND YELLOW · RED CARD" : "RED CARD";
  return (
    <main
      className={styles.canvas}
      style={{
        ...TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES,
        "--event-accent": goal ? eventClub.accent : "#ff365f",
        "--event-stadium": `url(${JSON.stringify(draft.venue.interiorImageUrl)})`,
      } as CSSProperties}
      data-social-art="touchline-confirmed-event"
      data-social-placement={placement}
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
      data-source-provenance={draft.sourceProvenance}
      data-visual-qa={isVisualQa ? "sample-data" : undefined}
    >
      <div className={styles.stadium} aria-hidden="true" />
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.masthead}>
        <span><ShieldCheck size={21} /> {isVisualQa ? draft.visualQa?.label : "TOUCHLINE VERIFIED"}</span>
        <Image src="/touchlineArena/brand/tl-shield-lime.svg" alt="TouchLine" width={46} height={46} priority />
        <strong className={styles.eventLabel}>
          {goal
            ? <Goal className={styles.eventIcon} aria-hidden="true" />
            : <i className={styles.redCardIcon} aria-hidden="true" />}
          {eventLabel}
        </strong>
      </header>

      <TouchlineSocialFixtureScoreboard
        className={styles.scoreboard}
        variant="event"
        mode="score"
        home={{ name: draft.home.name, shortCode: draft.home.shortCode, logoUrl: draft.home.logoUrl! }}
        away={{ name: draft.away.name, shortCode: draft.away.shortCode, logoUrl: draft.away.logoUrl! }}
        homeScore={draft.score.home}
        awayScore={draft.score.away}
        minute={formatTouchlineConfirmedEventMinute(draft.event.minute, draft.event.extraMinute)}
        eyebrow={`LIVE SCORE · GAMEWEEK ${draft.gameweekNumber}`}
        footer={draft.venue.name}
      />

      <section className={styles.moment}>
        <div className={styles.copy}>
          <h1
            className={goal ? styles.celebrationWord : undefined}
            data-word={goal ? (draft.event.kind === "own-goal" ? "OWN GOALLLLLL" : "GOALLLLLLL") : undefined}
          >{goal ? (draft.event.kind === "own-goal" ? "OWN GOALLLLLL" : "GOALLLLLLL") : "RED CARD"}</h1>
          <h2>{draft.event.playerName}</h2>
          <p>{eventClub.name}</p>
        </div>
        <div className={styles.card} data-player-card-axis="0deg">
          <TouchlineEliteExactCard
            player={squadCardToExactPlayer({ ...draft.playerCard, matchRating: draft.matchRating }, { useSuppliedTier: true })}
            staticRenderScale={cardWidth / 430}
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
        <dl className={styles.metrics}>
          <div><dt>TOTAL RATING</dt><dd>{draft.totalRating.toFixed(2)}</dd></div>
          <div><dt>MATCH RATING</dt><dd>{draft.matchRating === null ? "—" : draft.matchRating.toFixed(2)}</dd></div>
          <div><dt>TOUCHLINE POINTS</dt><dd>{draft.touchlinePoints > 0 ? "+" : ""}{draft.touchlinePoints}</dd></div>
        </dl>
      </section>

      <footer className={styles.footer}>
        <span>{isVisualQa ? "LOCAL VISUAL QA · NON-PUBLISHABLE" : "TOUCHLINE VERIFIED MATCH DATA"}</span>
        <strong>{isVisualQa ? "DESIGN REVIEW" : "LIVE MATCH MOMENT"} <i>•</i> {isVisualQa ? "OUTBOUND DISABLED" : eventClub.shortCode}</strong>
      </footer>
    </main>
  );
}
