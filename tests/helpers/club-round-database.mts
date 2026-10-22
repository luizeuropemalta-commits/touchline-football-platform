import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const sql = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
function segment(source: string,prefix: string,end: string) {
  const a=source.indexOf(prefix),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,`Missing installed SQL ${prefix}`);return source.slice(a,b+end.length);
}
/** Actual installed lifecycle, isolated PostgreSQL; no remote connection or fabricated RPC. */
export type ClubRoundDatabase = Pick<PGlite, "exec" | "query" | "close">;
export async function clubRoundDatabase<Database extends ClubRoundDatabase = PGlite>(options: {
  beforeCollection?: (db: Database) => Promise<void>;
  createDatabase?: () => Database;
  /** Explicit historical fixture for forward migration before/after checks. */
  beforeApprovedBudgets?: boolean;
} = {}): Promise<Database> {
  const db=options.createDatabase ? options.createDatabase() : new PGlite() as unknown as Database;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create table users(id uuid primary key);
      create table football_competitions(id uuid primary key);
      create table football_seasons(id uuid primary key);
      create table football_clubs(id uuid primary key,provider text,provider_team_id text);
      create table football_players(id uuid primary key,provider text,provider_player_id text,current_club_id uuid,position text,detailed_position text);
      create table football_rounds(id uuid primary key,competition_id uuid,season_id uuid,name text);
      create table football_fixtures(id uuid primary key,round_id uuid,competition_id uuid,season_id uuid,provider text,provider_fixture_id text,starts_at timestamptz,status text,home_club_id uuid,away_club_id uuid,finalized_at timestamptz,provider_updated_at timestamptz,source_updated_at timestamptz,updated_at timestamptz default now());
      create table football_squad_members(id uuid primary key,provider text,club_id uuid,player_id uuid,position text,detailed_position text,status text);
      create table football_player_market_values(id uuid primary key,player_id uuid,market_value_eur bigint,status text,confidence text);
      create table touchline_card_publications(id uuid primary key,player_id uuid,current_membership_id uuid,market_value_id uuid,publication_status text,published_at timestamptz);
      create table touchline_formation_geometry_versions(formation_code text,geometry_version int,status text,geometry jsonb,primary key(formation_code,geometry_version));
      create table touchline_card_inventory(id uuid primary key,player_id uuid,player_name text,club_name text,card_status text,sale_status text);
      create table clubowner_credit_ledger(user_id uuid,amount_cents bigint,currency text,entry_type text,reason text,idempotency_key text,metadata jsonb,created_by uuid);
      create schema auth;
      create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',current_setting('request.jwt.claim.role',true))$$;
      create table touchline_user_arena_state(user_id uuid primary key,coach_provider_id text,updated_at timestamptz);`);
    const coachSchema=readFileSync(new URL('../../supabase/qa/013_touchline_qa_coach_contract_scoring.sql',import.meta.url),'utf8');
    await db.exec(coachSchema.slice(coachSchema.indexOf('create table if not exists public.touchline_coach_contracts ('),coachSchema.indexOf('create table if not exists public.touchline_coach_fixture_points (')));
    await db.exec("alter table touchline_coach_contracts drop constraint touchline_coach_contracts_scoring_version_check; alter table touchline_coach_contracts add constraint touchline_coach_contracts_scoring_version_check check(scoring_version in ('coach_scoring_v1','coach_scoring_v2'))");
    await db.exec(segment(readFileSync(new URL('../../supabase/qa/017_touchline_qa_score_points_engine_v2.sql',import.meta.url),'utf8'),'create or replace function public.touchline_hire_coach_contract(','\n$$;'));
    await db.exec('revoke all on function touchline_hire_coach_contract(uuid,text,uuid,text) from public; grant execute on function touchline_hire_coach_contract(uuid,text,uuid,text) to service_role');
    const legacy=sql('022_touchline_market_atomic_checkout');
    await db.exec(legacy.slice(0,legacy.indexOf('create or replace function public.checkout_touchline_market_cart')));
    await db.exec('alter table touchline_card_contracts add column season_id uuid');
    await db.exec(segment(sql('027_touchline_tc_wallet_integrity'),'create or replace function public.checkout_touchline_market_cart(','\n$$;'));
    await db.exec('revoke all on function checkout_touchline_market_cart(uuid,uuid[],text) from public; grant execute on function checkout_touchline_market_cart(uuid,uuid[],text) to service_role');
    const base=sql('20260825165821_touchline_fantasy_gameweek_v1');
    await db.exec(base.slice(base.indexOf('create table if not exists public.touchline_fantasy_configs'),base.indexOf('create or replace function public.touchline_fantasy_position_bucket')));
    for(const name of ['position_bucket','fixture_is_final','fixture_is_live','entitlement_is_active','sync_gameweeks','reconcile_gameweek']) {
      await db.exec(segment(base,`create or replace function public.touchline_fantasy_${name}(`,'\n$$;'));
    }
    await db.exec(segment(sql('048_touchline_player_season_statistics_read_model'),'create table if not exists public.football_player_fixture_statistics (','\n);'));
    await db.exec(segment(sql('015_sportmonks_fantasy_data_foundation'),'create table if not exists public.football_fantasy_fixture_feeds (','\n);'));
    for(const name of ['20260825202938_touchline_fantasy_markt_gameweek_xi','20260825213744_touchline_fantasy_wall_clock_deadline']) await db.exec(sql(name));
    const finality=sql('20260826173229_touchline_fantasy_inter_round_market_window');
    await db.exec(finality.slice(0,finality.indexOf('create or replace function public.touchline_fantasy_sync_gameweeks')));
    for(const name of ['20260919151427_touchline_fantasy_kickoff_final_whistle_market_window','20260920153000_touchline_fantasy_safe_rollover_settlement',
      '20261002031429_touchline_fantasy_shared_market_window_projection',
      '20261011010000_touchline_fantasy_market_plan_policy','20261011014000_touchline_fantasy_server_owned_plan_budgets',
      '20261011015000_touchline_fantasy_confirmed_plan_lock_guard','20261013173813_touchline_fantasy_finite_plan_budgets',
      '20261017104205_club_collection_atomic_acquisition','20261017105757_club_collection_round_projection',
      '20261017110218_club_market_five_minute_window',
      '20261017125838_club_collection_legacy_checkout_boundary']) {
      if (name === '20261017104205_club_collection_atomic_acquisition') await options.beforeCollection?.(db);
      await db.exec(sql(name));
    }
    if (!options.beforeApprovedBudgets) {
      await db.exec(sql('20261020161513_club_collection_approved_plan_budgets'));
    }
    return db;
  } catch(error) {await db.close();throw error;}
}
