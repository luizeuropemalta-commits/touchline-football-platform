import { projectClubOwnerPublicPhotos, projectClubOwnerStandingIndex } from "../lib/touchlineArena/club-owner-standings.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { projectClubOwnerStandings, projectClubOwnerStandingViews } from "../lib/touchlineArena/club-owner-standings.ts";

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
function loader(dataset: ReturnType<typeof participant>[], fail = false, options: { driftingCount?: boolean; missingCount?: boolean; truncatePage?: boolean; registrations?: unknown[]; candidates?: unknown[] } = {}) {
  const calls: string[] = [];
  const admin = { rpc(name: string, args: unknown) { assert.equal(name,"touchline_people_directory_candidates"); assert.deepEqual(JSON.parse(JSON.stringify(args)), {p_viewer:null}); return { abortSignal: async () => ({ data: options.candidates, error: null }) }; }, from(table: string) {
    calls.push(table);
    const chain = {
      abortSignal() { return chain; },
      select(columns: string) { assert.ok(!columns.includes("*") && !columns.includes("email")); return chain; },
      eq(key: string, value: string) { if (table.endsWith("user_gameweeks")) assert.deepEqual([key, value], ["touchline_fantasy_gameweeks.season_id", "active-season"]); return chain; },
      in(key: string, values: string[]) { assert.equal(key, "market_plan_key_snapshot"); assert.deepEqual(Array.from(values), ["standard", "pro", "master", "vip"]); return chain; },
      order(key: string) { assert.equal(key, table === "touchline_club_collections" ? "user_id" : "id"); return chain; },
      single() { return Promise.resolve({ data: { season_id: "active-season" }, error: null }); },
      range(start: number, end: number) { const rows = table === "touchline_club_collections" ? options.registrations ?? [] : dataset; const result = Promise.resolve({ data: rows.slice(start, options.truncatePage ? start + 1 : end + 1), count: options.missingCount ? null : rows.length + (options.driftingCount && start > 0 ? 1 : 0), error: fail ? {} : null }); return Object.assign(result, { abortSignal: () => result }); },
    };
    return chain;
  } };
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, AbortSignal, require: (name: string) => name === "server-only" ? {} : name.includes("supabase") ? { createAdminClient: () => admin } : name.includes("public-avatar-server") ? { publicOwnerAvatarService: () => ({ enabled: options.candidates !== undefined }) } : { projectClubOwnerStandingViews, projectClubOwnerStandingIndex, projectClubOwnerPublicPhotos } });
  return { load: exports.loadClubOwnerStandings as () => Promise<unknown>, read: (viewer: string) => (exports.readClubOwnerStandingViewsForSeason as (admin: unknown, season: string, viewer: string) => Promise<unknown>)(admin, "active-season", viewer), calls };
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


test("public and private views share exact ties and identify the viewer by private identity, never display name", () => {
  const input = [
    {...participant("a", "private-a", {gameweek_score:12,settlement_status:"FINAL"}), users:{full_name:"Same name"}},
    {...participant("b", "private-b", {gameweek_score:12,settlement_status:"FINAL"}), users:{full_name:"Same name"}},
    participant("c", "private-c", {gameweek_score:3,settlement_status:"FINAL"}),
  ];
  const views = projectClubOwnerStandingViews(input, [], Date.now(), "private-b")!;
  assert.deepEqual(views.rows.map(row => row.rank), [1,1,3]);
  assert.deepEqual(views.viewerRanking.map(row => row.rank), [1,1,3]);
  assert.deepEqual(views.viewerRanking.map(row => row.isCurrentManager), [false,true,false]);
  assert.deepEqual(views.viewerRanking.map(({rank,name,score}) => ({rank,name,touchlinePoints:score})), views.rows);
  assert.doesNotMatch(JSON.stringify(views), /private-a|private-b|private-c|userId|user_id|email/);
  assert.equal(projectClubOwnerStandingViews(input, [], Date.now(), "not-enrolled")?.viewerRanking.some(row => row.isCurrentManager), false);
});

test("zero standings require persisted competitive enrollment, never a synthetic viewer row", () => {
  const grant = {entitlement_key:"fantasy_access",status:"active",plan_key:"standard",current_period_start:null,current_period_end:null};
  const registration = {user_id:"new-owner",plan:"standard",users:{full_name:"New owner",touchline_fantasy_entitlements:[grant]}};
  const views = projectClubOwnerStandingViews([], [registration], Date.now(), "new-owner")!;
  assert.deepEqual(views.viewerRanking, [{rank:1,name:"New owner",score:0,isCurrentManager:true}]);
  assert.deepEqual(projectClubOwnerStandingViews([], [], Date.now(), "new-owner"), {rows:[],viewerRanking:[]});
});

test("shared server read and public route agree while public response omits personalization", async () => {
  const fixture = loader([participant("week-a")]);
  const personal = JSON.parse(JSON.stringify(await fixture.read("owner-a")));
  const publicResult = JSON.parse(JSON.stringify(await fixture.load()));
  assert.deepEqual(personal, {status:"ready",rows:[{rank:1,name:"Owner A",touchlinePoints:0}],viewerRanking:[{rank:1,name:"Owner A",score:0,isCurrentManager:true}]});
  assert.deepEqual(publicResult, {status:"ready",rows:personal.rows});
  assert.equal("viewerRanking" in publicResult, false);
  assert.doesNotMatch(JSON.stringify(publicResult), /isCurrentManager|owner-a|user_id|userId/);
});

test("partial pagination, changed counts and missing counts never yield a misleading rank", async () => {
  const dataset = Array.from({length:501}, (_, i) => participant(`r-${i}`));
  for (const options of [{driftingCount:true},{missingCount:true},{truncatePage:true}]) {
    const fixture = loader(dataset, false, options);
    assert.deepEqual(JSON.parse(JSON.stringify(await fixture.read("owner-a"))), {status:"unavailable",rows:[],viewerRanking:[]});
    assert.deepEqual(JSON.parse(JSON.stringify(await fixture.load())), {status:"unavailable",rows:[]});
  }
});

test("malformed or failed shared reads preserve unavailable rather than zero eligibility", async () => {
  for (const fixture of [loader([],true),loader([participant("bad","owner-a",{gameweek_score:"bad",settlement_status:"FINAL"})])]) {
    assert.deepEqual(JSON.parse(JSON.stringify(await fixture.read("owner-a"))),{status:"unavailable",rows:[],viewerRanking:[]});
  }
});

test("actual ranking loader projects only opted-in public identity without account data", async () => {
 const account="10000000-0000-4000-8000-000000000001",publicId="20000000-0000-4000-8000-000000000001";
 const actual=await loader([participant("round",account)],false,{candidates:[{accountId:account,publicId,displayName:"Public Name",followerCount:0,following:false,viewer:"guest",planKey:"vip",email:"private@example.test"}]}).load();
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),{status:"ready",rows:[{rank:1,name:"Owner B",touchlinePoints:0,publicPhoto:{publicId,displayName:"Public Name",planKey:"vip"}}]});
 assert.ok(!JSON.stringify(actual).includes(account));
});
