-- Authoritative TouchLine Market contract release.
-- Releasing a contract does not refund TC. Ownership, roster capacity and
-- supply are all derived from active contracts, so one atomic active -> ended
-- transition releases those three resources without mutating catalog prices.

create table if not exists public.touchline_contract_release_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  contract_id uuid not null unique references public.touchline_card_contracts(id) on delete restrict,
  card_id uuid not null references public.touchline_card_inventory(id) on delete restrict,
  idempotency_key text not null,
  active_contract_count_after integer not null check (active_contract_count_after >= 0),
  active_supply_count_after integer not null check (active_supply_count_after >= 0),
  supply_limit integer not null check (supply_limit > 0),
  released_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists touchline_contract_release_operations_user_idx
  on public.touchline_contract_release_operations(user_id, released_at desc);

create index if not exists touchline_contract_release_operations_card_idx
  on public.touchline_contract_release_operations(card_id, released_at desc);

create or replace function public.release_touchline_card_contract(
  requested_user_id uuid,
  requested_card_id uuid,
  requested_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_release public.touchline_contract_release_operations%rowtype;
  active_contract public.touchline_card_contracts%rowtype;
  inventory public.touchline_card_inventory%rowtype;
  active_contract_count integer := 0;
  active_supply_count integer := 0;
  released_at_value timestamptz := now();
begin
  if requested_user_id is null then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_AUTH_REQUIRED';
  end if;
  if requested_card_id is null then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_RELEASE_INVALID_CARD_ID';
  end if;
  if requested_idempotency_key is null
     or length(trim(requested_idempotency_key)) < 8
     or length(trim(requested_idempotency_key)) > 120 then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_RELEASE_INVALID_IDEMPOTENCY_KEY';
  end if;

  -- Serialize every ownership mutation for this ClubOwner. This uses the same
  -- lock order as checkout: user first, inventory second, contract last.
  perform id
    from public.users
   where id = requested_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_USER_NOT_FOUND';
  end if;

  select *
    into existing_release
    from public.touchline_contract_release_operations
   where user_id = requested_user_id
     and idempotency_key = trim(requested_idempotency_key);
  if found then
    if existing_release.card_id <> requested_card_id then
      raise exception using errcode = 'P0001', message = 'TL_MARKET_RELEASE_IDEMPOTENCY_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'idempotentReplay', true,
      'contractId', existing_release.contract_id,
      'cardId', existing_release.card_id,
      'status', 'ended',
      'releasedAt', existing_release.released_at,
      'activeContractCount', existing_release.active_contract_count_after,
      'openContractSlots', greatest(35 - existing_release.active_contract_count_after, 0),
      'soldCopies', existing_release.active_supply_count_after,
      'availableCopies', greatest(existing_release.supply_limit - existing_release.active_supply_count_after, 0),
      'supplyLimit', existing_release.supply_limit,
      'refundTc', 0
    );
  end if;

  select *
    into inventory
    from public.touchline_card_inventory
   where id = requested_card_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_CARD_NOT_FOUND';
  end if;

  select *
    into active_contract
    from public.touchline_card_contracts
   where user_id = requested_user_id
     and card_id = requested_card_id
     and status = 'active'
   order by contracted_at desc, id desc
   limit 1
   for update;
  if not found then
    if exists (
      select 1
        from public.touchline_card_contracts
       where user_id = requested_user_id
         and card_id = requested_card_id
    ) then
      raise exception using errcode = 'P0001', message = 'TL_MARKET_CONTRACT_NOT_ACTIVE';
    end if;
    raise exception using errcode = 'P0001', message = 'TL_MARKET_CONTRACT_NOT_FOUND';
  end if;

  update public.touchline_card_contracts
     set status = 'ended',
         ended_at = released_at_value,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'releaseIdempotencyKey', trim(requested_idempotency_key),
           'releaseSource', 'clubowner'
         )
   where id = active_contract.id
     and user_id = requested_user_id
     and status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_MARKET_CONTRACT_NOT_ACTIVE';
  end if;

  select count(*)
    into active_contract_count
    from public.touchline_card_contracts
   where user_id = requested_user_id
     and status = 'active';

  select count(*)
    into active_supply_count
    from public.touchline_card_contracts
   where card_id = requested_card_id
     and status = 'active';

  insert into public.touchline_contract_release_operations (
    user_id,
    contract_id,
    card_id,
    idempotency_key,
    active_contract_count_after,
    active_supply_count_after,
    supply_limit,
    released_at
  ) values (
    requested_user_id,
    active_contract.id,
    requested_card_id,
    trim(requested_idempotency_key),
    active_contract_count,
    active_supply_count,
    inventory.supply_limit,
    released_at_value
  );

  return jsonb_build_object(
    'ok', true,
    'idempotentReplay', false,
    'contractId', active_contract.id,
    'cardId', requested_card_id,
    'status', 'ended',
    'releasedAt', released_at_value,
    'activeContractCount', active_contract_count,
    'openContractSlots', greatest(35 - active_contract_count, 0),
    'soldCopies', active_supply_count,
    'availableCopies', greatest(inventory.supply_limit - active_supply_count, 0),
    'supplyLimit', inventory.supply_limit,
    'refundTc', 0
  );
end;
$$;

alter table public.touchline_contract_release_operations enable row level security;

revoke all on function public.release_touchline_card_contract(uuid, uuid, text)
  from public, anon, authenticated;

grant select on public.touchline_contract_release_operations to service_role;
grant execute on function public.release_touchline_card_contract(uuid, uuid, text)
  to service_role;

comment on function public.release_touchline_card_contract(uuid, uuid, text) is
  'Idempotently ends the authenticated ClubOwner active card contract without refunding TC, releasing ownership, one roster slot and one active supply copy.';
