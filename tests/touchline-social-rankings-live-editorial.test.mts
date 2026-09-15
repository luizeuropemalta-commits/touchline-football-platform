import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveRankingsLive, RANKINGS_LIVE_ART_IDS } from "../lib/social-rankings-live-contract.ts";
import { applyRankingsGoldenBootEvidence } from "../lib/social-rankings-live-golden-boot.ts";
import { rankingsLiveCaptions, rankingsLiveDispatchProposal } from "../lib/social-rankings-live-editorial.ts";
const read = (name: string) => JSON.parse(readFileSync(new URL(`../artifacts/social-studio/rankings/${name}`, import.meta.url), "utf8"));
const source = read("snapshot-20260914.json"), facts = read("settlement-evidence-20260914.json");
facts.ratingFeeds = read("rating-lineup-evidence-20260914.json").feeds;
const data = applyRankingsGoldenBootEvidence(deriveRankingsLive(source, facts, facts.publishedPlayerIds, "editorial-test"), source, read("golden-boot-reconciliation-20260914.json"));
test("every art has separate bounded IG/FB captions with date and XI call to action", () => {
  for (const id of RANKINGS_LIVE_ART_IDS) for (const placement of ["FEED", "STORY"] as const) {
    const copy = rankingsLiveCaptions(data, id, placement);
    for (const caption of Object.values(copy)) {
      assert.ok(caption.length < 2200);
      assert.match(caption, /Monte seu XI na TouchLine/);
      assert.match(caption, /14\/09\/2026/);
      assert.doesNotMatch(caption, /https?:|lucro|garantid/i);
    }
  }
  assert.match(rankingsLiveCaptions(data, "GAMEWEEK_TOP_CARD", "FEED").INSTAGRAM, /9,51/);
  assert.doesNotMatch(rankingsLiveCaptions(data, "GAMEWEEK_TOP_CARD", "FEED").INSTAGRAM, /31,13|👑/);
  assert.match(rankingsLiveCaptions(data, "GAMEWEEK_XI_COACH", "FEED").INSTAGRAM, /6 pontos TouchLine nesta rodada/);
  assert.match(rankingsLiveCaptions(data, "GAMEWEEK_XI_COACH", "FEED").INSTAGRAM, /entre 5 treinadores/);
});
test("T24 suggestion uses the earliest actual next-round fixture and never enables delivery", () => {
  const plan = rankingsLiveDispatchProposal(data, "LEAGUE_TABLE_PREVIEW");
  assert.equal(plan.suggestedAt, "2026-09-17T19:00:00.000Z");
  assert.equal(plan.enabled, false);
  assert.equal(plan.outbound, "DISABLED");
  assert.equal(plan.editorialSchedule, null);
  assert.equal(plan.destinations.length, 4);
  assert.ok(plan.destinations.every((d) => !d.selected && !d.artworkApproved && !d.captionApproved));
  assert.equal(plan.internal.state, "PENDING_OWNER_COLLECTIVE_DESTINATION");
});
test("subject club is a proposal while a multi-club weekly XI needs owner choice", () => {
  assert.deepEqual(rankingsLiveDispatchProposal(data, "GOLDEN_BOOT").internal.providerTeamIds, ["9"]);
  assert.deepEqual(rankingsLiveDispatchProposal(data, "GAMEWEEK_TOP_CARD").internal.providerTeamIds, ["78"]);
  assert.equal(rankingsLiveDispatchProposal(data, "GAMEWEEK_XI_COACH").internal.state, "PENDING_OWNER_COLLECTIVE_DESTINATION");
});
test("missing rating cannot silently become zero in editorial copy", () => {
  const missing = structuredClone(data);
  missing.weeklyOverall.totalRating = null;
  assert.throws(() => rankingsLiveCaptions(missing, "GAMEWEEK_TOP_CARD", "FEED"), /RATING_UNAVAILABLE/);
});
test("overall caption cannot assert leadership when the crown decision disagrees", () => {
  const changed = structuredClone(data);
  changed.leadership = { status: "unavailable", scope: data.leadership.scope, reason: "snapshot-diverged" };
  assert.throws(() => rankingsLiveCaptions(changed, "OVERALL_LEADER", "FEED"), /LEADERSHIP_MISMATCH/);
});
test("private replay captions never disguise the sample as the currently published leader", () => {
  for (const art of RANKINGS_LIVE_ART_IDS) {
    const captions = rankingsLiveCaptions(data, art, "FEED");
    assert.ok(Object.values(captions).every(caption => caption.startsWith("AMOSTRA RETROSPECTIVA · NÃO PUBLICADA")));
  }
  assert.match(rankingsLiveCaptions(data, "OVERALL_LEADER", "FEED").INSTAGRAM, /lidera este replay retrospectivo/);
});
