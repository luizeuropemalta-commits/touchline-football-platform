import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineSocialFixtureScoreboard from "@/components/touchline/social/TouchlineSocialFixtureScoreboard";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { formatTouchlineConfirmedEventMinute } from "@/lib/touchlineArena/social-confirmed-event-contract";
import { TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES } from "@/lib/touchlineArena/social-ranking-visual-tokens";
import {
  TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION,
  type TouchlineSocialRankingFamilyDraft,
} from "@/lib/touchlineArena/social-ranking-family-draft-server";
import { TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES } from "@/lib/touchlineArena/social-visual-tokens";

import styles from "./TouchlineSocialRankingDraft.module.css";

const TITLE = Object.freeze({
  GAMEWEEK_RANKING_PREVIEW: ["CURRENT TOP 3", "RANKING RACE"],
  GAMEWEEK_RANKING_FINAL: ["FINAL TOP 3", "GAMEWEEK RANKING"],
  PLAYER_DUEL: ["WHO COMES OUT ON TOP?", "TOUCHLINE CARD DUEL"],
  GAMEWEEK_HERO: ["CURRENT GAMEWEEK LEADER", "GAMEWEEK HERO"],
  TOP_PERFORMER: ["OFFICIAL MATCH RATING", "TOP PERFORMER"],
  HAT_TRICK_HERO: ["THREE GOALS. ONE HERO.", "HAT-TRICK HERO"],
} as const);

function cardScale(contentType: TouchlineSocialRankingArtworkDraft["contentType"], count: number, rank: number) {
  if (contentType === "HAT_TRICK_HERO") return 0.92;
  if (contentType === "GAMEWEEK_HERO") return 0.86;
  if (contentType === "TOP_PERFORMER") return 0.8;
  if (contentType === "PLAYER_DUEL") return 0.66;
  if (count === 3) return rank === 1 ? 0.61 : 0.54;
  return 0.58;
}

function formatOverallRankingPosition(rank: number) {
  const remainder100 = rank % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? "TH"
    : rank % 10 === 1 ? "ST"
      : rank % 10 === 2 ? "ND"
        : rank % 10 === 3 ? "RD" : "TH";
  return `${rank}${suffix} OVERALL`;
}

export default function TouchlineSocialRankingDraftView({
  draft,
}: Readonly<{ draft: TouchlineSocialRankingArtworkDraft }>) {
  const isVisualQa = draft.sourceProvenance === "LOCAL_NON_PUBLISHABLE_VISUAL_QA";
  const [eyebrow, title] = TITLE[draft.contentType];
  const css = {
    ...TOUCHLINE_SOCIAL_ARENA_GLASS_CSS_VARIABLES,
    ...TOUCHLINE_SOCIAL_RANKING_FUME_CSS_VARIABLES,
    "--ranking-arena": `url("${draft.arenaImageUrl}")`,
    "--ranking-count": draft.cards.length,
  } as CSSProperties;
  if (draft.contentType === "HAT_TRICK_HERO" && draft.home && draft.away && draft.venueName
    && draft.fixtureScore && draft.cards.length === 1
    && draft.confirmedGoalMoments && draft.confirmedGoalMoments.length >= 3) {
    const entry = draft.cards[0]!;
    const playerClubName = entry.card.clubName.replace(/\s+FC$/i, "").trim().toLowerCase();
    const heroClub = [draft.home, draft.away].find((club) => (
      club.name.replace(/\s+FC$/i, "").trim().toLowerCase() === playerClubName
    ));
    return (
      <main
        className={`${styles.canvas} ${styles.hatTrickCanvas}`}
        style={css}
        data-social-art="touchline-ranking-family"
        data-content-type={draft.contentType}
        data-template-version={TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION}
        data-source-version={draft.sourceVersion}
        data-source-checksum={draft.sourceChecksum}
        data-source-revision-checksum={draft.sourceRevisionChecksum}
        data-fixture-id={draft.fixtureId}
        data-player-id={draft.playerId ?? undefined}
        data-venue-name={draft.venueName}
        data-card-count="1"
        data-public-source="TouchLine Verified"
        data-source-provenance={draft.sourceProvenance}
        data-visual-qa={isVisualQa ? "sample-data" : undefined}
      >
        <svg className={styles.hatNeonFrame} viewBox="0 0 1080 1350" aria-hidden="true">
          <rect className={styles.hatNeonTrace} x="14.5" y="14.5" width="1051" height="1321" rx="31" pathLength="100" />
        </svg>
        <div className={styles.arena} aria-hidden="true" />
        <div className={styles.atmosphere} aria-hidden="true" />
        <header className={styles.hatMasthead}>
          <div className={styles.hatBrand}>
            <Image src="/touchlineArena/brand/tl-shield-lime.svg" alt="TouchLine" width={42} height={50} priority />
            <div><span>TOUCHLINE VERIFIED</span><strong>HAT-TRICK PERFORMANCE</strong></div>
          </div>
          <TouchlineSocialFixtureScoreboard
            className={styles.hatScoreboard}
            variant="event"
            mode="score"
            home={draft.home}
            away={draft.away}
            homeScore={draft.fixtureScore.home}
            awayScore={draft.fixtureScore.away}
            minute="FULL TIME"
            eyebrow={`GAMEWEEK ${draft.gameweekNumber}`}
            footer=""
          />
        </header>

        <section className={styles.hatStory}>
          <div className={styles.hatCopy}>
            <span className={styles.hatEyebrow}>{entry.overallRank === 1 ? "CURRENT GAMEWEEK LEADER" : "HAT-TRICK PERFORMANCE"}</span>
            <h1>
              <span className={styles.celebrationWord} data-word="HAT-TRICK">HAT-TRICK</span>
              <strong className={`${styles.celebrationWord} ${styles.celebrationWordGold}`} data-word="HERO">HERO</strong>
            </h1>
            <div className={styles.hatPlayerIdentity}>
              <div><strong>{entry.card.name}</strong><span>{entry.card.clubName}</span></div>
              {heroClub ? <Image src={heroClub.logoUrl} alt={`${heroClub.name} crest`} width={70} height={70} /> : null}
            </div>
            <div className={styles.hatGoalMoments} aria-label="Confirmed goal moments">
              {draft.confirmedGoalMoments.map((moment, index) => (
                <div key={`${moment.minute}-${moment.extraMinute ?? 0}-${index}`}>
                  <b>{formatTouchlineConfirmedEventMinute(moment.minute, moment.extraMinute)}</b>
                  <small>{moment.kind === "penalty" ? "PENALTY" : "GOAL"}</small>
                </div>
              ))}
            </div>
            <dl className={styles.hatMetrics}>
              <div><dt>OFFICIAL MATCH RATING</dt><dd>{entry.officialMatchRating?.toFixed(2) ?? "—"}</dd></div>
              <div><dt>TOTAL RATING</dt><dd>{entry.totalRating.toFixed(2)}</dd></div>
            </dl>
            <div className={styles.hatRank}>
              <Image
                className={styles.hatRankTrophy}
                src="/touchlineArena/trophies/touchline-england-league-trophy-lion-cup-candidate-v4-text.png"
                alt="TouchLine England League trophy"
                width={54}
                height={81}
              />
              <div>
                <span className={styles.hatRankPosition}>{formatOverallRankingPosition(entry.overallRank)}</span>
                <strong>{entry.overallRank === 1 ? "LEADS THE GAMEWEEK" : "CURRENT TOUCHLINE RANK"}</strong>
                <span>Verified live TouchLine player ranking.</span>
              </div>
            </div>
            <div className={styles.hatVenue}>
              <span className={styles.hatVenueImage} aria-hidden="true" />
              <div>
                <small>OFFICIAL MATCH VENUE</small>
                <strong>{draft.venueName}</strong>
                <span>{draft.home.name} v {draft.away.name}</span>
              </div>
            </div>
          </div>
          <div className={`${styles.cardFrame} ${styles.hatCardFrame}`} style={{ "--ranking-card-scale": 1.08 } as CSSProperties} data-card-axis="0deg">
            <TouchlineEliteExactCard
              player={squadCardToExactPlayer(entry.card, { useSuppliedTier: true })}
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
          <div className={styles.hatStatus}>
            <strong>{draft.gameweekOpen ? "THE GAMEWEEK IS STILL OPEN" : "FINAL GAMEWEEK RANKING"}</strong>
            <span>{draft.gameweekOpen ? "This is the current verified ranking, not the final Gameweek result." : "The final verified Gameweek ranking is confirmed."}</span>
          </div>
        </section>
        <footer className={styles.hatFooter}>
          <span>{isVisualQa ? "LOCAL VISUAL QA · NON-PUBLISHABLE" : "TOUCHLINE ENGLAND · CURRENT GAMEWEEK STANDINGS"}</span>
          <strong>{isVisualQa ? "DESIGN REVIEW · OUTBOUND DISABLED" : "COMING SOON · CURRENTLY IN TESTING"}</strong>
        </footer>
      </main>
    );
  }
  return (
    <main
      className={styles.canvas}
      style={css}
      data-social-art="touchline-ranking-family"
      data-content-type={draft.contentType}
      data-template-version={TOUCHLINE_SOCIAL_RANKING_TEMPLATE_VERSION}
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-fixture-id={draft.fixtureId}
      data-scope-id={draft.scopeId ?? undefined}
      data-player-id={draft.playerId ?? undefined}
      data-card-count={draft.cards.length}
      data-public-source="TouchLine Verified"
      data-source-provenance={draft.sourceProvenance}
      data-visual-qa={isVisualQa ? "sample-data" : undefined}
    >
      <div className={styles.arena} aria-hidden="true" />
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.brand}>
          <Image src="/touchlineArena/brand/tl-shield-lime.svg" alt="" width={56} height={66} priority />
          <div><span>TOUCHLINE</span><strong>{title}</strong></div>
        </div>
        <div className={styles.verified}>
          <span>{isVisualQa ? draft.visualQa?.label : "TOUCHLINE VERIFIED"}</span>
          <strong>PREMIER LEAGUE · GAMEWEEK {draft.gameweekNumber}</strong>
        </div>
      </header>

      <section className={styles.hero}>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        {draft.gameweekOpen && draft.contentType !== "PLAYER_DUEL" ? <p>GAMEWEEK STILL OPEN</p> : null}
      </section>

      {draft.home && draft.away ? (
        draft.fixtureScore ? (
          <TouchlineSocialFixtureScoreboard
            className={styles.scoreboard}
            variant="event"
            mode="score"
            home={draft.home}
            away={draft.away}
            homeScore={draft.fixtureScore.home}
            awayScore={draft.fixtureScore.away}
            minute="FULL TIME"
            eyebrow={`GAMEWEEK ${draft.gameweekNumber}`}
            footer="TOUCHLINE VERIFIED MATCH DATA"
          />
        ) : (
          <TouchlineSocialFixtureScoreboard
            className={styles.scoreboard}
            variant="event"
            mode="versus"
            home={draft.home}
            away={draft.away}
            eyebrow={`GAMEWEEK ${draft.gameweekNumber}`}
            footer="TOUCHLINE VERIFIED MATCH DATA"
          />
        )
      ) : null}

      <section className={styles.cards} aria-label="TouchLine ranking cards">
        {draft.cards.map((entry) => (
          <article key={entry.card.id} className={styles.card} data-rank={entry.overallRank} data-card-axis="0deg">
            <div className={styles.ordinal}>{entry.overallRank > 0 ? `#${entry.overallRank}` : "★"}</div>
            <div
              className={styles.cardFrame}
              style={{ "--ranking-card-scale": cardScale(draft.contentType, draft.cards.length, entry.overallRank) } as CSSProperties}
            >
              <TouchlineEliteExactCard
                player={squadCardToExactPlayer(entry.card, { useSuppliedTier: true })}
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
            <div className={styles.identity}>
              <span>{entry.card.clubName}</span>
              <strong>{entry.card.name}</strong>
              {draft.contentType === "HAT_TRICK_HERO" && draft.confirmedGoalMoments ? (
                <div className={styles.goalMoments} aria-label="Confirmed goal moments">
                  {draft.confirmedGoalMoments.map((moment, index) => (
                    <div key={`${moment.minute}-${moment.extraMinute ?? 0}-${index}`}>
                      <b>{formatTouchlineConfirmedEventMinute(moment.minute, moment.extraMinute)}</b>
                      <small>{moment.kind === "penalty" ? "PENALTY" : "GOAL"}</small>
                    </div>
                  ))}
                </div>
              ) : null}
              <dl className={styles.metrics}>
                <div><dt>TOTAL RATING</dt><dd>{entry.totalRating.toFixed(2)}</dd></div>
                {entry.officialMatchRating !== null ? (
                  <div className={styles.matchRating}><dt>MATCH RATING</dt><dd>{entry.officialMatchRating.toFixed(2)}</dd></div>
                ) : null}
              </dl>
            </div>
          </article>
        ))}
      </section>

      {draft.confirmedGoals !== null ? (
        <div className={styles.achievement}>{draft.confirmedGoals} CONFIRMED GOALS</div>
      ) : null}

      <footer className={styles.footer}>
        <span>{isVisualQa ? "LOCAL VISUAL QA · NON-PUBLISHABLE" : "TOUCHLINE VERIFIED"}</span>
        <strong>{isVisualQa ? "DESIGN REVIEW" : "COMING SOON"} <i>•</i> {isVisualQa ? "OUTBOUND DISABLED" : "CURRENTLY IN TESTING"}</strong>
      </footer>
    </main>
  );
}

export type TouchlineSocialRankingArtworkDraft = Omit<
  TouchlineSocialRankingFamilyDraft,
  "sourceProvenance"
> & Readonly<{
  sourceProvenance: TouchlineSocialRankingFamilyDraft["sourceProvenance"] | "LOCAL_NON_PUBLISHABLE_VISUAL_QA";
  visualQa?: Readonly<{ sampleData: true; label: string }>;
}>;
