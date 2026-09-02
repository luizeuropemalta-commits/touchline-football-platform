import { Goal } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineSocialFixtureScoreboard from "@/components/touchline/social/TouchlineSocialFixtureScoreboard";
import type { TouchlineSocialConfirmedEventArtworkDraft } from "@/components/touchline/social/TouchlineSocialConfirmedEventDraft";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { formatTouchlineConfirmedEventMinute } from "@/lib/touchlineArena/social-confirmed-event-contract";
import { TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES } from "@/lib/touchlineArena/social-ranking-visual-tokens";
import { TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES } from "@/lib/touchlineArena/social-visual-tokens";

import localStyles from "./TouchlineSocialGoalHatLayoutDemo.module.css";
import rankingStyles from "./TouchlineSocialRankingDraft.module.css";

/**
 * Isolated owner-facing visual experiment. It deliberately reuses the locked
 * Hat-trick composition without changing the approved Hat-trick component.
 * Only LOCAL_NON_PUBLISHABLE_VISUAL_QA data may enter this renderer.
 */
export default function TouchlineSocialGoalHatLayoutDemo({
  draft,
}: Readonly<{ draft: TouchlineSocialConfirmedEventArtworkDraft }>) {
  if (draft.sourceProvenance !== "LOCAL_NON_PUBLISHABLE_VISUAL_QA"
    || draft.contentType !== "GOAL_CONFIRMED") return null;

  const playerClub = draft.event.playerTeamId === draft.home.teamId ? draft.home : draft.away;
  const minute = formatTouchlineConfirmedEventMinute(draft.event.minute, draft.event.extraMinute);
  const css = {
    ...TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES,
    ...TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES,
    "--ranking-arena": `url("${draft.venue.interiorImageUrl}")`,
    "--ranking-count": 1,
  } as CSSProperties;

  return (
    <main
      className={`${rankingStyles.canvas} ${rankingStyles.hatTrickCanvas}`}
      style={css}
      data-social-art="touchline-goal-hat-layout-demo"
      data-content-type="GOAL_CONFIRMED"
      data-template-version="touchline-goal-hat-layout-visual-qa-v1"
      data-source-checksum={draft.sourceChecksum}
      data-source-provenance={draft.sourceProvenance}
      data-visual-qa="sample-data"
    >
      <svg className={rankingStyles.hatNeonFrame} viewBox="0 0 1080 1350" aria-hidden="true">
        <rect className={rankingStyles.hatNeonTrace} x="14.5" y="14.5" width="1051" height="1321" rx="31" pathLength="100" />
      </svg>
      <div className={rankingStyles.arena} aria-hidden="true" />
      <div className={rankingStyles.atmosphere} aria-hidden="true" />

      <header className={rankingStyles.hatMasthead}>
        <div className={rankingStyles.hatBrand}>
          <Image src="/touchlineArena/brand/tl-shield-lime.svg" alt="TouchLine" width={42} height={50} priority />
          <div><span>TOUCHLINE VERIFIED</span><strong>LIVE MATCH MOMENT</strong></div>
        </div>
        <TouchlineSocialFixtureScoreboard
          className={rankingStyles.hatScoreboard}
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
          <span className={rankingStyles.hatEyebrow}>JOÃO PEDRO SCORES</span>
          <h1 className={localStyles.goalTitle}>
            <span className={localStyles.celebrationWord} data-word="GOAAAALLLLL">GOAAAALLLLL</span>
            <strong className={`${localStyles.celebrationWord} ${localStyles.celebrationWordGold}`} data-word="GOALLLLLL">GOALLLLLL</strong>
          </h1>
          <div className={rankingStyles.hatPlayerIdentity}>
            <div><strong>{draft.event.playerName}</strong><span>{playerClub.name}</span></div>
            <Image src={playerClub.logoUrl!} alt={`${playerClub.name} crest`} width={70} height={70} />
          </div>
          <div className={`${rankingStyles.hatGoalMoments} ${localStyles.singleGoalMoment}`} aria-label="Goal moment">
            <div><b>{minute}</b><small>{draft.event.kind === "penalty" ? "PENALTY" : "GOAL"}</small></div>
          </div>
          <dl className={rankingStyles.hatMetrics}>
            <div><dt>OFFICIAL MATCH RATING</dt><dd>{draft.matchRating?.toFixed(2) ?? "—"}</dd></div>
            <div><dt>TOTAL RATING</dt><dd>{draft.totalRating.toFixed(2)}</dd></div>
          </dl>
          <div className={rankingStyles.hatRank}>
            <Goal className={localStyles.goalMark} aria-hidden="true" />
            <div>
              <span className={rankingStyles.hatRankPosition}>{draft.touchlinePoints > 0 ? "+" : ""}{draft.touchlinePoints} TOUCHLINE POINTS</span>
              <strong>OFFICIAL MATCH RATING REWARD</strong>
              <span>Calculated from the verified 8.24 match rating.</span>
            </div>
          </div>
          <div className={rankingStyles.hatVenue}>
            <span className={rankingStyles.hatVenueImage} aria-hidden="true" />
            <div>
              <small>OFFICIAL MATCH VENUE</small>
              <strong>{draft.venue.name}</strong>
              <span>{draft.home.name} v {draft.away.name}</span>
            </div>
          </div>
        </div>

        <div className={`${rankingStyles.cardFrame} ${rankingStyles.hatCardFrame}`} style={{ "--ranking-card-scale": 1.08 } as CSSProperties} data-card-axis="0deg">
          <TouchlineEliteExactCard
            player={squadCardToExactPlayer({ ...draft.playerCard, matchRating: draft.matchRating }, { useSuppliedTier: true })}
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

        <div className={rankingStyles.hatStatus}>
          <strong>GOAL AT {minute}</strong>
          <span>The 3–0 score is the exact score immediately after this goal.</span>
        </div>
      </section>

      <footer className={rankingStyles.hatFooter}>
        <span>LOCAL VISUAL QA · NON-PUBLISHABLE</span>
        <strong>DESIGN COMPARISON · OUTBOUND DISABLED</strong>
      </footer>
    </main>
  );
}
