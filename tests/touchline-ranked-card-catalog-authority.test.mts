import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";
import { projectTouchlineCardStatsByPosition } from "../lib/touchlineArena/position-aware-card-stats.ts";

const SEASON = "00000000-0000-4000-8000-000000000001";
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const presentation = { tierKey: "elite", marketValueEur: 1_000_000, marketValueState: "verified" };

async function publishedPresentationChunk({ playerIds }: { playerIds: string[] }) {
  if (playerIds.length > 150) throw new Error("publication reader must receive complete-reader chunks");
  return new Map(playerIds.map((playerId) => [playerId, presentation]));
}

const source = stripTypeScriptTypes(
  readFileSync(new URL("../lib/touchlineArena/ranked-card-catalog-server.ts", import.meta.url), "utf8"),
)
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "")
  .replace(/^export /gm, "");
const completeReaderSource = stripTypeScriptTypes(
  readFileSync(new URL("../lib/touchlineArena/complete-catalogue-read-server.ts", import.meta.url), "utf8"),
)
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "")
  .replace(/^export /gm, "");
const completeReader = runInNewContext(
  `${completeReaderSource}\n({ createCompleteTouchlineCatalogueAdmin, loadCompleteTouchlineCataloguePresentations });`,
  {
    isTouchlineProvisionalColumnsUnavailable: () => false,
    loadTouchlinePublishedCardPresentations: publishedPresentationChunk,
    console: { warn() {} },
  },
) as {
  createCompleteTouchlineCatalogueAdmin: <T>(admin: T) => T;
  loadCompleteTouchlineCataloguePresentations: (playerIds: string[], admin: unknown) => Promise<Map<string, unknown>>;
};
const { createCompleteTouchlineCatalogueAdmin } = completeReader;

type Scenario = {
  count: number;
  publishedRating: number | null;
  snapshotRating: number | null;
  seasonProjection?: "complete" | "empty";
  assertSnapshotAuthority?: boolean;
};

function loadRankedCatalogue({
  count,
  publishedRating,
  snapshotRating,
  seasonProjection = "complete",
  assertSnapshotAuthority = false,
}: Scenario) {
  const playerIds = Array.from({ length: count }, (_, index) => id(index + 1));
  const rows: Record<string, Array<Record<string, unknown>>> = {
    football_players: playerIds.map((playerId, index) => ({
      id: playerId,
      provider_player_id: String(index + 1),
      display_name: `Player ${index + 1}`,
      current_club_id: "club",
      position: "Goalkeeper",
    })),
    football_squad_members: playerIds.map((player_id, index) => ({
      id: `member-${index}`,
      player_id,
      club_id: "club",
      jersey_number: 1,
      position: "Goalkeeper",
      status: "active",
      source_updated_at: "2026-09-01T00:00:00Z",
    })),
    football_player_season_statistics: [],
    touchline_player_fixture_score_settlements: [],
    football_clubs: [{ id: "club", name: "Club" }],
  };
  rows.touchline_player_fixture_score_settlements = playerIds.map((football_player_id, index) => ({
    id: `settlement-${index}`,
    football_player_id,
    season_id: SEASON,
    scoring_version: "player_scoring_v3",
    rating: 7.5,
    statistics_payload: {},
    football_fixtures: { starts_at: "2026-09-01T12:00:00Z" },
  }));
  const admin = {
    from(table: string) {
      let data = [...(rows[table] ?? [])];
      let countRequested = false;
      let start = 0;
      let end = Number.POSITIVE_INFINITY;
      const query = {
        select(_columns?: string, options?: { count?: string }) { countRequested = options?.count === "exact"; return query; },
        eq(key: string, value: unknown) { data = data.filter((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { data = data.filter((row) => values.includes(row[key])); return query; },
        order() { return query; },
        range(from: number, to: number) { start = from; end = to; return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: data.slice(start, end + 1), count: countRequested ? data.length : null, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const execute = runInNewContext(`${source}\nloadTouchLineRankedCardCatalog;`, {
    createAdminClient: () => admin,
    createCompleteTouchlineCatalogueAdmin,
    loadCompleteTouchlineCataloguePresentations: completeReader.loadCompleteTouchlineCataloguePresentations,
    // This reproduces the legacy public-reader hard limit the regression fixes.
    loadTouchlinePublishedCardPresentations: publishedPresentationChunk,
    readPublicSeasonPlayerPoints: async (ids: string[], options: { seasonId?: string; publishedRankingState?: unknown }) => {
      if (assertSnapshotAuthority) {
        assert.equal(options.seasonId, SEASON);
        assert.equal(options.publishedRankingState, state);
      }
      return seasonProjection === "empty" ? [] : ids.map((canonicalPlayerId) => ({
        canonicalPlayerId,
        touchlinePoints: null,
        totalRating: publishedRating,
        statistics: {},
      }));
    },
    applyTouchlineSeasonPoints,
    inferArenaRole: () => "goalkeeper",
    makeArenaShortName: (value: string) => value,
    normalizeOfficialShirtNumber: (value: unknown) => value,
    formatTouchlineMarketValueEur: () => "€1M",
    touchlineCountryCode3FromName: () => "N/A",
    normalizeTouchlineCountryCode3: () => "N/A",
    hasTouchlineCountryFlag: () => false,
    projectTouchlineCardStatsByPosition,
  }) as (state: unknown, admin: unknown) => Promise<Array<{
    canonicalPlayerId?: string;
    seasonTotalRating?: number | null;
    publishedRanking?: { totalRating: number | null };
  }>>;
  const state = {
    phase: "ranked",
    scoringVersion: "player_scoring_v3",
    seasonId: SEASON,
    snapshotId: "player-rating:test",
    publishedAt: "2026-09-01T12:00:00Z",
    players: playerIds.map((playerId, index) => ({
      playerId,
      providerPlayerId: String(index + 1),
      totalRating: snapshotRating,
    })),
  };
  return execute(state, admin);
}

test("ranked cards keep every published player beyond the legacy 750-ID reader cap", async () => {
  const cards = await loadRankedCatalogue({ count: 1203, publishedRating: 13.2, snapshotRating: 13.2, assertSnapshotAuthority: true });
  assert.equal(cards.length, 1203);
  assert.equal(new Set(cards.map((card) => card.canonicalPlayerId)).size, 1203);
  assert.ok(cards.every((card) => card.seasonTotalRating === 13.2));
  assert.ok(cards.every((card) => card.publishedRanking?.totalRating === 13.2));
});

test("ranked cards use the shared season authority instead of a stale snapshot total", async () => {
  const cards = await loadRankedCatalogue({ count: 3, publishedRating: null, snapshotRating: 99 });
  assert.equal(cards.length, 3);
  assert.ok(cards.every((card) => card.seasonTotalRating === null));
  assert.ok(cards.every((card) => card.publishedRanking === undefined));
});

test("ranked cards preserve a confirmed zero from their published snapshot", async () => {
  const cards = await loadRankedCatalogue({ count: 3, publishedRating: 0, snapshotRating: 0 });
  assert.ok(cards.every((card) => card.seasonTotalRating === 0));
  assert.ok(cards.every((card) => card.publishedRanking?.totalRating === 0));
});

test("ranked cards fail closed when the single-snapshot projection is incomplete", async () => {
  await assert.rejects(
    loadRankedCatalogue({ count: 3, publishedRating: 13.2, snapshotRating: 13.2, seasonProjection: "empty" }),
    /TL_RANKED_CATALOGUE_SEASON_PROJECTION_INCOMPLETE/,
  );
});
