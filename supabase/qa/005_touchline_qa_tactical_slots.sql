-- QA-only tactical classification overlay for the representative 35-player owner scenario.
-- Never add this file to supabase/migrations, expose it publicly, or treat it as an official football fact.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_owner_tactical_slots (
  run_id uuid not null references public.touchline_qa_fixture_runs(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  card_id uuid not null references public.touchline_card_inventory(id) on delete restrict,
  broad_position text not null check (broad_position in ('Goalkeeper', 'Defender', 'Midfielder', 'Attacker')),
  tactical_bucket text not null check (tactical_bucket in ('GK', 'CB', 'RB', 'LB', 'CDM', 'MID', 'ATT', 'ST')),
  slot_index integer not null check (slot_index > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (run_id, user_id, card_id),
  unique (run_id, user_id, tactical_bucket, slot_index)
);

alter table public.touchline_qa_owner_tactical_slots enable row level security;
revoke all on public.touchline_qa_owner_tactical_slots from public, anon, authenticated;
grant select, insert, delete on public.touchline_qa_owner_tactical_slots to service_role;

create or replace function public.touchline_apply_qa_owner_tactical_slots(
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
  v_owner public.touchline_qa_owner_scenarios%rowtype;
  v_existing integer;
  v_counts jsonb;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  select * into v_owner
    from public.touchline_qa_owner_scenarios
   where run_id = p_run_id
     and user_id = p_user_id
     and project_ref = p_project_ref
     and status = 'applied';
  if not found or cardinality(v_owner.selected_card_ids) <> 35 then
    raise exception using errcode = 'P0001', message = 'TL_QA_TACTICAL_OWNER_SCENARIO_REQUIRED';
  end if;

  select count(*) into v_existing
    from public.touchline_qa_owner_tactical_slots
   where run_id = p_run_id and user_id = p_user_id;
  if v_existing = 35 then
    return jsonb_build_object(
      'ok', true,
      'idempotentReplay', true,
      'runId', p_run_id,
      'userId', p_user_id,
      'classifiedCards', 35
    );
  end if;
  if v_existing <> 0 then
    raise exception using errcode = 'P0001', message = 'TL_QA_TACTICAL_PARTIAL_STATE';
  end if;

  with ranked as (
    select
      inventory.id as card_id,
      player.position as broad_position,
      row_number() over (
        partition by player.position
        order by club.provider_team_id::bigint, player.provider_player_id::bigint, inventory.id
      )::integer as broad_rank
    from public.touchline_card_inventory inventory
    join public.football_players player on player.id = inventory.player_id
    join public.football_clubs club on club.id = inventory.club_id
    where inventory.id = any(v_owner.selected_card_ids)
  ), classified as (
    select
      card_id,
      broad_position,
      case
        when broad_position = 'Goalkeeper' then 'GK'
        when broad_position = 'Defender' and broad_rank <= 6 then 'CB'
        when broad_position = 'Defender' and broad_rank <= 8 then 'RB'
        when broad_position = 'Defender' then 'LB'
        when broad_position = 'Midfielder' and broad_rank <= 5 then 'CDM'
        when broad_position = 'Midfielder' then 'MID'
        when broad_position = 'Attacker' and broad_rank <= 6 then 'ATT'
        else 'ST'
      end as tactical_bucket
    from ranked
  ), slotted as (
    select
      card_id,
      broad_position,
      tactical_bucket,
      row_number() over (partition by tactical_bucket order by card_id)::integer as slot_index
    from classified
  )
  insert into public.touchline_qa_owner_tactical_slots (
    run_id,
    user_id,
    card_id,
    broad_position,
    tactical_bucket,
    slot_index,
    metadata
  )
  select
    p_run_id,
    p_user_id,
    card_id,
    broad_position,
    tactical_bucket,
    slot_index,
    jsonb_build_object(
      'classificationAuthority', 'qa_only_tactical_slot_for_visual_and_rule_coverage',
      'officialFootballFact', false,
      'canonicalBroadPositionPreserved', true,
      'productionAllowed', false
    )
  from slotted;

  select jsonb_object_agg(tactical_bucket, bucket_count)
    into v_counts
    from (
      select tactical_bucket, count(*)::integer as bucket_count
        from public.touchline_qa_owner_tactical_slots
       where run_id = p_run_id and user_id = p_user_id
       group by tactical_bucket
    ) counts;

  if v_counts <> jsonb_build_object(
    'GK', 3,
    'CB', 6,
    'RB', 2,
    'LB', 2,
    'CDM', 5,
    'MID', 6,
    'ATT', 6,
    'ST', 5
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QA_TACTICAL_QUOTA_INVALID';
  end if;

  update public.touchline_qa_owner_scenarios
     set metadata = metadata || jsonb_build_object(
       'qaTacticalSlotCounts', v_counts,
       'qaTacticalSlotsApplied', true,
       'officialPositionMutation', false
     )
   where run_id = p_run_id and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'idempotentReplay', false,
    'runId', p_run_id,
    'userId', p_user_id,
    'classifiedCards', 35,
    'tacticalSlotCounts', v_counts
  );
end;
$$;

create or replace function public.touchline_rollback_qa_owner_tactical_slots(
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
  v_removed integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  delete from public.touchline_qa_owner_tactical_slots
   where run_id = p_run_id and user_id = p_user_id;
  get diagnostics v_removed = row_count;
  if v_removed not in (0, 35) then
    raise exception using errcode = 'P0001', message = 'TL_QA_TACTICAL_ROLLBACK_DRIFT';
  end if;

  update public.touchline_qa_owner_scenarios
     set metadata = (metadata - 'qaTacticalSlotCounts' - 'qaTacticalSlotsApplied')
   where run_id = p_run_id and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'idempotentReplay', v_removed = 0,
    'removedClassifications', v_removed
  );
end;
$$;

revoke all on function public.touchline_apply_qa_owner_tactical_slots(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_owner_tactical_slots(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.touchline_apply_qa_owner_tactical_slots(text, uuid, uuid) to service_role;
grant execute on function public.touchline_rollback_qa_owner_tactical_slots(text, uuid, uuid) to service_role;

commit;
