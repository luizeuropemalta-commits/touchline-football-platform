import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { rankTouchlineFantasyManagers, type TouchlineFantasyPublicManagerRank } from "../../lib/touchlineFantasy/domain.ts";
import * as standings from "../../lib/touchlineArena/club-owner-standings.ts";

// Execute both production readers and the shared projector, never a second
// ranking algorithm. The adapter only supplies relational joins and filters.
const standingsExports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../../lib/touchlineArena/club-owner-standings-server.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: standingsExports, require: (name: string) => {
  if (name === "server-only") return {};
  // Rating/ledger fixtures deliberately exercise the photo-disabled runtime.
  // The production ranking reader and projector remain real; no Storage or
  // photo-authority network dependency belongs in this SQL scoring harness.
  if (name === "./clubowner-public-avatar-server") return { publicOwnerAvatarService: () => ({ enabled: false }) };
  if (name.includes("supabase")) return { createAdminClient: () => assert.fail("Use the supplied, authenticated read client") };
  assert.equal(name, "./club-owner-standings");
  return standings;
} });
const source = stripTypeScriptTypes(readFileSync(new URL("../../lib/touchlineFantasy/server.ts", import.meta.url), "utf8"));
const helperStart = source.indexOf("function rows(");
const helperEnd = source.indexOf("function countryCode(", helperStart);
const readerStart = source.indexOf("async function loadRankings(");
const readerEnd = source.indexOf("async function loadCoaches(", readerStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart && readerStart >= 0 && readerEnd > readerStart);
const productionReader = runInNewContext(
  `${source.slice(helperStart, helperEnd)}\n${source.slice(readerStart, readerEnd)}\nloadRankings;`,
  { rankTouchlineFantasyManagers, readClubOwnerStandingViewsForSeason: standingsExports.readClubOwnerStandingViewsForSeason },
) as (admin: object, gameweek: string | null, season: string, viewer: string) => Promise<{
  gameweek: TouchlineFantasyPublicManagerRank[];
  season: TouchlineFantasyPublicManagerRank[];
}>;

export type RankingRow = Record<string, unknown>;
export type RankingTables = {
  touchline_fantasy_user_gameweeks: RankingRow[];
  touchline_fantasy_user_gameweek_scores: RankingRow[];
  users: RankingRow[];
  touchline_club_collections?: RankingRow[];
};

export async function readProductionRankings(tables: RankingTables, gameweek: string | null, season: string, viewer: string,
  options: { postgrestLimit?: number; roundPageFault?: "truncated" | "count-drift" | "error" | "duplicate" } = {}) {
  const admin = {
    from(table: keyof RankingTables) {
      assert.ok(Object.hasOwn(tables, table) || table === "touchline_club_collections", `Ranking must not consult card history: ${table}`);
      let data = tables[table] ?? [];
      const filters = new Map<string, unknown>();
      const chain = {
        select(columns: string) {
          if (table === "touchline_fantasy_user_gameweeks" && columns.includes("users(full_name)")) {
            data = data.map(row => ({ ...row,
              users: tables.users.find(user => user.id === row.user_id) ?? null,
              touchline_fantasy_user_gameweek_scores: tables.touchline_fantasy_user_gameweek_scores.filter(score => score.user_gameweek_id === row.id),
            }));
          }
          return chain;
        },
        eq(key: string, value: unknown) {
          assert.ok(table === "touchline_fantasy_user_gameweeks" || table === "touchline_club_collections");
          assert.ok(key === (table === "touchline_club_collections" ? "season_id" : "touchline_fantasy_gameweeks.season_id")
            || (table === "touchline_fantasy_user_gameweeks" && key === "gameweek_id"));
          filters.set(key, value);
          data = data.filter(row => row[key === "gameweek_id" ? "gameweek_id" : "season_id"] === value);
          return chain;
        },
        in(key: string, values: unknown[]) {
          const expectedKey = table === "users" ? "id"
            : table === "touchline_fantasy_user_gameweeks" ? "market_plan_key_snapshot"
              : "user_gameweek_id";
          assert.equal(key, expectedKey);
          data = data.filter(row => values.includes(row[key]));
          return chain;
        },
        order(key: string) {
          assert.equal(key, table === "touchline_club_collections" ? "user_id" : "id");
          data = [...data].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
          return chain;
        },
        range(start: number, end: number) {
          const fault = filters.has("gameweek_id") && start > 0 ? options.roundPageFault : undefined;
          const page = data.slice(fault === "duplicate" ? 0 : start, fault === "duplicate" ? end - start + 1 : end + 1);
          return Promise.resolve({data: page.slice(0, fault === "truncated" ? 1 : options.postgrestLimit ?? 1000),
            count: data.length + (fault === "count-drift" ? 1 : 0), error: fault === "error" ? {code:"08006"} : null});
        },
        then(resolve: (value: { data: RankingRow[]; error: null }) => unknown) {
          return Promise.resolve({ data: data.slice(0, options.postgrestLimit ?? 1000), error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
  return productionReader(admin, gameweek, season, viewer);
}
