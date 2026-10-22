import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(entitlementError = false) {
  const events: string[] = [];
  let release!: () => void;
  const config = new Promise<unknown>(resolve => { release = () => resolve({ data: { season_id: "season" }, error: null }); });
  const admin = {
    rpc: async () => { events.push("sync"); return { error: null }; },
    from(table: string) {
      const filters: Array<[string, string]> = [];
      const result = () => {
        events.push(table);
        if (table === "touchline_fantasy_configs") return config;
        if (table === "touchline_fantasy_gameweeks") return Promise.resolve({ data: [], error: null });
        assert.equal(table, "touchline_fantasy_entitlements");
        assert.deepEqual(filters, [["user_id", "owner"], ["entitlement_key", "fantasy_access"]]);
        return Promise.resolve({ data: { plan_key: "invalid" }, error: entitlementError ? { message: "unavailable" } : null });
      };
      const query = { select: () => query, eq: (key: string, value: string) => { filters.push([key, value]); return query; },
        maybeSingle: result, order: result };
      return query;
    },
  };
  const exports: Record<string, (user: { id: string }) => Promise<unknown>> = {};
  vm.runInNewContext(compiled, { exports, process: { env: {} }, require: (name: string) => {
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => admin };
    if (name === "@/lib/touchlineArena/formation-geometry-server") return { readTouchlineFormationGeometryRegistry: async () => ({}) };
    if (name === "./gameweek-lifecycle") return { reconcileTouchlineFantasyGameweeks: async () => { events.push("lifecycle"); return { error: null, reconciled: 0 }; } };
    if (name === "./market-plan-policy") return { resolveTouchlineFantasyMarketAccess: () => null };
    return {};
  } });
  return { events, release, exports };
}

test("read-only snapshot starts owner-scoped plan lookup before configuration settles, only once", async () => {
  const f = fixture();
  const pending = f.exports.loadTouchlineFantasyReadSnapshot({ id: "owner" });
  assert.deepEqual(f.events, ["touchline_fantasy_configs", "touchline_fantasy_entitlements"]);
  f.release();
  assert.equal(await pending, null);
  assert.equal(f.events.filter(e => e === "touchline_fantasy_entitlements").length, 1);
  assert.ok(!f.events.includes("sync") && !f.events.includes("lifecycle"));
});

test("failed parallel entitlement stays unavailable, never grants a plan", async () => {
  const f = fixture(true);
  const pending = f.exports.loadTouchlineFantasyReadSnapshot({ id: "owner" });
  f.release();
  assert.equal(await pending, null);
});

test("lifecycle loader keeps its original plan-read ordering after reconciliation", async () => {
  const f = fixture();
  const pending = f.exports.loadTouchlineFantasySnapshot({ id: "owner" });
  await Promise.resolve();
  assert.ok(!f.events.includes("touchline_fantasy_entitlements"));
  f.release();
  assert.equal(await pending, null);
  assert.ok(f.events.indexOf("lifecycle") < f.events.indexOf("touchline_fantasy_entitlements"));
});
