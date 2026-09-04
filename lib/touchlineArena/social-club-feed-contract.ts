import { createHash } from "node:crypto";

import type { TouchlineRegisteredSocialContentType } from "./social-content-registry";

const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_SOURCE_WORDING = /(?:sportmonks|provider|\bapi\b)/i;
const CHANNEL_ONLY_WORDING = /(?:instagram|swipe)/i;
const TESTING_BANNER = /coming soon\s*(?:[•·|—-]\s*)?currently in testing/gi;
const FORBIDDEN_PUBLIC_WORDING = /(?:sportmonks|provider|\bapi\b|instagram|swipe|coming soon|currently in testing)/i;

export const TOUCHLINE_CLUB_SOCIAL_FEED_CHANNEL = "CLUB_SOCIAL_FEED" as const;
export const TOUCHLINE_CLUB_SOCIAL_FEED_RETENTION_DAYS = 14;
export const TOUCHLINE_CLUB_SOCIAL_FEED_PAGE_MAX = 12;
export const TOUCHLINE_CLUB_SOCIAL_FEED_COPY_VERSION = "touchline-club-social-copy-v1";

export type TouchlineClubSocialFeedEligibleContentType = Exclude<
  TouchlineRegisteredSocialContentType,
  "FINAL_SCORE"
>;

export type TouchlineClubSocialFanoutInput = Readonly<{
  contentType: TouchlineRegisteredSocialContentType;
  draftTeamId?: string | null;
  fixtureTeamIds?: readonly string[];
  eventTeamId?: string | null;
  subjectTeamId?: string | null;
  leagueTeamIds?: readonly string[];
}>;

function exactTeamIds(values: readonly string[] | undefined, expected: number | null) {
  const ids = [...new Set((values ?? []).map((value) => value.trim()))].sort((left, right) => (
    Number(left) - Number(right) || left.localeCompare(right, "en")
  ));
  if (ids.some((value) => !NUMERIC_ID.test(value))) return null;
  if (expected !== null && ids.length !== expected) return null;
  return ids;
}

export function touchlineClubSocialFanoutTargets(input: TouchlineClubSocialFanoutInput) {
  const fixtureTeams = exactTeamIds(input.fixtureTeamIds, 2);
  const leagueTeams = exactTeamIds(input.leagueTeamIds, 20);
  const draftTeamId = input.draftTeamId?.trim() || null;
  const eventTeamId = input.eventTeamId?.trim() || null;
  const subjectTeamId = input.subjectTeamId?.trim() || null;

  if (input.contentType === "FINAL_SCORE") {
    return { ok: false, reason: "FINAL_SCORE_STORY_NOT_DUPLICATED_IN_CLUB_FEED" } as const;
  }
  if (input.contentType === "LINEUP") {
    if (!fixtureTeams || !draftTeamId || !NUMERIC_ID.test(draftTeamId)
      || !fixtureTeams.includes(draftTeamId)) {
      return { ok: false, reason: "LINEUP_CLUB_SCOPE_INVALID" } as const;
    }
    return { ok: true, teamIds: Object.freeze([draftTeamId]) } as const;
  }
  if (["MATCH_PREVIEW", "FULL_TIME", "GOAL_CONFIRMED", "RED_CARD_CONFIRMED", "PLAYER_DUEL"].includes(input.contentType)) {
    return fixtureTeams
      ? { ok: true, teamIds: Object.freeze(fixtureTeams) } as const
      : { ok: false, reason: "FIXTURE_CLUB_SCOPE_INVALID" } as const;
  }
  if (["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL"].includes(input.contentType)) {
    return leagueTeams
      ? { ok: true, teamIds: Object.freeze(leagueTeams) } as const
      : { ok: false, reason: "GAMEWEEK_CLUB_SCOPE_INVALID" } as const;
  }
  if (input.contentType === "HAT_TRICK_HERO") {
    if (!eventTeamId || !NUMERIC_ID.test(eventTeamId) || !fixtureTeams?.includes(eventTeamId)) {
      return { ok: false, reason: "EVENT_CLUB_SCOPE_INVALID" } as const;
    }
    return { ok: true, teamIds: Object.freeze([eventTeamId]) } as const;
  }
  if (["GAMEWEEK_HERO", "TOP_PERFORMER"].includes(input.contentType)) {
    if (!subjectTeamId || !NUMERIC_ID.test(subjectTeamId)) {
      return { ok: false, reason: "SUBJECT_CLUB_SCOPE_INVALID" } as const;
    }
    return { ok: true, teamIds: Object.freeze([subjectTeamId]) } as const;
  }
  return { ok: false, reason: "CLUB_FEED_CONTENT_TYPE_UNSUPPORTED" } as const;
}

function cleanTimelineLine(line: string) {
  const withoutHashtags = line.replace(/(?:^|\s)#[\p{L}\p{N}_-]+/gu, " ");
  return withoutHashtags.replace(TESTING_BANNER, " ").replace(/\s+/g, " ").trim();
}

export function adaptTouchlineClubTimelineCopy(caption: string) {
  if (FORBIDDEN_SOURCE_WORDING.test(caption)) {
    return { ok: false, reason: "TIMELINE_COPY_INVALID" } as const;
  }
  const cleaned = caption
    .split(/\r?\n/)
    .map(cleanTimelineLine)
    .filter((line) => line && !CHANNEL_ONLY_WORDING.test(line))
    .join("\n")
    .trim();
  if (!cleaned || cleaned.length > 2_000 || cleaned.includes("#") || FORBIDDEN_PUBLIC_WORDING.test(cleaned)) {
    return { ok: false, reason: "TIMELINE_COPY_INVALID" } as const;
  }
  const checksum = `sha256:${createHash("sha256").update([
    TOUCHLINE_CLUB_SOCIAL_FEED_COPY_VERSION,
    cleaned,
  ].join("\n"), "utf8").digest("hex")}`;
  return { ok: true, copy: cleaned, checksum } as const;
}

export type TouchlineClubSocialFeedCursor = Readonly<{
  publishedAt: string;
  postId: string;
}>;

export function encodeTouchlineClubSocialFeedCursor(cursor: TouchlineClubSocialFeedCursor) {
  if (!Number.isFinite(Date.parse(cursor.publishedAt)) || !UUID.test(cursor.postId)) return null;
  return Buffer.from(`${new Date(cursor.publishedAt).toISOString()}|${cursor.postId}`, "utf8").toString("base64url");
}

export function decodeTouchlineClubSocialFeedCursor(cursor: string | null | undefined) {
  if (!cursor || cursor.length > 180) return null;
  try {
    const [publishedAt, postId, extra] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (extra !== undefined || !publishedAt || !postId
      || !Number.isFinite(Date.parse(publishedAt)) || !UUID.test(postId)) return null;
    return Object.freeze({ publishedAt: new Date(publishedAt).toISOString(), postId });
  } catch {
    return null;
  }
}

export function touchlineClubSocialFeedPageSize(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) >= 1
    ? Math.min(Number(value), TOUCHLINE_CLUB_SOCIAL_FEED_PAGE_MAX)
    : 6;
}
