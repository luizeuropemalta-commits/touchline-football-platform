import test from "node:test";
import assert from "node:assert/strict";
import { publicSquadPlacement } from "../lib/touchlineArena/clubowner-public-squad.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
const state = (count: number) => ({ revision: 9, seasonId: "private-season", plan: "vip", balanceEur: 2923000000,
  coach: { id: "127889", tier: "sapphire-blue", valueEur: 10000000 }, formationCode: "4-4-2",
  players: Array.from({length: count}, (_, i) => ({ playerId: `player-${i}`, area: i < 11 ? "starters" : i < 20 ? "reserves" : "outside", slot: i < 11 ? i : i < 20 ? i - 11 : i - 20, valueEur: 40000000, position: "CB", clubId: "club" })),
  receipts: [{ key: "private-receipt", valueEur: 40000000 }], email: "private@example.com", userId: "private-account" }) as unknown as ClubAcquisitionState;
for (const count of [0, 2, 11, 20, 35]) test(`visitor sees ${count} placements without private finances or contracts`, () => {
  const input = state(count), before = JSON.stringify(input), view = publicSquadPlacement(input);
  assert.equal(view.players.length, count);
  assert.deepEqual(Object.keys(view).sort(), ["coachId", "formationCode", "players"]);
  for (const player of view.players) assert.deepEqual(Object.keys(player).sort(), ["area", "playerId", "slot"]);
  assert.equal(view.formationCode, "4-4-2"); assert.equal(view.coachId, "127889");
  assert.doesNotMatch(JSON.stringify(view), /balance|valueEur|receipt|email|userId|private-/);
  assert.equal(JSON.stringify(input), before);
});
test("not started is an empty squad, not an access or completion error", () => {
  assert.deepEqual(publicSquadPlacement(null), { formationCode: "4-3-3", coachId: null, players: [] });
});
test("invalid duplicate or out of range slots are rejected", () => {
  const input = state(2);
  assert.throws(() => publicSquadPlacement({...input, players: [input.players[0], input.players[0]]}));
  assert.throws(() => publicSquadPlacement({...input, players: [{...input.players[0], slot: 11}]}));
});

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../lib/touchlineArena/clubowner-public-squad-server.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const targetId = "22222222-2222-4222-8222-222222222222", seasonId = "33333333-3333-4333-8333-333333333333";
function reader(options: { enabled?: boolean; actor?: unknown; target?: string | null; configError?: boolean; failRead?: boolean; weeks?: { id: string; state: string }[]; availability?: unknown } = {}) {
  const reads: unknown[] = [], calls: unknown[] = [];
  const chain = { select: () => chain, eq: (key: string, value: unknown) => { calls.push([key, value]); return chain; }, order: () => chain, abortSignal: () => chain,
    single: async () => ({ data: { season_id: seasonId }, error: options.configError ? {} : null }), then: (resolve: (value: unknown) => unknown) => resolve({ data: options.weeks ?? [], error: null }) };
  const deps: Record<string, unknown> = {
    "server-only": {}, "./server-read-deadline": { resolveServerReadWithin: (promise: Promise<unknown>) => promise },
    "./player-availability-reader": { readGameweekPlayerAvailability: async (_admin: unknown, season: string, week: string, ids: string[]) => { calls.push(["availability", season, week, ids]); return "availability" in options ? options.availability : []; } },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => chain }) },
    "./clubowner-public-market-server": { publicMarketDependencies: () => ({ actor: async () => "actor" in options ? options.actor : { allowed: true, accountId: "viewer" }, allow: () => true,
      target: async (id: string, actor: string) => { calls.push(["target", id, actor]); return "target" in options ? options.target : targetId; } }) },
    "./clubowner-public-server": { publicOwnersEnabled: () => options.enabled !== false },
    "./clubowner-public-contract": { publicOwnerId: (id: string) => /^[a-f0-9-]{36}$/.test(id) },
    "../touchlineFantasy/club-collection-server": { createClubCollectionStore: () => ({ read: async (owner: string, season: string) => { reads.push([owner, season]); if (options.failRead) throw Error("storage"); return state(2); } }) },
    "../touchlineFantasy/server": { loadCatalogue: async () => [{ id: "player-0" }, { id: "player-1" }, { id: "unowned" }], loadCoaches: async () => [{ id: "127889" }, { id: "other-coach" }] },
    "./formation-geometry-server": { readTouchlineFormationGeometryRegistry: async () => ({}) },
    "./formation-geometry": { resolveTouchlineFormationGeometry: (code: string) => ({ formationCode: code }) },
    "./clubowner-public-squad": { publicSquadPlacement },
  };
  const exports = {} as { readPublicOwnerSquad: (id: string) => Promise<{ availability: unknown; cards: unknown[]; coach: { id: string } } | null> };
  runInNewContext(compiled, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; }, AbortSignal, Set });
  return { read: exports.readPublicOwnerSquad, reads, calls };
}
for (const options of [{ enabled: false }, { actor: null }, { actor: { allowed: false, accountId: "viewer" } }, { target: null }]) {
  test(`reader denies unauthorized/hidden target ${JSON.stringify(options)}`, async () => {
    const check = reader(options); assert.equal(await check.read(targetId), null); assert.equal(check.reads.length, 0);
  });
}
test("reader scopes target and season and excludes unowned cards and finances", async () => {
  const check = reader(), result = await check.read(targetId);
  assert.deepEqual(check.reads, [[targetId, seasonId]]);
  assert.deepEqual(check.calls[0], ["target", targetId, "viewer"]);
  assert.ok(result);
  assert.equal(result.cards.length, 2); assert.equal(result.coach.id, "127889");
  assert.doesNotMatch(JSON.stringify(result), /balanceEur|2923000000|private-|unowned|other-coach/);
});
test("storage/configuration failure cannot become an empty success", async () => {
  for (const options of [{ configError: true }, { failRead: true }]) await assert.rejects(reader(options).read(targetId));
});

test("visitor availability uses the active round and only owned players, preserving confirmed badges", async () => {
  const availability = [{playerId: "player-0", badge: {reason: "injury"}}];
  const check = reader({weeks: [{id: "old", state: "SETTLED"}, {id: "current", state: "MARKET_OPEN"}], availability});
  const result = await check.read(targetId);
  assert.deepEqual(result?.availability, availability);
  assert.equal(JSON.stringify(check.calls.find(call => Array.isArray(call) && call[0] === "availability")), JSON.stringify(["availability", seasonId, "current", ["player-0", "player-1"]]));
});

test("unavailable injury evidence remains unknown instead of fabricating a healthy squad", async () => {
  const result = await reader({weeks: [{id: "current", state: "LIVE"}], availability: null}).read(targetId);
  assert.equal(result?.availability, null);
});
