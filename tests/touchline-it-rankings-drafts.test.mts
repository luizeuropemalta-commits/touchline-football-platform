import assert from "node:assert/strict";
import test from "node:test";
import {
  TOUCHLINE_RANKINGS_DRAFT_STATE,
  touchlineRankingsDrafts,
} from "../lib/touchlineArena/locale-catalogues/rankings-drafts.ts";

test("Italian rankings draft preserves ClubOwner and ClubHub exactly", () => {
  const italian = touchlineRankingsDrafts["it-IT"];

  assert.equal(TOUCHLINE_RANKINGS_DRAFT_STATE, "draft");
  assert.equal(italian.clubOwners, "ClubOwner");
  assert.equal(italian.clubHub, "ClubHub");
  assert.match(italian.connectedDescription, /ClubOwner/);

  assert.equal(touchlineRankingsDrafts["es-ES"].clubOwners, "ClubOwners");
  assert.equal(touchlineRankingsDrafts["es-ES"].clubHub, "ClubHub");
});
