import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { buildTouchlineFantasyArenaLineup } from "../lib/touchlineFantasy/arena-lineup.ts";
import { resolveTouchlineFantasyMarketAccess } from "../lib/touchlineFantasy/market-plan-policy.ts";
import { readClubRelatedSnapshot } from "../lib/touchlineFantasy/club-round-confirmation.ts";

const source = readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8");
test("Arena has a narrow projection without replacing the full API", () => {
  assert.match(source, /export async function loadTouchlineFantasyArenaSnapshot/);
  assert.match(source, /export async function loadTouchlineFantasySnapshot/);
});

function scenario(input = source, options: { collectionEnabled?: boolean; related?: unknown; pending?: boolean; state?: string; gameweekState?: string; incomplete?: boolean; failure?: string; entitlement?: Record<string, unknown> | null; entitlementError?: boolean; missingCurrentLineup?: boolean; gameweekScoreRow?: { gameweek_score: number } | null; seasonScores?: Array<{ gameweek_score: number; settlement_status: string }>; seasonScoreError?: boolean; qaRuntime?: boolean; availabilityGate?: Promise<void>; onAvailabilityStarted?: () => void; availabilityUnavailable?: boolean; availabilityFailure?: boolean; readGates?: Record<string, Promise<void>>; onReadStarted?: (name: string) => void; queryFailure?: string; alertsGate?: Promise<void>; onAlertsStarted?: () => void } = {}) {
  const calls: Array<{ name: string; args?: unknown }> = [];
  const queries: string[] = [];
  const selectedColumns: string[] = [];
  const enrichmentWriterTrace: string[][] = [];
  const ids = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  const selections = ids.map((player_id, i) => ({ player_id, slot_id: `s${i}` }));
  const catalogue = ids.map(canonicalPlayerId => ({ canonicalPlayerId, name: canonicalPlayerId }));
  const geometry = { "4-3-3": { slots: ids.map((_, i) => ({ id: `s${i}`, role: "midfielder", x: 50, y: 50 })) } };
  const weeks = [{ id: "previous", gameweek_number: 1, state: "FINAL" }, { id: "active", gameweek_number: 2, state: options.gameweekState ?? "MARKET_OPEN" }];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const waitForRead = async (name: string) => {
    options.onReadStarted?.(name);
    if (options.readGates?.[name]) await options.readGates[name];
  };
  const admin = {
    async rpc(name: string, args?: unknown) {
      calls.push({ name, args });
      if (name === "touchline_fantasy_reconcile_lineup_alerts") {
        options.onAlertsStarted?.();
        if (options.alertsGate) await options.alertsGate;
      }
      return { data: name === "touchline_qa_club_market_is_open" ? true : { ok: true }, error: options.failure === name ? { code: "40001" } : null };
    },
    from(table: string) {
      queries.push(table);
      const filters: Array<[string, unknown]> = [];
      const chain = {
        select: (columns: string) => { selectedColumns.push(columns); return chain; }, order: () => chain,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
        in: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
        maybeSingle: () => chain,
        async then(resolve: (value: unknown) => unknown) {
          await waitForRead(table);
          let data: unknown;
          if (table === "touchline_fantasy_configs") data = { season_id: "season", max_players_per_club: 11, lock_offset_minutes: 5 };
          else if (table === "touchline_fantasy_gameweeks") data = weeks;
          else if (table === "touchline_fantasy_entitlements") {
            assert.ok(filters.some(([k,v]) => k === "user_id" && v === "customer"));
            data = options.entitlement === undefined ? { status: "active", plan_key: "standard" } : options.entitlement;
          } else if (table === "touchline_fantasy_user_gameweeks") {
            assert.deepEqual(filters, [["user_id", "customer"], ["gameweek_id", "active"]]);
            data = options.missingCurrentLineup ? null : { id: "ug", formation_code: "4-3-3", selected_coach_id: "draft-coach", locked_coach_id: "locked-coach", state: options.state ?? "LOCKED", total_market_value_eur: 10, collection_related_snapshot: options.related };
          } else if (table === "touchline_fantasy_locked_selections" || table === "touchline_fantasy_user_gameweek_selections") {
            assert.deepEqual(filters, [["user_gameweek_id", "ug"]]);
            data = table.includes("locked") ? selections.slice(0, options.incomplete ? 10 : 11) : [{ player_id: "wrong-draft", slot_id: "s0" }];
          } else if (table === "touchline_fantasy_user_gameweek_scores" && filters.some(([key]) => key === "touchline_fantasy_user_gameweeks.user_id")) {
            assert.deepEqual(filters, [["touchline_fantasy_user_gameweeks.user_id", "customer"], ["touchline_fantasy_user_gameweeks.touchline_fantasy_gameweeks.season_id", "season"]]);
            return Promise.resolve({ data: options.seasonScoreError ? null : options.seasonScores ?? [], error: options.seasonScoreError ? { code: "08006" } : null }).then(resolve);
          } else if (table === "touchline_fantasy_user_gameweek_scores") {
            assert.deepEqual(filters, [["user_gameweek_id", "ug"]]);
            data = options.gameweekScoreRow ?? null;
          } else if (["touchline_fantasy_lineup_alerts", "touchline_fantasy_player_fixture_scores"].includes(table)) data = [];
          else assert.fail(`Unexpected table ${table}`);
          return Promise.resolve({ data, error: table === options.queryFailure || (table === "touchline_fantasy_entitlements" && options.entitlementError) ? { code: "08006" } : null }).then(resolve);
        },
      };
      return chain;
    },
  };
  const stripped = stripTypeScriptTypes(input);
  const isBaseline = !input.includes("async function loadFantasySnapshotCore");
  const name = isBaseline ? "loadTouchlineFantasySnapshot" : "loadFantasySnapshotCore";
  const start = stripped.indexOf(`async function ${name}`);
  assert.ok(start >= 0);
  const lifecycle = stripTypeScriptTypes(readFileSync(new URL("../lib/touchlineFantasy/gameweek-lifecycle.ts", import.meta.url), "utf8"))
    .replace(/^import[^;]*;\s*$/gm, "").replace(/^export /gm, "");
  const qaOpening = stripTypeScriptTypes(readFileSync(new URL("../lib/touchlineFantasy/qa-club-market.ts", import.meta.url), "utf8"))
    .replace(/^import[^;]*;\s*$/gm, "").replace(/^export /gm, "");
  const core = runInNewContext(`${lifecycle}\n${qaOpening}\n${stripped.slice(start)}\n${name};`, {
    process: { env: {
      ...(options.collectionEnabled ? { TOUCHLINE_CLUB_COLLECTION_ENABLED: "true" } : {}),
      ...(options.qaRuntime ? { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa",
        TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
        TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
        SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co" } : {}),
    } },
    readClubRelatedSnapshot,
    createAdminClient: () => admin,
    resolveTouchlineFantasyMarketAccess,
    text: (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null,
    number: (v: unknown) => typeof v === "number" ? v : null,
    rows: (v: unknown) => Array.isArray(v) ? v : [],
    parseGameweek: (r: { id: string; gameweek_number: number; state: string }) => ({ id: r.id, number: r.gameweek_number, state: r.state }),
    readTouchlineFormationGeometryRegistry: async () => { queries.push("geometry"); return geometry; },
    loadCatalogue: async () => { await waitForRead("catalogue"); return catalogue; },
    loadCoaches: async () => { queries.push("coaches"); await waitForRead("coaches"); if (options.pending) await pending; return []; },
    loadRankings: async (_a: unknown, gw: string, season: string, user: string) => { assert.equal(gw, "active"); assert.equal(season, "season"); assert.equal(user, "customer"); queries.push("rankings"); await waitForRead("rankings"); if (options.pending) await pending; return { gameweek: [], season: [] }; },
    readGameweekMatchCardIndicators: async (_admin: unknown, season: string, gw: string, ids: string[]) => {
      assert.equal(season, "season"); assert.equal(gw, "active"); assert.deepEqual(ids, selections.map((selection) => selection.player_id));
      queries.push("match-cards"); return [];
    },
    readGameweekPlayerAvailability: async (_admin: unknown, season: string, gw: string, ids: string[]) => {
      assert.equal(season, "season"); assert.equal(gw, "active");
      assert.deepEqual([...ids], (options.missingCurrentLineup ? [] : options.incomplete ? selections.slice(0, 10) : selections).map(row => row.player_id));
      queries.push("player-availability");
      enrichmentWriterTrace.push(calls.map(call => call.name));
      options.onAvailabilityStarted?.();
      if (options.availabilityGate) await options.availabilityGate;
      if (options.availabilityFailure) throw new Error("AVAILABILITY_TEST_FAILURE");
      return options.availabilityUnavailable ? null : [];
    },
    fetch: () => assert.fail("Network forbidden"),
  });
  // Explicit current Standard contract, separate from the immutable XI trace.
  const golden = {
    userId: "customer", entitlementActive: true, qaClubMarketOpen: false,
    marketAccess: resolveTouchlineFantasyMarketAccess("standard"),
    config: { budgetEur: 400_000_000, maxPlayersPerClub: 11, lockOffsetMinutes: 5 },
    gameweeks: [{ id: "previous", number: 1, state: "FINAL" }, { id: "active", number: 2, state: "MARKET_OPEN" }],
    activeGameweek: { id: "active", number: 2, state: "MARKET_OPEN" },
    userGameweek: { id: "ug", formationCode: "4-3-3", state: "LOCKED", totalMarketValueEur: 10, carriedFromPrevious: false, selectedCoachId: "locked-coach" },
    selections: selections.map(r => ({ playerId: r.player_id, slotId: r.slot_id })),
    catalogue, coaches: [], lineupAlerts: [], matchCardIndicators: [], playerAvailabilityIndicators: [], formationRegistry: geometry,
    gameweekScore: 0, seasonScore: 0, matchHistory: [], gameweekRanking: [], seasonRanking: [],
  };
  return { run: (projection: "arena" | "full", registry?: object, reconcileLifecycle = true) => core({ id: "customer" }, projection, registry, undefined, reconcileLifecycle), calls, queries, selectedColumns, enrichmentWriterTrace, release, golden };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("collection gate projects only the caller's sanitized related snapshot and OFF needs no new column",async()=>{
  const related=[{playerId:"owned-player",area:"reserves",slot:0,privateBalance:999}];
  const off=scenario(source,{related});
  assert.equal("collectionRelatedSnapshot" in (await off.run("full")).userGameweek,false);
  assert.equal(off.selectedColumns.some(columns=>columns.includes("collection_related_snapshot")),false);
  assert.equal((await off.run("full")).config.seasonId,undefined);
  const on=scenario(source,{collectionEnabled:true,related});
  assert.equal((await on.run("full")).config.seasonId,"season");
  assert.deepEqual(plain((await on.run("full")).userGameweek.collectionRelatedSnapshot),[{playerId:"owned-player",area:"reserves",slot:0}]);
  assert.equal(on.selectedColumns.some(columns=>columns.includes("collection_related_snapshot")),true);
  const invalid=scenario(source,{collectionEnabled:true,related:[...related,...related]});
  assert.equal((await invalid.run("full")).userGameweek.collectionRelatedSnapshot,null);
});

test("verified no-plan account receives only Beta onboarding, not gameplay or an invented budget", async () => {
  const s = scenario(source, { entitlement: null });
  const snapshot = await s.run("full");
  assert.equal(snapshot.betaEnrollmentAvailable, true);
  assert.equal(snapshot.entitlementActive, false);
  assert.equal(snapshot.marketAccess, null);
  assert.equal(snapshot.config.budgetEur, 0);
  assert.equal(snapshot.activeGameweek, null);
  assert.equal(snapshot.userGameweek, null);
  for (const field of ["selections", "catalogue", "coaches", "gameweeks", "matchHistory", "gameweekRanking", "seasonRanking"]) assert.equal(snapshot[field].length, 0);
  assert.equal(snapshot.gameweekScore, 0);
  assert.equal(snapshot.seasonScore, 0);
  assert.ok(!s.calls.some(call => call.name === "touchline_fantasy_prepare_user_gameweek"));
  assert.ok(!s.queries.includes("touchline_fantasy_user_gameweeks"));
  assert.equal(await scenario(source, { entitlement: null }).run("arena"), null);
});

test("unavailable entitlement read or unrecognised existing plan never offers free replacement", async () => {
  for (const options of [
    { entitlement: null, entitlementError: true },
    { entitlement: { status: "active", plan_key: "unknown" } },
    { entitlement: { status: "active", plan_key: null } },
  ]) {
    const s = scenario(source, options);
    assert.equal(await s.run("full"), null);
    assert.ok(!s.calls.some(call => call.name === "touchline_fantasy_prepare_user_gameweek"));
  }
  const inactive = await scenario(source, { entitlement: { status: "inactive", plan_key: "standard" } }).run("full");
  assert.equal(inactive.entitlementActive, false);
  assert.notEqual(inactive.betaEnrollmentAvailable, true);
});

test("Arena reuses the supplied geometry reference; omitted registry and full API still read", async () => {
  const arena = scenario();
  const registry = arena.golden.formationRegistry;
  const value = await arena.run("arena", registry);
  assert.equal(value.formationRegistry, registry);
  assert.equal(arena.queries.filter(q => q === "geometry").length, 0);
  const fallback = scenario();
  assert.equal((await fallback.run("arena")).formationRegistry, fallback.golden.formationRegistry);
  assert.equal(fallback.queries.filter(q => q === "geometry").length, 1);
  const full = scenario();
  assert.equal((await full.run("full", registry)).formationRegistry, full.golden.formationRegistry);
  assert.equal(full.queries.filter(q => q === "geometry").length, 1);
  assert.deepEqual(plain(arena.calls), plain(fallback.calls));
});

test("full projection retains immutable gameplay baseline plus plan presentation; Arena retains exact XI and writer trace", async () => {
  const full = scenario(); const arena = scenario();
  const fullValue = await full.run("full"); const arenaValue = await arena.run("arena");
  assert.deepEqual(plain(fullValue), { ...full.golden, plan: { active: true, expiresAt: null } });
  assert.ok(!full.queries.includes("match-cards"), "pre-match polling must not query match events");
  const expectedWriters = [
    { name: "touchline_fantasy_sync_gameweeks" },
    { name: "touchline_fantasy_reconcile_gameweek", args: { p_gameweek_id: "previous" } },
    { name: "touchline_fantasy_prepare_user_gameweek", args: { p_user_id: "customer", p_gameweek_id: "active" } },
    { name: "touchline_fantasy_reconcile_lineup_alerts", args: { p_gameweek_id: "active" } },
  ];
  assert.deepEqual(plain(full.calls), expectedWriters);
  assert.deepEqual(plain(arena.calls), expectedWriters);
  const xi = buildTouchlineFantasyArenaLineup(arenaValue);
  assert.equal(xi?.players.length, 11); assert.equal(xi?.coachProviderId, "locked-coach");
  assert.deepEqual(plain(xi), plain(buildTouchlineFantasyArenaLineup(fullValue)));
  assert.deepEqual(Object.keys(arenaValue).sort(), ["activeGameweek", "catalogue", "formationRegistry", "playerAvailabilityIndicators", "selections", "userGameweek"]);
  assert.ok(full.queries.includes("player-availability"));
  assert.ok(arena.queries.includes("player-availability"));
  assert.ok(!arena.queries.some(q => q === "coaches" || q === "rankings" || q.includes("scores") || q.includes("alerts")));
  assert.ok(!arena.queries.includes("match-cards"));
});

test("customer read projection never queues lifecycle writers", async () => {
  const read = scenario();
  const snapshot = await read.run("full", undefined, false);
  assert.equal(snapshot?.userGameweek?.state, "LOCKED");
  assert.deepEqual(plain(read.calls), []);
  assert.ok(read.queries.includes("touchline_fantasy_user_gameweeks"));
});

test("a new round without a current XI retains final season points without creating a draft", async () => {
  const read = scenario(source, { missingCurrentLineup: true, seasonScores: [
    { gameweek_score: 63.25, settlement_status: "FINAL" },
    { gameweek_score: 57.02, settlement_status: "FINAL" },
    { gameweek_score: 999, settlement_status: "PROVISIONAL" },
  ] });
  const snapshot = await read.run("full", undefined, false);
  assert.equal(snapshot.userGameweek, null);
  assert.equal(snapshot.selections.length, 0);
  assert.equal(snapshot.gameweekScore, 0, "previous points must never become new-round points");
  assert.equal(snapshot.seasonScore.toFixed(2), "120.27");
  assert.deepEqual(plain(read.calls), [], "reading history must not write or prepare the customer's team");
  assert.ok(!read.queries.includes("touchline_fantasy_locked_selections"));
});

test("failed season history is unavailable, never a successful zero-point snapshot", async () => {
  for (const missingCurrentLineup of [true, false]) {
    await assert.rejects(scenario(source, { missingCurrentLineup, seasonScoreError: true }).run("full", undefined, false), /TOUCHLINE_SEASON_SCORE_READ_UNAVAILABLE/);
  }
});

test("Arena's narrow projection does not acquire a season-score dependency", async () => {
  const read = scenario(source, { seasonScoreError: true });
  assert.ok(await read.run("arena", undefined, false));
  assert.ok(!read.queries.includes("touchline_fantasy_user_gameweek_scores"));
});

test("live round alone reads persisted match cards in the full projection", async () => {
  const full = scenario(source, { gameweekState: "LIVE" });
  const snapshot = await full.run("full");
  assert.deepEqual(snapshot.matchCardIndicators, []);
  assert.ok(full.queries.includes("match-cards"));
  const arena = scenario(source, { gameweekState: "LIVE" });
  await arena.run("arena");
  assert.ok(!arena.queries.includes("match-cards"));
});

test("unused enrichments can remain pending while Arena completes", async () => {
  const full = scenario(source, { pending: true }); const arena = scenario(source, { pending: true });
  let completed = false; const fullResult = full.run("full").then(() => { completed = true; });
  assert.equal((await arena.run("arena")).selections.length, 11);
  assert.equal(completed, false); full.release(); await fullResult;
});

for (const options of [{ state: "DRAFT" }, { incomplete: true }]) {
  test(`Arena adapter refuses ${JSON.stringify(options)}`, async () => {
    assert.equal(buildTouchlineFantasyArenaLineup(await scenario(source, options).run("arena")), null);
  });
}
for (const failure of ["touchline_fantasy_sync_gameweeks", "touchline_fantasy_reconcile_gameweek", "touchline_fantasy_prepare_user_gameweek"]) {
  test(`Arena fails closed on ${failure}`, async () => {
    const run = scenario(source, { failure }); assert.equal(await run.run("arena"), null);
    assert.equal(run.calls.at(-1)?.name, failure);
    assert.ok(!run.queries.includes("touchline_fantasy_user_gameweeks"));
  });
}


test("full enrichments start together after writers; a slow availability read does not delay cards or QA", async () => {
  let release!: () => void, started!: () => void;
  const availabilityGate = new Promise<void>(resolve => { release = resolve; });
  const availabilityStarted = new Promise<void>(resolve => { started = resolve; });
  const s = scenario(source, { collectionEnabled: true, qaRuntime: true, gameweekState: "LIVE",
    availabilityGate, onAvailabilityStarted: started });
  let settled = false;
  const result = s.run("full").then(value => { settled = true; return value; });
  try {
    await availabilityStarted;
    assert.ok(s.queries.includes("match-cards"), "independent cards started before availability settled");
    assert.ok(s.calls.some(call => call.name === "touchline_qa_club_market_is_open"), "QA read started before availability settled");
    assert.equal(settled, false, "snapshot still waits for all enrichment outcomes");
    assert.deepEqual(s.enrichmentWriterTrace[0], ["touchline_fantasy_sync_gameweeks",
      "touchline_fantasy_reconcile_gameweek", "touchline_fantasy_reconcile_lineup_alerts"], "writers completed before enrichments");
  } finally { release(); }
  const snapshot = await result;
  assert.equal(snapshot.qaClubMarketOpen, true);
  assert.deepEqual(plain(snapshot.playerAvailabilityIndicators), []);
  assert.deepEqual(plain(snapshot.matchCardIndicators), []);
  assert.equal(s.calls.filter(call => call.name === "touchline_qa_club_market_is_open").length, 1);
});

test("parallel enrichment preserves unavailable and rejected reads and the Arena boundary", async () => {
  const unavailable = scenario(source, { gameweekState: "LIVE", availabilityUnavailable: true });
  const snapshot = await unavailable.run("full", undefined, false);
  assert.equal(snapshot.playerAvailabilityIndicators, null, "unavailable is not a fabricated empty list");
  assert.deepEqual(unavailable.calls, [], "read-only loader starts no writers");
  await assert.rejects(scenario(source, { gameweekState: "LIVE", availabilityFailure: true }).run("full", undefined, false), /AVAILABILITY_TEST_FAILURE/);
  const arena = scenario(source, { collectionEnabled: true, qaRuntime: true, gameweekState: "LIVE" });
  await arena.run("arena", undefined, false);
  assert.ok(!arena.queries.includes("match-cards"));
  assert.deepEqual(arena.calls, [], "Arena starts neither lifecycle writers nor QA opening read");
});


function readBarrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

for (const independentRead of ["catalogue", "coaches", "rankings"]) {
  test(`read-only XI/history starts while ${independentRead} remains pending`, async () => {
    const blocked = readBarrier();
    const historyStarted = readBarrier();
    const s = scenario(source, {
      readGates: { [independentRead]: blocked.promise },
      onReadStarted: name => { if (name === "touchline_fantasy_player_fixture_scores") historyStarted.release(); },
    });
    let completed = false;
    const result = s.run("full", undefined, false).then(value => { completed = true; return value; });
    try {
      await historyStarted.promise;
      assert.equal(completed, false, "a pending independent read still blocks publishing the snapshot");
      for (const table of ["touchline_fantasy_user_gameweek_selections", "touchline_fantasy_locked_selections",
        "touchline_fantasy_user_gameweek_scores", "touchline_fantasy_lineup_alerts"]) {
        assert.ok(s.queries.includes(table), `${table} must not wait for ${independentRead}`);
      }
      assert.deepEqual(s.calls, [], "read-only dependency chain has no lifecycle writers");
    } finally { blocked.release(); }
    const snapshot = await result;
    assert.deepEqual(plain(snapshot), { ...s.golden, plan: { active: true, expiresAt: null } });
    assert.equal(s.queries.filter(name => name === "touchline_fantasy_user_gameweeks").length, 1,
      "both branches reuse the same query promise, not a second thenable request");
  });
}

test("read-only dependent queries wait for the confirmed user-gameweek", async () => {
  const blocked = readBarrier();
  const userGameweekStarted = readBarrier();
  const s = scenario(source, {
    readGates: { touchline_fantasy_user_gameweeks: blocked.promise },
    onReadStarted: name => { if (name === "touchline_fantasy_user_gameweeks") userGameweekStarted.release(); },
  });
  const result = s.run("full", undefined, false);
  try {
    await userGameweekStarted.promise;
    await nextTurn(); // Drain ready continuations; the explicit query barrier remains held.
    assert.ok(!s.queries.includes("touchline_fantasy_user_gameweek_selections"));
    assert.ok(!s.queries.includes("touchline_fantasy_user_gameweek_scores"));
    assert.ok(!s.queries.includes("touchline_fantasy_lineup_alerts"));
  } finally { blocked.release(); }
  assert.equal((await result).selections.length, 11);
});

test("reconciliation retains the independent-read and alert-writer barriers", async () => {
  for (const independentRead of ["catalogue", "coaches", "rankings"]) {
    const blocked = readBarrier();
    const userGameweekStarted = readBarrier();
    const alertsStarted = readBarrier();
    const alerts = readBarrier();
    const s = scenario(source, {
      readGates: { [independentRead]: blocked.promise },
      onReadStarted: name => { if (name === "touchline_fantasy_user_gameweeks") userGameweekStarted.release(); },
      alertsGate: alerts.promise, onAlertsStarted: alertsStarted.release,
    });
    const result = s.run("full");
    try {
      await userGameweekStarted.promise;
      await nextTurn(); // User-gameweek resolves fully while the independent read stays blocked.
      assert.ok(!s.calls.some(call => call.name === "touchline_fantasy_reconcile_lineup_alerts"),
        `alert writer must still wait for ${independentRead}`);
      assert.ok(!s.queries.includes("touchline_fantasy_locked_selections"));
      blocked.release();
      await alertsStarted.promise;
      await nextTurn(); // The writer barrier stays held; no dependent read may start.
      for (const table of ["touchline_fantasy_user_gameweek_selections", "touchline_fantasy_locked_selections",
        "touchline_fantasy_user_gameweek_scores", "touchline_fantasy_lineup_alerts"]) {
        assert.ok(!s.queries.includes(table), `${table} must wait for alert writer completion`);
      }
    } finally { blocked.release(); alerts.release(); }
    assert.equal((await result).selections.length, 11);
    assert.deepEqual(s.calls.map(call => call.name), ["touchline_fantasy_sync_gameweeks",
      "touchline_fantasy_reconcile_gameweek", "touchline_fantasy_prepare_user_gameweek",
      "touchline_fantasy_reconcile_lineup_alerts"]);
  }
});

test("parallel user-gameweek and locked-XI failures never become a replacement draft", async () => {
  for (const reconcile of [false, true]) {
    const unavailable = scenario(source, { queryFailure: "touchline_fantasy_user_gameweeks" });
    assert.equal(await unavailable.run("full", undefined, reconcile), null);
    assert.ok(!unavailable.queries.includes("touchline_fantasy_locked_selections"));
    assert.ok(!unavailable.calls.some(call => call.name === "touchline_fantasy_reconcile_lineup_alerts"));
  }
  const blocked = readBarrier();
  const failed = scenario(source, { queryFailure: "touchline_fantasy_locked_selections",
    readGates: { catalogue: blocked.promise } });
  try {
    // Rejection is observed even though the unrelated catalogue has not settled.
    await assert.rejects(failed.run("full", undefined, false), /TOUCHLINE_LINEUP_READ_UNAVAILABLE/);
    assert.ok(!failed.queries.includes("touchline_fantasy_player_fixture_scores"));
    assert.ok(!failed.queries.includes("player-availability"));
    assert.deepEqual(failed.calls, []);
  } finally { blocked.release(); }
});


test("failed current-round score rejects the full projection instead of fabricating zero", async () => {
  for (const gameweekScoreRow of [null, { gameweek_score: 18.5 }]) {
    const read = scenario(source, { gameweekScoreRow, queryFailure: "touchline_fantasy_user_gameweek_scores" });
    await assert.rejects(read.run("full", undefined, false), /TOUCHLINE_GAMEWEEK_SCORE_READ_UNAVAILABLE/);
    assert.deepEqual(read.calls, [], "score read failure cannot invoke lifecycle writers");
    assert.ok(!read.queries.includes("player-availability"), "failed authority cannot publish a partial enriched snapshot");
  }
});

test("confirmed absent or zero current-round score remains zero, and a positive receipt remains exact", async () => {
  for (const gameweekScoreRow of [null, { gameweek_score: 0 }, { gameweek_score: 18.5 }]) {
    const read = scenario(source, { gameweekScoreRow });
    const snapshot = await read.run("full", undefined, false);
    assert.equal(snapshot.gameweekScore, gameweekScoreRow?.gameweek_score ?? 0);
    assert.deepEqual(read.calls, []);
  }
});

test("no current lineup skips its score lookup and retains only final season history", async () => {
  const read = scenario(source, { missingCurrentLineup: true, queryFailure: "touchline_fantasy_user_gameweek_scores", seasonScores: [
    { gameweek_score: 21.25, settlement_status: "FINAL" },
    { gameweek_score: 900, settlement_status: "PROVISIONAL" },
  ] });
  const snapshot = await read.run("full", undefined, false);
  assert.equal(snapshot.userGameweek, null); assert.equal(snapshot.gameweekScore, 0);
  assert.equal(snapshot.seasonScore, 21.25);
  assert.equal(read.queries.filter(table => table === "touchline_fantasy_user_gameweek_scores").length, 1,
    "only the account's season aggregate is read; no fabricated current-round draft");
  assert.deepEqual(read.calls, []);
});

test("Arena remains independent of both current-round and season score failures", async () => {
  const read = scenario(source, { queryFailure: "touchline_fantasy_user_gameweek_scores", seasonScoreError: true });
  const snapshot = await read.run("arena", undefined, false);
  assert.equal(buildTouchlineFantasyArenaLineup(snapshot)?.players.length, 11);
  assert.ok(!read.queries.includes("touchline_fantasy_user_gameweek_scores"));
  assert.deepEqual(read.calls, []);
});
