import assert from "node:assert/strict";
import test from "node:test";

import { buildTouchlineMatchPreviewLiveApprovalCaption, matchPreviewLivePlatformCaptions } from "../lib/touchlineArena/social-match-preview-live-caption.ts";

test("Match Preview approval caption uses only supplied fixture and leader facts with a TouchLine call to action", () => {
  const caption = buildTouchlineMatchPreviewLiveApprovalCaption({
    homeClub: "Brentford",
    awayClub: "Chelsea",
    startsAt: "2026-09-18T19:00:00.000Z",
    timeZone: "Europe/Malta",
    homeLeader: { name: "Verified Brentford leader", totalRating: 19.25 },
    awayLeader: { name: "Verified Chelsea leader", totalRating: 22.75 },
  });
  assert.match(caption, /Brentford x Chelsea/);
  assert.match(caption, /Verified Brentford leader · 19\.25 Total Rating/);
  assert.match(caption, /Verified Chelsea leader · 22\.75 Total Rating/);
  assert.match(caption, /Monte seu XI na TouchLine/);
  assert.match(caption, /acumulado na temporada/);
  const platforms = matchPreviewLivePlatformCaptions(caption);
  assert.match(platforms.INSTAGRAM, /#PremierLeague/);
  assert.doesNotMatch(platforms.FACEBOOK, /#PremierLeague/);
  assert.doesNotMatch(caption, /https?:\/\//);
  assert.doesNotMatch(caption, /publicad[oa]|postad[oa]/i);
});

test("Match Preview approval caption fails closed on absent or invalid facts", () => {
  assert.throws(() => buildTouchlineMatchPreviewLiveApprovalCaption({
    homeClub: "Brentford", awayClub: "Brentford", startsAt: "2026-09-18T19:00:00.000Z", timeZone: "Europe/Malta",
    homeLeader: { name: "A", totalRating: 1 }, awayLeader: { name: "B", totalRating: 2 },
  }), /CLUBS_MUST_BE_DISTINCT/);
  assert.throws(() => buildTouchlineMatchPreviewLiveApprovalCaption({
    homeClub: "Brentford", awayClub: "Chelsea", startsAt: "invalid", timeZone: "Europe/Malta",
    homeLeader: { name: "A", totalRating: 1 }, awayLeader: { name: "B", totalRating: 2 },
  }), /START_INVALID/);
});
