-- Touchline Global Player Database Search.
-- Stores Transfermarkt player profile links and public preview metadata in Touchline,
-- then searches our own database instead of calling Transfermarkt on every keystroke.

create extension if not exists pg_trgm;

create table if not exists public.global_player_profiles (
  id uuid primary key default gen_random_uuid(),
  transfermarkt_player_id text not null,
  player_name text not null,
  profile_url text not null,
  photo_url text,
  current_club text,
  position text,
  nationality text,
  date_of_birth date,
  age integer,
  agent_name text,
  agency_name text,
  market_value numeric(14,2),
  market_value_text text,
  currency char(3) not null default 'EUR',
  source_provider text not null default 'transfermarkt',
  source_payload jsonb not null default '{}'::jsonb,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector,
  unique (transfermarkt_player_id),
  check (source_provider in ('transfermarkt', 'licensed_provider', 'manual_import'))
);

create or replace function public.global_player_profiles_search_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  new.search_vector =
    to_tsvector(
      'simple',
      coalesce(new.player_name, '') || ' ' ||
      coalesce(new.current_club, '') || ' ' ||
      coalesce(new.position, '') || ' ' ||
      coalesce(new.nationality, '') || ' ' ||
      coalesce(new.agent_name, '') || ' ' ||
      coalesce(new.agency_name, '') || ' ' ||
      coalesce(new.transfermarkt_player_id, '')
    );
  return new;
end
$$;

drop trigger if exists global_player_profiles_search_updated on public.global_player_profiles;
create trigger global_player_profiles_search_updated
  before insert or update on public.global_player_profiles
  for each row execute function public.global_player_profiles_search_update();

create index if not exists global_player_profiles_search_vector_idx
  on public.global_player_profiles using gin(search_vector);

create index if not exists global_player_profiles_name_trgm_idx
  on public.global_player_profiles using gin(player_name gin_trgm_ops);

create index if not exists global_player_profiles_club_trgm_idx
  on public.global_player_profiles using gin(current_club gin_trgm_ops);

create index if not exists global_player_profiles_position_idx
  on public.global_player_profiles(position);

create index if not exists global_player_profiles_last_updated_idx
  on public.global_player_profiles(last_updated_at desc);

create or replace function public.search_global_player_profiles(search_query text, result_limit integer default 12)
returns table (
  id uuid,
  transfermarkt_player_id text,
  player_name text,
  profile_url text,
  photo_url text,
  current_club text,
  "position" text,
  nationality text,
  date_of_birth date,
  age integer,
  agent_name text,
  agency_name text,
  market_value numeric,
  market_value_text text,
  currency char(3),
  last_updated_at timestamptz,
  relevance real
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with normalized as (
    select nullif(trim(search_query), '') as q,
           least(greatest(coalesce(result_limit, 12), 1), 50) as max_rows
  ),
  ranked as (
    select
      p.id,
      p.transfermarkt_player_id,
      p.player_name,
      p.profile_url,
      p.photo_url,
      p.current_club,
      p.position as "position",
      p.nationality,
      p.date_of_birth,
      p.age,
      p.agent_name,
      p.agency_name,
      p.market_value,
      p.market_value_text,
      p.currency,
      p.last_updated_at,
      (
        case when lower(p.player_name) = lower(n.q) then 8 else 0 end +
        case when lower(p.player_name) like lower(n.q) || '%' then 5 else 0 end +
        case when p.transfermarkt_player_id = n.q then 10 else 0 end +
        ts_rank_cd(p.search_vector, plainto_tsquery('simple', n.q)) +
        similarity(p.player_name, n.q)
      )::real as relevance
    from public.global_player_profiles p
    cross join normalized n
    where n.q is not null
      and (
        p.search_vector @@ plainto_tsquery('simple', n.q)
        or p.player_name ilike '%' || n.q || '%'
        or p.current_club ilike '%' || n.q || '%'
        or p.position ilike '%' || n.q || '%'
        or p.nationality ilike '%' || n.q || '%'
        or p.transfermarkt_player_id = n.q
      )
  )
  select *
  from ranked
  order by relevance desc, last_updated_at desc, player_name asc
  limit (select max_rows from normalized);
$$;

alter table public.global_player_profiles enable row level security;

drop policy if exists "authenticated users can read global player profiles" on public.global_player_profiles;
create policy "authenticated users can read global player profiles" on public.global_player_profiles
  for select
  to authenticated
  using (true);

grant select on public.global_player_profiles to authenticated;
grant select, insert, update, delete on public.global_player_profiles to service_role;
grant execute on function public.search_global_player_profiles(text, integer) to authenticated;
grant execute on function public.search_global_player_profiles(text, integer) to service_role;

-- Backfill existing saved Transfermarkt links from Radar into the searchable global database.
insert into public.global_player_profiles (
  transfermarkt_player_id,
  player_name,
  profile_url,
  photo_url,
  source_provider,
  source_payload,
  last_updated_at
)
select distinct on (transfermarkt_player_id)
  transfermarkt_player_id,
  coalesce(nullif(regexp_replace(coalesce(title, ''), '\s*\|.*$', ''), ''), 'Transfermarkt Player') as player_name,
  url as profile_url,
  image_url as photo_url,
  'transfermarkt',
  jsonb_build_object(
    'source', 'market_radar_links',
    'title', title,
    'description', description,
    'siteName', site_name,
    'radarCategory', category
  ),
  coalesce(last_previewed_at, updated_at, created_at, now())
from public.market_radar_links
where transfermarkt_player_id is not null
  and transfermarkt_player_id <> ''
order by transfermarkt_player_id, coalesce(last_previewed_at, updated_at, created_at, now()) desc
on conflict (transfermarkt_player_id) do update set
  player_name = coalesce(excluded.player_name, public.global_player_profiles.player_name),
  profile_url = excluded.profile_url,
  photo_url = coalesce(excluded.photo_url, public.global_player_profiles.photo_url),
  source_payload = public.global_player_profiles.source_payload || excluded.source_payload,
  last_updated_at = greatest(public.global_player_profiles.last_updated_at, excluded.last_updated_at);

-- Backfill existing Transfermarkt-linked local player profiles.
insert into public.global_player_profiles (
  transfermarkt_player_id,
  player_name,
  profile_url,
  photo_url,
  current_club,
  position,
  nationality,
  date_of_birth,
  market_value,
  currency,
  source_provider,
  source_payload,
  last_updated_at
)
select distinct on (external_market_player_id)
  external_market_player_id,
  trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) as player_name,
  external_market_url as profile_url,
  photo_url,
  null,
  position,
  nationality,
  date_of_birth,
  market_value,
  currency,
  'transfermarkt',
  coalesce(external_market_payload, '{}'::jsonb) || jsonb_build_object('source', 'players'),
  coalesce(external_market_synced_at, updated_at, created_at, now())
from public.players
where external_market_provider = 'transfermarkt'
  and external_market_player_id is not null
  and external_market_player_id <> ''
  and external_market_url is not null
order by external_market_player_id, coalesce(external_market_synced_at, updated_at, created_at, now()) desc
on conflict (transfermarkt_player_id) do update set
  player_name = coalesce(nullif(excluded.player_name, ''), public.global_player_profiles.player_name),
  profile_url = excluded.profile_url,
  photo_url = coalesce(excluded.photo_url, public.global_player_profiles.photo_url),
  current_club = coalesce(excluded.current_club, public.global_player_profiles.current_club),
  position = coalesce(excluded.position, public.global_player_profiles.position),
  nationality = coalesce(excluded.nationality, public.global_player_profiles.nationality),
  date_of_birth = coalesce(excluded.date_of_birth, public.global_player_profiles.date_of_birth),
  market_value = coalesce(excluded.market_value, public.global_player_profiles.market_value),
  currency = coalesce(excluded.currency, public.global_player_profiles.currency),
  source_payload = public.global_player_profiles.source_payload || excluded.source_payload,
  last_updated_at = greatest(public.global_player_profiles.last_updated_at, excluded.last_updated_at);

comment on table public.global_player_profiles is
  'Searchable Touchline cache of Transfermarkt/player profile links and public preview metadata. Search uses Touchline database first; external sources are sync/import references only.';
