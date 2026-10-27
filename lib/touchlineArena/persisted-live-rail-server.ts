import "server-only";

import { readCurrentPublicCompetitionSeasonTarget, readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import type { TouchlineLiveAdmissionScope } from "./sports-publication-live-view";
import { readPersistedLiveScoreSnapshot } from "@/lib/football-data/live-score-persistence";
import { selectCarouselFixtureRound } from "./carousel-fixture-round";
import { toTouchlineLiveFixtures } from "./stadium-catalog";
import type { TouchlineLiveReadMetadata } from "./match-centre";
import { resolveServerReadWithin } from "./server-read-deadline";
import { touchlineLiveFreshness } from "./live-presentation-state";

export type PersistedLiveRail = {
  fixtures: ReturnType<typeof toTouchlineLiveFixtures>;
  metadata: TouchlineLiveReadMetadata;
  admissionScope: TouchlineLiveAdmissionScope | null;
};

/**
 * Same read-only selection for ClubOwner SSR and ClubHub's initial read.
 * Durable data only: no provider refresh, write or independent poller.
 * null means unavailable, not a confirmed empty round.
 */
export async function readPersistedLiveRail({ isActive = () => true, now }: { isActive?: () => boolean; now?: number } = {}): Promise<PersistedLiveRail | null> {
  if (!isActive() || (now !== undefined && !Number.isFinite(now))) return null;
  const seasonTarget = await readCurrentPublicCompetitionSeasonTarget({ isActive });
  if (!isActive() || !seasonTarget) return null;
  const { admissionScope } = seasonTarget;
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
  let schedule = [] as Awaited<ReturnType<typeof readPublicCompetitionFixtures>>;
  let scheduleConfirmed = false;
  try {
    schedule = await readPublicCompetitionFixtures({ seasonId: seasonTarget.storageSeasonId, includeHistorical: true, readAllPages: true, strictRead: true, isActive });
    scheduleConfirmed = true;
  } catch {
    schedule = [];
  }
  if (!isActive()) return null;
  const selectionNow = now ?? Date.now();
  const completedFreshness = touchlineLiveFreshness(liveSnapshot, selectionNow);
  const snapshotIsFresh = completedFreshness !== null && !completedFreshness.degraded;
  // Current canonical rows win over an older snapshot. Historical reads never
  // contact the provider and do not enlarge the writer's cadence window.
  // The rail retains the scoped season catalogue so a mounted client can
  // advance to the next complete round without another provider request.
  // Scope uses provider IDs; the storage reader's seasonId uses internal UUIDs.
  const belongs = (fixture: { competitionId?: string; seasonId?: string }) =>
    fixture.competitionId === admissionScope.competitionId && fixture.seasonId === admissionScope.seasonId;
  const canonical = [...new Map([...(liveSnapshot?.fixtures ?? []), ...schedule]
    .filter(belongs).map(fixture => [fixture.providerId, fixture])).values()];
  const fixtures = toTouchlineLiveFixtures(canonical);
  const selected = selectCarouselFixtureRound(fixtures, selectionNow, admissionScope);
  if (fixtures.length) {
    const freshById = new Map((liveSnapshot?.fixtures ?? []).filter(belongs).map(fixture => [fixture.providerId, fixture]));
    const allSelectedCovered = selected.length > 0 && selected.every(fixture => {
      const published = freshById.get(fixture.providerId);
      return published && published.homeTeam?.providerId === fixture.homeTeam?.providerId
        && published.awayTeam?.providerId === fixture.awayTeam?.providerId
        && published.status === fixture.status
        && published.homeScore === fixture.homeScore && published.awayScore === fixture.awayScore
        && published.liveMinute === fixture.liveMinute;
    });
    return {
      fixtures,
      admissionScope,
      metadata: liveSnapshot && (!schedule.length || (snapshotIsFresh && allSelectedCovered))
        ? { state: "persisted-live-snapshot", fetchedAt: liveSnapshot.fetchedAt, degraded: !snapshotIsFresh || !allSelectedCovered }
        : { state: "partial-persisted-schedule", degraded: true },
    };
  }
  return scheduleConfirmed
    ? { fixtures: [], admissionScope, metadata: { state: "partial-persisted-schedule", degraded: true } }
    : null;
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
