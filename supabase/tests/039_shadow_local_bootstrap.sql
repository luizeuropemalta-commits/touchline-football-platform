\set ON_ERROR_STOP on

-- Minimal Supabase-compatible schemas for the disposable local PostgreSQL
-- shadow. This file is test infrastructure only; it must never be applied to a
-- linked Supabase project.

do $$
declare
  v_expected_database text := current_setting('touchline.shadow_039_database', true);
begin
  if current_setting('touchline.shadow_039_ack', true) is distinct from 'LOCAL_EMPTY_CLUSTER_ONLY'
     or v_expected_database is null
     or current_database() is distinct from v_expected_database
     or current_database() !~ '^touchline_social_shadow_039_[a-z0-9_]+$'
     or (inet_server_addr() is not null and inet_server_addr() <> inet '127.0.0.1') then
    raise exception 'TL_SOCIAL_039_SHADOW_LOCAL_IDENTITY_REQUIRED';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists public.touchline_platform_owner_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  normalized_email text not null unique,
  registered_at timestamptz not null default clock_timestamp()
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '60277b78-1e65-4e2e-89f0-67e7b819ed24',
  'authenticated', 'authenticated',
  'admin@touchline.com.br', '', clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  clock_timestamp(), clock_timestamp()
) on conflict (id) do nothing;

insert into public.touchline_platform_owner_accounts (user_id, normalized_email)
values (
  '60277b78-1e65-4e2e-89f0-67e7b819ed24',
  'admin@touchline.com.br'
) on conflict (user_id) do nothing;

create table if not exists public.football_fantasy_fixture_feeds (
  provider text not null,
  provider_fixture_id text not null,
  fixture_payload jsonb not null default '{}'::jsonb,
  lineups_payload jsonb not null default '[]'::jsonb,
  formations_payload jsonb not null default '[]'::jsonb,
  sidelined_payload jsonb not null default '[]'::jsonb,
  events_payload jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz not null,
  primary key (provider, provider_fixture_id)
);
grant select, insert, update on public.football_fantasy_fixture_feeds to service_role;

-- Minimal rendered-source dependency surface. The candidate migration attaches
-- real row triggers to every table below; the shadow therefore exercises SQL
-- against relations rather than accepting a regex-only contract.
create table public.football_competitions (
  id uuid primary key default gen_random_uuid(), provider text, provider_competition_id text, name text
);
create table public.football_seasons (
  id uuid primary key default gen_random_uuid(), provider text, competition_id uuid,
  provider_season_id text, is_current boolean, name text
);
create table public.football_rounds (
  id uuid primary key default gen_random_uuid(), provider text, season_id uuid, name text
);
create table public.football_clubs (
  id uuid primary key default gen_random_uuid(), provider text, provider_team_id text, name text
);
create table public.football_players (
  id uuid primary key default gen_random_uuid(), provider text, provider_player_id text, display_name text
);
create table public.football_squad_members (
  id uuid primary key default gen_random_uuid(), provider text, player_id uuid, club_id uuid,
  jersey_number integer, position text, active boolean default true
);
create table public.football_fixtures (
  id uuid primary key default gen_random_uuid(), provider text, provider_fixture_id text,
  competition_id uuid, season_id uuid, round_id uuid, home_club_id uuid, away_club_id uuid,
  starts_at timestamptz, status text
);
create table public.football_fixture_lifecycle_events (
  id uuid primary key default gen_random_uuid(), fixture_id uuid, event_type text,
  first_observed_at timestamptz
);
create table public.football_player_season_statistics (
  id uuid primary key default gen_random_uuid(), football_player_id uuid, rating numeric
);
create table public.touchline_player_fixture_score_settlements (
  id uuid primary key default gen_random_uuid(), football_player_id uuid, fixture_id uuid,
  official_match_rating numeric, settlement_state text
);
create table public.touchline_card_publications (
  id uuid primary key default gen_random_uuid(), player_id uuid, publication_state text, tier_key text
);
create table public.football_player_market_values (
  id uuid primary key default gen_random_uuid(), player_id uuid, amount_eur bigint
);
create table public.touchline_card_editorial_overrides (
  id uuid primary key default gen_random_uuid(), player_id uuid, override_payload jsonb
);
create table public.touchline_formation_geometry_versions (
  formation_code text primary key, geometry_payload jsonb
);
create table public.touchline_coach_ranking_snapshots (
  id uuid primary key default gen_random_uuid(), league_key text, payload jsonb
);
create table public.touchline_coach_ranking_active_snapshots (
  league_key text primary key, snapshot_id uuid
);
create table public.touchline_card_ranking_snapshots (
  snapshot_id text primary key, league_key text, ranking_payload jsonb
);
create table public.touchline_card_ranking_active_snapshots (
  league_key text primary key, snapshot_id text
);

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id text,
  metadata jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'touchline-social-drafts',
  'touchline-social-drafts',
  false,
  12582912,
  array['image/png', 'image/jpeg']::text[]
) on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.touchline_assert_qa_fixture_target(
  p_expected_project_ref text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('touchline.shadow_039_ack', true) is distinct from 'LOCAL_EMPTY_CLUSTER_ONLY'
     or current_database() is distinct from current_setting('touchline.shadow_039_database', true)
     or current_database() !~ '^touchline_social_shadow_039_[a-z0-9_]+$'
     or (inet_server_addr() is not null and inet_server_addr() <> inet '127.0.0.1')
     or p_expected_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' then
    raise exception 'TOUCHLINE_QA_PROJECT_REF_MISMATCH';
  end if;
end;
$$;
