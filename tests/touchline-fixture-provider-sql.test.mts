import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearFootballDataCache } from "../lib/football-data/cache.ts";

const root = new URL("../", import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith("@/") ? new URL(`${specifier.slice(2)}.ts`, root).href : specifier, context);
} });
const { createGuardedFixtureProvider } = await import("../lib/football-data/fixture-provider-server.ts");
const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const { PGlite } = runtime ? await import(runtime) : { PGlite: null };

test("server factory and real provider preserve SQL cooldown across provider instances", {skip:!runtime}, async () => {
  const db = new PGlite();
  const savedFetch = globalThis.fetch;
  const token = process.env.SPORTMONKS_API_TOKEN;
  const base = process.env.SPORTMONKS_BASE_URL;
  let requests = 0;
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(readFileSync(new URL("../supabase/migrations/20261002152457_touchline_fixture_quota_authority.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../supabase/migrations/20261003233637_touchline_sportmonks_prequery_authority.sql", import.meta.url), "utf8"));
    await db.exec("insert into public.touchline_fixture_quota_scopes(account_scope,enabled) values('qa-main',true);");
    // Replace only the database transport; execute the actual RPC bodies.
    const admin = {rpc(name: string, args: Record<string, unknown>) { return {
      async abortSignal(signal: AbortSignal) {
        assert.equal(signal.aborted, false);
        const admission = name === "touchline_fixture_quota_admit";
        assert.ok(admission || name === "touchline_fixture_quota_complete");
        const values = [args.p_account_scope,args.p_request_id,args.p_endpoint,args.p_attempt];
        const query = admission
          ? "select public.touchline_fixture_quota_admit($1,$2,$3,$4,$5) v"
          : "select public.touchline_fixture_quota_complete($1,$2,$3,$4,$5,$6::jsonb) v";
        values.push(admission ? args.p_budget_ms : args.p_token);
        if (!admission) values.push(JSON.stringify(args.p_observation));
        return {data:(await db.query(query,values)).rows[0].v,error:null};
      },
    }; }} as unknown as SupabaseClient;
    process.env.SPORTMONKS_API_TOKEN = "synthetic-token";
    process.env.SPORTMONKS_BASE_URL = "https://sportmonks.invalid/v3/football";
    globalThis.fetch = async () => {
      requests++;
      return new Response(JSON.stringify({data:[],rate_limit:{requested_entity:"Fixture",remaining:0,resets_in_seconds:120}}),
        {status:429,headers:{"content-type":"application/json"}});
    };
    clearFootballDataCache();
    assert.throws(() => createGuardedFixtureProvider(admin, ""), /binding unavailable/);
    const first = await createGuardedFixtureProvider(admin,"qa-main").getLiveScores({competitionId:"8"});
    assert.equal(first.ok,false);
    assert.equal(requests,1);
    clearFootballDataCache();
    const next = await createGuardedFixtureProvider(admin,"qa-main").getLiveScores({competitionId:"8"});
    assert.equal(next.ok,false);
    assert.equal(requests,1,"a new provider instance must not bypass persisted cooldown");
    assert.equal((await createGuardedFixtureProvider(admin,"qa-main").getCompetitionById("8")).ok, false);
    assert.equal((await createGuardedFixtureProvider(admin,"qa-main").getSeasonById("28083")).ok, false);
    assert.equal((await createGuardedFixtureProvider(admin,"qa-main").getSeasonStages({seasonId:"28083",leagueId:"8",totalBudgetMs:1000})).ok, false);
    assert.equal((await createGuardedFixtureProvider(admin,"qa-main").getSeasonTopScorers({seasonId:"28083",totalBudgetMs:1000})).ok, false);
    assert.equal(requests,1,"calendar and awards cannot bypass the account cooldown with another endpoint");
    const state = (await db.query("select cooldown_until > clock_timestamp() cooling, active_token from public.touchline_fixture_quota_scopes")).rows[0];
    assert.deepEqual(state,{cooling:true,active_token:null});
  } finally {
    globalThis.fetch = savedFetch;
    if (token === undefined) delete process.env.SPORTMONKS_API_TOKEN; else process.env.SPORTMONKS_API_TOKEN = token;
    if (base === undefined) delete process.env.SPORTMONKS_BASE_URL; else process.env.SPORTMONKS_BASE_URL = base;
    clearFootballDataCache();
    await db.close();
  }
});
