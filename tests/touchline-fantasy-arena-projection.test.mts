import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { buildTouchlineFantasyArenaLineup } from "../lib/touchlineFantasy/arena-lineup.ts";
import { resolveTouchlineFantasyMarketAccess } from "../lib/touchlineFantasy/market-plan-policy.ts";

const source = readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8");
test("Arena has a narrow projection without replacing the full API", () => {
  assert.match(source, /export async function loadTouchlineFantasyArenaSnapshot/);
  assert.match(source, /export async function loadTouchlineFantasySnapshot/);
});

function scenario(input = source, options: { pending?: boolean; state?: string; gameweekState?: string; incomplete?: boolean; failure?: string; entitlement?: Record<string, unknown> | null; entitlementError?: boolean } = {}) {
  const calls: Array<{ name: string; args?: unknown }> = [];
  const queries: string[] = [];
  const ids = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  const selections = ids.map((player_id, i) => ({ player_id, slot_id: `s${i}` }));
  const catalogue = ids.map(canonicalPlayerId => ({ canonicalPlayerId, name: canonicalPlayerId }));
  const geometry = { "4-3-3": { slots: ids.map((_, i) => ({ id: `s${i}`, role: "midfielder", x: 50, y: 50 })) } };
  const weeks = [{ id: "previous", gameweek_number: 1, state: "FINAL" }, { id: "active", gameweek_number: 2, state: options.gameweekState ?? "MARKET_OPEN" }];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const admin = {
    async rpc(name: string, args?: unknown) {
      calls.push({ name, args });
      return { data: { ok: true }, error: options.failure === name ? { code: "40001" } : null };
    },
    from(table: string) {
      queries.push(table);
      const filters: Array<[string, unknown]> = [];
      const chain = {
        select: () => chain, order: () => chain,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
        in: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
        maybeSingle: () => chain,
        then(resolve: (value: unknown) => unknown) {
          let data: unknown;
          if (table === "touchline_fantasy_configs") data = { season_id: "season", max_players_per_club: 11, lock_offset_minutes: 5 };
          else if (table === "touchline_fantasy_gameweeks") data = weeks;
          else if (table === "touchline_fantasy_entitlements") {
            assert.ok(filters.some(([k,v]) => k === "user_id" && v === "customer"));
            data = options.entitlement === undefined ? { status: "active", plan_key: "standard" } : options.entitlement;
          } else if (table === "touchline_fantasy_user_gameweeks") {
            assert.deepEqual(filters, [["user_id", "customer"], ["gameweek_id", "active"]]);
            data = { id: "ug", formation_code: "4-3-3", selected_coach_id: "draft-coach", locked_coach_id: "locked-coach", state: options.state ?? "LOCKED", total_market_value_eur: 10 };
          } else if (table === "touchline_fantasy_locked_selections" || table === "touchline_fantasy_user_gameweek_selections") {
            assert.deepEqual(filters, [["user_gameweek_id", "ug"]]);
            data = table.includes("locked") ? selections.slice(0, options.incomplete ? 10 : 11) : [{ player_id: "wrong-draft", slot_id: "s0" }];
          } else if (["touchline_fantasy_user_gameweek_scores", "touchline_fantasy_lineup_alerts", "touchline_fantasy_player_fixture_scores"].includes(table)) data = [];
          else assert.fail(`Unexpected table ${table}`);
          return Promise.resolve({ data, error: table === "touchline_fantasy_entitlements" && options.entitlementError ? { code: "08006" } : null }).then(resolve);
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
  const core = runInNewContext(`${lifecycle}\n${stripped.slice(start)}\n${name};`, {
    createAdminClient: () => admin,
    resolveTouchlineFantasyMarketAccess,
    text: (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null,
    number: (v: unknown) => typeof v === "number" ? v : null,
    rows: (v: unknown) => Array.isArray(v) ? v : [],
    parseGameweek: (r: { id: string; gameweek_number: number; state: string }) => ({ id: r.id, number: r.gameweek_number, state: r.state }),
    readTouchlineFormationGeometryRegistry: async () => { queries.push("geometry"); return geometry; },
    loadCatalogue: async () => catalogue,
    loadCoaches: async () => { queries.push("coaches"); if (options.pending) await pending; return []; },
    loadRankings: async (_a: unknown, gw: string, season: string, user: string) => { assert.equal(gw, "active"); assert.equal(season, "season"); assert.equal(user, "customer"); queries.push("rankings"); if (options.pending) await pending; return { gameweek: [], season: [] }; },
    readGameweekMatchCardIndicators: async (_admin: unknown, season: string, gw: string, ids: string[]) => {
      assert.equal(season, "season"); assert.equal(gw, "active"); assert.deepEqual(ids, selections.map((selection) => selection.player_id));
      queries.push("match-cards"); return [];
    },
    readGameweekPlayerAvailability: async (_admin: unknown, season: string, gw: string, ids: string[]) => {
      assert.equal(season, "season"); assert.equal(gw, "active");
      assert.deepEqual([...ids], (options.incomplete ? selections.slice(0, 10) : selections).map(row => row.player_id));
      queries.push("player-availability"); return [];
    },
    fetch: () => assert.fail("Network forbidden"),
  });
  // Explicit current Standard contract, separate from the immutable XI trace.
  const golden = {
    userId: "customer", entitlementActive: true,
    marketAccess: resolveTouchlineFantasyMarketAccess("standard"),
    config: { budgetEur: 400_000_000, maxPlayersPerClub: 11, lockOffsetMinutes: 5 },
    gameweeks: [{ id: "previous", number: 1, state: "FINAL" }, { id: "active", number: 2, state: "MARKET_OPEN" }],
    activeGameweek: { id: "active", number: 2, state: "MARKET_OPEN" },
    userGameweek: { id: "ug", formationCode: "4-3-3", state: "LOCKED", totalMarketValueEur: 10, carriedFromPrevious: false, selectedCoachId: "locked-coach" },
    selections: selections.map(r => ({ playerId: r.player_id, slotId: r.slot_id })),
    catalogue, coaches: [], lineupAlerts: [], matchCardIndicators: [], playerAvailabilityIndicators: [], formationRegistry: geometry,
    gameweekScore: 0, seasonScore: 0, matchHistory: [], gameweekRanking: [], seasonRanking: [],
  };
  return { run: (projection: "arena" | "full", registry?: object, reconcileLifecycle = true) => core({ id: "customer" }, projection, registry, undefined, reconcileLifecycle), calls, queries, release, golden };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

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
