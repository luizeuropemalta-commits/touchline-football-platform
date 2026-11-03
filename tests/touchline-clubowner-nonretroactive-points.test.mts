import assert from "node:assert/strict";
import test from "node:test";
import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { readProductionRankings, type RankingTables } from "./helpers/fantasy-ranking-projection.mts";

const tables = (): RankingTables => ({
  touchline_fantasy_user_gameweeks: [
    { id: "veteran-old", user_id: "veteran", gameweek_id: "old", season_id: "season", market_plan_key_snapshot: "standard" },
    { id: "veteran-now", user_id: "veteran", gameweek_id: "now", season_id: "season", market_plan_key_snapshot: "standard" },
    { id: "new-now", user_id: "new", gameweek_id: "now", season_id: "season", market_plan_key_snapshot: "standard" },
    { id: "new-other-season", user_id: "new", gameweek_id: "old-other-season", season_id: "other-season", market_plan_key_snapshot: "standard" },
  ],
  touchline_fantasy_user_gameweek_scores: [
    { user_gameweek_id: "veteran-old", gameweek_score: "70", settlement_status: "FINAL" },
    { user_gameweek_id: "new-other-season", gameweek_score: "500", settlement_status: "FINAL" },
  ],
  users: [{ id: "veteran", full_name: "Veteran" }, { id: "new", full_name: "New manager" }],
});
const card: ClubOwnerSquadCard = {
  id: "provider-player", canonicalPlayerId: "canonical-player", name: "Synthetic player", shortName: "Player",
  role: "midfielder", position: "CM", clubName: "Synthetic club", shirtNumber: 8, countryCode3: "ENG",
  marketValue: "", touchlinePoints: 0,
};

test("real manager ranking does not credit a newly selected card's 100 historical points", async () => {
  const data = tables();
  const displayedCard = applyTouchlineSeasonPoints([card], [
    { canonicalPlayerId: "canonical-player", touchlinePoints: 100, totalRating: 100, statistics: {} },
  ])[0];
  assert.equal(displayedCard.seasonTotalRating, 100);
  const initial = await readProductionRankings(data, "now", "season", "new");
  assert.equal(initial.season.find(row => row.name === "Veteran")?.score, 70);
  assert.equal(initial.season.find(row => row.isCurrentManager)?.score, 0);

  data.touchline_fantasy_user_gameweek_scores.push(
    { user_gameweek_id: "veteran-now", gameweek_score: "8", settlement_status: "FINAL" },
    { user_gameweek_id: "new-now", gameweek_score: "8", settlement_status: "FINAL" },
  );
  const after = await readProductionRankings(data, "now", "season", "new");
  assert.equal(after.season.find(row => row.isCurrentManager)?.score, 8);
  assert.equal(after.season.find(row => row.name === "Veteran")?.score, 78);
  assert.equal(after.gameweek.find(row => row.isCurrentManager)?.score, 8);
  assert.equal(displayedCard.seasonTotalRating, 100, "manager points must not overwrite card history");
  assert.deepEqual(await readProductionRankings(data, "now", "season", "new"), after, "repeat reads cannot compound scores");
});

test("current provisional points remain visible but do not enter the finalized season total", async () => {
  const data = tables();
  data.touchline_fantasy_user_gameweek_scores.push({ user_gameweek_id: "new-now", gameweek_score: "8", settlement_status: "PROVISIONAL" });
  const actual = await readProductionRankings(data, "now", "season", "new");
  assert.equal(actual.gameweek.find(row => row.isCurrentManager)?.score, 8);
  assert.equal(actual.season.find(row => row.isCurrentManager)?.score, 0);
  assert.equal(actual.season.find(row => row.name === "Veteran")?.score, 70);
});


test("no current round still reads canonical paid registration and preserves an explicit zero", async () => {
  const data = tables();
  data.touchline_club_collections = [{user_id:"registered",season_id:"season",plan:"standard",users:{full_name:"Registered",touchline_fantasy_entitlements:[{entitlement_key:"fantasy_access",status:"active",plan_key:"standard",current_period_start:null,current_period_end:null}]}}];
  const result = await readProductionRankings(data, null, "season", "registered");
  assert.equal(result.gameweek.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.season.find(row=>row.isCurrentManager))),{rank:2,name:"Registered",score:0,isCurrentManager:true});
  assert.equal(result.season.find(row=>row.name === "New manager")?.rank,2, "both confirmed zero totals share position");
});
