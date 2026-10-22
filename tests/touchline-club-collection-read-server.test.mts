import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { ClubCollectionReadResult } from "../lib/touchlineFantasy/club-collection-read-server.ts";

function fixture({ enabled = true, storage = true, season = "season", fail = false, states = [null, null] as unknown[] } = {}) {
  const calls: string[][] = [];
  const admin = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { season_id: season }, error: null }) }) }) }) }) };
  const modules: Record<string, unknown> = {
    "server-only": {},
    "@/lib/supabase/admin": { createAdminClient: () => storage ? admin : null },
    "@/lib/touchlineFantasy/club-collection-server": {
      clubCollectionEnabled: () => enabled, clubReleaseEnabled: () => false,
      createClubCollectionStore: () => ({ read: async (owner: string, seasonId: string) => {
        calls.push([owner, seasonId]); if (fail) throw new Error("offline"); return states.shift();
      } }),
    },
    "@/lib/touchlineFantasy/club-initial-budget-server": { readClubInitialBudget: async (_admin: unknown, owner: string, seasonId: string) => {
      calls.push(["budget", owner, seasonId]); return { plan: "vip", balanceEur: 1_200_000_000 };
    } },
  };
  const exports: { readClubCollectionServer?: (owner: string | null) => Promise<ClubCollectionReadResult> } = {};
  const source = ts.transpileModule(readFileSync(new URL("../lib/touchlineFantasy/club-collection-read-server.ts", import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return { read: exports.readClubCollectionServer!, calls };
}

test("server read distinguishes unavailable from a confirmed empty collection", async () => {
  for (const [options, owner, code] of [[{}, null, "AUTH_REQUIRED"], [{enabled:false}, "owner", "CLUB_COLLECTION_UNAVAILABLE"], [{storage:false}, "owner", "CLUB_STORAGE_UNAVAILABLE"], [{season:""}, "owner", "CLUB_SEASON_UNAVAILABLE"], [{fail:true}, "owner", "CLUB_STORAGE_UNAVAILABLE"]] as const) {
    const result = await fixture(options).read(owner);
    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") assert.equal(result.error, code);
    assert.equal("state" in result, false);
  }
  const h = fixture(), result = await h.read("owner");
  assert.equal(result.status, "confirmed");
  if (result.status === "confirmed") {
    assert.equal(result.state, null); assert.equal(result.initialBudget?.balanceEur, 1_200_000_000);
    assert.equal(result.accountId, "owner"); assert.equal(result.seasonId, "season"); assert.equal(result.releaseAvailable, false);
  }
  assert.deepEqual(h.calls, [["owner","season"],["budget","owner","season"],["owner","season"]]);
});

test("existing collection and racing initialization never publish initial allowance over a debit", async () => {
  const state = { revision: 1, balanceEur: 1_150_000_000 };
  for (const states of [[state], [null, state]]) {
    const h = fixture({states}), result = await h.read("owner");
    assert.equal(result.status, "confirmed");
    if (result.status === "confirmed") { assert.equal(result.state, state); assert.equal(result.initialBudget, null); }
    assert.ok(h.calls.every(call => call.includes("owner") && call.includes("season")));
  }
});
