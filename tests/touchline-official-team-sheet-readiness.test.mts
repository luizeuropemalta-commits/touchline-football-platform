import assert from "node:assert/strict";
import test from "node:test";

import type { TouchlineFantasyFixtureFeed } from "../lib/football-data/types.ts";
import {
  inspectTouchlineOfficialTeamSheet,
  recordTouchlineLineupAvailableObservation,
} from "../lib/football-data/official-team-sheet-readiness.ts";

function feed(starters = 11, substitutes = 9): TouchlineFantasyFixtureFeed {
  const teams = ["51", "9"];
  return {
    fixture: {
      id: "19722189",
      providerId: "19722189",
      provider: "sportmonks",
      homeTeam: { id: "51", providerId: "51", provider: "sportmonks", name: "Crystal Palace" },
      awayTeam: { id: "9", providerId: "9", provider: "sportmonks", name: "Manchester City" },
      source: { provider: "sportmonks", providerId: "19722189" },
    },
    lineups: teams.flatMap((teamId, teamIndex) => [
      ...Array.from({ length: starters }, (_, index) => ({
        id: `${teamId}-s-${index}`,
        providerId: `${teamId}1${index}`,
        provider: "sportmonks" as const,
        fixtureId: "19722189",
        teamId,
        playerId: String(100_000 * (teamIndex + 1) + index + 1),
        playerName: `Starter ${teamId}-${index + 1}`,
        formationPosition: String(index + 1),
        isStarter: true,
        statistics: [],
      })),
      ...Array.from({ length: substitutes }, (_, index) => ({
        id: `${teamId}-b-${index}`,
        providerId: `${teamId}2${index}`,
        provider: "sportmonks" as const,
        fixtureId: "19722189",
        teamId,
        playerId: String(100_000 * (teamIndex + 1) + 100 + index + 1),
        playerName: `Substitute ${teamId}-${index + 1}`,
        isStarter: false,
        isSubstitute: true,
        statistics: [],
      })),
    ]),
    formations: [],
    sidelined: [],
    events: [],
    fetchedAt: "2026-08-28T18:30:00.000Z",
    mediaPolicy: { officialMediaExposed: false, note: "test" },
  };
}

test("two exact XIs and official benches pass the shared provider gate", () => {
  const readiness = inspectTouchlineOfficialTeamSheet(feed());
  assert.equal(readiness.startingElevensReady, true);
  assert.equal(readiness.completeTeamSheetsReady, true);
  assert.deepEqual([readiness.home?.starters, readiness.away?.starters], [11, 11]);
  assert.deepEqual([readiness.home?.substitutes, readiness.away?.substitutes], [9, 9]);
});

test("one partial XI fail-closes Club Hub and social publication", () => {
  const partial = feed();
  partial.lineups = partial.lineups.filter((member) => !(member.teamId === "9" && member.formationPosition === "11"));
  const readiness = inspectTouchlineOfficialTeamSheet(partial);
  assert.equal(readiness.startingElevensReady, false);
  assert.equal(readiness.completeTeamSheetsReady, false);
  assert.equal(readiness.away?.starters, 10);
});

test("an incomplete or oversized bench fail-closes the official matchday sheet", () => {
  assert.equal(inspectTouchlineOfficialTeamSheet(feed(11, 8)).completeTeamSheetsReady, false);
  assert.equal(inspectTouchlineOfficialTeamSheet(feed(11, 10)).completeTeamSheetsReady, false);
});

test("a duplicate starter or a starter repeated on the bench is rejected", () => {
  const duplicateStarter = feed();
  duplicateStarter.lineups[1]!.playerId = duplicateStarter.lineups[0]!.playerId;
  assert.equal(inspectTouchlineOfficialTeamSheet(duplicateStarter).startingElevensReady, false);

  const duplicateBench = feed();
  const cityStarter = duplicateBench.lineups.find((member) => member.teamId === "9" && member.isStarter)!;
  const cityBench = duplicateBench.lineups.find((member) => member.teamId === "9" && member.isSubstitute)!;
  cityBench.playerId = cityStarter.playerId;
  assert.equal(inspectTouchlineOfficialTeamSheet(duplicateBench).completeTeamSheetsReady, false);
});

test("non-positive player IDs and any formation position outside the exact 1..11 set fail closed", () => {
  const zeroId = feed();
  zeroId.lineups[0]!.playerId = "0";
  assert.equal(inspectTouchlineOfficialTeamSheet(zeroId).startingElevensReady, false);

  const outOfRange = feed();
  const palaceEleventh = outOfRange.lineups.find((member) => member.teamId === "51" && member.formationPosition === "11")!;
  palaceEleventh.formationPosition = "12";
  assert.equal(inspectTouchlineOfficialTeamSheet(outOfRange).startingElevensReady, false);

  const duplicatePosition = feed();
  const palaceSecond = duplicatePosition.lineups.find((member) => member.teamId === "51" && member.formationPosition === "2")!;
  palaceSecond.formationPosition = "1";
  assert.equal(inspectTouchlineOfficialTeamSheet(duplicatePosition).startingElevensReady, false);

  const malformed = feed();
  malformed.lineups[0]!.formationPosition = "1junk";
  assert.equal(inspectTouchlineOfficialTeamSheet(malformed).startingElevensReady, false);
});

test("LINEUP_AVAILABLE evidence waits for both exact benches, not only the XI", async () => {
  const incomplete = await recordTouchlineLineupAvailableObservation(
    lifecycleAdmin(true) as never,
    feed(11, 8),
    "2026-08-28T18:30:00.000Z",
  );
  assert.equal(incomplete.recorded, false);
  assert.equal(incomplete.readiness.startingElevensReady, true);
  assert.equal(incomplete.readiness.completeTeamSheetsReady, false);
});

function lifecycleAdmin(inserted: boolean) {
  return {
    from(table: string) {
      if (table === "football_fixtures") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { id: "fixture-uuid" }, error: null }),
        };
      }
      if (table === "football_fixture_lifecycle_events") {
        return {
          upsert() {
            return {
              select: async () => ({ data: inserted ? [{ fixture_id: "fixture-uuid" }] : [], error: null }),
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test("line-up observability distinguishes a real insert from an idempotent no-op", async () => {
  const inserted = await recordTouchlineLineupAvailableObservation(
    lifecycleAdmin(true) as never,
    feed(),
    "2026-08-28T18:30:00.000Z",
  );
  assert.equal(inserted.recorded, true);
  assert.equal("outcome" in inserted ? inserted.outcome : null, "inserted");

  const noOp = await recordTouchlineLineupAvailableObservation(
    lifecycleAdmin(false) as never,
    feed(),
    "2026-08-28T18:31:00.000Z",
  );
  assert.equal(noOp.recorded, false);
  assert.equal("outcome" in noOp ? noOp.outcome : null, "noop_existing");
});
