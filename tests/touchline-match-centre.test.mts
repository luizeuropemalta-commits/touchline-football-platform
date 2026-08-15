import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isTouchlineLiveReadMetadata,
  selectTouchlineMatchCentreFixture,
  touchlineFixtureState,
  touchlineMatchCentreDisplayState,
  touchlineMatchCentreHref,
} from "../lib/touchlineArena/match-centre.ts";
import type { TouchlineFixture } from "../lib/football-data/types.ts";

function fixture(id: string, startsAt: string, status: string): TouchlineFixture {
  return {
    id: `sportmonks:${id}`,
    providerId: id,
    provider: "sportmonks",
    startsAt,
    status,
    homeTeam: { id: "sportmonks:1", providerId: "1", provider: "sportmonks", name: "Arsenal", source: { provider: "sportmonks", providerId: "1" } },
    awayTeam: { id: "sportmonks:2", providerId: "2", provider: "sportmonks", name: "Chelsea", source: { provider: "sportmonks", providerId: "2" } },
    source: { provider: "sportmonks", providerId: id },
  };
}

test("Match Centre always prioritizes live, then upcoming, then finished", () => {
  const finished = fixture("10", "2026-08-01T14:00:00Z", "Finished");
  const upcoming = fixture("20", "2026-08-21T14:00:00Z", "Not Started");
  const live = fixture("30", "2026-08-20T14:00:00Z", "2nd Half");
  assert.equal(selectTouchlineMatchCentreFixture([finished, upcoming, live])?.id, live.id);
  assert.equal(selectTouchlineMatchCentreFixture([finished, upcoming])?.id, upcoming.id);
  assert.equal(selectTouchlineMatchCentreFixture([finished])?.id, finished.id);
  assert.equal(touchlineFixtureState(live), "live");
});

test("Match Centre preserves an explicit fixture deep link", () => {
  const first = fixture("10", "2026-08-21T14:00:00Z", "Not Started");
  const target = fixture("20", "2026-08-22T14:00:00Z", "Not Started");
  assert.equal(selectTouchlineMatchCentreFixture([first, target], target.id)?.id, target.id);
  assert.equal(touchlineMatchCentreHref(target, "pt-BR"), "/live?fixture=sportmonks%3A20&lang=pt-BR");
});

test("Match Centre never presents a degraded live snapshot as currently live", () => {
  const live = fixture("30", "2026-08-20T14:00:00Z", "2nd Half");
  const upcoming = fixture("20", "2026-08-21T14:00:00Z", "Not Started");
  const staleSnapshot = {
    state: "persisted-live-snapshot",
    degraded: true,
    fetchedAt: "2026-08-20T13:40:00.000Z",
  } as const;

  assert.equal(isTouchlineLiveReadMetadata(staleSnapshot), true);
  assert.equal(touchlineMatchCentreDisplayState(live, staleSnapshot), "stale");
  assert.equal(touchlineMatchCentreDisplayState(upcoming, staleSnapshot), "upcoming");
  assert.equal(touchlineMatchCentreDisplayState(live, { ...staleSnapshot, degraded: false }), "live");
  assert.equal(isTouchlineLiveReadMetadata({ state: "persisted-live-snapshot", degraded: "true" }), false);
  assert.equal(isTouchlineLiveReadMetadata({ state: "unknown", degraded: true }), false);
});

test("Match Centre never invents a zero score when only one side is present", () => {
  const source = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  const scoreFunction = source.match(/function score\(fixture: TouchlinePublicFixture\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(scoreFunction, /Number\.isFinite\(fixture\.homeScore\) && Number\.isFinite\(fixture\.awayScore\)/);
  assert.match(scoreFunction, /return "VS"/);
  assert.doesNotMatch(scoreFunction, /\?\? 0/);
});

test("a venue awaiting verification is not labelled as verified", () => {
  const source = readFileSync(
    new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<strong>\{dictionary\.venuePending\}<\/strong><small>\{dictionary\.official\}<\/small>/);
  assert.doesNotMatch(source, /<strong>\{dictionary\.venuePending\}<\/strong><small>\{dictionary\.provider\}<\/small>/);
});
