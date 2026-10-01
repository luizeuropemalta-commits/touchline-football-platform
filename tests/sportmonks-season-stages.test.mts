import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
const root = new URL("../", import.meta.url);
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith("@/") ? new URL(`${specifier.slice(2)}.ts`,root).href : specifier, context); } });
const { normalizeSportmonksSeasonStages } = await import("../lib/football-data/sportmonks-season-stages.ts");
const { SportmonksFootballProvider } = await import("../lib/football-data/providers/sportmonks.ts");
const row = { id: 1, league_id: 8, season_id: 28083, type_id: 223 };
test("stage normalization requires exact scope and rejects duplicates/truncation", () => {
  assert.deepEqual(normalizeSportmonksSeasonStages({ data: [row] }, "8", "28083"), [{ id: "1", leagueId: "8", seasonId: "28083", typeId: "223" }]);
  for (const body of [{ data: [row,row] }, { data: [{ ...row, league_id: 9 }] }, { data: [{ ...row, season_id: null }] }, { data: [row], pagination: { has_more: true } }]) assert.equal(normalizeSportmonksSeasonStages(body,"8","28083"),null);
});
test("stage adapter performs one bounded request without pagination and keeps fetch time", async () => {
  const provider = new SportmonksFootballProvider(); let calls = 0;
  Object.assign(provider, { request: async (...args: unknown[]) => {
    calls++; assert.equal(args[0], "/stages/seasons/28083"); assert.deepEqual(args[1],{}); assert.equal(args[5],1);
    return { configured: true, cached: true, value: { ok: true, data: { data: [row] }, fetchedAt: "2026-09-01T00:00:00Z" } };
  } });
  const result = await provider.getSeasonStages({ leagueId: "8", seasonId: "28083", totalBudgetMs: 50 });
  assert.equal(calls,1); assert.ok(result.ok); assert.equal(result.fetchedAt,"2026-09-01T00:00:00Z");
});
test("stage adapter observes late rejection after bounded timeout", async () => {
  const provider = new SportmonksFootballProvider(); let reject!: (x: unknown) => void;
  Object.assign(provider, { request: () => new Promise((_resolve, no) => { reject=no; }) });
  assert.equal((await provider.getSeasonStages({ leagueId: "8", seasonId: "28083", totalBudgetMs: 1 })).ok,false);
  reject(new Error("private")); await new Promise(resolve => setImmediate(resolve));
});
