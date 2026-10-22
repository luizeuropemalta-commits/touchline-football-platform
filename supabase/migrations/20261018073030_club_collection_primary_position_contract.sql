-- Forward-only positional contract. No accounts, balances, contracts, fixtures or
-- locked scoring snapshots are rewritten. Existing completed commands replay first.
begin;
set local lock_timeout='5s';

create function public.touchline_club_normalize_primary_detail(p_detail text)
returns text language sql immutable strict set search_path='' as $$
  select case normalized when 'left winger' then 'Left Wing' when 'right winger' then 'Right Wing'
    else (select label from unnest(array['Goalkeeper','Centre Back','Right Back','Left Back',
      'Defensive Midfield','Central Midfield','Attacking Midfield','Right Midfield','Left Midfield',
      'Right Wing','Left Wing','Centre Forward']) label where lower(label)=normalized) end
  from (select regexp_replace(lower(trim(p_detail)),'[-[:space:]]+',' ','g') normalized) n;
$$;
create function public.touchline_club_primary_category(p_detail text)
returns text language sql immutable strict set search_path='' as $$
  select case public.touchline_club_normalize_primary_detail(p_detail)
    when 'Goalkeeper' then 'GK' when 'Centre Back' then 'CB' when 'Right Back' then 'RB'
    when 'Left Back' then 'LB' when 'Defensive Midfield' then 'DM'
    when 'Central Midfield' then 'MID' when 'Attacking Midfield' then 'MID'
    when 'Right Midfield' then 'MID' when 'Left Midfield' then 'MID'
    when 'Right Wing' then 'RW' when 'Left Wing' then 'LW' when 'Centre Forward' then 'CF' end;
$$;

-- Same explicit formation/function map as club-primary-position-policy.ts.
create function public.touchline_club_slot_primary_details(p_formation text,p_slot text)
returns text[] language plpgsql immutable set search_path='' as $$
declare roles jsonb; role text;
begin
  if p_formation in ('4-3-3','4-4-2','4-2-3-1','4-1-4-1','4-5-1') then
    roles:='{"GK":"keeper","RB":"rightBack","RCB":"centreBack","LCB":"centreBack","LB":"leftBack"}';
  elsif p_formation in ('3-4-3','3-5-2','3-4-2-1','5-2-3','5-3-2','5-4-1') then
    roles:='{"GK":"keeper","RCB":"centreBack","CB":"centreBack","LCB":"centreBack","RWB":"rightBack","LWB":"leftBack"}';
  else return array[]::text[]; end if;
  roles:=roles || case p_formation
    when '4-3-3' then '{"RCM":"centralLine","CM":"centralLine","LCM":"centralLine","RW":"rightWing","ST":"striker","LW":"leftWing"}'::jsonb
    when '4-4-2' then '{"RM":"rightWidth","LM":"leftWidth","RCM":"pivot","LCM":"pivot","RST":"striker","LST":"striker"}'::jsonb
    when '4-2-3-1' then '{"RDM":"pivot","LDM":"pivot","RAM":"rightWidth","CAM":"insideTen","LAM":"leftWidth","ST":"striker"}'::jsonb
    when '4-1-4-1' then '{"DM":"holding","RM":"rightWidth","LM":"leftWidth","RCM":"advancedInterior","LCM":"advancedInterior","ST":"striker"}'::jsonb
    when '4-5-1' then '{"RM":"rightWidth","LM":"leftWidth","RCM":"centralLine","CM":"centralLine","LCM":"centralLine","ST":"striker"}'::jsonb
    when '3-4-3' then '{"RCM":"pivot","LCM":"pivot","RW":"rightWing","ST":"striker","LW":"leftWing"}'::jsonb
    when '3-5-2' then '{"RCM":"centralLine","CM":"centralLine","LCM":"centralLine","RST":"striker","LST":"striker"}'::jsonb
    when '3-4-2-1' then '{"RCM":"pivot","LCM":"pivot","RAM":"insideTen","LAM":"insideTen","ST":"striker"}'::jsonb
    when '5-2-3' then '{"RCM":"pivot","LCM":"pivot","RW":"rightWing","ST":"striker","LW":"leftWing"}'::jsonb
    when '5-3-2' then '{"RCM":"centralLine","CM":"centralLine","LCM":"centralLine","RST":"striker","LST":"striker"}'::jsonb
    when '5-4-1' then '{"RCM":"pivot","LCM":"pivot","RM":"rightWidth","LM":"leftWidth","ST":"striker"}'::jsonb end;
  role:=roles->>p_slot;
  return case role
    when 'keeper' then array['Goalkeeper'] when 'centreBack' then array['Centre Back']
    when 'rightBack' then array['Right Back'] when 'leftBack' then array['Left Back']
    when 'holding' then array['Defensive Midfield'] when 'pivot' then array['Defensive Midfield','Central Midfield']
    when 'centralLine' then array['Defensive Midfield','Central Midfield','Attacking Midfield']
    when 'advancedInterior' then array['Central Midfield','Attacking Midfield']
    when 'insideTen' then array['Attacking Midfield'] when 'rightWing' then array['Right Wing']
    when 'leftWing' then array['Left Wing'] when 'rightWidth' then array['Right Wing','Right Midfield']
    when 'leftWidth' then array['Left Wing','Left Midfield'] when 'striker' then array['Centre Forward']
    else array[]::text[] end;
end;
$$;

-- Read authoritative current publication, never a caller's display position.
-- Legacy contracts may use this read without being changed or reclassified.
create function public.touchline_club_current_primary_detail(p_player_id uuid)
returns text language plpgsql stable security invoker set search_path='' as $$
declare raw_player text; raw_member text; player_detail text; member_detail text;
begin
  select nullif(trim(f.detailed_position),''),nullif(trim(m.detailed_position),'')
    into raw_player,raw_member
  from public.touchline_card_publications p
    join public.football_players f on f.id=p.player_id
    join public.football_squad_members m on m.id=p.current_membership_id
      and m.player_id=f.id and m.club_id=f.current_club_id and m.status='active'
  where p.player_id=p_player_id and p.publication_status='published'
  order by p.published_at desc nulls last,p.id desc limit 1;
  if not found or (raw_player is null and raw_member is null) then raise exception 'CLUB_PRIMARY_DETAIL_MISSING'; end if;
  player_detail:=public.touchline_club_normalize_primary_detail(raw_player);
  member_detail:=public.touchline_club_normalize_primary_detail(raw_member);
  if (raw_player is not null and player_detail is null) or (raw_member is not null and member_detail is null) then
    raise exception 'CLUB_PRIMARY_DETAIL_UNSUPPORTED'; end if;
  if player_detail is not null and member_detail is not null and player_detail<>member_detail then
    raise exception 'CLUB_PRIMARY_DETAIL_CONFLICT'; end if;
  return coalesce(member_detail,player_detail);
end;
$$;
create function public.touchline_club_owned_primary_detail(p_player jsonb)
returns text language plpgsql stable security invoker set search_path='' as $$
declare detail text; current_detail text;
begin
  current_detail:=public.touchline_club_current_primary_detail((p_player->>'playerId')::uuid);
  if p_player ? 'primaryDetail' then
    detail:=public.touchline_club_normalize_primary_detail(p_player->>'primaryDetail');
    if detail is null or detail is distinct from p_player->>'primaryDetail' then raise exception 'CLUB_PRIMARY_DETAIL_UNSUPPORTED'; end if;
    if detail is distinct from current_detail then raise exception 'CLUB_PRIMARY_DETAIL_CONFLICT'; end if;
  else detail:=current_detail; end if;
  if public.touchline_club_primary_category(detail) is distinct from p_player->>'position' then
    raise exception 'CLUB_PRIMARY_POSITION_CONFLICT'; end if;
  return detail;
end;
$$;

-- At most eleven unfilled XI roles, nine bounded category capacities. This is
-- a feasibility search, not an automatic allocation/reclassification of cards.
create function public.touchline_club_complete_primary_slots(p_slots jsonb,p_remaining jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare category text; remaining int;
begin
  if jsonb_array_length(p_slots)=0 then return true; end if;
  for category in select distinct public.touchline_club_primary_category(value)
    from jsonb_array_elements_text(p_slots->0) loop
    remaining:=(p_remaining->>category)::int;
    if remaining>0 and public.touchline_club_complete_primary_slots(p_slots-0,
      jsonb_set(p_remaining,array[category],to_jsonb(remaining-1))) then return true; end if;
  end loop;
  return false;
end;
$$;
create function public.touchline_club_validate_primary_allocation(p_state jsonb,p_geometry jsonb)
returns void language plpgsql stable security invoker set search_path='' as $$
declare player jsonb; detail text; category text; slot_id text; slot_index int;
  bank text[]:=array['GK','CB','RB','LB','DM','MID','RW','LW','CF'];
  -- Reserve one of every category for the fixed bank, including vacant places.
  remaining jsonb:='{"GK":2,"CB":5,"RB":2,"LB":2,"DM":4,"MID":4,"RW":2,"LW":2,"CF":3}';
  empty_slots jsonb:='[]';
begin
  if p_state->>'formationCode' is not null and (p_geometry is null
    or jsonb_array_length(p_geometry->'slots') is distinct from 11) then raise exception 'CLUB_FORMATION_INVALID'; end if;
  for player in select value from jsonb_array_elements(p_state->'players') loop
    detail:=public.touchline_club_owned_primary_detail(player);
    category:=player->>'position';
    if player->>'area'='reserves' then
      if category is distinct from bank[(player->>'slot')::int+1] then raise exception 'CLUB_SLOT_POSITION_INVALID'; end if;
    else
      remaining:=jsonb_set(remaining,array[category],to_jsonb((remaining->>category)::int-1));
    end if;
    if player->>'area'='starters' then
      slot_id:=p_geometry->'slots'->((player->>'slot')::int)->>'id';
      if not coalesce(detail=any(public.touchline_club_slot_primary_details(p_state->>'formationCode',slot_id)),false)
        then raise exception 'CLUB_SLOT_POSITION_INVALID'; end if;
    end if;
  end loop;
  if exists(select 1 from jsonb_each_text(remaining) r where r.value::int<0) then raise exception 'CLUB_POSITION_COMPLETION_IMPOSSIBLE'; end if;
  if p_state->>'formationCode' is null then return; end if;
  for slot_index in 0..10 loop
    slot_id:=p_geometry->'slots'->slot_index->>'id';
    if cardinality(public.touchline_club_slot_primary_details(p_state->>'formationCode',slot_id))=0 then raise exception 'CLUB_FORMATION_INVALID'; end if;
    if not exists(select 1 from jsonb_array_elements(p_state->'players') p where p->>'area'='starters' and (p->>'slot')::int=slot_index) then
      empty_slots:=empty_slots || jsonb_build_array(to_jsonb(public.touchline_club_slot_primary_details(p_state->>'formationCode',slot_id)));
    end if;
  end loop;
  if not public.touchline_club_complete_primary_slots(empty_slots,remaining) then raise exception 'CLUB_POSITION_COMPLETION_IMPOSSIBLE'; end if;
end;
$$;

create function public.touchline_club_assign_primary_categories(p_slots jsonb,p_remaining jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare category text; result jsonb; remaining int;
begin
  if jsonb_array_length(p_slots)=0 then return p_remaining; end if;
  for category in select value from jsonb_array_elements_text(p_slots->0) loop
    remaining:=(p_remaining->>category)::int;
    if remaining>0 then
      result:=public.touchline_club_assign_primary_categories(p_slots-0,
        jsonb_set(p_remaining,array[category],to_jsonb(remaining-1)));
      if result is not null then return result; end if;
    end if;
  end loop;
  return null;
end;
$$;
-- Deterministic vacant outside labels are also a write contract: an outside
-- purchase cannot silently replace the category displayed before the command.
create function public.touchline_club_planned_outside_category(p_state jsonb,p_geometry jsonb,p_slot int)
returns text language plpgsql stable security invoker set search_path='' as $$
declare player jsonb; slot_id text; slot_index int; candidates jsonb; categories jsonb:='[]';
  category text; vacancy int:=0; n int;
  remaining jsonb:='{"GK":2,"CB":5,"RB":2,"LB":2,"DM":4,"MID":4,"RW":2,"LW":2,"CF":3}';
begin
  perform public.touchline_club_validate_primary_allocation(p_state,p_geometry);
  if p_geometry is null or p_slot not between 0 and 14 then raise exception 'CLUB_FORMATION_INVALID'; end if;
  for player in select value from jsonb_array_elements(p_state->'players') where value->>'area'='outside' loop
    if (player->>'slot')::int=p_slot then return player->>'position'; end if;
    category:=player->>'position';
    remaining:=jsonb_set(remaining,array[category],to_jsonb((remaining->>category)::int-1));
  end loop;
  for slot_index in 0..10 loop
    slot_id:=p_geometry->'slots'->slot_index->>'id';
    select value into player from jsonb_array_elements(p_state->'players')
      where value->>'area'='starters' and (value->>'slot')::int=slot_index;
    if found then candidates:=jsonb_build_array(player->>'position');
    else
      select jsonb_agg(c.category order by case when slot_id ~ 'CM$' and c.category='MID' then 0 else 1 end,c.ordinal)
      into candidates from (
        select public.touchline_club_primary_category(d.detail) category,min(d.ordinal) ordinal
        from unnest(public.touchline_club_slot_primary_details(p_state->>'formationCode',slot_id)) with ordinality d(detail,ordinal)
        group by public.touchline_club_primary_category(d.detail)
      ) c;
    end if;
    categories:=categories || jsonb_build_array(candidates);
  end loop;
  remaining:=public.touchline_club_assign_primary_categories(categories,remaining);
  if remaining is null then raise exception 'CLUB_POSITION_COMPLETION_IMPOSSIBLE'; end if;
  foreach category in array array['GK','CB','RB','LB','DM','MID','RW','LW','CF'] loop
    for n in 1..(remaining->>category)::int loop
      while exists(select 1 from jsonb_array_elements(p_state->'players') p where p->>'area'='outside' and (p->>'slot')::int=vacancy) loop
        vacancy:=vacancy+1;
      end loop;
      if vacancy=p_slot then return category; end if;
      vacancy:=vacancy+1;
    end loop;
  end loop;
  raise exception 'CLUB_POSITION_COMPLETION_IMPOSSIBLE';
end;
$$;

do $migration$
declare signature text; original text; revised text; marker text; start_at int; end_at int; tail text; expected_block text;
begin
  foreach signature in array array[
    'public.touchline_club_commit_acquisition(uuid,uuid,bigint,jsonb,jsonb)',
    'public.touchline_club_commit_allocation(uuid,uuid,bigint,jsonb,jsonb)'
  ] loop
    original:=pg_get_functiondef(signature::regprocedure); revised:=original;
    if signature like '%commit_acquisition%' then
      if strpos(original,'CLUB_TEAM_LIMIT')>0 then raise exception 'CLUB_PRIMARY_REQUIRES_CAP_RETIREMENT'; end if;
      marker:='  v_price := (v_player->>''valueEur'')::numeric;';
      if strpos(revised,marker)=0 then raise exception 'CLUB_PRIMARY_SOURCE_MISMATCH'; end if;
      revised:=replace(revised,marker,$guard$
  if v_player->>'primaryDetail' is distinct from public.touchline_club_current_primary_detail((v_player->>'playerId')::uuid)
    or public.touchline_club_primary_category(v_player->>'primaryDetail') is distinct from v_player->>'position' then
    raise exception 'CLUB_PRIMARY_POSITION_CONFLICT'; end if;
$guard$ || marker);
      start_at:=strpos(revised,'  if v_player->>''area''=''starters'' then');
      expected_block:=$old$  if v_player->>'area'='starters' then
    select geometry into v_geometry from public.touchline_formation_geometry_versions
      where formation_code=p_next->>'formationCode' and status='published' order by geometry_version desc limit 1;
    if v_geometry is null or jsonb_array_length(v_geometry->'slots')<>11 then raise exception 'CLUB_FORMATION_INVALID'; end if;
    if not coalesce((v_geometry->'slots'->((v_player->>'slot')::int)->'allowedPositions') ?
      (case v_player->>'position' when 'GK' then 'goalkeeper' when 'CB' then 'centre-back'
        when 'RB' then 'right-back' when 'LB' then 'left-back' when 'DM' then 'defensive-midfield'
        when 'MID' then 'midfield' when 'RW' then 'attacker' when 'LW' then 'attacker'
        when 'CF' then 'centre-forward' end),false) then raise exception 'CLUB_SLOT_POSITION_INVALID'; end if;
  end if;
$old$;
    else
      start_at:=strpos(revised,'  select geometry into v_geometry from public.touchline_formation_geometry_versions');
      expected_block:=$old$  select geometry into v_geometry from public.touchline_formation_geometry_versions
    where formation_code=p_next->>'formationCode' and status='published' order by geometry_version desc limit 1;
  if v_geometry is null or jsonb_array_length(v_geometry->'slots')<>11 then raise exception 'CLUB_FORMATION_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_next->'players') p where p->>'area'='starters'
    and not coalesce((v_geometry->'slots'->((p->>'slot')::int)->'allowedPositions') ? (case p->>'position'
      when 'GK' then 'goalkeeper' when 'CB' then 'centre-back' when 'RB' then 'right-back' when 'LB' then 'left-back'
      when 'DM' then 'defensive-midfield' when 'MID' then 'midfield' when 'RW' then 'attacker'
      when 'LW' then 'attacker' when 'CF' then 'centre-forward' end),false)) then raise exception 'CLUB_SLOT_POSITION_INVALID'; end if;
$old$;
    end if;
    if start_at=0 then raise exception 'CLUB_PRIMARY_SLOT_SOURCE_MISMATCH'; end if;
    tail:=substring(revised from start_at);
    end_at:=strpos(tail,'  update public.touchline_club_collections set state=p_next');
    if end_at=0 then raise exception 'CLUB_PRIMARY_UPDATE_SOURCE_MISMATCH'; end if;
    if substring(tail from 1 for end_at-1) is distinct from expected_block then
      raise exception 'CLUB_PRIMARY_UNKNOWN_PREDECESSOR'; end if;
    revised:=replace(revised,substring(tail from 1 for end_at-1),$slots$
  select geometry into v_geometry from public.touchline_formation_geometry_versions
    where formation_code=p_next->>'formationCode' and status='published' order by geometry_version desc limit 1;
  perform public.touchline_club_validate_primary_allocation(p_next,v_geometry);
$slots$);
    if signature like '%commit_acquisition%' then
      marker:='  perform public.touchline_club_validate_primary_allocation(p_next,v_geometry);';
      revised:=replace(revised,marker,$outside$
  if v_player->>'area'='outside' and v_player->>'position' is distinct from
    public.touchline_club_planned_outside_category(v_current.state,v_geometry,(v_player->>'slot')::int) then
    raise exception 'CLUB_SLOT_POSITION_INVALID'; end if;
$outside$ || marker);
    end if;
    execute revised;
  end loop;
  -- The round projection still retains deadline, identity/publication, budget,
  -- immutable-round and idempotency guards. Only broad slot eligibility changes.
  signature:='public.touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text)';
  original:=pg_get_functiondef(signature::regprocedure); revised:=original;
  marker:='  if v_geometry is null then raise exception ''TL_FANTASY_FORMATION_NOT_PUBLISHED''; end if;';
  if strpos(revised,marker)=0 then raise exception 'CLUB_PRIMARY_PROJECTION_SOURCE_MISMATCH'; end if;
  revised:=replace(revised,marker,marker || E'\n' || '  perform public.touchline_club_validate_primary_allocation(v_collection.state,v_geometry);');
  marker:=$guard$exists (select 1 from jsonb_array_elements_text(coalesce(slot.value -> 'allowedPositions', '[]'::jsonb)) allowed(value)
        where allowed.value = eligible.position_bucket) position_allowed$guard$;
  if strpos(revised,marker)=0 then raise exception 'CLUB_PRIMARY_PROJECTION_SLOT_MISMATCH'; end if;
  revised:=replace(revised,marker,$guard$exists (select 1 from jsonb_array_elements(v_collection.state->'players') owned
        where owned->>'playerId'=requested.player_id::text
          and public.touchline_club_owned_primary_detail(owned)=any(public.touchline_club_slot_primary_details(p_formation_code,requested.slot_id))) position_allowed$guard$);
  execute revised;
end;
$migration$;

-- Pure helpers also remain private: no new browser-callable RPC surface.
do $acl$
declare signature text;
begin
  foreach signature in array array[
    'touchline_club_normalize_primary_detail(text)','touchline_club_primary_category(text)',
    'touchline_club_slot_primary_details(text,text)','touchline_club_current_primary_detail(uuid)',
    'touchline_club_owned_primary_detail(jsonb)','touchline_club_complete_primary_slots(jsonb,jsonb)',
    'touchline_club_validate_primary_allocation(jsonb,jsonb)',
    'touchline_club_assign_primary_categories(jsonb,jsonb)',
    'touchline_club_planned_outside_category(jsonb,jsonb,integer)'
  ] loop
    execute 'revoke all on function public.' || signature || ' from public,anon,authenticated';
    execute 'grant execute on function public.' || signature || ' to service_role';
  end loop;
end;
$acl$;
commit;
