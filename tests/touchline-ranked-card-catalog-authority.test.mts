import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { createCatalogueLoadDiagnostics } from "../lib/touchlineArena/ranking-load-diagnostics.ts";
import { runInNewContext } from "node:vm";

import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";
import { projectTouchlineCardStatsByPosition } from "../lib/touchlineArena/position-aware-card-stats.ts";
import { parseCardGoalsPublication } from "../lib/touchlineArena/card-goals-leadership.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const SEASON = "00000000-0000-4000-8000-000000000001";
const COMPETITION = "00000000-0000-4000-8000-000000000002";
const SNAPSHOT = "player-rating:test";
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
const seasonReaderSource = stripTypeScriptTypes(
  readFileSync(new URL("../lib/touchlineArena/public-season-player-points-server.ts", import.meta.url), "utf8"),
)
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "")
  .replace(/^export /gm, "");
type InQuery = { table: string; key: string; values: unknown[] };

type Scenario = {
  count: number;
  publishedRating: number | null;
  snapshotRating: number | null;
  seasonProjection?: "complete" | "empty";
  assertSnapshotAuthority?: boolean;
  goalOnlyCount?: number;
  includeGoalCandidates?: boolean;
  cardGoals?: unknown;
  unpublishedIds?: readonly string[];
  missingIdentityIds?: readonly string[];
  providerOverrides?: Readonly<Record<string, string | null>>;
  sameName?: boolean;
  useRealSeasonProjection?: boolean;
  goalAggregateIds?: readonly string[];
  queries?: InQuery[];
};

function loadRankedCatalogue({
  count,
  publishedRating,
  snapshotRating,
  seasonProjection = "complete",
  assertSnapshotAuthority = false,
  goalOnlyCount = 0,
  includeGoalCandidates,
  cardGoals,
  unpublishedIds = [],
  missingIdentityIds = [],
  providerOverrides = {},
  sameName = false,
  useRealSeasonProjection = false,
  goalAggregateIds = [],
  queries,
}: Scenario) {
  const playerIds = Array.from({ length: count + goalOnlyCount }, (_, index) => id(index + 1));
  const rankedPlayerIds = playerIds.slice(0, count);
  const rows: Record<string, Array<Record<string, unknown>>> = {
    football_players: playerIds.map((playerId, index) => ({
      id: playerId,
      provider_player_id: Object.hasOwn(providerOverrides, playerId)
        ? providerOverrides[playerId]
        : String(index + 1),
      display_name: sameName ? "Same display name" : `Player ${index + 1}`,
      current_club_id: "club",
      position: "Goalkeeper",
    })).filter((player) => !missingIdentityIds.includes(player.id)),
    football_squad_members: playerIds.map((player_id, index) => ({
      id: `member-${index}`,
      player_id,
      club_id: "club",
      jersey_number: 1,
      position: "Goalkeeper",
      status: "active",
      source_updated_at: "2026-09-01T00:00:00Z",
    })),
    football_player_season_statistics: goalAggregateIds.map((football_player_id, index) => ({
      id: `season-stat-${index}`,
      football_player_id,
      competition_id: COMPETITION,
      season_id: SEASON,
      scoring_version: "player_scoring_v4",
      // This mutable total must never become authority for a goals-only card.
      summary_payload: { goals: 5, totalRating: 999, touchlinePoints: 12 },
      position_statistics_payload: {},
    })),
    touchline_player_fixture_score_settlements: [],
    football_clubs: [{ id: "club", name: "Club" }],
    football_competitions: [{ id: COMPETITION, provider: "sportmonks", provider_competition_id: "8" }],
  };
  rows.touchline_player_fixture_score_settlements = playerIds.map((football_player_id, index) => ({
    id: `settlement-${index}`,
    football_player_id,
    season_id: SEASON,
    scoring_version: "player_scoring_v4",
    rating: 7.5,
    statistics_payload: {},
    football_fixtures: { starts_at: "2026-09-01T12:00:00Z" },
  }));
  const admin = {
    from(table: string) {
      assert.ok(Object.hasOwn(rows, table), `unexpected table read: ${table}`);
      let data = [...(rows[table] ?? [])];
      let countRequested = false;
      let start = 0;
      let end = Number.POSITIVE_INFINITY;
      let single = false;
      const query = {
        select(_columns?: string, options?: { count?: string }) { countRequested = options?.count === "exact"; return query; },
        eq(key: string, value: unknown) { data = data.filter((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) {
          queries?.push({ table, key, values: [...values] });
          data = data.filter((row) => values.includes(row[key]));
          return query;
        },
        order() { return query; },
        range(from: number, to: number) { start = from; end = to; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: single ? data[0] ?? null : data.slice(start, end + 1), count: countRequested ? data.length : null, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const readRealSeasonPoints = runInNewContext(`${seasonReaderSource}\nreadPublicSeasonPlayerPoints;`, {
    createAdminClient: () => { assert.fail("the season reader must use the supplied admin"); },
    loadTouchLineActiveRanking: () => { assert.fail("the catalogue must not resolve a newer active publication"); },
    projectTouchlineCardStatsByPosition,
  }) as (ids: string[], options: unknown) => Promise<unknown[]>;
  const execute = runInNewContext(`${source}\nloadTouchLineRankedCardCatalog;`, {
    createCatalogueLoadDiagnostics: () => createCatalogueLoadDiagnostics({}),
    createAdminClient: () => admin,
    createCompleteTouchlineCatalogueAdmin,
    loadCompleteTouchlineCataloguePresentations: async (ids: string[], providedAdmin: unknown) => {
      const published = await completeReader.loadCompleteTouchlineCataloguePresentations(ids, providedAdmin);
      for (const playerId of unpublishedIds) published.delete(playerId);
      return published;
    },
    // This reproduces the legacy public-reader hard limit the regression fixes.
    loadTouchlinePublishedCardPresentations: publishedPresentationChunk,
    parseCardGoalsPublication,
    readPublicSeasonPlayerPoints: async (ids: string[], options: { seasonId?: string; publishedRankingState?: unknown }) => {
      if (assertSnapshotAuthority) {
        assert.equal(options.seasonId, SEASON);
        assert.equal(options.publishedRankingState, state);
      }
      if (seasonProjection === "empty") return [];
      if (useRealSeasonProjection) return readRealSeasonPoints(ids, options);
      return ids.map((canonicalPlayerId) => ({
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
  }) as (state: unknown, admin: unknown, options?: { includeGoalCandidates?: boolean }) => Promise<ClubOwnerSquadCard[]>;
  const state = {
    phase: "ranked",
    scoringVersion: "player_scoring_v4",
    seasonId: SEASON,
    snapshotId: SNAPSHOT,
    publishedAt: "2026-09-01T12:00:00Z",
    players: rankedPlayerIds.map((playerId, index) => ({
      playerId,
      providerPlayerId: String(index + 1),
      totalRating: snapshotRating,
    })),
    cardGoals: cardGoals ?? {
      source: "published-card-goals-v1",
      snapshotId: SNAPSHOT,
      // Overlap rating and goals IDs deliberately: the catalogue union must
      // retain each canonical athlete once, including null/zero goal rows.
      rows: playerIds.map((playerId, index) => ({ playerId, goals: index % 4 === 0 ? null : index % 3 })),
    },
  };
  return includeGoalCandidates === undefined
    ? execute(state, admin)
    : execute(state, admin, { includeGoalCandidates });
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

test("the default and explicit false remain rating-only even with a valid goals publication", async () => {
  for (const includeGoalCandidates of [undefined, false]) {
    const queries: InQuery[] = [];
    const cards = await loadRankedCatalogue({
      count: 2, goalOnlyCount: 3, publishedRating: 13.2, snapshotRating: 13.2,
      includeGoalCandidates, useRealSeasonProjection: true, assertSnapshotAuthority: true, queries,
    });
    assert.deepEqual(Array.from(cards, (card) => card.canonicalPlayerId), [id(1), id(2)]);
    assert.ok(cards.every((card) => card.publishedRanking?.totalRating === 13.2));
    const identityQueries = queries.filter((query) => query.table === "football_players");
    assert.equal(identityQueries.length, 1, "the season reader reuses the identity promise");
    assert.deepEqual(identityQueries[0]?.values, [id(1), id(2)]);
  }
});

test("opt-in adds every goals-only candidate without inventing rating or changing historic and editorial fields", async () => {
  const queries: InQuery[] = [];
  const cards = await loadRankedCatalogue({
    count: 2, goalOnlyCount: 4, publishedRating: 13.2, snapshotRating: 13.2,
    includeGoalCandidates: true, useRealSeasonProjection: true, assertSnapshotAuthority: true, queries,
  });
  assert.equal(cards.length, 6);
  assert.equal(new Set(cards.map((card) => card.canonicalPlayerId)).size, 6);
  assert.ok(cards.slice(0, 2).every((card) => card.publishedRanking?.totalRating === 13.2));
  for (const card of cards.slice(2)) {
    assert.equal(card.seasonTotalRating, null);
    assert.equal(card.publishedRanking, undefined);
    assert.equal(card.seasonTouchlinePoints, null);
    assert.equal(card.seasonStats, undefined);
    assert.equal(card.matchRating, 7.5);
    assert.equal(card.matchStats?.rating, 7.5);
    assert.equal(card.touchlinePoints, 0, "the established legacy DTO stays unchanged");
    assert.equal(card.editorialCard, presentation);
    assert.equal(card.marketValue, "€1M");
    assert.equal(card.marketValueState, "verified");
    assert.equal(card.marketValueSource, "verified-cache");
    assert.equal(card.cardTier, "elite");
  }
  const identityQueries = queries.filter((query) => query.table === "football_players");
  assert.equal(identityQueries.length, 1);
  assert.deepEqual(identityQueries[0]?.values, Array.from({ length: 6 }, (_, index) => id(index + 1)));
  assert.equal(cards[5]?.providerPlayerId, "6");
});

test("goals-only mutable season statistics never synthesize a published rating", async () => {
  const cards = await loadRankedCatalogue({
    count: 1, goalOnlyCount: 1, publishedRating: 13.2, snapshotRating: 13.2,
    includeGoalCandidates: true, useRealSeasonProjection: true, assertSnapshotAuthority: true,
    goalAggregateIds: [id(2)],
  });
  const goalOnlyCard = cards.find((card) => card.canonicalPlayerId === id(2));
  assert.ok(goalOnlyCard);
  assert.equal(goalOnlyCard.seasonTotalRating, null);
  assert.equal(goalOnlyCard.publishedRanking, undefined);
  assert.equal(goalOnlyCard.seasonStats?.goals, 5);
  assert.equal(goalOnlyCard.seasonTouchlinePoints, 12, "supplementary persisted fields retain their own semantics");
  assert.equal(goalOnlyCard.matchRating, 7.5);
  assert.equal(cards[0]?.seasonTotalRating, 13.2);
});

test("even a future projection that supplies an extra rating cannot create goals-only ranking evidence", async () => {
  const cards = await loadRankedCatalogue({
    count: 1, goalOnlyCount: 1, publishedRating: 999, snapshotRating: 999,
    includeGoalCandidates: true,
  });
  assert.equal(cards[0]?.seasonTotalRating, 999);
  assert.equal(cards[0]?.publishedRanking?.totalRating, 999);
  assert.equal(cards[1]?.seasonTotalRating, null);
  assert.equal(cards[1]?.publishedRanking, undefined);
});

test("opt-in rejects mismatched or invalid goals publications without replacing the rating scope", async () => {
  const invalidPublications = [
    { source: "published-card-goals-v1", snapshotId: "other-snapshot", rows: [{ playerId: id(2), goals: 8 }] },
    { source: "published-card-goals-v1", snapshotId: SNAPSHOT, rows: [{ playerId: id(2), goals: 8 }, { playerId: id(2), goals: 8 }] },
    { source: "published-card-goals-v1", snapshotId: SNAPSHOT, rows: [{ playerId: "Same display name", goals: 8 }] },
    { source: "published-card-goals-v1", snapshotId: SNAPSHOT, rows: [{ playerId: id(2), goals: -1 }] },
  ];
  for (const cardGoals of invalidPublications) {
    const queries: InQuery[] = [];
    const cards = await loadRankedCatalogue({
      count: 1, goalOnlyCount: 1, publishedRating: 13.2, snapshotRating: 13.2,
      includeGoalCandidates: true, cardGoals, useRealSeasonProjection: true, assertSnapshotAuthority: true, queries,
    });
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.canonicalPlayerId, id(1));
    assert.equal(cards[0]?.publishedRanking?.totalRating, 13.2);
    assert.deepEqual(queries.find((query) => query.table === "football_players")?.values, [id(1)]);
  }
});

test("goals-only cards require canonical identity, a stored provider ID and published editorial presentation", async () => {
  const cards = await loadRankedCatalogue({
    count: 1, goalOnlyCount: 5, publishedRating: 13.2, snapshotRating: 13.2,
    includeGoalCandidates: true, useRealSeasonProjection: true, assertSnapshotAuthority: true,
    unpublishedIds: [id(2)], missingIdentityIds: [id(3)],
    providerOverrides: { [id(4)]: null, [id(5)]: "  ", [id(6)]: "99876" }, sameName: true,
  });
  assert.deepEqual(Array.from(cards, (card) => card.canonicalPlayerId), [id(1), id(6)]);
  assert.equal(cards[0]?.name, cards[1]?.name, "a display name is not catalogue identity");
  assert.equal(cards[1]?.providerPlayerId, "99876", "provider identity comes from football_players, not UUID or row position");
  assert.equal(cards[1]?.publishedRanking, undefined);
});

test("the opt-in union preserves complete paginated reads and deduplicates rating-goal overlap", async () => {
  const cards = await loadRankedCatalogue({
    count: 2, goalOnlyCount: 1201, publishedRating: 13.2, snapshotRating: 13.2,
    includeGoalCandidates: true, useRealSeasonProjection: true, assertSnapshotAuthority: true,
  });
  assert.equal(cards.length, 1203);
  assert.equal(new Set(cards.map((card) => card.canonicalPlayerId)).size, 1203);
  assert.equal(cards.filter((card) => card.publishedRanking).length, 2);
  assert.equal(cards.find((card) => card.canonicalPlayerId === id(1203))?.seasonTotalRating, null);
});

test("goal-only projection absence is optional, but actual ranking projection remains mandatory", async () => {
  await assert.rejects(
    loadRankedCatalogue({
      count: 1, goalOnlyCount: 1, publishedRating: 13.2, snapshotRating: 13.2,
      includeGoalCandidates: true, seasonProjection: "empty",
    }),
    /TL_RANKED_CATALOGUE_SEASON_PROJECTION_INCOMPLETE/,
  );
});
