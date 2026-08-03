create table if not exists public.touchline_card_inventory (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.football_players(id) on delete set null,
  club_id uuid references public.football_clubs(id) on delete set null,
  player_name text not null,
  club_name text,
  frame_color text not null default 'unassigned',
  frame_url text,
  card_template_url text,
  avatar_image_url text,
  art_status text not null default 'missing' check (art_status in ('missing', 'pending', 'ready', 'review')),
  card_status text not null default 'pending' check (card_status in ('pending', 'ready', 'published', 'reserved', 'sold', 'retired')),
  sale_status text not null default 'not_listed' check (sale_status in ('not_listed', 'available', 'reserved', 'sold')),
  published_at timestamptz,
  reserved_at timestamptz,
  sold_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_id)
);

create table if not exists public.touchline_card_inventory_history (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.touchline_card_inventory(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists touchline_card_inventory_status_idx
  on public.touchline_card_inventory(card_status, sale_status, art_status);

create index if not exists touchline_card_inventory_club_idx
  on public.touchline_card_inventory(club_id, card_status);

create index if not exists touchline_card_inventory_frame_idx
  on public.touchline_card_inventory(frame_color);

create index if not exists touchline_card_inventory_history_card_idx
  on public.touchline_card_inventory_history(card_id, created_at desc);

create trigger touchline_card_inventory_updated
  before update on public.touchline_card_inventory
  for each row execute function public.touch_updated_at();

alter table public.touchline_card_inventory enable row level security;
alter table public.touchline_card_inventory_history enable row level security;

grant select, insert, update, delete on public.touchline_card_inventory to service_role;
grant select, insert, update, delete on public.touchline_card_inventory_history to service_role;
