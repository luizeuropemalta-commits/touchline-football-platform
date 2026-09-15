import type { CSSProperties } from "react";

import type { TouchlineSocialMatchPreviewArtworkDraft } from "@/components/touchline/social/TouchlineSocialApprovedMatchPreviewDraft";
import {
  APPROVED_SOCIAL_SNAPSHOT_VARS,
  TouchlineSocialApprovedDuel,
  TouchlineSocialApprovedScoreboard,
} from "@/components/touchline/social/TouchlineSocialApprovedSnapshotPrimitives";

import styles from "./TouchlineSocialMatchPreviewLiveMotionPreview.module.css";

export const TOUCHLINE_MATCH_PREVIEW_LIVE_LOOP_MS = 6_000;

export type TouchlineMatchPreviewPresentation = "feed" | "story";

function normaliseFrame(frameMs: number) {
  if (!Number.isFinite(frameMs)) return 0;
  return ((Math.floor(frameMs) % TOUCHLINE_MATCH_PREVIEW_LIVE_LOOP_MS)
    + TOUCHLINE_MATCH_PREVIEW_LIVE_LOOP_MS) % TOUCHLINE_MATCH_PREVIEW_LIVE_LOOP_MS;
}

function kickoffInMalta(startsAt: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Malta",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startsAt)).replace(",", " ·");
}

function MatchPreviewCandidateArtwork({
  draft,
  presentation,
}: Readonly<{
  draft: TouchlineSocialMatchPreviewArtworkDraft;
  presentation: TouchlineMatchPreviewPresentation;
}>) {
  const story = presentation === "story";
  const kickoff = `${kickoffInMalta(draft.startsAt)} · Europe/Malta`;
  return (
    <main
      data-match-preview-candidate-artwork="true"
      data-social-art="touchline-match-preview"
      data-social-placement={presentation}
      data-template-version="touchline-match-preview-live-candidate-v1"
      data-source-version={draft.sourceVersion}
      data-source-checksum={draft.sourceChecksum}
      data-source-revision-checksum={draft.sourceRevisionChecksum}
      data-source-snapshot-at={draft.sourceSnapshotAt}
      data-factual-state="preview"
      style={{
        ...APPROVED_SOCIAL_SNAPSHOT_VARS,
        minHeight: story ? 1920 : 1350,
        height: story ? 1920 : undefined,
        padding: story ? 68 : 42,
        color: "#f8fff0",
        background: `linear-gradient(#02120cdd,#020805e8), url(${JSON.stringify(draft.venue.interiorImageUrl)}) center/cover`,
        fontFamily: "Arial, sans-serif",
      } as CSSProperties}
    >
      <header style={{ display: "flex", justifyContent: "space-between", color: "#9eff2d", fontWeight: 900 }}>
        <span>TOUCHLINE PREVIEW</span>
        <span>PREMIER LEAGUE · GAMEWEEK {draft.gameweekNumber}</span>
      </header>
      <h1 style={{ textAlign: "center", marginTop: 54 }}>MATCH PREVIEW</h1>
      <TouchlineSocialApprovedScoreboard home={draft.home} away={draft.away} eyebrow={kickoff} footer={draft.venue.name} />
      <h2 style={{ textAlign: "center", margin: "46px 0 22px" }}>WHO COMES OUT ON TOP?</h2>
      <TouchlineSocialApprovedDuel sides={[
        { club: draft.home, card: draft.home.leader.card, totalRating: draft.home.leader.totalRating },
        { club: draft.away, card: draft.away.leader.card, totalRating: draft.away.leader.totalRating },
      ]} />
      <footer style={{ display: "flex", justifyContent: "space-between", marginTop: 34, color: "#b9c4bf" }}>
        <span>TOUCHLINE MATCH PREVIEW</span><strong>PREVIEW</strong>
      </footer>
    </main>
  );
}

/**
 * Local motion wrapper for an unapproved candidate renderer.
 *
 * The owner-approved 041 renderer remains byte-frozen and is never imported
 * into this candidate. Story gets its own 1080x1920 container and is never
 * treated as approved merely because the historical Feed source exists.
 */
export default function TouchlineSocialMatchPreviewLiveMotionPreview({
  draft,
  presentation,
  frameMs = 0,
  animate = false,
}: Readonly<{
  draft: TouchlineSocialMatchPreviewArtworkDraft;
  presentation: TouchlineMatchPreviewPresentation;
  frameMs?: number;
  animate?: boolean;
}>) {
  const frame = normaliseFrame(frameMs);
  const motionStyle = {
    "--match-preview-motion-delay": `-${frame}ms`,
    "--match-preview-motion-play-state": animate ? "running" : "paused",
  } as CSSProperties;

  return (
    <section
      className={[styles.presentation, presentation === "story" ? styles.story : styles.feed].join(" ")}
      style={motionStyle}
      data-match-preview-live-preview="non-publishable"
      data-presentation={presentation}
      data-approval-state={presentation === "feed" ? "historical-feed-source-only" : "story-candidate-requires-approval"}
      data-motion-loop-ms={TOUCHLINE_MATCH_PREVIEW_LIVE_LOOP_MS}
      data-motion-frame-ms={frame}
      data-motion-mode={animate ? "animated" : "deterministic-frame"}
    >
      <div className={styles.motionFrame}>
        <MatchPreviewCandidateArtwork draft={draft} presentation={presentation} />
      </div>
    </section>
  );
}
