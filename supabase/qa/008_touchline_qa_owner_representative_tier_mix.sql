-- TouchLine Development QA only.
-- Replaces the canonical QA owner's all-ruby scenario selection with 35
-- already-published cards covering every public tier. Canonical publication
-- tiers and prices are read, never changed. The QA order remains zero-charge.
-- This is an operator-run QA repair, not a Production migration.

create table if not exists public.touchline_qa_owner_tier_mix_runs (
  run_id uuid not null,
  user_id uuid not null,
  project_ref text not null,
  status text not null check (status in ('applying', 'applied', 'rolling_back', 'rolled_back')),
  prior_selected_card_ids uuid[] not null,
  selected_card_ids uuid[],
  prior_scenario_metadata jsonb not null,
  prior_order jsonb not null,
  prior_order_items jsonb not null,
  prior_contracts jsonb not null,
  prior_inventory jsonb not null,
  prior_arena_state jsonb,
  prior_tactical_slots jsonb not null,
  prior_ledger_count bigint not null,
  prior_ledger_balance_cents bigint not null,
  tier_counts jsonb,
  editorial_total_gbp numeric(12, 2),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (run_id, user_id)
);

alter table public.touchline_qa_owner_tier_mix_runs enable row level security;
revoke all on table public.touchline_qa_owner_tier_mix_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.touchline_qa_owner_tier_mix_runs to service_role;

create or replace function public.touchline_apply_qa_owner_representative_tier_mix(
  p_project_ref text,
  p_run_id uuid,
  p_user_id uuid,
  p_expected_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_expected_project_ref constant text := 'xgxbwqxjssxxuihuwmgy';
  v_expected_user_id constant uuid := '072900f3-27fc-41a5-9881-6913a486754e';
  v_expected_email constant text := 'jl_nenelopes10@hotmail.com';
  v_auth_email text;
  v_scenario public.touchline_qa_owner_scenarios%rowtype;
  v_order public.touchline_market_orders%rowtype;
  v_existing_status text;
  v_selected_card_ids uuid[];
  v_tier_counts jsonb;
  v_editorial_total numeric(12, 2);
  v_ledger_count bigint;
  v_ledger_balance bigint;
  v_active_contracts integer;
  v_lineup_count integer;
  v_tactical_count integer;
  v_coach_provider_id text;
begin
  if p_project_ref is distinct from v_expected_project_ref then
    raise exception 'TL_QA_PROJECT_REF_MISMATCH';
  end if;
  if p_user_id is distinct from v_expected_user_id then
    raise exception 'TL_QA_USER_ID_MISMATCH';
  end if;
  if lower(trim(coalesce(p_expected_email, ''))) is distinct from v_expected_email then
    raise exception 'TL_QA_EXPECTED_EMAIL_MISMATCH';
  end if;

  select lower(trim(email)) into v_auth_email
  from auth.users
  where id = p_user_id;
  if v_auth_email is distinct from v_expected_email then
    raise exception 'TL_QA_AUTH_IDENTITY_MISMATCH';
  end if;

  select * into v_scenario
  from public.touchline_qa_owner_scenarios
  where run_id = p_run_id and user_id = p_user_id
  for update;
  if not found or v_scenario.status <> 'applied' then
    raise exception 'TL_QA_BASE_SCENARIO_NOT_APPLIED';
  end if;
  if coalesce(array_length(v_scenario.selected_card_ids, 1), 0) <> 35
     or coalesce(array_length(v_scenario.contract_ids, 1), 0) <> 35 then
    raise exception 'TL_QA_BASE_SCENARIO_NOT_35';
  end if;

  select status into v_existing_status
  from public.touchline_qa_owner_tier_mix_runs
  where run_id = p_run_id and user_id = p_user_id;
  if v_existing_status = 'applied' then
    return jsonb_build_object(
      'status', 'already_applied',
      'run_id', p_run_id,
      'user_id', p_user_id
    );
  elsif v_existing_status is not null and v_existing_status <> 'rolled_back' then
    raise exception 'TL_QA_TIER_MIX_RUN_BUSY_%', v_existing_status;
  end if;

  select * into v_order
  from public.touchline_market_orders
  where id = v_scenario.order_id and user_id = p_user_id
  for update;
  if not found or v_order.status <> 'completed'
     or v_order.item_count <> 35
     or v_order.total_tc <> 0
     or v_order.balance_before_tc <> v_order.balance_after_tc then
    raise exception 'TL_QA_ZERO_CHARGE_ORDER_INVARIANT_FAILED';
  end if;

  if (
    select count(*)
    from public.touchline_card_contracts c
    join public.touchline_card_inventory i on i.id = c.card_id
    where c.user_id = p_user_id
      and c.status = 'active'
      and c.id = any(v_scenario.contract_ids)
      and i.competition_tier = 'ruby-red'
  ) <> 35 then
    raise exception 'TL_QA_BASELINE_IS_NOT_ALL_RUBY';
  end if;

  select count(*), coalesce(sum(amount_cents), 0)
  into v_ledger_count, v_ledger_balance
  from public.clubowner_credit_ledger
  where user_id = p_user_id;

  create temporary table if not exists tl_qa_tier_quota (
    position_group text not null,
    competition_tier text not null,
    quota integer not null,
    tier_priority integer not null,
    primary key (position_group, competition_tier)
  ) on commit drop;
  truncate tl_qa_tier_quota;
  insert into tl_qa_tier_quota(position_group, competition_tier, quota, tier_priority) values
    ('Goalkeeper', 'ruby-red', 1, 1),
    ('Goalkeeper', 'sapphire-blue', 1, 2),
    ('Goalkeeper', 'emerald-green', 1, 5),
    ('Defender', 'ruby-red', 2, 1),
    ('Defender', 'sapphire-blue', 1, 2),
    ('Defender', 'amethyst-purple', 2, 3),
    ('Defender', 'radiant-gold', 2, 4),
    ('Defender', 'emerald-green', 1, 5),
    ('Defender', 'clear-diamond', 1, 6),
    ('Defender', 'diamond-gold', 1, 7),
    ('Midfielder', 'ruby-red', 1, 1),
    ('Midfielder', 'sapphire-blue', 1, 2),
    ('Midfielder', 'amethyst-purple', 2, 3),
    ('Midfielder', 'radiant-gold', 2, 4),
    ('Midfielder', 'emerald-green', 2, 5),
    ('Midfielder', 'clear-diamond', 1, 6),
    ('Midfielder', 'diamond-gold', 2, 7),
    ('Attacker', 'ruby-red', 2, 1),
    ('Attacker', 'sapphire-blue', 1, 2),
    ('Attacker', 'amethyst-purple', 2, 3),
    ('Attacker', 'radiant-gold', 2, 4),
    ('Attacker', 'emerald-green', 2, 5),
    ('Attacker', 'clear-diamond', 1, 6),
    ('Attacker', 'diamond-gold', 1, 7);

  create temporary table if not exists tl_qa_candidates (
    card_id uuid primary key,
    player_id uuid not null,
    player_name text not null,
    club_name text not null,
    position_group text not null,
    competition_tier text not null,
    editorial_price_tc integer not null,
    editorial_price_gbp numeric(12, 2) not null,
    price_table_version text not null,
    publication_id uuid not null,
    publication_version bigint not null,
    tier_priority integer not null
  ) on commit drop;
  truncate tl_qa_candidates;

  insert into tl_qa_candidates(
    card_id, player_id, player_name, club_name, position_group,
    competition_tier, editorial_price_tc, editorial_price_gbp,
    price_table_version, publication_id, publication_version, tier_priority
  )
  with unique_player_candidates as (
    select distinct on (i.player_id, pub.calculated_tier)
      i.id as card_id,
      i.player_id,
      i.player_name,
      i.club_name,
      p.position as position_group,
      pub.calculated_tier as competition_tier,
      pub.calculated_price_tc as editorial_price_tc,
      pub.calculated_nominal_price_gbp as editorial_price_gbp,
      i.price_table_version,
      pub.id as publication_id,
      pub.version as publication_version,
      q.tier_priority,
      q.quota,
      pub.last_reviewed_at,
      pub.published_at
    from public.touchline_card_inventory i
    join public.football_players p on p.id = i.player_id
    join public.touchline_card_publications pub
      on pub.player_id = i.player_id
     and pub.publication_status = 'published'
    join public.touchline_card_price_catalog pc
      on pc.tier_key = pub.calculated_tier
     and pc.price_table_version = i.price_table_version
    join tl_qa_tier_quota q
      on q.position_group = p.position
     and q.competition_tier = pub.calculated_tier
    where i.sale_status = 'available'
      and i.card_status = 'published'
      and i.competition_tier = pub.calculated_tier
      and pc.price_tc = pub.calculated_price_tc
      and pub.calculated_nominal_price_gbp = pub.calculated_price_tc::numeric
      and not exists (
        select 1 from public.touchline_card_contracts active_contract
        where active_contract.card_id = i.id and active_contract.status = 'active'
      )
    order by
      i.player_id,
      pub.calculated_tier,
      pub.last_reviewed_at desc nulls last,
      pub.published_at desc nulls last,
      i.id
  ),
  ranked as (
    select
      candidate.*,
      row_number() over (
        partition by candidate.position_group, candidate.competition_tier
        order by
          candidate.last_reviewed_at desc nulls last,
          candidate.published_at desc nulls last,
          candidate.card_id
      ) as rn
    from unique_player_candidates candidate
  )
  select
    card_id, player_id, player_name, club_name, position_group,
    competition_tier, editorial_price_tc, editorial_price_gbp,
    price_table_version, publication_id, publication_version, tier_priority
  from ranked
  where rn <= quota;

  if (select count(*) from tl_qa_candidates) <> 35 then
    raise exception 'TL_QA_REPRESENTATIVE_PUBLICATION_COVERAGE_INCOMPLETE';
  end if;

  select jsonb_object_agg(competition_tier, tier_count order by competition_tier),
         sum(editorial_price_gbp)
  into v_tier_counts, v_editorial_total
  from (
    select competition_tier, count(*) as tier_count, sum(editorial_price_gbp) as editorial_price_gbp
    from tl_qa_candidates
    group by competition_tier
  ) tier_summary;
  if (select count(*) from jsonb_object_keys(v_tier_counts)) <> 7 then
    raise exception 'TL_QA_ALL_SEVEN_TIERS_REQUIRED';
  end if;

  create temporary table if not exists tl_qa_card_mapping (
    old_card_id uuid primary key,
    new_card_id uuid not null unique,
    order_item_id uuid not null unique,
    contract_id uuid not null unique,
    position_group text not null
  ) on commit drop;
  truncate tl_qa_card_mapping;

  insert into tl_qa_card_mapping(old_card_id, new_card_id, order_item_id, contract_id, position_group)
  with old_ranked as (
    select
      c.card_id as old_card_id,
      oi.id as order_item_id,
      c.id as contract_id,
      p.position as position_group,
      row_number() over (partition by p.position order by c.card_id) as rn
    from public.touchline_card_contracts c
    join public.touchline_market_order_items oi on oi.id = c.order_item_id
    join public.touchline_card_inventory i on i.id = c.card_id
    join public.football_players p on p.id = i.player_id
    where c.user_id = p_user_id
      and c.status = 'active'
      and c.id = any(v_scenario.contract_ids)
  ),
  new_ranked as (
    select
      card_id as new_card_id,
      position_group,
      row_number() over (
        partition by position_group
        order by tier_priority, competition_tier, card_id
      ) as rn
    from tl_qa_candidates
  )
  select o.old_card_id, n.new_card_id, o.order_item_id, o.contract_id, o.position_group
  from old_ranked o
  join new_ranked n using (position_group, rn);

  if (select count(*) from tl_qa_card_mapping) <> 35 then
    raise exception 'TL_QA_CARD_MAPPING_INCOMPLETE';
  end if;

  insert into public.touchline_qa_owner_tier_mix_runs(
    run_id, user_id, project_ref, status,
    prior_selected_card_ids, prior_scenario_metadata,
    prior_order, prior_order_items, prior_contracts, prior_inventory,
    prior_arena_state, prior_tactical_slots,
    prior_ledger_count, prior_ledger_balance_cents,
    tier_counts, editorial_total_gbp, updated_at
  )
  values (
    p_run_id,
    p_user_id,
    p_project_ref,
    'applying',
    v_scenario.selected_card_ids,
    v_scenario.metadata,
    to_jsonb(v_order),
    (select jsonb_agg(to_jsonb(oi) order by oi.id)
     from public.touchline_market_order_items oi where oi.order_id = v_order.id),
    (select jsonb_agg(to_jsonb(c) order by c.id)
     from public.touchline_card_contracts c where c.id = any(v_scenario.contract_ids)),
    (select jsonb_agg(to_jsonb(i) order by i.id)
     from public.touchline_card_inventory i
     where i.id in (
       select old_card_id from tl_qa_card_mapping
       union
       select new_card_id from tl_qa_card_mapping
     )),
    (select to_jsonb(a) from public.touchline_user_arena_state a where a.user_id = p_user_id),
    (select coalesce(jsonb_agg(to_jsonb(t) order by t.card_id), '[]'::jsonb)
     from public.touchline_qa_owner_tactical_slots t
     where t.run_id = p_run_id and t.user_id = p_user_id),
    v_ledger_count,
    v_ledger_balance,
    v_tier_counts,
    v_editorial_total,
    now()
  )
  on conflict (run_id, user_id) do update
  set status = 'applying',
      prior_selected_card_ids = excluded.prior_selected_card_ids,
      selected_card_ids = null,
      prior_scenario_metadata = excluded.prior_scenario_metadata,
      prior_order = excluded.prior_order,
      prior_order_items = excluded.prior_order_items,
      prior_contracts = excluded.prior_contracts,
      prior_inventory = excluded.prior_inventory,
      prior_arena_state = excluded.prior_arena_state,
      prior_tactical_slots = excluded.prior_tactical_slots,
      prior_ledger_count = excluded.prior_ledger_count,
      prior_ledger_balance_cents = excluded.prior_ledger_balance_cents,
      tier_counts = excluded.tier_counts,
      editorial_total_gbp = excluded.editorial_total_gbp,
      applied_at = null,
      rolled_back_at = null,
      updated_at = now();

  update public.touchline_card_inventory i
  set sale_status = 'available',
      sold_at = null,
      updated_at = now()
  where i.id in (select old_card_id from tl_qa_card_mapping);

  update public.touchline_card_inventory i
  set sale_status = 'sold',
      sold_at = coalesce(i.sold_at, now()),
      updated_at = now()
  where i.id in (select new_card_id from tl_qa_card_mapping);

  update public.touchline_market_order_items oi
  set card_id = candidate.card_id,
      player_id = candidate.player_id,
      player_name = candidate.player_name,
      club_name = candidate.club_name,
      competition_tier = candidate.competition_tier,
      unit_price_tc = candidate.editorial_price_tc,
      price_table_version = candidate.price_table_version
  from tl_qa_card_mapping mapping
  join tl_qa_candidates candidate on candidate.card_id = mapping.new_card_id
  where oi.id = mapping.order_item_id;

  update public.touchline_card_contracts c
  set card_id = candidate.card_id,
      purchase_tier = candidate.competition_tier,
      purchase_price_table_version = candidate.price_table_version,
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'qaRepresentativeTierMix', true,
        'canonicalEditorialTier', candidate.competition_tier,
        'canonicalEditorialPriceTc', candidate.editorial_price_tc,
        'canonicalEditorialPriceGbp', candidate.editorial_price_gbp,
        'canonicalPublicationId', candidate.publication_id,
        'canonicalPublicationVersion', candidate.publication_version,
        'qaCheckoutPriceTc', 0
      )
  from tl_qa_card_mapping mapping
  join tl_qa_candidates candidate on candidate.card_id = mapping.new_card_id
  where c.id = mapping.contract_id;

  select array_agg(card_id order by tier_priority, competition_tier, card_id)
  into v_selected_card_ids
  from tl_qa_candidates;

  update public.touchline_market_orders
  set card_ids = v_selected_card_ids,
      price_table_versions = (
        select array_agg(distinct price_table_version order by price_table_version)
        from tl_qa_candidates
      )
  where id = v_order.id;

  update public.touchline_qa_owner_scenarios
  set selected_card_ids = v_selected_card_ids,
      metadata = metadata || jsonb_build_object(
        'representativeTierMix', true,
        'tierCounts', v_tier_counts,
        'canonicalEditorialTotalGbp', v_editorial_total,
        'qaCheckoutTotalTc', 0,
        'startingXi', 11,
        'bench', 9,
        'outsideMatchday', 15,
        'coachProviderId', '455907',
        'formationKey', '4-3-3'
      )
  where run_id = p_run_id and user_id = p_user_id;

  update public.touchline_user_arena_state arena
  set lineup = lineup_rewrite.value,
      updated_at = now()
  from (
    select coalesce(
      jsonb_agg(
        item.value || jsonb_build_object(
          'id', 'field-' || mapping.new_card_id::text,
          'inventoryId', mapping.new_card_id::text,
          'card', coalesce(item.value -> 'card', '{}'::jsonb)
            || jsonb_build_object('inventoryId', mapping.new_card_id::text)
        )
        order by item.ordinality
      ),
      '[]'::jsonb
    ) as value
    from public.touchline_user_arena_state source_arena
    cross join lateral jsonb_array_elements(source_arena.lineup) with ordinality item(value, ordinality)
    join tl_qa_card_mapping mapping
      on mapping.old_card_id = coalesce(
        nullif(item.value ->> 'inventoryId', '')::uuid,
        nullif(item.value #>> '{card,inventoryId}', '')::uuid
      )
    where source_arena.user_id = p_user_id
  ) lineup_rewrite
  where arena.user_id = p_user_id;

  delete from public.touchline_qa_owner_tactical_slots
  where run_id = p_run_id and user_id = p_user_id;

  perform public.touchline_apply_qa_owner_tactical_slots(
    p_project_ref,
    p_run_id,
    p_user_id
  );

  select count(*) into v_active_contracts
  from public.touchline_card_contracts
  where user_id = p_user_id and status = 'active';
  select jsonb_array_length(lineup), coach_provider_id
  into v_lineup_count, v_coach_provider_id
  from public.touchline_user_arena_state where user_id = p_user_id;
  select count(*) into v_tactical_count
  from public.touchline_qa_owner_tactical_slots
  where run_id = p_run_id and user_id = p_user_id;
  select count(*), coalesce(sum(amount_cents), 0)
  into v_ledger_count, v_ledger_balance
  from public.clubowner_credit_ledger where user_id = p_user_id;

  if v_active_contracts <> 35
     or v_lineup_count <> 11
     or v_tactical_count <> 35
     or v_coach_provider_id is distinct from '455907'
     or v_ledger_count <> (
       select prior_ledger_count from public.touchline_qa_owner_tier_mix_runs
       where run_id = p_run_id and user_id = p_user_id
     )
     or v_ledger_balance <> (
       select prior_ledger_balance_cents from public.touchline_qa_owner_tier_mix_runs
       where run_id = p_run_id and user_id = p_user_id
     ) then
    raise exception 'TL_QA_REPRESENTATIVE_TIER_MIX_POSTCONDITION_FAILED';
  end if;

  update public.touchline_qa_owner_tier_mix_runs
  set status = 'applied',
      selected_card_ids = v_selected_card_ids,
      applied_at = now(),
      updated_at = now()
  where run_id = p_run_id and user_id = p_user_id;

  return jsonb_build_object(
    'status', 'applied',
    'run_id', p_run_id,
    'user_id', p_user_id,
    'contracts', v_active_contracts,
    'starting_xi', v_lineup_count,
    'bench', 9,
    'outside_matchday', 15,
    'coach_provider_id', v_coach_provider_id,
    'tier_counts', v_tier_counts,
    'editorial_total_gbp', v_editorial_total,
    'qa_checkout_total_tc', 0,
    'ledger_unchanged', true
  );
end;
$$;

create or replace function public.touchline_rollback_qa_owner_representative_tier_mix(
  p_project_ref text,
  p_run_id uuid,
  p_user_id uuid,
  p_expected_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_expected_project_ref constant text := 'xgxbwqxjssxxuihuwmgy';
  v_expected_user_id constant uuid := '072900f3-27fc-41a5-9881-6913a486754e';
  v_expected_email constant text := 'jl_nenelopes10@hotmail.com';
  v_run public.touchline_qa_owner_tier_mix_runs%rowtype;
  v_item jsonb;
  v_ledger_count bigint;
  v_ledger_balance bigint;
begin
  if p_project_ref is distinct from v_expected_project_ref
     or p_user_id is distinct from v_expected_user_id
     or lower(trim(coalesce(p_expected_email, ''))) is distinct from v_expected_email then
    raise exception 'TL_QA_ROLLBACK_IDENTITY_MISMATCH';
  end if;
  if not exists (
    select 1 from auth.users where id = p_user_id and lower(trim(email)) = v_expected_email
  ) then
    raise exception 'TL_QA_ROLLBACK_AUTH_IDENTITY_MISMATCH';
  end if;

  select * into v_run
  from public.touchline_qa_owner_tier_mix_runs
  where run_id = p_run_id and user_id = p_user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_applied', 'run_id', p_run_id, 'user_id', p_user_id);
  end if;
  if v_run.status = 'rolled_back' then
    return jsonb_build_object('status', 'already_rolled_back', 'run_id', p_run_id, 'user_id', p_user_id);
  end if;
  if v_run.status <> 'applied' then
    raise exception 'TL_QA_TIER_MIX_NOT_ROLLBACK_READY_%', v_run.status;
  end if;

  update public.touchline_qa_owner_tier_mix_runs
  set status = 'rolling_back', updated_at = now()
  where run_id = p_run_id and user_id = p_user_id;

  for v_item in select value from jsonb_array_elements(v_run.prior_inventory)
  loop
    update public.touchline_card_inventory
    set sale_status = v_item ->> 'sale_status',
        sold_at = nullif(v_item ->> 'sold_at', '')::timestamptz,
        reserved_at = nullif(v_item ->> 'reserved_at', '')::timestamptz,
        updated_at = nullif(v_item ->> 'updated_at', '')::timestamptz
    where id = (v_item ->> 'id')::uuid;
  end loop;

  for v_item in select value from jsonb_array_elements(v_run.prior_order_items)
  loop
    update public.touchline_market_order_items
    set card_id = (v_item ->> 'card_id')::uuid,
        player_id = (v_item ->> 'player_id')::uuid,
        player_name = v_item ->> 'player_name',
        club_name = v_item ->> 'club_name',
        competition_tier = v_item ->> 'competition_tier',
        unit_price_tc = (v_item ->> 'unit_price_tc')::integer,
        price_table_version = v_item ->> 'price_table_version'
    where id = (v_item ->> 'id')::uuid;
  end loop;

  for v_item in select value from jsonb_array_elements(v_run.prior_contracts)
  loop
    update public.touchline_card_contracts
    set card_id = (v_item ->> 'card_id')::uuid,
        purchase_tier = v_item ->> 'purchase_tier',
        purchase_price_table_version = v_item ->> 'purchase_price_table_version',
        metadata = coalesce(v_item -> 'metadata', '{}'::jsonb)
    where id = (v_item ->> 'id')::uuid;
  end loop;

  update public.touchline_market_orders
  set status = v_run.prior_order ->> 'status',
      item_count = (v_run.prior_order ->> 'item_count')::integer,
      total_tc = (v_run.prior_order ->> 'total_tc')::integer,
      balance_before_tc = (v_run.prior_order ->> 'balance_before_tc')::integer,
      balance_after_tc = (v_run.prior_order ->> 'balance_after_tc')::integer,
      card_ids = array(select jsonb_array_elements_text(v_run.prior_order -> 'card_ids')::uuid),
      price_table_versions = array(select jsonb_array_elements_text(v_run.prior_order -> 'price_table_versions')),
      reversed_at = nullif(v_run.prior_order ->> 'reversed_at', '')::timestamptz
  where id = (v_run.prior_order ->> 'id')::uuid;

  update public.touchline_qa_owner_scenarios
  set selected_card_ids = v_run.prior_selected_card_ids,
      metadata = v_run.prior_scenario_metadata
  where run_id = p_run_id and user_id = p_user_id;

  if v_run.prior_arena_state is null then
    delete from public.touchline_user_arena_state where user_id = p_user_id;
  else
    insert into public.touchline_user_arena_state(
      user_id, formation_key, lineup, saved_formation_layouts, updated_at, coach_provider_id
    ) values (
      p_user_id,
      v_run.prior_arena_state ->> 'formation_key',
      v_run.prior_arena_state -> 'lineup',
      v_run.prior_arena_state -> 'saved_formation_layouts',
      (v_run.prior_arena_state ->> 'updated_at')::timestamptz,
      v_run.prior_arena_state ->> 'coach_provider_id'
    )
    on conflict (user_id) do update
    set formation_key = excluded.formation_key,
        lineup = excluded.lineup,
        saved_formation_layouts = excluded.saved_formation_layouts,
        updated_at = excluded.updated_at,
        coach_provider_id = excluded.coach_provider_id;
  end if;

  delete from public.touchline_qa_owner_tactical_slots
  where run_id = p_run_id and user_id = p_user_id;
  for v_item in select value from jsonb_array_elements(v_run.prior_tactical_slots)
  loop
    insert into public.touchline_qa_owner_tactical_slots(
      run_id, user_id, card_id, player_id, position_group, tactical_position,
      squad_bucket, bucket_ordinal, assigned_at
    ) values (
      (v_item ->> 'run_id')::uuid,
      (v_item ->> 'user_id')::uuid,
      (v_item ->> 'card_id')::uuid,
      (v_item ->> 'player_id')::bigint,
      v_item ->> 'position_group',
      v_item ->> 'tactical_position',
      v_item ->> 'squad_bucket',
      (v_item ->> 'bucket_ordinal')::integer,
      (v_item ->> 'assigned_at')::timestamptz
    );
  end loop;

  select count(*), coalesce(sum(amount_cents), 0)
  into v_ledger_count, v_ledger_balance
  from public.clubowner_credit_ledger where user_id = p_user_id;
  if v_ledger_count <> v_run.prior_ledger_count
     or v_ledger_balance <> v_run.prior_ledger_balance_cents then
    raise exception 'TL_QA_ROLLBACK_LEDGER_CHANGED';
  end if;

  update public.touchline_qa_owner_tier_mix_runs
  set status = 'rolled_back', rolled_back_at = now(), updated_at = now()
  where run_id = p_run_id and user_id = p_user_id;

  return jsonb_build_object(
    'status', 'rolled_back',
    'run_id', p_run_id,
    'user_id', p_user_id,
    'restored_cards', array_length(v_run.prior_selected_card_ids, 1),
    'ledger_unchanged', true
  );
end;
$$;

revoke all on function public.touchline_apply_qa_owner_representative_tier_mix(text, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_owner_representative_tier_mix(text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.touchline_apply_qa_owner_representative_tier_mix(text, uuid, uuid, text)
  to service_role;
grant execute on function public.touchline_rollback_qa_owner_representative_tier_mix(text, uuid, uuid, text)
  to service_role;
