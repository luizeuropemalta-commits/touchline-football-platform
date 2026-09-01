import "server-only";
import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { isTouchLineSettledFixtureStatus } from "@/lib/football-data/fixture-settlement";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";
import { createTouchlineSharedCoalescer } from "@/lib/touchlineArena/live-presentation-coalescer";
import { readTouchlineLivePresentationInput } from "@/lib/touchlineArena/live-presentation-read-model";
import {
  TOUCHLINE_LIVE_PRESENTATION_STATE_VERSION,
  resolveTouchlineLivePresentationTiming,
  type TouchlineLivePresentationState,
} from "@/lib/touchlineArena/live-presentation-state";

const UNAVAILABLE_STATE: TouchlineLivePresentationState = Object.freeze({
  version: TOUCHLINE_LIVE_PRESENTATION_STATE_VERSION,
  available: false,
  playerRankingSnapshotId: null,
  coachRankingSnapshotId: null,
  mode: "idle",
  pollAfterMs: null,
  resumeAt: null,
});

export const TOUCHLINE_LIVE_PRESENTATION_SHARED_CACHE_SECONDS = 5;
const SHARED_CACHE_KEY = "touchline-live-presentation-state-v2";

async function readUncachedTouchlineLivePresentationState(): Promise<TouchlineLivePresentationState> {
  const admin = createAdminClient();
  if (!admin) return UNAVAILABLE_STATE;
  const now = Date.now();
  const input = await readTouchlineLivePresentationInput(admin, now);
  if (!input.fixtures.length) return UNAVAILABLE_STATE;

  const timing = resolveTouchlineLivePresentationTiming({
    fixtures: input.fixtures.map((fixture) => ({
      fixtureId: fixture.fixtureId,
      startsAt: fixture.startsAt,
      state: touchlineFixtureState({
        startsAt: fixture.startsAt ?? undefined,
        status: fixture.status ?? undefined,
      }, now),
      scoreable: isTouchLineSettledFixtureStatus(fixture.status),
    })),
    playerRankingFixtureIds: input.playerRankingFixtureIds,
    coachRankingFixtureIds: input.coachRankingFixtureIds,
    now,
  });
  return {
    version: TOUCHLINE_LIVE_PRESENTATION_STATE_VERSION,
    available: true,
    playerRankingSnapshotId: input.playerRankingSnapshotId,
    coachRankingSnapshotId: input.coachRankingSnapshotId,
    ...timing,
  };
}

const readSharedDataCache = unstable_cache(
  readUncachedTouchlineLivePresentationState,
  [SHARED_CACHE_KEY],
  { revalidate: TOUCHLINE_LIVE_PRESENTATION_SHARED_CACHE_SECONDS },
);
const sharedInFlight = createTouchlineSharedCoalescer<TouchlineLivePresentationState>({
  // `unstable_cache` owns the five-second shared value. This layer retains no
  // value and only merges concurrent misses, avoiding stacked cache windows.
  ttlMs: 0,
});

/**
 * One server read owns the public refresh cadence. Cards never poll
 * independently, and the browser receives only immutable snapshot identities
 * plus scheduling metadata derived from persisted fixtures.
 */
export async function loadTouchlineLivePresentationState(): Promise<TouchlineLivePresentationState> {
  try {
    // Constant-key Data Cache shares the five-second value across invocations;
    // the process coalescer merges concurrent misses without caching it again.
    return await sharedInFlight.load(readSharedDataCache);
  } catch {
    // The route fails closed without leaking database diagnostics, and a
    // rejected read is never retained by the process coalescer.
    return UNAVAILABLE_STATE;
  }
}
