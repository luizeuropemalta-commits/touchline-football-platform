import { NextResponse } from "next/server";

import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { readPersistedLiveScoreSnapshot } from "@/lib/football-data/live-score-persistence";
import { selectArenaFixtureRound } from "@/lib/touchlineArena/arena-fixture-round";
import { toTouchlineLiveFixtures } from "@/lib/touchlineArena/stadium-catalog";

const LIVE_SNAPSHOT_STALE_AFTER_MS = 5 * 60 * 1_000;

function response(
  fixtures: Parameters<typeof toTouchlineLiveFixtures>[0],
  metadata: {
    state: "persisted-live-snapshot" | "partial-persisted-schedule";
    fetchedAt?: string;
    degraded: boolean;
  },
) {
  return NextResponse.json({
    ok: true,
    data: toTouchlineLiveFixtures(fixtures),
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

  const snapshotIsFresh = Boolean(
    liveSnapshot?.fixtures.length
    && Date.now() - liveSnapshot.storedAt <= LIVE_SNAPSHOT_STALE_AFTER_MS,
  );

  // A fresh last-known-good live snapshot is the only source that may replace
  // the weekly schedule. A persisted schedule remains usable when the live
  // writer is stale, but the response must state that degradation honestly.
  if (liveSnapshot?.fixtures.length && snapshotIsFresh) {
    return response(liveSnapshot.fixtures, {
      state: "persisted-live-snapshot",
      fetchedAt: liveSnapshot.fetchedAt,
      degraded: false,
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

  // Retain a stale snapshot only when there is no usable schedule at all. The
  // Match Centre can then state the degradation honestly instead of silently
  // treating laboratory or last-known-good data as fresh live scoring.
  if (liveSnapshot?.fixtures.length) {
    return response(liveSnapshot.fixtures, {
      state: "persisted-live-snapshot",
      fetchedAt: liveSnapshot.fetchedAt,
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
