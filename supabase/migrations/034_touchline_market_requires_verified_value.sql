-- Fail closed when a future TouchLine player contract has no verified EUR
-- market value. Historical contracts and their immutable paid prices remain
-- untouched; this protects only new checkout order items.

begin;
set local lock_timeout = '5s';

create or replace function public.require_touchline_verified_market_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inventory public.touchline_card_inventory%rowtype;
begin
  select *
    into inventory
    from public.touchline_card_inventory
   where id = new.card_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_CARD_NOT_FOUND';
  end if;

  if inventory.market_value_eur is null
     or inventory.market_value_eur < 0
     or inventory.market_value_updated_at is null
     or nullif(btrim(inventory.market_value_source), '') is null then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_VALUE_PENDING';
  end if;

  if new.competition_tier <> inventory.competition_tier
     or new.unit_price_tc <> (
       select catalog.price_tc
         from public.touchline_card_price_catalog as catalog
        where catalog.price_table_version = inventory.price_table_version
          and catalog.tier_key = inventory.competition_tier
     ) then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_CURRENT_ECONOMY_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists touchline_market_order_item_verified_value
  on public.touchline_market_order_items;
create trigger touchline_market_order_item_verified_value
  before insert on public.touchline_market_order_items
  for each row
  execute function public.require_touchline_verified_market_value();

revoke all on function public.require_touchline_verified_market_value()
  from public, anon, authenticated;
grant execute on function public.require_touchline_verified_market_value()
  to service_role;

comment on function public.require_touchline_verified_market_value() is
  'Rejects new player-card checkout items until an authoritative EUR market value, timestamp and source have resolved the current tier and price.';

commit;
