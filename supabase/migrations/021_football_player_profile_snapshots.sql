-- Latest normalized SportMonks profile snapshot per verified player.
-- Ranking, card tier, TouchLine points, and TC price remain owned by the audited
-- TouchLine ranking snapshot tables and must never be written here.

create table if not exists public.football_player_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'sportmonks'),
  provider_player_id text not null,
  football_player_id uuid references public.football_players(id) on delete set null,
  season_id text,
  season_name text,
  statistics_status text not null default 'pending'
    check (statistics_status in ('live', 'pending')),
  transfer_status text not null default 'pending'
    check (transfer_status in ('live', 'pending')),
  player_payload jsonb not null,
  statistics_payload jsonb not null default '[]'::jsonb,
  transfers_payload jsonb not null default '[]'::jsonb,
  statistics_fetched_at timestamptz,
  transfers_fetched_at timestamptz,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_player_id),
  check (provider_player_id ~ '^[0-9]+$'),
  check (jsonb_typeof(player_payload) = 'object'),
  check (not (player_payload ? 'marketValue')),
  check (not (player_payload ? 'marketValueCurrency')),
  check (jsonb_typeof(statistics_payload) = 'array'),
  check (jsonb_typeof(transfers_payload) = 'array'),
  check (statistics_status <> 'live' or statistics_fetched_at is not null),
  check (transfer_status <> 'live' or transfers_fetched_at is not null)
);

create index if not exists football_player_profile_snapshots_player_idx
  on public.football_player_profile_snapshots(football_player_id);

create index if not exists football_player_profile_snapshots_captured_idx
  on public.football_player_profile_snapshots(captured_at desc);

create or replace function public.football_player_profile_snapshots_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists football_player_profile_snapshots_touch_updated_at
  on public.football_player_profile_snapshots;
create trigger football_player_profile_snapshots_touch_updated_at
  before update on public.football_player_profile_snapshots
  for each row execute function public.football_player_profile_snapshots_touch_updated_at();

alter table public.football_player_profile_snapshots enable row level security;

drop policy if exists "service role can manage official player profile snapshots"
  on public.football_player_profile_snapshots;
create policy "service role can manage official player profile snapshots"
  on public.football_player_profile_snapshots
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete
  on public.football_player_profile_snapshots
  to service_role;

comment on table public.football_player_profile_snapshots is
  'Latest normalized official SportMonks player profile, statistics, and career transfers. Raw provider payloads and TouchLine ranking economics are intentionally excluded.';
