import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { parseTouchlinePublishedTopEleven } from "../lib/touchlineArena/published-top-eleven.ts";
import { TOUCHLINE_SELECTION_SLOTS } from "../lib/touchlineArena/touchline-selection.ts";

const source = readFileSync(new URL("../lib/touchlineArena/card-ranking-server.ts", import.meta.url), "utf8");
const loader = stripTypeScriptTypes(source.slice(source.indexOf("export async function loadTouchLinePublishedTopEleven"))).replace("export async function", "async function");
const ranking = { phase: "ranked", snapshotId: "publication-A", seasonId: "season-1", scoringVersion: "player_scoring_v3" };
const record = {
  snapshot_id: "publication-A", season_id: "season-1", scoring_version: "player_scoring_v3",
  coverage_status: "complete_for_scoring", actual_player_count: 11, expected_player_count: 11,
  status: "published", source: "sportmonks-audited", round_id: "round-5", published_at: "2026-09-24T02:45:00Z",
  selection_payload: { sourceSnapshotId: "publication-A", complete: true, formation: "4-3-3",
    players: TOUCHLINE_SELECTION_SLOTS.map((slot, i) => ({ ...slot, player: { playerId: `player-${i}` } })) },
};

function harness(value: typeof record | null = record, error: object | null = null, adminAvailable = true) {
  const filters: Record<string, unknown> = {};
  const tables: string[] = [];
  const query = { select() { return this; }, eq(key: string, value: unknown) { filters[key] = value; return this; },
    async maybeSingle() { return { data: value, error }; } };
  const load = runInNewContext(`${loader}; loadTouchLinePublishedTopEleven`, {
    createAdminClient: () => adminAvailable ? { from(table: string) { tables.push(table); return query; } } : null,
    TOUCHLINE_ENGLAND_LEAGUE_KEY: "touchline-england", parseTouchlinePublishedTopEleven,
  });
  return { load, filters, tables };
}

test("selection stays on publication A even if the active pointer has advanced to B", async () => {
  const { load, filters, tables } = harness();
  const selected = await load(ranking);
  assert.equal(selected?.snapshotId, "publication-A");
  assert.deepEqual(tables, ["touchline_card_ranking_snapshots"]);
  assert.equal(filters.snapshot_id, "publication-A");
  assert.equal(filters.season_id, "season-1");
});

test("selection rejects another snapshot, season, scoring version, or incomplete publication", async () => {
  for (const override of [
    { snapshot_id: "publication-B" }, { season_id: "season-2" }, { scoring_version: "player_scoring_v2" },
    { coverage_status: "partial" }, { actual_player_count: 10 }, { status: "draft" }, { source: "manual" },
  ]) assert.equal(await harness({ ...record, ...override }).load(ranking), null);
  assert.equal(await harness(record, { message: "unavailable" }).load(ranking), null);
  assert.equal(await harness(null).load(ranking), null);
  assert.equal(await harness(record, null, false).load(ranking), null);
});

test("preseason does not fetch a separately active selection", async () => {
  const { load, tables } = harness();
  assert.equal(await load({ ...ranking, phase: "preseason", snapshotId: null }), null);
  assert.deepEqual(tables, []);
});

test("page passes the same ranking to the selection and card catalogue", () => {
  const page = readFileSync(new URL("../app/touchline-tables/page.tsx", import.meta.url), "utf8");
  assert.match(page, /loadTouchLinePublishedTopEleven\(activeRanking\)/);
  assert.match(page, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.match(page, /TouchlineCardLeadershipProvider value=\{buildTouchlineCardLeadershipValue\(activeRanking, coachRanking\)\}/);
});

test("player profile and player ranking pin crown authority to their displayed ranking", () => {
  for (const file of ["app/touchline-players/[player]/page.tsx", "app/touchline-player-card-rankings/page.tsx"]) {
    const page = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(page, /TouchlineCardLeadershipProvider value=\{buildTouchlineCardLeadershipValue\(activeRanking, null\)\}/);
    assert.match(page, /initialPlayerRankingSnapshotId=\{activeRanking.snapshotId\}/);
  }
});
