import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { readTouchlineSocialLineupDraft } from "@/lib/touchlineArena/social-lineup-draft-server";
import { readTouchlineSocialMatchPreviewDraft } from "@/lib/touchlineArena/social-match-preview-draft-server";
import { readTouchlineSocialFinalScoreDraft } from "@/lib/touchlineArena/social-final-score-draft-server";
import { readTouchlineSocialConfirmedEventDraft } from "@/lib/touchlineArena/social-confirmed-event-draft-server";
import { readTouchlineSocialRankingFamilyDraft } from "@/lib/touchlineArena/social-ranking-family-draft-server";
import { TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES, type TouchlineSocialRankingContentType } from "@/lib/touchlineArena/social-ranking-family-contract";
import { assertTouchlineSocialQaRuntime } from "@/lib/touchlineArena/social-artifact-storage-server";

const NUMERIC_ID = /^[1-9]\d{0,19}$/;

function authorized(request: NextRequest) {
  const secret = process.env.TOUCHLINE_LIVE_SYNC_SECRET?.trim() ?? "";
  const provided = request.cookies.get("tl-social-render")?.value?.trim() ?? "";
  if (secret.length < 32 || provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    assertTouchlineSocialQaRuntime();
  } catch {
    return response({ ok: false, reason: "QA_BOUNDARY_UNAVAILABLE" }, 404);
  }
  if (!authorized(request)) return response({ ok: false, reason: "UNAUTHORIZED" }, 401);
  const fixtureId = request.nextUrl.searchParams.get("fixtureId")?.trim() ?? "";
  const teamId = request.nextUrl.searchParams.get("teamId")?.trim() ?? "";
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim() ?? "";
  const scopeId = request.nextUrl.searchParams.get("scopeId")?.trim() ?? "";
  const playerId = request.nextUrl.searchParams.get("playerId")?.trim() ?? "";
  const contentType = request.nextUrl.searchParams.get("contentType")?.trim() || "LINEUP";
  const rankingFamily = TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES.includes(contentType as TouchlineSocialRankingContentType);
  const gameweekScoped = ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "GAMEWEEK_HERO"].includes(contentType);
  const playerScoped = ["GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"].includes(contentType);
  if (!NUMERIC_ID.test(fixtureId)
    || !["LINEUP", "MATCH_PREVIEW", "FULL_TIME", "FINAL_SCORE", "GOAL_CONFIRMED", "RED_CARD_CONFIRMED",
      ...TOUCHLINE_SOCIAL_RANKING_CONTENT_TYPES].includes(contentType as never)
    || (contentType === "LINEUP" && !NUMERIC_ID.test(teamId))
    || (contentType !== "LINEUP" && teamId)
    || (["GOAL_CONFIRMED", "RED_CARD_CONFIRMED"].includes(contentType) && !NUMERIC_ID.test(eventId))
    || (!["GOAL_CONFIRMED", "RED_CARD_CONFIRMED"].includes(contentType) && eventId)
    || (gameweekScoped !== Boolean(scopeId)) || (scopeId && !NUMERIC_ID.test(scopeId))
    || (playerScoped !== Boolean(playerId)) || (playerId && !NUMERIC_ID.test(playerId))
    || (!rankingFamily && (scopeId || playerId))) {
    return response({ ok: false, reason: "INVALID_IDENTITY" }, 400);
  }
  if (rankingFamily) {
    const current = await readTouchlineSocialRankingFamilyDraft({
      contentType: contentType as TouchlineSocialRankingContentType,
      fixtureId,
      scopeId: scopeId || null,
      playerId: playerId || null,
    });
    if (!current.ok) return response({ ok: false, reason: current.reason }, 409);
    return response({
      ok: true, contentType, fixtureId: current.data.fixtureId, teamId: null, eventId: null,
      scopeId: current.data.scopeId, playerId: current.data.playerId,
      sourceVersion: current.data.sourceVersion, sourceChecksum: current.data.sourceChecksum,
      sourceRevisionManifest: current.data.sourceRevisionManifest,
      sourceRevisionChecksum: current.data.sourceRevisionChecksum,
      firstObservedAt: current.data.firstObservedAt,
      sourceSnapshotAt: current.data.sourceSnapshotAt,
      caption: current.data.caption,
    });
  }
  if (contentType === "MATCH_PREVIEW") {
    const current = await readTouchlineSocialMatchPreviewDraft({ fixtureId });
    if (!current.ok) return response({ ok: false, reason: current.reason }, 409);
    return response({
      ok: true,
      contentType,
      fixtureId: current.data.fixtureId,
      teamId: null,
      startsAt: current.data.startsAt,
      sourceVersion: current.data.sourceVersion,
      sourceChecksum: current.data.sourceChecksum,
      sourceRevisionManifest: current.data.sourceRevisionManifest,
      sourceRevisionChecksum: current.data.sourceRevisionChecksum,
      sourceSnapshotAt: current.data.sourceSnapshotAt,
    });
  }
  if (contentType === "FULL_TIME" || contentType === "FINAL_SCORE") {
    const current = await readTouchlineSocialFinalScoreDraft(fixtureId);
    if (!current.ok) return response({ ok: false, reason: current.reason }, 409);
    return response({
      ok: true,
      contentType,
      fixtureId: current.data.fixtureId,
      teamId: null,
      startsAt: current.data.startsAt,
      sourceVersion: current.data.sourceVersion,
      sourceChecksum: current.data.sourceChecksum,
      sourceRevisionManifest: current.data.sourceRevisionManifest,
      sourceRevisionChecksum: current.data.sourceRevisionChecksum,
      sourceSnapshotAt: current.data.sourceSnapshotAt,
    });
  }
  if (contentType === "GOAL_CONFIRMED" || contentType === "RED_CARD_CONFIRMED") {
    const current = await readTouchlineSocialConfirmedEventDraft(fixtureId, eventId);
    if (!current.ok || current.data.contentType !== contentType) {
      return response({ ok: false, reason: current.ok ? "CONTENT_TYPE_MISMATCH" : current.reason }, 409);
    }
    return response({
      ok: true, contentType, fixtureId: current.data.fixtureId, eventId: current.data.eventId,
      teamId: null, startsAt: current.data.startsAt, sourceVersion: current.data.sourceVersion,
      sourceChecksum: current.data.sourceChecksum,
      sourceRevisionManifest: current.data.sourceRevisionManifest,
      sourceRevisionChecksum: current.data.sourceRevisionChecksum,
      sourceSnapshotAt: current.data.sourceSnapshotAt,
    });
  }
  const current = await readTouchlineSocialLineupDraft({ fixtureId, teamId });
  if (!current.ok) return response({ ok: false, reason: current.reason }, 409);
  return response({
    ok: true,
    contentType,
    fixtureId: current.data.fixtureId,
    teamId: current.data.club.teamId,
    sourceVersion: current.data.sourceVersion,
    sourceChecksum: current.data.sourceChecksum,
    sourceRevisionManifest: current.data.sourceRevisionManifest,
    sourceRevisionChecksum: current.data.sourceRevisionChecksum,
    sourceSnapshotAt: current.data.capturedAt,
  });
}
