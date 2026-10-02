// Optional local integration: actual producer/readers/parser + actual migration
// and SQL RPCs. Only the provider and PostgREST transport are replaced. Minimal
// source fixtures do not prove installed-schema ACLs or multi-session locking.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as editorial from "../lib/touchlineArena/editorial-card-profile.ts";
import * as provisional from "../lib/touchlineArena/card-engine-provisional-policy.ts";
import * as compatibility from "../lib/touchlineArena/card-engine-provisional-schema-compat.ts";
import * as seasonLabels from "../lib/touchlineArena/editorial-season.ts";
import * as stageScope from "../lib/touchlineArena/golden-boot-stage-scope.ts";
import * as eligibility from "../lib/touchlineArena/golden-boot-eligibility.ts";
import * as providerIds from "../lib/football-data/sportmonks-season-topscorers.ts";
import * as quotaCooldown from "../lib/football-data/sportmonks-quota-cooldown.ts";
import { parseGoldenBootPublicAuthority, createGoldenBootAuthorityState, advanceGoldenBootAuthority, hasGoldenBoot } from "../lib/touchlineArena/golden-boot-public-authority.ts";
import type { produceGoldenBootSnapshot } from "../lib/touchlineArena/golden-boot-producer.ts";
import type { FootballDataProvider, FootballDataResult, TouchlineSeasonStages, TouchlineSeasonTopScorers } from "../lib/football-data/types.ts";

const modulePath = process.env.TOUCHLINE_GOLDEN_BOOT_PGLITE_MODULE;
const { PGlite } = modulePath ? await import(modulePath) : { PGlite: null };
const migration = readFileSync(new URL("../supabase/migrations/20261001194607_touchline_golden_boot_authority.sql", import.meta.url), "utf8");
const seasonLabelsMigration = readFileSync(new URL("../supabase/migrations/20261002092823_touchline_golden_boot_season_labels.sql", import.meta.url), "utf8");
type Row = Record<string, unknown>;
type Success<T> = Extract<FootballDataResult<T>, { ok: true }>;
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const comp = uuid(1), season = uuid(2), club = uuid(3);
const players = [uuid(10), uuid(11)], members = [uuid(20), uuid(21)];

const schema = `
create role anon; create role authenticated; create role service_role bypassrls;
create table public.football_competitions(id uuid primary key,provider text,provider_competition_id text,unique(provider,provider_competition_id));
create table public.football_seasons(id uuid primary key,provider text,provider_season_id text,competition_id uuid,is_current boolean,name text,unique(provider,provider_season_id));
create table public.football_clubs(id uuid primary key,provider text,provider_team_id text,competition_id uuid,unique(provider,provider_team_id));
create table public.football_players(id uuid primary key,provider text,provider_player_id text,current_club_id uuid,unique(provider,provider_player_id));
create table public.football_squad_members(id uuid primary key,provider text,player_id uuid,club_id uuid,competition_id uuid,status text,jersey_number integer,unique(provider,club_id,player_id));
create table public.touchline_card_publications(player_id uuid primary key,current_membership_id uuid,competition_id uuid,effective_season text,
  publication_status text,last_reviewed_at timestamptz,calculated_tier text,calculated_nominal_price_gbp integer,internal_source text);
create table public.football_player_market_values(player_id uuid primary key,verified_season text,market_value_eur bigint,status text,confidence text,source text);
create table public.touchline_card_editorial_overrides(player_id uuid,field_key text,status text,provenance_status text,effective_value jsonb,
  last_verification_at timestamptz,next_verification_at timestamptz,unique(player_id,field_key));
grant select,insert,update,delete on all tables in schema public to service_role;
insert into public.football_competitions values('${comp}','sportmonks','8');
insert into public.football_seasons values('${season}','sportmonks','70001','${comp}',true,'2026/2027');
insert into public.football_clubs values('${club}','sportmonks','300','${comp}');
insert into public.football_players values('${players[0]}','sportmonks','200','${club}'),('${players[1]}','sportmonks','201','${club}');
insert into public.football_squad_members values('${members[0]}','sportmonks','${players[0]}','${club}','${comp}','active',10),
  ('${members[1]}','sportmonks','${players[1]}','${club}','${comp}','active',11);
insert into public.touchline_card_publications values('${players[0]}','${members[0]}','${comp}','2026-27','published',now(),'ruby-red',10,'editorial'),
  ('${players[1]}','${members[1]}','${comp}','2026-27','published',now(),'ruby-red',10,'editorial');
insert into public.football_player_market_values values('${players[0]}','2026-27',2500000,'verified','verified','editorial'),
  ('${players[1]}','2026-27',2500000,'verified','verified','editorial');
`;
const columns: Record<string, string> = {
  football_competitions: "id,provider,provider_competition_id",
  football_seasons: "id,provider,provider_season_id,competition_id,is_current,name",
  football_players: "id,provider,provider_player_id,current_club_id",
  football_clubs: "id,provider,provider_team_id,competition_id",
  football_squad_members: "id,provider,player_id,club_id,competition_id,status,jersey_number",
  touchline_card_publications: "player_id,current_membership_id,competition_id,effective_season,publication_status,calculated_tier,calculated_nominal_price_gbp,last_reviewed_at,internal_source",
  football_player_market_values: "player_id,market_value_eur,verified_season,status,confidence,source",
  touchline_card_editorial_overrides: "player_id,field_key,effective_value,status,provenance_status,last_verification_at,next_verification_at",
};
const rpcArguments: Record<string, readonly (readonly [string, string])[]> = {
  read_touchline_golden_boot_source_revision: [],
  try_begin_touchline_golden_boot_worker: [["p_comp", "uuid"], ["p_season", "uuid"], ["p_token", "uuid"]],
  complete_touchline_golden_boot_worker: [["p_token", "uuid"], ["p_generation", "bigint"], ["p_status", "text"],
    ["p_quota_known", "boolean"], ["p_cooldown_until", "timestamptz"]],
  finish_touchline_golden_boot_refresh: [["p_comp", "uuid"], ["p_season", "uuid"], ["p_token", "uuid"], ["p_revision", "bigint"],
    ["p_stages", "jsonb"], ["p_scorers", "jsonb"], ["p_leaders", "jsonb"], ["p_ttl_ms", "integer"], ["p_failure", "text"], ["p_worker_generation", "bigint"]],
  read_touchline_golden_boot: [["p_comp", "uuid"], ["p_season", "uuid"]],
};

function actualModule(name: string, imports: Record<string, unknown>) {
  const source = readFileSync(new URL(`../lib/touchlineArena/${name}.ts`, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInThisContext(`(function(exports,require){${javascript}\n})`)(exports, (key: string) => {
    assert.ok(Object.hasOwn(imports, key), `Unexpected import ${key}`); return imports[key];
  });
  return exports;
}
function providerEvidence() {
  const fetchedAt = new Date(Date.now() - 1000).toISOString();
  const stages: Success<TouchlineSeasonStages> = { ok: true, provider: "sportmonks", cached: true, fetchedAt, data: {
    requestedSeasonId: "70001", leagueId: "8", coverage: "complete", fetchedAt,
    rows: [{ id: "90001", leagueId: "8", seasonId: "70001", typeId: "223" }],
  } };
  const scorers: Success<TouchlineSeasonTopScorers> = { ok: true, provider: "sportmonks", fetchedAt, data: {
    requestedSeasonId: "70001", coverage: "complete", scopeStatus: "complete", reason: null, pagesRead: 1, fetchedAt,
    rows: players.map((_, i) => ({ providerRecordId: String(400 + i), providerPlayerId: String(200 + i), providerTeamId: "300",
      leagueId: "8", seasonId: "70001", stageId: "90001", goals: 3 })),
  } };
  return { stages, scorers };
}

test("actual producer -> canonical parser -> real GoldenBoot SQL authority", { skip: !modulePath, timeout: 120_000 }, async t => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(migration);
    const bindingMetadata = async () => (await db.query(`select oid,proowner,proacl::text,prosecdef,provolatile,proconfig
      from pg_proc where oid='public.touchline_golden_boot_bindings_valid(uuid,uuid,text,jsonb)'::regprocedure`)).rows[0];
    const beforeMetadata = await bindingMetadata();
    const sourceRows = async () => (await db.query(`select jsonb_build_object(
      'publications',(select jsonb_agg(to_jsonb(p) order by player_id) from public.touchline_card_publications p),
      'values',(select jsonb_agg(to_jsonb(v) order by player_id) from public.football_player_market_values v),
      'memberships',(select jsonb_agg(to_jsonb(m) order by id) from public.football_squad_members m),
      'revision',(select revision::text from public.touchline_golden_boot_source_revision where singleton)) data`)).rows[0].data;
    const beforeRows = await sourceRows();
    const bindingLeaders = players.map((player_id, i) => ({ player_id, provider_player_id: String(200 + i),
      club_id: club, provider_team_id: "300", membership_id: members[i], goals: 3 }));
    const bindingValid = async () => (await db.query("select public.touchline_golden_boot_bindings_valid($1,$2,'2026-27',$3::jsonb) value",
      [comp, season, JSON.stringify(bindingLeaders)])).rows[0].value;
    await t.test("forward migration fixes literal-label rejection and rolls back without data changes", async () => {
      await db.exec("begin");
      try {
        await db.query("update public.touchline_card_publications set effective_season='2026/27'");
        await db.query("update public.football_player_market_values set verified_season='2026/2027'");
        assert.equal(await bindingValid(), false, "The installed predecessor rejects equivalent seasons");
        const changedRows = await sourceRows();
        await db.exec(seasonLabelsMigration);
        assert.equal(await bindingValid(), true);
        assert.deepEqual(await sourceRows(), changedRows, "DDL may not rewrite source data/revision");
        assert.deepEqual(await bindingMetadata(), beforeMetadata, "Identity/owner/ACL/invoker properties must remain unchanged");
      } finally { await db.exec("rollback"); }
      assert.deepEqual(await sourceRows(), beforeRows);
    });
    await db.exec(seasonLabelsMigration);
    assert.deepEqual(await sourceRows(), beforeRows);
    assert.deepEqual(await bindingMetadata(), beforeMetadata);
    await t.test("SQL and TypeScript season parsers agree with independent expected year pairs", async () => {
      const cases: Array<[string | null, string | null]> = [
        ["2026/27", "2026-27"], ["2026-2027", "2026-27"], ["2026/2027", "2026-27"], ["2026-27", "2026-27"],
        ["1999/00", "1999-00"], ["1999-2000", "1999-00"], ["1000/1001", "1000-01"], ["9998/9999", "9998-99"],
        ...[null, "", "2026/28", "2026/2026", "2026", "0999/00", "9999/00", "2026.27", " 2026/27", "2026/27 ", "2026/27\n", "2026 /27", "x2026/27", "2026/27x"].map(value => [value, null] as [string | null, null]),
      ];
      for (const [value, expected] of cases) {
        assert.equal(seasonLabels.canonicalEditorialSeason(value), expected, `TS:${JSON.stringify(value)}`);
        const result = await db.query("select public.touchline_golden_boot_editorial_season($1) value", [value]);
        assert.equal(result.rows[0].value, expected, `SQL:${JSON.stringify(value)}`);
      }
    });
    const publication = actualModule("card-publication-read-model", {
      "server-only": {}, "next/cache": { unstable_noStore() {} },
      "@/lib/supabase/admin": { createAdminClient() { throw Error("Real external database forbidden"); } },
      "./editorial-card-profile.ts": editorial, "./card-engine-provisional-policy.ts": provisional,
      "./card-engine-provisional-schema-compat.ts": compatibility,
      "./editorial-season.ts": seasonLabels,
    });
    const canonical = actualModule("golden-boot-canonical-reader", {
      "server-only": {}, "./card-publication-read-model.ts": publication,
      "./editorial-season.ts": seasonLabels,
      "../football-data/sportmonks-season-topscorers.ts": providerIds,
      "./golden-boot-stage-scope.ts": stageScope, "./golden-boot-eligibility.ts": eligibility,
    });
    const produce = actualModule("golden-boot-producer", {
      "server-only": {}, "node:crypto": crypto, "../football-data/sportmonks-season-topscorers.ts": providerIds,
      "./golden-boot-canonical-reader.ts": canonical,
      "../football-data/sportmonks-quota-cooldown.ts": quotaCooldown,
    }).produceGoldenBootSnapshot as typeof produceGoldenBootSnapshot;

    function transport() {
      const requests: Array<{ name: string; args: Row }> = [];
      const failures: string[] = [];
      const queries: string[] = [];
      const hooks = { beforeRpc: async (_name: string, _args: Row) => {} };
      const admin = {
        from(table: string) {
          assert.ok(Object.hasOwn(columns, table), `Table not allowed: ${table}`);
          const allowed = columns[table]!.split(",");
          let selected: string[] = [], exact = false, rowLimit: number | null = null;
          const values: unknown[] = [], predicates: string[] = [];
          function column(key: string) { assert.ok(allowed.includes(key), `Column not allowed: ${table}.${key}`); return `t."${key}"`; }
          function parameter(value: unknown) { values.push(value); return `$${values.length}`; }
          const query = {
            select(value: string, options?: { count?: string }) {
              selected = value.split(","); selected.forEach(column); exact = options?.count === "exact"; return query;
            },
            eq(key: string, value: unknown) { predicates.push(`${column(key)}=${parameter(value)}`); return query; },
            in(key: string, choices: unknown[]) {
              const field = column(key); predicates.push(choices.length ? `${field} in (${choices.map(parameter).join(",")})` : "false"); return query;
            },
            limit(value: number) { assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 10000); rowLimit = value; return query; },
            then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
              return Promise.resolve().then(async () => {
                assert.ok(selected.length); queries.push(table);
                // PostgreSQL JSON conversion gives the SDK wire shape: UUID/text
                // strings, JSON numbers/booleans and ISO timestamps (not Date).
                const projection = selected.flatMap(key => [`'${key}'`, `to_jsonb(t)->'${key}'`]).join(",");
                const limitSql = rowLimit === null ? "" : `limit ${parameter(rowLimit)}`;
                const result = await db.query(`with matched as materialized (
                  select jsonb_build_object(${projection}) payload from public."${table}" t
                  where ${predicates.length ? predicates.join(" and ") : "true"}
                ), limited as (select payload from matched ${limitSql})
                select coalesce(jsonb_agg(payload),'[]'::jsonb) data,(select count(*)::integer from matched) count from limited`, values);
                return { data: result.rows[0].data, count: exact ? result.rows[0].count : null, error: null };
              }).then(resolve, reject);
            },
          };
          return query;
        },
        async rpc(name: string, args: Row = {}) {
          assert.ok(Object.hasOwn(rpcArguments, name), `RPC not allowed: ${name}`);
          const spec = rpcArguments[name]!;
          assert.deepEqual(Object.keys(args).sort(), spec.map(([key]) => key).sort());
          requests.push({ name, args: structuredClone(args) });
          await hooks.beforeRpc(name, args);
          const parameters = spec.map(([key, type]) => type === "jsonb" && args[key] !== null ? JSON.stringify(args[key]) : args[key]);
          const call = `public."${name}"(${spec.map(([, type], i) => `$${i + 1}::${type}`).join(",")})`;
          // One savepoint per sequential RPC emulates independent PostgREST
          // request rollback. Without it, a failed SQL finish would poison this
          // test's outer rollback transaction and falsely break cleanup RPCs.
          await db.exec("savepoint postgrest_rpc");
          try {
            const result = await db.query(`select to_jsonb(${call}) data`, parameters);
            await db.exec("release postgrest_rpc");
            return { data: result.rows[0].data, error: null };
          } catch (error) {
            await db.exec("rollback to postgrest_rpc; release postgrest_rpc");
            const message = error instanceof Error ? error.message : String(error);
            failures.push(message);
            return { data: null, error: { message } };
          }
        },
      } as unknown as NonNullable<Parameters<typeof produce>[0]["admin"]>;
      return { admin, requests, failures, queries, hooks };
    }
    function provider(evidence = providerEvidence(), fail = false) {
      return {
        name: "sportmonks",
        async getSeasonStages() { if (fail) throw Error("PRIVATE provider sentinel"); return evidence.stages; },
        async getSeasonTopScorers() { return evidence.scorers; },
      } as unknown as FootballDataProvider;
    }
    async function readAuthority() {
      return (await db.query("select public.read_touchline_golden_boot($1,$2) payload", [comp, season])).rows[0].payload;
    }
    async function snapshots() {
      return (await db.query("select count(*)::integer count from public.touchline_golden_boot_snapshots")).rows[0].count;
    }
    async function scenario(name: string, body: () => Promise<void>) {
      await t.test(name, async () => {
        await db.exec("begin; set local role service_role; set local timezone='UTC'");
        try { await body(); } finally { await db.exec("rollback"); }
      });
    }

    await scenario("all tied leaders persist once and the actual consumer accepts the SQL DTO", async () => {
      const io = transport(), evidence = providerEvidence();
      const result = await produce({ admin: io.admin, createProvider: () => provider(evidence) });
      assert.deepEqual(result, { status: "stored", reason: null, leaderCount: 2, publicAwardEligible: false,
        providerQuota: { stages: null, topscorers: null } });
      assert.equal(await snapshots(), 1); assert.deepEqual(io.failures, []);
      const persisted = (await db.query("select leaders,stage_evidence,scorer_evidence from public.touchline_golden_boot_snapshots")).rows[0];
      assert.deepEqual(persisted.stage_evidence, evidence.stages); assert.deepEqual(persisted.scorer_evidence, evidence.scorers);
      assert.deepEqual(persisted.leaders.map((row: Row) => row.player_id).sort(), [...players].sort());
      const dto = await readAuthority(); assert.ok(parseGoldenBootPublicAuthority(dto));
      const state = advanceGoldenBootAuthority(createGoldenBootAuthorityState(comp, season), dto, Date.now());
      players.forEach(id => assert.equal(hasGoldenBoot(state, id, Date.now()), true));
      assert.equal(hasGoldenBoot(state, uuid(999), Date.now()), false);
      assert.equal(io.requests.filter(row => row.name === "read_touchline_golden_boot_source_revision").length, 2);
      assert.equal(io.requests.filter(row => row.name === "finish_touchline_golden_boot_refresh" && row.args.p_failure === null).length, 1);
    });

    for (const publicationLabel of ["2026-27", "2026/27", "2026-2027", "2026/2027"]) {
      for (const valueLabel of ["2026-27", "2026/27", "2026-2027", "2026/2027"]) {
        await scenario(`real producer and SQL accept season aliases ${publicationLabel}/${valueLabel}`, async () => {
          await db.query("update public.touchline_card_publications set effective_season=$1 where player_id=$2", [publicationLabel, players[0]]);
          await db.query("update public.football_player_market_values set verified_season=$1 where player_id=$2", [valueLabel, players[0]]);
          const io = transport();
          assert.equal((await produce({ admin: io.admin, createProvider: () => provider() })).status, "stored");
          assert.equal((await readAuthority()).status, "ready");
          assert.deepEqual((await readAuthority()).playerIds, players);
          assert.equal((await db.query("select effective_season from public.touchline_card_publications where player_id=$1", [players[0]])).rows[0].effective_season, publicationLabel);
          assert.equal((await db.query("select verified_season from public.football_player_market_values where player_id=$1", [players[0]])).rows[0].verified_season, valueLabel);
        });
      }
    }

    for (const label of [null, "", "2025/26", "2026/28", "2026/2026", "0999/00", "9999/00", "2026.27", "2026 /27", "2026/27\n"]) {
      for (const target of ["publication", "value"]) {
        await scenario(`invalid ${target} season rejects TS and SQL: ${JSON.stringify(label)}`, async () => {
          if (target === "publication") await db.query("update public.touchline_card_publications set effective_season=$1 where player_id=$2", [label, players[0]]);
          else await db.query("update public.football_player_market_values set verified_season=$1 where player_id=$2", [label, players[0]]);
          assert.equal(await bindingValid(), false, "SQL cannot authorize even if a caller bypasses the TS reader");
          const io = transport();
          const result = await produce({ admin: io.admin, createProvider: () => provider() });
          assert.equal(result.status, "unavailable");
          assert.equal(await snapshots(), 0);
          assert.deepEqual((await readAuthority()).playerIds, []);
        });
      }
    }

    const editorialFailures: Array<[string, string, unknown[]]> = [
      ["shirt 1000", "update public.football_squad_members set jersey_number=1000 where id=$1", [members[0]]],
      ["unsafe market integer", "update public.football_player_market_values set market_value_eur=9007199254740992 where player_id=$1", [players[0]]],
      ["infinite review timestamp", "update public.touchline_card_publications set last_reviewed_at='infinity'::timestamptz where player_id=$1", [players[0]]],
    ];
    for (const [label, sql, args] of editorialFailures) await scenario(`real TS parser prevents SQL publication: ${label}`, async () => {
      await db.query(sql, args);
      const io = transport(); const result = await produce({ admin: io.admin, createProvider: () => provider() });
      assert.equal(result.status, "unavailable"); assert.equal(result.reason, "CANONICAL_UNAVAILABLE");
      assert.ok(io.queries.includes("touchline_card_publications"));
      assert.equal(io.requests.some(row => row.name === "finish_touchline_golden_boot_refresh" && row.args.p_failure === null), false);
      assert.equal(await snapshots(), 0);
      assert.equal((await db.query("select phase from public.touchline_golden_boot_state")).rows[0].phase, "unavailable");
      const dto = await readAuthority(); assert.equal(dto.status, "unavailable"); assert.deepEqual(dto.playerIds, []);
      assert.ok(parseGoldenBootPublicAuthority(dto));
    });

    await scenario("real SQL rejects a source change after TS validation/R1 and before finish", async () => {
      const io = transport();
      io.hooks.beforeRpc = async (name, args) => {
        if (name === "finish_touchline_golden_boot_refresh" && args.p_failure === null) {
          await db.query("update public.football_squad_members set jersey_number=12 where id=$1", [members[0]]);
        }
      };
      const result = await produce({ admin: io.admin, createProvider: () => provider() });
      assert.equal(result.status, "unavailable"); assert.equal(result.reason, "CANONICAL_UNAVAILABLE");
      assert.equal(await snapshots(), 0);
      assert.deepEqual(io.failures, [], "Validation rejection is a committed sanitized SQL receipt, not an RPC exception");
      const finishes = io.requests.filter(row => row.name === "finish_touchline_golden_boot_refresh");
      assert.equal(finishes.length, 1); assert.equal(finishes[0]!.args.p_failure, null);
      const persisted=(await db.query("select phase,snapshot_id from public.touchline_golden_boot_state")).rows[0];
      assert.equal(persisted.phase,"unavailable");assert.equal(persisted.snapshot_id,null);
      assert.equal((await readAuthority()).status, "unavailable");
    });

    await scenario("provider failure revokes the preceding ready state through actual begin/failure RPCs", async () => {
      const io = transport();
      assert.equal((await produce({ admin: io.admin, createProvider: () => provider() })).status, "stored");
      const ready = await readAuthority(); assert.equal(ready.status, "ready");
      // Test-only due-time advancement: no production clock override.
      await db.exec("update public.touchline_golden_boot_worker set not_before=clock_timestamp()-interval '1 second'");
      const failed = await produce({ admin: io.admin, createProvider: () => provider(undefined, true) });
      assert.equal(failed.status, "unavailable"); assert.equal(failed.reason, "PROVIDER_UNAVAILABLE");
      assert.doesNotMatch(JSON.stringify(failed), /PRIVATE|sentinel/);
      assert.equal(await snapshots(), 1, "Historical successful snapshot remains immutable");
      const revoked = await readAuthority(); assert.equal(revoked.status, "unavailable");
      assert.ok(BigInt(revoked.revision)>BigInt(ready.revision));
      let state = advanceGoldenBootAuthority(createGoldenBootAuthorityState(comp, season), ready, Date.now());
      state = advanceGoldenBootAuthority(state, revoked, Date.now());
      state = advanceGoldenBootAuthority(state, ready, Date.now());
      players.forEach(id => assert.equal(hasGoldenBoot(state, id, Date.now()), false));
    });
  } finally { await db.close(); }
});
