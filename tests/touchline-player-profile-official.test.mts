import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSportmonksStatisticValue } from "../lib/football-data/sportmonks-statistics.ts";
import { normalizeTouchLineOfficialStats } from "../lib/touchlineArena/player-profile-statistics.ts";

describe("TouchLine official player profile", () => {
  it("uses the latest season that actually contains statistics", () => {
    const normalized = normalizeTouchLineOfficialStats({
      fetchedAt: "2026-07-21T10:00:00.000Z",
      statistics: [
        { seasonId: "old", details: [{ typeId: "1", code: "goals", name: "Goals", value: 12 }] },
        { seasonId: "new-empty", details: [] },
      ],
    });

    assert.equal(normalized.seasonId, "old");
    assert.equal(normalized.stats.length, 1);
    assert.equal(normalized.stats[0]?.value, 12);
  });

  it("preserves every valid provider statistic without estimating missing values", () => {
    const normalized = normalizeTouchLineOfficialStats({
      statistics: [{
        seasonId: "2026",
        details: [
          { typeId: "1", code: "goals", name: "Goals", value: 8 },
          { typeId: "2", code: "assists", name: "Assists", value: 5 },
          { typeId: "3", code: "unknown", name: "Unknown", value: undefined },
        ],
      }],
    });

    assert.deepEqual(normalized.stats.map((stat) => stat.code), ["goals", "assists"]);
  });

  it("reads nested SportMonks totals instead of silently dropping them", () => {
    assert.equal(parseSportmonksStatisticValue({ total: 43 }), 43);
  });

  it("groups provider statistics by football meaning instead of broad word matches", () => {
    const normalized = normalizeTouchLineOfficialStats({
      statistics: [{
        seasonId: "2026",
        details: [
          { typeId: "1", code: "goals", name: "Goals", value: 27 },
          { typeId: "2", code: "goals-conceded", name: "Goals Conceded", value: 32 },
          { typeId: "3", code: "aerial-won", name: "Aerials Won", value: 73 },
          { typeId: "4", code: "hit-woodwork", name: "Hit Woodwork", value: 6 },
          { typeId: "5", code: "yellow-cards", name: "Yellow Cards", value: 2 },
        ],
      }],
    });

    assert.deepEqual(
      normalized.stats.map((stat) => [stat.code, stat.group]),
      [
        ["goals", "summary"],
        ["goals-conceded", "goalkeeping"],
        ["aerial-won", "defending"],
        ["hit-woodwork", "attack"],
        ["yellow-cards", "summary"],
      ],
    );
  });

  it("uses the official type name when SportMonks supplies an opaque statistic code", () => {
    const normalized = normalizeTouchLineOfficialStats({
      statistics: [{
        seasonId: "current",
        details: [{ typeId: "101", code: "101", name: "Aerials Won", value: 73 }],
      }],
    });

    assert.equal(normalized.stats[0]?.code, "101");
    assert.equal(normalized.stats[0]?.label, "Aerials Won");
    assert.equal(normalized.stats[0]?.group, "defending");
  });
});
