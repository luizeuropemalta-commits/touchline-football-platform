import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return nextResolve(new URL("tests/fixtures/server-only.mts", repositoryRoot).href, context);
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, repositoryRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { buildQaCountrySyncPlan } = await import("../lib/football-data/qa-country-sync.ts");
const { TOUCHLINE_ENGLAND_CLUBS } = await import("../lib/touchlineArena/demo-data.ts");

function completeScope() {
  const clubs = TOUCHLINE_ENGLAND_CLUBS.map((club, index) => ({
    id: `club-${index + 1}`,
    provider_team_id: club.teamId,
  }));
  const players = Array.from({ length: 588 }, (_, index) => ({
    id: `player-${index + 1}`,
    provider_player_id: String(index + 1),
    current_club_id: clubs[index % clubs.length]!.id,
    nationality: null,
    country_id: null,
  }));
  const memberships = players.map((player) => ({
    player_id: player.id,
    club_id: player.current_club_id!,
  }));
  const providerSquads = clubs.map((club) => ({
    teamId: club.provider_team_id,
    members: players
      .filter((player) => player.current_club_id === club.id)
      .map((player) => ({
        player: {
          providerId: player.provider_player_id,
          nationality: "England",
          countryId: "56",
        },
      })),
  }));
  return { clubs, players, memberships, providerSquads };
}

test("the QA country sync updates only real provider country fields after a complete 20-club proof", () => {
  const scope = completeScope();
  const plan = buildQaCountrySyncPlan(scope.clubs, scope.memberships, scope.players, scope.providerSquads);

  assert.equal(plan.ok, true);
  assert.equal(plan.providerPlayers, 588);
  assert.equal(plan.canonicalPlayers, 588);
  assert.equal(plan.nationalityProvided, 588);
  assert.equal(plan.countryIdsProvided, 588);
  assert.equal(plan.updates.length, 588);
  assert.deepEqual(plan.updates[0], { playerId: "player-1", nationality: "England", countryId: "56" });
});

test("the QA country sync fails closed for partial provider scope and never proposes writes", () => {
  const scope = completeScope();
  scope.providerSquads.pop();
  const plan = buildQaCountrySyncPlan(scope.clubs, scope.memberships, scope.players, scope.providerSquads);

  assert.equal(plan.ok, false);
  assert.equal(plan.updates.length, 0);
  assert.ok(plan.errors.includes("provider-club-scope-incomplete"));
});
