import type { CSSProperties } from "react";

import TouchlineEliteExactCard from "./TouchlineSocialApprovedExactCard";
import {
  APPROVED_SOCIAL_SNAPSHOT_VARS,
  approvedSnapshotCard,
  TouchlineSocialApprovedScoreboard,
  type TouchlineApprovedCardSource,
  type TouchlineApprovedClub,
} from "./TouchlineSocialApprovedSnapshotPrimitives";

type Moment = Readonly<{ eventId: string; kind: "goal" | "red-card" | "second-yellow-red" | "own-goal" | "penalty"; minute: number; extraMinute: number | null; score: Readonly<{ home: number; away: number }> }>;
export type TouchlineSocialConfirmedEventArtworkDraft = Readonly<{
  contentType: "GOAL_CONFIRMED" | "RED_CARD_CONFIRMED" | "HAT_TRICK_HERO";
  eventId: string; sourceProvenance: string; sourceVersion: string; sourceChecksum: string; sourceRevisionChecksum: string; sourceSnapshotAt: string; firstObservedAt: string; startsAt: string; caption: string;
  gameweekNumber: number; home: TouchlineApprovedClub; away: TouchlineApprovedClub; score: Readonly<{ home: number; away: number }>;
  venue: Readonly<{ name: string; interiorImageUrl: string }>; event: Readonly<{ playerTeamId: string; playerName: string; minute: number; extraMinute: number | null; kind: "goal" | "red-card" | "second-yellow-red" | "own-goal" | "penalty" }>;
  playerCard: TouchlineApprovedCardSource; confirmedGoalMoments?: readonly Moment[]; matchRating?: number | null; totalRating: number; touchlinePoints: number;
}>;

const minuteLabel = (minute: number, extra: number | null) => `${minute}${extra ? `+${extra}` : ""}'`;

/** Frozen 043 composition. It consumes only the checked draft; no provider/readers, layout persistence, ranking, or interactive card code. */
export default function TouchlineSocialGoalHatLayoutDemo({ draft }: Readonly<{ draft: TouchlineSocialConfirmedEventArtworkDraft }>) {
  if (!['GOAL_CONFIRMED', 'HAT_TRICK_HERO'].includes(draft.contentType)) return null;
  const club = draft.event.playerTeamId === draft.home.teamId ? draft.home : draft.away;
  const isHatTrick = draft.contentType === "HAT_TRICK_HERO";
  const moments = isHatTrick ? draft.confirmedGoalMoments ?? [] : [{ eventId: draft.eventId, kind: draft.event.kind, minute: draft.event.minute, extraMinute: draft.event.extraMinute, score: draft.score }];
  if (isHatTrick && moments.length !== 3) return null;
  const minute = minuteLabel(draft.event.minute, draft.event.extraMinute);
  const headline = isHatTrick ? "HAT-TRICK" : draft.event.kind === "own-goal" ? "OWN GOALLLLLL" : "GOAAAALLLLL";
  const points = draft.sourceProvenance !== "LOCAL_NON_PUBLISHABLE_VISUAL_QA" || draft.touchlinePoints !== 0 ? `${draft.touchlinePoints > 0 ? "+" : ""}${draft.touchlinePoints}` : "—";
  return <main data-social-approved-snapshot="043" data-social-art="touchline-confirmed-event" data-social-placement="feed" data-template-version={isHatTrick ? "touchline-hat-trick-feed-v1" : "touchline-goal-event-feed-v1"} data-source-version={draft.sourceVersion} data-source-checksum={draft.sourceChecksum} data-source-revision-checksum={draft.sourceRevisionChecksum} data-source-snapshot-at={draft.sourceSnapshotAt} data-static-export="true" style={{ ...APPROVED_SOCIAL_SNAPSHOT_VARS, "--hat-club-accent": club.accent, minHeight: 1350, padding: 42, color: "#f8fff0", background: `linear-gradient(#02120cdd,#020805e8), url(${JSON.stringify(draft.venue.interiorImageUrl)}) center/cover`, fontFamily: "Arial, sans-serif" } as CSSProperties}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong style={{ color: "#9eff2d" }}>TOUCHLINE VERIFIED</strong><TouchlineSocialApprovedScoreboard home={draft.home} away={draft.away} eyebrow={`GAMEWEEK ${draft.gameweekNumber}`} footer={minute} score={draft.score} /></header>
    <section style={{ display: "grid", gridTemplateColumns: "1fr 440px", gap: 32, alignItems: "center", marginTop: 44 }}>
      <div><small style={{ color: "#9eff2d", fontWeight: 900 }}>{draft.event.playerName} {isHatTrick ? "MAKES IT THREE" : "SCORES"}</small><h1 style={{ margin: "8px 0", color: "#f6d45f", fontSize: 82, lineHeight: .9 }}>{headline}</h1><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{moments.map((moment) => <span key={moment.eventId} style={{ padding: "10px 14px", border: `1px solid ${club.accent}`, borderRadius: 16 }}>{minuteLabel(moment.minute, moment.extraMinute)} {moment.kind === "penalty" ? "PEN" : moment.kind === "own-goal" ? "OWN GOAL" : "GOAL"}</span>)}</div><p>{club.name} · {draft.venue.name}</p><dl style={{ display: "flex", gap: 24 }}><div><dt>OFFICIAL MATCH RATING</dt><dd>{draft.matchRating?.toFixed(2) ?? "—"}</dd></div><div><dt>TOTAL RATING</dt><dd>{draft.totalRating.toFixed(2)}</dd></div><div><dt>TOUCHLINE POINTS</dt><dd style={{ color: "#f6d45f", fontSize: 40 }}>{points}</dd></div></dl></div>
      <div style={{ width: 430, height: 690 }}><TouchlineEliteExactCard player={approvedSnapshotCard({ ...draft.playerCard, matchStats: { ...(draft.playerCard.matchStats ?? {}), rating: draft.matchRating ?? undefined } }, club)} staticRenderScale={1} /></div>
    </section><footer style={{ display: "flex", justifyContent: "space-between", marginTop: 44 }}><span>{draft.sourceProvenance === "LOCAL_NON_PUBLISHABLE_VISUAL_QA" ? "LOCAL VISUAL QA · NON-PUBLISHABLE" : "TOUCHLINE VERIFIED MATCH DATA"}</span><strong>OUTBOUND DISABLED</strong></footer>
  </main>;
}
