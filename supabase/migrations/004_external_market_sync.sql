-- External football market profile sync.
-- This stores Transfermarkt/profile links and cached provider data without scraping inside the browser UI.

alter table public.players
  add column if not exists external_market_provider text,
  add column if not exists external_market_player_id text,
  add column if not exists external_market_url text,
  add column if not exists external_market_synced_at timestamptz,
  add column if not exists external_market_payload jsonb not null default '{}'::jsonb;

create table if not exists public.player_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  provider text not null,
  provider_player_id text,
  provider_profile_url text,
  market_value numeric(14,2),
  currency char(3) not null default 'EUR',
  current_club text,
  contract_until date,
  source_updated_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists players_external_market_idx
  on public.players(external_market_provider, external_market_player_id);

create index if not exists player_market_snapshots_player_idx
  on public.player_market_snapshots(player_id, created_at desc);

alter table public.player_market_snapshots enable row level security;

drop policy if exists "tenant market snapshots" on public.player_market_snapshots;
create policy "tenant market snapshots" on public.player_market_snapshots
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());
