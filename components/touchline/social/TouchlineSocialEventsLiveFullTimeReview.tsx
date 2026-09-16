/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";

import type { StudioFullTimeRenderedFactsV1 } from "@/lib/touchlineArena/social-studio-full-time-rendered-facts";
import type { TouchlineCardTierKey } from "@/lib/touchlineArena/card-rules";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
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
      <div className={styles.pitchSurface} aria-hidden="true"><i /><i /><i /></div>
      <article className={styles.report}>
        <span className={styles.label}>VERIFIED MATCH REPORT</span>
        <h1>{winner ? `${winner.name} take the points` : "Points shared at full time"}</h1>
        <div className={styles.scorers}>
          <div><strong>{facts.home.name}</strong>{facts.goals.filter(goal => goal.providerTeamId === facts.home.providerTeamId).map(goal => <span key={goal.id}>{goal.playerName} {minute(goal)}{goal.kind === "penalty" ? " PEN" : goal.kind === "own-goal" ? " OG" : ""}</span>)}</div>
          <div><strong>{facts.away.name}</strong>{facts.goals.filter(goal => goal.providerTeamId === facts.away.providerTeamId).map(goal => <span key={goal.id}>{goal.playerName} {minute(goal)}{goal.kind === "penalty" ? " PEN" : goal.kind === "own-goal" ? " OG" : ""}</span>)}</div>
        </div>
        <div className={styles.verifiedStrip}><span>TOUCHLINE VERIFIED</span><b>TOUCHLINE ENGLAND</b><span>GAMEWEEK {facts.fixture.gameweekNumber}</span></div>
      </article>
      <article className={styles.star}>
        <div className={styles.starHead}><span className={styles.label}>MATCH STAR</span><div className={styles.matchRating} data-official-match-rating={facts.featured.officialMatchRating.toFixed(2)}><span>OFFICIAL RATING</span><strong>{facts.featured.officialMatchRating.toFixed(2)}</strong></div></div>
        <div className={styles.card}>
          <TouchlineEliteExactCard
            className={styles.exactCard}
            staticRenderScale={0.74}
            ensureStaticNameFit
            runtimeLocaleOverride="en-GB"
            subscribeToRanking={false}
            enableInteractiveNeon={false}
            showCardActions={false}
            showProfileAction={false}
            showSocialMetrics={false}
            showMatchRating={false}
            rankingMode="preview"
            forceNeonActive
            player={{
              sportmonksPlayerId: facts.featured.providerPlayerId,
              canonicalPlayerId: facts.featured.canonicalPlayerId,
              overall: facts.featured.card.seasonTotalRating ?? "—",
              shirtNumber: facts.featured.card.shirtNumber,
              role: facts.featured.card.role,
              position: facts.featured.card.position,
              countryCode3: facts.featured.card.countryCode3,
              name: facts.featured.card.name,
              clubName: facts.featured.card.clubName,
              clubLogoUrl: featuredClub.logoUrl,
              leagueName: "TouchLine England",
              cardTemplateUrl: facts.featured.card.cardTemplateUrl,
              marketValue: facts.featured.card.marketValue,
              marketValueState: "verified",
              editorialCard: {
                tierKey: facts.featured.card.tierKey as TouchlineCardTierKey,
                cardPrice: facts.featured.card.cardPrice,
                marketValueEur: facts.featured.card.marketValueEur ?? undefined,
                marketValueState: "verified",
                shirtNumber: facts.featured.card.shirtNumber ?? undefined,
                shirtNumberState: "verified",
                lastReviewedAt: facts.fixture.displayDate,
              },
              totalRating: facts.featured.card.seasonTotalRating,
              matchRating: facts.featured.officialMatchRating,
              cardTier: facts.featured.card.tierKey as TouchlineCardTierKey,
              seasonStats: facts.featured.card.stats,
              updatedAt: facts.fixture.displayDate,
              age: "—",
              height: "—",
              foot: "—",
              contract: "—",
              nationality: facts.featured.card.countryCode3,
            }}
          />
        </div>
      </article>
    </section>
    <footer><span>TOUCHLINE ENGLAND · VERIFIED MATCH DATA</span><strong>YOUR CLUB. YOUR CARDS. YOUR XI.</strong></footer>
  </main>;
}
