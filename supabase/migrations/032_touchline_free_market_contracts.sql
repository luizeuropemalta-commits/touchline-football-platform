-- Enable zero-TC player contracts without weakening the append-only wallet.
--
-- Historical price-table versions and contracts are immutable snapshots. This
-- migration registers the approved Premier League policy for future inventory
-- updates, but deliberately does not rewrite inventory, supply or contracts.

begin;
set local lock_timeout = '5s';

alter table public.touchline_card_price_catalog
  drop constraint if exists touchline_card_price_catalog_price_tc_check;
alter table public.touchline_card_price_catalog
  add constraint touchline_card_price_catalog_price_tc_check
  check (price_tc >= 0);

alter table public.touchline_market_orders
  drop constraint if exists touchline_market_orders_total_tc_check;
alter table public.touchline_market_orders
  add constraint touchline_market_orders_total_tc_check
  check (total_tc >= 0);

alter table public.touchline_market_order_items
  drop constraint if exists touchline_market_order_items_unit_price_tc_check;
alter table public.touchline_market_order_items
  add constraint touchline_market_order_items_unit_price_tc_check
  check (unit_price_tc >= 0);

alter table public.touchline_card_contracts
  drop constraint if exists touchline_card_contracts_purchase_price_tc_check;
alter table public.touchline_card_contracts
  add constraint touchline_card_contracts_purchase_price_tc_check
  check (purchase_price_tc >= 0);

insert into public.touchline_card_price_catalog (
  price_table_version,
  tier_key,
  price_tc
) values
  ('2026-07-premier-v1', 'ruby-red', 0),
  ('2026-07-premier-v1', 'sapphire-blue', 1),
  ('2026-07-premier-v1', 'amethyst-purple', 2),
  ('2026-07-premier-v1', 'radiant-gold', 4),
  ('2026-07-premier-v1', 'emerald-green', 7),
  ('2026-07-premier-v1', 'clear-diamond', 10),
  ('2026-07-premier-v1', 'diamond-gold', 15)
on conflict (price_table_version, tier_key) do nothing;

-- A versioned table is immutable. If a partial or conflicting seed already
-- exists, fail the migration instead of silently accepting the wrong economy.
do $$
begin
  if (
    select count(*)
      from public.touchline_card_price_catalog
     where price_table_version = '2026-07-premier-v1'
  ) <> 7 or exists (
    with expected(tier_key, price_tc) as (
      values
        ('ruby-red', 0),
        ('sapphire-blue', 1),
        ('amethyst-purple', 2),
        ('radiant-gold', 4),
        ('emerald-green', 7),
        ('clear-diamond', 10),
        ('diamond-gold', 15)
    )
    select 1
      from expected
      left join public.touchline_card_price_catalog as actual
        on actual.price_table_version = '2026-07-premier-v1'
       and actual.tier_key = expected.tier_key
     where actual.tier_key is null
        or actual.price_tc <> expected.price_tc
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'TL_MARKET_PRICE_TABLE_CONFLICT_2026_07_PREMIER_V1';
  end if;
end;
$$;

-- The canonical ledger rejects zero-value entries by design. A FREE contract
-- still creates an order, order item and immutable contract snapshot, but its
-- zero debit must not become a fake financial transaction.
create or replace function public.skip_touchline_zero_purchase_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_order public.touchline_market_orders%rowtype;
  linked_order_id uuid;
begin
  if new.entry_type = 'purchase_use'
     and new.amount_cents = 0
     and btrim(new.currency) = 'TC' then
    begin
      linked_order_id := nullif(new.metadata ->> 'orderId', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'TL_MARKET_FREE_LEDGER_INVALID_ORDER';
    end;

    select *
      into linked_order
      from public.touchline_market_orders
     where id = linked_order_id;

    if not found
       or linked_order.user_id <> new.user_id
       or linked_order.status <> 'completed'
       or linked_order.total_tc <> 0
       or new.idempotency_key <>
         'touchline-market:' || linked_order.user_id::text || ':' || linked_order.idempotency_key
       or coalesce((new.metadata ->> 'totalTc')::integer, -1) <> 0
       or coalesce((new.metadata ->> 'itemCount')::integer, -1) <> linked_order.item_count then
      raise exception using errcode = 'P0001', message = 'TL_MARKET_FREE_LEDGER_MISMATCH';
    end if;

    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists clubowner_credit_ledger_skip_zero_purchase
  on public.clubowner_credit_ledger;
create trigger clubowner_credit_ledger_skip_zero_purchase
  before insert on public.clubowner_credit_ledger
  for each row
  execute function public.skip_touchline_zero_purchase_ledger();

revoke all on function public.skip_touchline_zero_purchase_ledger()
  from public, anon, authenticated;
grant execute on function public.skip_touchline_zero_purchase_ledger()
  to service_role;

comment on function public.skip_touchline_zero_purchase_ledger() is
  'Skips only a zero-TC debit proven to match an existing canonical FREE order, user and idempotency key. Other zero ledger writes fail normally.';

-- The game wallet is append-only to every application role. Administrative
-- corrections use compensating rows rather than rewriting financial history.
revoke update, delete, truncate on table public.clubowner_credit_ledger
  from service_role;

comment on column public.touchline_card_contracts.purchase_price_tc is
  'Immutable TC price paid when the contract was created, including 0 for a FREE contract. Later market changes never rewrite this value.';

commit;
