import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as editorial from "../lib/touchlineArena/editorial-card-profile.ts";
import * as provisional from "../lib/touchlineArena/card-engine-provisional-policy.ts";
import * as compatibility from "../lib/touchlineArena/card-engine-provisional-schema-compat.ts";
import * as stageScope from "../lib/touchlineArena/golden-boot-stage-scope.ts";
import * as eligibility from "../lib/touchlineArena/golden-boot-eligibility.ts";
import * as providerIds from "../lib/football-data/sportmonks-season-topscorers.ts";
import * as quotaCooldown from "../lib/football-data/sportmonks-quota-cooldown.ts";
import type { produceGoldenBootSnapshot } from "../lib/touchlineArena/golden-boot-producer.ts";
import type { FootballDataProvider, FootballDataResult, TouchlineSeasonStages, TouchlineSeasonTopScorers } from "../lib/football-data/types.ts";

type Row = Record<string, unknown>;
type Success<T> = Extract<FootballDataResult<T>, { ok: true }>;
type Input = Parameters<typeof produceGoldenBootSnapshot>[0];
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const competition = uuid(1), season = uuid(2), club = uuid(3);
const players = [uuid(10), uuid(11)], members = [uuid(20), uuid(21)];
const clock = Date.parse("2026-10-01T12:00:00Z");

function compile(name: string) {
  return ts.transpileModule(readFileSync(new URL(`../lib/touchlineArena/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function evaluate(javascript: string, imports: Record<string, unknown>, runtime = { Date, setTimeout, clearTimeout, performance: { now: () => performance.now() } }) {
  const exports: Record<string, unknown> = {};
  // Same realm: the actual editorial parser validates plain objects.
  vm.runInThisContext(`(function(exports, require, Date, setTimeout, clearTimeout, performance) { ${javascript}\n })`)(
    exports, (name: string) => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`); return imports[name];
    }, runtime.Date, runtime.setTimeout, runtime.clearTimeout, runtime.performance,
  );
  return exports;
}
const publication = evaluate(compile("card-publication-read-model"), {
  "server-only": {}, "next/cache": { unstable_noStore() {} },
  "@/lib/supabase/admin": { createAdminClient() { throw Error("No real database permitted"); } },
  "./editorial-card-profile.ts": editorial, "./card-engine-provisional-policy.ts": provisional,
  "./card-engine-provisional-schema-compat.ts": compatibility,
});
const canonicalReader = evaluate(compile("golden-boot-canonical-reader"), {
  "server-only": {}, "./card-publication-read-model.ts": publication,
  "../football-data/sportmonks-season-topscorers.ts": providerIds,
  "./golden-boot-stage-scope.ts": stageScope, "./golden-boot-eligibility.ts": eligibility,
});
const producerCode = compile("golden-boot-producer");
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
  const stageTime = new Date(clock - 20_000).toISOString(), scorerTime = new Date(clock - 10_000).toISOString();
  const stages: Success<TouchlineSeasonStages> = { ok: true, provider: "sportmonks", cached: true, fetchedAt: stageTime, data: {
    coverage: "complete", requestedSeasonId: "70001", leagueId: "8", fetchedAt: stageTime,
    rows: [{ id: "90001", typeId: "223", leagueId: "8", seasonId: "70001" }],
  } };
  const scorers: Success<TouchlineSeasonTopScorers> = { ok: true, provider: "sportmonks", fetchedAt: scorerTime, data: {
    coverage: "complete", scopeStatus: "complete", requestedSeasonId: "70001", fetchedAt: scorerTime, pagesRead: 1, reason: null,
    rows: players.map((_, i) => ({ providerRecordId: String(100 + i), providerPlayerId: String(200 + i), providerTeamId: "300",
      leagueId: "8", seasonId: "70001", stageId: "90001", goals: 3 })),
  } };
  const tables: Record<string, Row[]> = {
    football_competitions: [{ id: competition, provider: "sportmonks", provider_competition_id: "8" }],
    football_seasons: [{ id: season, provider: "sportmonks", provider_season_id: "70001", competition_id: competition, is_current: true, name: "2026/2027" }],
    football_players: players.map((id, i) => ({ id, provider: "sportmonks", provider_player_id: String(200 + i), current_club_id: club })),
    football_clubs: [{ id: club, provider: "sportmonks", provider_team_id: "300", competition_id: competition }],
    football_squad_members: players.map((id, i) => ({ id: members[i], provider: "sportmonks", player_id: id,
      club_id: club, competition_id: competition, status: "active", jersey_number: i + 1 })),
    touchline_card_publications: players.map((id, i) => ({ player_id: id, current_membership_id: members[i], competition_id: competition,
      effective_season: "2026-27", publication_status: "published", calculated_tier: "ruby-red", calculated_nominal_price_gbp: 10,
      last_reviewed_at: scorerTime, internal_source: "editorial" })),
    football_player_market_values: players.map(id => ({ player_id: id, market_value_eur: 2500000, verified_season: "2026-27", status: "verified", confidence: "verified", source: "editorial" })),
    touchline_card_editorial_overrides: [],
  };
  return { tables, stages, scorers, clock, sourceRevision: "9007199254740993" as unknown,
    activeToken: "", phase: "unavailable", generation: 0, finishError: false, responseLostAfterCommit: false,
    rejectedFinishReceipt: null as Row | null,
    claimOverride: null as Row | null, completionError: false, monotonic: 0,
    beforeQuery: async (_table: string) => {}, onRpc: async (_name: string, _args: Row) => {},
    onStages: async (): Promise<FootballDataResult<TouchlineSeasonStages>> => stages,
    onScorers: async (): Promise<FootballDataResult<TouchlineSeasonTopScorers>> => scorers,
    calls: [] as string[], requests: [] as Array<{ name: string; args: Row }>,
    timers: new Map<number, { callback: () => void; delay: number }>(), nextTimer: 0, budgets: [] as number[],
  };
}
type Fixture = ReturnType<typeof fixture>;
function harness(f: Fixture) {
  const admin = {
    from(table: string) {
      assert.ok(Object.hasOwn(columns, table));
      let selected: string[] = [], limit = Infinity, exact = false;
      const predicates: Array<(row: Row) => boolean> = [];
      const query = {
        select(value: string, options?: { count?: string }) {
          selected = value.split(","); exact = options?.count === "exact";
          selected.forEach(key => assert.ok(columns[table]!.split(",").includes(key), `${table}.${key}`)); return query;
        },
        eq(key: string, value: unknown) { predicates.push(row => row[key] === value); return query; },
        in(key: string, values: unknown[]) { predicates.push(row => values.includes(row[key])); return query; },
        limit(value: number) { limit = value; return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve().then(async () => {
            f.calls.push(table); await f.beforeQuery(table);
            const rows = f.tables[table]!.filter(row => predicates.every(predicate => predicate(row)));
            return { data: rows.slice(0, limit).map(row => Object.fromEntries(selected.map(key => [key, row[key]]))),
              error: null, count: exact ? rows.length : null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name: string, args: Row = {}) {
      f.calls.push(name); f.requests.push({ name, args: structuredClone(args) }); await f.onRpc(name, args);
      const error = () => ({ data: null, error: { message: "PRIVATE token/url/database sentinel" } });
      if (name === "try_begin_touchline_golden_boot_worker") {
        if (f.claimOverride) return { data: f.claimOverride, error: null };
        f.activeToken = String(args.p_token); f.phase = "pending"; f.generation++;
        return { data: { acquired: true, token: f.activeToken, generation: "1", competitionId: competition,
          seasonId: season, observedAtMs: f.clock, leaseUntilMs: f.clock + 45_000 }, error: null };
      }
      if (name === "complete_touchline_golden_boot_worker") {
        if (f.completionError) return error();
        assert.equal(args.p_token, f.activeToken); assert.equal(args.p_generation, "1");
        return { data: { completed: true, generation: "1", notBeforeMs: f.clock + 60_000 }, error: null };
      }
      if (name === "read_touchline_golden_boot_source_revision") return { data: f.sourceRevision, error: null };
      assert.equal(name, "finish_touchline_golden_boot_refresh");
      assert.equal(args.p_worker_generation, "1");
      if (args.p_token !== f.activeToken || f.phase !== "pending") return error();
      if (args.p_failure !== null) {
        f.phase = "unavailable";
        return { data: { phase: "unavailable", stateRevision: String(++f.generation), snapshot_id: null }, error: null };
      }
      if (f.finishError) return error();
      if (f.rejectedFinishReceipt) {
        f.phase = "unavailable";
        return { data: structuredClone(f.rejectedFinishReceipt), error: null };
      }
      f.phase = "ready";
      if (f.responseLostAfterCommit) return error();
      return { data: { phase: "ready", stateRevision: String(++f.generation), snapshot_id: uuid(50) }, error: null };
    },
  } as unknown as NonNullable<Input["admin"]>;
  const provider = {
    name: "sportmonks",
    async getSeasonStages(args: Row) { f.calls.push("provider:stages"); f.requests.push({ name: "provider:stages", args }); return f.onStages(); },
    async getSeasonTopScorers(args: Row) { f.calls.push("provider:scorers"); f.requests.push({ name: "provider:scorers", args }); return f.onScorers(); },
  } as unknown as FootballDataProvider;
  class ClockDate extends Date { static now() { return f.clock; } }
  const runtime = {
    Date: ClockDate as DateConstructor,
    performance: { now: () => f.monotonic },
    setTimeout: ((callback: () => void, delay: number) => {
      const timer = ++f.nextTimer; f.timers.set(timer, { callback, delay }); f.budgets.push(delay); return timer;
    }) as unknown as typeof setTimeout,
    clearTimeout: ((timer: number) => { f.timers.delete(timer); }) as unknown as typeof clearTimeout,
  };
  const produce = evaluate(producerCode, {
    "server-only": {}, "node:crypto": crypto, "../football-data/sportmonks-season-topscorers.ts": providerIds,
    "./golden-boot-canonical-reader.ts": canonicalReader,
    "../football-data/sportmonks-quota-cooldown.ts": quotaCooldown,
  }, runtime).produceGoldenBootSnapshot as typeof produceGoldenBootSnapshot;
  const input: Input = { admin, createProvider: () => provider };
  return { input, run: () => produce(input) };
}
function successfulFinishes(f: Fixture) {
  return f.requests.filter(request => request.name === "finish_touchline_golden_boot_refresh" && request.args.p_failure === null);
}
function assertPrivate(value: unknown) { assert.doesNotMatch(JSON.stringify(value), /PRIVATE|sentinel|token\/url/); }

test("durable admission denial makes no provider or authority writes", async () => {
  for (const reason of ["duplicate", "not_due"]) {
    const f = fixture(); f.claimOverride = { acquired: false, reason };
    const result = await harness(f).run();
    assert.equal(result.status, "skipped"); assert.equal(result.reason, "WORK_NOT_DUE");
    assert.equal(f.calls.some(name => name.startsWith("provider:")), false);
    assert.deepEqual(f.requests.map(call => call.name), ["try_begin_touchline_golden_boot_worker"]);
  }
});

test("malformed admission is unconfirmed and never starts or cleans up unowned work", async () => {
  for (const value of [{ acquired: false, reason: "PRIVATE" }, { acquired: true },
    { acquired: true, token: uuid(90), generation: "1", competitionId: competition,
      seasonId: season, observedAtMs: clock, leaseUntilMs: clock + 45_000 }]) {
    const f = fixture(); f.claimOverride = value;
    const result = await harness(f).run();
    assert.equal(result.status, "unconfirmed"); assertPrivate(result);
    assert.deepEqual(f.requests.map(call => call.name), ["try_begin_touchline_golden_boot_worker"]);
  }
});

test("terminal completion is acknowledged once with no invented quota", async () => {
  const f = fixture(); const result = await harness(f).run();
  assert.equal(result.status, "stored");
  const calls = f.requests.filter(call => call.name === "complete_touchline_golden_boot_worker");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.args, { p_token: f.activeToken, p_generation: "1",
    p_status: "stored", p_quota_known: false, p_cooldown_until: null });
});

test("lost completion response is unconfirmed without rerunning provider or cleanup", async () => {
  const f = fixture(); f.completionError = true;
  const result = await harness(f).run();
  assert.equal(result.status, "unconfirmed"); assert.equal(f.phase, "ready");
  assert.equal(successfulFinishes(f).length, 1);
  assert.equal(f.calls.filter(name => name === "complete_touchline_golden_boot_worker").length, 1);
  assert.equal(f.calls.filter(name => name === "provider:scorers").length, 1);
});

test("full admission round trip consumes the lease even if wall clock does not advance", async () => {
  const f = fixture();
  f.onRpc = async name => { if (name === "try_begin_touchline_golden_boot_worker") f.monotonic += 45_001; };
  const result = await harness(f).run();
  assert.equal(result.status, "unavailable");
  assert.equal(f.calls.some(name => name.startsWith("provider:")), false);
  assert.equal(f.calls.filter(name => name === "complete_touchline_golden_boot_worker").length, 1);
});

test("remaining lease limits provider budgets and prevents a second call after expiration", async () => {
  const f = fixture();
  f.onRpc = async name => { if (name === "try_begin_touchline_golden_boot_worker") f.monotonic += 43_000; };
  f.onStages = async () => { f.monotonic += 2_001; return f.stages; };
  const result = await harness(f).run();
  assert.equal(result.status, "unavailable");
  assert.deepEqual(f.budgets, [2_000]);
  assert.equal(f.requests.find(call => call.name === "provider:stages")!.args.totalBudgetMs, 2_000);
  assert.equal(f.calls.includes("provider:scorers"), false);
});

test("committed validation rejection is consumed without a conflicting cleanup write", async () => {
  for (const reason of ["PROVIDER_UNAVAILABLE", "EVIDENCE_INVALID", "CANONICAL_UNAVAILABLE"]) {
    const f = fixture();
    f.rejectedFinishReceipt = { phase: "unavailable", snapshot_id: null, stateRevision: "2", reason, idempotent: false };
    const result = await harness(f).run();
    assert.deepEqual(result, { status: "unavailable", reason, leaderCount: 0, publicAwardEligible: false,
      providerQuota: { stages: null, topscorers: null } });
    assert.equal(f.requests.filter(call => call.name === "finish_touchline_golden_boot_refresh").length, 1);
    assert.equal(f.phase, "unavailable"); assertPrivate(result);
  }
});

test("malformed rejection receipts cannot prove committed revocation", async () => {
  for (const patch of [{ reason: "PRIVATE sentinel" }, { reason: null }, { stateRevision: "0" },
    { stateRevision: 2 }, { snapshot_id: uuid(50) }, { phase: "pending" }]) {
    const f = fixture();
    f.rejectedFinishReceipt = { phase: "unavailable", snapshot_id: null, stateRevision: "2", reason: "EVIDENCE_INVALID", ...patch };
    const result = await harness(f).run();
    assert.equal(result.status, "unconfirmed"); assert.equal(result.reason, "PERSISTENCE_UNCONFIRMED");
    assert.equal(f.requests.filter(call => call.name === "finish_touchline_golden_boot_refresh").length, 2);
    assertPrivate(result);
  }
});

test("actual canonical graph gates a single all-ties finish using unchanged envelopes and exact text revision", async () => {
  const f = fixture(), originalStages = structuredClone(f.stages), originalScorers = structuredClone(f.scorers);
  const result = await harness(f).run();
  assert.deepEqual(result, { status: "stored", reason: null, leaderCount: 2, publicAwardEligible: false,
    providerQuota: { stages: null, topscorers: null } });
  const writes = successfulFinishes(f); assert.equal(writes.length, 1);
  const args = writes[0]!.args;
  assert.deepEqual(args.p_stages, originalStages); assert.deepEqual(args.p_scorers, originalScorers);
  assert.equal(args.p_revision, "9007199254740993"); assert.equal(args.p_ttl_ms, 60_000);
  assert.deepEqual(args.p_leaders, players.map((id, i) => ({ player_id: id, provider_player_id: String(200 + i),
    club_id: club, provider_team_id: "300", membership_id: members[i], goals: 3 })));
  assert.equal(f.calls.filter(call => call === "read_touchline_golden_boot_source_revision").length, 2);
  assert.ok(f.calls.indexOf("try_begin_touchline_golden_boot_worker") < f.calls.indexOf("provider:stages"));
  assert.ok(f.calls.indexOf("read_touchline_golden_boot_source_revision") < f.calls.indexOf("touchline_card_publications"));
  const { quotaObserver, ...scorerArgs } = f.requests.find(request => request.name === "provider:scorers")!.args;
  assert.equal(typeof quotaObserver, "function");
  assert.deepEqual(scorerArgs, { seasonId: "70001", totalBudgetMs: 12_000, maxPages: 10 });
  assert.deepEqual(f.budgets, [3_000, 12_000]); assert.equal(f.timers.size, 0);
});

test("producer preserves trace on provider failure without changing SQL evidence", async () => {
  const f = fixture();
  const trace = {
    coverage: "complete" as const, reusedRequestIds: [],
    observations: [{ requestId: uuid(90), operation: "stages" as const, attempt: 1, status: 429,
      observedAt: new Date(clock).toISOString(), requestedEntity: "Stages", remaining: 0,
      resetAt: new Date(clock + 120_000).toISOString(), cooldownUntil: new Date(clock + 180_000).toISOString() }],
  };
  f.onStages = async () => {
    const args = f.requests.find(request => request.name === "provider:stages")!.args;
    (args.quotaObserver as (value: typeof trace) => void)(trace);
    throw Error("PRIVATE provider sentinel");
  };
  const result = await harness(f).run();
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.providerQuota, { stages: trace, topscorers: null });
  const completion = f.requests.find(call => call.name === "complete_touchline_golden_boot_worker")!;
  assert.equal(completion.args.p_quota_known, false);
  assert.equal(completion.args.p_cooldown_until, new Date(clock + 180_000).toISOString());
  const frozen = structuredClone(result);
  trace.observations[0]!.remaining = 99;
  const args = f.requests.find(request => request.name === "provider:stages")!.args;
  (args.quotaObserver as (value: typeof trace) => void)(trace);
  assert.deepEqual(result, frozen, "late callback cannot upgrade returned trace");
  assert.equal(successfulFinishes(f).length, 0);
  assertPrivate(result);
});

test("successful facts and failed finish both retain trace without altering the SQL football envelopes", async () => {
  for (const finishError of [false, true]) {
    const f = fixture(); f.finishError = finishError;
    const stagesBefore = structuredClone(f.stages), scorersBefore = structuredClone(f.scorers);
    const traces = {
      stages: { coverage: "complete" as const, reusedRequestIds: [uuid(90)], observations: [{
        requestId: uuid(90), operation: "stages" as const, attempt: 1, status: 200,
        observedAt: f.stages.fetchedAt, requestedEntity: "Stages", remaining: 5, resetAt: null, cooldownUntil: null,
      }] },
      topscorers: { coverage: "unknown" as const, reusedRequestIds: [], observations: [] },
    };
    f.onStages = async () => {
      const args = f.requests.find(request => request.name === "provider:stages")!.args;
      (args.quotaObserver as (value: typeof traces.stages) => void)(traces.stages);
      return f.stages;
    };
    f.onScorers = async () => {
      const args = f.requests.find(request => request.name === "provider:scorers")!.args;
      (args.quotaObserver as (value: typeof traces.topscorers) => void)(traces.topscorers);
      return f.scorers;
    };
    const result = await harness(f).run();
    assert.equal(result.status, finishError ? "unavailable" : "stored");
    assert.deepEqual(result.providerQuota, traces);
    const write = successfulFinishes(f)[0]!;
    assert.deepEqual(write.args.p_stages, stagesBefore);
    assert.deepEqual(write.args.p_scorers, scorersBefore);
    assert.equal(write.args.p_ttl_ms, 60_000);
    assertPrivate(result);
  }
});

const invalidEditorial: Array<[string, (f: Fixture) => void]> = [
  ["unsafe market integer", f => { f.tables.football_player_market_values![0]!.market_value_eur = "9007199254740992"; }],
  ["shirt 1000", f => { f.tables.football_squad_members![0]!.jersey_number = 1000; }],
  ["approved shirt override 1000", f => { f.tables.touchline_card_editorial_overrides!.push({ player_id: players[0], field_key: "shirtNumber", status: "approved", effective_value: 1000 }); }],
  ["infinite reviewed timestamp", f => { f.tables.touchline_card_publications![0]!.last_reviewed_at = "infinity"; }],
  ["one missing tied publication", f => { f.tables.touchline_card_publications!.pop(); }],
];
for (const [label, mutate] of invalidEditorial) {
  test(`real TS editorial policy prevents persistence: ${label}`, async () => {
    const f = fixture(); mutate(f); const result = await harness(f).run();
    assert.equal(result.status, "unavailable"); assert.equal(result.reason, "CANONICAL_UNAVAILABLE");
    assert.equal(result.publicAwardEligible, false); assert.equal(f.phase, "unavailable");
    assert.ok(f.calls.includes("touchline_card_publications"), "Exercise the actual publication/parser path");
    assert.equal(successfulFinishes(f).length, 0); assertPrivate(result);
  });
}

test("source revision drift prevents finish even when the canonical DTO is otherwise valid", async () => {
  const f = fixture(); let reads = 0;
  f.onRpc = async name => { if (name === "read_touchline_golden_boot_source_revision" && ++reads === 2) f.sourceRevision = "9007199254740994"; };
  const result = await harness(f).run(); assert.equal(result.status, "unavailable");
  assert.equal(successfulFinishes(f).length, 0); assert.equal(f.phase, "unavailable");
});

test("non-text revision is not silently rounded or coerced", async () => {
  const f = fixture(); f.sourceRevision = 20;
  assert.equal((await harness(f).run()).status, "unavailable"); assert.equal(successfulFinishes(f).length, 0);
});

test("revision fence preserves exact bigint boundaries and rejects overflow or noncanonical text", async () => {
  for (const value of ["0", "9", "10", "9223372036854775807"]) {
    const f = fixture(); f.sourceRevision = value;
    assert.equal((await harness(f).run()).status, "stored", value);
    assert.equal(successfulFinishes(f)[0]!.args.p_revision, value);
  }
  for (const value of ["9223372036854775808", "10000000000000000000", "01", "-1", "1e3"]) {
    const f = fixture(); f.sourceRevision = value;
    assert.equal((await harness(f).run()).status, "unavailable", value);
    assert.equal(successfulFinishes(f).length, 0);
  }
});

test("scope changing between initial lookup and mandatory reader is rejected", async () => {
  const f = fixture(); let seasons = 0;
  f.beforeQuery = async table => { if (table === "football_seasons" && ++seasons === 2) f.tables.football_seasons![0]!.id = uuid(90); };
  assert.equal((await harness(f).run()).status, "unavailable"); assert.equal(successfulFinishes(f).length, 0);
});

test("ambiguous current scope performs neither begin nor provider GET", async () => {
  const f = fixture(); f.tables.football_seasons!.push({ ...f.tables.football_seasons![0], id: uuid(90) });
  assert.equal((await harness(f).run()).status, "unavailable"); assert.equal(f.requests.length, 0);
});

test("provider rejection is sanitized and same-token failure clears eligibility", async () => {
  const f = fixture(); f.onStages = async () => { throw Error("PRIVATE provider token/url sentinel"); };
  const result = await harness(f).run();
  assert.equal(result.status, "unavailable"); assert.equal(result.reason, "PROVIDER_UNAVAILABLE"); assertPrivate(result);
  assert.equal(f.phase, "unavailable"); assert.equal(successfulFinishes(f).length, 0);
  assert.equal(f.calls.includes("provider:scorers"), false); assert.equal(f.timers.size, 0);
});

test("provider cardinality bound rejects over 500 rows before the canonical reader", async () => {
  const f = fixture(); f.scorers.data = { ...f.scorers.data, rows: Array.from({ length: 501 }, () => f.scorers.data.rows[0]!) };
  assert.equal((await harness(f).run()).reason, "EVIDENCE_INVALID");
  assert.equal(f.calls.includes("football_players"), false); assert.equal(successfulFinishes(f).length, 0);
});

test("input and provider DTO mutations during awaits cannot replace captured boundaries or evidence", async () => {
  const f = fixture(), h = harness(f), stages = structuredClone(f.stages), scorers = structuredClone(f.scorers);
  f.beforeQuery = async () => { h.input.admin = null; h.input.createProvider = () => { throw Error("Changed factory must not be used"); }; };
  f.onRpc = async name => {
    if (name !== "read_touchline_golden_boot_source_revision") return;
    f.stages.data = { ...f.stages.data, requestedSeasonId: "99999" };
    f.scorers.data = { ...f.scorers.data, rows: [] };
  };
  assert.equal((await h.run()).status, "stored");
  assert.deepEqual(successfulFinishes(f)[0]!.args.p_stages, stages);
  assert.deepEqual(successfulFinishes(f)[0]!.args.p_scorers, scorers);
});

test("finish error attempts same-token sanitized failure without retrying begin or exposing error", async () => {
  const f = fixture(); f.finishError = true; const result = await harness(f).run();
  assert.equal(result.status, "unavailable"); assertPrivate(result);
  const finishes = f.requests.filter(row => row.name === "finish_touchline_golden_boot_refresh");
  assert.equal(finishes.length, 2); assert.equal(finishes[0]!.args.p_token, finishes[1]!.args.p_token);
  assert.equal(finishes[1]!.args.p_failure, "CANONICAL_UNAVAILABLE");
  assert.equal(f.calls.filter(call => call === "try_begin_touchline_golden_boot_worker").length, 1);
});

test("response lost after successful commit is unconfirmed, never falsely claimed revoked", async () => {
  const f = fixture(); f.responseLostAfterCommit = true;
  const result = await harness(f).run(); assert.equal(result.status, "unconfirmed"); assert.equal(f.phase, "ready"); assertPrivate(result);
});

test("superseded token cannot clear or restore the newer ready state", async () => {
  const f = fixture(); let reads = 0;
  f.onRpc = async name => {
    if (name === "read_touchline_golden_boot_source_revision" && ++reads === 2) { f.activeToken = "NEWER_RUN"; f.phase = "ready"; }
  };
  assert.equal((await harness(f).run()).status, "unconfirmed");
  assert.equal(f.activeToken, "NEWER_RUN"); assert.equal(f.phase, "ready");
  assert.equal(f.calls.filter(call => call === "try_begin_touchline_golden_boot_worker").length, 1);
});

test("timeout observes late rejection, clears its timer and never starts the next provider call", async () => {
  const f = fixture(); let rejectProvider!: (reason: Error) => void;
  f.onStages = () => new Promise((_, reject) => { rejectProvider = reject; });
  const pending = harness(f).run();
  for (let n = 0; n < 100 && !f.calls.includes("provider:stages"); n++) await Promise.resolve();
  assert.ok(f.calls.includes("provider:stages"));
  assert.equal(f.timers.size, 1); const timer = [...f.timers.values()][0]!;
  assert.equal(timer.delay, 3_000); f.clock += 3_000; timer.callback();
  assert.equal((await pending).reason, "PROVIDER_UNAVAILABLE");
  rejectProvider(Error("PRIVATE late rejection sentinel")); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.timers.size, 0); assert.equal(f.calls.includes("provider:scorers"), false);
});

test("aggregate deadline prevents a later call after the provider phase exceeds 15s", async () => {
  const f = fixture(); f.onStages = async () => { f.clock += 15_001; return f.stages; };
  assert.equal((await harness(f).run()).reason, "PROVIDER_UNAVAILABLE");
  assert.equal(f.calls.includes("provider:scorers"), false); assert.equal(f.timers.size, 0);
});
