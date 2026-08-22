import assert from "node:assert/strict";
import test from "node:test";

import { toPublicTouchlineFixture } from "../lib/football-data/public-fixture.ts";

test("public fixture DTO keeps TouchLine identifiers and removes provider metadata", () => {
  const fixture = toPublicTouchlineFixture({
    id: "sportmonks:19722203",
    providerId: "19722203",
    provider: "sportmonks",
    name: "Arsenal FC vs Coventry City",
    startsAt: "2026-08-21T19:00:00.000Z",
    competitionId: "8",
    seasonId: "28083",
    roundId: "339001",
    roundName: "1",
    homeTeam: {
      id: "sportmonks:19", providerId: "19", provider: "sportmonks", name: "Arsenal FC",
      source: { provider: "sportmonks", providerId: "19" },
    },
    awayTeam: {
      id: "sportmonks:117", providerId: "117", provider: "sportmonks", name: "Coventry City",
      source: { provider: "sportmonks", providerId: "117" },
    },
    source: { provider: "sportmonks", providerId: "19722203", lastSyncedAt: "2026-08-05T08:00:00.000Z" },
  });

  assert.equal(fixture.id, "19722203");
  assert.equal(fixture.homeTeam?.id, "19");
  assert.equal(fixture.verifiedAt, "2026-08-05T08:00:00.000Z");
  assert.equal(fixture.roundId, "339001");
  assert.equal(fixture.roundName, "1");
  assert.doesNotMatch(JSON.stringify(fixture), /sportmonks|"provider"|"source"/i);
});
