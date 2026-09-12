/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "./TouchlineSocialApprovedExactCard";
import {
  APPROVED_SOCIAL_SNAPSHOT_VARS,
  approvedSnapshotCard,
  type TouchlineApprovedCardSource,
  type TouchlineApprovedClub,
} from "./TouchlineSocialApprovedSnapshotPrimitives";

type Goal = Readonly<{ id: string; teamId: string; playerName: string; minute: number; extraMinute: number | null; kind: "goal" | "own-goal" | "penalty" }>;
export type TouchlineSocialFinalScoreArtworkDraft = Readonly<{
  sourceProvenance: string; sourceVersion: string; sourceChecksum: string; sourceRevisionChecksum: string; sourceSnapshotAt: string; startsAt: string; capturedAt: string; caption: string; gameweekNumber: number;
  home: TouchlineApprovedClub; away: TouchlineApprovedClub; score: Readonly<{ home: number; away: number }>; venue: Readonly<{ name: string; interiorImageUrl: string }>;
  goals: readonly Goal[]; topMatchCard: Readonly<{ card: TouchlineApprovedCardSource; officialMatchRating: number; team: TouchlineApprovedClub }>; visualQa?: Readonly<{ sampleData: true; label: string }>;
}>;

const TOP_CARD_WIDTH = 286;
const goalMinute = (minute: number, extraMinute: number | null) => `${minute}${extraMinute ? `+${extraMinute}` : ""}'`;

/** Frozen 042 composition: render-only serialised input, no runtime data/layout/ranking dependency. */
export default function TouchlineSocialFinalScoreDraftView({ draft, placement = "feed" }: Readonly<{ draft: TouchlineSocialFinalScoreArtworkDraft; placement?: "feed" | "story" }>) {
  const winner = draft.score.home === draft.score.away ? null : draft.score.home > draft.score.away ? draft.home : draft.away;
  const isVisualQa = draft.sourceProvenance === "LOCAL_NON_PUBLISHABLE_VISUAL_QA";
  return <main data-social-approved-snapshot="042" data-social-art="touchline-final-score" data-social-placement={placement} data-template-version={placement === "feed" ? "touchline-full-time-feed-v1" : "touchline-final-score-story-v1"} data-source-version={draft.sourceVersion} data-source-checksum={draft.sourceChecksum} data-source-revision-checksum={draft.sourceRevisionChecksum} data-source-snapshot-at={draft.sourceSnapshotAt} data-static-export="true" style={{ ...APPROVED_SOCIAL_SNAPSHOT_VARS, minHeight: 1350, padding: 42, color: "#f8fff0", background: `linear-gradient(#02120cdd,#020805ee), url(${JSON.stringify(draft.venue.interiorImageUrl)}) center/cover`, fontFamily: "Arial, sans-serif" } as CSSProperties}>
    <header style={{ display: "flex", justifyContent: "space-between", color: "#9eff2d", fontWeight: 900 }}><span>{isVisualQa ? draft.visualQa?.label : "TOUCHLINE VERIFIED"}</span><span>FULL-TIME REPORT</span></header>
    <section aria-label={`${draft.home.name} ${draft.score.home}, ${draft.away.name} ${draft.score.away}`} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "start", gap: 20, marginTop: 52, textAlign: "center" }}>
      <ClubFinal club={draft.home} goals={draft.goals.filter((goal) => goal.teamId === draft.home.teamId)} />
      <div><strong style={{ display: "block", fontSize: 96, color: "#f6d45f" }}>{draft.score.home}–{draft.score.away}</strong><small>GAMEWEEK {draft.gameweekNumber} · {draft.venue.name.toUpperCase()}</small></div>
      <ClubFinal club={draft.away} goals={draft.goals.filter((goal) => goal.teamId === draft.away.teamId)} />
    </section>
    <section style={{ display: "grid", gridTemplateColumns: "1fr 360px", alignItems: "center", gap: 40, marginTop: 60 }}>
      <div><small style={{ color: "#9eff2d", fontWeight: 900 }}>MATCH REPORT</small><h1 style={{ fontSize: 52 }}>{winner ? `${winner.name} claim the win` : "Honours shared at full time"}</h1><p>Verified final score and scorers from the TouchLine match centre.</p></div>
      <div style={{ width: 430, height: 690, transform: `scale(${TOP_CARD_WIDTH / 430})`, transformOrigin: "top center", marginBottom: -690 * (1 - TOP_CARD_WIDTH / 430) }}><TouchlineEliteExactCard player={approvedSnapshotCard(draft.topMatchCard.card, draft.topMatchCard.team)} staticRenderScale={1} /></div>
    </section>
    <footer style={{ display: "flex", justifyContent: "space-between", marginTop: 44, color: "#b9c4bf", fontSize: 14 }}><span>{isVisualQa ? "LOCAL VISUAL QA · NON-PUBLISHABLE" : `TOUCHLINE ENGLAND · VERIFIED ${new Date(draft.capturedAt).toISOString()}`}</span><strong>OUTBOUND DISABLED</strong></footer>
  </main>;
}

function ClubFinal({ club, goals }: Readonly<{ club: TouchlineApprovedClub; goals: readonly Goal[] }>) {
  return <article><img src={club.logoUrl} alt="" aria-hidden="true" width={128} height={128} style={{ objectFit: "contain", filter: `drop-shadow(0 0 10px ${club.accent})` }} /><strong style={{ display: "block", fontSize: 30 }}>{club.name}</strong>{goals.map((goal) => <div key={goal.id}>{goal.playerName} {goalMinute(goal.minute, goal.extraMinute)}{goal.kind === "penalty" ? " PEN" : goal.kind === "own-goal" ? " OG" : ""}</div>)}</article>;
}
