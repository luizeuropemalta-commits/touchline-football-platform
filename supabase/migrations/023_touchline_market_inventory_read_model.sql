-- Authoritative read model for the TouchLine Market.
-- SportMonks remains the sporting-data source. This function exposes only the
-- inventory, price, supply, ownership and wallet facts controlled by TouchLine.

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

  perform id
    from public.users
   where id = requested_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_USER_NOT_FOUND';
  end if;

  select club.id
    into target_club_id
    from public.football_clubs as club
   where club.provider = 'sportmonks'
     and club.provider_team_id = requested_provider_team_id
   limit 1;
  if target_club_id is null then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_CLUB_NOT_FOUND';
  end if;

  select coalesce(sum(ledger.amount_cents), 0)
    into balance_cents
    from public.clubowner_credit_ledger as ledger
   where ledger.user_id = requested_user_id;

  select count(*)
    into active_contract_count
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
          'supplyLimit', inventory.supply_limit,
          'soldCopies', supply.active_count,
          'availableCopies', greatest(inventory.supply_limit - supply.active_count, 0),
          'alreadyOwned', exists (
            select 1
              from public.touchline_card_contracts as owned
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

revoke all on function public.get_touchline_market_inventory(uuid, text) from public;
grant execute on function public.get_touchline_market_inventory(uuid, text) to service_role;

comment on function public.get_touchline_market_inventory(uuid, text) is
  'Returns the authenticated ClubOwner wallet and the authoritative price, supply and ownership state for one SportMonks club.';
