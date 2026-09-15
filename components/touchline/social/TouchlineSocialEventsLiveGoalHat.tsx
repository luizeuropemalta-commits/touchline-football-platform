import { Goal } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "./TouchlineSocialApprovedExactCard";
import TouchlineSocialFixtureScoreboard from "@/components/touchline/social/TouchlineSocialFixtureScoreboard";
import type { EventsLiveReviewInput } from "./TouchlineSocialEventsLiveReview";
import { approvedSnapshotCard } from "./TouchlineSocialApprovedSnapshotPrimitives";
import { formatTouchlineConfirmedEventMinute } from "@/lib/touchlineArena/social-confirmed-event-contract";
import { TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES } from "@/lib/touchlineArena/social-ranking-visual-tokens";
import { TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES } from "@/lib/touchlineArena/social-visual-tokens";

import localStyles from "./TouchlineSocialGoalHatLayoutDemo.module.css";
import ownStyles from "./TouchlineSocialEventsLiveGoalHat.module.css";
import rankingStyles from "./TouchlineSocialRankingDraft.module.css";

function AnimatedWord({ children, gold = false, lineDelay = 0 }: Readonly<{
  children: string;
  gold?: boolean;
  lineDelay?: number;
}>) {
  return (
    <span
      className={`${ownStyles.word} ${localStyles.celebrationWord} ${gold ? localStyles.celebrationWordGold : ""}`}
      aria-label={children}
      style={{ "--line-delay": `${lineDelay}ms` } as CSSProperties}
    >
      {[...children].map((letter, index) => (
        <span
          key={`${letter}-${index}`}
          aria-hidden="true"
          style={{ "--letter-index": index } as CSSProperties}
        >{letter}</span>
      ))}
    </span>
  );
}

/**
 * Dated factual adapter of owner 043 premium geometry/classes.
 * Existing 043 files remain untouched. This proposal retains separate visual approval.
 * Unknown season aggregates remain dashes; no live card/ranking/layout subscriptions.
 */
export default function TouchlineSocialEventsLiveGoalHat({
  input, checksum,
}: Readonly<{ input: EventsLiveReviewInput; checksum: string }>) {
  const terminal = input.moments.at(-1)!;
  const draft = {
    ...input,
    contentType: input.artId === "OWN_GOAL" ? "GOAL_CONFIRMED" : input.artId,
    eventId: terminal.eventId,
    event: { ...terminal, playerTeamId: input.playerClub.teamId, playerName: input.playerCard.name },
    confirmedGoalMoments: input.moments,
    sourceVersion: "events-retrospective-v2", sourceChecksum: checksum, sourceRevisionChecksum: checksum,
    sourceSnapshotAt: input.asOf, startsAt: input.evidence.startsAt,
    sourceProvenance: input.source,
  };
  if (!["GOAL_CONFIRMED", "HAT_TRICK_HERO"].includes(draft.contentType)) return null;

  const playerClub = draft.event.playerTeamId === draft.home.teamId ? draft.home : draft.away;
  const minute = formatTouchlineConfirmedEventMinute(draft.event.minute, draft.event.extraMinute);
  const isHatTrick = draft.contentType === "HAT_TRICK_HERO";
  const isOwnGoal = draft.event.kind === "own-goal";
  const hasOfficialTouchlinePoints =
    draft.sourceProvenance !== "LOCAL_NON_PUBLISHABLE_VISUAL_QA"
    || draft.touchlinePoints !== 0;
  const touchlinePointsDisplay = hasOfficialTouchlinePoints
    ? `${draft.touchlinePoints > 0 ? "+" : ""}${draft.touchlinePoints}`
    : "—";
  const moments = isHatTrick ? draft.confirmedGoalMoments ?? [] : [{
    eventId: draft.eventId,
    kind: draft.event.kind,
    minute: draft.event.minute,
    extraMinute: draft.event.extraMinute,
    score: draft.score,
  }];
  if (isHatTrick && moments.length !== 3) return null;
  const title = isHatTrick
    ? { eyebrow: `${draft.event.playerName} MAKES IT THREE`, first: "HAT-TRICK", second: "" }
    : isOwnGoal
      ? { eyebrow: "OWN GOAL", first: "OWN", second: "GOALLLLLL" }
      : { eyebrow: `${draft.event.playerName} SCORES`, first: "GOAAAALLLLL", second: "GOALLLLLL" };
  const css = {
    ...TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES,
    ...TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES,
    "--ranking-arena": `url("${draft.venue.interiorImageUrl}")`,
    "--ranking-count": 1,
    "--hat-club-accent": playerClub.accent,
  } as CSSProperties;

  return (
    <main
      className={`${ownStyles.premiumMotion} ${rankingStyles.canvas} ${rankingStyles.hatTrickCanvas} ${localStyles.clubAccentCanvas}`}
      style={css}
      data-social-art="touchline-confirmed-event"
      data-social-placement="feed"
      data-content-type={draft.contentType}
      data-event-id={draft.eventId}
      data-template-version={isHatTrick ? "touchline-hat-trick-feed-v1" : "touchline-goal-event-feed-v1"}
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-source-snapshot-at={draft.sourceSnapshotAt}
      data-starts-at={draft.startsAt}
      data-caption={draft.caption}
      data-source-provenance={draft.sourceProvenance}
      data-visual-qa={draft.sourceProvenance === "LOCAL_NON_PUBLISHABLE_VISUAL_QA" ? "sample-data" : undefined}
    >
      <svg className={rankingStyles.hatNeonFrame} viewBox="0 0 1080 1350" aria-hidden="true">
        <rect className={`${ownStyles.neon} ${rankingStyles.hatNeonTrace} ${localStyles.clubAccentTrace}`} x="14.5" y="14.5" width="1051" height="1321" rx="31" pathLength="100" />
      </svg>
      <div className={rankingStyles.arena} aria-hidden="true" />
      <div className={rankingStyles.atmosphere} aria-hidden="true" />

      <header className={rankingStyles.hatMasthead}>
        <div className={rankingStyles.hatBrand}>
          <Image src="/touchlineArena/brand/tl-shield-lime.svg" alt="TouchLine" width={42} height={50} priority />
          <div><span>TOUCHLINE VERIFIED</span><strong>MATCH REWIND</strong></div>
        </div>
        <TouchlineSocialFixtureScoreboard
          className={`${rankingStyles.hatScoreboard} ${localStyles.legibleScoreboard}`}
          variant="event"
          mode="score"
          home={draft.home}
          away={draft.away}
          homeScore={draft.score.home}
          awayScore={draft.score.away}
          minute={minute}
          eyebrow={`GAMEWEEK ${draft.gameweekNumber}`}
          footer=""
        />
      </header>

      <section className={rankingStyles.hatStory}>
        <div className={rankingStyles.hatCopy}>
          <span className={`${rankingStyles.hatEyebrow} ${isHatTrick ? localStyles.hatTrickEyebrow : ""}`}>{title.eyebrow}</span>
          <h1 className={`${localStyles.goalTitle} ${isHatTrick ? localStyles.hatTrickTitle : ""}`}>
            <AnimatedWord gold={isHatTrick}>{title.first}</AnimatedWord>
            {title.second ? <strong><AnimatedWord gold lineDelay={900}>{title.second}</AnimatedWord></strong> : null}
          </h1>
          <div className={`${rankingStyles.hatPlayerIdentity} ${localStyles.playerIdentity}`}>
            <Image src={playerClub.logoUrl!} alt={`${playerClub.name} crest`} width={70} height={70} />
            <div><strong>{draft.event.playerName}</strong><span>{playerClub.name}</span></div>
          </div>
          <div className={`${rankingStyles.hatGoalMoments} ${!isHatTrick ? localStyles.singleGoalMoment : ""}`} aria-label={isHatTrick ? "Hat-trick goal moments" : "Goal moment"}>
            {moments.map((moment) => (
              <div key={moment.eventId}>
                <b>{formatTouchlineConfirmedEventMinute(moment.minute, moment.extraMinute)}</b>
                <small className={localStyles.goalMomentLabel}>{moment.kind === "penalty" ? "PENALTY" : isOwnGoal ? "OWN GOAL" : "GOAL"}</small>
              </div>
            ))}
          </div>
          <dl className={rankingStyles.hatMetrics}>
            <div><dt className={localStyles.metricLabel}>OFFICIAL MATCH RATING</dt><dd>{draft.matchRating?.toFixed(2) ?? "—"}</dd></div>
            <div><dt className={localStyles.metricLabel}>TOTAL RATING</dt><dd>{"—"}</dd></div>
          </dl>
          <div
            className={`${rankingStyles.hatRank} ${localStyles.pointsPanel}`}
            data-touchline-points-state={hasOfficialTouchlinePoints ? "official" : "awaiting-official-calculation"}
          >
            <Goal className={localStyles.goalMark} aria-hidden="true" />
            <div className={localStyles.pointsSpotlight}>
              <span className={`${rankingStyles.hatRankPosition} ${localStyles.pointsValue}`}>{touchlinePointsDisplay}</span>
              <div>
                <strong>TOUCHLINE POINTS</strong>
                <span>{hasOfficialTouchlinePoints ? "VERIFIED SCORING RESULT" : "AWAITING OFFICIAL CALCULATION"}</span>
              </div>
            </div>
          </div>
          <div className={rankingStyles.hatVenue}>
            <span className={rankingStyles.hatVenueImage} aria-hidden="true" />
            <div>
              <small className={localStyles.venueLabel}>OFFICIAL MATCH VENUE</small>
              <strong>{draft.venue.name}</strong>
              <span className={localStyles.venueFixture}>{draft.home.name} v {draft.away.name}</span>
            </div>
          </div>
        </div>

        <div className={`${rankingStyles.cardFrame} ${rankingStyles.hatCardFrame}`} style={{ "--ranking-card-scale": 1.08 } as CSSProperties} data-card-axis="0deg">
          <TouchlineEliteExactCard
            className={ownStyles.cardInformation}
            player={approvedSnapshotCard(draft.playerCard, input.playerClub)}
            staticRenderScale={1}
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

        <div className={`${rankingStyles.hatStatus} ${localStyles.statusCopy}`}>
          <strong>{isHatTrick ? `HAT-TRICK AT ${minute}` : `${isOwnGoal ? "OWN GOAL" : "GOAL"} AT ${minute}`}</strong>
          <span>{draft.score.home}–{draft.score.away} is the exact score immediately after this event.</span>
        </div>
      </section>

      <footer className={`${rankingStyles.hatFooter} ${localStyles.legibleFooter}`}>
        <span>PREMIER LEAGUE · {input.dateLabel.toUpperCase()}</span>
        <strong>MATCH REWIND</strong>
      </footer>
    </main>
  );
}
