import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const code = (path: string) => stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
const facade = runInNewContext(`${code("../lib/touchlineArena/complete-catalogue-read-server.ts")}\ncreateCompleteTouchlineCatalogueAdmin;`,
  { console: { error() {}, warn() {} } });
const rosterSource = code("../lib/touchlineArena/authoritative-roster-server.ts")
  .replace('import("./complete-catalogue-read-server.ts")', 'Promise.resolve(completeReaderModule)');
const readStatistics = runInNewContext(`${rosterSource}\nreadRosterFixtureStatistics;`,
  { completeReaderModule: { createCompleteTouchlineCatalogueAdmin: facade } });

type Row = Record<string, unknown>;
function scenario(fault?: "second-page-error" | "count-changed" | "truncated") {
  // 35 contracted players with 38 settlements each: a normal complete season.
  const playerIds = Array.from({ length: 35 }, (_, i) => `player-${i}`);
  const rows: Row[] = playerIds.flatMap((football_player_id, player) =>
    Array.from({ length: 38 }, (_, round) => ({
      id: String(player * 38 + round).padStart(8, "0"), football_player_id,
      season_id: "current-season", scoring_version: "player_scoring_v4",
      rating: round === 37 ? 8.4 : 6.2,
      football_fixtures: { starts_at: new Date(Date.UTC(2026, 0, 1 + round * 7)).toISOString() },
    })));
  rows.push({ ...rows[0], id: "other-season", season_id: "old-season" },
    { ...rows[0], id: "other-version", scoring_version: "player_scoring_v3" },
    { ...rows[0], id: "other-owner-player", football_player_id: "not-contracted" });
  const reads: number[] = [];
  const admin = { from(table: string) {
    assert.equal(table, "touchline_player_fixture_score_settlements");
    let filtered = [...rows];
    let offset = 0; let end = 999;
    const query = {
      select(columns: string, options: { count: string }) {
        assert.ok(columns.endsWith(",id")); assert.equal(options.count, "exact"); return query;
      },
      eq(key: string, value: unknown) { filtered = filtered.filter(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filtered = filtered.filter(row => values.includes(row[key])); return query; },
      order(key: string, options: { ascending: boolean }) {
        assert.equal(key, "id"); assert.equal(options.ascending, true);
        filtered.sort((a, b) => String(a.id).localeCompare(String(b.id))); return query;
      },
      range(start: number, stop: number) { offset = start; end = stop; return query; },
      then(resolve: (value: unknown) => unknown) {
        reads.push(offset);
        const failed = offset > 0 && fault === "second-page-error";
        const data = failed ? null : filtered.slice(offset, Math.min(end + 1, offset + (fault === "truncated" ? 73 : 1000)));
        return Promise.resolve({ data, count: filtered.length + (offset > 0 && fault === "count-changed" ? 1 : 0),
          error: failed ? { message: "private-database-error" } : null }).then(resolve);
      },
    };
    return query;
  } };
  return { run: () => readStatistics(admin, "current-season", playerIds), reads };
}

test("authoritative roster reads every settlement beyond the API cap using the shared complete reader", async () => {
  const s = scenario(); const result = await s.run();
  assert.equal(result.error, null);
  assert.equal(result.data.length, 35 * 38);
  assert.deepEqual(s.reads, [0, 500, 1000]);
  assert.equal(result.data.filter((row: Row) => row.rating === 8.4).length, 35);
  assert.ok(result.data.every((row: Row) => row.season_id === "current-season" && row.scoring_version === "player_scoring_v4"));
  assert.match(rosterSource, /readRosterFixtureStatistics\(admin, currentSeasonId, playerIds\)/);
});

for (const fault of ["second-page-error", "count-changed", "truncated"] as const) {
  test(`roster settlement ${fault} never returns a partial history or private details`, async () => {
    const result = await scenario(fault).run();
    assert.equal(result.data, null);
    assert.equal(result.error.message, "TL_ROSTER_DATA_INCOMPLETE");
    assert.doesNotMatch(JSON.stringify(result), /private-database/);
  });
}
