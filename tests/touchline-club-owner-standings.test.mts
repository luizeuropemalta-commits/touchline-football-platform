import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { projectClubOwnerStandings } from "../lib/touchlineArena/club-owner-standings.ts";

const participant = (id: string, user = "owner-a", score: unknown = null) => ({
  id, user_id: user, market_plan_key_snapshot: "vip", users: { full_name: user === "owner-a" ? "Owner A" : "Owner B" },
  touchline_fantasy_user_gameweek_scores: score,
});
test("one persisted participant with no settled score is visible at zero, without private fields", () => {
  assert.deepEqual(projectClubOwnerStandings([participant("week-a")]), [{ rank: 1, name: "Owner A", touchlinePoints: 0 }]);
  assert.deepEqual(projectClubOwnerStandings([]), []);
});
test("FINAL scores aggregate once per round, provisional scores excluded, ties share position", () => {
  assert.deepEqual(projectClubOwnerStandings([
    participant("a1", "owner-a", { gameweek_score: "10.25", settlement_status: "FINAL" }),
    participant("a2", "owner-a", { gameweek_score: 999, settlement_status: "PROVISIONAL" }),
    participant("a3", "owner-a", { gameweek_score: "1.25", settlement_status: "FINAL" }),
    participant("b1", "owner-b", { gameweek_score: 11.5, settlement_status: "FINAL" }),
  ]), [{ rank: 1, name: "Owner A", touchlinePoints: 11.5 }, { rank: 1, name: "Owner B", touchlinePoints: 11.5 }]);
});
test("duplicates, practice plans, missing identities and invalid scores never produce a partial table", () => {
  const row = participant("a");
  for (const input of [[row, row], [{ ...row, market_plan_key_snapshot: "beta" }], [{ ...row, users: null }],
    [participant("a", "owner-a", { settlement_status: "FINAL", gameweek_score: "not-a-score" })]]) {
    assert.equal(projectClubOwnerStandings(input), null);
  }
});

const source = readFileSync(new URL("../lib/touchlineArena/club-owner-standings-server.ts", import.meta.url), "utf8");
function loader(dataset: ReturnType<typeof participant>[], fail = false) {
  const calls: string[] = [];
  const admin = { from(table: string) {
    calls.push(table);
    const chain = {
      select(columns: string) { assert.ok(!columns.includes("*") && !columns.includes("email")); return chain; },
      eq(key: string, value: string) { if (table.endsWith("user_gameweeks")) assert.deepEqual([key, value], ["touchline_fantasy_gameweeks.season_id", "active-season"]); return chain; },
      in(key: string, values: string[]) { assert.equal(key, "market_plan_key_snapshot"); assert.deepEqual(Array.from(values), ["standard", "pro", "master", "vip"]); return chain; },
      order(key: string) { assert.equal(key, table === "touchline_club_collections" ? "user_id" : "id"); return chain; },
      single() { return Promise.resolve({ data: { season_id: "active-season" }, error: null }); },
      range(start: number, end: number) { const rows = table === "touchline_club_collections" ? [] : dataset; return Promise.resolve({ data: rows.slice(start, end + 1), count: rows.length, error: fail ? {} : null }); },
    };
    return chain;
  } };
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => name === "server-only" ? {} : name.includes("supabase") ? { createAdminClient: () => admin } : { projectClubOwnerStandings } });
  return { load: exports.loadClubOwnerStandings as () => Promise<unknown>, calls };
}
test("actual server reader paginates all participants under active season and paid plan scope", async () => {
  const fixture = loader(Array.from({ length: 501 }, (_, i) => participant(`round-${i}`)));
  assert.deepEqual(JSON.parse(JSON.stringify(await fixture.load())), { status: "ready", rows: [{ rank: 1, name: "Owner A", touchlinePoints: 0 }] });
  assert.equal(fixture.calls.filter(name => name.endsWith("user_gameweeks")).length, 2);
});
test("query failure is unavailable, not a confirmed empty table", async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(await loader([], true).load())), { status: "unavailable", rows: [] });
});
test("empty embedded scores and absent display name remain valid without email fallback", () => {
  assert.deepEqual(projectClubOwnerStandings([{ ...participant("a"), users: {full_name:null}, touchline_fantasy_user_gameweek_scores:[] }]), [{rank:1,name:"TouchLine Manager",touchlinePoints:0}]);
});
test("real collection registration requires active paid entitlement; no round or purchase is synthesized", () => {
  const grant = {entitlement_key:"fantasy_access",status:"active",plan_key:"vip",current_period_start:null,current_period_end:null};
  const registration = {user_id:"owner-a",plan:"vip",users:{full_name:"Owner A",touchline_fantasy_entitlements:[grant]}};
  assert.deepEqual(projectClubOwnerStandings([], [registration]), [{rank:1,name:"Owner A",touchlinePoints:0}]);
  for (const invalid of [{...grant,status:"expired"},{...grant,plan_key:"beta"},{...grant,plan_key:"unknown"},{...grant,current_period_start:"2999-01-01"},{...grant,current_period_end:"2000-01-01"}]) {
    assert.deepEqual(projectClubOwnerStandings([], [{...registration,users:{...registration.users,touchline_fantasy_entitlements:[invalid]}}]), []);
  }
  assert.deepEqual(projectClubOwnerStandings([participant("a", "owner-a", {gameweek_score:2,settlement_status:"FINAL"})], [registration]), [{rank:1,name:"Owner A",touchlinePoints:2}]);
});
