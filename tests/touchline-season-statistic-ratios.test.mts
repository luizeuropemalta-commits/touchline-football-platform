import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { projectSeasonStatisticRatios, seasonPercentageFromCounts } from "../lib/football-data/season-statistic-ratios.ts";

test("legacy summed percentages are reconstructed from covered count pairs without mutating facts", () => {
  const facts = Object.freeze({ passes: 248, "accurate-passes": 226, "accurate-passes-percentage": 463,
    "long-balls": 16, "long-balls-won": 11, "long-balls-won-percentage": 334,
    "total-crosses": 14, "accurate-crosses": 6, "successful-crosses-percentage": 258, rating: 38.53 });
  const result = projectSeasonStatisticRatios(facts);
  assert.equal(result["accurate-passes-percentage"], 91.13);
  assert.equal(result["long-balls-won-percentage"], 68.75);
  assert.equal(result["successful-crosses-percentage"], 42.86);
  assert.equal(result.rating, 38.53);
  assert.equal(facts["accurate-passes-percentage"], 463);
});
test("missing, zero, nonnumeric and contradictory count evidence cannot generate a percentage", () => {
  for (const counts of [ {}, { passes: 10 }, { passes: 0, "accurate-passes": 0 },
    { passes: 10, "accurate-passes": 11 }, { passes: -2, "accurate-passes": -1 },
    { passes: Infinity, "accurate-passes": 5 }, { passes: "", "accurate-passes": 0 }]) {
    assert.equal(seasonPercentageFromCounts("accurate-passes-percentage", counts), null);
  }
  assert.equal(seasonPercentageFromCounts("accurate-passes-percentage", { passes: "10", "accurate-passes": "0" }), 0);
  assert.equal(seasonPercentageFromCounts("accurate-passes-percentage", { passes: 10, "accurate-passes": 10 }), 100);
});
test("unsupported season percentages are unavailable even when a summed value lies below 100", () => {
  assert.equal(seasonPercentageFromCounts("unknown-percentage", { "unknown-percentage": 50 }), null);
  assert.deepEqual(projectSeasonStatisticRatios({ "unknown-percentage": 50, passes: 100 }), { passes: 100 });
});
test("profile uses translated labels and calculated rates, never displays raw summed percentage values", () => {
  const page = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /seasonPercentageFromCounts\(label, statistics\.positionStatistics\)/);
  assert.match(page, /localizedStatLabel\(label, label, locale\)/);
  assert.match(page, /ratio === null \? text\.unavailable/);
  assert.doesNotMatch(page, /_localizedStatLabel/);
  assert.match(page, /filter\(\(\[label\]\) => label !== "rating"\)/);
  assert.match(page, /Percentages calculated from available counts/);
});
