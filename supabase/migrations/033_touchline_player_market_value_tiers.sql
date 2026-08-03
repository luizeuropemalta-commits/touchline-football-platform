-- Keep the current player-card economy aligned with authoritative EUR market
-- values while preserving every historical order, contract and supply record.

begin;
set local lock_timeout = '5s';

alter table public.touchline_card_price_catalog
  add column if not exists min_market_value_eur bigint,
  add column if not exists max_market_value_eur bigint;

update public.touchline_card_price_catalog
set
  min_market_value_eur = expected.min_value,
  max_market_value_eur = expected.max_value
from (
  values
    ('ruby-red', 0::bigint, 5999999::bigint),
    ('sapphire-blue', 6000000::bigint, 9999999::bigint),
    ('amethyst-purple', 10000000::bigint, 19999999::bigint),
    ('radiant-gold', 20000000::bigint, 34999999::bigint),
    ('emerald-green', 35000000::bigint, 49999999::bigint),
    ('clear-diamond', 50000000::bigint, 69999999::bigint),
    ('diamond-gold', 70000000::bigint, null::bigint)
) as expected(tier_key, min_value, max_value)
where public.touchline_card_price_catalog.price_table_version = '2026-07-premier-v1'
  and public.touchline_card_price_catalog.tier_key = expected.tier_key;

alter table public.touchline_card_price_catalog
  drop constraint if exists touchline_card_price_catalog_market_range_check;
alter table public.touchline_card_price_catalog
  add constraint touchline_card_price_catalog_market_range_check
  check (
    (min_market_value_eur is null and max_market_value_eur is null)
    or (
      min_market_value_eur >= 0
      and (max_market_value_eur is null or max_market_value_eur >= min_market_value_eur)
    )
  );

alter table public.touchline_card_inventory
  add column if not exists market_value_eur bigint,
  add column if not exists previous_market_value_eur bigint,
  add column if not exists market_value_updated_at timestamptz,
  add column if not exists market_value_source text;

alter table public.touchline_card_inventory
  drop constraint if exists touchline_card_inventory_market_value_check;
alter table public.touchline_card_inventory
  add constraint touchline_card_inventory_market_value_check
  check (
    (market_value_eur is null or market_value_eur >= 0)
    and (previous_market_value_eur is null or previous_market_value_eur >= 0)
  );

create table if not exists public.touchline_player_market_value_history (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.touchline_card_inventory(id) on delete restrict,
  player_id uuid not null references public.football_players(id) on delete restrict,
  provider text not null,
  provider_player_id text not null,
  previous_market_value_eur bigint,
  market_value_eur bigint not null check (market_value_eur >= 0),
  previous_tier_key text,
  tier_key text not null,
  price_table_version text not null,
  source_updated_at timestamptz,
  recorded_at timestamptz not null default now(),
  foreign key (price_table_version, tier_key)
    references public.touchline_card_price_catalog(price_table_version, tier_key)
    on update restrict
    on delete restrict
);

create index if not exists touchline_player_market_value_history_card_idx
  on public.touchline_player_market_value_history(card_id, recorded_at desc);

create or replace function public.resolve_touchline_player_market_tier(
  requested_market_value_eur bigint
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select catalog.tier_key
    from public.touchline_card_price_catalog as catalog
   where catalog.price_table_version = '2026-07-premier-v1'
     and requested_market_value_eur >= 0
     and requested_market_value_eur >= catalog.min_market_value_eur
     and (
       catalog.max_market_value_eur is null
       or requested_market_value_eur <= catalog.max_market_value_eur
     )
   order by catalog.min_market_value_eur desc
   limit 1;
$$;

create or replace function public.sync_touchline_inventory_market_value(
  requested_player_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_row public.football_players%rowtype;
  inventory_row public.touchline_card_inventory%rowtype;
  resolved_value bigint;
  resolved_tier text;
  changed_count integer := 0;
begin
  select *
    into player_row
    from public.football_players
   where id = requested_player_id;

  if not found
     or player_row.market_value is null
     or player_row.market_value < 0
     or upper(coalesce(nullif(btrim(player_row.market_value_currency), ''), 'EUR')) <> 'EUR' then
    return 0;
  end if;

  resolved_value := trunc(player_row.market_value)::bigint;
  resolved_tier := public.resolve_touchline_player_market_tier(resolved_value);
  if resolved_tier is null then
    return 0;
  end if;

  for inventory_row in
    select inventory.*
      from public.touchline_card_inventory as inventory
     where inventory.player_id = requested_player_id
       and (
         inventory.market_value_eur is distinct from resolved_value
         or inventory.competition_tier is distinct from resolved_tier
         or inventory.price_table_version is distinct from '2026-07-premier-v1'
       )
     for update
  loop
    update public.touchline_card_inventory
       set previous_market_value_eur = inventory_row.market_value_eur,
           market_value_eur = resolved_value,
           market_value_updated_at = coalesce(player_row.source_updated_at, now()),
           market_value_source = player_row.provider,
           competition_tier = resolved_tier,
           price_table_version = '2026-07-premier-v1'
     where id = inventory_row.id;

    insert into public.touchline_player_market_value_history (
      card_id,
      player_id,
      provider,
      provider_player_id,
      previous_market_value_eur,
      market_value_eur,
      previous_tier_key,
      tier_key,
      price_table_version,
      source_updated_at
    )
    values (
      inventory_row.id,
      inventory_row.player_id,
      player_row.provider,
      player_row.provider_player_id,
      inventory_row.market_value_eur,
      resolved_value,
      inventory_row.competition_tier,
      resolved_tier,
      '2026-07-premier-v1',
      player_row.source_updated_at
    );

    changed_count := changed_count + 1;
  end loop;

  return changed_count;
end;
$$;

create or replace function public.sync_touchline_market_value_after_inventory_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.player_id is not null then
    perform public.sync_touchline_inventory_market_value(new.player_id);
  end if;
  return new;
end;
$$;

create or replace function public.sync_touchline_inventory_after_player_market_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_touchline_inventory_market_value(new.id);
  return new;
end;
$$;

drop trigger if exists football_players_sync_touchline_market_value
  on public.football_players;
create trigger football_players_sync_touchline_market_value
  after insert or update of market_value, market_value_currency, source_updated_at
  on public.football_players
  for each row
  execute function public.sync_touchline_inventory_after_player_market_value();

drop trigger if exists touchline_inventory_sync_market_value_after_insert
  on public.touchline_card_inventory;
create trigger touchline_inventory_sync_market_value_after_insert
  after insert on public.touchline_card_inventory
  for each row
  execute function public.sync_touchline_market_value_after_inventory_insert();

-- Backfill current inventory only. Immutable order items and contracts are not
-- updated by this statement or by either function above.
do $$
declare
  player_record record;
begin
  for player_record in
    select distinct inventory.player_id
      from public.touchline_card_inventory as inventory
      join public.football_players as player on player.id = inventory.player_id
     where player.market_value is not null
       and player.market_value >= 0
       and upper(coalesce(nullif(btrim(player.market_value_currency), ''), 'EUR')) = 'EUR'
  loop
    perform public.sync_touchline_inventory_market_value(player_record.player_id);
  end loop;
end;
$$;

create or replace function public.get_touchline_market_inventory(
  requested_user_id uuid,
  requested_provider_team_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_club_id uuid;
  balance_cents bigint := 0;
  active_contract_count integer := 0;
  cards_payload jsonb := '[]'::jsonb;
begin
  if requested_user_id is null then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_AUTH_REQUIRED';
  end if;
  if requested_provider_team_id is null
     or requested_provider_team_id !~ '^[0-9]{1,20}$' then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_INVALID_TEAM_ID';
  end if;

  perform id from public.users where id = requested_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_USER_NOT_FOUND';
  end if;

  select club.id into target_club_id
    from public.football_clubs as club
   where club.provider = 'sportmonks'
     and club.provider_team_id = requested_provider_team_id
   limit 1;
  if target_club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_CLUB_NOT_FOUND';
  end if;

  select coalesce(sum(ledger.amount_cents), 0) into balance_cents
    from public.clubowner_credit_ledger as ledger
   where ledger.user_id = requested_user_id
     and btrim(ledger.currency) = 'TC';

  select count(*) into active_contract_count
    from public.touchline_card_contracts as contract
   where contract.user_id = requested_user_id
     and contract.status = 'active';

  select coalesce(jsonb_agg(card.card_payload order by card.player_name), '[]'::jsonb)
    into cards_payload
    from (
      select
        inventory.player_name,
        jsonb_build_object(
          'inventoryId', inventory.id,
          'playerId', inventory.player_id,
          'providerPlayerId', player.provider_player_id,
          'tierKey', inventory.competition_tier,
          'priceTableVersion', inventory.price_table_version,
          'priceTc', price.price_tc,
          'marketValueEur', inventory.market_value_eur,
          'previousMarketValueEur', inventory.previous_market_value_eur,
          'marketValueChangeEur', case
            when inventory.market_value_eur is not null
             and inventory.previous_market_value_eur is not null
            then inventory.market_value_eur - inventory.previous_market_value_eur
            else null
          end,
          'marketValueUpdatedAt', inventory.market_value_updated_at,
          'marketValueSource', inventory.market_value_source,
          'supplyLimit', inventory.supply_limit,
          'soldCopies', supply.active_count,
          'availableCopies', greatest(inventory.supply_limit - supply.active_count, 0),
          'alreadyOwned', exists (
            select 1 from public.touchline_card_contracts as owned
             where owned.user_id = requested_user_id
               and owned.card_id = inventory.id
               and owned.status = 'active'
          )
        ) as card_payload
      from public.touchline_card_inventory as inventory
      join public.football_players as player
        on player.id = inventory.player_id
       and player.provider = 'sportmonks'
      join public.touchline_card_price_catalog as price
        on price.price_table_version = inventory.price_table_version
       and price.tier_key = inventory.competition_tier
      cross join lateral (
        select count(*)::integer as active_count
          from public.touchline_card_contracts as contract
         where contract.card_id = inventory.id
           and contract.status = 'active'
      ) as supply
      where inventory.club_id = target_club_id
        and inventory.card_status = 'published'
        and inventory.sale_status = 'available'
    ) as card;

  return jsonb_build_object(
    'ok', true,
    'source', 'supabase',
    'providerTeamId', requested_provider_team_id,
    'walletBalanceTc', balance_cents::numeric / 100,
    'activeContractCount', active_contract_count,
    'openContractSlots', greatest(35 - active_contract_count, 0),
    'cards', cards_payload
  );
end;
$$;

alter table public.touchline_player_market_value_history enable row level security;
grant select, insert on public.touchline_player_market_value_history to service_role;

revoke all on function public.resolve_touchline_player_market_tier(bigint)
  from public, anon, authenticated;
revoke all on function public.sync_touchline_inventory_market_value(uuid)
  from public, anon, authenticated;
revoke all on function public.sync_touchline_inventory_after_player_market_value()
  from public, anon, authenticated;
revoke all on function public.sync_touchline_market_value_after_inventory_insert()
  from public, anon, authenticated;
grant execute on function public.resolve_touchline_player_market_tier(bigint) to service_role;
grant execute on function public.sync_touchline_inventory_market_value(uuid) to service_role;
grant execute on function public.get_touchline_market_inventory(uuid, text) to service_role;

comment on column public.touchline_card_inventory.competition_tier is
  'Current economic player-card tier used only for future contracts. Historical purchase tier remains on touchline_card_contracts.';
comment on table public.touchline_player_market_value_history is
  'Append-style audit of authoritative EUR market-value changes and resulting current economic tier.';

commit;
