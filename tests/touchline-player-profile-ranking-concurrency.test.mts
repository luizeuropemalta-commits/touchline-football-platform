import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";

const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const begin = source.indexOf("  const currentUserPromise = (async () => {");
const end = source.indexOf("  const editorialCard =", begin);
assert.ok(begin > 0 && end > begin);
// Execute the actual page's dependency join, stopping before visual projection.
const compiled = ts.transpileModule(`async function run() { ${source.slice(begin, end)}
return { activeRanking, playerStatistics, publishedCards, canonicalPlayerId, navigationSurface }; }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const rankingValue = { snapshotId: "published-fixture", phase: "ranked" };
const statisticsValue = { matchHistory: [] };
const presentationsValue = new Map([["canonical-1", { tierKey: "gold" }]]);
const projection = { projections: [{
  providerPlayerId: "101",
  identity: { status: "verified", value: { playerId: "canonical-1", name: "Fixture", displayName: "Fixture", nationality: "ENG" } },
  currentClub: { status: "verified", value: { name: "Fixture Club" } },
  membership: { status: "verified", value: { position: "ST", jerseyNumber: 9 } },
}] };

function fixture(options: {
  ranking: Promise<unknown>;
  identity?: Promise<unknown>;
  statistics?: Promise<unknown>;
  auth?: Promise<unknown>;
}) {
  const calls: string[] = [];
  const profile = () => ({ card: { id: "canonical-1", name: "Fixture" }, exactPlayer: {}, club: null, isLocalCard: false });
  const dependencies = {
    AuthSessionMissingError, hasTouchLineArenaAccess,
    createClient: async () => ({ auth: { getUser: () => options.auth ?? Promise.resolve({ data: { user: null }, error: null }) } }),
    canonicalLink: { status: "absent" }, canonicalResolution: null, playerKey: "101", query: {},
    resolveTouchLinePlayerProfile: profile,
    resolveTouchLineUnavailableOfficialProfile: profile,
    resolveTouchLineOfficialLookup: () => ({ providerPlayerId: "101", name: "Fixture" }),
    loadTouchlinePublicPlayerProjections: () => options.identity ?? Promise.resolve(projection),
    loadTouchLineOfficialPlayerIdentity: async () => ({ providerPlayerId: "101" }),
    loadTouchLineActiveRanking: () => { calls.push("ranking"); return options.ranking; },
    resolveTouchlineGlobalNavigationSurface: (value: unknown) => value,
    isOwnerEmail: (email: string) => email === "owner@example.test",
    loadTouchLinePlayerStatisticsReadModel: () => { calls.push("statistics"); return options.statistics ?? Promise.resolve(statisticsValue); },
    loadTouchlinePublishedCardPresentations: async () => { calls.push("presentation"); return presentationsValue; },
  };
  const run = new Function(...Object.keys(dependencies), `${compiled}; return run;`)(...Object.values(dependencies)) as () => Promise<{
    activeRanking: unknown; playerStatistics: unknown; publishedCards: unknown; canonicalPlayerId: string; navigationSurface: unknown;
  }>;
  return { run, calls };
}

test("identity unlocks statistics and presentation without waiting for ranking, but rendering still waits", async () => {
  const ranking = deferred<unknown>();
  const identity = deferred<unknown>();
  const h = fixture({ ranking: ranking.promise, identity: identity.promise });
  let settled = false;
  const result = h.run().then((value) => { settled = true; return value; });
  await flush();
  assert.deepEqual(h.calls, ["ranking"], "canonical identity remains mandatory before enrichment");
  identity.resolve(projection);
  await flush();
  const beforeRanking = [...h.calls];
  const renderedEarly = settled;
  ranking.resolve(rankingValue);
  const value = await result;
  assert.deepEqual(beforeRanking, ["ranking", "statistics", "presentation"]);
  assert.equal(renderedEarly, false);
  assert.equal(value.activeRanking, rankingValue);
  assert.equal(value.playerStatistics, statisticsValue);
  assert.equal(value.publishedCards, presentationsValue);
  assert.equal(value.canonicalPlayerId, "canonical-1");
  assert.deepEqual(h.calls, ["ranking", "statistics", "presentation"], "no duplicate reads");
});

test("early ranking rejection is observed during pending statistics and preserved before rendering", async () => {
  const ranking = deferred<unknown>();
  const statistics = deferred<unknown>();
  const h = fixture({ ranking: ranking.promise, statistics: statistics.promise });
  const error = new Error("ranking read failed");
  const observed = assert.rejects(h.run(), (failure) => failure === error);
  await flush();
  ranking.reject(error);
  await flush();
  statistics.resolve(statisticsValue);
  await observed;
});

test("public failure wins without waiting for ranking and its later rejection remains observed", async () => {
  const ranking = deferred<unknown>();
  const identity = deferred<unknown>();
  const h = fixture({ ranking: ranking.promise, identity: identity.promise });
  const error = new Error("identity read failed");
  const observed = assert.rejects(h.run(), (failure) => failure === error);
  identity.reject(error);
  await observed;
  ranking.reject(new Error("late ranking failure"));
  await flush();
  assert.deepEqual(h.calls, ["ranking"]);
});

test("immediate and delayed ranking produce the same profile inputs and verified owner navigation", async () => {
  const auth = Promise.resolve({ data: { user: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test", app_metadata: { touchline_arena_access_v1: true } } }, error: null });
  const immediate = await fixture({ ranking: Promise.resolve(rankingValue), auth }).run();
  const ranking = deferred<unknown>();
  const delayed = fixture({ ranking: ranking.promise, auth }).run();
  await flush();
  ranking.resolve(rankingValue);
  assert.deepEqual(await delayed, immediate);
  assert.deepEqual(immediate.navigationSurface, { isAuthenticated: true, isAdmin: true });
});

test("auth failure still prevents a successfully ranked profile from rendering", async () => {
  const auth = deferred<unknown>();
  const error = new Error("auth failed");
  const h = fixture({ ranking: Promise.resolve(rankingValue), auth: auth.promise });
  const observed = assert.rejects(h.run(), (failure) => failure === error);
  auth.reject(error);
  await observed;
});
