import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createCatalogueLoadDiagnostics } from "../lib/touchlineArena/ranking-load-diagnostics.ts";
import { applyTouchlineSeasonPoints } from "../lib/touchlineArena/matchday-player-points.ts";
import { projectTouchlineCardStatsByPosition } from "../lib/touchlineArena/position-aware-card-stats.ts";
import { parseTouchlinePublicEditorialCardPresentation } from "../lib/touchlineArena/editorial-card-profile.ts";
import * as provisional from "../lib/touchlineArena/card-engine-provisional-policy.ts";
import { isTouchlineProvisionalColumnsUnavailable } from "../lib/touchlineArena/card-engine-provisional-schema-compat.ts";

type Row = Record<string, unknown>;
const code = (file: string) => stripTypeScriptTypes(readFileSync(new URL(`../lib/touchlineArena/${file}.ts`, import.meta.url), "utf8"))
  .replace(/^import\s+[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const seasonId = uuid(90), competitionId = uuid(91), clubId = uuid(92);
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));

function harness(options: { legacy?: boolean; statsFailure?: boolean; competitionFailure?: boolean; noSeasons?: boolean; identityFailure?: boolean; holdIdentity?: boolean; holdClubs?: boolean; holdCompetition?: boolean; unpublished?: boolean } = {}) {
  const identity = deferred<void>(), clubs = deferred<void>(), competition = deferred<void>();
  const ids = Array.from({ length: 6 }, (_, n) => uuid(n + 1));
  // Explicit priority cases: detailed, provider, generic, no position and no row.
  const positions = [
    { detailed_position: "Goalkeeper", provider_position: "Forward", position: "Forward" },
    { detailed_position: "", provider_position: "Goalkeeper", position: "Forward" },
    { position: "Goalkeeper" }, { position: "Forward" }, {},
  ];
  const players = positions.map((position, n) => ({ id: ids[n], provider_player_id: String(n + 1), display_name: `Synthetic ${n}`, current_club_id: clubId, ...position }));
  const ranking = { phase: "ranked", scoringVersion: "player_scoring_v3", seasonId, snapshotId: "published-snapshot", publishedAt: "2026-09-30", players: ids.map((playerId, n) => ({ playerId, totalRating: n === 0 ? 0 : n + 10 })) };
  const tables: Record<string, Row[]> = {
    football_players: players,
    football_competitions: [{ id: competitionId, provider: "sportmonks", provider_competition_id: "8" }],
    football_seasons: options.noSeasons ? [] : [{ id: seasonId, competition_id: competitionId, is_current: true }],
    football_clubs: [{ id: clubId, name: "Synthetic club" }],
    football_player_season_statistics: ids.map((id, n) => ({ id: uuid(100 + n), football_player_id: id, competition_id: competitionId, season_id: seasonId, scoring_version: "player_scoring_v3", summary_payload: { goals: 0, saves: 4, defense: 3, "def-score": 3, totalRating: 999 } })),
    football_squad_members: ids.map((id, n) => ({ id: uuid(200 + n), player_id: id, club_id: clubId, competition_id: competitionId, status: "active", jersey_number: n + 1 })),
    touchline_card_publications: options.unpublished ? [] : ids.map((id, n) => ({ player_id: id, current_membership_id: uuid(200 + n), competition_id: competitionId, effective_season: "2026/27", publication_status: "published", calculated_tier: "ruby-red", calculated_nominal_price_gbp: 10, last_reviewed_at: "2026-09-30T00:00:00Z" })),
    football_player_market_values: ids.map((id, n) => ({ id: uuid(300 + n), player_id: id, market_value_eur: 1_000_000, verified_season: "2026/27", status: "verified", confidence: "verified" })),
    touchline_card_editorial_overrides: [],
    touchline_player_fixture_score_settlements: [],
  };
  const reads: Array<{ table: string; columns: string }> = [];
  const admin = { from(table: string) {
    let columns = "", single = false, start = 0, end = Infinity;
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select(value: string) { columns = value; return query; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; },
      order() { return query; },
      range(from: number, to: number) { start = from; end = to; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        reads.push({ table, columns });
        const isIdentity = table === "football_players" && columns.includes("display_name");
        const gate = isIdentity && options.holdIdentity ? identity.promise
          : table === "football_clubs" && options.holdClubs ? clubs.promise
          : table === "football_competitions" && options.holdCompetition ? competition.promise : Promise.resolve();
        return gate.then(() => {
          const data = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
          const failure = isIdentity && options.identityFailure || table === "football_player_season_statistics" && options.statsFailure || table === "football_competitions" && options.competitionFailure;
          return { data: failure ? null : single ? data[0] ?? null : data.slice(start, end + 1), count: data.length, error: failure ? { message: "synthetic unavailable" } : null };
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  const readPoints = runInNewContext(`${code("public-season-player-points-server")}\nreadPublicSeasonPlayerPoints;`, {
    createAdminClient: () => null, loadTouchLineActiveRanking: () => assert.fail("must retain supplied snapshot"), projectTouchlineCardStatsByPosition,
  });
  const publication = runInNewContext(`${code("card-publication-read-model")}\nloadTouchlinePublishedCardPresentations;`, {
    ...provisional,
    // Preserve the real parser's plain-object check across the VM realm.
    parseTouchlinePublicEditorialCardPresentation: (value: unknown) => parseTouchlinePublicEditorialCardPresentation(normalize(value)),
    isTouchlineProvisionalColumnsUnavailable,
  });
  const complete = runInNewContext(`${code("complete-catalogue-read-server")}\n({ createCompleteTouchlineCatalogueAdmin, loadCompleteTouchlineCataloguePresentations });`, {
    loadTouchlinePublishedCardPresentations: publication, isTouchlineProvisionalColumnsUnavailable, console: { warn() {} },
  });
  const load = runInNewContext(`${code("ranked-card-catalog-server")}\nloadTouchLineRankedCardCatalog;`, {
    createCatalogueLoadDiagnostics: () => createCatalogueLoadDiagnostics({}),
    ...complete,
    readPublicSeasonPlayerPoints: options.legacy
      ? (playerIds: string[], supplied: Row) => { const { providedPlayerRows: ignored, ...rest } = supplied; void ignored; return readPoints(playerIds, rest); }
      : readPoints,
    applyTouchlineSeasonPoints, projectTouchlineCardStatsByPosition,
    inferArenaRole: () => "midfielder", makeArenaShortName: (name: string) => name,
    normalizeOfficialShirtNumber: (value: unknown) => value, formatTouchlineMarketValueEur: () => "€1M",
    touchlineCountryCode3FromName: () => "N/A", normalizeTouchlineCountryCode3: () => "N/A", hasTouchlineCountryFlag: () => false,
  });
  return { load: () => load(ranking, admin), readPoints, admin, ranking, ids, players, reads, identity, clubs, competition };
}

test("ranked catalogue reuses position identity, retains separate editorial reads and produces the default projection", async () => {
  const h = harness(), legacy = harness({ legacy: true });
  const cards = await h.load();
  assert.deepEqual(normalize(cards), normalize(await legacy.load()));
  assert.equal(cards.length, 5, "missing identity is not fabricated");
  assert.equal(cards[0].seasonTotalRating, 0, "published zero outranks mutable aggregate total");
  assert.equal(h.reads.filter(read => read.table === "football_players").length, 2, "one identity read and one independent editorial validation");
  assert.equal(legacy.reads.filter(read => read.table === "football_players").length, 3);
  assert.ok(h.reads.some(read => read.table === "football_players" && read.columns === "id,current_club_id"));
  await h.load();
  assert.equal(h.reads.filter(read => read.table === "football_players").length, 4, "a later invocation must read fresh identity and publication");
});

test("supplied positions equal default detailed/provider/generic/absent projections", async () => {
  const h = harness();
  const base = { providedAdmin: h.admin, publishedRankingState: h.ranking, competitionId, seasonId };
  const normal = await h.readPoints(h.ids, base);
  h.reads.length = 0;
  const shared = await h.readPoints(h.ids, { ...base, providedPlayerRows: Promise.resolve(h.players) });
  assert.deepEqual(normalize(shared), normalize(normal));
  for (const index of [0, 1, 2]) assert.equal(shared[index].statistics.saves, 4);
  assert.equal(shared[3].statistics.saves, undefined);
  assert.equal(shared[0].totalRating, 0);
  assert.equal(h.reads.filter(read => read.table === "football_players").length, 0);
});

test("season statistics start while identity and clubs remain pending, publication still gates cards", async () => {
  const h = harness({ holdIdentity: true, holdClubs: true });
  let done = false;
  const result = h.load().then((value: unknown) => { done = true; return value; });
  await turn();
  assert.ok(h.reads.some(read => read.table === "football_player_season_statistics"));
  assert.equal(done, false);
  h.identity.resolve();
  await turn();
  assert.ok(h.reads.some(read => read.table === "football_clubs"));
  assert.equal(done, false);
  h.clubs.resolve();
  assert.equal((await result).length, 5);
  assert.equal((await harness({ unpublished: true }).load()).length, 0);
});

test("missing supplementary statistics preserve the same published ratings", async () => {
  const h = harness({ statsFailure: true });
  const cards = await h.load();
  assert.deepEqual(normalize(cards), normalize(await harness({ statsFailure: true, legacy: true }).load()));
  assert.equal(cards[0].seasonTotalRating, 0);
  assert.equal(cards[0].seasonStats, undefined);
});

test("provided identity rejection is observed before competition resolves and then propagated unchanged", async () => {
  const h = harness({ holdCompetition: true });
  const identity = deferred<Row[]>(), error = new Error("identity transport failed");
  const result = h.readPoints(h.ids, { providedAdmin: h.admin, publishedRankingState: h.ranking, seasonId, providedPlayerRows: identity.promise });
  const rejected = assert.rejects(result, (reason: unknown) => reason === error);
  identity.reject(error);
  await turn();
  h.competition.resolve();
  await rejected;
});

test("provided identity rejection stays observed across every early return", async () => {
  for (const mode of ["empty", "no-admin", "invalid-scope", "no-competition", "no-season"] as const) {
    const h = harness({ competitionFailure: mode === "no-competition", noSeasons: mode === "no-season" });
    const identity = deferred<Row[]>();
    const result = h.readPoints(mode === "empty" ? [] : h.ids, {
      ...(mode === "no-admin" ? {} : { providedAdmin: h.admin }),
      publishedRankingState: h.ranking,
      seasonId: mode === "invalid-scope" ? "invalid" : mode === "no-season" ? undefined : seasonId,
      providedPlayerRows: identity.promise,
    });
    identity.reject(new Error(`unused identity ${mode}`));
    await result;
    await turn();
  }
});

test("catalogue identity failures stay fatal even when competition returns a rating-only fallback", async () => {
  await assert.rejects(harness({ identityFailure: true, competitionFailure: true }).load(), /TL_CATALOGUE_READ_FAILED:football_players/);
});
