import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("function rows("), source.indexOf("function countryCode("))
  + source.slice(source.indexOf("function parseGameweek("), source.indexOf("async function loadCatalogue("));
const core = source.slice(source.indexOf("async function loadFantasySnapshotCore(user:"));
const code = stripTypeScriptTypes(`${helpers}\n${core}\nloadFantasySnapshotCore;`);
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Options = {
  blocked?: string[]; empty?: boolean; draftOnly?: boolean; noRound?: boolean;
  noUserRound?: boolean; projection?: "full" | "arena"; writerError?: "sync" | "lifecycle" | "prepare";
};
function scenario(options: Options = {}) {
  const gates = Object.fromEntries((options.blocked ?? []).map((key) => [key, deferred()]));
  const events: string[] = [];
  const queries: Array<{ key: string; filters: Record<string, unknown> }> = [];
  const week = { id: "round", gameweek_number: 1, state: "MARKET_OPEN", market_opens_at: "2026-01-01", locks_at: "2030-01-01", first_fixture_at: "2030-01-01", last_fixture_at: "2030-01-02" };
  const wait = (key: string) => gates[key]?.promise ?? Promise.resolve();
  const admin = {
    async rpc(name: string) {
      events.push(name);
      const key = name.endsWith("sync_gameweeks") ? "sync" : name.endsWith("prepare_user_gameweek") ? "prepare" : "alertsRpc";
      await wait(key);
      return { error: options.writerError === key ? new Error(key) : null };
    },
    from(table: string) {
      let columns = "";
      const filters: Record<string, unknown> = {};
      const query = {
        select(value: string) { columns = value; return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        in(key: string, value: unknown) { filters[key] = value; return query; },
        order() { return query; }, maybeSingle() { return query; },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          const key = table === "touchline_fantasy_user_gameweek_scores"
            ? columns === "gameweek_score" ? "scores" : "season"
            : ({ touchline_fantasy_configs: "config", touchline_fantasy_gameweeks: "rounds",
              touchline_fantasy_entitlements: "entitlement", touchline_fantasy_user_gameweeks: "userRound",
              touchline_fantasy_user_gameweek_selections: "draft", touchline_fantasy_locked_selections: "locked",
              touchline_fantasy_lineup_alerts: "alerts", touchline_fantasy_player_fixture_scores: "history" } as Record<string, string>)[table];
          assert.ok(key, `unexpected read ${table}`);
          events.push(key); queries.push({ key, filters });
          const data: Record<string, unknown> = {
            config: { season_id: "season", budget_eur: 100, max_players_per_club: 3, lock_offset_minutes: 5 },
            rounds: options.noRound ? [] : [week], entitlement: { status: "active" },
            userRound: options.noUserRound ? null : { id: "user-round", formation_code: "4-3-3", selected_coach_id: "coach", state: "DRAFT", total_market_value_eur: 10 },
            draft: options.empty ? [] : [{ player_id: "draft-player", slot_id: "ST" }],
            locked: options.empty || options.draftOnly ? [] : [{ player_id: "locked-player", slot_id: "GK" }],
            scores: { gameweek_score: 7 }, season: [{ gameweek_score: 9, settlement_status: "FINAL" }, { gameweek_score: 3, settlement_status: "PROVISIONAL" }],
            alerts: [], history: [{ fixture_id: "fixture", player_id: options.draftOnly ? "draft-player" : "locked-player", rating: 7, goals: 1, hat_trick_multiplier: 1, fantasy_contribution: 7, reason_code: "RATED_APPEARANCE", settlement_status: "FINAL" }],
          };
          return wait(key).then(() => ({ data: data[key], error: null })).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = {
    createAdminClient: () => admin,
    readTouchlineFormationGeometryRegistry: async () => ({}),
    reconcileTouchlineFantasyGameweeks: async () => { events.push("lifecycle"); return { error: options.writerError === "lifecycle" ? "failed" : null, reconciled: 0 }; },
    loadCatalogue: async () => { events.push("catalogue"); await wait("catalogue"); return []; },
    loadCoaches: async () => [], loadRankings: async () => ({ gameweek: [], season: [] }),
    TOUCHLINE_FANTASY_INITIAL_BUDGET_EUR: 100,
    fetch: () => assert.fail("network forbidden"),
  };
  const load = runInNewContext(code, context) as (user: object, projection: string) => Promise<Record<string, unknown> | null>;
  return { gates, events, queries, run: () => load({ id: "user" }, options.projection ?? "full"), release: () => Object.values(gates).forEach((gate) => gate.resolve()) };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const writers = (events: string[]) => events.filter((event) => event.startsWith("touchline_fantasy_") || event === "lifecycle");
const expectedWriters = ["touchline_fantasy_sync_gameweeks", "lifecycle", "touchline_fantasy_prepare_user_gameweek", "touchline_fantasy_reconcile_lineup_alerts"];

test("history follows selections while scores and alerts remain pending, with identical output and writes", async () => {
  const baseline = await scenario().run();
  const h = scenario({ blocked: ["draft", "locked", "scores", "season", "alerts"] });
  let completed = false;
  const result = h.run().then((value) => { completed = true; return value; });
  await setImmediate();
  h.gates.draft.resolve(); h.gates.locked.resolve();
  await setImmediate();
  const historyStarted = h.events.includes("history");
  const returnedEarly = completed;
  h.release();
  const value = await result;
  assert.equal(historyStarted, true, "history must not wait for unrelated scores/alerts");
  assert.equal(returnedEarly, false);
  assert.deepEqual(plain(value), plain(baseline));
  assert.deepEqual(writers(h.events), expectedWriters);
  assert.deepEqual(plain(h.queries.find((query) => query.key === "history")?.filters), { gameweek_id: "round", player_id: ["locked-player"] });
  for (const key of ["draft", "locked", "scores", "season", "alerts", "history"]) assert.equal(h.queries.filter((query) => query.key === key).length, 1);
  assert.equal(value?.gameweekScore, 7); assert.equal(value?.seasonScore, 9);
  assert.deepEqual(plain(value?.matchHistory), [{ fixtureId: "fixture", playerId: "locked-player", rating: 7, goals: 1, multiplier: 1, contribution: 7, reason: "RATED_APPEARANCE", settlementStatus: "FINAL" }]);
});

test("catalogue and alert writer retain their existing barriers before any selection/history read", async () => {
  const h = scenario({ blocked: ["catalogue", "alertsRpc"] });
  const result = h.run();
  await setImmediate();
  assert.equal(h.events.includes("touchline_fantasy_reconcile_lineup_alerts"), false);
  h.gates.catalogue.resolve();
  await setImmediate();
  assert.equal(h.events.includes("touchline_fantasy_reconcile_lineup_alerts"), true);
  assert.equal(h.events.includes("draft"), false); assert.equal(h.events.includes("history"), false);
  h.release(); await result;
  assert.deepEqual(writers(h.events), expectedWriters);
});

test("draft fallback, empty selections and non-full projections keep their exact history scope", async () => {
  const draft = scenario({ draftOnly: true });
  const value = await draft.run();
  assert.deepEqual(plain(value?.selections), [{ playerId: "draft-player", slotId: "ST" }]);
  assert.deepEqual(plain(draft.queries.find((query) => query.key === "history")?.filters), { gameweek_id: "round", player_id: ["draft-player"] });
  for (const options of [{ empty: true }, { noRound: true }, { noUserRound: true }, { projection: "arena" as const }]) {
    const h = scenario(options); const result = await h.run();
    assert.equal(h.events.includes("history"), false);
    if (options.projection === "arena") assert.deepEqual(Object.keys(result!).sort(), ["activeGameweek", "catalogue", "formationRegistry", "selections", "userGameweek"]);
  }
});

test("writer failures still return null before downstream reads and writes", async () => {
  for (const writerError of ["sync", "lifecycle", "prepare"] as const) {
    const h = scenario({ writerError });
    assert.equal(await h.run(), null);
    assert.equal(h.events.includes("catalogue"), false);
    assert.equal(h.events.includes("history"), false);
    assert.equal(h.events.includes("touchline_fantasy_reconcile_lineup_alerts"), false);
  }
});

test("history failure is preserved while unrelated reads remain pending; late failure is observed", async () => {
  const h = scenario({ blocked: ["history", "alerts"] });
  const failure = new Error("history failure");
  const observed = assert.rejects(h.run(), (error) => error === failure);
  await setImmediate();
  // Baseline cannot start history yet; release alerts to avoid a hanging RED run.
  const started = h.events.includes("history");
  if (!started) h.gates.alerts.resolve();
  await setImmediate();
  h.gates.history.reject(failure);
  await observed;
  if (started) h.gates.alerts.reject(new Error("late alerts failure"));
  await setImmediate();
});

test("score failure is preserved and a later history rejection remains observed", async () => {
  const h = scenario({ blocked: ["scores", "history"] });
  const failure = new Error("score failure");
  const observed = assert.rejects(h.run(), (error) => error === failure);
  await setImmediate();
  const started = h.events.includes("history");
  h.gates.scores.reject(failure);
  await observed;
  if (started) h.gates.history.reject(new Error("late history failure"));
  else h.gates.history.resolve();
  await setImmediate();
});

test("selection failure prevents history and observes an unrelated late rejection", async () => {
  const h = scenario({ blocked: ["locked", "alerts"] });
  const failure = new Error("selection failure");
  const observed = assert.rejects(h.run(), (error) => error === failure);
  await setImmediate();
  h.gates.locked.reject(failure);
  await observed;
  h.gates.alerts.reject(new Error("late alerts failure"));
  await setImmediate();
  assert.equal(h.events.includes("history"), false);
  assert.deepEqual(writers(h.events), expectedWriters);
});
