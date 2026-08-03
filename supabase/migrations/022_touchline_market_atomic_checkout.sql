-- Production-safe TouchLine card contracting.
-- The browser submits card inventory ids only. Price, supply, ownership and
-- wallet balance are resolved and committed inside one database transaction.

create table if not exists public.touchline_card_price_catalog (
  price_table_version text not null,
  tier_key text not null check (tier_key in (
    'ruby-red',
    'sapphire-blue',
    'amethyst-purple',
    'radiant-gold',
    'emerald-green',
    'clear-diamond',
    'diamond-gold'
  )),
  price_tc integer not null check (price_tc >= 0),
  created_at timestamptz not null default now(),
  primary key (price_table_version, tier_key)
);

alter table public.touchline_card_inventory
  add column if not exists competition_tier text not null default 'ruby-red',
  add column if not exists price_table_version text not null default '2026-07-premier-v1',
  add column if not exists supply_limit integer not null default 1000;

alter table public.touchline_card_inventory
  drop constraint if exists touchline_card_inventory_competition_tier_check;
alter table public.touchline_card_inventory
  add constraint touchline_card_inventory_competition_tier_check
  check (competition_tier in (
    'ruby-red',
    'sapphire-blue',
    'amethyst-purple',
    'radiant-gold',
    'emerald-green',
    'clear-diamond',
    'diamond-gold'
  ));

alter table public.touchline_card_inventory
  drop constraint if exists touchline_card_inventory_supply_limit_check;
alter table public.touchline_card_inventory
  add constraint touchline_card_inventory_supply_limit_check
  check (supply_limit > 0);

alter table public.touchline_card_inventory
  drop constraint if exists touchline_card_inventory_price_catalog_fk;
alter table public.touchline_card_inventory
  add constraint touchline_card_inventory_price_catalog_fk
  foreign key (price_table_version, competition_tier)
  references public.touchline_card_price_catalog(price_table_version, tier_key)
  on update restrict
  on delete restrict;

create table if not exists public.touchline_market_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  idempotency_key text not null,
  status text not null default 'completed' check (status in ('completed', 'reversed')),
  item_count integer not null check (item_count > 0 and item_count <= 35),
  total_tc integer not null check (total_tc > 0),
  balance_before_tc numeric(14, 2) not null check (balance_before_tc >= 0),
  balance_after_tc numeric(14, 2) not null check (balance_after_tc >= 0),
  card_ids uuid[] not null,
  price_table_versions text[] not null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique (user_id, idempotency_key),
  check (balance_after_tc = balance_before_tc - total_tc),
  check (cardinality(card_ids) = item_count),
  check (cardinality(price_table_versions) > 0)
);

create table if not exists public.touchline_market_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.touchline_market_orders(id) on delete restrict,
  card_id uuid not null references public.touchline_card_inventory(id) on delete restrict,
  player_id uuid references public.football_players(id) on delete set null,
  player_name text not null,
  club_name text,
  competition_tier text not null,
  unit_price_tc integer not null check (unit_price_tc > 0),
  price_table_version text not null,
  created_at timestamptz not null default now(),
  unique (order_id, card_id),
  foreign key (price_table_version, competition_tier)
    references public.touchline_card_price_catalog(price_table_version, tier_key)
    on update restrict
    on delete restrict
);

create table if not exists public.touchline_card_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  card_id uuid not null references public.touchline_card_inventory(id) on delete restrict,
  order_item_id uuid not null unique references public.touchline_market_order_items(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'ended', 'reversed')),
  purchase_price_tc integer not null check (purchase_price_tc > 0),
  purchase_tier text not null,
  purchase_price_table_version text not null,
  contracted_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check ((status = 'active' and ended_at is null) or status <> 'active'),
  foreign key (purchase_price_table_version, purchase_tier)
    references public.touchline_card_price_catalog(price_table_version, tier_key)
    on update restrict
    on delete restrict
);

create unique index if not exists touchline_card_contracts_active_user_card_idx
  on public.touchline_card_contracts(user_id, card_id)
  where status = 'active';

create index if not exists touchline_card_contracts_user_idx
  on public.touchline_card_contracts(user_id, status, contracted_at desc);

create index if not exists touchline_card_contracts_supply_idx
  on public.touchline_card_contracts(card_id, status);

create index if not exists touchline_market_orders_user_idx
  on public.touchline_market_orders(user_id, created_at desc);

create index if not exists touchline_market_order_items_order_idx
  on public.touchline_market_order_items(order_id);

create or replace function public.checkout_touchline_market_cart(
  requested_user_id uuid,
  requested_card_ids uuid[],
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  existing_order public.touchline_market_orders%rowtype;
  created_item public.touchline_market_order_items%rowtype;
  created_contract_id uuid;
  card_count integer;
  active_contract_count integer;
  active_supply_count integer;
  total_tc integer := 0;
  balance_cents bigint := 0;
  balance_before_tc numeric(14, 2);
  balance_after_tc numeric(14, 2);
  order_id uuid := gen_random_uuid();
  normalized_card_ids uuid[] := array[]::uuid[];
  versions text[] := array[]::text[];
  contract_ids uuid[] := array[]::uuid[];
begin
  if requested_user_id is null then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_AUTH_REQUIRED';
  end if;
  if requested_idempotency_key is null
     or length(trim(requested_idempotency_key)) < 8
     or length(trim(requested_idempotency_key)) > 120 then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_INVALID_IDEMPOTENCY_KEY';
  end if;
  if requested_card_ids is null or cardinality(requested_card_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_EMPTY_CART';
  end if;
  if cardinality(requested_card_ids) > 35 then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_ROSTER_CAPACITY';
  end if;
  if cardinality(requested_card_ids) <> (
    select count(distinct card_id)
    from unnest(requested_card_ids) as requested(card_id)
  ) then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_DUPLICATE_CARD';
  end if;

  select array_agg(card_id order by card_id)
    into normalized_card_ids
    from unnest(requested_card_ids) as requested(card_id);

  -- The user row serializes wallet and roster mutations for this ClubOwner.
  perform id
    from public.users
   where id = requested_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_USER_NOT_FOUND';
  end if;

  select *
    into existing_order
    from public.touchline_market_orders
   where user_id = requested_user_id
     and idempotency_key = trim(requested_idempotency_key);
  if found then
    if existing_order.card_ids <> normalized_card_ids then
      raise exception using errcode = 'P0001', message = 'TL_MARKET_IDEMPOTENCY_CONFLICT';
    end if;

    select coalesce(array_agg(contract.id order by contract.contracted_at, contract.id), array[]::uuid[])
      into contract_ids
      from public.touchline_card_contracts as contract
      join public.touchline_market_order_items as item
        on item.id = contract.order_item_id
     where item.order_id = existing_order.id;

    return jsonb_build_object(
      'ok', true,
      'idempotentReplay', true,
      'orderId', existing_order.id,
      'contractIds', contract_ids,
      'itemCount', existing_order.item_count,
      'totalTc', existing_order.total_tc,
      'balanceBeforeTc', existing_order.balance_before_tc,
      'balanceAfterTc', existing_order.balance_after_tc,
      'priceTableVersions', existing_order.price_table_versions
    );
  end if;

  -- Every requested inventory row is locked in UUID order to serialize supply.
  perform id
    from public.touchline_card_inventory
   where id = any(requested_card_ids)
   order by id
   for update;

  select count(*)
    into card_count
    from public.touchline_card_inventory
   where id = any(requested_card_ids);
  if card_count <> cardinality(requested_card_ids) then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_CARD_NOT_FOUND';
  end if;

  select count(*)
    into active_contract_count
    from public.touchline_card_contracts
   where user_id = requested_user_id
     and status = 'active';
  if active_contract_count + cardinality(requested_card_ids) > 35 then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_ROSTER_CAPACITY';
  end if;

  for candidate in
    select
      inventory.*,
      price.price_tc
    from public.touchline_card_inventory as inventory
    join public.touchline_card_price_catalog as price
      on price.price_table_version = inventory.price_table_version
     and price.tier_key = inventory.competition_tier
    where inventory.id = any(requested_card_ids)
    order by inventory.id
  loop
    if candidate.card_status <> 'published' or candidate.sale_status <> 'available' then
      raise exception using errcode = 'P0001', message = 'TL_MARKET_CARD_UNAVAILABLE';
    end if;
    if exists (
      select 1
      from public.touchline_card_contracts
      where user_id = requested_user_id
        and card_id = candidate.id
        and status = 'active'
    ) then
      raise exception using errcode = 'P0001', message = 'TL_MARKET_ALREADY_OWNED';
    end if;

    select count(*)
      into active_supply_count
      from public.touchline_card_contracts
     where card_id = candidate.id
       and status = 'active';
    if active_supply_count >= candidate.supply_limit then
      raise exception using errcode = 'P0001', message = 'TL_MARKET_SOLD_OUT';
    end if;

    total_tc := total_tc + candidate.price_tc;
    if not candidate.price_table_version = any(versions) then
      versions := array_append(versions, candidate.price_table_version);
    end if;
  end loop;

  select coalesce(sum(amount_cents), 0)
    into balance_cents
    from public.clubowner_credit_ledger
   where user_id = requested_user_id;
  if balance_cents < total_tc * 100 then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_INSUFFICIENT_BALANCE';
  end if;

  balance_before_tc := balance_cents::numeric / 100;
  balance_after_tc := (balance_cents - total_tc * 100)::numeric / 100;

  insert into public.touchline_market_orders (
    id,
    user_id,
    idempotency_key,
    item_count,
    total_tc,
    balance_before_tc,
    balance_after_tc,
    card_ids,
    price_table_versions
  ) values (
    order_id,
    requested_user_id,
    trim(requested_idempotency_key),
    cardinality(requested_card_ids),
    total_tc,
    balance_before_tc,
    balance_after_tc,
    normalized_card_ids,
    versions
  );

  insert into public.clubowner_credit_ledger (
    user_id,
    amount_cents,
    currency,
    entry_type,
    reason,
    idempotency_key,
    metadata,
    created_by
  ) values (
    requested_user_id,
    -(total_tc * 100),
    'EUR',
    'purchase_use',
    'TouchLine Market card contracts',
    'touchline-market:' || requested_user_id::text || ':' || trim(requested_idempotency_key),
    jsonb_build_object(
      'orderId', order_id,
      'totalTc', total_tc,
      'itemCount', cardinality(requested_card_ids),
      'priceTableVersions', versions
    ),
    requested_user_id
  );

  for candidate in
    select
      inventory.*,
      price.price_tc
    from public.touchline_card_inventory as inventory
    join public.touchline_card_price_catalog as price
      on price.price_table_version = inventory.price_table_version
     and price.tier_key = inventory.competition_tier
    where inventory.id = any(requested_card_ids)
    order by inventory.id
  loop
    insert into public.touchline_market_order_items (
      order_id,
      card_id,
      player_id,
      player_name,
      club_name,
      competition_tier,
      unit_price_tc,
      price_table_version
    ) values (
      order_id,
      candidate.id,
      candidate.player_id,
      candidate.player_name,
      candidate.club_name,
      candidate.competition_tier,
      candidate.price_tc,
      candidate.price_table_version
    )
    returning * into created_item;

    insert into public.touchline_card_contracts (
      user_id,
      card_id,
      order_item_id,
      purchase_price_tc,
      purchase_tier,
      purchase_price_table_version,
      metadata
    ) values (
      requested_user_id,
      candidate.id,
      created_item.id,
      candidate.price_tc,
      candidate.competition_tier,
      candidate.price_table_version,
      jsonb_build_object('orderId', order_id)
    )
    returning id into created_contract_id;

    contract_ids := array_append(contract_ids, created_contract_id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'idempotentReplay', false,
    'orderId', order_id,
    'contractIds', contract_ids,
    'itemCount', cardinality(requested_card_ids),
    'totalTc', total_tc,
    'balanceBeforeTc', balance_before_tc,
    'balanceAfterTc', balance_after_tc,
    'priceTableVersions', versions
  );
end;
$$;

alter table public.touchline_card_price_catalog enable row level security;
alter table public.touchline_market_orders enable row level security;
alter table public.touchline_market_order_items enable row level security;
alter table public.touchline_card_contracts enable row level security;

revoke all on function public.checkout_touchline_market_cart(uuid, uuid[], text) from public;

grant select on public.touchline_card_price_catalog to service_role;
grant select on public.touchline_market_orders to service_role;
grant select on public.touchline_market_order_items to service_role;
grant select on public.touchline_card_contracts to service_role;
grant execute on function public.checkout_touchline_market_cart(uuid, uuid[], text) to service_role;

comment on function public.checkout_touchline_market_cart(uuid, uuid[], text) is
  'Atomically validates current card prices and supply, debits TC, creates an order and issues all requested contracts or none.';
