import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url),
  "utf8",
);
const previewSource = readFileSync(
  new URL("../lib/touchlineArena/club-match-preview.ts", import.meta.url),
  "utf8",
);

test("ClubHub fixtures use only persisted readers and canonical local crest fallbacks", () => {
  assert.match(pageSource, /readPublicFantasyFixtureSnapshots\(\)/);
  assert.match(pageSource, /readPublicCompetitionFixtures\(\)/);
  assert.match(pageSource, /resolveTouchlineClubMatchPreviewTeam/);
  assert.match(pageSource, /const empty = \{/);
  assert.doesNotMatch(
    pageSource,
    /readLiveScoreSnapshot|provider: "sportmonks"|competitionProviderId: "8"|matchedClub\.logoUrl \?\? team\?\.logoUrl/,
  );
  assert.match(previewSource, /TOUCHLINE_ENGLAND_CLUBS\.find\(\(club\) => club\.teamId === team\.providerId\)/);
  assert.match(previewSource, /logoUrl: undefined/);
  assert.doesNotMatch(previewSource, /\?\? fallback|team\?\.logoUrl/);
});
