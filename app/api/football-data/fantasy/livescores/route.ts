import { NextResponse } from "next/server";

import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { readPersistedLiveScoreSnapshot } from "@/lib/football-data/live-score-persistence";
import { toPublicTouchlineFixtures } from "@/lib/football-data/public-fixture";
import { selectArenaFixtureRound } from "@/lib/touchlineArena/arena-fixture-round";

const LIVE_SNAPSHOT_STALE_AFTER_MS = 5 * 60 * 1_000;

function response(
  fixtures: Parameters<typeof toPublicTouchlineFixtures>[0],
  metadata: {
    state: "persisted-live-snapshot" | "partial-persisted-schedule";
    fetchedAt?: string;
    degraded: boolean;
  },
) {
  return NextResponse.json({
    ok: true,
    data: toPublicTouchlineFixtures(fixtures),
    state: metadata.state,
    ...(metadata.fetchedAt ? { fetchedAt: metadata.fetchedAt } : {}),
    degraded: metadata.degraded,
  }, {
    // A shared versioned projection does not exist yet, so this must not be
    // promoted to a CDN-cached canonical matchweek response.
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Browser-readable live state is a durable snapshot only. It never refreshes
 * a provider, merges process-local deltas, or persists from a request.
 */
export async function GET() {
  let liveSnapshot;
  try {
    // Retain the last structurally valid durable snapshot as honest LKG; the
    // response marks it degraded once it is older than the live freshness SLA.
    liveSnapshot = await readPersistedLiveScoreSnapshot({ maxAgeMs: Number.MAX_SAFE_INTEGER });
  } catch {
    liveSnapshot = null;
  }

  // An empty last-known-good Live snapshot must never hide a valid persisted
  // weekly schedule. It is common before the first kick-off, when the score
  // feed has been initialised but contains no fixtures yet.
  if (liveSnapshot?.fixtures.length) {
    return response(liveSnapshot.fixtures, {
      state: "persisted-live-snapshot",
      fetchedAt: liveSnapshot.fetchedAt,
      degraded: Date.now() - liveSnapshot.storedAt > LIVE_SNAPSHOT_STALE_AFTER_MS,
    });
  }

  let schedule = [] as Awaited<ReturnType<typeof readPublicCompetitionFixtures>>;
  try {
    schedule = await readPublicCompetitionFixtures();
  } catch {
    schedule = [];
  }
  const weeklySchedule = selectArenaFixtureRound(schedule);
  if (weeklySchedule.length) {
    return response(weeklySchedule, {
      state: "partial-persisted-schedule",
      // Schedule rows do not yet carry a coherent shared run/version. Do not
      // fabricate a request-time freshness timestamp.
      degraded: true,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "No coherent persisted live data is available.",
      status: "persisted-live-data-unavailable",
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
