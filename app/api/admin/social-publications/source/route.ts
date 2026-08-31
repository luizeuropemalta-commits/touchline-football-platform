import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { readTouchlineSocialLineupDraft } from "@/lib/touchlineArena/social-lineup-draft-server";
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
  if (!NUMERIC_ID.test(fixtureId) || !NUMERIC_ID.test(teamId)) {
    return response({ ok: false, reason: "INVALID_IDENTITY" }, 400);
  }
  const current = await readTouchlineSocialLineupDraft({ fixtureId, teamId });
  if (!current.ok) return response({ ok: false, reason: current.reason }, 409);
  return response({
    ok: true,
    fixtureId: current.data.fixtureId,
    teamId: current.data.club.teamId,
    sourceVersion: current.data.sourceVersion,
    sourceChecksum: current.data.sourceChecksum,
    sourceRevisionManifest: current.data.sourceRevisionManifest,
    sourceRevisionChecksum: current.data.sourceRevisionChecksum,
    sourceSnapshotAt: current.data.capturedAt,
  });
}
