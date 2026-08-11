-- TouchLine manual market-value → card-publication architecture.
--
-- LOCAL, UNAPPLIED migration candidate. It intentionally keeps the manual
-- valuation in the existing canonical football_player_market_values table.
-- This migration adds only the separate *game-card publication* lifecycle.
-- It never creates football players, changes provider identity, rewrites club
-- history, changes contracts/inventory, or exposes a pending card publicly.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_card_publication_batches (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('player', 'club', 'competition')),
  competition_id uuid references public.football_competitions(id) on delete set null,
  club_id uuid references public.football_clubs(id) on delete set null,
  effective_season text not null,
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'reverted')),
  rows_received integer not null default 0 check (rows_received >= 0),
  ready_rows integer not null default 0 check (ready_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check (length(trim(effective_season)) > 0)
);

create table if not exists public.touchline_card_publications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.football_players(id) on delete restrict,
  current_membership_id uuid references public.football_squad_members(id) on delete restrict,
  competition_id uuid references public.football_competitions(id) on delete set null,
  effective_season text not null,
  market_value_id uuid references public.football_player_market_values(id) on delete restrict,
  publication_status text not null default 'detected' check (publication_status in (
    'detected', 'market_value_required', 'ready_for_review', 'ready_to_publish',
    'published', 'inactive_in_competition', 'archived'
  )),
  calculated_tier text check (calculated_tier in (
    'ruby-red', 'sapphire-blue', 'amethyst-purple', 'radiant-gold',
    'emerald-green', 'clear-diamond', 'diamond-gold'
  )),
  calculated_price_tc integer check (calculated_price_tc >= 0),
  policy_version text,
  current_batch_id uuid references public.touchline_card_publication_batches(id) on delete set null,
  last_reviewed_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  internal_note text,
  internal_source text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(effective_season)) > 0),
  check (internal_note is null or length(trim(internal_note)) > 0),
  check (internal_source is null or length(trim(internal_source)) > 0),
  check (
    publication_status <> 'published'
    or (
      market_value_id is not null
      and current_membership_id is not null
      and calculated_tier is not null
      and calculated_price_tc is not null
      and policy_version is not null
      and published_at is not null
    )
  )
);

create table if not exists public.touchline_card_publication_history (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.touchline_card_publications(id) on delete restrict,
  batch_id uuid references public.touchline_card_publication_batches(id) on delete set null,
  player_id uuid not null references public.football_players(id) on delete restrict,
  provider_player_id text,
  action text not null check (action in (
    'detected', 'market_value_required', 'reviewed', 'ready_to_publish',
    'published', 'unpublished', 'inactive_in_competition', 'archived', 'reverted'
  )),
  previous_market_value_eur bigint,
  new_market_value_eur bigint,
  currency char(3),
  previous_tier text,
  new_tier text,
  nominal_price_tc integer,
  before_state jsonb,
  after_state jsonb not null,
  actor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (currency is null or currency = 'EUR')
);

create index if not exists touchline_card_publications_public_idx
  on public.touchline_card_publications(publication_status, effective_season, updated_at desc);
create index if not exists touchline_card_publications_player_idx
  on public.touchline_card_publications(player_id, updated_at desc);
create index if not exists touchline_card_publication_history_publication_idx
  on public.touchline_card_publication_history(publication_id, created_at desc);
create index if not exists touchline_card_publication_batches_status_idx
  on public.touchline_card_publication_batches(status, effective_season, created_at desc);

create or replace function public.touchline_card_publications_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touchline_card_publications_touch_updated_at
  on public.touchline_card_publications;
create trigger touchline_card_publications_touch_updated_at
  before update on public.touchline_card_publications
  for each row execute function public.touchline_card_publications_touch_updated_at();

create or replace function public.touchline_card_publication_history_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'TL_CARD_PUBLICATION_HISTORY_IMMUTABLE';
end;
$$;

drop trigger if exists touchline_card_publication_history_immutable
  on public.touchline_card_publication_history;
create trigger touchline_card_publication_history_immutable
  before update or delete on public.touchline_card_publication_history
  for each row execute function public.touchline_card_publication_history_is_immutable();

alter table public.touchline_card_publications enable row level security;
alter table public.touchline_card_publication_history enable row level security;
alter table public.touchline_card_publication_batches enable row level security;
revoke all on public.touchline_card_publications from public, anon, authenticated;
revoke all on public.touchline_card_publication_history from public, anon, authenticated;
revoke all on public.touchline_card_publication_batches from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_card_publications to service_role;
grant select, insert, update, delete on public.touchline_card_publication_history to service_role;
grant select, insert, update, delete on public.touchline_card_publication_batches to service_role;

comment on table public.touchline_card_publications is
  'Protected lifecycle for TouchLine game-card publication. Only published rows with an approved canonical market value are eligible for game surfaces.';
comment on table public.touchline_card_publication_history is
  'Immutable protected audit history for manual market-value classification and card-publication decisions.';
comment on table public.touchline_card_publication_batches is
  'Protected owner bulk-review metadata. Manual values remain in football_player_market_values.';

commit;
