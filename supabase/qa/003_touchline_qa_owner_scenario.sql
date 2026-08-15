-- QA-only ClubOwner roster, Arena and Quick Sub scenario.
-- Never add this file to supabase/migrations and never apply it to Production.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_owner_scenarios (
  run_id uuid not null references public.touchline_qa_fixture_runs(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  fixture_version text not null,
  status text not null check (status in ('applying', 'applied', 'rolling_back', 'rolled_back', 'failed')),
  selected_card_ids uuid[] not null default array[]::uuid[],
  contract_ids uuid[] not null default array[]::uuid[],
  order_id uuid,
  prior_avatar_url text,
  prior_arena_state_exists boolean not null default false,
  prior_arena_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  primary key (run_id, user_id),
  check (prior_arena_state is null or jsonb_typeof(prior_arena_state) = 'object')
);

alter table public.touchline_qa_owner_scenarios enable row level security;
revoke all on public.touchline_qa_owner_scenarios from public, anon, authenticated;
grant select, insert, update on public.touchline_qa_owner_scenarios to service_role;

create or replace function public.touchline_apply_qa_owner_scenario(
  p_project_ref text,
  p_run_id uuid,
  p_user_id uuid,
  p_expected_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.touchline_qa_fixture_runs%rowtype;
  v_scenario public.touchline_qa_owner_scenarios%rowtype;
  v_user public.users%rowtype;
  v_prior_state public.touchline_user_arena_state%rowtype;
  v_selected_card_ids uuid[];
  v_contract_ids uuid[];
  v_checkout jsonb;
  v_order_id uuid;
  v_lineup jsonb;
  v_active_contract_count integer;
  v_position_counts jsonb;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  if p_run_id is null or p_user_id is null or nullif(btrim(p_expected_email), '') is null then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_INVALID_IDENTITY';
  end if;

  select * into v_run
    from public.touchline_qa_fixture_runs
   where id = p_run_id
     and project_ref = p_project_ref
     and status = 'applied'
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_REPRESENTATIVE_RUN_REQUIRED';
  end if;

  if not exists (
    select 1
      from auth.users auth_user
     where auth_user.id = p_user_id
       and lower(auth_user.email) = lower(btrim(p_expected_email))
       and auth_user.email_confirmed_at is not null
       and auth_user.deleted_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_AUTH_IDENTITY_MISMATCH';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_PUBLIC_USER_REQUIRED';
  end if;

  select * into v_scenario
    from public.touchline_qa_owner_scenarios
   where run_id = p_run_id and user_id = p_user_id
   for update;
  if found and v_scenario.status = 'applied' then
    select count(*) into v_active_contract_count
      from public.touchline_card_contracts
     where user_id = p_user_id
       and status = 'active'
       and card_id = any(v_scenario.selected_card_ids);
    if v_active_contract_count <> 35 then
      raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_REPLAY_DRIFT';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotentReplay', true,
      'runId', p_run_id,
      'userId', p_user_id,
      'activeContracts', v_active_contract_count,
      'startingEleven', 11,
      'matchdayBench', 9,
      'outsideMatchday', 15,
      'orderId', v_scenario.order_id
    );
  end if;
  if found and v_scenario.status = 'rolled_back' then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_ROLLED_BACK_USE_NEW_VERSION';
  end if;
  if found then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_INCOMPLETE_PREVIOUS_ATTEMPT';
  end if;

  select count(*) into v_active_contract_count
    from public.touchline_card_contracts
   where user_id = p_user_id and status = 'active';
  if v_active_contract_count <> 0 then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_REQUIRES_EMPTY_ROSTER';
  end if;

  select * into v_prior_state
    from public.touchline_user_arena_state
   where user_id = p_user_id;

  insert into public.touchline_qa_owner_scenarios (
    run_id,
    user_id,
    project_ref,
    fixture_version,
    status,
    prior_avatar_url,
    prior_arena_state_exists,
    prior_arena_state,
    metadata
  ) values (
    p_run_id,
    p_user_id,
    p_project_ref,
    v_run.fixture_version || ':owner-scenario-v1',
    'applying',
    v_user.avatar_url,
    found,
    case when found then to_jsonb(v_prior_state) else null end,
    jsonb_build_object(
      'touchline_qa_fixture_version', v_run.fixture_version || ':owner-scenario-v1',
      'qa_fixture_run_id', p_run_id,
      'classificationAuthority', 'canonical_broad_position_plus_qa_tactical_slot',
      'officialPositionMutation', false,
      'productionAllowed', false
    )
  );

  with eligible as (
    select
      inventory.id,
      player.position,
      row_number() over (
        partition by player.position
        order by club.provider_team_id, player.provider_player_id, inventory.id
      ) as position_rank
    from public.touchline_card_inventory inventory
    join public.football_players player on player.id = inventory.player_id
    join public.football_clubs club on club.id = inventory.club_id
    join public.touchline_card_publications publication
      on publication.player_id = player.id
     and publication.publication_status = 'published'
    where inventory.card_status = 'published'
      and inventory.sale_status = 'available'
      and inventory.competition_tier = 'ruby-red'
      and exists (
        select 1
          from public.football_squad_members membership
         where membership.player_id = player.id
           and membership.club_id = inventory.club_id
           and membership.status = 'active'
      )
      and not exists (
        select 1
          from public.touchline_card_contracts contract
         where contract.user_id = p_user_id
           and contract.card_id = inventory.id
           and contract.status = 'active'
      )
  ), selected as (
    select * from eligible
     where (position = 'Goalkeeper' and position_rank <= 3)
        or (position = 'Defender' and position_rank <= 10)
        or (position = 'Midfielder' and position_rank <= 11)
        or (position = 'Attacker' and position_rank <= 11)
  )
  select
    array_agg(id order by
      case position when 'Goalkeeper' then 1 when 'Defender' then 2 when 'Midfielder' then 3 else 4 end,
      position_rank,
      id
    ),
    jsonb_object_agg(position, position_count)
  into v_selected_card_ids, v_position_counts
  from (
    select selected.*, count(*) over (partition by position) as position_count
      from selected
  ) ranked;

  if cardinality(v_selected_card_ids) <> 35
     or v_position_counts <> jsonb_build_object(
       'Goalkeeper', 3,
       'Defender', 10,
       'Midfielder', 11,
       'Attacker', 11
     ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_CARD_COMPOSITION_INVALID';
  end if;

  v_checkout := public.checkout_touchline_market_cart(
    p_user_id,
    v_selected_card_ids,
    'qa-owner-scenario:' || p_run_id::text
  );
  if coalesce((v_checkout ->> 'ok')::boolean, false) is not true
     or coalesce((v_checkout ->> 'itemCount')::integer, 0) <> 35
     or coalesce((v_checkout ->> 'totalTc')::integer, -1) <> 0 then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_CHECKOUT_INVALID';
  end if;

  v_order_id := (v_checkout ->> 'orderId')::uuid;
  select array_agg(value::uuid order by value::uuid)
    into v_contract_ids
    from jsonb_array_elements_text(v_checkout -> 'contractIds') item(value);
  if cardinality(v_contract_ids) <> 35 then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_CONTRACT_SET_INVALID';
  end if;

  with chosen as (
    select
      inventory.id,
      player.position,
      row_number() over (
        partition by player.position
        order by club.provider_team_id, player.provider_player_id, inventory.id
      ) as position_rank
    from public.touchline_card_inventory inventory
    join public.football_players player on player.id = inventory.player_id
    join public.football_clubs club on club.id = inventory.club_id
    where inventory.id = any(v_selected_card_ids)
  ), starters as (
    select * from chosen
     where (position = 'Goalkeeper' and position_rank <= 1)
        or (position = 'Defender' and position_rank <= 4)
        or (position = 'Midfielder' and position_rank <= 3)
        or (position = 'Attacker' and position_rank <= 3)
  )
  select jsonb_agg(
    jsonb_build_object(
      'inventoryId', id,
      'x', case position
        when 'Goalkeeper' then 15
        when 'Defender' then 29
        when 'Midfielder' then 48
        else 68
      end,
      'y', case position
        when 'Goalkeeper' then 52
        when 'Defender' then 34 + ((position_rank - 1) * 12)
        when 'Midfielder' then 36 + ((position_rank - 1) * 16)
        else 36 + ((position_rank - 1) * 16)
      end,
      'heightVh', 14
    ) order by
      case position when 'Goalkeeper' then 1 when 'Defender' then 2 when 'Midfielder' then 3 else 4 end,
      position_rank,
      id
  ) into v_lineup
  from starters;
  if jsonb_array_length(v_lineup) <> 11 then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_LINEUP_INVALID';
  end if;

  update public.users
     set avatar_url = '/touchlineArena/club-owner/avatars/luiz-lopez-owner-avatar-v1.png',
         updated_at = now()
   where id = p_user_id;

  insert into public.touchline_user_arena_state (
    user_id,
    formation_key,
    lineup,
    saved_formation_layouts,
    coach_provider_id,
    updated_at
  ) values (
    p_user_id,
    '4-3-3',
    v_lineup,
    '{}'::jsonb,
    '455907',
    now()
  )
  on conflict (user_id) do update set
    formation_key = excluded.formation_key,
    lineup = excluded.lineup,
    saved_formation_layouts = excluded.saved_formation_layouts,
    coach_provider_id = excluded.coach_provider_id,
    updated_at = excluded.updated_at;

  select count(*) into v_active_contract_count
    from public.touchline_card_contracts
   where user_id = p_user_id and status = 'active';
  if v_active_contract_count <> 35 then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_ACTIVE_ROSTER_INVALID';
  end if;

  update public.touchline_qa_owner_scenarios
     set status = 'applied',
         selected_card_ids = v_selected_card_ids,
         contract_ids = v_contract_ids,
         order_id = v_order_id,
         applied_at = clock_timestamp(),
         metadata = metadata || jsonb_build_object(
           'broadPositionCounts', v_position_counts,
           'startingEleven', 11,
           'matchdayBench', 9,
           'outsideMatchday', 15,
           'coachProviderId', '455907',
           'formationKey', '4-3-3',
           'checkoutTotalTc', 0
         )
   where run_id = p_run_id and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'idempotentReplay', false,
    'runId', p_run_id,
    'userId', p_user_id,
    'activeContracts', 35,
    'startingEleven', 11,
    'matchdayBench', 9,
    'outsideMatchday', 15,
    'orderId', v_order_id,
    'broadPositionCounts', v_position_counts
  );
end;
$$;

create or replace function public.touchline_rollback_qa_owner_scenario(
  p_project_ref text,
  p_run_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scenario public.touchline_qa_owner_scenarios%rowtype;
  v_card_id uuid;
  v_prior_state jsonb;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  select * into v_scenario
    from public.touchline_qa_owner_scenarios
   where run_id = p_run_id and user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_NOT_FOUND';
  end if;
  if v_scenario.status = 'rolled_back' then
    return jsonb_build_object('ok', true, 'idempotentReplay', true, 'releasedContracts', 35);
  end if;
  if v_scenario.status <> 'applied' then
    raise exception using errcode = 'P0001', message = 'TL_QA_OWNER_SCENARIO_NOT_APPLIED';
  end if;

  update public.touchline_qa_owner_scenarios
     set status = 'rolling_back'
   where run_id = p_run_id and user_id = p_user_id;

  foreach v_card_id in array v_scenario.selected_card_ids loop
    if exists (
      select 1 from public.touchline_card_contracts
       where user_id = p_user_id and card_id = v_card_id and status = 'active'
    ) then
      perform public.release_touchline_card_contract(
        p_user_id,
        v_card_id,
        'qa-owner-rollback:' || p_run_id::text || ':' || v_card_id::text
      );
    end if;
  end loop;

  update public.users
     set avatar_url = v_scenario.prior_avatar_url,
         updated_at = now()
   where id = p_user_id;

  if v_scenario.prior_arena_state_exists then
    v_prior_state := v_scenario.prior_arena_state;
    insert into public.touchline_user_arena_state (
      user_id,
      formation_key,
      lineup,
      saved_formation_layouts,
      coach_provider_id,
      updated_at
    ) values (
      p_user_id,
      v_prior_state ->> 'formation_key',
      coalesce(v_prior_state -> 'lineup', '[]'::jsonb),
      coalesce(v_prior_state -> 'saved_formation_layouts', '{}'::jsonb),
      nullif(v_prior_state ->> 'coach_provider_id', ''),
      coalesce((v_prior_state ->> 'updated_at')::timestamptz, now())
    )
    on conflict (user_id) do update set
      formation_key = excluded.formation_key,
      lineup = excluded.lineup,
      saved_formation_layouts = excluded.saved_formation_layouts,
      coach_provider_id = excluded.coach_provider_id,
      updated_at = excluded.updated_at;
  else
    delete from public.touchline_user_arena_state where user_id = p_user_id;
  end if;

  update public.touchline_market_orders
     set status = 'reversed', reversed_at = clock_timestamp()
   where id = v_scenario.order_id and user_id = p_user_id and status = 'completed';

  update public.touchline_qa_owner_scenarios
     set status = 'rolled_back', rolled_back_at = clock_timestamp()
   where run_id = p_run_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'idempotentReplay', false, 'releasedContracts', 35);
end;
$$;

revoke all on function public.touchline_apply_qa_owner_scenario(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_owner_scenario(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.touchline_apply_qa_owner_scenario(text, uuid, uuid, text) to service_role;
grant execute on function public.touchline_rollback_qa_owner_scenario(text, uuid, uuid) to service_role;

commit;
