-- Local-only preparation for server-owned, season-bound renewal quotes.
--
-- This migration does not create a renewal checkout, debit a wallet, reserve
-- supply or apply any change remotely. Its purpose is to preserve the old
-- contract snapshot and make next-season quotes auditable before a future
-- reviewed server transaction accepts a renewal.

begin;
set local lock_timeout = '5s';

alter table public.touchline_card_contracts
  add column if not exists purchase_market_value_eur bigint,
  add column if not exists purchase_market_value_source text;

alter table public.touchline_card_contracts
  drop constraint if exists touchline_card_contracts_purchase_market_value_check;
alter table public.touchline_card_contracts
  add constraint touchline_card_contracts_purchase_market_value_check
  check (
    (purchase_market_value_eur is null and purchase_market_value_source is null)
    or (
      purchase_market_value_eur is not null
      and purchase_market_value_eur >= 0
      and purchase_market_value_source in ('provider', 'verified-cache')
    )
  );

-- Same player can be contracted again for a new season, but never twice by the
-- same ClubOwner in a single active season.
create unique index if not exists touchline_card_contracts_active_user_card_season_idx
  on public.touchline_card_contracts(user_id, card_id, season_id)
  where status = 'active' and season_id is not null;

create table if not exists public.touchline_contract_renewal_quotes (
  id uuid primary key default gen_random_uuid(),
  source_contract_id uuid not null references public.touchline_card_contracts(id) on delete restrict,
  player_id uuid not null references public.football_players(id) on delete restrict,
  next_season_id uuid not null references public.football_seasons(id) on delete restrict,
  status text not null check (status in (
    'ready',
    'not_eligible',
    'market_value_pending',
    'expired',
    'accepted',
    'superseded'
  )),
  market_value_eur bigint,
  tier_key text,
  price_tc integer,
  price_table_version text,
  market_value_source text,
  eligibility_reason text,
  quote_created_at timestamptz not null default now(),
  quote_expires_at timestamptz,
  accepted_contract_id uuid references public.touchline_card_contracts(id) on delete restrict,
  invalidated_at timestamptz,
  is_current boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quote_expires_at is null or quote_expires_at > quote_created_at),
  check (
    (market_value_eur is null and tier_key is null and price_tc is null and price_table_version is null and market_value_source is null)
    or (
      market_value_eur is not null
      and market_value_eur >= 0
      and tier_key is not null
      and price_tc is not null
      and price_tc >= 0
      and price_table_version is not null
      and market_value_source in ('provider', 'verified-cache')
    )
  ),
  check (
    (status = 'ready' and market_value_eur is not null and quote_expires_at is not null)
    or status <> 'ready'
  ),
  foreign key (price_table_version, tier_key)
    references public.touchline_card_price_catalog(price_table_version, tier_key)
    on update restrict
    on delete restrict
);

create unique index if not exists touchline_contract_renewal_quotes_current_source_season_idx
  on public.touchline_contract_renewal_quotes(source_contract_id, next_season_id)
  where is_current;

create index if not exists touchline_contract_renewal_quotes_player_season_idx
  on public.touchline_contract_renewal_quotes(player_id, next_season_id, status);

alter table public.touchline_contract_renewal_quotes enable row level security;
revoke all on table public.touchline_contract_renewal_quotes from anon, authenticated;
grant select, insert, update on table public.touchline_contract_renewal_quotes to service_role;

comment on column public.touchline_card_contracts.purchase_market_value_eur is
  'Immutable official EUR market-value snapshot when the seasonal contract was created. Historical rows may remain null.';
comment on table public.touchline_contract_renewal_quotes is
  'Server-owned, auditable next-season renewal quote. Never a client price authority and never a wallet debit by itself.';
comment on column public.touchline_contract_renewal_quotes.is_current is
  'Only one current quote may exist per source contract and next season. Requotes supersede rather than overwrite history.';

commit;
