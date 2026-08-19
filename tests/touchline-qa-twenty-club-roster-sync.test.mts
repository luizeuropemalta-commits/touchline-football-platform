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
      },
      jerseyNumber: playerIndex + 1,
      position: playerIndex === 0 ? "Goalkeeper" : "Midfielder",
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
  assert.match(rosterSyncSource, /if \(await isCurrentQaTwentyClubRoster\(admin, squads\)\)[\s\S]*?status: "already-current"/);
});
