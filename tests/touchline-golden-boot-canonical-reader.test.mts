import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as editorial from "../lib/touchlineArena/editorial-card-profile.ts";
import * as provisional from "../lib/touchlineArena/card-engine-provisional-policy.ts";
import * as compatibility from "../lib/touchlineArena/card-engine-provisional-schema-compat.ts";
import * as stagesResolver from "../lib/touchlineArena/golden-boot-stage-scope.ts";
import * as eligibility from "../lib/touchlineArena/golden-boot-eligibility.ts";
import * as topScorerIds from "../lib/football-data/sportmonks-season-topscorers.ts";
import type { FootballDataResult, TouchlineSeasonStages, TouchlineSeasonTopScorers } from "../lib/football-data/types.ts";
import type { readGoldenBootCanonicalLeaders } from "../lib/touchlineArena/golden-boot-canonical-reader.ts";

type Row = Record<string, unknown>;
type Success<T> = Extract<FootballDataResult<T>, { ok: true }>;
const now = Date.parse("2026-10-01T12:00:00Z");
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const competition = id(1), season = id(2), club = id(3);
const players = [id(10), id(11)], members = [id(20), id(21)];

function moduleAt(name: string, imports: Record<string, unknown>) {
  const source = readFileSync(new URL(`../lib/touchlineArena/${name}.ts`, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported: Record<string, unknown> = {};
  // The real plain-object editorial parser must execute in the same realm.
  vm.runInThisContext(`(function(exports, require) { ${javascript}\n })`)(exported, (key: string) => {
    assert.ok(Object.hasOwn(imports, key), `Unexpected import ${key}`);
    return imports[key];
  });
  return exported;
}
const publication = moduleAt("card-publication-read-model", {
  "server-only": {}, "next/cache": { unstable_noStore() {} },
  "@/lib/supabase/admin": { createAdminClient() { throw Error("Unexpected database creation"); } },
  "./editorial-card-profile.ts": editorial,
  "./card-engine-provisional-policy.ts": provisional,
  "./card-engine-provisional-schema-compat.ts": compatibility,
});
const reader = moduleAt("golden-boot-canonical-reader", {
  "server-only": {}, "./card-publication-read-model.ts": publication,
  "../football-data/sportmonks-season-topscorers.ts": topScorerIds,
  "./golden-boot-stage-scope.ts": stagesResolver, "./golden-boot-eligibility.ts": eligibility,
}).readGoldenBootCanonicalLeaders as typeof readGoldenBootCanonicalLeaders;

const columns: Record<string, string> = {
  football_competitions: "id,provider,provider_competition_id",
  football_seasons: "id,provider,provider_season_id,competition_id,is_current,name",
  football_players: "id,provider,provider_player_id,current_club_id",
  football_clubs: "id,provider,provider_team_id,competition_id",
  football_squad_members: "id,provider,player_id,club_id,competition_id,status,jersey_number",
  touchline_card_publications: "player_id,current_membership_id,competition_id,effective_season,publication_status,calculated_tier,calculated_nominal_price_gbp,last_reviewed_at,internal_source",
  football_player_market_values: "player_id,market_value_eur,verified_season,status,confidence,source",
  touchline_card_editorial_overrides: "player_id,field_key,effective_value,status,provenance_status,last_verification_at,next_verification_at",
};
function fixture() {
  const stageTime = new Date(now - 20_000).toISOString();
  const scorerTime = new Date(now - 10_000).toISOString();
  const stages: Success<TouchlineSeasonStages> = { ok: true, provider: "sportmonks", cached: true, fetchedAt: stageTime,
    data: { fetchedAt: stageTime, requestedSeasonId: "70001", leagueId: "8", coverage: "complete",
      rows: [{ id: "90001", leagueId: "8", seasonId: "70001", typeId: "223" }] } };
  const scorers: Success<TouchlineSeasonTopScorers> = { ok: true, provider: "sportmonks", fetchedAt: scorerTime,
    data: { fetchedAt: scorerTime, requestedSeasonId: "70001", coverage: "complete", scopeStatus: "complete", reason: null, pagesRead: 1,
      rows: players.map((_, index) => ({ providerRecordId: String(100 + index), providerPlayerId: String(200 + index),
        providerTeamId: "300", leagueId: "8", seasonId: "70001", stageId: "90001", goals: 3 })) } };
  const tables: Record<string, Row[]> = {
    football_competitions: [{ id: competition, provider: "sportmonks", provider_competition_id: "8" }],
    football_seasons: [{ id: season, provider: "sportmonks", provider_season_id: "70001", competition_id: competition, is_current: true, name: "2026/2027" }],
    football_players: players.map((playerId, index) => ({ id: playerId, provider: "sportmonks", provider_player_id: String(200 + index), current_club_id: club })),
    football_clubs: [{ id: club, provider: "sportmonks", provider_team_id: "300", competition_id: competition }],
    football_squad_members: players.map((playerId, index) => ({ id: members[index], provider: "sportmonks", player_id: playerId,
      club_id: club, competition_id: competition, status: "active", jersey_number: index + 1 })),
    touchline_card_publications: players.map((playerId, index) => ({ player_id: playerId, current_membership_id: members[index],
      competition_id: competition, effective_season: "2026-27", publication_status: "published", calculated_tier: "ruby-red",
      calculated_nominal_price_gbp: 10, last_reviewed_at: scorerTime, internal_source: "editorial" })),
    football_player_market_values: players.map(playerId => ({ player_id: playerId, market_value_eur: 2500000,
      verified_season: "2026-27", status: "verified", confidence: "verified", source: "editorial" })),
    touchline_card_editorial_overrides: [],
  };
  return { stages, scorers, tables, clock: now, calls: [] as string[],
    beforeQuery: (_table: string) => {}, errorTable: "", throwTable: "", truncateTable: "" };
}
type Fixture = ReturnType<typeof fixture>;
function fakeAdmin(f: Fixture) {
  return { from(table: string) {
    assert.ok(Object.hasOwn(columns, table), `Unexpected table ${table}`);
    let selected: string[] = [], exact = false, limit = Infinity;
    const predicates: Array<(row: Row) => boolean> = [];
    const query = {
      select(value: string, options?: { count?: string }) {
        selected = value.split(","); exact = options?.count === "exact";
        for (const key of selected) assert.ok(columns[table]!.split(",").includes(key), `Unknown ${table}.${key}`);
        return query;
      },
      eq(key: string, value: unknown) { predicates.push(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { predicates.push(row => values.includes(row[key])); return query; },
      limit(value: number) { limit = value; return query; },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve().then(() => {
          f.calls.push(table); f.beforeQuery(table);
          if (f.throwTable === table) throw Error("PRIVATE sentinel must not leak");
          const matching = f.tables[table]!.filter(row => predicates.every(predicate => predicate(row)));
          const capped = matching.slice(0, f.truncateTable === table ? 1 : limit);
          return { data: capped.map(row => Object.fromEntries(selected.map(key => [key, row[key]]))),
            error: f.errorTable === table ? { message: "PRIVATE sentinel must not leak" } : null,
            count: exact ? matching.length : null };
        }).then(resolve, reject);
      },
    };
    return query;
  } } as unknown as NonNullable<Parameters<typeof reader>[0]["admin"]>;
}
function read(f: Fixture) {
  return reader({ admin: fakeAdmin(f), stages: f.stages, topScorers: f.scorers, maxAgeMs: 60_000, now: () => f.clock });
}

test("real readers map every tied leader without names; expiry is oldest original cached fetch", async () => {
  const f = fixture();
  const result = await read(f);
  assert.equal(result.phase, "shared");
  assert.equal(result.publicAwardEligible, false);
  assert.deepEqual(result.canonicalScope, { competitionId: competition, seasonId: season, effectiveSeason: "2026-27" });
  assert.deepEqual(result.scope, { authority: "canonical-season-stage", leagueId: "8", seasonId: "70001", stageId: "90001" });
  assert.deepEqual(result.leaders.map(row => [row.playerId, row.membershipId, row.clubId, row.goals]),
    players.map((playerId, index) => [playerId, members[index], club, 3]));
  assert.equal(result.leaders[0]!.presentation.tierKey, "ruby-red");
  assert.equal(result.fetchedAt, new Date(now - 20_000).toISOString());
  assert.equal(result.expiresAt, new Date(now + 40_000).toISOString());
});

test("single leader and canonical short season label remain supported", async () => {
  const f = fixture();
  f.scorers.data = { ...f.scorers.data, rows: [f.scorers.data.rows[0]!] };
  f.tables.football_seasons![0]!.name = "2026-27";
  const result = await read(f);
  assert.equal(result.phase, "unique");
  assert.equal(result.leaders.length, 1);
});

test("published provisional editorial policy is reused, not replaced by an award-specific price rule", async () => {
  const f = fixture();
  f.tables.football_player_market_values![0] = { ...f.tables.football_player_market_values![0],
    status: "provisional", confidence: "provisional", source: "touchline_card_engine_provisional",
    market_value_eur: provisional.TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR };
  f.tables.touchline_card_publications![0]!.internal_source = "touchline_card_engine_provisional_defaults";
  f.tables.touchline_card_editorial_overrides!.push({ player_id: players[0], field_key: "marketValueEur",
    status: "provisional", provenance_status: provisional.TOUCHLINE_PROVISIONAL_MISSING_MARKET_VALUE,
    effective_value: provisional.TOUCHLINE_PROVISIONAL_MARKET_VALUE_EUR,
    last_verification_at: "2026-10-01T10:00:00Z", next_verification_at: "2026-10-02T10:00:00Z" });
  const result = await read(f);
  assert.equal(result.phase, "shared");
  assert.equal(result.leaders[0]!.presentation.marketValueState, "provisional");
  assert.equal(result.publicAwardEligible, false);
});

const negatives: Array<[string, (f: Fixture) => void]> = [
  ["missing competition", f => { f.tables.football_competitions = []; }],
  ["duplicate competition", f => { f.tables.football_competitions!.push({ ...f.tables.football_competitions![0], id: id(99) }); }],
  ["multiple current seasons", f => { f.tables.football_seasons!.push({ ...f.tables.football_seasons![0], id: id(99) }); }],
  ["no current season", f => { f.tables.football_seasons![0]!.is_current = false; }],
  ["wrong season provider", f => { f.tables.football_seasons![0]!.provider = "other"; }],
  ["wrong canonical season", f => { f.tables.football_seasons![0]!.provider_season_id = "70002"; }],
  ["invalid canonical UUID", f => { f.tables.football_seasons![0]!.id = "70001"; }],
  ["nonconsecutive editorial season", f => { f.tables.football_seasons![0]!.name = "2026-99"; }],
  ["ambiguous editorial season label", f => { f.tables.football_seasons![0]!.name = "Premier 2026/2027"; }],
  ["stale stage evidence", f => { f.clock += 40_001; }],
  ["future evidence", f => { f.clock -= 30_000; }],
  ["incomplete top scorer scope", f => { f.scorers.data = { ...f.scorers.data, scopeStatus: "ambiguous" }; }],
  ["only top scorers stale", f => { const old = new Date(now - 60_001).toISOString(); f.scorers.fetchedAt = old; f.scorers.data = { ...f.scorers.data, fetchedAt: old }; }],
  ["zero goals confer no lead", f => { f.scorers.data = { ...f.scorers.data, rows: f.scorers.data.rows.map(row => ({ ...row, goals: 0 })) }; }],
  ["multiple stages", f => { f.stages.data = { ...f.stages.data, rows: [...f.stages.data.rows, { ...f.stages.data.rows[0]!, id: "90002" }] }; }],
  ["missing one tied identity", f => { f.tables.football_players!.pop(); }],
  ["duplicate provider identity", f => { f.tables.football_players![1]!.provider_player_id = "200"; }],
  ["wrong player provider", f => { f.tables.football_players![1]!.provider = "other"; }],
  ["unbound club", f => { f.tables.football_players![1]!.current_club_id = null; }],
  ["transfer mismatch", f => { f.tables.football_clubs![0]!.provider_team_id = "301"; }],
  ["club outside competition", f => { f.tables.football_clubs![0]!.competition_id = id(99); }],
  ["inactive membership", f => { f.tables.football_squad_members![1]!.status = "inactive"; }],
  ["membership belongs elsewhere", f => { f.tables.football_squad_members![1]!.club_id = id(99); }],
  ["ambiguous active memberships", f => { f.tables.football_squad_members!.push({ ...f.tables.football_squad_members![0], id: id(99) }); }],
  ["publication from another season", f => { f.tables.touchline_card_publications![1]!.effective_season = "2025-26"; }],
  ["publication from another competition", f => { f.tables.touchline_card_publications![1]!.competition_id = id(99); }],
  ["one tie unpublished", f => { f.tables.touchline_card_publications![1]!.publication_status = "archived"; }],
  ["cross-player publication membership", f => { f.tables.touchline_card_publications![0]!.current_membership_id = members[1]; }],
  ["unverified editorial value", f => { f.tables.football_player_market_values![1]!.status = "pending"; }],
  ["truncated players response", f => { f.truncateTable = "football_players"; }],
  ["truncated memberships response", f => { f.truncateTable = "football_squad_members"; }],
  ["database error", f => { f.errorTable = "football_clubs"; }],
  ["database rejection", f => { f.throwTable = "football_seasons"; }],
  ["expires while publication is read", f => { f.beforeQuery = table => { if (table === "touchline_card_publications") f.clock += 40_001; }; }],
  ["clock regresses during reads", f => { f.beforeQuery = table => { if (table === "touchline_card_publications") f.clock--; }; }],
  ["coherent same-league transfer during publication read", f => { f.beforeQuery = table => {
    if (table !== "touchline_card_publications") return;
    f.tables.football_players![0]!.current_club_id = id(98);
    f.tables.football_squad_members![0]!.club_id = id(98);
  }; }],
  ["membership replacement during publication read", f => { f.beforeQuery = table => {
    if (table !== "touchline_card_publications") return;
    f.tables.football_squad_members![0]!.id = id(99);
    f.tables.touchline_card_publications![0]!.current_membership_id = id(99);
  }; }],
];
for (const [label, mutate] of negatives) {
  test(`all tied leaders fail closed: ${label}`, async () => {
    const f = fixture(); mutate(f);
    const result = await read(f);
    assert.equal(result.phase, "unavailable");
    assert.deepEqual(result.leaders, []);
    assert.equal(result.scope, null);
    assert.equal(result.canonicalScope, null);
    assert.equal(result.expiresAt, null);
    assert.equal(result.publicAwardEligible, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE sentinel/);
  });
}

test("invalid policy and absent client do not perform database reads", async () => {
  for (const maxAgeMs of [0, -1, NaN, Infinity, 1.5]) {
    const f = fixture();
    const result = await reader({ admin: fakeAdmin(f), stages: f.stages, topScorers: f.scorers, maxAgeMs, now: () => now });
    assert.equal(result.phase, "unavailable"); assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  assert.equal((await reader({ admin: null, stages: f.stages, topScorers: f.scorers, maxAgeMs: 60_000 })).phase, "unavailable");
});

test("a caller cannot extend expiry by mutating the policy during database reads", async () => {
  const f = fixture();
  const input = { admin: fakeAdmin(f), stages: f.stages, topScorers: f.scorers, maxAgeMs: 60_000, now: () => f.clock };
  f.beforeQuery = table => {
    if (table !== "touchline_card_publications") return;
    input.maxAgeMs = 3_600_000;
    f.clock += 40_001;
  };
  const result = await reader(input);
  assert.equal(result.phase, "unavailable");
  assert.deepEqual(result.leaders, []);
});

test("provider evidence is captured before database reads rather than following caller mutations", async () => {
  const expected = await read(fixture());
  const f = fixture();
  let mutated = false;
  f.beforeQuery = table => {
    if (table !== "football_competitions") return;
    mutated = true;
    f.stages.data = { ...f.stages.data, rows: [] };
    f.scorers.data = { ...f.scorers.data, rows: [] };
  };
  const result = await read(f);
  assert.equal(mutated, true);
  assert.equal(result.phase, "shared");
  assert.deepEqual(result, expected);
});
