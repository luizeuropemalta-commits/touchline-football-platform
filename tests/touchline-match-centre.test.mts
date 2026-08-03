import assert from "node:assert/strict";
import test from "node:test";

import { selectTouchlineMatchCentreFixture, touchlineFixtureState, touchlineMatchCentreHref } from "../lib/touchlineArena/match-centre.ts";
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
