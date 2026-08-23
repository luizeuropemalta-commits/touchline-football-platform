import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");

test("Club Hub uses the upcoming persisted fixture for its official pre-match sheet", () => {
  assert.match(page, /const matchdayFeed = persistedFeeds\.find\(\(feed\) => feed\.fixture\.providerId === fixture\?\.providerId\)/);
  assert.match(page, /fixtureId: matchdayFeed\?\.fixture\.providerId \?\? null/);
  assert.match(page, /lineups: matchdayFeed\?\.lineups \?\? \[\]/);
  assert.match(page, /formation = matchdayFeed\?\.formations/);
});

test("Club Hub keeps scoring bound to a live or finished fixture independently of the next match", () => {
  assert.match(page, /const scoringFeed = persistedFeeds\.find\(\(feed\) => feed\.fixture\.providerId === scoringFixture\?\.providerId\)/);
  assert.match(page, /const publicFeed = scoringFeed \? toPublicFantasyFixtureFeed\(scoringFeed\) : null/);
});
