import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { sportmonksFixtureInstant } from "../lib/football-data/sportmonks-fixture-instant.ts";

test("ClubOwner date window excludes a large archive before the fixture limit", async () => {
  const source = await readFile(new URL("../lib/football-data/fixture-schedule-store.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("store.ts", source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "readPublicCompetitionFixtures");
  assert.ok(fn?.body);
  const prefix = fn.body.statements.map((node) => node.getText(ast));
  const end = prefix.findIndex((statement) => statement.includes("const { data: fixtureRows"));
  assert.ok(end > 0);
  const js = ts.transpileModule(prefix.slice(0, end + 1).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const rows = [...Array.from({ length: 300 }, (_, index) => ({ id: `old-${index}`, starts_at: "2025-01-01T00:00:00.000Z" })),
    { id: "friday", starts_at: "2026-10-09T12:00:00.000Z" },
    { id: "today", starts_at: "2026-10-11T12:00:00.000Z" },
    { id: "future", starts_at: "2027-01-01T12:00:00.000Z" }];
  let lower = "", upper = "9999", limit = 0;
  const query = {
    select() { return this; }, eq() { return this; }, order() { return this; },
    limit(value: number) { limit = value; return this; },
    gte(_key: string, value: string) { lower = value; return this; },
    lte(_key: string, value: string) { upper = value; return this; },
    maybeSingle: async () => ({ data: { id: "competition" }, error: null }),
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: rows.filter((row) => row.starts_at >= lower && row.starts_at <= upper).slice(0, limit), error: null })); },
  };
  const result = await vm.runInNewContext(`(async()=>{${js}; return fixtureRows;})()`, {
    options: { providedAdmin: { from: () => query }, includeHistorical: true, limit: 240, from: "2026-10-04T00:00:00.000Z", through: "2026-10-25T00:00:00.000Z" },
    DEFAULT_PROVIDER: "sportmonks", DEFAULT_COMPETITION_PROVIDER_ID: "8", DEFAULT_LIMIT: 50, MAX_LIMIT: 500,
  });
  assert.deepEqual(result.map((row: { id: string }) => row.id), ["friday", "today"]);
});

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

  assert.match(provider, /import \{ sportmonksFixtureInstant \} from "\.\.\/sportmonks-fixture-instant\.ts"/);
  assert.match(provider, /startsAt: sportmonksFixtureInstant\(raw, sourceTimeZone \|\| "UTC"\)/);
  const epoch = Date.parse("2026-10-10T12:30:00.000Z") / 1000;
  for (const sourceTimeZone of ["UTC", "Europe/London", "America/Sao_Paulo"]) {
    assert.equal(sportmonksFixtureInstant({
      starting_at_timestamp: epoch,
      starting_at: "2026-10-10 09:00:00",
    }, sourceTimeZone), "2026-10-10T12:30:00.000Z");
  }
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
