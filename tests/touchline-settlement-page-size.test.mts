import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

type Row = { id: string; football_player_id: string; rating: number | null; statistics_payload: { goals: number }; football_fixtures: { starts_at: string } };
function scenario(size: number, options: { legacy?: boolean; fault?: "late" | "drift" | "duplicate" | "cap"; table?: string; players?: number } = {}) {
  let source = readFileSync(new URL("../lib/touchlineArena/complete-catalogue-read-server.ts", import.meta.url), "utf8");
  if (options.legacy) {
    const expression = 'table === "touchline_player_fixture_score_settlements" ? 500 : PAGE_SIZE';
    assert.ok(source.includes(expression), "legacy comparison must replace the actual page-size expression");
    source = source.replace(expression, "PAGE_SIZE");
  }
  const code = stripTypeScriptTypes(source).replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
  const facade = runInNewContext(`${code}\ncreateCompleteTouchlineCatalogueAdmin;`, {});
  const playerIds = Array.from({ length: options.players ?? 1 }, (_, i) => String(i).padStart(4, "0"));
  const rows: Row[] = Array.from({ length: size }, (_, i) => ({ id: String(i).padStart(8, "0"), football_player_id: playerIds[i % playerIds.length], rating: i % 2 ? null : 0, statistics_payload: { goals: i }, football_fixtures: { starts_at: "2026-09-01T10:00:00Z" } }));
  const calls: Array<{ start: number; end: number; ids: number }> = [];
  let active = 0, peak = 0;
  const admin = { from() {
    let ids: string[] = [], start = 0, end = 0;
    const q = { select(_columns: string, config: { count: string }) { assert.equal(config.count, "exact"); return q; },
      in(_column: string, values: string[]) { ids = values; return q; }, order(column: string) { assert.equal(column, "id"); return q; },
      range(a: number, b: number) { start = a; end = b; return q; },
      then(resolve: (x: unknown) => unknown, reject: (e: unknown) => unknown) {
        calls.push({ start, end, ids: ids.length }); active++; peak = Math.max(peak, active);
        return new Promise<void>(done => setImmediate(done)).then(() => {
          active--;
          const filtered = rows.filter(row => ids.includes(row.football_player_id));
          if (options.fault === "late" && start > 0) return { data: null, count: null, error: { message: "private" } };
          const data = filtered.slice(start, options.fault === "cap" ? Math.min(end + 1, start + 200) : end + 1);
          if (options.fault === "duplicate" && start > 0) data[0] = filtered[0];
          return { data, count: filtered.length + (options.fault === "drift" && start > 0 ? 1 : 0), error: null };
        }).then(resolve, reject);
      } }; return q;
  } };
  const result = Promise.resolve(facade(admin).from(options.table ?? "touchline_player_fixture_score_settlements").select("id,football_player_id,rating,statistics_payload,football_fixtures!inner(starts_at)").in("football_player_id", playerIds));
  return { result, calls, peak: () => peak };
}

for (const size of [500, 501, 750, 1500]) test(`settlements ${size} retain complete DTO with exact 500-row ranges`, async () => {
  const current = scenario(size), legacy = scenario(size, { legacy: true });
  assert.deepEqual(JSON.parse(JSON.stringify(await current.result)), JSON.parse(JSON.stringify(await legacy.result)));
  assert.deepEqual(current.calls.map(({ start, end }) => [start, end]), Array.from({ length: Math.ceil(size / 500) }, (_, i) => [i * 500, i * 500 + 499]));
  assert.deepEqual(legacy.calls.map(({ start, end }) => [start, end]), Array.from({ length: Math.ceil(size / 150) }, (_, i) => [i * 150, i * 150 + 149]));
});
for (const [fault, error] of [["late", "READ_FAILED"], ["drift", "COUNT_CHANGED"], ["duplicate", "DUPLICATE_ROW"], ["cap", "INCOMPLETE_READ"]] as const) test(`settlement ${fault} fails closed`, async () => {
  await assert.rejects(scenario(750, { fault }).result, new RegExp(error));
});
test("IN partition150 and pool2 remain separate from page size; other tables retain150", async () => {
  const current = scenario(1500, { players: 301 }), legacy = scenario(1500, { players: 301, legacy: true });
  assert.deepEqual(JSON.parse(JSON.stringify(await current.result)), JSON.parse(JSON.stringify(await legacy.result)));
  assert.ok(current.calls.every(call => call.ids <= 150)); assert.equal(current.peak(), 2);
  const other = scenario(501, { table: "football_players" }); await other.result;
  assert.deepEqual(other.calls.map(({ start, end }) => [start, end]), [[0,149],[150,299],[300,449],[450,599]]);
});
