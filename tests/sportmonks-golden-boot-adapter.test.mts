import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { clearFootballDataCache, withFootballDataCache } from "../lib/football-data/cache.ts";
import type { SportmonksQuotaTrace } from "../lib/football-data/sportmonks-quota-observation.ts";

const root = new URL("../", import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith("@/") ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { SportmonksFootballProvider } = await import("../lib/football-data/providers/sportmonks.ts");

const row = (player = 10, goals = 3, extra = {}) => ({ id: player, player_id: player, participant_id: 9, season_id: 28083, league_id: 8, stage_id: 1, type_id: 208, total: goals, ...extra });
const page = (rows: unknown[], current = 1, more = false) => ({ data: rows, pagination: { count: rows.length, per_page: 50, current_page: current, has_more: more } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Provider = InstanceType<typeof SportmonksFootballProvider>;

test("quota retains retries, original times and IDs across unobserved cache owners", async () => {
  let calls = 0;
  const traces: SportmonksQuotaTrace[] = [];
  await synthetic(async () => {
    calls++;
    return response({
      ...page([row()]),
      rate_limit: { remaining: calls === 1 ? 0 : 9, resets_in_seconds: 30, requested_entity: "Topscorers" },
    }, calls === 1 ? 429 : 200);
  }, async provider => {
    const first = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 3_000 });
    const second = await provider.getSeasonTopScorers({
      seasonId: "28083", totalBudgetMs: 3_000, quotaObserver: trace => { traces.push(trace); },
    });
    assert.equal(first.ok, true); assert.equal(second.ok, true); assert.equal(calls, 2);
    assert.equal(first.fetchedAt, second.fetchedAt);
    const trace = traces.at(-1)!;
    assert.equal(trace.coverage, "complete");
    assert.deepEqual(trace.observations.map(value => value.status), [429, 200]);
    assert.deepEqual(trace.observations.map(value => value.attempt), [1, 2]);
    assert.equal(trace.observations[1]!.observedAt, first.fetchedAt);
    assert.equal(trace.observations[0]!.requestId, trace.observations[1]!.requestId);
    assert.deepEqual(trace.reusedRequestIds, [trace.observations[0]!.requestId]);
    const throttle = trace.observations[0]!;
    assert.equal(Date.parse(throttle.cooldownUntil!) - Date.parse(throttle.observedAt!), 30_000);
    assert.doesNotMatch(JSON.stringify(trace), /synthetic-token|sportmonks.invalid|player_id|message/);
  });
});

test("inflight join replays one request identity, not duplicate consumption", async () => {
  let calls = 0, release!: () => void, started!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const began = new Promise<void>(resolve => { started = resolve; });
  const owner: SportmonksQuotaTrace[] = [], joiner: SportmonksQuotaTrace[] = [];
  await synthetic(async () => { calls++; started(); await barrier; return response(page([row()])); }, async provider => {
    const a = provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 3_000, quotaObserver: t => { owner.push(t); } });
    await began;
    const b = provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 3_000, quotaObserver: t => { joiner.push(t); } });
    release(); await Promise.all([a, b]);
    assert.equal(calls, 1);
    assert.deepEqual(owner.at(-1)!.observations, joiner.at(-1)!.observations);
    assert.deepEqual(owner.at(-1)!.reusedRequestIds, []);
    assert.deepEqual(joiner.at(-1)!.reusedRequestIds, [owner.at(-1)!.observations[0]!.requestId]);
    assert.equal(owner.at(-1)!.observations[0]!.remaining, null);
    assert.equal(owner.at(-1)!.observations[0]!.requestedEntity, null);
  });
});

test("later-page failure preserves earlier quota and cooldown without partial facts", async () => {
  let calls = 0;
  const traces: SportmonksQuotaTrace[] = [];
  await synthetic(async () => {
    if (++calls === 1) return response({
      ...page([row()], 1, true),
      rate_limit: { remaining: 3, resets_in_seconds: 10, requested_entity: "Topscorers" },
    });
    const failed = response({ message: "PRIVATE sentinel", rate_limit: { remaining: 0, resets_in_seconds: 120, requested_entity: "Topscorers" } }, 429);
    failed.headers.set("Retry-After", "180");
    return failed;
  }, async provider => {
    const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 1_000, quotaObserver: t => { traces.push(t); } });
    assert.equal(result.ok, false); assert.equal("data" in result, false); assert.equal(calls, 2);
    const trace = traces.at(-1)!;
    assert.equal(trace.coverage, "complete");
    assert.deepEqual(trace.observations.map(value => value.status), [200, 429]);
    const last = trace.observations[1]!;
    assert.equal(Date.parse(last.cooldownUntil!) - Date.parse(last.observedAt!), 180_000);
    assert.doesNotMatch(JSON.stringify(trace), /PRIVATE|sentinel/);
  });
});

test("legacy cache without attempt metadata is unknown, never invented zero cost", async () => {
  await synthetic(async () => { throw Error("No network permitted"); }, async provider => {
    const params = { filters: "seasontopscorerTypes:208", include: "season;player;participant;type", per_page: 50, page: 1 };
    const fetchedAt = new Date().toISOString();
    await withFootballDataCache("live", ["sportmonks", "/topscorers/seasons/28083", JSON.stringify(params)], async () => ({
      ok: true, status: 200, data: page([row()]), headers: new Headers(), fetchedAt,
    }));
    const traces: SportmonksQuotaTrace[] = [];
    const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 1_000, quotaObserver: t => { traces.push(t); } });
    assert.equal(result.ok, true); assert.equal(result.fetchedAt, fetchedAt);
    assert.deepEqual(traces.at(-1), { coverage: "unknown", observations: [], reusedRequestIds: [] });
  });
});

test("a later in-flight timeout preserves earlier cooldown and remains unknown after late completion", async () => {
  await synthetic(async () => response({
    ...page([row()], 1, true),
    rate_limit: { remaining: 0, resets_in_seconds: 120, requested_entity: "Topscorers" },
  }), async provider => {
    const params = { filters: "seasontopscorerTypes:208", include: "season;player;participant;type", per_page: 50, page: 2 };
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const joined = withFootballDataCache("live", ["sportmonks", "/topscorers/seasons/28083", JSON.stringify(params)], async () => {
      await barrier;
      return { ok: true, status: 200, data: page([row(11)], 2), headers: new Headers(), fetchedAt: new Date().toISOString() };
    });
    const traces: SportmonksQuotaTrace[] = [];
    try {
      const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 100, quotaObserver: t => { traces.push(t); } });
      assert.equal(result.ok, false); assert.equal("data" in result, false);
      const final = traces.at(-1)!;
      assert.equal(final.coverage, "unknown"); assert.equal(final.observations.length, 1);
      assert.equal(Date.parse(final.observations[0]!.cooldownUntil!) - Date.parse(final.observations[0]!.observedAt!), 120_000);
      const count = traces.length;
      release(); await joined; await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(traces.length, count, "closed operation does not claim later completeness");
    } finally { release(); await joined; }
  });
});

test("stage observer failure preserves facts and malformed quota stays null", async () => {
  const traces: SportmonksQuotaTrace[] = [];
  await synthetic(async () => response({
    data: [{ id: 1, season_id: 28083, league_id: 8, type_id: 223 }],
    rate_limit: { remaining: "50 left", resets_in_seconds: -1, requested_entity: "PRIVATE token/url" },
  }), async provider => {
    const result = await provider.getSeasonStages({ seasonId: "28083", leagueId: "8", totalBudgetMs: 1_000,
      quotaObserver: t => { traces.push(t); throw Error("PRIVATE observer"); } });
    assert.equal(result.ok, true);
    const trace = traces.at(-1)!;
    assert.equal(trace.coverage, "complete"); assert.equal(trace.observations.length, 1);
    assert.equal(trace.observations[0]!.remaining, null); assert.equal(trace.observations[0]!.resetAt, null);
    assert.equal(trace.observations[0]!.requestedEntity, null);
    assert.doesNotMatch(JSON.stringify(trace), /PRIVATE|token/);
  });
});
async function synthetic(mock: typeof fetch, run: (provider: Provider) => Promise<void>) {
  const original = globalThis.fetch;
  clearFootballDataCache();
  const provider = new SportmonksFootballProvider();
  // Override the adapter's runtime seams, never read or replace real credentials.
  Object.assign(provider, { token: () => "synthetic-token", baseUrl: () => "https://sportmonks.invalid/v3/football" });
  globalThis.fetch = mock;
  try { await run(provider); } finally { globalThis.fetch = original; clearFootballDataCache(); }
}

test("strict season goals read follows pages with type 208, retaining shared lead facts", async () => {
  const urls: URL[] = [];
  await synthetic(async input => {
    const url = new URL(String(input)); urls.push(url);
    assert.equal(url.pathname, "/v3/football/topscorers/seasons/28083");
    assert.equal(url.searchParams.get("filters"), "seasontopscorerTypes:208");
    assert.equal(url.searchParams.get("include"), "season;player;participant;type");
    assert.equal(url.searchParams.get("per_page"), "50");
    return response(page([row(Number(url.searchParams.get("page")) + 10)], urls.length, urls.length === 1));
  }, async provider => {
    assert.equal(typeof provider.getSeasonTopScorers, "function", "strict adapter must exist before callers can infer leadership");
    const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 1_000 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.scopeStatus, "complete");
    assert.deepEqual(result.data.rows.map(value => value.providerPlayerId), ["11", "12"]);
    assert.equal(result.data.pagesRead, 2);
    assert.equal(urls.length, 2);
  });
});

test("strict pagination rejects truncation, repeated/empty pages and inconsistent metadata", async () => {
  const scenarios = [
    { name: "cap", bodies: [page([row()], 1, true)], maxPages: 1 },
    { name: "empty-more", bodies: [page([], 1, true)] },
    { name: "repeated-number", bodies: [page([row()], 1, true), page([row(11)], 1)] },
    { name: "repeated-content", bodies: [page([row()], 1, true), page([row()], 2)] },
    { name: "reordered-repeat", bodies: [page([row(10), row(11)], 1, true), page([row(11), row(10)], 2)] },
    { name: "missing-pagination", bodies: [{ data: [row()] }] },
    { name: "count-mismatch", bodies: [{ ...page([row()]), pagination: { ...page([]).pagination, count: 2 } }] },
    { name: "oversize", bodies: [page(Array.from({ length: 51 }, (_, n) => row(n + 1)))] },
    { name: "terminal-next-page", bodies: [{ ...page([row()]), pagination: { ...page([]).pagination, count: 1, next_page: "unexpected" } }] },
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    await synthetic(async () => response(scenario.bodies[calls++]), async provider => {
      const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 1_000, maxPages: scenario.maxPages });
      assert.equal(result.ok, false, scenario.name);
      assert.equal(calls, scenario.bodies.length, scenario.name);
    });
  }
});

test("later-page entitlement/rate failures never expose a partial leader list", async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    await synthetic(async () => {
      if (++calls === 1) return response(page([row()], 1, true));
      const failure = response({ message: "unavailable", rate_limit: { remaining: 0 } }, status);
      failure.headers.set("retry-after", "120");
      return failure;
    }, async provider => {
      const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 1_000 });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.status, status);
      assert.equal("data" in result, false);
      assert.equal(calls, 2);
    });
  }
});

test("strict normalizer does not invent omitted stage/league and rejects conflicting or malformed facts", async () => {
  const cases = [
    { rows: [row(10, 3, { stage_id: undefined })], status: "unavailable" },
    { rows: [row(10, 3, { league_id: undefined })], status: "unavailable" },
    { rows: [row(10, 3, { league: { id: 9 } })], status: "ambiguous" },
    { rows: [row(10, 3, { season_id: 999 })], status: "ambiguous" },
    { rows: [row(10, 3), row(10, 4)], status: "ambiguous" },
    { rows: [row(10, 3), row(10, 4, { id: 11 })], status: "ambiguous" },
    { rows: [row(10, 3, { total: "3 goals" })], status: "unavailable" },
    { rows: [row(10, 3, { type_id: 209 })], status: "unavailable" },
    { rows: [row(10, 3, { total: -1 })], status: "unavailable" },
    { rows: [row(10, 3, { player: { id: 11 } })], status: "ambiguous" },
    { rows: [row(10, 3, { participant_id: undefined, participant: { id: 9 } })], status: "complete" },
    { rows: [row(10, 3, { participant: { id: 99 } })], status: "ambiguous" },
    { rows: [row(10, 3, { stage_id: undefined, participant: { id: 9 } })], status: "unavailable" },
    { rows: [row(10, 3, { stage_id: undefined, league_id: undefined, stage: { id: 1, season_id: 28083 }, season: { id: 28083, league_id: 8 } })], status: "complete" },
  ];
  for (const value of cases) await synthetic(async () => response(page(value.rows)), async provider => {
    const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 1_000 });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.scopeStatus, value.status);
  });
});

test("oldest cached page owns freshness even when another page was fetched now", async () => {
  let calls = 0;
  await synthetic(async () => { calls++; return response(page([row(10)], 1, true)); }, async provider => {
    const old = new Date(Date.now() - 5_000).toISOString();
    const params = { filters: "seasontopscorerTypes:208", include: "season;player;participant;type", per_page: 50, page: 2 };
    await withFootballDataCache("live", ["sportmonks", "/topscorers/seasons/28083", JSON.stringify(params)], async () => ({
      ok: true, status: 200, data: page([row(11)], 2), headers: new Headers(), fetchedAt: old,
    }));
    for (const cached of [false, true]) {
      const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 1_000 });
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.equal(result.fetchedAt, old);
      assert.equal(result.data.fetchedAt, old);
      assert.equal(result.cached, cached);
    }
    assert.equal(calls, 1);
  });
});

test("total budget bounds stalled HTTP and rejects invalid parameters without HTTP", async () => {
  let calls = 0;
  await synthetic(async (_input, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  }, async provider => {
    for (const input of [
      { seasonId: "../invalid", totalBudgetMs: 1_000 },
      { seasonId: "28083", totalBudgetMs: NaN },
      { seasonId: "28083", totalBudgetMs: 1_000, maxPages: Infinity },
    ]) assert.equal((await provider.getSeasonTopScorers(input)).ok, false);
    assert.equal(calls, 0);
    const result = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 20 });
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
  });
});

test("a short-budget reader also bounds its wait on shared in-flight cache work", async () => {
  let release!: (value: Response) => void;
  let calls = 0;
  await synthetic(async () => { calls++; return new Promise<Response>(resolve => { release = resolve; }); }, async provider => {
    const longer = provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 1_000 });
    const short = await provider.getSeasonTopScorers({ seasonId: "28083", totalBudgetMs: 10 });
    assert.equal(short.ok, false);
    assert.equal(calls, 1);
    release(response(page([row()])));
    assert.equal((await longer).ok, true);
  });
});
