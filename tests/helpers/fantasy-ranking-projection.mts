import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { rankTouchlineFantasyManagers, type TouchlineFantasyPublicManagerRank } from "../../lib/touchlineFantasy/domain.ts";

// Execute the production reader and parsers, not a second ranking algorithm.
// The adapter below only provides a constrained in-memory relational read.
const source = stripTypeScriptTypes(readFileSync(new URL("../../lib/touchlineFantasy/server.ts", import.meta.url), "utf8"));
const helperStart = source.indexOf("function rows(");
const helperEnd = source.indexOf("function countryCode(", helperStart);
const readerStart = source.indexOf("async function loadRankings(");
const readerEnd = source.indexOf("async function loadCoaches(", readerStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart && readerStart >= 0 && readerEnd > readerStart);
const productionReader = runInNewContext(
  `${source.slice(helperStart, helperEnd)}\n${source.slice(readerStart, readerEnd)}\nloadRankings;`,
  { rankTouchlineFantasyManagers },
) as (admin: object, gameweek: string, season: string, viewer: string) => Promise<{
  gameweek: TouchlineFantasyPublicManagerRank[];
  season: TouchlineFantasyPublicManagerRank[];
}>;

export type RankingRow = Record<string, unknown>;
export type RankingTables = {
  touchline_fantasy_user_gameweeks: RankingRow[];
  touchline_fantasy_user_gameweek_scores: RankingRow[];
  users: RankingRow[];
};

export async function readProductionRankings(tables: RankingTables, gameweek: string, season: string, viewer: string) {
  const admin = {
    from(table: keyof RankingTables) {
      assert.ok(Object.hasOwn(tables, table), `Ranking must not consult card history: ${table}`);
      let data = tables[table];
      const chain = {
        select: () => chain,
        eq(key: string, value: unknown) {
          assert.equal(table, "touchline_fantasy_user_gameweeks");
          assert.equal(key, "touchline_fantasy_gameweeks.season_id");
          data = data.filter(row => row.season_id === value);
          return chain;
        },
        in(key: string, values: unknown[]) {
          assert.equal(key, table === "users" ? "id" : "user_gameweek_id");
          data = data.filter(row => values.includes(row[key]));
          return chain;
        },
        then(resolve: (value: { data: RankingRow[]; error: null }) => unknown) {
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
  return productionReader(admin, gameweek, season, viewer);
}
