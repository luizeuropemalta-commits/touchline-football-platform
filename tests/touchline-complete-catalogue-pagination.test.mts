import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";
import { projectTouchlineCardStatsByPosition } from "../lib/touchlineArena/position-aware-card-stats.ts";
import { parseTouchlinePublicEditorialCardPresentation } from "../lib/touchlineArena/editorial-card-profile.ts";
import { isTouchlineProvisionalColumnsUnavailable } from "../lib/touchlineArena/card-engine-provisional-schema-compat.ts";
import { TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR, TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE, TOUCHLINE_PROVISIONAL_MISSING_SHIRT } from "../lib/touchlineArena/card-engine-provisional-policy.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const code = (path: string) => stripTypeScriptTypes(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "")
  .replace(/^export /gm, "");
const SEASON = "00000000-0000-4000-8000-000000000001";
const COMPETITION = "00000000-0000-4000-8000-000000000002";
const CLUB = "00000000-0000-4000-8000-000000000003";
const id = (n: number) => `00000000-0000-4000-8001-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;
type Options = {
  count?: number; cap?: number; unpublishedIndex?: number;
  membershipHistory?: boolean; oldOverrideSchema?: boolean; failedTable?: string;
  fault?: "page-error" | "duplicate" | "count-changed" | "null-count" | "editorial-error" | "stats-truncated" | "stats-error" | "stats-transport";
};

function scenario(options: Options = {}) {
  const ids = Array.from({ length: options.count ?? 1203 }, (_, n) => id(n));
  const tables: Record<string, Row[]> = {
    touchline_card_publications: ids.map((player_id, n) => ({ id: `pub-${n}`, player_id, published_at: "2026-09-05T12:00:00Z", current_membership_id: `member-${n}`, competition_id: COMPETITION, effective_season: "2026/27", publication_status: "published", calculated_tier: "emerald-green", calculated_nominal_price_gbp: 7, last_reviewed_at: "2026-09-05T12:00:00Z" })),
    football_players: ids.map((id, n) => ({ id, display_name: `Player ${String(n).padStart(4, "0")}`, current_club_id: CLUB, nationality: "Italy", position: "Goalkeeper" })),
    football_squad_members: ids.map((player_id, n) => ({ id: `member-${n}`, player_id, club_id: CLUB, competition_id: COMPETITION, status: n === options.unpublishedIndex ? "inactive" : "active", position: "Goalkeeper", jersey_number: (n % 99) + 1, source_updated_at: "2026-09-01T00:00:00Z" })),
    football_player_market_values: ids.map((player_id, n) => ({ id: `value-${n}`, player_id, market_value_eur: 1_000_000, verified_season: "2026/27", status: "verified", confidence: "verified" })),
    touchline_card_editorial_overrides: [],
    football_clubs: [{ id: CLUB, name: "Manchester City" }],
    football_competitions: [{ id: COMPETITION, provider: "sportmonks", provider_competition_id: "8" }],
    football_seasons: [{ id: SEASON, competition_id: COMPETITION, is_current: true }],
    football_player_season_statistics: ids.map((football_player_id, n) => ({ id: `stat-${n}`, football_player_id, competition_id: COMPETITION, season_id: SEASON, scoring_version: "player_scoring_v3", summary_payload: { totalRating: 99, saves: 10 }, position_statistics_payload: {} })),
  };
  if (options.membershipHistory) {
    tables.football_squad_members.push(...tables.football_squad_members.map(row => ({
      ...row, id: `old-${row.id}`, club_id: "former-club", jersey_number: 98, source_updated_at: "2025-08-01T00:00:00Z",
    })));
  }
  const reads: Array<{ table: string; from: number; to: number; order: string[]; inSizes: number[] }> = [];
  let rankingReads = 0;
  let projectionReads = 0;
  const editorialBatches: number[] = [];
  const admin = { from(table: string) {
    assert.ok(table in tables, `Unexpected read: ${table}`);
    let filtered = [...tables[table]];
    let from = 0; let to = Number.POSITIVE_INFINITY; let counted = false; let single = false; let selected = "";
    const sorts: Array<{ key: string; ascending: boolean }> = [];
    const inSizes: number[] = [];
    const query = {
      select(columns?: string, settings?: { count?: string }) { selected = columns ?? ""; counted = settings?.count === "exact"; return query; },
      eq(key: string, value: unknown) { filtered = filtered.filter(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { inSizes.push(values.length); filtered = filtered.filter(row => values.includes(row[key])); return query; },
      order(key: string, settings?: { ascending?: boolean }) { sorts.push({ key, ascending: settings?.ascending !== false }); return query; },
      range(start: number, end: number) { from = start; to = end; return query; },
      limit(value: number) { to = value - 1; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        reads.push({ table, from, to, order: sorts.map(s => s.key), inSizes });
        const sorted = filtered.sort((a, b) => {
          for (const sort of sorts) { const compared = String(a[sort.key]).localeCompare(String(b[sort.key])); if (compared) return sort.ascending ? compared : -compared; }
          return 0;
        });
        const laterStatsBatch = table === "football_player_season_statistics" && String(sorted[0]?.football_player_id) >= id(150);
        if (options.fault === "stats-transport" && laterStatsBatch) return Promise.reject(new Error("private-transport-details")).then(resolve, reject);
        if (options.oldOverrideSchema && table === "touchline_card_editorial_overrides" && selected.includes("provenance_status")) {
          return Promise.resolve({ data: null, error: { code: "42703", message: "provenance_status does not exist" }, count: null }).then(resolve, reject);
        }
        if ((options.fault === "page-error" && table === "touchline_card_publications" && from > 0)
          || (options.fault === "editorial-error" && table === "football_player_market_values")
          || (options.fault === "stats-error" && laterStatsBatch)
          || options.failedTable === table) {
          return Promise.resolve({ data: null, error: { code: "XX000", message: "private-database-details" }, count: null }).then(resolve, reject);
        }
        const cap = options.fault === "stats-truncated" && table === "football_player_season_statistics" ? 20 : options.cap ?? 1000;
        const page = sorted.slice(from, Math.min(to + 1, from + cap));
        if (options.fault === "duplicate" && table === "touchline_card_publications" && from > 0 && page.length) page[0] = sorted[0];
        const count = !counted || options.fault === "null-count" ? null : sorted.length + (options.fault === "count-changed" && table === "touchline_card_publications" && from > 0 ? 1 : 0);
        return Promise.resolve({ data: single ? page[0] : page, error: null, count }).then(resolve, reject);
      },
    };
    return query;
  } };
  const shared = {
    createAdminClient: () => admin,
    projectTouchlineCardStatsByPosition,
    loadTouchLineActiveRanking: async () => {
      rankingReads++;
      return { phase: "ranked", scoringVersion: "player_scoring_v3", seasonId: SEASON, players: ids.map((playerId, n) => ({ playerId, totalRating: n === 1 ? null : n === 2 ? 0 : 13.2 + rankingReads - 1 })) };
    },
  };
  const realSeasonReader = runInNewContext(`${code("lib/touchlineArena/public-season-player-points-server.ts")}\nreadPublicSeasonPlayerPoints;`, shared);
  const realPublicationReader = runInNewContext(`${code("lib/touchlineArena/card-publication-read-model.ts")}\nloadTouchlinePublishedCardPresentations;`, {
    ...shared, unstable_noStore: () => {},
    parseTouchlinePublicEditorialCardPresentation: (value: unknown) => parseTouchlinePublicEditorialCardPresentation(JSON.parse(JSON.stringify(value))),
    TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR, TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE, TOUCHLINE_PROVISIONAL_MISSING_SHIRT,
    isTouchlineProvisionalColumnsUnavailable,
  });
  const loadTouchlinePublishedCardPresentations = async (input: { playerIds: string[]; providedAdmin: unknown }) => {
    editorialBatches.push(input.playerIds.length);
    return realPublicationReader(input);
  };
  const helperPath = "lib/touchlineArena/complete-catalogue-read-server.ts";
  const pagination = runInNewContext(`${code(helperPath)}\n({ createCompleteTouchlineCatalogueAdmin, loadCompleteTouchlineCataloguePresentations });`, { loadTouchlinePublishedCardPresentations, isTouchlineProvisionalColumnsUnavailable, console: { warn() {} } });
  const context = {
    ...shared, ...pagination, loadTouchlinePublishedCardPresentations, applyTouchlineSeasonPoints,
    readPublicSeasonPlayerPoints: (...args: unknown[]) => { projectionReads++; return realSeasonReader(...args); },
    inferArenaRole: () => "goalkeeper", makeArenaShortName: (value: string) => value,
    normalizeOfficialShirtNumber: (value: unknown) => value,
    touchlineCountryCode3FromName: () => "ITA", normalizeTouchlineCountryCode3: () => "ITA", hasTouchlineCountryFlag: () => true,
    formatTouchlineMarketValueEur: () => "€1M",
  };
  // Real catalogue, publication gate and shared season projection. Only
  // database transport and unrelated identity formatting are isolated.
  const myClub = runInNewContext(`${code("lib/touchlineFantasy/server.ts")}\nloadCatalogue;`, context);
  const showcase = runInNewContext(`${code("lib/touchlineArena/ranked-card-catalog-server.ts")}\nloadTouchlinePublishedCardShowcaseCatalog;`, context);
  return {
    run: (surface: "myClub" | "showcase") => (surface === "myClub" ? myClub(admin) : showcase(admin)) as Promise<ClubOwnerSquadCard[]>,
    ids, reads, editorialBatches, rankingReads: () => rankingReads, projectionReads: () => projectionReads,
  };
}

for (const surface of ["myClub", "showcase"] as const) {
  test(`${surface}: all 1,203 cards survive API/publication caps with one rating snapshot`, async () => {
    const s = scenario(); const cards = await s.run(surface);
    assert.equal(cards.length, 1203);
    assert.equal(new Set(cards.map(card => card.id)).size, 1203);
    for (const playerId of s.ids) assert.ok(cards.some(card => card.id === playerId), playerId);
    assert.equal(s.rankingReads(), 1); assert.equal(s.projectionReads(), 1);
    assert.ok(s.editorialBatches.length > 1);
    assert.ok(s.editorialBatches.every(size => size <= 150));
    assert.ok(s.reads.every(read => read.inSizes.every(size => size <= 150)));
    assert.ok(s.reads.filter(read => read.table === "touchline_card_publications").every(read => read.order.includes("player_id")));
    for (const [n, expected] of [[0, 13.2], [1, null], [2, 0], [1202, 13.2]] as const) {
      const card = cards.find(card => card.id === s.ids[n])!;
      assert.equal(card.seasonTotalRating, expected); assert.equal(card.seasonStats?.saves, 10);
    }
  });
  test(`${surface}: a valid empty catalogue stays empty`, async () => {
    const s = scenario({ count: 0 }); const cards = await s.run(surface);
    assert.equal(cards.length, 0); assert.equal(s.rankingReads(), 0);
  });
  test(`${surface}: the real editorial gate still excludes an inactive membership`, async () => {
    const s = scenario({ unpublishedIndex: 1000 }); const cards = await s.run(surface);
    assert.equal(cards.length, 1202); assert.ok(cards.every(card => card.id !== s.ids[1000]));
  });
  test(`${surface}: multi-row membership batches are complete and keep the newest membership`, async () => {
    const s = scenario({ membershipHistory: true }); const cards = await s.run(surface);
    assert.equal(cards.length, 1203);
    assert.ok(s.reads.some(read => read.table === "football_squad_members" && read.from >= 150));
    assert.ok(s.reads.filter(read => read.table === "football_squad_members").every(read => read.order.includes("id")));
    assert.ok(cards.every(card => card.clubName === "Manchester City"));
  });
  test(`${surface}: existing old-schema editorial compatibility remains available`, async () => {
    const s = scenario({ oldOverrideSchema: true });
    assert.equal((await s.run(surface)).length, 1203);
  });
  for (const fault of ["stats-error", "stats-transport"] as const) {
    test(`${surface}: ${fault} discards partial supplementary stats but preserves publication`, async () => {
      const s = scenario({ fault }); const cards = await s.run(surface);
      assert.equal(cards.length, 1203); assert.equal(s.rankingReads(), 1);
      assert.ok(cards.every(card => card.seasonStats?.saves === undefined));
      assert.equal(cards.find(card => card.id === s.ids[0])?.seasonTotalRating, 13.2);
      assert.equal(cards.find(card => card.id === s.ids[1])?.seasonTotalRating, null);
      assert.equal(cards.find(card => card.id === s.ids[2])?.seasonTotalRating, 0);
    });
  }
  for (const failedTable of ["football_players", "football_squad_members", "football_clubs", "touchline_card_editorial_overrides"]) {
    test(`${surface}: ${failedTable} error fails explicitly`, async () => {
      await assert.rejects(scenario({ failedTable }).run(surface), /TL_CATALOGUE_READ_FAILED/);
    });
  }
  for (const fault of ["page-error", "duplicate", "count-changed", "null-count", "editorial-error", "stats-truncated"] as const) {
    test(`${surface}: ${fault} fails explicitly, never returns a partial catalogue`, async () => {
      const s = scenario({ fault });
      await assert.rejects(s.run(surface), error => {
        assert.match(String(error), /TL_CATALOGUE_/);
        assert.doesNotMatch(String(error), /private-database-details/);
        return true;
      });
    });
  }
  test(`${surface}: an unexpectedly smaller API cap fails closed`, async () => {
    await assert.rejects(scenario({ cap: 73 }).run(surface), /TL_CATALOGUE_/);
  });
}
