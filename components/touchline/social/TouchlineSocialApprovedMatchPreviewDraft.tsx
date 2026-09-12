import type { CSSProperties } from "react";

import {
  APPROVED_SOCIAL_SNAPSHOT_VARS,
  TouchlineSocialApprovedDuel,
  TouchlineSocialApprovedScoreboard,
  type TouchlineApprovedCardSource,
  type TouchlineApprovedClub,
} from "./TouchlineSocialApprovedSnapshotPrimitives";

export type TouchlineSocialMatchPreviewArtworkDraft = Readonly<{
  sourceVersion: string; sourceChecksum: string; sourceRevisionChecksum: string; sourceSnapshotAt: string; startsAt: string; caption: string; gameweekNumber: number; venue: Readonly<{ name: string; interiorImageUrl: string }>;
  home: TouchlineApprovedClub & Readonly<{ leader: Readonly<{ card: TouchlineApprovedCardSource; totalRating: number }> }>;
  away: TouchlineApprovedClub & Readonly<{ leader: Readonly<{ card: TouchlineApprovedCardSource; totalRating: number }> }>;
}>;

/** Frozen 041 composition. The input is an immutable draft: no ranking/live/data/layout dependency is permitted here. */
export default function TouchlineSocialApprovedMatchPreviewDraft({ draft }: Readonly<{ draft: TouchlineSocialMatchPreviewArtworkDraft }>) {
  const kickoff = new Date(draft.startsAt).toISOString().replace("T", " ").slice(0, 16);
  return <main data-social-approved-snapshot="041" data-social-art="touchline-match-preview" data-social-placement="feed" data-template-version="touchline-match-preview-feed-v1" data-source-version={draft.sourceVersion} data-source-checksum={draft.sourceChecksum} data-source-revision-checksum={draft.sourceRevisionChecksum} data-source-snapshot-at={draft.sourceSnapshotAt} data-static-export="true" style={{ ...APPROVED_SOCIAL_SNAPSHOT_VARS, minHeight: 1350, padding: 42, color: "#f8fff0", background: `linear-gradient(#02120cdd,#020805e8), url(${JSON.stringify(draft.venue.interiorImageUrl)}) center/cover`, fontFamily: "Arial, sans-serif" } as CSSProperties}>
    <header style={{ display: "flex", justifyContent: "space-between", color: "#9eff2d", fontWeight: 900 }}><span>TOUCHLINE VERIFIED</span><span>PREMIER LEAGUE · GAMEWEEK {draft.gameweekNumber}</span></header>
    <h1 style={{ textAlign: "center", marginTop: 54 }}>MATCH PREVIEW</h1>
    <TouchlineSocialApprovedScoreboard home={draft.home} away={draft.away} eyebrow={kickoff} footer={draft.venue.name} />
    <h2 style={{ textAlign: "center", margin: "46px 0 22px" }}>WHO COMES OUT ON TOP?</h2>
    <TouchlineSocialApprovedDuel sides={[{ club: draft.home, card: draft.home.leader.card, totalRating: draft.home.leader.totalRating }, { club: draft.away, card: draft.away.leader.card, totalRating: draft.away.leader.totalRating }]} />
    <footer style={{ display: "flex", justifyContent: "space-between", marginTop: 34, color: "#b9c4bf" }}><span>TOUCHLINE VERIFIED MATCH DATA</span><strong>OUTBOUND DISABLED</strong></footer>
  </main>;
}
