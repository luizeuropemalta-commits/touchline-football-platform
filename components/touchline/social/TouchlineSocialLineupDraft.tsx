import Image from "next/image";
import type { CSSProperties } from "react";

import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import type { TouchlineSocialLineupDraft } from "@/lib/touchlineArena/social-lineup-draft-server";
import { assertTouchlineOfficialLineupPresentation } from "@/lib/touchlineArena/social-lineup-presentation-policy";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";

import styles from "./TouchlineSocialLineupDraft.module.css";

const CARD_WIDTH = 98;
const BENCH_CARD_WIDTH = 76;

function kickoffLabel(startsAt: string) {
  if (!Number.isFinite(Date.parse(startsAt))) return "KICK-OFF VERIFIED IN TOUCHLINE LIVE";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Malta",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startsAt)).replace(",", " ·");
}

function socialPitchPosition(x: number, y: number) {
  // The regulation portrait field has enough lateral room to preserve the
  // canonical shape while keeping five-player lines clear at social-card
  // scale. Expand around the centre rather than moving individual roles.
  const expandedLateralPosition = 50 + ((y - 50) * 1.18);
  // Give the highest attacking line enough breathing room for its canonical
  // nameplate without letting it collide with the line behind it.
  const projectedDepth = 90 - (x * 0.78) - (Math.max(0, x - 70) * 0.08);
  return {
    "--social-lineup-x": `${Math.min(91, Math.max(9, expandedLateralPosition))}%`,
    "--social-lineup-y": `${Math.min(82, Math.max(19, projectedDepth))}%`,
  } as CSSProperties;
}

export default function TouchlineSocialLineupDraftView({ draft }: { draft: TouchlineSocialLineupDraft }) {
  assertTouchlineOfficialLineupPresentation(draft);
  const sideLabel = draft.side === "home" ? "HOME XI" : "AWAY XI";
  return (
    <main
      className={styles.canvas}
      style={{
        "--social-club-accent": draft.club.accent,
        "--social-club-secondary": draft.club.secondaryAccent,
      } as CSSProperties}
      data-social-art="touchline-official-lineup"
      data-fixture-kind={draft.sourceProvenance}
      data-fixture-id={draft.fixtureId}
      data-team-id={draft.club.teamId}
      data-lineup-status="confirmed"
      data-lineup-first-observed-at={draft.lineupAvailableAt}
      data-source-snapshot-at={draft.capturedAt}
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-caption={draft.caption}
      data-template-version="touchline-lineup-feed-v1"
    >
      <TouchlinePitchSurface
        className={styles.pitch}
        orientation="vertical"
        ariaLabel={`${draft.club.name} official ${draft.formation} line-up`}
      >
        <div className={styles.pitchGlow} aria-hidden="true" />
        <header className={styles.header}>
          <div className={styles.teamIdentity}>
            <div className={styles.crestFrame}>
              <Image src={draft.club.logoUrl!} alt={draft.club.name} width={72} height={72} priority />
            </div>
            <div>
              <span>{sideLabel} · LINE-UP CONFIRMED</span>
              <h1>{draft.club.name}</h1>
              <p>{draft.formation} · 11 VERIFIED STARTERS</p>
            </div>
          </div>
          <div className={styles.matchup} aria-label={`${draft.home.name} versus ${draft.away.name}`}>
            <Image src={draft.home.logoUrl!} alt={draft.home.name} width={48} height={48} priority />
            <div>
              <span>{draft.home.shortCode} <b>VS</b> {draft.away.shortCode}</span>
              {draft.score ? (
                <div className={styles.finalScore} aria-label={`Full time ${draft.home.name} ${draft.score.home}, ${draft.away.name} ${draft.score.away}`}>
                  <em>FULL TIME</em>
                  <b>{draft.score.home} — {draft.score.away}</b>
                </div>
              ) : null}
              <strong>{kickoffLabel(draft.startsAt)}</strong>
            </div>
            <Image src={draft.away.logoUrl!} alt={draft.away.name} width={48} height={48} priority />
          </div>
        </header>
        {draft.players.map(({ card, x, y }) => (
          <article
            key={card.id}
            className={styles.player}
            style={socialPitchPosition(x, y)}
            data-player-id={card.id}
            data-player-card-axis="0deg"
            data-player-shirt-number={card.shirtNumber ?? undefined}
          >
            <div className={styles.card}>
              <TouchlineEliteExactCard
                player={squadCardToExactPlayer(card, { useSuppliedTier: true })}
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
            <strong className={styles.playerName}>{card.name}</strong>
          </article>
        ))}
      </TouchlinePitchSurface>
      <section
        className={styles.technicalRail}
        aria-label={`${draft.club.name} technical area`}
        data-official-bench-count={draft.bench.length}
      >
        <header className={styles.railHeader}>
          <span>TECHNICAL AREA</span>
          <strong>9 OFFICIAL SUBSTITUTES</strong>
        </header>
        <div className={styles.benchGrid}>
          {draft.bench.map((card) => (
            <article
              key={card.id}
              className={styles.benchPlayer}
              data-bench-player-id={card.id}
              data-player-card-axis="0deg"
              data-player-shirt-number={card.shirtNumber ?? undefined}
            >
              <div className={styles.benchCard}>
                <TouchlineEliteExactCard
                  player={squadCardToExactPlayer(card, { useSuppliedTier: true })}
                  staticRenderScale={BENCH_CARD_WIDTH / 430}
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
              <strong>{card.name}</strong>
            </article>
          ))}
        </div>
        <div
          className={styles.coachPanel}
          aria-label={`${draft.club.name} current club coach ${draft.coach.identity.coach.displayName}`}
          data-coach-id={draft.coach.identity.coach.providerId}
          data-coach-tier={draft.coach.slot.cardTier}
        >
          <div className={styles.coachCard}>
            <TouchlineCoachCard
              coach={draft.coach.identity.coach}
              slot={draft.coach.slot}
              clubName={draft.club.name}
              clubLogoUrl={draft.club.logoUrl}
              clubAccent={draft.club.accent}
              countryCode3={draft.coach.identity.countryCode3}
              locale="en-GB"
              displayMode="compact"
              optimizeForLiveCompact
              forceNeonActive
              enableInteractiveNeon={false}
              assetLoading="eager"
              frameLoading="eager"
              frameDecoding="sync"
              frameFetchPriority="high"
            />
          </div>
          <div className={styles.coachCopy}>
            <span>CURRENT CLUB COACH</span>
            <strong>{draft.coach.identity.coach.displayName}</strong>
            <small>{draft.club.name} · {draft.coach.slot.cardTier.replaceAll("-", " ")}</small>
          </div>
        </div>
        <footer className={styles.footer}>
          <span>TOUCHLINE VERIFIED · FIXTURE {draft.fixtureId}</span>
          <strong>COMING SOON <i>•</i> CURRENTLY IN TESTING</strong>
        </footer>
      </section>
    </main>
  );
}
