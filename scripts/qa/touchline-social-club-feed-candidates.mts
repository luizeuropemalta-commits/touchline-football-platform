import type { SupabaseClient } from "@supabase/supabase-js";

import { adaptTouchlineClubTimelineCopy } from "../../lib/touchlineArena/social-club-feed-contract.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const DISCOVERY_LIMIT = 100;

const ELIGIBLE_CONTENT_TYPES = Object.freeze([
  "LINEUP", "FULL_TIME", "GOAL_CONFIRMED", "RED_CARD_CONFIRMED",
  "GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL",
  "GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO",
]);

export type TouchlineClubSocialFanoutCandidate = Readonly<{
  draftId: string;
  targetTeamIds: readonly string[];
  timelineCopy: string;
  timelineCopyChecksum: string;
}>;

export async function discoverTouchlineClubSocialFanoutCandidates(input: Readonly<{
  admin: SupabaseClient;
  explicitDraftId?: string | null;
}>) {
  const explicitDraftId = input.explicitDraftId?.trim() || null;
  if (explicitDraftId && !UUID.test(explicitDraftId)) throw new Error("TL_CLUB_FEED_EXPLICIT_DRAFT_INVALID");
  let query = input.admin.from("touchline_social_publication_drafts")
    .select("id,content_type,caption,approval_state,artwork_approval_state,caption_approval_state,approved_manifest_checksum,manifest_checksum")
    .eq("approval_state", "APPROVED")
    .eq("artwork_approval_state", "APPROVED")
    .eq("caption_approval_state", "APPROVED")
    .in("content_type", [...ELIGIBLE_CONTENT_TYPES])
    .order("created_at", { ascending: true })
    .limit(DISCOVERY_LIMIT + 1);
  if (explicitDraftId) query = query.eq("id", explicitDraftId);
  const { data, error } = await query;
  if (error || !Array.isArray(data) || data.length > DISCOVERY_LIMIT) {
    throw new Error("TL_CLUB_FEED_DRAFT_DISCOVERY_FAILED");
  }
  const candidates: TouchlineClubSocialFanoutCandidate[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    const draftId = String(raw.id ?? "");
    if (!UUID.test(draftId) || raw.approval_state !== "APPROVED"
      || raw.artwork_approval_state !== "APPROVED" || raw.caption_approval_state !== "APPROVED"
      || !SHA256.test(String(raw.manifest_checksum ?? ""))
      || raw.approved_manifest_checksum !== raw.manifest_checksum) {
      if (explicitDraftId) throw new Error("TL_CLUB_FEED_DRAFT_APPROVAL_INVALID");
      continue;
    }
    const copy = adaptTouchlineClubTimelineCopy(String(raw.caption ?? ""));
    if (!copy.ok) {
      if (explicitDraftId) throw new Error("TL_CLUB_FEED_TIMELINE_COPY_INVALID");
      continue;
    }
    const { data: targets, error: targetError } = await input.admin.rpc(
      "touchline_social_045_expected_team_ids",
      { p_draft_id: draftId },
    );
    const targetTeamIds = Array.isArray(targets) ? targets.map(String) : [];
    if (targetError || targetTeamIds.length < 1 || targetTeamIds.length > 20
      || targetTeamIds.some((teamId) => !NUMERIC_ID.test(teamId))
      || new Set(targetTeamIds).size !== targetTeamIds.length) {
      if (explicitDraftId) throw new Error("TL_CLUB_FEED_TARGETS_UNAVAILABLE");
      continue;
    }
    candidates.push(Object.freeze({
      draftId,
      targetTeamIds: Object.freeze(targetTeamIds),
      timelineCopy: copy.copy,
      timelineCopyChecksum: copy.checksum,
    }));
  }
  return Object.freeze(candidates);
}
