-- Touchline Football Data Foundation.
-- Provider-independent normalized football data tables.
-- External providers feed these tables; the app reads these tables as the source of truth.

create extension if not exists pg_trgm;

create table if not exists public.football_competitions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_competition_id text not null,
  name text not null,
  type text,
  logo_url text,
  country text,
  country_id text,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_competition_id)
);

create table if not exists public.football_seasons (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_season_id text not null,
  competition_id uuid references public.football_competitions(id) on delete set null,
  name text not null,
  starts_at date,
  ends_at date,
  is_current boolean not null default false,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_season_id)
);

create table if not exists public.football_clubs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_team_id text not null,
  competition_id uuid references public.football_competitions(id) on delete set null,
  name text not null,
  short_code text,
  logo_url text,
  country text,
  country_id text,
  founded integer,
  venue_id text,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector,
  unique (provider, provider_team_id)
);

create table if not exists public.football_players (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_player_id text not null,
  current_club_id uuid references public.football_clubs(id) on delete set null,
  name text not null,
  display_name text not null,
  first_name text,
  last_name text,
  photo_url text,
  date_of_birth date,
  age integer,
  nationality text,
  country_id text,
  position text,
  position_id text,
  height text,
  weight text,
  market_value numeric(14,2),
  market_value_currency char(3),
  contract_until date,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector,
  unique (provider, provider_player_id)
);

create table if not exists public.football_squad_members (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  club_id uuid not null references public.football_clubs(id) on delete cascade,
  player_id uuid not null references public.football_players(id) on delete cascade,
  competition_id uuid references public.football_competitions(id) on delete set null,
  jersey_number integer,
  position text,
  status text not null default 'active' check (status in ('active', 'inactive', 'loaned', 'unknown')),
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, club_id, player_id)
);

create table if not exists public.football_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_entity_type text not null,
  provider_entity_id text not null,
  touchline_entity_type text not null,
  touchline_entity_id uuid not null,
  confidence text not null default 'provider_exact',
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_entity_type, provider_entity_id),
  check (provider_entity_type in ('competition', 'season', 'club', 'player', 'coach', 'fixture')),
  check (touchline_entity_type in ('competition', 'season', 'club', 'player', 'coach', 'fixture')),
  check (confidence in ('provider_exact', 'normalized_match', 'manual_review'))
);

create table if not exists public.football_data_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sync_type text not null,
  status text not null,
  competition_id uuid references public.football_competitions(id) on delete set null,
  club_id uuid references public.football_clubs(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  error_message text,
  source_payload jsonb not null default '{}'::jsonb,
  check (sync_type in ('starter_foundation', 'competition', 'club', 'squad', 'player')),
  check (status in ('running', 'success', 'partial', 'error', 'not_configured'))
);

create or replace function public.football_clubs_search_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  new.search_vector =
    to_tsvector(
      'simple',
      coalesce(new.name, '') || ' ' ||
      coalesce(new.short_code, '') || ' ' ||
      coalesce(new.country, '') || ' ' ||
      coalesce(new.provider_team_id, '')
    );
  return new;
end
$$;

create or replace function public.football_players_search_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  new.search_vector =
    to_tsvector(
      'simple',
      coalesce(new.name, '') || ' ' ||
      coalesce(new.display_name, '') || ' ' ||
      coalesce(new.position, '') || ' ' ||
      coalesce(new.nationality, '') || ' ' ||
      coalesce(new.provider_player_id, '')
    );
  return new;
end
$$;

drop trigger if exists football_competitions_updated on public.football_competitions;
create trigger football_competitions_updated
  before update on public.football_competitions
  for each row execute function public.touch_updated_at();

drop trigger if exists football_seasons_updated on public.football_seasons;
create trigger football_seasons_updated
  before update on public.football_seasons
  for each row execute function public.touch_updated_at();

drop trigger if exists football_clubs_search_updated on public.football_clubs;
create trigger football_clubs_search_updated
  before insert or update on public.football_clubs
  for each row execute function public.football_clubs_search_update();

drop trigger if exists football_players_search_updated on public.football_players;
create trigger football_players_search_updated
  before insert or update on public.football_players
  for each row execute function public.football_players_search_update();

drop trigger if exists football_squad_members_updated on public.football_squad_members;
create trigger football_squad_members_updated
  before update on public.football_squad_members
  for each row execute function public.touch_updated_at();

drop trigger if exists football_provider_mappings_updated on public.football_provider_mappings;
create trigger football_provider_mappings_updated
  before update on public.football_provider_mappings
  for each row execute function public.touch_updated_at();

create index if not exists football_competitions_provider_idx
  on public.football_competitions(provider, provider_competition_id);

create index if not exists football_seasons_competition_idx
  on public.football_seasons(competition_id, is_current desc);

create index if not exists football_clubs_competition_idx
  on public.football_clubs(competition_id, name);

create index if not exists football_clubs_search_vector_idx
  on public.football_clubs using gin(search_vector);

create index if not exists football_clubs_name_trgm_idx
  on public.football_clubs using gin(name gin_trgm_ops);

create index if not exists football_players_current_club_idx
  on public.football_players(current_club_id, name);

create index if not exists football_players_search_vector_idx
  on public.football_players using gin(search_vector);

create index if not exists football_players_name_trgm_idx
  on public.football_players using gin(name gin_trgm_ops);

create index if not exists football_squad_members_club_idx
  on public.football_squad_members(club_id, status, position);

create index if not exists football_squad_members_player_idx
  on public.football_squad_members(player_id, club_id);

create index if not exists football_data_sync_runs_provider_idx
  on public.football_data_sync_runs(provider, sync_type, started_at desc);

alter table public.football_competitions enable row level security;
alter table public.football_seasons enable row level security;
alter table public.football_clubs enable row level security;
alter table public.football_players enable row level security;
alter table public.football_squad_members enable row level security;
alter table public.football_provider_mappings enable row level security;
alter table public.football_data_sync_runs enable row level security;

drop policy if exists "authenticated users can read football competitions" on public.football_competitions;
create policy "authenticated users can read football competitions" on public.football_competitions
  for select to authenticated using (true);

drop policy if exists "authenticated users can read football seasons" on public.football_seasons;
create policy "authenticated users can read football seasons" on public.football_seasons
  for select to authenticated using (true);

drop policy if exists "authenticated users can read football clubs" on public.football_clubs;
create policy "authenticated users can read football clubs"
  on public.football_clubs for select to authenticated using (true);

drop policy if exists "authenticated users can read football players" on public.football_players;
create policy "authenticated users can read football players"
  on public.football_players for select to authenticated using (true);

drop policy if exists "authenticated users can read football squad members" on public.football_squad_members;
create policy "authenticated users can read football squad members"
  on public.football_squad_members for select to authenticated using (true);

drop policy if exists "authenticated users can read football provider mappings" on public.football_provider_mappings;
create policy "authenticated users can read football provider mappings"
  on public.football_provider_mappings for select to authenticated using (true);

drop policy if exists "authenticated users can read football sync runs" on public.football_data_sync_runs;
create policy "authenticated users can read football sync runs"
  on public.football_data_sync_runs for select to authenticated using (true);

grant select on public.football_competitions to authenticated;
grant select on public.football_seasons to authenticated;
grant select on public.football_clubs to authenticated;
grant select on public.football_players to authenticated;
grant select on public.football_squad_members to authenticated;
grant select on public.football_provider_mappings to authenticated;
grant select on public.football_data_sync_runs to authenticated;

grant select, insert, update, delete on public.football_competitions to service_role;
grant select, insert, update, delete on public.football_seasons to service_role;
grant select, insert, update, delete on public.football_clubs to service_role;
grant select, insert, update, delete on public.football_players to service_role;
grant select, insert, update, delete on public.football_squad_members to service_role;
grant select, insert, update, delete on public.football_provider_mappings to service_role;
grant select, insert, update, delete on public.football_data_sync_runs to service_role;
