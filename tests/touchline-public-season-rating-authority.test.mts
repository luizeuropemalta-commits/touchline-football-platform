import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { projectTouchlineCardStatsByPosition } from "../lib/touchlineArena/position-aware-card-stats.ts";

const PLAYER_ID = "123e4567-e89b-42d3-a456-426614174001";
const COMPETITION_ID = "123e4567-e89b-42d3-a456-426614174002";
const SEASON_ID = "123e4567-e89b-42d3-a456-426614174003";
const OTHER_SEASON_ID = "123e4567-e89b-42d3-a456-426614174004";
const source = readFileSync(new URL("../lib/touchlineArena/public-season-player-points-server.ts", import.meta.url), "utf8");
// Execute the actual reader; only its external database/ranking dependencies
// are replaced. The position-stat projection is the real implementation.
const readerCode = stripTypeScriptTypes(source)
  .replace(/^import[^\n]*;\s*$/gm, "")
  .replace("export async function readPublicSeasonPlayerPoints", "async function readPublicSeasonPlayerPoints");

type Input = {
  publishedRating?: number | null;
  publishedPlayerPresent?: boolean;
  publishedSeasonId?: string | null;
  scoringVersion?: string;
  phase?: string;
  currentSeasonIds?: string[];
  aggregatePresent?: boolean;
  statsError?: boolean;
  competitionError?: boolean;
  uppercaseRankingId?: boolean;
};
type Projection = { canonicalPlayerId: string; totalRating: number | null; statistics: Record<string, number> };

function reader(input: Input = {}) {
  const reads: Array<{ table: string; column: string; value: unknown }> = [];
  let activeRankingReads = 0;
  const admin = {
    from(table: string) {
      const responses: Record<string, { data: unknown; error: unknown }> = {
        football_competitions: { data: input.competitionError ? null : { id: COMPETITION_ID }, error: input.competitionError ? new Error("unavailable") : null },
        football_seasons: { data: (input.currentSeasonIds ?? [SEASON_ID]).map((id) => ({ id })), error: null },
        football_player_season_statistics: {
          data: input.aggregatePresent === false ? [] : [{ football_player_id: PLAYER_ID, summary_payload: { totalRating: 27.79, goals: 2, assists: 1 }, position_statistics_payload: {} }],
          error: input.statsError ? new Error("unavailable") : null,
        },
        football_players: { data: [{ id: PLAYER_ID, position: "ST" }], error: null },
      };
      assert.ok(table in responses, `unexpected database boundary: ${table}`);
      const response = responses[table]!;
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { reads.push({ table, column, value }); return query; },
        in() { return query; },
        maybeSingle() { return Promise.resolve(response); },
        then(resolve: (result: typeof response) => unknown) { return Promise.resolve(response).then(resolve); },
      };
      return query;
    },
  };
  const read = runInNewContext(`${readerCode}\nreadPublicSeasonPlayerPoints;`, {
    createAdminClient: () => admin,
    loadTouchLineActiveRanking: async () => {
      activeRankingReads++;
      return {
      phase: input.phase ?? "ranked",
      scoringVersion: input.scoringVersion ?? "player_scoring_v3",
      seasonId: input.publishedSeasonId === undefined ? SEASON_ID : input.publishedSeasonId,
      players: input.publishedPlayerPresent === false ? [] : [{ playerId: input.uppercaseRankingId ? PLAYER_ID.toUpperCase() : PLAYER_ID, totalRating: input.publishedRating === undefined ? 20.43 : input.publishedRating }],
      };
    },
    projectTouchlineCardStatsByPosition,
  }, { timeout: 1000 }) as (ids: string[], options?: { competitionId?: string; seasonId?: string; publishedRankingState?: unknown }) => Promise<Projection[]>;
  return { read, reads, activeRankingReads: () => activeRankingReads };
}

test("public cards use the published rating even when the aggregate is newer", async () => {
  const { read } = reader();
  const rows = await read([PLAYER_ID]);
  assert.equal(rows[0]?.totalRating, 20.43);
  assert.equal(rows[0]?.statistics.goals, 2);
  assert.equal(rows[0]?.statistics.assists, 1);
});

test("UUID case cannot hide a confirmed rating or create duplicate players", async () => {
  const rows = await reader({ uppercaseRankingId: true }).read([PLAYER_ID, PLAYER_ID.toUpperCase()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.canonicalPlayerId, PLAYER_ID);
  assert.equal(rows[0]?.totalRating, 20.43);
});

test("public cards preserve published zero, null and absence without an aggregate fallback", async () => {
  for (const [input, expected] of [
    [{ publishedRating: 0 }, 0],
    [{ publishedRating: null }, null],
    [{ publishedPlayerPresent: false }, null],
    [{ phase: "preseason" }, null],
    [{ scoringVersion: "player_scoring_v2" }, null],
  ] as const) {
    const { read } = reader(input);
    const rows = await read([PLAYER_ID]);
    assert.equal(rows[0]?.totalRating, expected, JSON.stringify(input));
    assert.equal(rows[0]?.statistics.goals, 2);
  }
});

test("public cards retain a same-season publication when supplementary stats are absent or unavailable", async () => {
  for (const input of [{ aggregatePresent: false }, { statsError: true }]) {
    const { read } = reader(input);
    const rows = await read([PLAYER_ID]);
    assert.equal(rows[0]?.totalRating, 20.43);
    assert.equal(Object.keys(rows[0]!.statistics).length, 0);
  }
});

test("public cards do not apply a publication from another or unknown current season", async () => {
  for (const publishedSeasonId of [OTHER_SEASON_ID, null]) {
    const { read } = reader({ publishedSeasonId });
    const rows = await read([PLAYER_ID]);
    assert.equal(rows[0]?.totalRating, null);
    assert.equal(rows[0]?.statistics.goals, 2);
  }
  for (const input of [{ currentSeasonIds: [] }, { currentSeasonIds: [SEASON_ID, OTHER_SEASON_ID] }, { competitionError: true }]) {
    const rows = await reader(input).read([PLAYER_ID]);
    assert.equal(rows[0]?.totalRating, 20.43, "a valid publication survives a temporarily unavailable current-season marker");
    assert.equal(Object.keys(rows[0]!.statistics).length, 0);
  }
});

test("fixture-scoped public cards use only the publication for that requested season", async () => {
  const mismatched = reader();
  const rows = await mismatched.read([PLAYER_ID], { competitionId: COMPETITION_ID, seasonId: OTHER_SEASON_ID });
  assert.equal(rows[0]?.totalRating, null);
  assert.equal(rows[0]?.statistics.goals, 2);
  assert.ok(mismatched.reads.some((entry) => entry.table === "football_player_season_statistics" && entry.column === "season_id" && entry.value === OTHER_SEASON_ID));

  const matching = reader({ publishedSeasonId: OTHER_SEASON_ID });
  assert.equal((await matching.read([PLAYER_ID], { competitionId: COMPETITION_ID, seasonId: OTHER_SEASON_ID }))[0]?.totalRating, 20.43);
  assert.equal((await matching.read([PLAYER_ID], { seasonId: "invalid" })).length, 0);
});

test("an injected published snapshot survives an active-snapshot rollover without a second read", async () => {
  const injected = {
    phase: "ranked" as const,
    scoringVersion: "player_scoring_v3" as const,
    seasonId: SEASON_ID,
    players: [{ playerId: PLAYER_ID, totalRating: 0 }],
  };
  const fixture = reader({ publishedSeasonId: OTHER_SEASON_ID, publishedRating: 99 });
  const rows = await fixture.read([PLAYER_ID], {
    seasonId: SEASON_ID,
    publishedRankingState: injected,
  });
  assert.equal(rows[0]?.totalRating, 0);
  assert.equal(fixture.activeRankingReads(), 0);
  assert.ok(fixture.reads.some((entry) => entry.table === "football_player_season_statistics" && entry.column === "season_id" && entry.value === SEASON_ID));
});
