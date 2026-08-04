-- Canonical server-owned player statistics read model.
--
-- A published season aggregate is never inferred in a page. It is only
-- complete when every eligible fixture is explicitly represented once in the
-- coverage set. Values that cannot be verified stay NULL, never zero.

create table if not exists public.football_player_fixture_statistics (
  id uuid primary key default gen_random_uuid(),
  football_player_id uuid not null references public.football_players(id) on delete cascade,
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  competition_id uuid references public.football_competitions(id) on delete set null,
  season_id uuid references public.football_seasons(id) on delete set null,
  club_id uuid references public.football_clubs(id) on delete set null,
  appearance_status text not null default 'unavailable'
    check (appearance_status in ('started', 'substitute', 'unused', 'absent', 'unavailable')),
  minutes_played integer check (minutes_played is null or minutes_played >= 0),
  rating numeric(5,2) check (rating is null or (rating >= 0 and rating <= 10)),
  statistics_payload jsonb not null default '{}'::jsonb,
  source_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (football_player_id, fixture_id),
  check (jsonb_typeof(statistics_payload) = 'object')
);

create table if not exists public.football_player_season_memberships (
  id uuid primary key default gen_random_uuid(),
  football_player_id uuid not null references public.football_players(id) on delete cascade,
  competition_id uuid not null references public.football_competitions(id) on delete cascade,
  season_id uuid not null references public.football_seasons(id) on delete cascade,
  club_id uuid not null references public.football_clubs(id) on delete cascade,
  active_from date,
  active_to date,
  source_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (football_player_id, competition_id, season_id, club_id),
  check (active_to is null or active_from is null or active_to >= active_from)
);

create table if not exists public.football_player_season_statistics (
  id uuid primary key default gen_random_uuid(),
  football_player_id uuid not null references public.football_players(id) on delete cascade,
  competition_id uuid not null references public.football_competitions(id) on delete cascade,
  season_id uuid not null references public.football_seasons(id) on delete cascade,
  club_id uuid references public.football_clubs(id) on delete set null,
  provider text not null,
  provider_player_id text not null,
  coverage_status text not null default 'unavailable'
    check (coverage_status in ('complete', 'partial', 'unavailable')),
  expected_fixture_count integer check (expected_fixture_count is null or expected_fixture_count >= 0),
  synchronized_fixture_count integer not null default 0 check (synchronized_fixture_count >= 0),
  expected_fixture_ids jsonb not null default '[]'::jsonb,
  aggregated_fixture_ids jsonb not null default '[]'::jsonb,
  summary_payload jsonb not null default '{}'::jsonb,
  position_statistics_payload jsonb not null default '{}'::jsonb,
  source_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (football_player_id, competition_id, season_id),
  check (provider_player_id ~ '^[0-9]+$'),
  check (jsonb_typeof(expected_fixture_ids) = 'array'),
  check (jsonb_typeof(aggregated_fixture_ids) = 'array'),
  check (jsonb_typeof(summary_payload) = 'object'),
  check (jsonb_typeof(position_statistics_payload) = 'object'),
  check (expected_fixture_count is null or synchronized_fixture_count <= expected_fixture_count),
  check (
    coverage_status <> 'complete'
    or (
      expected_fixture_count is not null
      and expected_fixture_count = synchronized_fixture_count
      and jsonb_array_length(expected_fixture_ids) = expected_fixture_count
      and jsonb_array_length(aggregated_fixture_ids) = synchronized_fixture_count
    )
  )
);

drop trigger if exists football_player_fixture_statistics_updated on public.football_player_fixture_statistics;
create trigger football_player_fixture_statistics_updated
  before update on public.football_player_fixture_statistics
  for each row execute function public.touch_updated_at();

drop trigger if exists football_player_season_memberships_updated on public.football_player_season_memberships;
create trigger football_player_season_memberships_updated
  before update on public.football_player_season_memberships
  for each row execute function public.touch_updated_at();

drop trigger if exists football_player_season_statistics_updated on public.football_player_season_statistics;
create trigger football_player_season_statistics_updated
  before update on public.football_player_season_statistics
  for each row execute function public.touch_updated_at();

create index if not exists football_player_fixture_statistics_player_fixture_idx
  on public.football_player_fixture_statistics (football_player_id, fixture_id);
create index if not exists football_player_fixture_statistics_season_idx
  on public.football_player_fixture_statistics (season_id, football_player_id);
create index if not exists football_player_season_memberships_player_season_idx
  on public.football_player_season_memberships (football_player_id, competition_id, season_id);
create index if not exists football_player_season_statistics_player_competition_idx
  on public.football_player_season_statistics (football_player_id, competition_id, season_id);
create index if not exists football_player_season_statistics_coverage_idx
  on public.football_player_season_statistics (coverage_status, source_synced_at desc);

alter table public.football_player_fixture_statistics enable row level security;
alter table public.football_player_season_memberships enable row level security;
alter table public.football_player_season_statistics enable row level security;

revoke all privileges on table public.football_player_fixture_statistics from public, anon, authenticated;
revoke all privileges on table public.football_player_season_memberships from public, anon, authenticated;
revoke all privileges on table public.football_player_season_statistics from public, anon, authenticated;

grant select, insert, update, delete on table public.football_player_fixture_statistics to service_role;
grant select, insert, update, delete on table public.football_player_season_memberships to service_role;
grant select, insert, update, delete on table public.football_player_season_statistics to service_role;

alter table public.football_data_sync_runs
  drop constraint if exists football_data_sync_runs_sync_type_check;
alter table public.football_data_sync_runs
  add constraint football_data_sync_runs_sync_type_check
  check (sync_type in ('starter_foundation', 'competition', 'club', 'squad', 'player', 'fixture_schedule', 'live_scores', 'player_season_statistics'));

comment on table public.football_player_fixture_statistics is
  'Server-only normalized per-fixture player statistics. Null means unavailable, never zero by assumption.';
comment on table public.football_player_season_memberships is
  'Server-only verified player-to-club membership for one competition season. It defines eligible fixtures for aggregate coverage.';
comment on table public.football_player_season_statistics is
  'Canonical server-only season aggregate. Complete coverage is allowed only when every eligible fixture is represented once.';
