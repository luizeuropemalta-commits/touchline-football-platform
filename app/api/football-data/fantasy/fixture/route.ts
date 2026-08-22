import { NextRequest, NextResponse } from "next/server";

import { toPublicFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-fixture";
import { readPersistedFantasyFixtureFeed } from "@/lib/football-data/public-fantasy-snapshot";
import { readPublicFantasyFixtureMatchDetail } from "@/lib/football-data/public-fixture-match-detail-server";
import { requireAuthenticatedOrLocalTouchlineEditor } from "@/lib/touchlineArena/api-access";

const FIXTURE_ID_PATTERN = /^[0-9]{1,20}$/;

function fixtureIdFromRequest(request: NextRequest) {
  const candidate = request.nextUrl.searchParams.get("fixtureId") ?? request.nextUrl.searchParams.get("id");
  const fixtureId = candidate?.trim();
  return fixtureId && FIXTURE_ID_PATTERN.test(fixtureId) ? fixtureId : null;
}

export async function GET(request: NextRequest) {
  const accessError = await requireAuthenticatedOrLocalTouchlineEditor(request);
  if (accessError) return accessError;

  const fixtureId = fixtureIdFromRequest(request);
  if (!fixtureId) {
    return NextResponse.json(
      { ok: false, error: "A valid numeric fixtureId is required." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let data;
  try {
    const snapshot = await readPersistedFantasyFixtureFeed(fixtureId);
    const publicFeed = snapshot ? toPublicFantasyFixtureFeed(snapshot.feed) : null;
    data = publicFeed
      ? await readPublicFantasyFixtureMatchDetail(fixtureId, publicFeed)
      : null;
  } catch {
    data = null;
  }
  if (!data) {
    return NextResponse.json(
      {
        ok: false,
        error: "No coherent persisted fixture feed is available.",
        status: "canonical-fixture-feed-unavailable",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json({
    ok: true,
    data,
    capturedAt: data.capturedAt,
    state: "persisted-snapshot",
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Browser routes are never an ingestion path. A protected server-only job is
 * required before persisted fixture data may be refreshed.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Fixture ingestion is not available from this route.",
      status: "method-not-allowed",
    },
    { status: 405, headers: { Allow: "GET", "Cache-Control": "private, no-store" } },
  );
}
