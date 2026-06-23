-- Touchline Global Football Link Index.
-- Automatic internal index for football business links discovered inside Touchline activity.
-- This does not crawl third-party websites. It stores click-through references already present
-- in Touchline workflows, keeping players, agents, clubs and football entities searchable.

create extension if not exists pg_trgm;

create table if not exists public.global_football_links (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null default 'transfermarkt',
  entity_type text not null default 'other',
  source_id text,
  canonical_url text not null,
  source_domain text,
  title text not null,
  description text,
  image_url text,
  status text not null default 'active',
  import_source text not null default 'automatic_link_index',
  imported_by uuid references public.users(id) on delete set null,
  source_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector,
  unique (source_provider, canonical_url),
  check (source_provider in ('transfermarkt', 'licensed_provider', 'manual_import', 'user_submitted')),
  check (entity_type in ('player', 'agent', 'club', 'coach', 'competition', 'other')),
  check (status in ('active', 'archived', 'blocked'))
);

create or replace function public.global_football_links_search_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  new.search_vector =
    to_tsvector(
      'simple',
      coalesce(new.title, '') || ' ' ||
      coalesce(new.description, '') || ' ' ||
      coalesce(new.entity_type, '') || ' ' ||
      coalesce(new.source_id, '') || ' ' ||
      coalesce(new.source_domain, '')
    );
  return new;
end
$$;

drop trigger if exists global_football_links_search_updated on public.global_football_links;
create trigger global_football_links_search_updated
  before insert or update on public.global_football_links
  for each row execute function public.global_football_links_search_update();

create index if not exists global_football_links_entity_idx
  on public.global_football_links(entity_type, last_seen_at desc);

create index if not exists global_football_links_source_id_idx
  on public.global_football_links(source_provider, entity_type, source_id);

create index if not exists global_football_links_domain_idx
  on public.global_football_links(source_domain);

create index if not exists global_football_links_search_vector_idx
  on public.global_football_links using gin(search_vector);

create index if not exists global_football_links_title_trgm_idx
  on public.global_football_links using gin(title gin_trgm_ops);

create or replace function public.search_global_football_links(
  search_query text,
  entity_type_filter text default null,
  result_limit integer default 20
)
returns table (
  id uuid,
  entity_type text,
  source_provider text,
  source_id text,
  canonical_url text,
  source_domain text,
  title text,
  description text,
  image_url text,
  last_seen_at timestamptz,
  relevance real
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with normalized as (
    select
      nullif(trim(search_query), '') as q,
      nullif(trim(entity_type_filter), '') as entity_filter,
      least(greatest(coalesce(result_limit, 20), 1), 100) as max_rows
  ),
  ranked as (
    select
      l.id,
      l.entity_type,
      l.source_provider,
      l.source_id,
      l.canonical_url,
      l.source_domain,
      l.title,
      l.description,
      l.image_url,
      l.last_seen_at,
      (
        case when lower(l.title) = lower(n.q) then 8 else 0 end +
        case when lower(l.title) like lower(n.q) || '%' then 5 else 0 end +
        case when l.source_id = n.q then 10 else 0 end +
        ts_rank_cd(l.search_vector, plainto_tsquery('simple', n.q)) +
        similarity(l.title, n.q)
      )::real as relevance
    from public.global_football_links l
    cross join normalized n
    where l.status = 'active'
      and n.q is not null
      and (n.entity_filter is null or l.entity_type = n.entity_filter)
      and (
        l.search_vector @@ plainto_tsquery('simple', n.q)
        or l.title ilike '%' || n.q || '%'
        or l.description ilike '%' || n.q || '%'
        or l.source_id = n.q
      )
  )
  select *
  from ranked
  order by relevance desc, last_seen_at desc, title asc
  limit (select max_rows from normalized);
$$;

alter table public.global_football_links enable row level security;

drop policy if exists "authenticated users can read global football links" on public.global_football_links;
create policy "authenticated users can read global football links" on public.global_football_links
  for select
  to authenticated
  using (status = 'active');

grant select on public.global_football_links to authenticated;
grant select, insert, update, delete on public.global_football_links to service_role;
grant execute on function public.search_global_football_links(text, text, integer) to authenticated;
grant execute on function public.search_global_football_links(text, text, integer) to service_role;

-- Backfill global player links already saved in Touchline.
insert into public.global_football_links (
  source_provider,
  entity_type,
  source_id,
  canonical_url,
  source_domain,
  title,
  image_url,
  import_source,
  source_payload,
  last_seen_at
)
select
  'transfermarkt',
  'player',
  transfermarkt_player_id,
  profile_url,
  'transfermarkt.com',
  player_name,
  photo_url,
  'global_player_profiles_backfill',
  jsonb_build_object('source', 'global_player_profiles'),
  coalesce(last_updated_at, updated_at, created_at, now())
from public.global_player_profiles
where profile_url is not null
on conflict (source_provider, canonical_url) do update set
  title = coalesce(excluded.title, public.global_football_links.title),
  image_url = coalesce(excluded.image_url, public.global_football_links.image_url),
  source_id = coalesce(excluded.source_id, public.global_football_links.source_id),
  last_seen_at = greatest(public.global_football_links.last_seen_at, excluded.last_seen_at),
  source_payload = public.global_football_links.source_payload || excluded.source_payload;

-- Backfill radar links, including rumors/news/player links already saved by users.
insert into public.global_football_links (
  source_provider,
  entity_type,
  source_id,
  canonical_url,
  source_domain,
  title,
  description,
  image_url,
  import_source,
  imported_by,
  source_payload,
  last_seen_at
)
select
  case when coalesce(source_domain, '') ilike '%transfermarkt%' then 'transfermarkt' else 'user_submitted' end,
  case
    when transfermarkt_player_id is not null and transfermarkt_player_id <> '' then 'player'
    when category in ('club', 'news', 'rumor', 'scout') then 'other'
    else coalesce(category, 'other')
  end,
  nullif(transfermarkt_player_id, ''),
  url,
  source_domain,
  coalesce(title, url),
  description,
  image_url,
  'market_radar_links_backfill',
  created_by,
  jsonb_build_object('source', 'market_radar_links', 'category', category, 'siteName', site_name),
  coalesce(last_previewed_at, updated_at, created_at, now())
from public.market_radar_links
where url is not null
on conflict (source_provider, canonical_url) do update set
  title = coalesce(excluded.title, public.global_football_links.title),
  description = coalesce(excluded.description, public.global_football_links.description),
  image_url = coalesce(excluded.image_url, public.global_football_links.image_url),
  source_id = coalesce(excluded.source_id, public.global_football_links.source_id),
  last_seen_at = greatest(public.global_football_links.last_seen_at, excluded.last_seen_at),
  source_payload = public.global_football_links.source_payload || excluded.source_payload;

comment on table public.global_football_links is
  'Automatic Touchline-owned index of football business links discovered inside the platform. It supports the future agent/club/player business social network without crawling third-party sites.';
