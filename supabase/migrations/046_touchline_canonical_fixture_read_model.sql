-- Canonical, provider-independent fixture read model for TouchLine England.
-- It stores only normalized public match data; raw provider payloads and API
-- credentials never enter this table.

create table if not exists public.football_fixtures (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_fixture_id text not null,
  competition_id uuid references public.football_competitions(id) on delete set null,
  season_id uuid references public.football_seasons(id) on delete set null,
  home_club_id uuid references public.football_clubs(id) on delete set null,
  away_club_id uuid references public.football_clubs(id) on delete set null,
  starts_at timestamptz,
  status text,
  home_score integer,
  away_score integer,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_fixture_id),
  check (home_score is null or home_score >= 0),
  check (away_score is null or away_score >= 0),
  check (home_club_id is null or away_club_id is null or home_club_id <> away_club_id)
);

drop trigger if exists football_fixtures_updated on public.football_fixtures;
create trigger football_fixtures_updated
  before update on public.football_fixtures
  for each row execute function public.touch_updated_at();

create index if not exists football_fixtures_competition_starts_idx
  on public.football_fixtures (competition_id, starts_at);
create index if not exists football_fixtures_home_club_starts_idx
  on public.football_fixtures (home_club_id, starts_at);
create index if not exists football_fixtures_away_club_starts_idx
  on public.football_fixtures (away_club_id, starts_at);

alter table public.football_fixtures enable row level security;
revoke all privileges on table public.football_fixtures from public, anon, authenticated;
grant select, insert, update, delete on table public.football_fixtures to service_role;

alter table public.football_data_sync_runs
  drop constraint if exists football_data_sync_runs_sync_type_check;
alter table public.football_data_sync_runs
  add constraint football_data_sync_runs_sync_type_check
  check (sync_type in ('starter_foundation', 'competition', 'club', 'squad', 'player', 'fixture_schedule', 'live_scores'));

comment on table public.football_fixtures is
  'Canonical server-only fixture schedule and score read model. Client modules consume sanitized application snapshots only.';
