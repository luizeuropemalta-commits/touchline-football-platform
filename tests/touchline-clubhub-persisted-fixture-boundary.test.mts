import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url),
  "utf8",
);

test("ClubHub fixtures use only persisted readers and canonical local crest fallbacks", () => {
  assert.match(pageSource, /readPublicFantasyFixtureSnapshots\(\)/);
  assert.match(pageSource, /readPublicCompetitionFixtures\(\)/);
  assert.match(pageSource, /const empty = \{/);
  assert.doesNotMatch(
    pageSource,
    /readLiveScoreSnapshot|provider: "sportmonks"|competitionProviderId: "8"|matchedClub\.logoUrl \?\? team\?\.logoUrl/,
  );
});
