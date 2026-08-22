import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return nextResolve(new URL("tests/fixtures/server-only.mts", repositoryRoot).href, context);
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, repositoryRoot).href, context);
    return nextResolve(specifier, context);
  },
});

const { buildQaTwentyClubRosterSyncPlan } = await import("../lib/football-data/qa-twenty-club-roster-sync.ts");
const { TOUCHLINE_ENGLAND_CLUBS } = await import("../lib/touchlineArena/demo-data.ts");
const rosterSyncSource = readFileSync(new URL("../lib/football-data/qa-twenty-club-roster-sync.ts", import.meta.url), "utf8");

function completeProviderScope() {
  return TOUCHLINE_ENGLAND_CLUBS.map((club, clubIndex) => ({
    teamId: club.teamId,
    members: Array.from({ length: 11 }, (_, playerIndex) => ({
      player: {
        providerId: String(clubIndex * 100 + playerIndex + 1),
        name: `Player ${clubIndex}-${playerIndex}`,
        nationality: "England",
        countryId: "462",
        broadPosition: playerIndex === 0 ? "Goalkeeper" : "Midfielder",
        broadPositionId: playerIndex === 0 ? "24" : "26",
        detailedPosition: playerIndex === 0 ? "Goalkeeper" : "Central Midfield",
        detailedPositionId: playerIndex === 0 ? "24" : "153",
      },
      jerseyNumber: playerIndex + 1,
      broadPosition: playerIndex === 0 ? "Goalkeeper" : "Midfielder",
      broadPositionId: playerIndex === 0 ? "24" : "26",
      detailedPosition: playerIndex === 0 ? "Goalkeeper" : "Central Midfield",
      detailedPositionId: playerIndex === 0 ? "24" : "153",
      position: playerIndex === 0 ? "Goalkeeper" : "Central Midfield",
    })),
  }));
}

test("the global QA roster preflight accepts current provider cardinality and provider-supplied country/shirt fields", () => {
  const plan = buildQaTwentyClubRosterSyncPlan(completeProviderScope());

  assert.equal(plan.ok, true);
  assert.equal(plan.providerPlayers, 220);
  assert.equal(plan.nationalityProvided, 220);
  assert.equal(plan.countryIdsProvided, 220);
  assert.equal(plan.shirtNumbersProvided, 220);
  assert.equal(plan.detailedPositionsProvided, 220);
  assert.equal(plan.detailedPositionsPending, 0);
});

test("the global QA roster preflight fails closed for a duplicate or partial provider response", () => {
  const scope = completeProviderScope();
  scope[1]!.members[0]!.player.providerId = scope[0]!.members[0]!.player.providerId;
  scope.pop();

  const plan = buildQaTwentyClubRosterSyncPlan(scope);
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.includes("provider-club-scope-incomplete"));
  assert.ok(plan.errors.some((error) => error.startsWith("provider-player-duplicate-or-missing:")));
});

test("a current provider-backed roster is a no-write reconciliation", () => {
  const noWriteGate = rosterSyncSource.match(/async function isCurrentQaTwentyClubRoster[\s\S]*?return true;[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(noWriteGate, /nationality/);
  assert.match(noWriteGate, /country_id/);
  assert.match(noWriteGate, /jersey_number/);
  assert.match(noWriteGate, /detailed_position_id/);
  assert.match(noWriteGate, /provider_position_id/);
  assert.match(rosterSyncSource, /if \(await isCurrentQaTwentyClubRoster\(admin, squads\)\)[\s\S]*?status: "already-current"/);
});

test("provider omissions remain pending and are never filled from a broad parent role", () => {
  const scope = completeProviderScope();
  const pending = scope[0]!.members[1]!;
  delete pending.detailedPosition;
  delete pending.detailedPositionId;
  delete pending.player.detailedPosition;
  delete pending.player.detailedPositionId;
  pending.position = undefined;

  const plan = buildQaTwentyClubRosterSyncPlan(scope);
  assert.equal(plan.ok, true);
  assert.equal(plan.detailedPositionsProvided, 219);
  assert.equal(plan.detailedPositionsPending, 1);
});

test("the QA migration persists broad and detailed roles with a reversible service-only rollback", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260821162000_qa_exact_player_position_contract.sql", import.meta.url), "utf8");
  assert.match(migration, /add column if not exists provider_position/);
  assert.match(migration, /add column if not exists detailed_position_id/);
  assert.match(migration, /touchline_rollback_qa_twenty_club_roster/);
  assert.match(migration, /detailed_position_id = nullif\(before\.payload->>'detailed_position_id'/);
  assert.match(migration, /revoke all on function public\.touchline_rollback_qa_twenty_club_roster/);
});
