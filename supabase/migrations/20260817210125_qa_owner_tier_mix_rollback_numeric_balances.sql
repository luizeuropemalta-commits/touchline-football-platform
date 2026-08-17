-- QA-only follow-up: preserve numeric historical order balances during rollback.
-- Replaces the QA-only rollback function with the corrected tactical-slot and numeric casts.
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
      balance_before_tc = (v_run.prior_order ->> 'balance_before_tc')::numeric,
      balance_after_tc = (v_run.prior_order ->> 'balance_after_tc')::numeric,
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
      run_id, user_id, card_id, broad_position, tactical_bucket, slot_index,
      metadata, created_at
    ) values (
      (v_item ->> 'run_id')::uuid,
      (v_item ->> 'user_id')::uuid,
      (v_item ->> 'card_id')::uuid,
      v_item ->> 'broad_position',
      v_item ->> 'tactical_bucket',
      (v_item ->> 'slot_index')::integer,
      coalesce(v_item -> 'metadata', '{}'::jsonb),
      (v_item ->> 'created_at')::timestamptz
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

revoke all on function public.touchline_rollback_qa_owner_representative_tier_mix(text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.touchline_rollback_qa_owner_representative_tier_mix(text, uuid, uuid, text)
  to service_role;
