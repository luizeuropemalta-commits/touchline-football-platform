-- TouchLine-owned, season-scoped market-value read model.
--
-- This migration deliberately stores only values supplied through an approved
-- import or a server-side admin review. It does not scrape, fetch or expose a
-- third-party provider during product reads.

begin;
set local lock_timeout = '5s';

-- Migration 033 used this name for card-economy audit rows. Preserve those
-- rows under an explicit card-history name before creating the player-owned
-- value history required by this engine. The previous trigger-based card
-- synchronisation is intentionally retired below: a value import must not
-- reclassify a card during an active season.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'touchline_player_market_value_history'
       and column_name = 'card_id'
  ) then
    alter table public.touchline_player_market_value_history
      rename to touchline_card_market_value_history;
  end if;
end;
$$;

create table if not exists public.football_player_market_values (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.football_players(id) on delete restrict,
  transfermarkt_player_id text,
  transfermarkt_url text,
  market_value bigint,
  currency char(3),
  market_value_eur bigint,
  market_value_gbp bigint,
  market_value_usd bigint,
  last_verified timestamptz,
  verified_season text,
  source text not null default 'touchline_import',
  confidence text not null default 'pending',
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending',
  check (market_value is null or market_value >= 0),
  check (market_value_eur is null or market_value_eur >= 0),
  check (market_value_gbp is null or market_value_gbp >= 0),
  check (market_value_usd is null or market_value_usd >= 0),
  check (currency is null or currency in ('EUR', 'GBP', 'USD')),
  check (confidence in ('pending', 'reviewed', 'verified')),
  check (status in ('pending', 'ready', 'verified', 'rejected', 'unavailable')),
  check (
    (market_value is null and currency is null)
    or (market_value is not null and currency is not null)
  )
);

create table if not exists public.football_player_market_value_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.football_players(id) on delete restrict,
  market_value bigint,
  currency char(3),
  market_value_eur bigint,
  verified_season text not null,
  verified_date timestamptz not null,
  source text not null,
  confidence text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (market_value is null or market_value >= 0),
  check (market_value_eur is null or market_value_eur >= 0),
  check (currency is null or currency in ('EUR', 'GBP', 'USD')),
  check (confidence in ('reviewed', 'verified')),
  unique (player_id, verified_season, verified_date, source)
);

create table if not exists public.football_market_value_job_definitions (
  key text primary key,
  name text not null,
  cadence text not null,
  lead_days integer,
  active boolean not null default true,
  requires_licensed_source boolean not null default true,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cadence in ('season_offset', 'daily_during_transfer_window', 'manual')),
  check (lead_days is null or lead_days >= 0)
);

create table if not exists public.football_market_value_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null references public.football_market_value_job_definitions(key) on delete restrict,
  import_run_id uuid,
  competition_id uuid references public.football_competitions(id) on delete set null,
  verified_season text not null,
  source_import_file text,
  triggered_by uuid references public.users(id) on delete set null,
  status text not null default 'pending',
  players_scanned integer not null default 0 check (players_scanned >= 0),
  new_players integer not null default 0 check (new_players >= 0),
  changed_values integer not null default 0 check (changed_values >= 0),
  unchanged_values integer not null default 0 check (unchanged_values >= 0),
  pending_records integer not null default 0 check (pending_records >= 0),
  mapping_conflicts integer not null default 0 check (mapping_conflicts >= 0),
  failures integer not null default 0 check (failures >= 0),
  approved_records integer not null default 0 check (approved_records >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('pending', 'running', 'completed', 'partial', 'failed', 'rejected'))
);

create table if not exists public.football_market_value_import_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  competition_id uuid references public.football_competitions(id) on delete set null,
  club_id uuid references public.football_clubs(id) on delete set null,
  verified_season text not null,
  source text not null,
  status text not null default 'pending',
  total_rows integer not null default 0 check (total_rows >= 0),
  inserted_rows integer not null default 0 check (inserted_rows >= 0),
  unchanged_rows integer not null default 0 check (unchanged_rows >= 0),
  pending_rows integer not null default 0 check (pending_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  requested_by uuid references public.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (scope in ('player', 'club', 'competition', 'league')),
  check (status in ('pending', 'running', 'completed', 'partial', 'failed', 'rejected'))
);

create table if not exists public.football_market_value_import_items (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.football_market_value_import_runs(id) on delete cascade,
  player_id uuid references public.football_players(id) on delete set null,
  external_player_id text,
  source_url text,
  market_value bigint,
  currency char(3),
  market_value_eur bigint,
  status text not null default 'pending',
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (market_value is null or market_value >= 0),
  check (market_value_eur is null or market_value_eur >= 0),
  check (currency is null or currency in ('EUR', 'GBP', 'USD')),
  check (status in ('pending', 'unchanged', 'ready', 'imported', 'rejected', 'failed'))
);

alter table public.football_market_value_job_runs
  drop constraint if exists football_market_value_job_runs_import_run_id_fkey;
alter table public.football_market_value_job_runs
  add constraint football_market_value_job_runs_import_run_id_fkey
  foreign key (import_run_id)
  references public.football_market_value_import_runs(id)
  on delete set null;

create index if not exists football_player_market_values_status_idx
  on public.football_player_market_values(status, verified_season, last_verified desc nulls last);
create index if not exists football_player_market_value_history_player_idx
  on public.football_player_market_value_history(player_id, verified_date desc);
create index if not exists football_market_value_import_items_run_idx
  on public.football_market_value_import_items(import_run_id, status);
create index if not exists football_market_value_job_runs_competition_idx
  on public.football_market_value_job_runs(competition_id, verified_season, created_at desc);

create or replace function public.touchline_market_value_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists football_player_market_values_touch_updated_at on public.football_player_market_values;
create trigger football_player_market_values_touch_updated_at
  before update on public.football_player_market_values
  for each row execute function public.touchline_market_value_touch_updated_at();

drop trigger if exists football_market_value_import_items_touch_updated_at on public.football_market_value_import_items;
create trigger football_market_value_import_items_touch_updated_at
  before update on public.football_market_value_import_items
  for each row execute function public.touchline_market_value_touch_updated_at();

drop trigger if exists football_market_value_job_definitions_touch_updated_at on public.football_market_value_job_definitions;
create trigger football_market_value_job_definitions_touch_updated_at
  before update on public.football_market_value_job_definitions
  for each row execute function public.touchline_market_value_touch_updated_at();

create or replace function public.touchline_market_value_history_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'TL_MARKET_VALUE_HISTORY_IMMUTABLE';
end;
$$;

drop trigger if exists football_player_market_value_history_immutable on public.football_player_market_value_history;
create trigger football_player_market_value_history_immutable
  before update or delete on public.football_player_market_value_history
  for each row execute function public.touchline_market_value_history_is_immutable();

-- Stop the legacy source-player trigger from changing the visual card tier
-- when a roster/data sync arrives. Existing approved card classifications are
-- retained; a controlled seasonal reset can be introduced separately.
drop trigger if exists football_players_sync_touchline_market_value on public.football_players;
drop trigger if exists touchline_inventory_sync_market_value_after_insert on public.touchline_card_inventory;

alter table public.football_player_market_values enable row level security;
alter table public.football_player_market_value_history enable row level security;
alter table public.football_market_value_import_runs enable row level security;
alter table public.football_market_value_import_items enable row level security;
alter table public.football_market_value_job_definitions enable row level security;
alter table public.football_market_value_job_runs enable row level security;

revoke all on public.football_player_market_values from public, anon, authenticated;
revoke all on public.football_player_market_value_history from public, anon, authenticated;
revoke all on public.football_market_value_import_runs from public, anon, authenticated;
revoke all on public.football_market_value_import_items from public, anon, authenticated;
revoke all on public.football_market_value_job_definitions from public, anon, authenticated;
revoke all on public.football_market_value_job_runs from public, anon, authenticated;

grant select, insert, update, delete on public.football_player_market_values to service_role;
grant select, insert, update, delete on public.football_player_market_value_history to service_role;
grant select, insert, update, delete on public.football_market_value_import_runs to service_role;
grant select, insert, update, delete on public.football_market_value_import_items to service_role;
grant select, insert, update, delete on public.football_market_value_job_definitions to service_role;
grant select, insert, update, delete on public.football_market_value_job_runs to service_role;

insert into public.football_market_value_job_definitions (
  key, name, cadence, lead_days, description
)
values
  ('annual_full_refresh', 'Annual full-league refresh', 'season_offset', 30, 'Run 30 days before the competition first matchweek with an approved licensed import.'),
  ('final_delta_refresh', 'Final pre-season delta validation', 'season_offset', 7, 'Run 7 days before the competition first matchweek for new, transferred, promoted and unresolved players.'),
  ('transfer_window_roster_detection', 'Daily transfer-window roster detection', 'daily_during_transfer_window', null, 'Detect identity and roster changes only; it must not alter approved values automatically.'),
  ('manual_emergency_player_import', 'Manual emergency player import', 'manual', null, 'Owner-triggered import for one player, always requiring validation.')
on conflict (key) do update
set name = excluded.name,
    cadence = excluded.cadence,
    lead_days = excluded.lead_days,
    description = excluded.description;

comment on table public.football_player_market_values is
  'Canonical TouchLine-owned current market values. Product reads never contact external providers.';
comment on table public.football_player_market_value_history is
  'Immutable verified seasonal market-value history; current values are never overwritten without history.';

commit;
