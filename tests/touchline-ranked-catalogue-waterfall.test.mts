import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";
import { projectTouchlineCardStatsByPosition } from "../lib/touchlineArena/position-aware-card-stats.ts";

const code = (file: string) => stripTypeScriptTypes(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
const playerId = "00000000-0000-4000-8000-000000000001";
const state = { phase: "ranked", scoringVersion: "player_scoring_v3", seasonId: "season", snapshotId: "snapshot", publishedAt: "2026-09-01", players: [{ playerId, totalRating: 0 }] };

function scenario(clubFailure = false) {
  const reads: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const tables: Record<string, object[]> = {
    football_players: [{ id: playerId, display_name: "Synthetic keeper", current_club_id: "club", position: "Goalkeeper" }],
    football_squad_members: [{ id: "membership", player_id: playerId, position: "Goalkeeper", jersey_number: 1 }],
    touchline_player_fixture_score_settlements: [],
    football_clubs: [{ id: "club", name: "Synthetic club" }],
  };
  const admin = { from(table: string) {
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, range() { return query; },
      then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        reads.push(table);
        return Promise.resolve({ data: tables[table], count: tables[table].length, error: table === "football_clubs" && clubFailure ? { message: "synthetic failure" } : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const complete = runInNewContext(`${code("lib/touchlineArena/complete-catalogue-read-server.ts")}\ncreateCompleteTouchlineCatalogueAdmin;`, {});
  const load = runInNewContext(`${code("lib/touchlineArena/ranked-card-catalog-server.ts")}\nloadTouchLineRankedCardCatalog;`, {
    createCompleteTouchlineCatalogueAdmin: complete,
    loadCompleteTouchlineCataloguePresentations: async () => { await pending; return new Map([[playerId, { tierKey: "elite", marketValueEur: 1_000_000 }]]); },
    readPublicSeasonPlayerPoints: async () => [{ canonicalPlayerId: playerId, totalRating: 0, touchlinePoints: null, statistics: {} }],
    applyTouchlineSeasonPoints, projectTouchlineCardStatsByPosition,
    inferArenaRole: () => "goalkeeper", makeArenaShortName: (name: string) => name,
    normalizeOfficialShirtNumber: (number: unknown) => number,
    formatTouchlineMarketValueEur: () => "€1M", touchlineCountryCode3FromName: () => "N/A",
    normalizeTouchlineCountryCode3: () => "N/A", hasTouchlineCountryFlag: () => false,
  }) as (state: unknown, admin: unknown) => Promise<Array<{ clubName: string; id: string; seasonTotalRating: number }>>;
  return { reads, release, result: load(state, admin) };
}

test("ranking reads clubs before slow publication finishes, retaining the complete card and confirmed zero", async () => {
  const run = scenario();
  let complete = false;
  void run.result.then(() => { complete = true; });
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.ok(run.reads.includes("football_clubs"), "club lookup must not wait for unrelated publication IO");
    assert.equal(complete, false, "publication remains mandatory before returning any card");
  } finally { run.release(); }
  const cards = await run.result;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, playerId);
  assert.equal(cards[0].clubName, "Synthetic club");
  assert.equal(cards[0].seasonTotalRating, 0);
});

test("ranking still rejects a failed complete club read", async () => {
  const run = scenario(true);
  const rejected = assert.rejects(run.result, /TL_CATALOGUE_READ_FAILED:football_clubs/);
  run.release();
  await rejected;
});
