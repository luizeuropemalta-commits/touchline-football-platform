// Local in-memory SQL proof only. No provider, credentials, network or hosted client.
// Dependency/fixture baseline: reviewed external verify-avatar-qa-compatibility-20261003.mjs.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const migrationNames = [
  "001_initial_schema.sql", "005_role_grants_and_api_season.sql", "013_football_data_foundation.sql",
  "018_touchline_card_inventory_admin.sql", "019_touchline_promotions_credits.sql", "022_touchline_market_atomic_checkout.sql",
  "024_touchline_beta_analytics.sql", "026_touchline_market_contract_release.sql", "027_touchline_tc_wallet_integrity.sql",
  "028_touchline_release_lineup_integrity.sql", "029_touchline_arena_state_server_write_boundary.sql",
  "032_touchline_free_market_contracts.sql", "033_touchline_player_market_value_tiers.sql", "034_touchline_market_requires_verified_value.sql",
  "047_touchline_arena_owner_coach.sql", "050_touchline_market_value_engine.sql", "051_touchline_manual_card_editorial_profiles.sql",
];
export const applyPaths = [...migrationNames.map(name => `supabase/migrations/${name}`),
  "supabase/qa/001_touchline_qa_fixture_tracking.sql", "supabase/qa/003_touchline_qa_owner_scenario.sql",
  "supabase/qa/057_touchline_qa_owner_avatar_preservation.sql"];
export const matrixPath = "supabase/tests/club_owner_avatar_qa_compatibility.sql";
const sha = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(resolve(root, path), "utf8");
export function manifest() { return [...applyPaths, matrixPath].map(path => ({ path, sha256: sha(read(path)) })); }
export function matrixSql(source) {
  // PGlite rejects SQL promises on errors, providing ON_ERROR_STOP semantics.
  // Do not strip or bypass the database-name, identity, tripwire or rollback guards.
  assert.equal(source.split("\\set ON_ERROR_STOP on\n").length - 1, 1);
  const sql = source.replace("\\set ON_ERROR_STOP on\n", "");
  assert.doesNotMatch(sql, /^\\/m, "Unexpected psql directive");
  assert.match(sql, /current_database\(\) !~ '\^touchline_avatar_qa_test_/);
  assert.match(sql, /rollback;\s*$/);
  return sql;
}
const platformShim = `
create role anon nologin nosuperuser nocreatedb nocreaterole noinherit;
create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit;
create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,
 raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
`;

function fixtureSql(run, photo, empty, fingerprint) {
  return `begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('${photo}','avatar-photo@example.invalid',now(),'{"full_name":"Synthetic Photo Owner"}'),
 ('${empty}','avatar-empty@example.invalid',now(),'{"full_name":"Synthetic Empty Owner"}');
update public.users set avatar_url='/synthetic-avatar-before.webp' where id='${photo}';
insert into public.touchline_user_arena_state(user_id,formation_key,lineup,saved_formation_layouts)
 values('${photo}','4-4-2','[]','{}');
insert into public.touchline_qa_fixture_runs(id,project_ref,fixture_version,source_fingerprint_sha256,
 package_fingerprint_sha256,status,applied_at,expected_counts)
 values('${run}','xgxbwqxjssxxuihuwmgy','isolated-avatar-compatibility-v1','${fingerprint}','${fingerprint}',
 'applied',now(),'{"players":35,"cards":35,"syntheticUsers":2}');
do $$ declare competition uuid:=gen_random_uuid(); club uuid:=gen_random_uuid();
 player uuid; membership uuid; valuation uuid; broad_position text;
begin
 if (select price_tc from public.touchline_card_price_catalog where price_table_version='2026-07-premier-v1' and tier_key='ruby-red') is distinct from 0
 then raise exception 'CANONICAL_ZERO_RUBY_PRICE_REQUIRED'; end if;
 insert into public.football_competitions(id,provider,provider_competition_id,name)
 values(competition,'local-avatar-test','900000000','Synthetic Avatar Competition');
 insert into public.football_clubs(id,provider,provider_team_id,competition_id,name)
 values(club,'local-avatar-test','900000000',competition,'Synthetic Avatar Club');
 for n in 1..35 loop
  player:=gen_random_uuid(); membership:=gen_random_uuid(); valuation:=gen_random_uuid();
  broad_position:=case when n<=3 then 'Goalkeeper' when n<=13 then 'Defender' when n<=24 then 'Midfielder' else 'Attacker' end;
  insert into public.football_players(id,provider,provider_player_id,current_club_id,name,display_name,position)
  values(player,'local-avatar-test',(900000000+n)::text,club,'Synthetic Avatar Player '||n,'Synthetic Avatar Player '||n,broad_position);
  insert into public.football_squad_members(id,provider,club_id,player_id,competition_id,position,status)
  values(membership,'local-avatar-test',club,player,competition,broad_position,'active');
  insert into public.football_player_market_values(id,player_id,market_value,currency,market_value_eur,last_verified,verified_season,source,confidence,status)
  values(valuation,player,1,'EUR',1,now(),'2026/2027','isolated-avatar-qa-fixture','verified','verified');
  insert into public.touchline_card_inventory(player_id,club_id,player_name,club_name,card_status,sale_status,competition_tier,
   price_table_version,market_value_eur,market_value_updated_at,market_value_source,published_at)
  values(player,club,'Synthetic Avatar Player '||n,'Synthetic Avatar Club','published','available','ruby-red',
   '2026-07-premier-v1',1,now(),'isolated-avatar-qa-fixture',now());
  insert into public.touchline_card_publications(player_id,current_membership_id,competition_id,effective_season,
   market_value_id,publication_status,calculated_tier,calculated_price_tc,policy_version,published_at)
  values(player,membership,competition,'2026/2027',valuation,'published','ruby-red',0,'isolated-avatar-qa-fixture',now());
 end loop;
end $$; commit;`;
}
const tables = ["users","football_players","football_squad_members","football_player_market_values","touchline_card_inventory",
  "touchline_card_publications","touchline_card_contracts","touchline_market_orders","touchline_qa_owner_scenarios",
  "clubowner_credit_ledger","touchline_beta_tc_grants","touchline_user_arena_state"];
async function snapshot(db) {
  const results = {};
  for (const table of tables) results[table] = (await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) hash from public.${table} t`)).rows[0];
  return results;
}
export async function closePreservingFailure(db, primaryError) {
  if (!db) return;
  try { await db.close(); }
  catch (cleanupError) {
    if (primaryError) throw new AggregateError([primaryError, cleanupError],
      "Avatar harness failed; database cleanup also failed", { cause: primaryError });
    throw cleanupError;
  }
}
export async function provisionNamedDatabase(PGlite, database, extensions) {
  assert.match(database, /^touchline_avatar_qa_test_[a-f0-9]{32}$/);
  // PGlite 0.5.8's database option selects an EXISTING database; initdb only
  // provisions postgres. Supported lifecycle: default connection -> CREATE DB
  // -> dumpDataDir('none') (File|Blob) -> close -> loadDataDir + named connection.
  // Types: PGliteOptions.database/loadDataDir and dumpDataDir(compression).
  const bootstrap = new PGlite({ extensions });
  let primaryError;
  try {
    assert.equal((await bootstrap.query("select current_database() db")).rows[0].db, "postgres");
    await bootstrap.exec(`create database ${database}`);
    return await bootstrap.dumpDataDir("none");
  } catch (error) { primaryError = error; throw error; }
  finally { await closePreservingFailure(bootstrap, primaryError); }
}
export async function runAvatarQaCompatibility({ runtime, authorize = false } = {}) {
  assert.equal(authorize, true, "Explicit local execution authorization required");
  assert.ok(runtime, "Verified local PGlite module path required");
  const runtimeUrl = pathToFileURL(resolve(runtime));
  const { PGlite } = await import(runtimeUrl.href);
  const { pgcrypto } = await import(new URL("./contrib/pgcrypto.js", runtimeUrl).href);
  const { pg_trgm } = await import(new URL("./contrib/pg_trgm.js", runtimeUrl).href);
  const database = `touchline_avatar_qa_test_${randomUUID().replaceAll("-", "")}`;
  const beforeManifest = manifest();
  const extensions = { pgcrypto, pg_trgm };
  let db;
  let primaryError;
  let stage = "database-provision";
  try {
    const loadDataDir = await provisionNamedDatabase(PGlite, database, extensions);
    stage = "database-reopen";
    db = new PGlite({ database, loadDataDir, extensions });
    stage = "database-name";
    assert.equal((await db.query("select current_database() db")).rows[0].db,database);
    await db.exec("set statement_timeout='30s'");
    stage = "platform-shim"; await db.exec(platformShim);
    for (const path of applyPaths) { stage = path; await db.exec(read(path)); }
    const run = randomUUID(), photo = randomUUID(), empty = randomUUID();
    stage = "synthetic-fixture";
    await db.exec(fixtureSql(run,photo,empty,sha(JSON.stringify(beforeManifest))));
    const before = await snapshot(db);
    assert.equal(before.users.n,2); assert.equal(before.football_players.n,35);
    assert.equal(before.touchline_card_publications.n,35); assert.equal(before.touchline_card_contracts.n,0);
    stage = "canonical-matrix";
    await db.exec(`set touchline.avatar_qa_test_mode='isolated'; set touchline.qa_test_run_id='${run}';
      set touchline.qa_test_user_with_avatar='${photo}'; set touchline.qa_test_user_empty_avatar='${empty}';`);
    await db.exec(matrixSql(read(matrixPath)));
    stage = "postflight";
    assert.deepEqual(await snapshot(db),before);
    assert.equal((await db.query("select to_regprocedure('public.touchline_test_reject_qa_avatar_update()') x")).rows[0].x,null);
    assert.deepEqual(manifest(),beforeManifest);
    return { status: "passed_limited_scope", sourceManifest: beforeManifest, database,
      scope: "QA057 real business migrations and SQL matrix; synthetic platform Auth and dataset; no hosted/Auth-session/Storage/CAS proof", before };
  } catch (error) {
    primaryError = new Error(`Avatar QA compatibility failed at ${stage}`, { cause: error });
    throw primaryError;
  }
  finally { await closePreservingFailure(db, primaryError); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--run-local"));
  const result = args.length ? await runAvatarQaCompatibility({runtime:process.env.TOUCHLINE_FANTASY_PGLITE_MODULE,authorize:true})
    : { status: "not_run", sourceManifest:manifest(), matrix:matrixPath, hosted:false };
  process.stdout.write(JSON.stringify(result,null,2) + "\n");
}
