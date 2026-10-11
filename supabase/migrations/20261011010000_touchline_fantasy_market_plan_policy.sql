-- Server-owned Fantasy Market plan policy. A null plan_key preserves every
-- existing entitlement as legacy; this migration never grants or bills access.

begin;
set local lock_timeout = '5s';

alter table public.touchline_fantasy_entitlements
  add column if not exists plan_key text;

alter table public.touchline_fantasy_entitlements
  drop constraint if exists touchline_fantasy_entitlements_plan_key_check,
  add constraint touchline_fantasy_entitlements_plan_key_check
    check (plan_key is null or plan_key in ('beta', 'standard', 'pro', 'master', 'vip'));

comment on column public.touchline_fantasy_entitlements.plan_key is
  'Server-owned Fantasy Market plan. NULL is the preserved legacy contract; no client request, preview, or query parameter may select a plan.';

do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)
    into v_definition;
  v_patched := replace(
    v_definition,
    '  v_previous public.touchline_fantasy_user_gameweeks%rowtype;',
    '  v_previous public.touchline_fantasy_user_gameweeks%rowtype;' || chr(10)
    || '  v_plan_key text;' || chr(10)
    || '  v_effective_budget bigint;' || chr(10)
    || '  v_beta_carry_allowed boolean := false;' || chr(10)
    || '  v_beta_carry_rows jsonb;' || chr(10)
    || '  v_beta_geometry jsonb;'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_MARKET_PLAN_PREPARE_SOURCE_MISMATCH_1';
  end if;
  v_definition := v_patched;
  v_patched := replace(
    v_definition,
    'v_config.budget_eur',
    'v_effective_budget'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_MARKET_PLAN_PREPARE_SOURCE_MISMATCH_2';
  end if;
  v_definition := v_patched;
  v_patched := replace(
    v_definition,
    $before$  if v_previous.id is not null then$before$,
    $after$  if v_previous.id is not null and v_plan_key = 'beta' then
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
        and policy_club.provider = 'sportmonks' and policy_club.provider_team_id::text = any(array['22','117','116','52']::text[])
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
        and coalesce(sum(market_value_eur), 0) <= v_effective_budget
        and coalesce((select max(n) from (select count(*) n from resolved where club_id is not null group by club_id) clubs), 0) <= v_config.max_players_per_club,
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
  elsif v_previous.id is not null then$after$
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_MARKET_PLAN_PREPARE_SOURCE_MISMATCH_3';
  end if;
  v_definition := v_patched;
  v_patched := replace(
    v_definition,
    '  if v_config.id is null then raise exception ''TL_FANTASY_CONFIG_NOT_FOUND''; end if;',
    '  if v_config.id is null then raise exception ''TL_FANTASY_CONFIG_NOT_FOUND''; end if;' || chr(10)
    || '  select entitlement.plan_key into v_plan_key' || chr(10)
    || '  from public.touchline_fantasy_entitlements entitlement' || chr(10)
    || '  where entitlement.user_id = p_user_id' || chr(10)
    || '    and entitlement.entitlement_key = ''fantasy_access''' || chr(10)
    || '    and entitlement.status = ''active''' || chr(10)
    || '    and (entitlement.current_period_start is null or entitlement.current_period_start <= clock_timestamp())' || chr(10)
    || '    and (entitlement.current_period_end is null or entitlement.current_period_end > clock_timestamp())' || chr(10)
    || '  for share;' || chr(10)
    || '  if not found then raise exception ''TL_FANTASY_ENTITLEMENT_REQUIRED''; end if;' || chr(10)
    || '  v_effective_budget := case when v_plan_key = ''beta'' then 50000000 else v_config.budget_eur end;'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_MARKET_PLAN_PREPARE_SOURCE_MISMATCH_4';
  end if;
  execute v_patched;
end
$migration$;

do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure)
    into v_definition;
  v_patched := replace(
    v_definition,
    '  v_max_club integer;',
    '  v_max_club integer;' || chr(10)
    || '  v_plan_key text;' || chr(10)
    || '  v_effective_budget bigint;' || chr(10)
    || '  v_allowed_team_ids text[];'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_MARKET_PLAN_SAVE_SOURCE_MISMATCH_1';
  end if;
  v_definition := v_patched;
  v_patched := replace(
    v_definition,
    'v_config.budget_eur',
    'v_effective_budget'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_MARKET_PLAN_SAVE_SOURCE_MISMATCH_2';
  end if;
  v_definition := v_patched;
  v_patched := replace(
    v_definition,
    'and membership.status = ''active'' and membership.club_id = player.current_club_id',
    'and membership.status = ''active'' and membership.club_id = player.current_club_id' || chr(10)
    || '      and (v_plan_key is distinct from ''beta'' or exists (' || chr(10)
    || '        select 1 from public.football_clubs policy_club' || chr(10)
    || '        where policy_club.id = membership.club_id' || chr(10)
    || '          and policy_club.provider = ''sportmonks''' || chr(10)
    || '          and policy_club.provider_team_id::text = any(v_allowed_team_ids)' || chr(10)
    || '      ))'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_MARKET_PLAN_SAVE_SOURCE_MISMATCH_3';
  end if;
  v_definition := v_patched;
  v_patched := replace(
    v_definition,
    '  if v_config.id is null then raise exception ''TL_FANTASY_CONFIG_NOT_FOUND''; end if;',
    '  if v_config.id is null then raise exception ''TL_FANTASY_CONFIG_NOT_FOUND''; end if;' || chr(10)
    || '  select entitlement.plan_key into v_plan_key' || chr(10)
    || '  from public.touchline_fantasy_entitlements entitlement' || chr(10)
    || '  where entitlement.user_id = p_user_id' || chr(10)
    || '    and entitlement.entitlement_key = ''fantasy_access''' || chr(10)
    || '    and entitlement.status = ''active''' || chr(10)
    || '    and (entitlement.current_period_start is null or entitlement.current_period_start <= clock_timestamp())' || chr(10)
    || '    and (entitlement.current_period_end is null or entitlement.current_period_end > clock_timestamp())' || chr(10)
    || '  for share;' || chr(10)
    || '  if not found then raise exception ''TL_FANTASY_ENTITLEMENT_REQUIRED''; end if;' || chr(10)
    || '  v_effective_budget := case when v_plan_key = ''beta'' then 50000000 else v_config.budget_eur end;' || chr(10)
    || '  v_allowed_team_ids := case when v_plan_key = ''beta'' then array[''22'',''117'',''116'',''52'']::text[] else null end;'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_MARKET_PLAN_SAVE_SOURCE_MISMATCH_4';
  end if;
  execute v_patched;
end
$migration$;

commit;
