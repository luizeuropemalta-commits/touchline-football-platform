-- Touchline Market Radar.
-- Stores public link previews and click-through references without copying full third-party databases/content.

create table if not exists public.market_radar_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  url text not null,
  source_domain text,
  category text not null default 'rumor' check (category in ('player', 'rumor', 'club', 'news', 'scout', 'other')),
  title text,
  description text,
  image_url text,
  site_name text,
  transfermarkt_player_id text,
  tags text[] not null default '{}'::text[],
  note text,
  status text not null default 'active' check (status in ('active', 'archived')),
  last_previewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, url)
);

create index if not exists market_radar_links_agency_created_idx
  on public.market_radar_links(agency_id, created_at desc);

create index if not exists market_radar_links_category_idx
  on public.market_radar_links(agency_id, category, created_at desc);

create index if not exists market_radar_links_domain_idx
  on public.market_radar_links(source_domain);

drop trigger if exists market_radar_links_updated on public.market_radar_links;
create trigger market_radar_links_updated
  before update on public.market_radar_links
  for each row execute function public.touch_updated_at();

alter table public.market_radar_links enable row level security;

drop policy if exists "tenant market radar links" on public.market_radar_links;
create policy "tenant market radar links" on public.market_radar_links
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

grant select, insert, update, delete on public.market_radar_links to authenticated;
grant select, insert, update, delete on public.market_radar_links to service_role;
