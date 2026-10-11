-- Read-only QA catalog snapshot, 2026-10-11; test fixture only.
-- public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text) MD5: c4c11ae4a0f5b69ed57165b67df828dc
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
  if v_total > v_config.budget_eur then raise exception 'TL_FANTASY_BUDGET_EXCEEDED'; end if;
  null; -- Club selection is customer-owned; there is no per-club cap.

  insert into public.touchline_fantasy_user_gameweeks (
    user_id, gameweek_id, selected_coach_id, formation_code, state, budget_eur_snapshot,
    max_players_per_club_snapshot, total_market_value_eur, last_idempotency_key, confirmed_at
  ) values (
    p_user_id, p_gameweek_id, p_selected_coach_id, p_formation_code,
    case when p_action = 'confirm' then 'CONFIRMED' else 'DRAFT' end,
    v_config.budget_eur, v_config.max_players_per_club, v_total, p_idempotency_key,
    case when p_action = 'confirm' then now() else null end
  ) on conflict (user_id, gameweek_id) do update set
    selected_coach_id = excluded.selected_coach_id, formation_code = excluded.formation_code,
    state = excluded.state, budget_eur_snapshot = excluded.budget_eur_snapshot,
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
    'totalMarketValueEur', v_total, 'budgetRemainingEur', v_config.budget_eur - v_total);
end;
$function$;

-- public.touchline_fantasy_prepare_user_gameweek(uuid,uuid) MD5: 63f97cb665363709f67bc763d46f636e
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
    budget_eur_snapshot, max_players_per_club_snapshot, carry_source_user_gameweek_id
  ) values (
    p_user_id, p_gameweek_id, coalesce(v_previous.formation_code, '4-3-3'),
    coalesce(v_previous.locked_coach_id, v_previous.selected_coach_id), 'DRAFT',
    v_config.budget_eur, v_config.max_players_per_club, v_previous.id
  ) returning id into v_existing;

  if v_previous.id is not null then
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
$function$;

-- public.touchline_fantasy_lock_gameweek(uuid) MD5: 99104d42cdd78f30251d9c628dbb2073
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
  on conflict do nothing;
  get diagnostics v_locked = row_count;

  update public.touchline_fantasy_user_gameweeks user_gameweek
  set state = 'LOCKED', locked_coach_id = selected_coach_id, locked_at = v_effective_locks_at
  where user_gameweek.gameweek_id = p_gameweek_id and user_gameweek.state = 'CONFIRMED'
    and user_gameweek.selected_coach_id is not null
    and (select count(*) from public.touchline_fantasy_locked_selections locked
      where locked.user_gameweek_id = user_gameweek.id) = 11;

  insert into public.touchline_fantasy_audit_events (user_id, gameweek_id, event_type, metadata)
  select user_gameweek.user_id, p_gameweek_id, 'XI_LOCKED',
    jsonb_build_object('lockedAt', v_effective_locks_at, 'selectedCoachId', user_gameweek.locked_coach_id)
  from public.touchline_fantasy_user_gameweeks user_gameweek
  where user_gameweek.gameweek_id = p_gameweek_id and user_gameweek.state = 'LOCKED'
    and not exists (select 1 from public.touchline_fantasy_audit_events audit
      where audit.user_id = user_gameweek.user_id and audit.gameweek_id = p_gameweek_id and audit.event_type = 'XI_LOCKED');
  return jsonb_build_object('ok', true, 'lockedSelectionRows', v_locked);
end;
$function$;
