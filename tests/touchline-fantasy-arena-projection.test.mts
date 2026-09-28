import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { buildTouchlineFantasyArenaLineup } from "../lib/touchlineFantasy/arena-lineup.ts";

const source = readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8");
test("Arena has a narrow projection without replacing the full API", () => {
  assert.match(source, /export async function loadTouchlineFantasyArenaSnapshot/);
  assert.match(source, /export async function loadTouchlineFantasySnapshot/);
});

function scenario(input = source, options: { pending?: boolean; state?: string; incomplete?: boolean; failure?: string } = {}) {
  const calls: Array<{ name: string; args?: unknown }> = [];
  const queries: string[] = [];
  const ids = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  const selections = ids.map((player_id, i) => ({ player_id, slot_id: `s${i}` }));
  const catalogue = ids.map(canonicalPlayerId => ({ canonicalPlayerId, name: canonicalPlayerId }));
  const geometry = { "4-3-3": { slots: ids.map((_, i) => ({ id: `s${i}`, role: "midfielder", x: 50, y: 50 })) } };
  const weeks = [{ id: "previous", gameweek_number: 1, state: "FINAL" }, { id: "active", gameweek_number: 2, state: "MARKET_OPEN" }];
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
          if (table === "touchline_fantasy_configs") data = { season_id: "season", budget_eur: 100, max_players_per_club: 3, lock_offset_minutes: 5 };
          else if (table === "touchline_fantasy_gameweeks") data = weeks;
          else if (table === "touchline_fantasy_entitlements") {
            assert.ok(filters.some(([k,v]) => k === "user_id" && v === "customer"));
            data = { status: "active" };
          } else if (table === "touchline_fantasy_user_gameweeks") {
            assert.deepEqual(filters, [["user_id", "customer"], ["gameweek_id", "active"]]);
            data = { id: "ug", formation_code: "4-3-3", selected_coach_id: "draft-coach", locked_coach_id: "locked-coach", state: options.state ?? "LOCKED", total_market_value_eur: 10 };
          } else if (table === "touchline_fantasy_locked_selections" || table === "touchline_fantasy_user_gameweek_selections") {
            assert.deepEqual(filters, [["user_gameweek_id", "ug"]]);
            data = table.includes("locked") ? selections.slice(0, options.incomplete ? 10 : 11) : [{ player_id: "wrong-draft", slot_id: "s0" }];
          } else if (["touchline_fantasy_user_gameweek_scores", "touchline_fantasy_lineup_alerts", "touchline_fantasy_player_fixture_scores"].includes(table)) data = [];
          else assert.fail(`Unexpected table ${table}`);
          return Promise.resolve({ data, error: null }).then(resolve);
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
    text: (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null,
    number: (v: unknown) => typeof v === "number" ? v : null,
    rows: (v: unknown) => Array.isArray(v) ? v : [],
    parseGameweek: (r: { id: string; gameweek_number: number; state: string }) => ({ id: r.id, number: r.gameweek_number, state: r.state }),
    readTouchlineFormationGeometryRegistry: async () => geometry,
    loadCatalogue: async () => catalogue,
    loadCoaches: async () => { queries.push("coaches"); if (options.pending) await pending; return []; },
    loadRankings: async (_a: unknown, gw: string, season: string, user: string) => { assert.equal(gw, "active"); assert.equal(season, "season"); assert.equal(user, "customer"); queries.push("rankings"); if (options.pending) await pending; return { gameweek: [], season: [] }; },
    TOUCHLINE_FANTASY_INITIAL_BUDGET_EUR: 100,
    fetch: () => assert.fail("Network forbidden"),
  });
  // Golden DTO verified against immutable e7eec8b before extraction; keep this
  // self-contained so release snapshots need no sibling checkout or Git read.
  const golden = {
    userId: "customer", entitlementActive: true, subscription: { amountMinor: 2990, currency: "GBP" },
    config: { budgetEur: 100, maxPlayersPerClub: 3, lockOffsetMinutes: 5 },
    gameweeks: [{ id: "previous", number: 1, state: "FINAL" }, { id: "active", number: 2, state: "MARKET_OPEN" }],
    activeGameweek: { id: "active", number: 2, state: "MARKET_OPEN" },
    userGameweek: { id: "ug", formationCode: "4-3-3", state: "LOCKED", totalMarketValueEur: 10, carriedFromPrevious: false, selectedCoachId: "locked-coach" },
    selections: selections.map(r => ({ playerId: r.player_id, slotId: r.slot_id })),
    catalogue, coaches: [], lineupAlerts: [], formationRegistry: geometry,
    gameweekScore: 0, seasonScore: 0, matchHistory: [], gameweekRanking: [], seasonRanking: [],
  };
  return { run: (projection: "arena" | "full") => core({ id: "customer" }, projection), calls, queries, release, golden };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("full projection matches immutable baseline; Arena retains exact XI and writer trace", async () => {
  const full = scenario(); const arena = scenario();
  const fullValue = await full.run("full"); const arenaValue = await arena.run("arena");
  assert.deepEqual(plain(fullValue), full.golden);
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
  assert.deepEqual(Object.keys(arenaValue).sort(), ["activeGameweek", "catalogue", "formationRegistry", "selections", "userGameweek"]);
  assert.ok(!arena.queries.some(q => q === "coaches" || q === "rankings" || q.includes("scores") || q.includes("alerts")));
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
