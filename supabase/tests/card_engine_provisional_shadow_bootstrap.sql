\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit; exception when duplicate_object then null; end $$;

create table public.users(id uuid primary key default gen_random_uuid());
create table public.football_competitions(
  id uuid primary key default gen_random_uuid(), provider text not null,
  provider_competition_id text not null, name text not null
);
create table public.football_clubs(
  id uuid primary key default gen_random_uuid(), provider text not null,
  provider_team_id text not null, competition_id uuid references public.football_competitions(id),
  name text not null, logo_url text, source_updated_at timestamptz not null default now()
);
create table public.football_players(
  id uuid primary key default gen_random_uuid(), provider text not null,
  provider_player_id text not null, current_club_id uuid references public.football_clubs(id),
  name text not null, display_name text not null, nationality text, country_id text,
  position text, source_updated_at timestamptz not null default now(),
  unique(provider, provider_player_id)
);
create table public.football_squad_members(
  id uuid primary key default gen_random_uuid(), provider text not null,
  club_id uuid not null references public.football_clubs(id),
  player_id uuid not null references public.football_players(id),
  competition_id uuid references public.football_competitions(id),
  jersey_number integer, position text, status text not null default 'active',
  source_updated_at timestamptz not null default now(),
  unique(provider, club_id, player_id)
);
create table public.football_fantasy_fixture_feeds(
  id uuid primary key default gen_random_uuid(), provider text not null,
  provider_fixture_id text not null, fixture_payload jsonb not null default '{}'::jsonb,
  lineups_payload jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz not null, unique(provider, provider_fixture_id)
);
create table public.football_player_market_values(
  id uuid primary key default gen_random_uuid(), player_id uuid not null unique references public.football_players(id),
  market_value bigint, currency char(3), market_value_eur bigint, last_verified timestamptz,
  verified_season text, source text not null default 'touchline_import',
  confidence text not null default 'pending', status text not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint football_player_market_values_confidence_check check(confidence in ('pending','reviewed','verified')),
  constraint football_player_market_values_status_check check(status in ('pending','ready','verified','rejected','unavailable'))
);
create table public.football_player_market_value_history(
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.football_players(id),
  market_value bigint, currency char(3), market_value_eur bigint, verified_season text not null,
  verified_date timestamptz not null, source text not null, confidence text not null,
  constraint football_player_market_value_history_confidence_check check(confidence in ('reviewed','verified')),
  unique(player_id, verified_season, verified_date, source)
);
create table public.touchline_card_editorial_batches(
  id uuid primary key default gen_random_uuid()
);
create table public.touchline_card_editorial_overrides(
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.football_players(id),
  field_key text not null, provider_value jsonb, touchline_override jsonb not null,
  effective_value jsonb not null, status text not null default 'approved',
  source_batch_id uuid references public.touchline_card_editorial_batches(id),
  approved_by uuid references public.users(id), approved_at timestamptz,
  version integer not null default 1, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(player_id, field_key),
  constraint touchline_card_editorial_overrides_status_check
    check(status in ('draft','review','approved','stale','reverted'))
);
create table public.touchline_card_editorial_audit_events(
  id uuid primary key default gen_random_uuid(), player_id uuid references public.football_players(id),
  event_type text not null, effective_before jsonb, effective_after jsonb,
  created_at timestamptz not null default now(),
  constraint touchline_card_editorial_audit_events_event_type_check check(event_type in (
    'batch_created','item_resolved','batch_approved','override_published','market_value_published',
    'batch_reverted','stale_detected'
  ))
);
create table public.touchline_card_publications(
  id uuid primary key default gen_random_uuid(), player_id uuid not null unique references public.football_players(id),
  current_membership_id uuid references public.football_squad_members(id),
  competition_id uuid references public.football_competitions(id), effective_season text not null,
  market_value_id uuid references public.football_player_market_values(id), publication_status text not null,
  calculated_tier text, calculated_price_tc integer, calculated_nominal_price_gbp integer,
  policy_version text, last_reviewed_at timestamptz, published_at timestamptz,
  internal_note text, internal_source text, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.touchline_card_publication_history(
  id uuid primary key default gen_random_uuid(), publication_id uuid not null references public.touchline_card_publications(id),
  player_id uuid not null references public.football_players(id), provider_player_id text,
  action text not null check(action in ('detected','market_value_required','reviewed','ready_to_publish','published','unpublished','inactive_in_competition','archived','reverted')),
  previous_market_value_eur bigint, new_market_value_eur bigint, currency char(3),
  previous_tier text, new_tier text, nominal_price_tc integer, nominal_price_gbp integer,
  before_state jsonb, after_state jsonb not null, created_at timestamptz not null default now()
);
