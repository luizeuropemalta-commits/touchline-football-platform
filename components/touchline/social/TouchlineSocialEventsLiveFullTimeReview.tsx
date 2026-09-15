/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";

import type { StudioFullTimeRenderedFactsV1 } from "@/lib/touchlineArena/social-studio-full-time-rendered-facts";
import styles from "./TouchlineSocialEventsLiveFullTimeReview.module.css";

const minute = (value: { minute: number; extraMinute: number | null }) => `${value.minute}${value.extraMinute ? `+${value.extraMinute}` : ""}'`;

/** Candidate-only composition. It never imports or alters the frozen 042 card. */
export default function TouchlineSocialEventsLiveFullTimeReview({ facts, placement }: Readonly<{
  facts: StudioFullTimeRenderedFactsV1;
  placement: "FEED" | "STORY";
}>) {
  const featuredClub = facts.featured.providerTeamId === facts.home.providerTeamId ? facts.home : facts.away;
  const winner = facts.fixture.score.home === facts.fixture.score.away ? null
    : facts.fixture.score.home > facts.fixture.score.away ? facts.home : facts.away;
  const side = (club: typeof facts.home, score: number) => <div className={styles.side}>
    <img src={club.logoUrl} alt="" aria-hidden="true" />
    <strong>{club.name}</strong>
    <span>{score}</span>
  </div>;
  return <main className={`${styles.art} ${placement === "STORY" ? styles.story : styles.feed}`} style={{ "--full-time-accent": featuredClub.accent, backgroundImage: `linear-gradient(110deg,#020805f4,#03150cdf 50%,#020805ef),url(${JSON.stringify(facts.fixture.venue.interiorImageUrl)})` } as CSSProperties}>
    <div className={styles.topline}><span>TOUCHLINE VERIFIED</span><strong>FULL TIME</strong><span>{facts.fixture.displayDate.toUpperCase()}</span></div>
    <section className={styles.scoreline} aria-label={`${facts.home.name} ${facts.fixture.score.home}, ${facts.away.name} ${facts.fixture.score.away}`}>
      {side(facts.home, facts.fixture.score.home)}
      <div className={styles.scoreMeta}><b>{facts.fixture.score.home}–{facts.fixture.score.away}</b><span>GAMEWEEK {facts.fixture.gameweekNumber}</span><small>{facts.fixture.venue.name.toUpperCase()}</small></div>
      {side(facts.away, facts.fixture.score.away)}
    </section>
    <section className={styles.body}>
      <article className={styles.report}>
        <span className={styles.label}>MATCH REPORT</span>
        <h1>{winner ? `${winner.name} take the points` : "Points shared at full time"}</h1>
        <div className={styles.scorers}>
          <div><strong>{facts.home.name}</strong>{facts.goals.filter(goal => goal.providerTeamId === facts.home.providerTeamId).map(goal => <span key={goal.id}>{goal.playerName} {minute(goal)}{goal.kind === "penalty" ? " PEN" : goal.kind === "own-goal" ? " OG" : ""}</span>)}</div>
          <div><strong>{facts.away.name}</strong>{facts.goals.filter(goal => goal.providerTeamId === facts.away.providerTeamId).map(goal => <span key={goal.id}>{goal.playerName} {minute(goal)}{goal.kind === "penalty" ? " PEN" : goal.kind === "own-goal" ? " OG" : ""}</span>)}</div>
        </div>
      </article>
      <article className={styles.star}>
        <span className={styles.label}>MATCH STAR</span>
        <div className={styles.card}>
          <img className={styles.frame} src={facts.featured.card.cardTemplateUrl} alt="" aria-hidden="true" />
          <img className={styles.crest} src={featuredClub.logoUrl} alt="" aria-hidden="true" />
          <div className={styles.cardContent}><span>{facts.featured.card.tierKey.replaceAll("-", " ").toUpperCase()}</span><strong>{facts.featured.card.name}</strong><small>{facts.featured.card.clubName}</small></div>
          <div className={styles.cardMetrics}><span><small>OFFICIAL MATCH RATING</small><b>{facts.featured.officialMatchRating.toFixed(2)}</b></span><span><small>MARKET VALUE</small><b>{facts.featured.card.marketValue ?? "—"}</b></span></div>
        </div>
      </article>
    </section>
    <footer><span>TOUCHLINE ENGLAND · VERIFIED MATCH DATA</span><strong>YOUR CLUB. YOUR CARDS. YOUR XI.</strong></footer>
  </main>;
}
