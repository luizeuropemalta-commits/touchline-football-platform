import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { toPublicFantasyFixtureFeed } from "../lib/football-data/public-fantasy-fixture.ts";
import type { TouchlineFantasyFixtureFeed } from "../lib/football-data/types.ts";

test("legacy stored event bonuses cannot cross the public football-fact boundary", () => {
  const feed = {
    fixture: { providerId: "123", source: {} }, fetchedAt: "2026-10-01T10:00:00Z",
    lineups: [], formations: [], sidelined: [],
    events: [{ id: "goal", providerId: "101", type: "Goal", fantasyPoints: 6 }, { id: "own-goal", providerId: "102", type: "Own Goal", fantasyPoints: -2 }],
  } as unknown as TouchlineFantasyFixtureFeed;
  const result = toPublicFantasyFixtureFeed(feed);
  assert.equal(result?.events.length, 2);
  assert.equal(result?.events[0]?.type, "Goal");
  assert.equal(result?.events[1]?.type, "Own Goal");
  assert.ok(result?.events.every(event => !Object.hasOwn(event, "fantasyPoints")));
});

test("provider normalization no longer manufactures goal or card point bonuses", () => {
  const provider = readFileSync(new URL("../lib/football-data/providers/sportmonks.ts", import.meta.url), "utf8");
  assert.doesNotMatch(provider, /estimateFantasyEventPoints|fantasyPoints:/);
});
