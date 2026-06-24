-- Touchline Transfermarkt Link Registry.
-- Safe link registry only: profile URL, unique ID, name/type, public preview image URL, status and sync logs.
-- This is not a copied Transfermarkt database and must not be used for aggressive crawling.

create extension if not exists pg_trgm;

create table if not exists public.transfermarkt_entities (
  id uuid primary key default gen_random_uuid(),
  transfermarkt_id text not null,
  entity_type text not null,
  name text not null,
  profile_url text not null,
  canonical_url text not null,
  photo_url text,
  source_domain text not null default 'transfermarkt.com',
  status text not null default 'active',
  confidence text not null default 'exact_id',
  last_checked_at timestamptz,
  next_check_at timestamptz,
  source_url text,
  source_payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector,
  unique (entity_type, transfermarkt_id),
  unique (canonical_url),
  check (entity_type in ('player', 'agent', 'club')),
  check (status in ('active', 'unavailable', 'changed', 'duplicate', 'needs_review', 'rejected')),
  check (confidence in ('exact_id', 'public_reference', 'user_submitted', 'needs_review'))
);

create table if not exists public.transfermarkt_relationships (
  id uuid primary key default gen_random_uuid(),
  source_entity_id uuid not null references public.transfermarkt_entities(id) on delete cascade,
  target_entity_id uuid not null references public.transfermarkt_entities(id) on delete cascade,
  relationship_type text not null,
  status text not null default 'suggested',
  source_url text,
  evidence text,
  source_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_entity_id, target_entity_id, relationship_type),
  check (relationship_type in ('agent_player', 'club_player', 'club_agent')),
  check (status in ('suggested', 'approved', 'rejected', 'needs_review'))
);

create table if not exists public.transfermarkt_sync_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null default gen_random_uuid(),
  entity_id uuid references public.transfermarkt_entities(id) on delete set null,
  action text not null,
  status text not null,
  source_url text,
  message text,
  records_found integer not null default 0,
  records_saved integer not null default 0,
  duration_ms integer,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  source_payload jsonb not null default '{}'::jsonb,
  check (action in ('manual_add', 'search_save', 'agent_discovery', 'scheduled_sync', 'manual_sync', 'review')),
  check (status in ('ready', 'skipped', 'success', 'partial', 'error', 'not_configured'))
);

create or replace function public.transfermarkt_entities_search_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  new.search_vector =
    to_tsvector(
      'simple',
      coalesce(new.name, '') || ' ' ||
      coalesce(new.entity_type, '') || ' ' ||
      coalesce(new.transfermarkt_id, '') || ' ' ||
      coalesce(new.source_domain, '')
    );
  return new;
end
$$;

drop trigger if exists transfermarkt_entities_search_updated on public.transfermarkt_entities;
create trigger transfermarkt_entities_search_updated
  before insert or update on public.transfermarkt_entities
  for each row execute function public.transfermarkt_entities_search_update();

create or replace function public.transfermarkt_relationships_updated()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists transfermarkt_relationships_touch_updated on public.transfermarkt_relationships;
create trigger transfermarkt_relationships_touch_updated
  before insert or update on public.transfermarkt_relationships
  for each row execute function public.transfermarkt_relationships_updated();

create index if not exists transfermarkt_entities_type_status_idx
  on public.transfermarkt_entities(entity_type, status, last_checked_at desc nulls last);

create index if not exists transfermarkt_entities_next_check_idx
  on public.transfermarkt_entities(next_check_at)
  where status in ('active', 'changed', 'needs_review');

create index if not exists transfermarkt_entities_search_vector_idx
  on public.transfermarkt_entities using gin(search_vector);

create index if not exists transfermarkt_entities_name_trgm_idx
  on public.transfermarkt_entities using gin(name gin_trgm_ops);

create index if not exists transfermarkt_relationships_source_idx
  on public.transfermarkt_relationships(source_entity_id, status);

create index if not exists transfermarkt_relationships_target_idx
  on public.transfermarkt_relationships(target_entity_id, status);

create index if not exists transfermarkt_sync_logs_run_idx
  on public.transfermarkt_sync_logs(run_id, created_at desc);

create or replace function public.search_transfermarkt_entities(
  search_query text,
  entity_type_filter text default null,
  result_limit integer default 20
)
returns table (
  id uuid,
  transfermarkt_id text,
  entity_type text,
  name text,
  profile_url text,
  canonical_url text,
  photo_url text,
  status text,
  confidence text,
  last_checked_at timestamptz,
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
      e.id,
      e.transfermarkt_id,
      e.entity_type,
      e.name,
      e.profile_url,
      e.canonical_url,
      e.photo_url,
      e.status,
      e.confidence,
      e.last_checked_at,
      (
        case when lower(e.name) = lower(n.q) then 12 else 0 end +
        case when lower(e.name) like lower(n.q) || '%' then 7 else 0 end +
        case when e.transfermarkt_id = n.q then 14 else 0 end +
        ts_rank_cd(e.search_vector, plainto_tsquery('simple', n.q)) +
        similarity(e.name, n.q)
      )::real as relevance
    from public.transfermarkt_entities e
    cross join normalized n
    where e.status in ('active', 'changed', 'needs_review')
      and n.q is not null
      and (n.entity_filter is null or e.entity_type = n.entity_filter)
      and (
        e.search_vector @@ plainto_tsquery('simple', n.q)
        or e.name ilike '%' || n.q || '%'
        or e.transfermarkt_id = n.q
      )
  )
  select *
  from ranked
  order by relevance desc, last_checked_at desc nulls last, name asc
  limit (select max_rows from normalized);
$$;

alter table public.transfermarkt_entities enable row level security;
alter table public.transfermarkt_relationships enable row level security;
alter table public.transfermarkt_sync_logs enable row level security;

drop policy if exists "authenticated users can read transfermarkt entities" on public.transfermarkt_entities;
create policy "authenticated users can read transfermarkt entities" on public.transfermarkt_entities
  for select
  to authenticated
  using (status in ('active', 'changed', 'needs_review'));

drop policy if exists "authenticated users can read approved transfermarkt relationships" on public.transfermarkt_relationships;
create policy "authenticated users can read approved transfermarkt relationships" on public.transfermarkt_relationships
  for select
  to authenticated
  using (status in ('suggested', 'approved', 'needs_review'));

grant select on public.transfermarkt_entities to authenticated;
grant select on public.transfermarkt_relationships to authenticated;
grant select, insert, update, delete on public.transfermarkt_entities to service_role;
grant select, insert, update, delete on public.transfermarkt_relationships to service_role;
grant select, insert, update, delete on public.transfermarkt_sync_logs to service_role;
grant execute on function public.search_transfermarkt_entities(text, text, integer) to authenticated;
grant execute on function public.search_transfermarkt_entities(text, text, integer) to service_role;

-- Backfill from the existing Touchline global link index.
insert into public.transfermarkt_entities (
  transfermarkt_id,
  entity_type,
  name,
  profile_url,
  canonical_url,
  photo_url,
  status,
  confidence,
  last_checked_at,
  source_url,
  source_payload
)
select
  source_id,
  entity_type,
  title,
  canonical_url,
  canonical_url,
  image_url,
  'active',
  'public_reference',
  last_seen_at,
  canonical_url,
  source_payload || jsonb_build_object('backfilledFrom', 'global_football_links')
from public.global_football_links
where source_provider = 'transfermarkt'
  and entity_type in ('player', 'agent', 'club')
  and source_id is not null
  and source_id <> ''
on conflict (entity_type, transfermarkt_id) do update set
  name = coalesce(excluded.name, public.transfermarkt_entities.name),
  profile_url = excluded.profile_url,
  canonical_url = excluded.canonical_url,
  photo_url = coalesce(excluded.photo_url, public.transfermarkt_entities.photo_url),
  status = case when public.transfermarkt_entities.status = 'rejected' then public.transfermarkt_entities.status else 'active' end,
  last_checked_at = greatest(coalesce(public.transfermarkt_entities.last_checked_at, excluded.last_checked_at), excluded.last_checked_at),
  source_payload = public.transfermarkt_entities.source_payload || excluded.source_payload;

comment on table public.transfermarkt_entities is
  'Safe Transfermarkt profile link registry. Stores IDs, names, URLs and public preview metadata only; not a copied Transfermarkt database.';
