import assert from "node:assert/strict";
import test from "node:test";

import { readTouchlineMatchPreviewReplayApprovalDraft } from "../lib/touchlineArena/social-match-preview-live-replay-draft.ts";

test("Brentford v Chelsea approval replay binds verified leaders to their published card attributes", async () => {
  const replay = await readTouchlineMatchPreviewReplayApprovalDraft();
  assert.equal(replay.provenance.fixtureId, "19722162");
  assert.equal(replay.provenance.dispatch, "BLOCKED_REMOTE_RANKING_SNAPSHOT_STALE");
  assert.equal(replay.draft.home.leader.card.name, "Vitaly Janelt");
  assert.equal(replay.draft.home.leader.card.shirtNumber, 27);
  assert.equal(replay.draft.home.leader.card.marketValue, "€16m");
  assert.match(String(replay.draft.home.leader.card.cardTemplateUrl), /Brentford%20FC\/market-tiers\/amethyst-purple/);
  assert.equal(replay.draft.away.leader.card.name, "João Pedro");
  assert.equal(replay.draft.away.leader.card.shirtNumber, 9);
  assert.equal(replay.draft.away.leader.card.marketValue, "€80m");
  assert.match(String(replay.draft.away.leader.card.cardTemplateUrl), /Chelsea%20FC\/market-tiers\/diamond-gold/);
  assert.match(replay.draft.caption, /Monte seu XI na TouchLine/);
});
