-- Canonical TouchLine Credit wallet integrity.
--
-- The historical column name `amount_cents` is retained for compatibility, but
-- its unit is now explicit: 100 ledger subunits = 1 TC. This ledger never stores
-- fiat money. All existing rows are therefore normalized without changing their
-- numeric amount, and every future write is forced to the canonical TC unit.

update public.clubowner_credit_ledger
   set currency = 'TC'
 where btrim(currency) <> 'TC';

alter table public.clubowner_credit_ledger
  alter column currency set default 'TC';

create or replace function public.normalize_touchline_credit_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.currency := 'TC';
  return new;
end;
$$;

drop trigger if exists clubowner_credit_ledger_canonical_currency
  on public.clubowner_credit_ledger;
create trigger clubowner_credit_ledger_canonical_currency
  before insert or update of currency on public.clubowner_credit_ledger
  for each row execute function public.normalize_touchline_credit_currency();

alter table public.clubowner_credit_ledger
  drop constraint if exists clubowner_credit_ledger_currency_tc_check;
alter table public.clubowner_credit_ledger
  add constraint clubowner_credit_ledger_currency_tc_check
  check (btrim(currency) = 'TC');

comment on column public.clubowner_credit_ledger.amount_cents is
  'TouchLine Credit subunits. 100 stored units equal 1 TC; this is not fiat currency.';
comment on column public.clubowner_credit_ledger.currency is
  'Canonical game-wallet unit. Always TC.';

-- Persist the owner boundary in the database without creating a public.users
-- (ClubOwner) profile. The application registers every email configured through
-- TOUCHLINE_OWNER_EMAILS before any profile/grant operation. The historical
-- default owner is also seeded here so already-deployed databases are repaired.
create table if not exists public.touchline_platform_owner_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  normalized_email text not null unique,
  registered_at timestamptz not null default now(),
  check (normalized_email = lower(trim(normalized_email)))
);

alter table public.touchline_platform_owner_accounts enable row level security;
revoke all on table public.touchline_platform_owner_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_platform_owner_accounts to service_role;

create or replace function public.register_touchline_platform_owner(
  requested_user_id uuid,
  requested_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authoritative_email text;
  beta_grant public.touchline_beta_tc_grants%rowtype;
  grant_ledger public.clubowner_credit_ledger%rowtype;
  reversal_ledger public.clubowner_credit_ledger%rowtype;
  grant_key text;
  reversal_key text;
  revoked_grant boolean := false;
begin
  if requested_user_id is null or requested_email is null or trim(requested_email) = '' then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_IDENTITY_REQUIRED';
  end if;

  select lower(trim(email))
    into authoritative_email
    from auth.users
   where id = requested_user_id;
  if authoritative_email is null
     or authoritative_email <> lower(trim(requested_email)) then
    raise exception using errcode = 'P0001', message = 'TL_OWNER_IDENTITY_MISMATCH';
  end if;

  -- Serialize owner registration against a concurrent Founding 20 claim.
  perform pg_advisory_xact_lock(hashtext('touchline-founding-20-2026'));

  insert into public.touchline_platform_owner_accounts(user_id, normalized_email)
  values (requested_user_id, authoritative_email)
  on conflict (user_id) do update
    set normalized_email = excluded.normalized_email;

  select *
    into beta_grant
    from public.touchline_beta_tc_grants
   where user_id = requested_user_id
   for update;

  if found then
    grant_key := 'touchline-beta-welcome:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text;
    reversal_key := 'touchline-beta-owner-reversal:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text;

    select *
      into grant_ledger
      from public.clubowner_credit_ledger
     where idempotency_key = grant_key
     for update;

    if found then
      if grant_ledger.user_id <> beta_grant.user_id
         or grant_ledger.amount_cents <> beta_grant.amount_tc * 100
         or btrim(grant_ledger.currency) <> 'TC'
         or grant_ledger.entry_type <> 'promotion' then
        raise exception using errcode = 'P0001', message = 'TL_OWNER_GRANT_LEDGER_CONFLICT';
      end if;

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
        beta_grant.user_id,
        -(beta_grant.amount_tc * 100),
        'TC',
        'reversal',
        'TouchLine owner account excluded from Founding 20',
        reversal_key,
        jsonb_build_object(
          'source', 'touchline_owner_exclusion',
          'campaignKey', beta_grant.campaign_key,
          'reverses', grant_key,
          'amountTc', beta_grant.amount_tc
        ),
        null
      )
      on conflict (idempotency_key) do nothing;

      select *
        into reversal_ledger
        from public.clubowner_credit_ledger
       where idempotency_key = reversal_key;
      if not found
         or reversal_ledger.user_id <> beta_grant.user_id
         or reversal_ledger.amount_cents <> -(beta_grant.amount_tc * 100)
         or btrim(reversal_ledger.currency) <> 'TC'
         or reversal_ledger.entry_type <> 'reversal' then
        raise exception using errcode = 'P0001', message = 'TL_OWNER_REVERSAL_IDEMPOTENCY_CONFLICT';
      end if;
    end if;

    -- balance_cents is only a compatibility mirror; the append-only ledger is
    -- authoritative. Avoid introducing a negative legacy mirror when repairing
    -- an installation whose old mirror was already inconsistent.
    update public.users
       set balance_cents = greatest(balance_cents - (beta_grant.amount_tc * 100), 0),
           updated_at = now()
     where id = beta_grant.user_id;

    delete from public.touchline_beta_tc_grants
     where id = beta_grant.id;
    revoked_grant := true;
  end if;

  return jsonb_build_object(
    'owner', true,
    'eligible', false,
    'grantRevoked', revoked_grant
  );
end;
$$;

-- Repair the default owner immediately. Additional configured owner emails are
-- registered by the shared server helper on their next authenticated request.
do $$
declare
  owner_user record;
begin
  for owner_user in
    select id, email
      from auth.users
     where lower(trim(email)) = 'luizeuropemalta@gmail.com'
  loop
    perform public.register_touchline_platform_owner(owner_user.id, owner_user.email);
  end loop;
end;
$$;

-- Repair missing non-owner Founding 20 ledger rows, then prove that an
-- idempotency collision did not silently attach the reserved key to another
-- user, value or unit.
insert into public.clubowner_credit_ledger (
  user_id,
  amount_cents,
  currency,
  entry_type,
  reason,
  idempotency_key,
  metadata,
  created_by,
  created_at
)
select
  beta_grant.user_id,
  beta_grant.amount_tc * 100,
  'TC',
  'promotion',
  'TouchLine Founding 20 beta grant',
  'touchline-beta-welcome:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text,
  jsonb_build_object(
    'source', 'touchline_beta_welcome',
    'campaignKey', beta_grant.campaign_key,
    'amountTc', beta_grant.amount_tc,
    'slot', beta_grant.slot_number
  ),
  null,
  beta_grant.granted_at
from public.touchline_beta_tc_grants as beta_grant
where not exists (
  select 1
    from public.touchline_platform_owner_accounts as owner_account
   where owner_account.user_id = beta_grant.user_id
)
on conflict (idempotency_key) do nothing;

do $$
begin
  if exists (
    select 1
      from public.touchline_beta_tc_grants as beta_grant
      left join public.clubowner_credit_ledger as ledger
        on ledger.idempotency_key =
          'touchline-beta-welcome:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text
     where ledger.id is null
        or ledger.user_id <> beta_grant.user_id
        or ledger.amount_cents <> beta_grant.amount_tc * 100
        or btrim(ledger.currency) <> 'TC'
        or ledger.entry_type <> 'promotion'
  ) then
    raise exception using errcode = 'P0001', message = 'TL_BETA_LEDGER_IDEMPOTENCY_CONFLICT';
  end if;
end;
$$;

create or replace function public.claim_touchline_beta_welcome_grant(requested_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  beta_grant public.touchline_beta_tc_grants%rowtype;
  grant_ledger public.clubowner_credit_ledger%rowtype;
  next_slot integer;
  grant_key text;
begin
  if requested_user_id is null then
    raise exception using errcode = 'P0001', message = 'TL_BETA_AUTH_REQUIRED';
  end if;

  -- The campaign intentionally allocates by successful claim order. Ranking by
  -- auth.users.created_at would let abandoned/unconfirmed accounts reserve all
  -- 20 slots indefinitely and requires a separate product expiration decision.
  perform pg_advisory_xact_lock(hashtext('touchline-founding-20-2026'));

  if exists (
    select 1
      from public.touchline_platform_owner_accounts
     where user_id = requested_user_id
  ) or exists (
    select 1
      from auth.users
     where id = requested_user_id
       and lower(trim(email)) = 'luizeuropemalta@gmail.com'
  ) then
    raise exception using errcode = 'P0001', message = 'TL_BETA_OWNER_EXCLUDED';
  end if;

  select *
    into beta_grant
    from public.touchline_beta_tc_grants
   where user_id = requested_user_id;
  if found then
    grant_key := 'touchline-beta-welcome:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text;

    insert into public.clubowner_credit_ledger (
      user_id,
      amount_cents,
      currency,
      entry_type,
      reason,
      idempotency_key,
      metadata,
      created_by,
      created_at
    ) values (
      beta_grant.user_id,
      beta_grant.amount_tc * 100,
      'TC',
      'promotion',
      'TouchLine Founding 20 beta grant',
      grant_key,
      jsonb_build_object(
        'source', 'touchline_beta_welcome',
        'campaignKey', beta_grant.campaign_key,
        'amountTc', beta_grant.amount_tc,
        'slot', beta_grant.slot_number
      ),
      null,
      beta_grant.granted_at
    )
    on conflict (idempotency_key) do nothing;

    select *
      into grant_ledger
      from public.clubowner_credit_ledger
     where idempotency_key = grant_key;
    if not found
       or grant_ledger.user_id <> beta_grant.user_id
       or grant_ledger.amount_cents <> beta_grant.amount_tc * 100
       or btrim(grant_ledger.currency) <> 'TC'
       or grant_ledger.entry_type <> 'promotion' then
      raise exception using errcode = 'P0001', message = 'TL_BETA_LEDGER_IDEMPOTENCY_CONFLICT';
    end if;

    return jsonb_build_object(
      'granted', true,
      'alreadyGranted', true,
      'slot', beta_grant.slot_number,
      'amountTc', beta_grant.amount_tc
    );
  end if;

  perform id from public.users where id = requested_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_BETA_USER_NOT_FOUND';
  end if;

  -- Pick the first free active slot so removing a wrongly granted owner does not
  -- permanently reduce the campaign below 20 ClubOwners.
  select candidate.slot_number
    into next_slot
    from generate_series(1, 20) as candidate(slot_number)
    left join public.touchline_beta_tc_grants as occupied
      on occupied.slot_number = candidate.slot_number
   where occupied.id is null
   order by candidate.slot_number
   limit 1;
  if next_slot is null then
    return jsonb_build_object('granted', false, 'campaignFull', true, 'amountTc', 0);
  end if;

  insert into public.touchline_beta_tc_grants (
    user_id,
    campaign_key,
    slot_number,
    amount_tc
  ) values (
    requested_user_id,
    'founding-20-2026',
    next_slot,
    35
  )
  returning * into beta_grant;

  update public.users
     set balance_cents = balance_cents + (beta_grant.amount_tc * 100),
         updated_at = now()
   where id = requested_user_id;

  grant_key := 'touchline-beta-welcome:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text;
  insert into public.clubowner_credit_ledger (
    user_id,
    amount_cents,
    currency,
    entry_type,
    reason,
    idempotency_key,
    metadata,
    created_by,
    created_at
  ) values (
    beta_grant.user_id,
    beta_grant.amount_tc * 100,
    'TC',
    'promotion',
    'TouchLine Founding 20 beta grant',
    grant_key,
    jsonb_build_object(
      'source', 'touchline_beta_welcome',
      'campaignKey', beta_grant.campaign_key,
      'amountTc', beta_grant.amount_tc,
      'slot', beta_grant.slot_number
    ),
    null,
    beta_grant.granted_at
  )
  on conflict (idempotency_key) do nothing;

  select *
    into grant_ledger
    from public.clubowner_credit_ledger
   where idempotency_key = grant_key;
  if not found
     or grant_ledger.user_id <> beta_grant.user_id
     or grant_ledger.amount_cents <> beta_grant.amount_tc * 100
     or btrim(grant_ledger.currency) <> 'TC'
     or grant_ledger.entry_type <> 'promotion' then
    raise exception using errcode = 'P0001', message = 'TL_BETA_LEDGER_IDEMPOTENCY_CONFLICT';
  end if;

  return jsonb_build_object(
    'granted', true,
    'alreadyGranted', false,
    'slot', beta_grant.slot_number,
    'amountTc', beta_grant.amount_tc
  );
end;
$$;

-- Replace the effective market functions installed by migrations 022/023. The
-- explicit currency predicate remains even though the table constraint enforces
-- TC, providing defense in depth if the ledger is ever widened in the future.
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
    select inventory.*, price.price_tc
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
   where user_id = requested_user_id
     and btrim(currency) = 'TC';
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
    'TC',
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
    select inventory.*, price.price_tc
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
   where ledger.user_id = requested_user_id
     and btrim(ledger.currency) = 'TC';

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

revoke all on function public.normalize_touchline_credit_currency() from public, anon, authenticated;
revoke all on function public.register_touchline_platform_owner(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_touchline_beta_welcome_grant(uuid) from public, anon, authenticated;
revoke all on function public.checkout_touchline_market_cart(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.get_touchline_market_inventory(uuid, text) from public, anon, authenticated;

grant execute on function public.register_touchline_platform_owner(uuid, text) to service_role;
grant execute on function public.claim_touchline_beta_welcome_grant(uuid) to service_role;
grant execute on function public.checkout_touchline_market_cart(uuid, uuid[], text) to service_role;
grant execute on function public.get_touchline_market_inventory(uuid, text) to service_role;
grant execute on function public.normalize_touchline_credit_currency() to service_role;

comment on function public.register_touchline_platform_owner(uuid, text) is
  'Persists the platform-owner boundary without creating a ClubOwner profile and reverses any historical Founding 20 credit.';
comment on function public.claim_touchline_beta_welcome_grant(uuid) is
  'Claims one of 20 Founding slots in successful-claim order and proves the canonical TC ledger row before returning success.';
