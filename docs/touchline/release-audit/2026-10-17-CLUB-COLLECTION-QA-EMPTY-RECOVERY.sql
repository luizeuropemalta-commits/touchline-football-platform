-- QA-only forward repair template. NOT applied. Acquisition must be OFF.
-- Valid only before ANY collection account or operation exists.
-- Never delete migration history or collection tables; after data exists, freeze and repair forward.
begin;
set local lock_timeout='5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
lock table public.touchline_club_collections, public.touchline_club_collection_operations in access exclusive mode;
do $guard$
begin
  if exists(select 1 from public.touchline_club_collections) or exists(select 1 from public.touchline_club_collection_operations) then
    raise exception 'CLUB_RECOVERY_REQUIRES_EMPTY_COLLECTION';
  end if;
end;
$guard$;
CREATE OR REPLACE FUNCTION public.checkout_touchline_market_cart(requested_user_id uuid, requested_card_ids uuid[], requested_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

;
CREATE OR REPLACE FUNCTION public.touchline_fantasy_lock_gameweek(p_gameweek_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gameweek public.touchline_fantasy_gameweeks%rowtype;
  v_locked integer := 0;
  v_effective_locks_at timestamptz;
  v_lock_observed_at timestamptz;
  v_confirmed_user_id uuid;
  v_rejected_user_ids uuid[] := array[]::uuid[];
begin
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-lock:' || p_gameweek_id::text, 0));
  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id for update;
  if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;
  -- Provider live/final observations outrank a stale future kickoff.
  if clock_timestamp() < v_gameweek.locks_at and not exists (
    select 1 from public.football_fixtures fixture
    where fixture.round_id = v_gameweek.round_id
      and (public.touchline_fantasy_fixture_is_live(fixture.status)
        or public.touchline_fantasy_fixture_is_final(fixture.status))
  ) then return jsonb_build_object('ok', false, 'reason', 'market-open'); end if;
  v_effective_locks_at := least(v_gameweek.locks_at, clock_timestamp());
  update public.touchline_fantasy_gameweeks set state = case
    when state in ('FINAL', 'SETTLED') then state
    when exists (select 1 from public.football_fixtures fixture where fixture.round_id = v_gameweek.round_id
      and public.touchline_fantasy_fixture_is_live(fixture.status)) then 'LIVE' else 'LOCKED' end
  where id = p_gameweek_id;

  -- This is the same per-user mutex used by entitlement grant and
  -- provider-event writers. Acquire it in user-id order, then observe one
  -- entitlement instant used by both locked-row writes and the state change.
  for v_confirmed_user_id in
    select distinct user_gameweek.user_id
    from public.touchline_fantasy_user_gameweeks user_gameweek
    where user_gameweek.gameweek_id = p_gameweek_id
      and user_gameweek.state = 'CONFIRMED'
    order by user_gameweek.user_id
  loop
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'touchline-fantasy-subscription:' || v_confirmed_user_id::text, 0
    ));
  end loop;
  v_lock_observed_at := clock_timestamp();

  insert into public.touchline_fantasy_locked_selections (
    user_gameweek_id, slot_id, slot_index, player_id, club_id, formation_role, position_bucket, market_value_eur, locked_at
  ) select user_gameweek.id, selection.slot_id, selection.slot_index, selection.player_id,
    selection.club_id, selection.formation_role, selection.position_bucket, selection.market_value_eur, v_effective_locks_at
  from public.touchline_fantasy_user_gameweeks user_gameweek
  join public.touchline_fantasy_user_gameweek_selections selection on selection.user_gameweek_id = user_gameweek.id
  where user_gameweek.gameweek_id = p_gameweek_id and user_gameweek.state = 'CONFIRMED'
    and user_gameweek.selected_coach_id is not null
    and (select count(*) from public.touchline_fantasy_user_gameweek_selections check_selection
      where check_selection.user_gameweek_id = user_gameweek.id) = 11
    and user_gameweek.market_plan_key_snapshot in ('beta', 'standard', 'pro', 'master', 'vip')
    and case user_gameweek.market_plan_key_snapshot
      when 'beta' then user_gameweek.budget_eur_snapshot = 50000000
      when 'standard' then user_gameweek.budget_eur_snapshot = 400000000
      when 'pro' then user_gameweek.budget_eur_snapshot = 650000000
      when 'master' then user_gameweek.budget_eur_snapshot = 850000000
      when 'vip' then user_gameweek.budget_eur_snapshot = 1000000000
      else false
    end
    and ((
      select coalesce(sum(current_selection.market_value_eur), 0)
      from public.touchline_fantasy_user_gameweek_selections current_selection
      where current_selection.user_gameweek_id = user_gameweek.id
    ) <= case user_gameweek.market_plan_key_snapshot
      when 'beta' then 50000000
      when 'standard' then 400000000
      when 'pro' then 650000000
      when 'master' then 850000000
      when 'vip' then 1000000000
    end)
    and exists (
      select 1
      from public.touchline_fantasy_entitlements entitlement
      where entitlement.user_id = user_gameweek.user_id
        and entitlement.entitlement_key = 'fantasy_access'
        and entitlement.status = 'active'
        and entitlement.plan_key = user_gameweek.market_plan_key_snapshot
        and (entitlement.current_period_start is null or entitlement.current_period_start <= v_lock_observed_at)
        and (entitlement.current_period_end is null or entitlement.current_period_end > v_lock_observed_at)
    )
  on conflict do nothing;
  get diagnostics v_locked = row_count;

  update public.touchline_fantasy_user_gameweeks user_gameweek
  set state = 'LOCKED', locked_coach_id = selected_coach_id, locked_at = v_effective_locks_at
  where user_gameweek.gameweek_id = p_gameweek_id and user_gameweek.state = 'CONFIRMED'
    and user_gameweek.selected_coach_id is not null
    and (select count(*) from public.touchline_fantasy_locked_selections locked
      where locked.user_gameweek_id = user_gameweek.id) = 11
    and user_gameweek.market_plan_key_snapshot in ('beta', 'standard', 'pro', 'master', 'vip')
    and case user_gameweek.market_plan_key_snapshot
      when 'beta' then user_gameweek.budget_eur_snapshot = 50000000
      when 'standard' then user_gameweek.budget_eur_snapshot = 400000000
      when 'pro' then user_gameweek.budget_eur_snapshot = 650000000
      when 'master' then user_gameweek.budget_eur_snapshot = 850000000
      when 'vip' then user_gameweek.budget_eur_snapshot = 1000000000
      else false
    end
    and ((
      select coalesce(sum(current_selection.market_value_eur), 0)
      from public.touchline_fantasy_user_gameweek_selections current_selection
      where current_selection.user_gameweek_id = user_gameweek.id
    ) <= case user_gameweek.market_plan_key_snapshot
      when 'beta' then 50000000
      when 'standard' then 400000000
      when 'pro' then 650000000
      when 'master' then 850000000
      when 'vip' then 1000000000
    end)
    and exists (
      select 1
      from public.touchline_fantasy_entitlements entitlement
      where entitlement.user_id = user_gameweek.user_id
        and entitlement.entitlement_key = 'fantasy_access'
        and entitlement.status = 'active'
        and entitlement.plan_key = user_gameweek.market_plan_key_snapshot
        and (entitlement.current_period_start is null or entitlement.current_period_start <= v_lock_observed_at)
        and (entitlement.current_period_end is null or entitlement.current_period_end > v_lock_observed_at)
    );

  -- Do not leave a known-ineligible confirmation able to block the whole
  -- game's reconciliation. DRAFT is an existing non-scoring state and market
  -- closure blocks edits/reconfirmation; LOCKED/FINAL snapshots are untouched.
  with rejected as (
    update public.touchline_fantasy_user_gameweeks user_gameweek
    set state = 'DRAFT'
    where user_gameweek.gameweek_id = p_gameweek_id
      and user_gameweek.state = 'CONFIRMED'
    returning user_gameweek.user_id
  )
  select coalesce(array_agg(rejected.user_id), array[]::uuid[])
    into v_rejected_user_ids
  from rejected;

  insert into public.touchline_fantasy_audit_events (user_id, gameweek_id, event_type, metadata)
  select user_gameweek.user_id, p_gameweek_id, 'XI_LOCKED',
    jsonb_build_object('lockedAt', v_effective_locks_at, 'selectedCoachId', user_gameweek.locked_coach_id)
  from public.touchline_fantasy_user_gameweeks user_gameweek
  where user_gameweek.gameweek_id = p_gameweek_id and user_gameweek.state = 'LOCKED'
    and not exists (select 1 from public.touchline_fantasy_audit_events audit
      where audit.user_id = user_gameweek.user_id and audit.gameweek_id = p_gameweek_id and audit.event_type = 'XI_LOCKED');
  insert into public.touchline_fantasy_audit_events (user_id, gameweek_id, event_type, metadata)
  select rejected.user_id, p_gameweek_id, 'XI_REJECTED',
    jsonb_build_object(
      'beforeState', 'CONFIRMED',
      'observedAt', v_lock_observed_at,
      'reason', 'LOCK_ELIGIBILITY_REJECTED'
    )
  from unnest(v_rejected_user_ids) as rejected(user_id)
  where not exists (select 1 from public.touchline_fantasy_audit_events audit
      where audit.user_id = rejected.user_id and audit.gameweek_id = p_gameweek_id
        and audit.event_type = 'XI_REJECTED');
  return jsonb_build_object('ok', true, 'lockedSelectionRows', v_locked);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.touchline_fantasy_prepare_user_gameweek(p_user_id uuid, p_gameweek_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gameweek public.touchline_fantasy_gameweeks%rowtype;
  v_config public.touchline_fantasy_configs%rowtype;
  v_existing uuid;
  v_previous public.touchline_fantasy_user_gameweeks%rowtype;
  v_plan_key text;
  v_effective_budget bigint;
  v_beta_carry_allowed boolean := false;
  v_beta_carry_rows jsonb;
  v_beta_geometry jsonb;
begin
  if not public.touchline_fantasy_entitlement_is_active(p_user_id) then
    raise exception 'TL_FANTASY_ENTITLEMENT_REQUIRED';
  end if;
  perform public.touchline_fantasy_sync_gameweeks();
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_gameweek_id::text, 0));
  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id;
  if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;
  select * into v_config from public.touchline_fantasy_configs
   where competition_id = v_gameweek.competition_id and season_id = v_gameweek.season_id and status = 'active';
  if v_config.id is null then raise exception 'TL_FANTASY_CONFIG_NOT_FOUND'; end if;
  select entitlement.plan_key into v_plan_key
  from public.touchline_fantasy_entitlements entitlement
  where entitlement.user_id = p_user_id
    and entitlement.entitlement_key = 'fantasy_access'
    and entitlement.status = 'active'
    and (entitlement.current_period_start is null or entitlement.current_period_start <= clock_timestamp())
    and (entitlement.current_period_end is null or entitlement.current_period_end > clock_timestamp())
  for share;
  if not found then raise exception 'TL_FANTASY_ENTITLEMENT_REQUIRED'; end if;
  if v_plan_key is null or v_plan_key not in ('beta', 'standard', 'pro', 'master', 'vip') then
    raise exception 'TL_FANTASY_PLAN_INVALID';
  end if;
  v_effective_budget := case
    when v_plan_key = 'beta' then 50000000
    when v_plan_key = 'standard' then 400000000
    when v_plan_key = 'pro' then 650000000
    when v_plan_key = 'master' then 850000000
    when v_plan_key = 'vip' then 1000000000 end;
  select id into v_existing from public.touchline_fantasy_user_gameweeks
   where user_id = p_user_id and gameweek_id = p_gameweek_id;
  if v_existing is not null then return v_existing; end if;
  if v_gameweek.state <> 'MARKET_OPEN' or clock_timestamp() >= v_gameweek.locks_at then
    raise exception 'TL_FANTASY_GAMEWEEK_LOCKED';
  end if;

  -- An existing draft returned above is always preserved. A new draft may
  -- never silently skip a confirmed predecessor whose XI has not been locked.
  perform user_gameweek.id
  from public.touchline_fantasy_user_gameweeks user_gameweek
  join public.touchline_fantasy_gameweeks gameweek on gameweek.id = user_gameweek.gameweek_id
  where user_gameweek.user_id = p_user_id and gameweek.season_id = v_gameweek.season_id
    and gameweek.gameweek_number < v_gameweek.gameweek_number
    and user_gameweek.state = 'CONFIRMED'
  order by gameweek.gameweek_number
  for update of user_gameweek;
  if exists (
    select 1 from public.touchline_fantasy_user_gameweeks user_gameweek
    join public.touchline_fantasy_gameweeks gameweek on gameweek.id = user_gameweek.gameweek_id
    where user_gameweek.user_id = p_user_id and gameweek.season_id = v_gameweek.season_id
      and gameweek.gameweek_number < v_gameweek.gameweek_number
      and user_gameweek.state = 'CONFIRMED'
  ) then
    raise exception 'TL_FANTASY_PREDECESSOR_NOT_LOCKED';
  end if;

  select user_gameweek.* into v_previous
  from public.touchline_fantasy_user_gameweeks user_gameweek
  join public.touchline_fantasy_gameweeks gameweek on gameweek.id = user_gameweek.gameweek_id
  where user_gameweek.user_id = p_user_id
    and gameweek.season_id = v_gameweek.season_id
    and gameweek.gameweek_number < v_gameweek.gameweek_number
    and exists (
      select 1 from public.touchline_fantasy_locked_selections locked
      where locked.user_gameweek_id = user_gameweek.id
    )
  order by gameweek.gameweek_number desc
  limit 1;

  insert into public.touchline_fantasy_user_gameweeks (
    user_id, gameweek_id, formation_code, selected_coach_id, state,
    budget_eur_snapshot, market_plan_key_snapshot, max_players_per_club_snapshot, carry_source_user_gameweek_id
  ) values (
    p_user_id, p_gameweek_id, coalesce(v_previous.formation_code, '4-3-3'),
    coalesce(v_previous.locked_coach_id, v_previous.selected_coach_id), 'DRAFT',
    v_effective_budget, v_plan_key, v_config.max_players_per_club, v_previous.id
  ) returning id into v_existing;

  if v_previous.id is not null then
    -- Carry an entire legal XI into a new DRAFT, never reconfirm it. If any
    -- selection no longer fits the current policy, do not choose replacements
    -- or discard arbitrary players. The immutable predecessor is never edited.
    select geometry into v_beta_geometry from public.touchline_formation_geometry_versions
      where formation_code = coalesce(v_previous.formation_code, '4-3-3') and status = 'published'
      order by geometry_version desc limit 1;
    with eligible as (
      select distinct on (player.id) player.id player_id, membership.club_id, value.market_value_eur,
        public.touchline_fantasy_position_bucket(coalesce(membership.detailed_position, membership.position,
          player.detailed_position, player.position)) position_bucket
      from public.touchline_card_publications publication
      join public.football_player_market_values value on value.id = publication.market_value_id and value.player_id = publication.player_id
      join public.football_players player on player.id = publication.player_id
      join public.football_squad_members membership on membership.id = publication.current_membership_id and membership.player_id = player.id
      join public.football_clubs policy_club on policy_club.id = membership.club_id
      where publication.publication_status = 'published'
        and value.status = 'verified' and value.confidence = 'verified' and value.market_value_eur is not null
        and membership.status = 'active' and membership.club_id = player.current_club_id
        and membership.provider = 'sportmonks' and player.provider = 'sportmonks'
        and player.provider_player_id::text ~ '^[1-9][0-9]*$'
        and policy_club.provider = 'sportmonks'
        and (v_plan_key is distinct from 'beta' or policy_club.provider_team_id::text = any(array['22','117','116','52']::text[]))
        and exists (select 1 from public.touchline_fantasy_locked_selections predecessor
          where predecessor.user_gameweek_id = v_previous.id and predecessor.player_id = player.id)
      order by player.id, publication.published_at desc nulls last
    ), resolved as (
      select locked.slot_id, locked.slot_index, locked.player_id, eligible.club_id, eligible.market_value_eur,
        eligible.position_bucket, slot.value ->> 'role' formation_role,
        coalesce(slot.value ->> 'priority' = locked.slot_index::text, false) priority_matches,
        exists (select 1 from jsonb_array_elements_text(
          case when jsonb_typeof(slot.value -> 'allowedPositions') = 'array' then slot.value -> 'allowedPositions' else '[]'::jsonb end
        ) allowed(value) where allowed.value = eligible.position_bucket) position_allowed
      from public.touchline_fantasy_locked_selections locked
      left join eligible on eligible.player_id = locked.player_id
      left join lateral (
        select value from jsonb_array_elements(
          case when jsonb_typeof(v_beta_geometry -> 'slots') = 'array' then v_beta_geometry -> 'slots' else '[]'::jsonb end
        ) candidate(value) where candidate.value ->> 'id' = locked.slot_id limit 1
      ) slot on true
      where locked.user_gameweek_id = v_previous.id
    )
    select count(*) = 11 and count(distinct player_id) = 11 and count(distinct slot_id) = 11
        and coalesce(bool_and(club_id is not null and market_value_eur is not null and market_value_eur >= 0
          and position_bucket is not null and formation_role is not null and priority_matches and position_allowed), false)
        and (v_effective_budget is null or coalesce(sum(market_value_eur), 0) <= v_effective_budget)
        and coalesce((select max(n) from (select count(*) n from resolved where club_id is not null group by club_id) clubs), 0) <= 11,
      jsonb_agg(jsonb_build_object('slot_id',slot_id,'slot_index',slot_index,'player_id',player_id,'club_id',club_id,
        'formation_role',formation_role,'position_bucket',position_bucket,'market_value_eur',market_value_eur) order by slot_index)
      into v_beta_carry_allowed, v_beta_carry_rows
    from resolved;
    if v_beta_carry_allowed then
      insert into public.touchline_fantasy_user_gameweek_selections
        (user_gameweek_id,slot_id,slot_index,player_id,club_id,formation_role,position_bucket,market_value_eur)
      select v_existing, candidate.slot_id, candidate.slot_index, candidate.player_id, candidate.club_id,
        candidate.formation_role, candidate.position_bucket, candidate.market_value_eur
      from jsonb_to_recordset(v_beta_carry_rows) as candidate(slot_id text,slot_index integer,player_id uuid,club_id uuid,
        formation_role text,position_bucket text,market_value_eur bigint);
      update public.touchline_fantasy_user_gameweeks set total_market_value_eur = coalesce((
        select sum(selection.market_value_eur) from public.touchline_fantasy_user_gameweek_selections selection
        where selection.user_gameweek_id = v_existing
      ),0) where id = v_existing;
    end if;
  elsif v_previous.id is not null then
    insert into public.touchline_fantasy_user_gameweek_selections (
      user_gameweek_id, slot_id, slot_index, player_id, club_id,
      formation_role, position_bucket, market_value_eur
    )
    select v_existing, locked.slot_id, locked.slot_index, locked.player_id, locked.club_id,
      locked.formation_role, locked.position_bucket, locked.market_value_eur
    from public.touchline_fantasy_locked_selections locked
    where locked.user_gameweek_id = v_previous.id
    order by locked.slot_index;
    update public.touchline_fantasy_user_gameweeks
       set total_market_value_eur = coalesce((
         select sum(selection.market_value_eur)
         from public.touchline_fantasy_user_gameweek_selections selection
         where selection.user_gameweek_id = v_existing
       ), 0)
     where id = v_existing;
  end if;
  return v_existing;
end;
$function$

;
CREATE OR REPLACE FUNCTION public.touchline_fantasy_save_lineup(p_user_id uuid, p_gameweek_id uuid, p_selected_coach_id text, p_formation_code text, p_selections jsonb, p_action text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gameweek public.touchline_fantasy_gameweeks%rowtype;
  v_config public.touchline_fantasy_configs%rowtype;
  v_user_gameweek_id uuid;
  v_geometry jsonb;
  v_count integer;
  v_invalid integer;
  v_total bigint;
  v_max_club integer;
  v_plan_key text;
  v_effective_budget bigint;
  v_allowed_team_ids text[];
begin
  if p_action not in ('draft', 'confirm') then raise exception 'TL_FANTASY_ACTION_INVALID'; end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then raise exception 'TL_FANTASY_IDEMPOTENCY_REQUIRED'; end if;
  if jsonb_typeof(p_selections) <> 'array' then raise exception 'TL_FANTASY_SELECTIONS_INVALID'; end if;
  if p_selected_coach_id is null or not (p_selected_coach_id = any(array[
    '307','455907','29710','255','37679','511','95','37732840','455355','515',
    '74546','270','460535','19960388','107439','645','523911','51518','529482','127889'
  ]::text[])) then raise exception 'TL_FANTASY_COACH_INVALID'; end if;
  if not public.touchline_fantasy_entitlement_is_active(p_user_id) then raise exception 'TL_FANTASY_ENTITLEMENT_REQUIRED'; end if;

  perform public.touchline_fantasy_sync_gameweeks();
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_gameweek_id::text, 0));
  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id for update;
  if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;
  if v_gameweek.state <> 'MARKET_OPEN' or clock_timestamp() >= v_gameweek.locks_at then raise exception 'TL_FANTASY_GAMEWEEK_LOCKED'; end if;
  select * into v_config from public.touchline_fantasy_configs
   where competition_id = v_gameweek.competition_id and season_id = v_gameweek.season_id and status = 'active';
  if v_config.id is null then raise exception 'TL_FANTASY_CONFIG_NOT_FOUND'; end if;
  select entitlement.plan_key into v_plan_key
  from public.touchline_fantasy_entitlements entitlement
  where entitlement.user_id = p_user_id
    and entitlement.entitlement_key = 'fantasy_access'
    and entitlement.status = 'active'
    and (entitlement.current_period_start is null or entitlement.current_period_start <= clock_timestamp())
    and (entitlement.current_period_end is null or entitlement.current_period_end > clock_timestamp())
  for share;
  if not found then raise exception 'TL_FANTASY_ENTITLEMENT_REQUIRED'; end if;
  if v_plan_key is null or v_plan_key not in ('beta', 'standard', 'pro', 'master', 'vip') then
    raise exception 'TL_FANTASY_PLAN_INVALID';
  end if;
  v_effective_budget := case
    when v_plan_key = 'beta' then 50000000
    when v_plan_key = 'standard' then 400000000
    when v_plan_key = 'pro' then 650000000
    when v_plan_key = 'master' then 850000000
    when v_plan_key = 'vip' then 1000000000 end;
  v_allowed_team_ids := case when v_plan_key = 'beta' then array['22','117','116','52']::text[] else null end;
  select geometry into v_geometry from public.touchline_formation_geometry_versions
   where formation_code = p_formation_code and status = 'published'
   order by geometry_version desc limit 1;
  if v_geometry is null then raise exception 'TL_FANTASY_FORMATION_NOT_PUBLISHED'; end if;

  select count(*), count(distinct item."playerId"), count(distinct item."slotId")
    into v_count, v_invalid, v_max_club
  from jsonb_to_recordset(p_selections) as item("playerId" text, "slotId" text);
  if v_count > 11 or v_count <> v_invalid or v_count <> v_max_club then raise exception 'TL_FANTASY_SELECTION_DUPLICATE_OR_OVERSIZED'; end if;
  if p_action = 'confirm' and v_count <> 11 then raise exception 'TL_FANTASY_XI_REQUIRES_11'; end if;

  with requested as (
    select item."playerId"::uuid player_id, item."slotId" slot_id
    from jsonb_to_recordset(p_selections) as item("playerId" text, "slotId" text)
    where item."playerId" ~* '^[0-9a-f-]{36}$' and length(btrim(item."slotId")) between 1 and 24
  ), eligible as (
    select distinct on (player.id) player.id player_id, membership.club_id, value.market_value_eur,
      public.touchline_fantasy_position_bucket(coalesce(membership.detailed_position, membership.position, player.detailed_position, player.position)) position_bucket
    from public.touchline_card_publications publication
    join public.football_player_market_values value on value.id = publication.market_value_id
    join public.football_players player on player.id = publication.player_id
    join public.football_squad_members membership on membership.id = publication.current_membership_id
    where publication.publication_status = 'published'
      and value.status = 'verified' and value.confidence = 'verified' and value.market_value_eur is not null
      and membership.status = 'active' and membership.club_id = player.current_club_id
      and (v_plan_key is distinct from 'beta' or exists (
        select 1 from public.football_clubs policy_club
        where policy_club.id = membership.club_id
          and policy_club.provider = 'sportmonks'
          and policy_club.provider_team_id::text = any(v_allowed_team_ids)
      ))
    order by player.id, publication.published_at desc nulls last
  ), resolved as (
    select requested.*, eligible.club_id, eligible.market_value_eur, eligible.position_bucket,
      slot.value ->> 'role' formation_role,
      exists (select 1 from jsonb_array_elements_text(coalesce(slot.value -> 'allowedPositions', '[]'::jsonb)) allowed(value)
        where allowed.value = eligible.position_bucket) position_allowed
    from requested left join eligible on eligible.player_id = requested.player_id
    left join lateral (select value from jsonb_array_elements(v_geometry -> 'slots') candidate(value)
      where candidate.value ->> 'id' = requested.slot_id limit 1) slot on true
  )
  select count(*) filter (where club_id is null or market_value_eur is null or position_bucket is null
      or formation_role is null or not position_allowed) + (v_count - count(*)),
    coalesce(sum(market_value_eur), 0),
    coalesce((select max(n) from (select club_id, count(*) n from resolved where club_id is not null group by club_id) clubs), 0)
  into v_invalid, v_total, v_max_club from resolved;
  if v_invalid > 0 then raise exception 'TL_FANTASY_SELECTION_INELIGIBLE'; end if;
  if v_effective_budget is not null and v_total > v_effective_budget then raise exception 'TL_FANTASY_BUDGET_EXCEEDED'; end if;
  null; -- Club selection is customer-owned; there is no per-club cap.

  insert into public.touchline_fantasy_user_gameweeks (
    user_id, gameweek_id, selected_coach_id, formation_code, state, budget_eur_snapshot, market_plan_key_snapshot,
    max_players_per_club_snapshot, total_market_value_eur, last_idempotency_key, confirmed_at
  ) values (
    p_user_id, p_gameweek_id, p_selected_coach_id, p_formation_code,
    case when p_action = 'confirm' then 'CONFIRMED' else 'DRAFT' end,
    v_effective_budget, v_plan_key, v_config.max_players_per_club, v_total, p_idempotency_key,
    case when p_action = 'confirm' then now() else null end
  ) on conflict (user_id, gameweek_id) do update set
    selected_coach_id = excluded.selected_coach_id, formation_code = excluded.formation_code,
    state = excluded.state, budget_eur_snapshot = excluded.budget_eur_snapshot,
    market_plan_key_snapshot = excluded.market_plan_key_snapshot,
    max_players_per_club_snapshot = excluded.max_players_per_club_snapshot,
    total_market_value_eur = excluded.total_market_value_eur,
    last_idempotency_key = excluded.last_idempotency_key, confirmed_at = excluded.confirmed_at
  returning id into v_user_gameweek_id;

  delete from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id = v_user_gameweek_id;
  insert into public.touchline_fantasy_user_gameweek_selections (
    user_gameweek_id, slot_id, slot_index, player_id, club_id, formation_role, position_bucket, market_value_eur
  )
  with requested as (
    select item."playerId"::uuid player_id, item."slotId" slot_id
    from jsonb_to_recordset(p_selections) as item("playerId" text, "slotId" text)
  ), eligible as (
    select distinct on (player.id) player.id player_id, membership.club_id, value.market_value_eur,
      public.touchline_fantasy_position_bucket(coalesce(membership.detailed_position, membership.position, player.detailed_position, player.position)) position_bucket
    from public.touchline_card_publications publication
    join public.football_player_market_values value on value.id = publication.market_value_id
    join public.football_players player on player.id = publication.player_id
    join public.football_squad_members membership on membership.id = publication.current_membership_id
    where publication.publication_status = 'published' and value.status = 'verified'
      and value.confidence = 'verified' and value.market_value_eur is not null
      and membership.status = 'active' and membership.club_id = player.current_club_id
      and (v_plan_key is distinct from 'beta' or exists (
        select 1 from public.football_clubs policy_club
        where policy_club.id = membership.club_id
          and policy_club.provider = 'sportmonks'
          and policy_club.provider_team_id::text = any(v_allowed_team_ids)
      ))
    order by player.id, publication.published_at desc nulls last
  )
  select v_user_gameweek_id, requested.slot_id, (slot.value ->> 'priority')::integer,
    requested.player_id, eligible.club_id, slot.value ->> 'role', eligible.position_bucket, eligible.market_value_eur
  from requested join eligible using (player_id)
  join lateral (select value from jsonb_array_elements(v_geometry -> 'slots') candidate(value)
    where candidate.value ->> 'id' = requested.slot_id limit 1) slot on true
  order by (slot.value ->> 'priority')::integer;

  insert into public.touchline_fantasy_audit_events (user_id, gameweek_id, event_type, idempotency_key, metadata)
  values (p_user_id, p_gameweek_id, case when p_action = 'confirm' then 'XI_CONFIRMED' else 'DRAFT_SAVED' end,
    p_idempotency_key, jsonb_build_object('selectionCount', v_count, 'formationCode', p_formation_code,
      'selectedCoachId', p_selected_coach_id, 'totalMarketValueEur', v_total))
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return jsonb_build_object('ok', true, 'userGameweekId', v_user_gameweek_id,
    'state', case when p_action = 'confirm' then 'CONFIRMED' else 'DRAFT' end,
    'selectedCoachId', p_selected_coach_id, 'selectionCount', v_count,
    'totalMarketValueEur', v_total, 'budgetRemainingEur', case when v_effective_budget is null then null else v_effective_budget - v_total end);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.touchline_hire_coach_contract(p_user_id uuid, p_coach_provider_id text, p_club_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existing public.touchline_coach_contracts%rowtype;
  v_contract public.touchline_coach_contracts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;
  if p_user_id is null or p_club_id is null or nullif(trim(p_coach_provider_id), '') is null
     or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'TL_COACH_HIRE_INVALID';
  end if;
  perform id from public.users where id = p_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'TL_COACH_USER_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.football_clubs
    where id = p_club_id and provider = 'sportmonks' and nullif(trim(provider_team_id), '') is not null
  ) then raise exception using errcode = 'P0001', message = 'TL_COACH_CLUB_NOT_CANONICAL'; end if;

  select * into v_existing from public.touchline_coach_contracts
  where user_id = p_user_id and hire_idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.coach_provider_id <> trim(p_coach_provider_id) or v_existing.club_id <> p_club_id then
      raise exception using errcode = 'P0001', message = 'TL_COACH_HIRE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok',true,'idempotentReplay',true,'contractId',v_existing.id,'status',v_existing.status,'scoringVersion',v_existing.scoring_version);
  end if;

  select * into v_existing from public.touchline_coach_contracts
  where user_id = p_user_id and status = 'active' for update;
  if found then
    if v_existing.coach_provider_id = trim(p_coach_provider_id) and v_existing.club_id = p_club_id then
      return jsonb_build_object('ok',true,'idempotentReplay',true,'contractId',v_existing.id,'status','active','scoringVersion',v_existing.scoring_version);
    end if;
    raise exception using errcode = 'P0001', message = 'TL_COACH_ACTIVE_CONTRACT_EXISTS';
  end if;

  insert into public.touchline_coach_contracts (
    user_id,coach_provider_id,club_id,status,scoring_version,started_at,hire_idempotency_key
  ) values (
    p_user_id,trim(p_coach_provider_id),p_club_id,'active','coach_scoring_v2',v_now,trim(p_idempotency_key)
  ) returning * into v_contract;
  insert into public.touchline_coach_contract_events (
    contract_id,user_id,event_type,idempotency_key,reason,occurred_at
  ) values (
    v_contract.id,p_user_id,'hired',trim(p_idempotency_key),'ClubOwner hired coach',v_now
  );
  insert into public.touchline_user_arena_state (user_id,coach_provider_id,updated_at)
  values (p_user_id,trim(p_coach_provider_id),v_now)
  on conflict (user_id) do update set coach_provider_id=excluded.coach_provider_id,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'idempotentReplay',false,'contractId',v_contract.id,'status','active','scoringVersion','coach_scoring_v2');
end;
$function$

;
CREATE OR REPLACE FUNCTION public.touchline_fantasy_sync_gameweeks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer := 0;
begin
  with round_facts as (
    select
      round.id as round_id,
      round.competition_id,
      round.season_id,
      round.name as round_name,
      case
        when round.name ~ '[0-9]+' then substring(round.name from '([0-9]+)\D*$')::integer
      end as round_sort_number,
      min(fixture.starts_at) as first_fixture_at,
      max(fixture.starts_at) as last_fixture_at,
      bool_or(public.touchline_fantasy_fixture_is_live(fixture.status)) as any_live,
      bool_or(public.touchline_fantasy_fixture_is_final(fixture.status)) as any_final,
      count(fixture.id) > 0 and bool_and(
        public.touchline_fantasy_fixture_is_final(fixture.status)
        and fixture.finalized_at is not null
      ) as all_final,
      max(fixture.finalized_at) filter (
        where public.touchline_fantasy_fixture_is_final(fixture.status)
      ) as round_completed_at
    from public.football_rounds round
    -- A known round with no observed fixtures must remain in the predecessor
    -- sequence. Omitting it would incorrectly bootstrap the next round.
    left join public.football_fixtures fixture on fixture.round_id = round.id
    join public.touchline_fantasy_configs config
      on config.competition_id = round.competition_id
     and config.season_id = round.season_id
     and config.status = 'active'
    group by
      round.id,
      round.competition_id,
      round.season_id,
      round.name
  ), ordered_rounds as (
    select
      round_facts.*,
      bool_or(
        round_sort_number is null
        and first_fixture_at is null
      ) over (
        partition by season_id
      ) as has_ambiguous_unscheduled_round,
      row_number() over (
        partition by season_id
        order by round_sort_number nulls last, first_fixture_at nulls last, round_id
      )::integer as round_sequence,
      lag(all_final) over (
        partition by season_id
        order by round_sort_number nulls last, first_fixture_at nulls last, round_id
      ) as previous_round_all_final,
      lag(round_completed_at) over (
        partition by season_id
        order by round_sort_number nulls last, first_fixture_at nulls last, round_id
      ) as previous_round_completed_at
    from round_facts
  ), timing as (
    select
      ordered_rounds.*,
      first_fixture_at as locks_at
    from ordered_rounds
  ), prepared as (
    select
      timing.*,
      case
        -- Provider round names with a numeric sequence are authoritative. An
        -- unscheduled unnumbered round has no safe predecessor ordering, so
        -- keep the season closed until provider schedule data resolves it.
        when has_ambiguous_unscheduled_round then false
        -- A partial season import starting at Round 2 is not a bootstrap.
        -- Fully scheduled unnamed rounds retain the earliest-schedule fallback;
        -- the ambiguous-unscheduled guard above still closes that whole season.
        when round_sequence = 1
          and (round_sort_number is null or round_sort_number = 1) then true
        when previous_round_all_final
          and previous_round_completed_at is not null
          and previous_round_completed_at < locks_at then true
        else false
      end as market_window_available,
      case
        when has_ambiguous_unscheduled_round then locks_at - interval '1 microsecond'
        -- Season bootstrap is the only round without a preceding final whistle.
        when round_sequence = 1
          and (round_sort_number is null or round_sort_number = 1)
          then first_fixture_at - interval '7 days'
        when previous_round_all_final
          and previous_round_completed_at is not null
          and previous_round_completed_at < locks_at
          then previous_round_completed_at
        -- Keep invalid/incomplete/overlapping rounds materialized but closed.
        else locks_at - interval '1 microsecond'
      end as market_opens_at
    from timing
  ), closed_unscheduled_gameweeks as (
    update public.touchline_fantasy_gameweeks gameweek
    set state = case
      when gameweek.state = 'SETTLED' then 'SETTLED'
      else 'LOCKED'
    end
    where exists (
      select 1
      from public.football_rounds round
      join public.touchline_fantasy_configs config
        on config.competition_id = round.competition_id
       and config.season_id = round.season_id
       and config.status = 'active'
      where round.id = gameweek.round_id
        and not exists (
          select 1
          from public.football_fixtures fixture
          where fixture.round_id = round.id
            and fixture.starts_at is not null
        )
    )
    returning gameweek.id
  ), synchronized as (
    select
      competition_id,
      season_id,
      round_id,
      case
        when round_sort_number is not null then round_sort_number
        else round_sequence
      end as gameweek_number,
      case
        -- Provider LIVE takes precedence even when a stale schedule still says
        -- the kickoff is in the future. Never leave that Markt open.
        when any_live then 'LIVE'
        -- A provider-final result proves play already occurred regardless of
        -- a stale future kickoff. Complete observation coverage finalizes the
        -- round; partial coverage only closes it, never opens the next round.
        when all_final then 'FINAL'
        when any_final then 'LOCKED'
        when round_sequence = 1
          and not market_window_available
          and clock_timestamp() < locks_at then 'UPCOMING'
        when round_sequence > 1
          and not market_window_available
          and clock_timestamp() < locks_at then 'UPCOMING'
        when clock_timestamp() < market_opens_at then 'UPCOMING'
        when market_window_available and clock_timestamp() < locks_at then 'MARKET_OPEN'
        else 'LOCKED'
      end as state,
      market_opens_at,
      locks_at,
      first_fixture_at,
      last_fixture_at
    from prepared
  )
  insert into public.touchline_fantasy_gameweeks (
    competition_id,
    season_id,
    round_id,
    gameweek_number,
    state,
    market_opens_at,
    locks_at,
    first_fixture_at,
    last_fixture_at
  )
  select
    competition_id,
    season_id,
    round_id,
    gameweek_number,
    state,
    market_opens_at,
    locks_at,
    first_fixture_at,
    last_fixture_at
  from synchronized
  -- A round with no scheduled kickoff cannot be played, but it remains in
  -- ordered_rounds above as a fail-closed predecessor for later Gameweeks.
  where first_fixture_at is not null
  on conflict (round_id) do update
    set first_fixture_at = excluded.first_fixture_at,
        last_fixture_at = excluded.last_fixture_at,
        locks_at = excluded.locks_at,
        market_opens_at = excluded.market_opens_at,
        state = case
          when public.touchline_fantasy_gameweeks.state = 'SETTLED' then 'SETTLED'
          else excluded.state
        end;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$

;
revoke all on function public.checkout_touchline_market_cart(uuid,uuid[],text) from public, anon, authenticated;
grant execute on function public.checkout_touchline_market_cart(uuid,uuid[],text) to service_role;
revoke all on function public.touchline_fantasy_lock_gameweek(uuid) from public, anon, authenticated;
grant execute on function public.touchline_fantasy_lock_gameweek(uuid) to service_role;
revoke all on function public.touchline_fantasy_prepare_user_gameweek(uuid,uuid) from public, anon, authenticated;
grant execute on function public.touchline_fantasy_prepare_user_gameweek(uuid,uuid) to service_role;
revoke all on function public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text) to service_role;
revoke all on function public.touchline_hire_coach_contract(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.touchline_hire_coach_contract(uuid,text,uuid,text) to service_role;
revoke all on function public.touchline_fantasy_sync_gameweeks() from public, anon, authenticated;
grant execute on function public.touchline_fantasy_sync_gameweeks() to service_role;
commit;
