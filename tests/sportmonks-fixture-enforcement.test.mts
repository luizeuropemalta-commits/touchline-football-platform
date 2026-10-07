import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { clearFootballDataCache } from "../lib/football-data/cache.ts";
import type { SportmonksQuotaObservation, SportmonksQuotaTrace } from "../lib/football-data/sportmonks-quota-observation.ts";

const root = new URL("../", import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith("@/") ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { SportmonksFootballProvider } = await import("../lib/football-data/providers/sportmonks.ts");
type Provider = InstanceType<typeof SportmonksFootballProvider>;
// Contract-first constructor boundary: baseline deliberately ignores options.
const Constructor = SportmonksFootballProvider as unknown as new(options?: unknown) => Provider;
type Context = import("../lib/football-data/providers/sportmonks.ts").SportmonksFixtureRequestContext;
type Attempt = Readonly<{ attempt: number; signal: AbortSignal; remainingBudgetMs: number }>;
type Completion = Attempt & Readonly<{ token: string; observation: SportmonksQuotaObservation }>;
type Guard = { accountScope: string; createPort(context: Context): {
  beforeAttempt(context: Attempt): unknown;
  afterAttempt(context: Completion): unknown;
}; quotaObserver?: (trace: SportmonksQuotaTrace) => void };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function fixture(id = 8) {
  return { id, league_id: 8, season_id: 28083, starting_at_timestamp: 1_800_000_000,
    state: { name: "In Play" }, participants: [
      { id: 10, name: "Synthetic Home", meta: { location: "home" } },
      { id: 11, name: "Synthetic Away", meta: { location: "away" } },
    ], scores: [], lineups: [], formations: [], events: [], sidelined: [] };
}
function json(data: unknown, extra: Record<string, unknown> = {}, status = 200) {
  return new Response(JSON.stringify({ data, rate_limit: { requested_entity: "Fixture", remaining: 12, resets_in_seconds: 60 }, ...extra }),
    { status, headers: { "content-type": "application/json" } });
}
function guard(accountScope = "qa-main") {
  const contexts: Context[] = [], completions: Completion[] = [], admissions: Attempt[] = [], traces: SportmonksQuotaTrace[] = [];
  const binding: Guard = { accountScope, createPort(context) {
    contexts.push(context);
    return {
      beforeAttempt(attempt) { admissions.push(attempt); return { allowed: true, token: "private-lease-token" }; },
      afterAttempt(completion) { completions.push(completion); return { persisted: true }; },
    };
  }, quotaObserver: trace => { traces.push(trace); } };
  return { binding, contexts, completions, admissions, traces, provider: () => new Constructor({ fixtureGuard: binding }) };
}
async function synthetic(fetcher: typeof fetch, body: () => Promise<void>) {
  const savedFetch = globalThis.fetch;
  const previous = { token: process.env.SPORTMONKS_API_TOKEN, base: process.env.SPORTMONKS_BASE_URL };
  clearFootballDataCache();
  process.env.SPORTMONKS_API_TOKEN = "synthetic-private-api-token";
  process.env.SPORTMONKS_BASE_URL = "https://sportmonks.invalid/v3/football";
  globalThis.fetch = fetcher;
  try { await body(); } finally {
    globalThis.fetch = savedFetch;
    if (previous.token === undefined) delete process.env.SPORTMONKS_API_TOKEN;
    else process.env.SPORTMONKS_API_TOKEN = previous.token;
    if (previous.base === undefined) delete process.env.SPORTMONKS_BASE_URL;
    else process.env.SPORTMONKS_BASE_URL = previous.base;
    clearFootballDataCache();
  }
}

test("only single-feed explicit zero-HTTP denial exposes deferred recovery result", async () => {
  let fetches = 0, admissions = 0;
  await synthetic(async () => { fetches++; return json(fixture()); }, async () => {
    const p = new Constructor({fixtureGuard:{accountScope:"qa-main",createPort:()=>({
      beforeAttempt:()=>{admissions++; return {allowed:false};},afterAttempt:()=>({persisted:true}),
    })}});
    for (let index=0;index<2;index++) {
      const result = await p.getFixtureFantasyFeed("8");
      assert.equal(result.ok,false);
      if (!result.ok) assert.equal(result.error.code,"deferred");
    }
    assert.equal(admissions,2,"deferred responses must not be cached");
    const window = await p.getFixturesBetween({fromDate:"2026-10-01",throughDate:"2026-10-02",competitionId:"8"});
    assert.equal(window.ok,false);
    if (!window.ok) assert.notEqual(window.error.code,"deferred","multi-page operations cannot assert whole-operation zero HTTP");
    assert.equal(fetches,0);
  });
});

test("exact Fixture endpoint families use sanitized awaited ports; League is not misclassified", async () => {
  const g = guard();
  let calls = 0;
  await synthetic(async (input, init) => {
    calls++;
    assert.equal(Object.hasOwn(init ?? {}, "enforcement"), false);
    assert.equal(JSON.stringify(init).includes("private-lease-token"), false);
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/leagues/8")) return json({ id: 8, name: "Synthetic League" }, { rate_limit: { requested_entity: "League", remaining: 12, resets_in_seconds: 60 } });
    return json(/\/fixtures\/8$/.test(path) ? fixture() : [fixture()]);
  }, async () => {
    const p = g.provider();
    const results = [await p.getFixtureById("8"), await p.getFixtureFantasyFeed("8"),
      await p.getFixturesByDate({ date: "2026-10-02" }),
      await p.getFixturesBetween({ fromDate: "2026-10-01", throughDate: "2026-10-02", competitionId: "8" }),
      await p.getLiveScores({ competitionId: "8" }), await p.getLatestLiveScores(), await p.getCompetitionById("8")];
    assert.ok(results.every(result => result.ok)); assert.equal(calls, 7);
    assert.deepEqual(g.contexts.map(context => context.endpoint), ["fixture", "fixture", "date", "between", "inplay", "latest", "league"]);
    assert.equal(g.completions.length, 7);
    for (const context of g.contexts) {
      assert.deepEqual(Object.keys(context).sort(), ["accountScope", "endpoint", "entity", "requestId"]);
      assert.equal(context.entity, context.endpoint === "league" ? "League" : "Fixture"); assert.equal(context.accountScope, "qa-main"); assert.ok(Object.isFrozen(context));
    }
    for (const completion of g.completions) {
      assert.equal(completion.token, "private-lease-token");
      const league = completion === g.completions.at(-1);
      assert.equal(completion.observation.operation, league ? "league" : "fixture"); assert.equal(completion.observation.requestedEntity, league ? "League" : "Fixture");
      assert.deepEqual(Object.keys(completion.observation).sort(), ["attempt", "cooldownUntil", "observedAt", "operation", "remaining", "requestId", "requestedEntity", "resetAt", "status"]);
      assert.doesNotMatch(JSON.stringify(completion.observation), /api-token|lease-token|sportmonks.invalid|Synthetic|participants/);
      assert.equal(Object.hasOwn(completion, "response"), false);
    }
  });
});

test("explicit invalid account binding fails before fetch or reuse of a legacy cache", async () => {
  let calls = 0;
  await synthetic(async () => { calls++; return json(fixture()); }, async () => {
    assert.equal((await new SportmonksFootballProvider().getFixtureById("8")).ok, true);
    for (const accountScope of ["", "QA-MAIN", " qa-main", "qa-main ", "qa:main", "qa/main", "a".repeat(65)]) {
      const g = guard(accountScope);
      const result = await g.provider().getFixtureById("8");
      assert.equal(result.ok, false, accountScope); assert.equal(g.contexts.length, 0);
    }
    for (const fixtureGuard of [null, {}, { accountScope: "qa-main", createPort: null }]) {
      assert.equal((await new Constructor({ fixtureGuard }).getFixtureById("8")).ok, false);
    }
    assert.equal(calls, 1);
  });
});

test("fixture path lookalikes and impossible dates cannot bypass an explicit guard", async () => {
  let calls = 0;
  await synthetic(async () => { calls++; return json(fixture()); }, async () => {
    const g = guard(), p = g.provider();
    for (const id of ["08", "8/players", "8?include=secret", "8%2fplayers", "8#tail"]) {
      assert.equal((await p.getFixtureById(id)).ok, false, id);
      assert.equal((await p.getCompetitionById(id)).ok, false, id);
      assert.equal((await p.getSeasonById(id)).ok, false, id);
    }
    assert.equal((await p.getFixturesByDate({ date: "2026-02-30" })).ok, false);
    assert.equal((await p.getFixturesByDate({ date: "2026-10-02/more" })).ok, false);
    assert.equal((await p.getFixturesBetween({ fromDate: "2026-10-01", throughDate: "2026-10-02/extra", competitionId: "8" })).ok, false);
    assert.equal(calls, 0); assert.equal(g.contexts.length, 0);
  });
});

test("guarded cache isolates legacy, accounts and diagnostic policy but reuses the same account", async () => {
  let calls = 0;
  await synthetic(async () => { calls++; return json(fixture()); }, async () => {
    const a = guard("qa-a"), b = guard("qa-b");
    assert.equal((await new SportmonksFootballProvider().getFixtureFantasyFeed("8")).ok, true);
    const first = await a.provider().getFixtureFantasyFeed("8");
    const same = await a.provider().getFixtureFantasyFeed("8");
    assert.equal((await b.provider().getFixtureFantasyFeed("8")).ok, true);
    assert.equal((await a.provider().getFixtureFantasyFeed("8", { totalBudgetMs: 500 })).ok, true);
    assert.equal(first.ok, true); assert.equal(same.ok, true); assert.equal(same.fetchedAt, first.fetchedAt);
    assert.equal(calls, 4); assert.equal(a.contexts.length, 2); assert.equal(b.contexts.length, 1);
  });
});

test("season cache is isolated by the expanded guard version and account, with exact quota identity", async () => {
  let calls=0;
  await synthetic(async()=>{calls++;return json({id:28083,name:"Synthetic Season",league_id:8},
    {rate_limit:{requested_entity:"Season",remaining:10,resets_in_seconds:30}});},async()=>{
    const a=guard("qa-a"),b=guard("qa-b");
    assert.equal((await new SportmonksFootballProvider().getSeasonById("28083")).ok,true);
    assert.equal((await a.provider().getSeasonById("28083")).ok,true);
    assert.equal((await a.provider().getSeasonById("28083")).ok,true);
    assert.equal((await b.provider().getSeasonById("28083")).ok,true);
    assert.equal(calls,3);
    assert.equal(a.contexts[0]?.endpoint,"season"); assert.equal(a.contexts[0]?.entity,"Season");
    assert.equal(a.completions[0]?.observation.operation,"season");
    assert.equal(a.completions[0]?.observation.requestedEntity,"Season");
    assert.equal(a.completions.length,1); assert.equal(b.completions.length,1);
  });
});

test("in-flight loads share only the same guarded account and policy", async () => {
  const began = deferred<void>(), release = deferred<void>();
  let calls = 0;
  await synthetic(async () => { calls++; began.resolve(); await release.promise; return json(fixture()); }, async () => {
    const a = guard("qa-a"), b = guard("qa-b");
    const legacy = new SportmonksFootballProvider().getFixtureById("8");
    await began.promise;
    const one = a.provider().getFixtureById("8"), same = a.provider().getFixtureById("8"), other = b.provider().getFixtureById("8");
    await tick(); release.resolve();
    const results = await Promise.all([legacy, one, same, other]);
    assert.ok(results.every(result => result.ok)); assert.equal(calls, 3);
    assert.equal(a.completions.length, 1); assert.equal(b.completions.length, 1);
    assert.notEqual(a.contexts[0]?.requestId, b.contexts[0]?.requestId);
  });
});

test("pagination waits for persistence and stops on denied page two without partial facts or page three", async () => {
  const completion = deferred<unknown>();
  const pages: number[] = [];
  let ports = 0;
  await synthetic(async input => {
    const page = Number(new URL(String(input)).searchParams.get("page")); pages.push(page);
    return json([fixture(page)], { pagination: { current_page: page, has_more: true } });
  }, async () => {
    const binding: Guard = { accountScope: "qa-main", createPort() {
      const number = ++ports;
      return { beforeAttempt: () => number === 1 ? { allowed: true, token: "one" } : { allowed: false },
        afterAttempt: () => completion.promise };
    } };
    const pending = new Constructor({ fixtureGuard: binding }).getFixturesBetween({ fromDate: "2026-10-01", throughDate: "2026-10-02", competitionId: "8" });
    await tick(); const beforePersistence = pages.slice();
    completion.resolve({ persisted: true });
    const result = await pending;
    assert.deepEqual(beforePersistence, [1]); assert.deepEqual(pages, [1]); assert.equal(ports, 2);
    assert.equal(result.ok, false); assert.equal("data" in result, false);
  });
});

test("cache retains original throttle observation and deadline without another completion", async () => {
  let calls = 0;
  await synthetic(async () => { calls++; return json(fixture(), { rate_limit: { requested_entity: "Fixture", remaining: 0, resets_in_seconds: 120 } }); }, async () => {
    const g = guard(), p = g.provider();
    const first = await p.getFixtureById("8"); await tick();
    const again = await p.getFixtureById("8");
    assert.equal(first.ok, true); assert.equal(again.ok, true); assert.equal(calls, 1);
    assert.equal(g.completions.length, 1); assert.equal(first.fetchedAt, again.fetchedAt);
    const original = g.completions[0]!.observation, replay = g.traces.at(-1)!;
    assert.equal(original.observedAt, first.fetchedAt);
    assert.equal(Date.parse(original.cooldownUntil!) - Date.parse(original.observedAt!), 120_000);
    assert.equal(replay.coverage, "complete"); assert.deepEqual(replay.observations, [original]);
    assert.deepEqual(replay.reusedRequestIds, [original.requestId]);
  });
});

test("failed persistence or factory never caches a successful HTTP result or exposes private errors", async () => {
  let calls = 0, fail = true;
  await synthetic(async () => { calls++; return json(fixture()); }, async () => {
    const g = guard();
    g.binding.createPort = () => ({ beforeAttempt: () => ({ allowed: true, token: "private" }), afterAttempt: () => {
      if (fail) throw Error("PRIVATE SQL SENTINEL"); return { persisted: true };
    } });
    const p = g.provider();
    const failed = await p.getFixtureById("8");
    assert.equal(failed.ok, false); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE SQL SENTINEL|synthetic-private/);
    fail = false; assert.equal((await p.getFixtureById("8")).ok, true); assert.equal(calls, 2);
    const bad = guard("qa-other"); bad.binding.createPort = () => { throw Error("PRIVATE factory"); };
    const denied = await bad.provider().getFixtureById("8");
    assert.equal(denied.ok, false); assert.doesNotMatch(JSON.stringify(denied), /PRIVATE factory/); assert.equal(calls, 2);
  });
});

test("constructor captures trusted binding before caller mutation", async () => {
  const g = guard();
  await synthetic(async () => json(fixture()), async () => {
    const p = g.provider();
    g.binding.accountScope = "changed-scope";
    g.binding.createPort = () => { throw Error("mutated port factory"); };
    g.binding.quotaObserver = () => { throw Error("mutated observer"); };
    assert.equal((await p.getFixtureById("8")).ok, true);
    assert.equal(g.contexts[0]?.accountScope, "qa-main"); assert.equal(g.completions.length, 1); assert.ok(g.traces.length > 0);
  });
});

test("429 then success persists each original observation before the next guarded attempt", async () => {
  let calls = 0;
  const order: string[] = [];
  await synthetic(async () => {
    calls++; order.push(`fetch${calls}`);
    return json(fixture(), { rate_limit: { requested_entity: "Fixture", remaining: calls === 1 ? 0 : 10, resets_in_seconds: 30 },
      message: "PRIVATE raw provider message" }, calls === 1 ? 429 : 200);
  }, async () => {
    const g = guard();
    g.binding.createPort = context => {
      g.contexts.push(context);
      return { beforeAttempt: ({ attempt }) => { order.push(`before${attempt}`); return { allowed: true, token: `token${attempt}` }; },
        afterAttempt: completion => { order.push(`after${completion.attempt}`); g.completions.push(completion); return { persisted: true }; } };
    };
    const result = await g.provider().getFixtureById("8");
    assert.equal(result.ok, true); assert.equal(calls, 2);
    assert.deepEqual(order, ["before1", "fetch1", "after1", "before2", "fetch2", "after2"]);
    assert.equal(g.completions[0]?.observation.requestId, g.completions[1]?.observation.requestId);
    assert.deepEqual(g.completions.map(value => value.observation.status), [429, 200]);
    const first = g.completions[0]!.observation;
    assert.equal(Date.parse(first.cooldownUntil!) - Date.parse(first.observedAt!), 30_000);
    assert.doesNotMatch(JSON.stringify(g.completions.map(value => value.observation)), /PRIVATE|token1|token2|synthetic-private/);
    assert.equal(g.completions[1]?.observation.observedAt, result.fetchedAt);
  });
});
