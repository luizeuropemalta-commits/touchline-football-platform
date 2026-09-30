import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const start = source.indexOf("  const supabase = await createClient();");
const alternative = source.indexOf("  const currentUserPromise = (async () => {");
const begin = alternative >= 0 ? alternative : start;
const end = source.indexOf("  const editorialCard =", begin);
assert.ok(end > begin && begin > 0);
const body = source.slice(begin, end);
const compiled = ts.transpileModule(`async function run() { ${body}\nreturn { currentUser, navigationSurface, playerStatistics }; }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(auth: Promise<unknown>, statistics?: Promise<unknown>) {
  const statsStarted = deferred<boolean>();
  const dependencies = {
    createClient: async () => ({ auth: { getUser: () => auth } }),
    canonicalLink: { status: "absent" }, canonicalResolution: null,
    playerKey: "1", query: {},
    resolveTouchLinePlayerProfile: () => ({ card: { name: "Fixture" }, exactPlayer: {}, club: null, isLocalCard: false }),
    resolveTouchLineOfficialLookup: () => ({ providerPlayerId: "1", name: "Fixture" }),
    loadTouchlinePublicPlayerProjections: async () => ({ projections: [] }),
    loadTouchLineOfficialPlayerIdentity: async () => ({ providerPlayerId: "1" }),
    loadTouchLineActiveRanking: async () => null,
    resolveTouchlineGlobalNavigationSurface: (value: unknown) => value,
    isOwnerEmail: (email: string) => email === "owner@example.test",
    resolveTouchLineUnavailableOfficialProfile: () => ({ card: {}, exactPlayer: {}, club: null, isLocalCard: false }),
    loadTouchLinePlayerStatisticsReadModel: async () => { statsStarted.resolve(true); return statistics ?? "statistics"; },
    loadTouchlinePublishedCardPresentations: async () => new Map(),
  };
  const run = new Function(...Object.keys(dependencies), `${compiled}; return run;`)(...Object.values(dependencies));
  return { run, statsStarted };
}

test("public statistics start while auth is pending; verified owner navigation is retained", async () => {
  const auth = deferred<unknown>();
  const { run, statsStarted } = fixture(auth.promise);
  const result = run();
  await new Promise<void>((resolve) => setImmediate(resolve));
  let started = false;
  void statsStarted.promise.then(() => { started = true; });
  await Promise.resolve();
  const startedBeforeAuth = started;
  auth.resolve({ data: { user: { email: "owner@example.test" } } });
  const value = await result;
  assert.equal(startedBeforeAuth, true, "statistics must not await auth");
  assert.deepEqual(value.navigationSurface, { isAuthenticated: true, isAdmin: true });
  assert.equal(value.playerStatistics, "statistics");
});

test("auth rejection remains the same error rather than anonymous fallback", async () => {
  const auth = deferred<unknown>();
  const { run } = fixture(auth.promise);
  const failure = new Error("auth boundary failure");
  const result = run();
  const observed = assert.rejects(result, (error) => error === failure);
  auth.reject(failure);
  await observed;
});

test("anonymous session keeps public navigation without owner access", async () => {
  const { run } = fixture(Promise.resolve({ data: { user: null } }));
  assert.deepEqual((await run()).navigationSurface, { isAuthenticated: false, isAdmin: false });
});

test("auth rejection is observed while public statistics remain pending", async () => {
  const auth = deferred<unknown>();
  const statistics = deferred<unknown>();
  const { run } = fixture(auth.promise, statistics.promise);
  const error = new Error("early auth failure");
  const result = run();
  const observed = assert.rejects(result, (failure) => failure === error);
  auth.reject(error);
  await new Promise<void>((resolve) => setImmediate(resolve));
  statistics.resolve("statistics");
  await observed;
});

test("public failure is retained and later auth rejection is still observed", async () => {
  const auth = deferred<unknown>();
  const statistics = deferred<unknown>();
  const { run } = fixture(auth.promise, statistics.promise);
  const error = new Error("public source failure");
  const observed = assert.rejects(run(), (failure) => failure === error);
  statistics.reject(error);
  await observed;
  auth.reject(new Error("late auth failure"));
  await new Promise<void>((resolve) => setImmediate(resolve));
});

test("canonical validation still precedes session and public enrichment", () => {
  const gate = source.indexOf('if (canonicalLink.status === "valid" && !canonicalResolution) notFound();');
  assert.ok(gate > 0 && gate < begin);
});
