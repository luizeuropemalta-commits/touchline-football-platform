-- Touchline Digital Identity Engine (TDIE) player cache.
-- External provider photos are source references only. The app renders TDIE identity payloads,
-- generated artwork, or premium Touchline fallbacks as the visible player identity.

create table if not exists public.tdie_player_identities (
  id uuid primary key default gen_random_uuid(),
  player_source text not null,
  player_source_id text not null,
  provider text,
  provider_player_id text,
  player_name text not null,
  source_reference_url text,
  source_photo_url text,
  tdie_version text not null default 'tdie-player-v1',
  identity_status text not null default 'premium_fallback'
    check (identity_status in ('generated', 'premium_fallback', 'pending')),
  render_mode text not null default 'premium_fallback'
    check (render_mode in ('generated_artwork', 'premium_fallback')),
  artwork_url text,
  identity_payload jsonb not null default '{}'::jsonb,
  source_signature text not null,
  generated_at timestamptz not null default now(),
  last_used_at timestamptz,
  stale_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_source, player_source_id, tdie_version)
);

create or replace function public.tdie_player_identities_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tdie_player_identities_touch_updated_at on public.tdie_player_identities;
create trigger tdie_player_identities_touch_updated_at
  before update on public.tdie_player_identities
  for each row execute function public.tdie_player_identities_touch_updated_at();

create index if not exists tdie_player_identities_provider_idx
  on public.tdie_player_identities(provider, provider_player_id);

create index if not exists tdie_player_identities_signature_idx
  on public.tdie_player_identities(source_signature);

create index if not exists tdie_player_identities_status_idx
  on public.tdie_player_identities(identity_status, render_mode);

create index if not exists tdie_player_identities_last_used_idx
  on public.tdie_player_identities(last_used_at desc nulls last);

alter table public.tdie_player_identities enable row level security;

drop policy if exists "authenticated users can read tdie player identities" on public.tdie_player_identities;
create policy "authenticated users can read tdie player identities"
  on public.tdie_player_identities
  for select
  to authenticated
  using (true);

drop policy if exists "service role can manage tdie player identities" on public.tdie_player_identities;
create policy "service role can manage tdie player identities"
  on public.tdie_player_identities
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.tdie_player_identities to authenticated;
grant select, insert, update, delete on public.tdie_player_identities to service_role;

comment on table public.tdie_player_identities is
  'TDIE player identity cache. Stores Touchline-renderable identity payloads and generated artwork references. Provider photos are stored only as source references, not primary visible identity.';
