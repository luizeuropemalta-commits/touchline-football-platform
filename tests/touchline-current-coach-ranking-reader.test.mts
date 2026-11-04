import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { legacyCoachCatalogue, parseCoachCatalogueTransport } from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { projectTouchlineCurrentCoachRanking } from "../lib/touchlineArena/current-coach-ranking.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const seed = legacyCoachCatalogue();
const publishedEntries = seed.current.map((entry, index) => ({ ...entry,
  internalId: `00000000-0000-4000-8000-${String(index + 1001).padStart(12, "0")}`,
  publicationId: `00000000-0000-4000-8000-${String(index + 2001).padStart(12, "0")}`,
}));
const catalogue = parseCoachCatalogueTransport({ phase: "ready", revision: 1, current: publishedEntries, history: publishedEntries })!;
assert.equal(catalogue.phase, "ready");
const scope = { competitionId: id(100), seasonId: id(200), effectiveSeason: "2026-27" };
const clubs = catalogue.current.map((entry, index) => ({ id: id(index + 1), provider: "sportmonks", provider_team_id: entry.coach.teamId!, competition_id: scope.competitionId, name: `Club ${index}` }));
const code = stripTypeScriptTypes(readFileSync(new URL("../lib/touchlineArena/current-coach-ranking-server.ts", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
const read = runInNewContext(`${code}\nreadTouchlineCurrentCoachRanking;`, { projectTouchlineCurrentCoachRanking, AbortSignal });
type Response = { data: unknown; error: unknown; count: number | null };
function harness(responses: Response[]) {
  let reads = 0;
  const admin = { from(table: string) {
    assert.equal(table, "football_clubs");
    const query = {
      select(fields: string, options: unknown) { assert.equal(fields, "id,provider,provider_team_id,competition_id,name"); assert.deepEqual(JSON.parse(JSON.stringify(options)), { count: "exact" }); return query; },
      eq(field: string, value: string) { assert.equal(field, "provider"); assert.equal(value, "sportmonks"); return query; },
      in(field: string, ids: string[]) { assert.equal(field, "provider_team_id"); assert.deepEqual(ids, catalogue.current.map(entry => entry.coach.teamId)); return query; },
      limit(value: number) { assert.equal(value, 21); return query; },
      abortSignal(signal: AbortSignal) { assert.ok(signal instanceof AbortSignal); return Promise.resolve(responses[reads++]); },
    };
    return query;
  } };
  return { load: (currentScope: typeof scope | null = scope) => read(admin, null, catalogue, currentScope), count: () => reads };
}
const response = (data: unknown = clubs, count = 20): Response => ({ data, count, error: null });

test("confirmed current scope uses complete canonical clubs, not a static league/gallery", async () => {
  const h = harness([response(), response()]);
  const result = await h.load();
  assert.equal(result.phase, "preseason");
  assert.equal(result.currentProjection.scope.seasonId, scope.seasonId);
  assert.deepEqual(result.currentProjection.scope.clubs.map((club: { name: string }) => club.name).sort(), clubs.map(club => club.name).sort());
  assert.equal(h.count(), 2);
});

test("a confirmed club departure is excluded; an incomplete lookup is not treated as departure", async () => {
  const changed = clubs.map((club, index) => index ? club : { ...club, competition_id: id(999) });
  const h = harness([response(changed), response(changed)]);
  const result = await h.load();
  assert.equal(result.currentProjection.scope.clubs.length, 19);
  assert.equal(result.currentProjection.scope.clubs.some((club: { providerTeamId: string }) => club.providerTeamId === clubs[0]!.provider_team_id), false);
  assert.equal(await harness([response(clubs.slice(1), 19)]).load(), null);
});

for (const [name, invalid] of [
  ["missing row", response(clubs.slice(1))],
  ["truncated count", response(clubs, 21)],
  ["duplicate ID", response(clubs.map((club, index) => index ? club : { ...club, id: clubs[1]!.id }))],
  ["duplicate provider team", response(clubs.map((club, index) => index ? club : { ...club, provider_team_id: clubs[1]!.provider_team_id }))],
  ["wrong provider", response(clubs.map((club, index) => index ? club : { ...club, provider: "other" }))],
  ["unknown league", response(clubs.map((club, index) => index ? club : { ...club, competition_id: null }))],
  ["missing league evidence", response(clubs.map((club, index) => index ? club : { ...club, competition_id: undefined }))],
  ["database error", { data: null, error: { message: "private failure" }, count: null }],
] as const) test(`current coach membership fails closed: ${name}`, async () => {
  const h = harness([invalid]);
  assert.equal(await h.load(), null);
  assert.equal(h.count(), 1);
});

test("a transfer racing the two membership reads withdraws the whole derived view", async () => {
  const changed = clubs.map((club, index) => index ? club : { ...club, competition_id: id(999) });
  assert.equal(await harness([response(), response(changed)]).load(), null);
});

test("unknown current season cannot read clubs or infer preseason", async () => {
  const h = harness([]);
  assert.equal(await h.load(null), null);
  assert.equal(h.count(), 0);
});
