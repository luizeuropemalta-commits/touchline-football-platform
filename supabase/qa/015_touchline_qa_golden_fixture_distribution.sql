-- QA-only canonical match distribution read model.
-- Forward-only for P0B. Production is deliberately outside this mission.

begin;

alter table public.football_player_fixture_statistics
  add column if not exists touchline_points integer,
  add column if not exists touchline_points_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists scoring_version text,
  add column if not exists settlement_status text;

alter table public.football_player_fixture_statistics
  drop constraint if exists football_player_fixture_statistics_touchline_points_check,
  add constraint football_player_fixture_statistics_touchline_points_check
    check (touchline_points is null or touchline_points between -100 and 500),
  drop constraint if exists football_player_fixture_statistics_points_breakdown_check,
  add constraint football_player_fixture_statistics_points_breakdown_check
    check (jsonb_typeof(touchline_points_breakdown) = 'array'),
  drop constraint if exists football_player_fixture_statistics_settlement_check,
  add constraint football_player_fixture_statistics_settlement_check
    check (settlement_status is null or settlement_status in ('provisional', 'final'));

create table if not exists public.football_fixture_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_sort_order integer,
  minute integer,
  extra_minute integer,
  provider_team_id text,
  provider_player_id text,
  football_player_id uuid references public.football_players(id) on delete set null,
  player_name text,
  related_provider_player_id text,
  related_football_player_id uuid references public.football_players(id) on delete set null,
  related_player_name text,
  event_type text not null,
  result text,
  info text,
  addition text,
  event_status text not null default 'recorded'
    check (event_status in ('recorded', 'rescinded')),
  source_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists football_fixture_events_fixture_order_idx
  on public.football_fixture_events (fixture_id, provider_sort_order, minute, provider_event_id);

create table if not exists public.football_fixture_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  event_type text not null check (event_type in ('LINEUP_AVAILABLE')),
  first_observed_at timestamptz not null,
  source_synced_at timestamptz,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, event_type),
  check (jsonb_typeof(evidence_payload) = 'object')
);

drop trigger if exists football_fixture_events_updated on public.football_fixture_events;
create trigger football_fixture_events_updated
  before update on public.football_fixture_events
  for each row execute function public.touch_updated_at();

drop trigger if exists football_fixture_lifecycle_events_updated on public.football_fixture_lifecycle_events;
create trigger football_fixture_lifecycle_events_updated
  before update on public.football_fixture_lifecycle_events
  for each row execute function public.touch_updated_at();

alter table public.football_player_fixture_statistics enable row level security;
alter table public.football_player_fixture_statistics force row level security;
alter table public.football_fixture_events enable row level security;
alter table public.football_fixture_events force row level security;
alter table public.football_fixture_lifecycle_events enable row level security;
alter table public.football_fixture_lifecycle_events force row level security;

revoke all privileges on table public.football_fixture_events from public, anon, authenticated;
revoke all privileges on table public.football_fixture_lifecycle_events from public, anon, authenticated;
revoke all privileges on table public.football_player_fixture_statistics from public, anon, authenticated;
grant select, insert, update, delete on table public.football_fixture_events to service_role;
grant select, insert, update, delete on table public.football_fixture_lifecycle_events to service_role;
grant select, insert, update, delete on table public.football_player_fixture_statistics to service_role;

comment on column public.football_player_fixture_statistics.touchline_points is
  'Versioned TouchLine game points for this fixture. Provider statistics remain separate facts.';
comment on table public.football_fixture_events is
  'Server-only canonical event facts. Provider event identity makes reconciliation idempotent.';
comment on table public.football_fixture_lifecycle_events is
  'Server-only first-observation evidence for distribution triggers such as LINEUP_AVAILABLE.';

commit;

-- Rollback (documented, not executed): drop the two new tables, then drop the
-- four added fixture-statistics columns only after exporting their rows.
