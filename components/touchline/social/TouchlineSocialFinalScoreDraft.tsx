import { ShieldCheck, Trophy } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import type { TouchlineSocialFinalScoreDraft } from "@/lib/touchlineArena/social-final-score-draft-server";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";

import styles from "./TouchlineSocialFinalScoreDraft.module.css";

const TOP_CARD_WIDTH = 286;

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
  draft: TouchlineSocialFinalScoreDraft;
  placement?: "feed" | "story";
}) {
  const winner = draft.score.home === draft.score.away
    ? null
    : draft.score.home > draft.score.away ? draft.home : draft.away;
  return (
    <main
      className={styles.canvas}
      style={{
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
    >
      <header className={styles.masthead}>
        <span><ShieldCheck size={18} /> TOUCHLINE VERIFIED</span>
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
          <span>FULL TIME</span>
          <strong>{draft.score.home} <i>—</i> {draft.score.away}</strong>
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
          <span>MATCH REPORT</span>
          <h1>{winner ? `${winner.name} claim the win` : "Honours shared at full time"}</h1>
          <p>Verified final score and scorers from the TouchLine match centre.</p>
        </div>
      </section>

      <section className={styles.topCard}>
        <div className={styles.topCardCopy}>
          <span><Trophy size={18} /> TOP MATCH CARD</span>
          <h2>{draft.topMatchCard.card.name}</h2>
          <p>{draft.topMatchCard.team.name}</p>
          <div>
            <small>OFFICIAL MATCH RATING</small>
            <strong>{draft.topMatchCard.officialMatchRating.toFixed(2)}</strong>
          </div>
          <em>Highest TouchLine Verified match rating · not TouchLine Points</em>
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
        <span>TOUCHLINE ENGLAND · VERIFIED {new Date(draft.capturedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
        <strong>COMING SOON <i>•</i> CURRENTLY IN TESTING</strong>
      </footer>
    </main>
  );
}
