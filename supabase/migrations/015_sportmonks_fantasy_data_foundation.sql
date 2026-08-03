create table if not exists public.football_fantasy_fixture_feeds (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_fixture_id text not null,
  fixture_payload jsonb not null default '{}'::jsonb,
  lineups_payload jsonb not null default '[]'::jsonb,
  formations_payload jsonb not null default '[]'::jsonb,
  sidelined_payload jsonb not null default '[]'::jsonb,
  events_payload jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint football_fantasy_fixture_feeds_provider_fixture_key unique (provider, provider_fixture_id)
);

create index if not exists football_fantasy_fixture_feeds_provider_idx
  on public.football_fantasy_fixture_feeds (provider, provider_fixture_id);

create table if not exists public.football_provider_capabilities (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  resources_payload jsonb not null default '[]'::jsonb,
  enrichments_payload jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.football_fantasy_fixture_feeds enable row level security;
alter table public.football_provider_capabilities enable row level security;

drop policy if exists "Authenticated users can read fantasy fixture feeds" on public.football_fantasy_fixture_feeds;
create policy "Authenticated users can read fantasy fixture feeds"
  on public.football_fantasy_fixture_feeds
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read provider capabilities" on public.football_provider_capabilities;
create policy "Authenticated users can read provider capabilities"
  on public.football_provider_capabilities
  for select
  to authenticated
  using (true);

grant select on public.football_fantasy_fixture_feeds to authenticated;
grant select on public.football_provider_capabilities to authenticated;
grant select, insert, update, delete on public.football_fantasy_fixture_feeds to service_role;
grant select, insert, update, delete on public.football_provider_capabilities to service_role;
