import "server-only";

import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { isTouchLineSettledFixtureStatus } from "@/lib/football-data/fixture-settlement";
import { touchlineFixtureState } from "@/lib/touchlineArena/match-centre";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
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

/**
 * One server read owns the public refresh cadence. Cards never poll
 * independently, and the browser receives only immutable snapshot identities
 * plus scheduling metadata derived from persisted fixtures.
 */
export async function loadTouchlineLivePresentationState(
  now = Date.now(),
): Promise<TouchlineLivePresentationState> {
  const [playerRanking, coachRanking, fixtures] = await Promise.all([
    loadTouchLineActiveRanking(),
    loadTouchLineCoachRanking(),
    readPublicCompetitionFixtures({ limit: 240, now }),
  ]);
  if (!fixtures.length) return UNAVAILABLE_STATE;

  const timing = resolveTouchlineLivePresentationTiming({
    fixtures: fixtures.map((fixture) => ({
      fixtureId: fixture.providerId,
      startsAt: fixture.startsAt ?? null,
      state: touchlineFixtureState(fixture, now),
      scoreable: isTouchLineSettledFixtureStatus(fixture.status),
    })),
    playerRankingFixtureIds: playerRanking.fixtureIds,
    coachRankingFixtureIds: coachRanking.fixtureIds,
    now,
  });

  return {
    version: TOUCHLINE_LIVE_PRESENTATION_STATE_VERSION,
    available: true,
    playerRankingSnapshotId: playerRanking.snapshotId,
    coachRankingSnapshotId: coachRanking.snapshotId,
    ...timing,
  };
}
