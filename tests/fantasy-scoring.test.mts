import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateFantasyEventPoints } from "../lib/football-data/fantasy-scoring.ts";

describe("fantasy event scoring", () => {
  it("scores an own goal as a deduction before the generic goal rule", () => {
    assert.equal(estimateFantasyEventPoints("Own Goal"), -2);
    assert.equal(estimateFantasyEventPoints("own goal"), -2);
  });

  it("keeps a regular goal worth six points", () => {
    assert.equal(estimateFantasyEventPoints("Goal"), 6);
  });
});
