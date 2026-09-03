import { ShieldCheck, Trophy } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import type { TouchlineSocialFinalScoreDraft } from "@/lib/touchlineArena/social-final-score-draft-server";
import { TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES } from "@/lib/touchlineArena/social-visual-tokens";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";

import styles from "./TouchlineSocialFinalScoreDraft.module.css";

const TOP_CARD_WIDTH = 286;

export type TouchlineSocialFinalScoreArtworkDraft = Omit<
  TouchlineSocialFinalScoreDraft,
  "sourceProvenance"
> & Readonly<{
  sourceProvenance: TouchlineSocialFinalScoreDraft["sourceProvenance"] | "LOCAL_NON_PUBLISHABLE_VISUAL_QA";
  visualQa?: Readonly<{ sampleData: true; label: string }>;
}>;

function goalMinute(minute: number, extraMinute: number | null) {
  return `${minute}${extraMinute ? `+${extraMinute}` : ""}'`;
}

function goalKindLabel(kind: TouchlineSocialFinalScoreDraft["goals"][number]["kind"]) {
  if (kind === "own-goal") return "OG";
  if (kind === "penalty") return "PEN";
  return null;
}

export default function TouchlineSocialFinalScoreDraftView({
  draft,
  placement = "feed",
}: {
  draft: TouchlineSocialFinalScoreArtworkDraft;
  placement?: "feed" | "story";
}) {
  const isVisualQa = draft.sourceProvenance === "LOCAL_NON_PUBLISHABLE_VISUAL_QA";
  const winner = draft.score.home === draft.score.away
    ? null
    : draft.score.home > draft.score.away ? draft.home : draft.away;
  return (
    <main
      className={styles.canvas}
      style={{
        ...TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES,
        "--final-home-accent": draft.home.accent,
        "--final-away-accent": draft.away.accent,
        "--final-winner-accent": winner?.accent ?? "#9eff2d",
        "--final-stadium-image": `url(${JSON.stringify(draft.venue.interiorImageUrl)})`,
      } as CSSProperties}
      data-social-art="touchline-final-score"
      data-social-placement={placement}
      data-content-type={placement === "feed" ? "FULL_TIME" : "FINAL_SCORE"}
      data-template-version={placement === "feed" ? "touchline-full-time-feed-v1" : "touchline-final-score-story-v1"}
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-source-snapshot-at={draft.sourceSnapshotAt}
      data-starts-at={draft.startsAt}
      data-caption={draft.caption}
      data-score-state="finished"
      data-source-provenance={draft.sourceProvenance}
      data-visual-qa={isVisualQa ? "sample-data" : undefined}
    >
      <div className={styles.stadium} aria-hidden="true" />
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.masthead}>
        <span><ShieldCheck size={18} /> {isVisualQa ? draft.visualQa?.label : "TOUCHLINE VERIFIED"}</span>
        <strong>FULL-TIME REPORT</strong>
      </header>

      <section className={styles.scoreHero} aria-label={`${draft.home.name} ${draft.score.home}, ${draft.away.name} ${draft.score.away}`}>
        <article className={styles.club}>
          <div><Image src={draft.home.logoUrl!} alt={draft.home.name} width={154} height={154} priority /></div>
          <strong>{draft.home.name}</strong>
          <ol className={styles.teamGoals} aria-label={`${draft.home.name} scorers`}>
            {draft.goals.filter((goal) => goal.teamId === draft.home.teamId).map((goal) => {
              const kindLabel = goalKindLabel(goal.kind);
              return <li key={goal.id}><b>{goal.playerName}</b><span>{goalMinute(goal.minute, goal.extraMinute)}{kindLabel ? <em>{kindLabel}</em> : null}</span></li>;
            })}
          </ol>
        </article>
        <div className={styles.score}>
          <div className={styles.scoreMark}>
            <Image
              src="/touchlineArena/brand/tl-shield-lime.svg"
              alt="TouchLine"
              width={46}
              height={46}
            />
          </div>
          <strong className={styles.scoreline} aria-hidden="true">
            <b>{draft.score.home}</b>
            <i>-</i>
            <b>{draft.score.away}</b>
          </strong>
          <small>GAMEWEEK {draft.gameweekNumber} · {draft.venue.name.toUpperCase()}</small>
        </div>
        <article className={styles.club}>
          <div><Image src={draft.away.logoUrl!} alt={draft.away.name} width={154} height={154} priority /></div>
          <strong>{draft.away.name}</strong>
          <ol className={styles.teamGoals} aria-label={`${draft.away.name} scorers`}>
            {draft.goals.filter((goal) => goal.teamId === draft.away.teamId).map((goal) => {
              const kindLabel = goalKindLabel(goal.kind);
              return <li key={goal.id}><b>{goal.playerName}</b><span>{goalMinute(goal.minute, goal.extraMinute)}{kindLabel ? <em>{kindLabel}</em> : null}</span></li>;
            })}
          </ol>
        </article>
      </section>

      <section className={styles.resultStory}>
        <div className={styles.headline}>
          <span>{isVisualQa ? "MATCH REPORT SAMPLE" : "MATCH REPORT"}</span>
          <h1>{winner ? `${winner.name} claim the win` : "Honours shared at full time"}</h1>
          <p>{isVisualQa ? "Final wording will be generated only from the verified 042 reader." : "Verified final score and scorers from the TouchLine match centre."}</p>
        </div>
      </section>

      <section className={styles.topCard}>
        <div className={styles.topCardCopy}>
          <span><Trophy size={18} /> {isVisualQa ? "SAMPLE TOP MATCH CARD" : "TOP MATCH CARD"}</span>
          <h2>{draft.topMatchCard.card.name}</h2>
          <p>{draft.topMatchCard.team.name}</p>
          <div>
            <small>{isVisualQa ? "SAMPLE MATCH RATING" : "OFFICIAL MATCH RATING"}</small>
            <strong>{draft.topMatchCard.officialMatchRating.toFixed(2)}</strong>
          </div>
          <em>{isVisualQa ? "Visual hierarchy proof only · not a football claim" : "Highest TouchLine Verified match rating · not TouchLine Points"}</em>
        </div>
        <div className={styles.cardFrame} data-player-card-axis="0deg">
          <TouchlineEliteExactCard
            player={squadCardToExactPlayer(draft.topMatchCard.card, { useSuppliedTier: true })}
            staticRenderScale={TOP_CARD_WIDTH / 430}
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
        <span>{isVisualQa ? "LOCAL VISUAL QA · NON-PUBLISHABLE" : `TOUCHLINE ENGLAND · VERIFIED ${new Date(draft.capturedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`}</span>
        <strong>{isVisualQa ? "DESIGN REVIEW" : "COMING SOON"} <i>•</i> {isVisualQa ? "OUTBOUND DISABLED" : "CURRENTLY IN TESTING"}</strong>
      </footer>
    </main>
  );
}
