import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";
import { projectTouchlineCardStatsByPosition } from "../lib/touchlineArena/position-aware-card-stats.ts";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const SEASON = "00000000-0000-4000-8000-000000000010";
const COMPETITION = "00000000-0000-4000-8000-000000000020";
const ids = [1, 2, 3].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const code = (file: string) => stripTypeScriptTypes(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "")
  .replace(/^export /gm, "");

function catalogue(options: { statsError?: boolean; noStats?: boolean; otherSeason?: boolean } = {}) {
  const state = {
    phase: "ranked", scoringVersion: "player_scoring_v3", seasonId: SEASON,
    players: ids.map((playerId, n) => ({ playerId, totalRating: [13.2, null, 0][n] })),
  };
  const tables: Record<string, Array<Record<string, unknown>>> = {
    touchline_card_publications: ids.map(player_id => ({ player_id, publication_status: "published" })),
    football_players: ids.map((id, n) => ({ id, display_name: `Test keeper ${n}`, current_club_id: "club", position: "Goalkeeper" })),
    football_squad_members: ids.map((player_id, n) => ({ id: `member-${n}`, player_id, club_id: "club", status: "active", position: "Goalkeeper", jersey_number: 1 })),
    football_clubs: [{ id: "club", name: "Manchester City" }],
    football_competitions: [{ id: COMPETITION, provider: "sportmonks", provider_competition_id: "8" }],
    football_seasons: [{ id: options.otherSeason ? "00000000-0000-4000-8000-000000000011" : SEASON, competition_id: COMPETITION, is_current: true }],
    football_player_season_statistics: options.noStats ? [] : ids.map((football_player_id, n) => ({
      id: `stat-${n}`, football_player_id, competition_id: COMPETITION, season_id: SEASON, scoring_version: "player_scoring_v3",
      summary_payload: { totalRating: [28.26, 7, 9][n], saves: 10, yellowCards: 0, goalsConceded: 2 },
      position_statistics_payload: {},
    })),
  };
  const reads: string[] = [];
  const admin = { from(table: string) {
    assert.ok(table in tables, `unexpected read ${table}`);
    reads.push(table);
    let data = tables[table];
    let single = false;
    let counted = false;
    let start = 0;
    let end = Number.POSITIVE_INFINITY;
    const query = {
      select(_columns?: string, options?: { count?: string }) { counted = options?.count === "exact"; return query; },
      order() { return query; }, limit() { return query; },
      range(from: number, to: number) { start = from; end = to; return query; },
      eq(key: string, value: unknown) { data = data.filter(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { data = data.filter(row => values.includes(row[key])); return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve({
          data: single ? data[0] : data.slice(start, end + 1),
          count: counted ? data.length : null,
          error: options.statsError && table === "football_player_season_statistics" ? { code: "TEST" } : null,
        }).then(resolve);
      },
    };
    return query;
  } };
  const shared = {
    createAdminClient: () => admin,
    loadTouchLineActiveRanking: async () => state,
    projectTouchlineCardStatsByPosition,
  };
  const readPublicSeasonPlayerPoints = runInNewContext(`${code("lib/touchlineArena/public-season-player-points-server.ts")}\nreadPublicSeasonPlayerPoints;`, shared);
  const context = {
    ...shared, readPublicSeasonPlayerPoints, applyTouchlineSeasonPoints,
    loadTouchlinePublishedCardPresentations: async () => new Map(ids.map(id => [id, { tierKey: "elite", marketValueEur: 1000000, shirtNumber: 1 }])),
    inferArenaRole: () => "goalkeeper", makeArenaShortName: (value: string) => value,
    normalizeOfficialShirtNumber: (value: unknown) => value,
    touchlineCountryCode3FromName: () => "ITA", normalizeTouchlineCountryCode3: () => "ITA", hasTouchlineCountryFlag: () => true,
    formatTouchlineMarketValueEur: () => "€1M",
  };
  const completeReads = runInNewContext(`${code("lib/touchlineArena/complete-catalogue-read-server.ts")}\n({ createCompleteTouchlineCatalogueAdmin, loadCompleteTouchlineCataloguePresentations });`, context);
  Object.assign(context, completeReads);
  // Real catalogue readers and real card projections; only database/publication
  // IO and irrelevant identity formatting are isolated. No score is computed.
  const myClub = runInNewContext(`${code("lib/touchlineFantasy/server.ts")}\nloadCatalogue;`, context) as (admin: unknown) => Promise<ClubOwnerSquadCard[]>;
  const showcase = runInNewContext(`${code("lib/touchlineArena/ranked-card-catalog-server.ts")}\nloadTouchlinePublishedCardShowcaseCatalog;`, context) as (admin: unknown) => Promise<ClubOwnerSquadCard[]>;
  return { myClub: () => myClub(admin), showcase: () => showcase(admin), reads };
}

for (const surface of ["myClub", "showcase"] as const) {
  test(`${surface}: published total, zero and null survive into the exact card used by zoom`, async () => {
    const cards = await catalogue()[surface]();
    assert.equal(cards.length, 3);
    for (const [index, expected] of [13.2, null, 0].entries()) {
      const card = cards.find(card => card.id === ids[index])!;
      assert.equal(card.seasonTotalRating, expected, "never replace the publication with an unpublished aggregate");
      assert.equal(squadCardToExactPlayer(card).totalRating, expected);
      assert.equal(card.seasonStats?.saves, 10, "persisted goalkeeper statistics must reach the card");
      assert.equal(squadCardToExactPlayer(card).seasonStats?.yellowCards, 0, "a verified zero is visible");
    }
  });
  test(`${surface}: unavailable supplementary statistics do not erase published cards or ratings`, async () => {
    for (const options of [{ statsError: true }, { noStats: true }]) {
      const cards = await catalogue(options)[surface]();
      assert.equal(cards.length, 3);
      assert.equal(cards[0].seasonTotalRating, 13.2);
      assert.equal(cards[0].seasonStats?.saves, undefined);
    }
  });
  test(`${surface}: a new season never inherits an older season's rating`, async () => {
    const cards = await catalogue({ otherSeason: true })[surface]();
    assert.equal(cards.length, 3);
    assert.ok(cards.every(card => card.seasonTotalRating === null));
  });
}
