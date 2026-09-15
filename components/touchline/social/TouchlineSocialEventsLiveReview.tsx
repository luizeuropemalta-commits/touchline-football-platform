import type { CSSProperties } from "react";
import TouchlineSocialApprovedExactCard from "./TouchlineSocialApprovedExactCard";
import TouchlineSocialEventsLiveGoalHat from "./TouchlineSocialEventsLiveGoalHat";
import TouchlineSocialEventsLiveFullTimeReview from "./TouchlineSocialEventsLiveFullTimeReview";
import { approvedSnapshotCard, TouchlineSocialApprovedScoreboard, type TouchlineApprovedCardSource, type TouchlineApprovedClub } from "./TouchlineSocialApprovedSnapshotPrimitives";
import { EVENTS_LIVE_LOOP_MS, type EventsLiveArtId, type EventsLiveEvidence, type EventsLivePackageInput } from "@/lib/touchlineArena/social-events-live-contract";
import type { StudioFullTimeRenderedFactsV1 } from "@/lib/touchlineArena/social-studio-full-time-rendered-facts";
import styles from "./TouchlineSocialEventsLiveReview.module.css";

export type EventsLiveReviewInput = EventsLivePackageInput & {
  /** FULL_TIME is rendered from this canonical DTO only. */
  fullTime?: StudioFullTimeRenderedFactsV1;
  artId: EventsLiveArtId; evidence: EventsLiveEvidence; mode: "RETROSPECTIVE_VISUAL_REVIEW";
  dateLabel: string; caption: string; source: string; asOf: string; fetchedAt: string; validUntil: string;
  competitionId: string; seasonId: string; fixtureIds: string[]; teamIds: string[]; playerIds: string[];
  home: TouchlineApprovedClub; away: TouchlineApprovedClub; playerClub: TouchlineApprovedClub;
  score: { home: number; away: number }; finalScore: { home: number; away: number }; gameweekNumber: number;
  venue: { name: string; interiorImageUrl: string }; playerCard: TouchlineApprovedCardSource;
  matchRating: number; touchlinePoints: number; totalRating: null;
  moments: { eventId: string; kind: "goal" | "own-goal" | "penalty" | "red-card"; minute: number; extraMinute: number | null }[];
  goals: { id: string; teamId: string; playerName: string; minute: number; extraMinute: number | null; kind: "goal" | "own-goal" | "penalty" }[];
  factualData: Record<string, unknown>;
};
const minute = (value: { minute: number; extraMinute: number | null }) => `${value.minute}${value.extraMinute ? `+${value.extraMinute}` : ""}'`;

/** The frozen 042 and 043 geometry/card primitives are reused. Date/copy mark the real retrospective instance. */
export default function TouchlineSocialEventsLiveReview({ input, placement, checksum }: {
  input: EventsLiveReviewInput; placement: "FEED" | "STORY"; checksum: string;
}) {
  const { artId } = input;
  const premium043 = ["GOAL_CONFIRMED", "OWN_GOAL", "HAT_TRICK_HERO"].includes(artId);
  const title = artId === "OWN_GOAL" ? "OWN GOAL" : artId === "HAT_TRICK_HERO" ? "HAT-TRICK" : artId === "RED_CARD_CONFIRMED" ? "RED CARD" : "GOAAAALLLLL";
  const fullTimeFacts = artId === "FULL_TIME" ? input.fullTime : null;
  const fullTimeClub = fullTimeFacts
    ? fullTimeFacts.featured.providerTeamId === fullTimeFacts.home.providerTeamId ? fullTimeFacts.home
      : fullTimeFacts.featured.providerTeamId === fullTimeFacts.away.providerTeamId ? fullTimeFacts.away : null
    : null;
  const accent = artId === "RED_CARD_CONFIRMED" ? "#ff365f" : fullTimeClub?.accent ?? input.playerClub.accent;
  const ownGoalBeneficiary = input.playerClub.teamId === input.home.teamId ? input.away.name : input.home.name;
  const eyebrow = artId === "OWN_GOAL" ? `OWN GOAL · CREDITED TO ${ownGoalBeneficiary.toUpperCase()}` : artId === "HAT_TRICK_HERO" ? "THREE GOALS. ONE MATCH." : artId === "RED_CARD_CONFIRMED" ? "MATCH DISMISSAL" : `${input.playerCard.name.toUpperCase()} SCORED`;
  const isFullTime = artId === "FULL_TIME";
  return <section className={`${styles.presentation} ${placement === "STORY" ? styles.story : styles.feed}`} style={{ "--event-review-accent": accent } as CSSProperties}
    data-events-live-art={artId} data-events-live-ready="true" data-loop-ms={EVENTS_LIVE_LOOP_MS} data-placement={placement}
    data-mode="RETROSPECTIVE_VISUAL_REVIEW" data-publishable="false" data-source-checksum={checksum}>
    {placement === "STORY" && !isFullTime && <header className={styles.storyTop}><span>TOUCHLINE</span><strong>MATCH REWIND</strong></header>}
    <div className={styles.composition}>
      {isFullTime && fullTimeFacts ? <TouchlineSocialEventsLiveFullTimeReview facts={fullTimeFacts} placement={placement} />
        : artId === "FULL_TIME" ? <main data-events-live-blocked="FULL_TIME_RENDERED_FACTS_REQUIRED" />
        : premium043 ? <TouchlineSocialEventsLiveGoalHat input={input} checksum={checksum} />
        : <main className={styles.eventCanvas} style={{ backgroundImage: `linear-gradient(#02120cdd,#020805e8), url(${JSON.stringify(input.venue.interiorImageUrl)})` }}>
          <header className={styles.masthead}><strong>TOUCHLINE · MATCH REWIND</strong><TouchlineSocialApprovedScoreboard home={input.home} away={input.away} eyebrow={`GAMEWEEK ${input.gameweekNumber}`} footer={minute(input.moments.at(-1)!)} score={input.score} /></header>
          <section className={styles.eventBody}>
            <div><small className={styles.eyebrow}>{eyebrow}</small><h1 className={styles.title} aria-label={title}>{[...title].map((letter, index) => <span aria-hidden="true" key={index} style={{ animationDelay: `${index * -120}ms` }}>{letter === " " ? "\u00a0" : letter}</span>)}</h1>
              <div className={styles.moments}>{input.moments.map(moment => <span key={moment.eventId}>{minute(moment)} {moment.kind === "penalty" ? "PEN" : moment.kind === "own-goal" ? "OWN GOAL" : moment.kind === "red-card" ? "RED CARD" : "GOAL"}</span>)}</div>
              <p className={styles.identity}>{input.playerCard.name}<br /><small>{input.playerClub.name} · {input.venue.name}</small></p>
              <dl className={styles.metrics}><div><dt>OFFICIAL MATCH RATING</dt><dd>{input.matchRating.toFixed(2)}</dd></div><div><dt>TOUCHLINE POINTS</dt><dd>{input.touchlinePoints > 0 ? "+" : ""}{input.touchlinePoints}</dd></div></dl>
              <p className={styles.result}>FINAL RESULT<br /><strong>{input.home.shortCode} {input.finalScore.home}–{input.finalScore.away} {input.away.shortCode}</strong></p>
            </div>
            <div className={styles.card}><TouchlineSocialApprovedExactCard player={approvedSnapshotCard(input.playerCard, input.playerClub)} staticRenderScale={1} /></div>
          </section>
        </main>}
      {!premium043 && !isFullTime && <><svg className={styles.perimeter} viewBox="0 0 1080 1350" aria-hidden="true"><rect x="14" y="14" width="1052" height="1322" rx="30" pathLength="100" /></svg>
      <footer className={styles.dateFooter}><strong>PREMIER LEAGUE · {(fullTimeFacts?.fixture.displayDate ?? input.dateLabel).toUpperCase()}</strong><span>MATCH REWIND</span></footer></>}
    </div>
    {placement === "STORY" && !isFullTime && <footer className={styles.storyBottom}>YOUR CLUB. YOUR CARDS. YOUR STARTING XI.</footer>}
  </section>;
}
