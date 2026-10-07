import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("actual season lookup loop is serial and retains source order and failed results", async () => {
  const source=await readFile(new URL("../lib/football-data/fixture-schedule-sync.ts",import.meta.url),"utf8");
  const file=ts.createSourceFile("sync.ts",source,ts.ScriptTarget.Latest,true);
  let loop:ts.ForOfStatement|undefined;
  function visit(node:ts.Node) {
    if(ts.isForOfStatement(node)&&node.expression.getText(file)==="seasonIds") loop=node;
    ts.forEachChild(node,visit);
  }
  visit(file); assert.ok(loop,"season lookups require an awaited serial loop");
  const js=ts.transpileModule(loop.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  let inFlight=0; const calls:string[]=[], seasonResults:unknown[]=[];
  const provider={async getSeasonById(id:string) {
    assert.equal(inFlight++,0,"a second season must not compete for the account lease");
    calls.push(id); await Promise.resolve(); inFlight--;
    return id==="2"?{ok:false,error:{message:"synthetic failure"}}:{ok:true,data:{id}};
  }};
  await vm.runInNewContext(`(async()=>{${js}})()`,{provider,seasonIds:["3","2","1"],seasonResults});
  assert.deepEqual(calls,["3","2","1"]);
  assert.deepEqual(seasonResults,[{ok:true,data:{id:"3"}},{ok:false,error:{message:"synthetic failure"}},{ok:true,data:{id:"1"}}]);
});

test("public Live route consumes persisted fixtures without provider or persistence fallback", async () => {
  const liveRoute = await readFile(new URL("../app/api/football-data/fantasy/livescores/route.ts", import.meta.url), "utf8");
  assert.match(liveRoute, /readPublicCompetitionFixtures/);
  assert.match(liveRoute, /readPersistedLiveScoreSnapshot/);
  assert.doesNotMatch(liveRoute, /mergeCanonicalFixtures|createFootballDataProvider|persistLiveScoreSnapshot/);
});

test("fixture schedule migration is normalized and server-only", async () => {
  const migration = await readFile(new URL("../supabase/migrations/046_touchline_canonical_fixture_read_model.sql", import.meta.url), "utf8");

  assert.match(migration, /create table if not exists public\.football_fixtures/);
  assert.match(migration, /unique \(provider, provider_fixture_id\)/);
  assert.match(migration, /competition_id uuid references public\.football_competitions/);
  assert.match(migration, /revoke all privileges on table public\.football_fixtures from public, anon, authenticated/);
  assert.match(migration, /fixture_schedule/);
});

test("Sportmonks fixture mapping prefers its UTC timestamp over an ambiguous local date", async () => {
  const provider = await readFile(new URL("../lib/football-data/providers/sportmonks.ts", import.meta.url), "utf8");

  assert.match(provider, /function sportmonksFixtureStartAt/);
  assert.match(provider, /raw\.starting_at_timestamp/);
  assert.match(provider, /startsAt: sportmonksFixtureStartAt\(raw\)/);
});

test("the public Live boundary accepts only numeric Sportmonks fixture identifiers", async () => {
  const store = await readFile(new URL("../lib/football-data/fixture-schedule-store.ts", import.meta.url), "utf8");

  assert.match(store, /export function isOfficialSportmonksFixtureId/);
  assert.match(store, /\^\[1-9\]\\d\{0,19\}\$/);
  assert.match(store, /provider !== "sportmonks" \|\| !isOfficialSportmonksFixtureId\(providerId\)/);
});

test("legacy representative fixtures are backed up before removal from the canonical schedule", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260819111335_quarantine_legacy_fixture_records.sql", import.meta.url), "utf8");
  const backupIndex = migration.indexOf("insert into public.football_fixture_legacy_quarantine");
  const removalIndex = migration.indexOf("delete from public.football_fixtures");

  assert.match(migration, /fixture_row jsonb not null/);
  assert.match(migration, /provider_fixture_id like 'qa-representative-%'/);
  assert.ok(backupIndex >= 0);
  assert.ok(removalIndex > backupIndex);
  assert.match(migration, /Rollback:/);
  assert.match(migration, /revoke all privileges on table public\.football_fixture_legacy_quarantine from public, anon, authenticated/);
});
