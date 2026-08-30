import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_LIVE_PRESENTATION_POLL_MS,
  TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS,
  mergeTouchlineLivePresentationRevision,
  parseTouchlineLivePresentationState,
  resolveTouchlineLivePresentationTiming,
  touchlineLivePresentationRevisionChanged,
} from "../lib/touchlineArena/live-presentation-state.ts";

const componentSource = readFileSync(
  new URL("../components/touchline/TouchlineLivePresentationRefresh.tsx", import.meta.url),
  "utf8",
);
const endpointSource = readFileSync(
  new URL("../app/api/touchline-arena/live-presentation-state/route.ts", import.meta.url),
  "utf8",
);
const surfaces = [
  "../app/touchline-player-card-rankings/page.tsx",
  "../app/touchline-players/[player]/page.tsx",
  "../app/touchline-coaches/[coach]/page.tsx",
  "../app/touchline-tables/page.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

const now = Date.parse("2026-08-30T14:00:00.000Z");
const fixture = (
  fixtureId: string,
  state: "live" | "upcoming" | "finished" | "unknown",
  startsAt = "2026-08-30T14:00:00.000Z",
) => ({ fixtureId, state, startsAt, scoreable: state === "finished" });

test("one central cadence polls live and settling rankings but stops after final coverage", () => {
  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("live-1", "live")],
    playerRankingFixtureIds: [],
    coachRankingFixtureIds: [],
    now,
  }), { mode: "live", pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null });

  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("final-1", "finished")],
    playerRankingFixtureIds: ["final-1"],
    coachRankingFixtureIds: [],
    now,
  }), { mode: "settling", pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null });

  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("final-1", "finished")],
    playerRankingFixtureIds: ["final-1"],
    coachRankingFixtureIds: ["final-1"],
    now,
  }), { mode: "idle", pollAfterMs: null, resumeAt: null });

  assert.deepEqual(resolveTouchlineLivePresentationTiming({
    fixtures: [{ ...fixture("cancelled-1", "finished"), scoreable: false }],
    playerRankingFixtureIds: [],
    coachRankingFixtureIds: [],
    now,
  }), { mode: "idle", pollAfterMs: null, resumeAt: null });
});

test("prematch polling starts only inside the official one-hour window", () => {
  const near = resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("next-1", "upcoming", "2026-08-30T14:59:00.000Z")],
    playerRankingFixtureIds: [],
    coachRankingFixtureIds: [],
    now,
  });
  assert.deepEqual(near, { mode: "prematch", pollAfterMs: TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS, resumeAt: null });

  const distant = resolveTouchlineLivePresentationTiming({
    fixtures: [fixture("next-2", "upcoming", "2026-08-30T17:00:00.000Z")],
    playerRankingFixtureIds: [],
    coachRankingFixtureIds: [],
    now,
  });
  assert.deepEqual(distant, {
    mode: "idle",
    pollAfterMs: null,
    resumeAt: "2026-08-30T16:00:00.000Z",
  });
});

test("the public state parser fails closed and revisions change atomically", () => {
  const state = parseTouchlineLivePresentationState({
    version: 1,
    available: true,
    playerRankingSnapshotId: "player-snapshot-2",
    coachRankingSnapshotId: "coach-snapshot-2",
    mode: "live",
    pollAfterMs: 15_000,
    resumeAt: null,
  });
  assert.ok(state);
  assert.equal(touchlineLivePresentationRevisionChanged({
    playerRankingSnapshotId: "player-snapshot-1",
    coachRankingSnapshotId: "coach-snapshot-2",
  }, state), true);
  assert.equal(parseTouchlineLivePresentationState({ ...state, pollAfterMs: 1_000 }), null);
  assert.equal(parseTouchlineLivePresentationState({ ...state, available: false }), null);

  assert.deepEqual(mergeTouchlineLivePresentationRevision({
    playerRankingSnapshotId: "verified-player",
    coachRankingSnapshotId: "verified-coach",
  }, {
    playerRankingSnapshotId: null,
    coachRankingSnapshotId: "next-coach",
  }, { player: true, coach: false }), {
    playerRankingSnapshotId: "verified-player",
    coachRankingSnapshotId: "verified-coach",
  });
});

test("the refresh boundary deduplicates at the page level and preserves browser state", () => {
  assert.match(componentSource, /fetch\(STATE_URL/);
  assert.match(componentSource, /requestController/);
  assert.match(componentSource, /requestController !== controller/);
  assert.match(componentSource, /if \(requestController === controller\) requestController = null/);
  assert.match(componentSource, /visibilitychange/);
  assert.match(componentSource, /window\.addEventListener\("online"/);
  assert.match(componentSource, /window\.addEventListener\("offline"/);
  assert.match(componentSource, /router\.refresh\(\)/);
  assert.doesNotMatch(componentSource, /location\.(?:reload|replace)|window\.location/);
  assert.doesNotMatch(componentSource, /setInterval/);
  assert.match(endpointSource, /Cache-Control": "no-store"/);
  for (const source of surfaces) {
    assert.match(source, /<TouchlineLivePresentationRefresh/);
  }
});
