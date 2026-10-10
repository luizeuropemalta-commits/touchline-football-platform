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

const { buildQaTwentyClubRosterSyncPlan, assertQaRosterAtomicReceipt, isCurrentQaTwentyClubRoster } = await import("../lib/football-data/qa-twenty-club-roster-sync.ts");
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

test("roster verification preserves known country data when the provider omits enrichment", async () => {
  const player = { id: "player-1", provider_player_id: "1", current_club_id: "club-1",
    name: "Player", display_name: "Player", nationality: "England", country_id: "462" };
  const tables = {
    football_clubs: [{ id: "club-1", provider_team_id: "19" }],
    football_squad_members: [{ player_id: "player-1", jersey_number: 7 }],
    football_players: [player],
  };
  const admin = { from(table: keyof typeof tables) {
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: tables[table], error: null }).then(resolve); },
    };
    return query;
  } } as unknown as Parameters<typeof isCurrentQaTwentyClubRoster>[0];
  const squads = [{ teamId: "19", members: [{ player: { providerId: "1", name: "Player" } }] }];
  assert.equal(await isCurrentQaTwentyClubRoster(admin, squads), true,
    "the SQL-preserved country and shirt must not turn a successful application into a failed verification");
  assert.equal(await isCurrentQaTwentyClubRoster(admin, [{ teamId: "19", members: [
    { player: { providerId: "1", name: "Player", nationality: "France" } },
  ] }]), false,
    "an explicitly supplied different nationality still requires reconciliation");
  assert.equal(await isCurrentQaTwentyClubRoster(admin, [{ teamId: "19", members: [
    { player: { providerId: "1", name: "Player", countryId: "17" } },
  ] }]), false, "an explicitly supplied different country still requires reconciliation");
});

test("QA roster reads require the shared guarded provider before atomic persistence", () => {
  assert.match(rosterSyncSource, /createGuardedFixtureProvider\(admin, accountScope\)/);
  assert.doesNotMatch(rosterSyncSource, /touchline_qa_roster_quota_checkpoint/);
  assert.match(rosterSyncSource, /if \(!result.ok\) throw/);
  assert.match(rosterSyncSource, /const squads = await readProviderSquads\(admin\)/);
  assert.doesNotMatch(rosterSyncSource, /createFootballDataProvider\("sportmonks"\)/);
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

test("QA roster atomic apply requires a matching successful receipt and never calls blanket rollback", () => {
  const runId = "2ec64403-895a-4260-b505-9b7071f9d5a1";
  const receipt = { status: "applied", run_id: runId, clubs: 20, provider_players: 220 };
  assert.doesNotThrow(() => assertQaRosterAtomicReceipt({ data: receipt, error: null }, runId, 220));
  assert.throws(() => assertQaRosterAtomicReceipt({ data: null, error: { message: "apply failed" } }, runId, 220), /could not be confirmed/i);
  assert.throws(() => assertQaRosterAtomicReceipt({ data: null, error: null }, runId, 220), /could not be confirmed/i);
  assert.throws(() => assertQaRosterAtomicReceipt({ data: { ...receipt, status: "rolled_back" }, error: null }, runId, 220), /could not be confirmed/i);
  assert.throws(() => assertQaRosterAtomicReceipt({ data: { ...receipt, run_id: "other" }, error: null }, runId, 220), /could not be confirmed/i);
  assert.throws(() => assertQaRosterAtomicReceipt({ data: { ...receipt, provider_players: 219 }, error: null }, runId, 220), /could not be confirmed/i);
  assert.match(rosterSyncSource, /touchline_apply_qa_twenty_club_roster_atomic/);
  assert.doesNotMatch(rosterSyncSource, /\.rpc\("touchline_rollback_qa_twenty_club_roster"/);
});
