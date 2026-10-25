import "server-only";

import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { readPersistedLiveScoreSnapshot } from "@/lib/football-data/live-score-persistence";
import { selectArenaFixtureRound } from "./arena-fixture-round";
import { toTouchlineLiveFixtures } from "./stadium-catalog";
import type { TouchlineLiveReadMetadata } from "./match-centre";
import { resolveServerReadWithin } from "./server-read-deadline";
import { touchlineLiveFreshness } from "./live-presentation-state";

export type PersistedLiveRail = {
  fixtures: ReturnType<typeof toTouchlineLiveFixtures>;
  metadata: TouchlineLiveReadMetadata;
};

/**
 * Same read-only selection for ClubOwner SSR and ClubHub's initial read.
 * Durable data only: no provider refresh, write or independent poller.
 * null means unavailable, not a confirmed empty round.
 */
export async function readPersistedLiveRail({ isActive = () => true, now }: { isActive?: () => boolean; now?: number } = {}): Promise<PersistedLiveRail | null> {
  if (!isActive() || (now !== undefined && !Number.isFinite(now))) return null;
  let liveSnapshot;
  try {
    // Production persistence samples its own clock after storage completes.
    // Only an explicitly injected test clock is fixed across asynchronous reads.
    liveSnapshot = await readPersistedLiveScoreSnapshot({ maxAgeMs: Number.MAX_SAFE_INTEGER, ...(now === undefined ? {} : { now }) });
  } catch {
    liveSnapshot = null;
  }
  // SSR can abandon this read while storage is pending. Do not begin the
  // next database read after its deadline; in-flight SDK I/O is not cancelled.
  if (!isActive()) return null;
  const snapshotReadNow = now ?? Date.now();
  const freshness = touchlineLiveFreshness(liveSnapshot, snapshotReadNow);
  // Invalid/future evidence must never be reused as a stale fallback either.
  if (!freshness || (liveSnapshot && (liveSnapshot.storedAt > snapshotReadNow || Date.parse(liveSnapshot.fetchedAt) > snapshotReadNow))) liveSnapshot = null;
  const snapshotIsFresh = freshness !== null && !freshness.degraded;
  if (liveSnapshot?.fixtures.length && snapshotIsFresh) {
    return {
      fixtures: toTouchlineLiveFixtures(liveSnapshot.fixtures),
      metadata: { state: "persisted-live-snapshot", fetchedAt: liveSnapshot.fetchedAt, degraded: false },
    };
  }

  let schedule = [] as Awaited<ReturnType<typeof readPublicCompetitionFixtures>>;
  try {
    schedule = await readPublicCompetitionFixtures();
  } catch {
    schedule = [];
  }
  const weeklySchedule = selectArenaFixtureRound(schedule, now ?? Date.now());
  if (!isActive()) return null;
  if (weeklySchedule.length) {
    return {
      fixtures: toTouchlineLiveFixtures(weeklySchedule),
      // No coherent run/version exists for schedule rows. Never fabricate
      // request-time freshness or promote these facts to a fresh live feed.
      metadata: { state: "partial-persisted-schedule", degraded: true },
    };
  }
  if (liveSnapshot?.fixtures.length) {
    return {
      fixtures: toTouchlineLiveFixtures(liveSnapshot.fixtures),
      metadata: { state: "persisted-live-snapshot", fetchedAt: liveSnapshot.fetchedAt, degraded: true },
    };
  }
  return null;
}

/** Per-request SSR budget. GET retains its existing unbounded reader policy. */
export async function readPersistedLiveRailWithin(deadlineMs = 8_000): Promise<PersistedLiveRail | null> {
  let active = true;
  try {
    return await resolveServerReadWithin(readPersistedLiveRail({ isActive: () => active }), null, deadlineMs);
  } finally {
    active = false;
  }
}
