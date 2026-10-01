import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createCatalogueLoadDiagnostics } from "../lib/touchlineArena/ranking-load-diagnostics.ts";
import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";
import { projectTouchlineCardStatsByPosition } from "../lib/touchlineArena/position-aware-card-stats.ts";

const code = (file: string) => stripTypeScriptTypes(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
const playerId = "00000000-0000-4000-8000-000000000001";
const state = { phase: "ranked", scoringVersion: "player_scoring_v4", seasonId: "season", snapshotId: "snapshot", publishedAt: "2026-09-01", players: [{ playerId, totalRating: 0 }] };

function scenario(clubFailure = false, showcase = false, unpublished = false, holdClubs = false, diagnosticsEnabled = false) {
  const reads: string[] = [];
  const summaries: unknown[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let releaseClubs!: () => void;
  const clubsPending = new Promise<void>(resolve => { releaseClubs = resolve; });
  const tables: Record<string, object[]> = {
    touchline_card_publications: [{ player_id: playerId }],
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
        return (table === "football_clubs" && holdClubs ? clubsPending : Promise.resolve()).then(() => ({ data: tables[table], count: tables[table].length, error: table === "football_clubs" && clubFailure ? { message: "synthetic failure" } : null })).then(resolve, reject);
      },
    };
    return query;
  } };
  const complete = runInNewContext(`${code("lib/touchlineArena/complete-catalogue-read-server.ts")}\ncreateCompleteTouchlineCatalogueAdmin;`, {});
  const load = runInNewContext(`${code("lib/touchlineArena/ranked-card-catalog-server.ts")}\n${showcase ? "loadTouchlinePublishedCardShowcaseCatalog" : "loadTouchLineRankedCardCatalog"};`, {
    createCatalogueLoadDiagnostics: () => createCatalogueLoadDiagnostics(diagnosticsEnabled ? {
      TOUCHLINE_QA_RANKING_TIMINGS: "true", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa",
      NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
    } : {}, () => 1, summary => summaries.push(summary)),
    createCompleteTouchlineCatalogueAdmin: complete,
    loadCompleteTouchlineCataloguePresentations: async () => { await pending; return new Map(unpublished ? [] : [[playerId, { tierKey: "elite", marketValueEur: 1_000_000 }]]); },
    readPublicSeasonPlayerPoints: async () => [{ canonicalPlayerId: playerId, totalRating: 0, touchlinePoints: null, statistics: {} }],
    applyTouchlineSeasonPoints, projectTouchlineCardStatsByPosition,
    inferArenaRole: () => "goalkeeper", makeArenaShortName: (name: string) => name,
    normalizeOfficialShirtNumber: (number: unknown) => number,
    formatTouchlineMarketValueEur: () => "€1M", touchlineCountryCode3FromName: () => "N/A",
    normalizeTouchlineCountryCode3: () => "N/A", hasTouchlineCountryFlag: () => false,
  }) as (...args: unknown[]) => Promise<Array<{ clubName: string; id: string; seasonTotalRating: number }>>;
  return { reads, summaries, release, releaseClubs, result: showcase ? load(admin) : load(state, admin) };
}

test("real catalogue diagnostic binding consumes each lazy query once enabled or disabled", async () => {
  const disabled = scenario(false, false, false, false, false);
  const enabled = scenario(false, false, false, false, true);
  disabled.release(); enabled.release();
  assert.deepEqual(JSON.parse(JSON.stringify(await enabled.result)), JSON.parse(JSON.stringify(await disabled.result)));
  for (const run of [disabled, enabled]) {
    assert.deepEqual(run.reads.slice().sort(), ["football_clubs", "football_players", "football_squad_members", "touchline_player_fixture_score_settlements"]);
  }
  assert.deepEqual(enabled.reads, disabled.reads, "query start order remains identical");
  assert.equal(disabled.summaries.length, 0);
  assert.equal(enabled.summaries.length, 1);
});

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

test("ClubHub reads clubs while publication is pending but returns only the complete published card", async () => {
  const run = scenario(false, true);
  let complete = false;
  void run.result.then(() => { complete = true; });
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.ok(run.reads.includes("football_clubs"), "ClubHub identity read must not wait for unrelated publication IO");
    assert.equal(complete, false, "publication must still finish before returning any card");
  } finally { run.release(); }
  const cards = await run.result;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, playerId);
  assert.equal(cards[0].clubName, "Synthetic club");
  assert.equal(cards[0].seasonTotalRating, 0);
});

test("ClubHub still rejects a failed complete club read", async () => {
  const run = scenario(true, true);
  const rejected = assert.rejects(run.result, /TL_CATALOGUE_READ_FAILED:football_clubs/);
  run.release();
  await rejected;
});

test("ClubHub preserves an empty publication result even if the early club lookup fails", async () => {
  const run = scenario(true, true, true);
  run.release();
  assert.equal((await run.result).length, 0);
});

test("ClubHub does not wait for clubs after every presentation is excluded", async () => {
  const run = scenario(false, true, true, true);
  let complete = false;
  const result = run.result.then(cards => { complete = true; return cards; });
  run.release();
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(complete, true, "an empty presentation set must not wait for unused clubs"); }
  finally { run.releaseClubs(); }
  assert.equal((await result).length, 0);
});
