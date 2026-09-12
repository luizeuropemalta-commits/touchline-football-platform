import "server-only";

import { createHash } from "node:crypto";

import { readClubHubNextFixturePreview } from "@/app/visual-qa/clubhub-next-fixture-post/preview-draft";
import { readTouchlineFullTimeVisualQaPreview } from "@/app/visual-qa/social-full-time/preview-draft";
import { readTouchlineGoalHatLayoutVisualQaPreview } from "@/app/visual-qa/social-confirmed-event/preview-draft";
import type { TouchlineSocialConfirmedEventArtworkDraft } from "@/components/touchline/social/TouchlineSocialApprovedGoalHatLayoutDemo";
import type { TouchlineSocialFinalScoreArtworkDraft } from "@/components/touchline/social/TouchlineSocialApprovedFinalScoreDraft";
import type { TouchlineSocialMatchPreviewArtworkDraft } from "@/components/touchline/social/TouchlineSocialApprovedMatchPreviewDraft";

function checksum(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function approvedClub(club: Readonly<{
  teamId: string;
  name: string;
  shortCode: string;
  accent: string;
  secondaryAccent?: string;
  logoUrl?: string;
}>) {
  if (!club.logoUrl) return null;
  return {
    teamId: club.teamId,
    name: club.name,
    shortCode: club.shortCode,
    accent: club.accent,
    secondaryAccent: club.secondaryAccent,
    logoUrl: club.logoUrl,
  };
}

/**
 * These adapters deliberately consume only checked-in visual-QA fixtures.
 * They do not call a canonical reader, create a draft, persist anything, or
 * connect to an outbound publisher. They exist solely so the new standalone
 * renderer bytes can be inspected before an owner approves their checksum.
 */
export async function readApproved041VisualQaSnapshot(): Promise<TouchlineSocialMatchPreviewArtworkDraft | null> {
  const preview = await readClubHubNextFixturePreview();
  if (!preview) return null;
  const { draft } = preview;
  return {
    sourceVersion: "touchline-approved-snapshot-visual-qa-v1",
    sourceChecksum: checksum({ fixture: draft.fixtureId, source: draft.sourceChecksum, renderer: "041" }),
    sourceRevisionChecksum: checksum({ sourceSnapshotAt: draft.sourceSnapshotAt, renderer: "041" }),
    sourceSnapshotAt: draft.sourceSnapshotAt,
    startsAt: draft.startsAt,
    caption: "LOCAL VISUAL QA ONLY · OUTBOUND DISABLED",
    gameweekNumber: draft.gameweekNumber,
    venue: draft.venue,
    home: {
      teamId: draft.home.club.teamId,
      name: draft.home.club.name,
      shortCode: draft.home.club.shortCode,
      accent: draft.home.club.accent,
      secondaryAccent: draft.home.club.secondaryAccent,
      logoUrl: draft.home.club.logoUrl,
      leader: { card: draft.home.leader.card, totalRating: draft.home.leader.totalRating },
    },
    away: {
      teamId: draft.away.club.teamId,
      name: draft.away.club.name,
      shortCode: draft.away.club.shortCode,
      accent: draft.away.club.accent,
      secondaryAccent: draft.away.club.secondaryAccent,
      logoUrl: draft.away.club.logoUrl,
      leader: { card: draft.away.leader.card, totalRating: draft.away.leader.totalRating },
    },
  };
}

export async function readApproved042VisualQaSnapshot(): Promise<TouchlineSocialFinalScoreArtworkDraft | null> {
  const preview = await readTouchlineFullTimeVisualQaPreview();
  if (!preview) return null;
  const home = approvedClub(preview.home);
  const away = approvedClub(preview.away);
  const topTeam = approvedClub(preview.topMatchCard.team);
  if (!home || !away || !topTeam) return null;
  return { ...preview, home, away, topMatchCard: { ...preview.topMatchCard, team: topTeam } };
}

export async function readApproved043VisualQaSnapshot(): Promise<TouchlineSocialConfirmedEventArtworkDraft | null> {
  const preview = await readTouchlineGoalHatLayoutVisualQaPreview();
  if (!preview) return null;
  const home = approvedClub(preview.home);
  const away = approvedClub(preview.away);
  if (!home || !away) return null;
  return { ...preview, home, away };
}
