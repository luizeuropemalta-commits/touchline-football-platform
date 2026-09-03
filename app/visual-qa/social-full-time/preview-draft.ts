import "server-only";

import { createHash } from "node:crypto";

import { readClubHubNextFixturePreview } from "@/app/visual-qa/clubhub-next-fixture-post/preview-draft";
import type { TouchlineSocialFinalScoreArtworkDraft } from "@/components/touchline/social/TouchlineSocialFinalScoreDraft";

function checksum(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

/**
 * Non-publishable visual proof for owner review. Club identity, card art and
 * venue come from the frozen QA snapshot. The result and match rating are
 * deliberately labelled as sample data inside the artwork and never enter
 * the canonical 042 reader, approval flow or outbound queue.
 */
export async function readTouchlineFullTimeVisualQaPreview(): Promise<TouchlineSocialFinalScoreArtworkDraft | null> {
  const matchPreview = await readClubHubNextFixturePreview();
  if (!matchPreview) return null;
  const { draft } = matchPreview;
  const sampleFacts = {
    kind: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    homeTeamId: draft.home.club.teamId,
    awayTeamId: draft.away.club.teamId,
    venue: draft.venue.name,
    score: { home: 2, away: 1 },
    sampleMatchRating: 8.82,
  } as const;
  const sourceChecksum = checksum(sampleFacts);

  return {
    sourceProvenance: "LOCAL_NON_PUBLISHABLE_VISUAL_QA",
    visualQa: { sampleData: true, label: "VISUAL QA · SAMPLE DATA" },
    fixtureId: "local-visual-qa-full-time",
    capturedAt: draft.sourceSnapshotAt,
    sourceSnapshotAt: draft.sourceSnapshotAt,
    startsAt: draft.startsAt,
    status: "VISUAL_QA_SAMPLE",
    seasonProviderId: draft.seasonProviderId,
    gameweekNumber: draft.gameweekNumber,
    venue: draft.venue,
    caption: "LOCAL VISUAL QA ONLY · FINAL COPY AWAITS VERIFIED 042 DATA",
    sourceVersion: "touchline-final-result-v1",
    sourceChecksum,
    sourceRevisionManifest: { localVisualQa: 1 },
    sourceRevisionChecksum: sourceChecksum,
    home: draft.home.club,
    away: draft.away.club,
    score: sampleFacts.score,
    goals: [],
    topMatchCard: {
      card: draft.home.leader.card,
      officialMatchRating: sampleFacts.sampleMatchRating,
      team: draft.home.club,
    },
  };
}
