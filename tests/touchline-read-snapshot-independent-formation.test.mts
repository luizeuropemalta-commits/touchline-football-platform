import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
const compiled = ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(options: { configuration?: Promise<Result>; entitlement?: Promise<Result> } = {}) {
  const events: string[] = [];
  const formation = deferred<Row>();
  const configuration = options.configuration ?? Promise.resolve({ data: { season_id: "season" }, error: null });
  const entitlement = options.entitlement ?? Promise.resolve({ data: { plan_key: "beta", status: "active" }, error: null });
  const admin = {
    rpc: async (name: string) => { events.push(name); return { error: null }; },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const result = () => {
        events.push(table);
        if (table === "touchline_fantasy_configs") return configuration;
        if (table === "touchline_fantasy_entitlements") {
          assert.deepEqual(filters, [["user_id", "owner"], ["entitlement_key", "fantasy_access"]]);
          return entitlement;
        }
        if (table === "touchline_fantasy_gameweeks") return { data: [{
          id: "week", gameweek_number: 1, state: "MARKET_OPEN", market_opens_at: "2026-01-01",
          locks_at: "2026-12-01", first_fixture_at: "2026-12-01", last_fixture_at: "2026-12-02",
        }], error: null };
        if (table === "touchline_fantasy_user_gameweeks") {
          if (filters.some(([key]) => key === "user_id")) {
            assert.deepEqual(filters, [["user_id", "owner"], ["gameweek_id", "week"]]);
            return { data: { id: "owned-week" }, error: null };
          }
          return { data: [], error: null };
        }
        const allowed = ["touchline_card_publications", "football_clubs", "touchline_fantasy_user_gameweek_selections",
          "touchline_fantasy_locked_selections", "touchline_fantasy_user_gameweek_scores", "touchline_fantasy_lineup_alerts"];
        assert.ok(allowed.includes(table), `unexpected read: ${table}`);
        return { data: [], error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        in: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        order: () => query,
        maybeSingle: () => query,
        then: (yes: (value: Result) => unknown, no: (error: unknown) => unknown) => Promise.resolve().then(result).then(yes, no),
      };
      return query;
    },
  };
  const modules: Record<string, unknown> = {
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/touchlineArena/formation-geometry-server": { readTouchlineFormationGeometryRegistry: () => { events.push("formation"); return formation.promise; } },
    "./gameweek-lifecycle": { reconcileTouchlineFantasyGameweeks: async () => { events.push("lifecycle"); return { error: null, reconciled: 0 }; } },
    "./market-plan-policy": { resolveTouchlineFantasyMarketAccess: (plan: unknown) => plan === "beta" ? { planKey: "beta", budgetEur: 100 } : null },
    "@/lib/touchlineArena/complete-catalogue-read-server": { createCompleteTouchlineCatalogueAdmin: () => admin },
    "@/lib/touchlineArena/live-coaches": { TOUCHLINE_LIVE_COACHES: [] },
    "@/lib/touchlineArena/coach-ranking-server": { loadTouchLineCoachRanking: async () => ({ phase: "preseason" }) },
    "@/lib/touchlineArena/player-availability-reader": { readGameweekPlayerAvailability: async () => [] },
  };
  const exports: Record<string, (user: { id: string }) => Promise<Row | null>> = {};
  vm.runInNewContext(compiled, { exports, process: { env: {} }, require: (name: string) => modules[name] ?? {} });
  return { events, formation, read: () => exports.loadTouchlineFantasyReadSnapshot({ id: "owner" }),
    write: () => exports.loadTouchlineFantasySnapshot({ id: "owner" }) };
}

test("read-only round and owned squad advance while formation is pending; complete snapshot still waits for the exact registry", async () => {
  const f = fixture();
  const registry = { "4-3-3": { version: 7 } };
  let settled = false;
  const pending = f.read();
  void pending.then(() => { settled = true; });
  await turn();
  assert.ok(f.events.includes("touchline_fantasy_gameweeks"));
  assert.ok(f.events.includes("touchline_fantasy_user_gameweek_selections"));
  assert.ok(f.events.includes("touchline_fantasy_user_gameweek_scores"));
  assert.equal(settled, false);
  assert.ok(!f.events.some(event => event === "lifecycle" || event.startsWith("touchline_fantasy_sync") || event.startsWith("touchline_fantasy_prepare") || event.startsWith("touchline_fantasy_reconcile")));
  f.formation.resolve(registry);
  const snapshot = await pending;
  assert.equal(snapshot?.formationRegistry, registry);
  assert.equal(snapshot?.userId, "owner");
  assert.equal((snapshot?.userGameweek as Row).id, "owned-week");
});

test("pending entitlement prevents dependent account and catalogue reads even when configuration is ready", async () => {
  const entitlement = deferred<Result>();
  const f = fixture({ entitlement: entitlement.promise });
  const pending = f.read();
  await turn();
  assert.ok(!f.events.includes("touchline_fantasy_user_gameweeks"));
  assert.ok(!f.events.includes("touchline_card_publications"));
  entitlement.resolve({ data: { plan_key: "beta", status: "active" }, error: null });
  await turn();
  assert.ok(f.events.includes("touchline_fantasy_user_gameweek_selections"));
  f.formation.resolve({});
  await pending;
});

test("writer path retains formation barrier before rounds, reconciliation and entitlement", async () => {
  const f = fixture();
  const pending = f.write();
  await turn();
  assert.ok(f.events.includes("touchline_fantasy_sync_gameweeks"));
  assert.ok(!f.events.includes("touchline_fantasy_gameweeks"));
  assert.ok(!f.events.includes("touchline_fantasy_entitlements"));
  assert.ok(!f.events.includes("lifecycle"));
  f.formation.resolve({});
  await pending;
  assert.ok(f.events.indexOf("touchline_fantasy_gameweeks") < f.events.indexOf("lifecycle"));
  assert.ok(f.events.indexOf("lifecycle") < f.events.indexOf("touchline_fantasy_entitlements"));
  assert.ok(f.events.indexOf("touchline_fantasy_entitlements") < f.events.indexOf("touchline_fantasy_prepare_user_gameweek"));
});

test("verified no-plan onboarding still waits for the registry and reads no squad", async () => {
  const f = fixture({ entitlement: Promise.resolve({ data: null, error: null }) });
  const pending = f.read();
  let settled = false;
  void pending.then(() => { settled = true; });
  await turn();
  assert.equal(settled, false);
  assert.ok(!f.events.includes("touchline_card_publications"));
  const registry = { version: 9 };
  f.formation.resolve(registry);
  const result = await pending;
  assert.equal(result?.betaEnrollmentAvailable, true);
  assert.equal(result?.entitlementActive, false);
  assert.equal(result?.formationRegistry, registry);
});

for (const [name, result] of [
  ["failed", { data: null, error: { message: "unavailable" } }],
  ["unrecognized", { data: { plan_key: "invalid", status: "active" }, error: null }],
] as const) {
  test(`${name} entitlement fails closed without catalogue or owned squad reads`, async () => {
    const f = fixture({ entitlement: Promise.resolve(result) });
    const pending = f.read();
    await turn();
    assert.ok(!f.events.includes("touchline_card_publications"));
    assert.ok(!f.events.includes("touchline_fantasy_user_gameweeks"));
    f.formation.resolve({});
    assert.equal(await pending, null);
  });
}

test("registry rejection is observed immediately while configuration is pending; later read rejection is also observed", async () => {
  const configuration = deferred<Result>();
  const f = fixture({ configuration: configuration.promise });
  const failure = new Error("registry unavailable");
  const pending = assert.rejects(f.read(), error => error === failure);
  f.formation.reject(failure);
  await pending;
  configuration.reject(new Error("late configuration rejection"));
  await turn();
});

test("registry rejection is never discarded by an unavailable configuration result", async () => {
  const f = fixture({ configuration: Promise.resolve({ data: null, error: { message: "unavailable" } }) });
  const failure = new Error("registry unavailable");
  const pending = assert.rejects(f.read(), error => error === failure);
  await turn();
  f.formation.reject(failure);
  await pending;
  assert.ok(!f.events.includes("touchline_card_publications"));
});

test("data rejection is preserved and a later registry rejection is still observed", async () => {
  const configuration = deferred<Result>();
  const f = fixture({ configuration: configuration.promise });
  const failure = new Error("configuration unavailable");
  const pending = assert.rejects(f.read(), error => error === failure);
  configuration.reject(failure);
  await pending;
  f.formation.reject(new Error("late registry rejection"));
  await turn();
});
