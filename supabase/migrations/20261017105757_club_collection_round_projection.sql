-- Add collection ownership to the existing scoring journey. Football scoring,
-- existing immutable rounds and Beta's legacy journey are not rewritten.
begin;
set local lock_timeout='5s';
alter table public.touchline_fantasy_user_gameweeks
  add column collection_revision_snapshot bigint,
  add column collection_related_snapshot jsonb;

create function public.touchline_club_round_is_owned(p_user_gameweek_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce((select
    ug.collection_revision_snapshot is not null
    and jsonb_typeof(ug.collection_related_snapshot)='array'
    and jsonb_array_length(ug.collection_related_snapshot) between 11 and 20
    and jsonb_array_length(ug.collection_related_snapshot)=(select count(*) from jsonb_array_elements(c.state->'players') p where p->>'area' in ('starters','reserves'))
    and ug.market_plan_key_snapshot=c.state->>'plan'
    and ug.selected_coach_id=c.state->'coach'->>'id'
    and not exists(select 1 from jsonb_array_elements(ug.collection_related_snapshot) related
      where not exists(select 1 from jsonb_array_elements(c.state->'players') owned
        where owned->>'playerId'=related->>'playerId' and owned->>'area'=related->>'area' and owned->'slot'=related->'slot'))
    and (select count(*) from public.touchline_fantasy_user_gameweek_selections s where s.user_gameweek_id=ug.id)=11
    and not exists(select 1 from public.touchline_fantasy_user_gameweek_selections s
      where s.user_gameweek_id=ug.id and not exists(select 1 from jsonb_array_elements(c.state->'players') owned
        where owned->>'playerId'=s.player_id::text and owned->>'area'='starters'))
    and ug.budget_eur_snapshot is not null
    and (select coalesce(sum(s.market_value_eur),0) from public.touchline_fantasy_user_gameweek_selections s
      where s.user_gameweek_id=ug.id)<=ug.budget_eur_snapshot
    from public.touchline_fantasy_user_gameweeks ug
    join public.touchline_fantasy_gameweeks g on g.id=ug.gameweek_id
    join public.touchline_club_collections c on c.user_id=ug.user_id and c.season_id=g.season_id
    where ug.id=p_user_gameweek_id),false);
$$;
revoke all on function public.touchline_club_round_is_owned(uuid) from public,anon,authenticated;
grant execute on function public.touchline_club_round_is_owned(uuid) to service_role;

create function public.touchline_club_round_snapshot_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.state in ('LOCKED','FINAL') and row(new.collection_revision_snapshot,new.collection_related_snapshot)
    is distinct from row(old.collection_revision_snapshot,old.collection_related_snapshot) then
    raise exception 'TL_FANTASY_LOCKED_SNAPSHOT_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger touchline_club_round_snapshot_immutable before update
on public.touchline_fantasy_user_gameweeks for each row execute function public.touchline_club_round_snapshot_immutable();

-- Reuse the complete installed save validator (publication, formation, wall
-- clock, entitlements, audit and snapshots); fail on an unknown predecessor.
do $migration$
declare
  original text;
  definition text;
  marker text;
begin
  original := pg_get_functiondef('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure);
  definition := replace(original,'FUNCTION public.touchline_fantasy_save_lineup(', 'FUNCTION public.touchline_club_project_lineup(');
  if definition=original then raise exception 'CLUB_PROJECTION_SOURCE_MISMATCH_NAME'; end if;
  marker := '  perform public.touchline_fantasy_sync_gameweeks();';
  if strpos(definition,marker)=0 then raise exception 'CLUB_PROJECTION_SOURCE_MISMATCH_SYNC'; end if;
  -- The wrapper synchronizes before taking any round/collection locks.
  definition := replace(definition,marker,'  -- Round synchronization belongs to the outer wrapper.');
  marker := '  v_max_club integer;';
  if strpos(definition,marker)=0 then raise exception 'CLUB_PROJECTION_SOURCE_MISMATCH_DECLARATION'; end if;
  definition := replace(definition,marker,marker || E'\n  v_collection public.touchline_club_collections%rowtype;');
  marker := '  if v_config.id is null then raise exception ''TL_FANTASY_CONFIG_NOT_FOUND''; end if;';
  if strpos(definition,marker)=0 then raise exception 'CLUB_PROJECTION_SOURCE_MISMATCH_CONFIG'; end if;
  definition := replace(definition,marker,marker || $guard$
  select * into v_collection from public.touchline_club_collections
    where user_id=p_user_id and season_id=v_gameweek.season_id for update;
  if not found then raise exception 'CLUB_COLLECTION_REQUIRED'; end if;
  if v_collection.state->'coach'->>'id' is distinct from p_selected_coach_id
    or v_collection.state->>'formationCode' is distinct from p_formation_code then
    raise exception 'CLUB_LINEUP_OWNERSHIP_MISMATCH'; end if;
  -- Original XI budget is not a second wallet. Its scoring snapshot records
  -- the already-funded collection envelope, including coach debit separately.
  v_effective_budget := (v_collection.state->>'balanceEur')::bigint +
    (select coalesce(sum((p->>'valueEur')::bigint),0) from jsonb_array_elements(v_collection.state->'players') p);
  if exists(select 1 from jsonb_array_elements(v_collection.state->'players') p
    where not (p ? 'transferException') group by p->>'clubId' having count(*)>3) then
    raise exception 'CLUB_TEAM_LIMIT'; end if;
  if jsonb_array_length(p_selections)<>(select count(*) from jsonb_array_elements(v_collection.state->'players') p where p->>'area'='starters')
    or exists(select 1 from jsonb_array_elements(p_selections) requested
      where not exists(select 1 from jsonb_array_elements(v_collection.state->'players') p
        where p->>'playerId'=requested->>'playerId' and p->>'area'='starters')) then
    raise exception 'CLUB_LINEUP_OWNERSHIP_MISMATCH'; end if;
$guard$);
  -- The installed function resolves the legacy budget after config lookup.
  -- Override again immediately before the cost guard, retaining that guard.
  marker := '  if v_effective_budget is not null and v_total > v_effective_budget then';
  if strpos(definition,marker)=0 then raise exception 'CLUB_PROJECTION_SOURCE_MISMATCH_BUDGET'; end if;
  definition := replace(definition,marker,$budget$
  if v_collection.state->>'plan' is distinct from v_plan_key then raise exception 'CLUB_PLAN_MISMATCH'; end if;
  v_effective_budget := (v_collection.state->>'balanceEur')::bigint +
    (select coalesce(sum((p->>'valueEur')::bigint),0) from jsonb_array_elements(v_collection.state->'players') p);
$budget$ || marker);
  marker := '  if v_max_club > v_config.max_players_per_club then raise exception ''TL_FANTASY_CLUB_LIMIT_EXCEEDED''; end if;';
  -- QA also has the explicit 20260826203421 legacy cap removal applied.
  -- Accept only that known predecessor; unknown source still fails closed.
  if strpos(definition,marker)=0 then
    marker := '  null; -- Club selection is customer-owned; there is no per-club cap.';
  end if;
  if strpos(definition,marker)=0 then raise exception 'CLUB_PROJECTION_SOURCE_MISMATCH_QUOTA'; end if;
  definition := replace(definition,marker,'  -- Full collection quota was validated above, including non-transferable exceptions.');
  marker := '  delete from public.touchline_fantasy_user_gameweek_selections where user_gameweek_id = v_user_gameweek_id;';
  if strpos(definition,marker)=0 then raise exception 'CLUB_PROJECTION_SOURCE_MISMATCH_SNAPSHOT'; end if;
  definition := replace(definition,marker,$snapshot$
  update public.touchline_fantasy_user_gameweeks set collection_revision_snapshot=v_collection.revision,
    collection_related_snapshot=(select coalesce(jsonb_agg(jsonb_build_object('playerId',p->>'playerId','area',p->>'area','slot',p->'slot')),'[]'::jsonb)
      from jsonb_array_elements(v_collection.state->'players') p where p->>'area' in ('starters','reserves'))
    where id=v_user_gameweek_id;
$snapshot$ || marker);
  execute definition;
  -- Accounts moved to the new ownership model cannot use the old free-XI API.
  marker := '  if v_config.id is null then raise exception ''TL_FANTASY_CONFIG_NOT_FOUND''; end if;';
  execute replace(original,marker,marker || $legacy$
  if exists(select 1 from public.touchline_club_collections where user_id=p_user_id and season_id=v_gameweek.season_id) then
    raise exception 'CLUB_COLLECTION_ROUTE_REQUIRED'; end if;
$legacy$);
end;
$migration$;
revoke all on function public.touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text) from public,anon,authenticated,service_role;

-- One mutex order: synchronize -> user/round -> round -> collection. The core then
-- reacquires the same locks. Retry proof is stored with the collection command.
create function public.touchline_club_save_lineup(
  p_user_id uuid,p_gameweek_id uuid,p_selected_coach_id text,p_formation_code text,p_selections jsonb,
  p_action text,p_idempotency_key text,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_season uuid;
  v_collection public.touchline_club_collections%rowtype;
  v_prior public.touchline_club_collection_operations%rowtype;
  v_command jsonb;
  v_result jsonb;
  v_geometry jsonb;
begin
  perform public.touchline_fantasy_sync_gameweeks();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_gameweek_id::text,0));
  select season_id into v_season from public.touchline_fantasy_gameweeks where id=p_gameweek_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:' || p_user_id::text,0));
  select * into v_collection from public.touchline_club_collections where user_id=p_user_id and season_id=v_season for update;
  if not found then raise exception 'CLUB_COLLECTION_REQUIRED'; end if;
  v_command := jsonb_build_object('action','lineup','gameweekId',p_gameweek_id,'coachId',p_selected_coach_id,'formationCode',p_formation_code,
    'selections',p_selections,'mode',p_action,'expectedRevision',p_expected_revision,'idempotencyKey',p_idempotency_key);
  select * into v_prior from public.touchline_club_collection_operations where user_id=p_user_id and season_id=v_season and idempotency_key=p_idempotency_key;
  if found then
    if v_prior.command is distinct from v_command then raise exception 'CLUB_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('ok',true,'replayed',true);
  end if;
  if p_expected_revision is distinct from v_collection.revision then raise exception 'CLUB_STALE_REVISION'; end if;
  select geometry into v_geometry from public.touchline_formation_geometry_versions
    where formation_code=p_formation_code and status='published' order by geometry_version desc limit 1;
  if v_geometry is null or exists(select 1 from jsonb_array_elements(p_selections) requested
    where not exists(select 1 from jsonb_array_elements(v_collection.state->'players') owned
      where owned->>'playerId'=requested->>'playerId' and owned->>'area'='starters'
        and v_geometry->'slots'->((owned->>'slot')::int)->>'id'=requested->>'slotId')) then raise exception 'CLUB_LINEUP_OWNERSHIP_MISMATCH'; end if;
  v_result := public.touchline_club_project_lineup(p_user_id,p_gameweek_id,p_selected_coach_id,p_formation_code,p_selections,p_action,p_idempotency_key);
  insert into public.touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision)
    values(p_user_id,v_season,p_idempotency_key,v_command,v_collection.revision);
  return v_result;
end;
$$;
revoke all on function public.touchline_club_save_lineup(uuid,uuid,text,text,jsonb,text,text,bigint) from public,anon,authenticated;
grant execute on function public.touchline_club_save_lineup(uuid,uuid,text,text,jsonb,text,text,bigint) to service_role;
alter function public.touchline_club_save_lineup(uuid,uuid,text,text,jsonb,text,text,bigint) set lock_timeout='5s';

-- New ownership is not the legacy free XI carry. Preserve predecessor guards
-- and existing drafts, but prepare an empty draft that must be explicitly saved
-- from the current collection. Never resurrect a traded/released old player.
do $migration$
declare
  definition text := pg_get_functiondef('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure);
  marker text := '  select user_gameweek.* into v_previous';
begin
  if strpos(definition,marker)=0 then raise exception 'CLUB_PREPARE_SOURCE_MISMATCH'; end if;
  execute replace(definition,marker,$owned$
  if exists(select 1 from public.touchline_club_collections c where c.user_id=p_user_id and c.season_id=v_gameweek.season_id) then
    insert into public.touchline_fantasy_user_gameweeks(
      user_id,gameweek_id,formation_code,selected_coach_id,state,budget_eur_snapshot,market_plan_key_snapshot,max_players_per_club_snapshot
    ) select p_user_id,p_gameweek_id,coalesce(c.state->>'formationCode','4-3-3'),c.state->'coach'->>'id','DRAFT',
      (c.state->>'balanceEur')::bigint+(select coalesce(sum((p->>'valueEur')::bigint),0) from jsonb_array_elements(c.state->'players') p),
      c.state->>'plan',3
      from public.touchline_club_collections c where c.user_id=p_user_id and c.season_id=v_gameweek.season_id
      returning id into v_existing;
    return v_existing;
  end if;
$owned$ || marker);
end;
$migration$;

-- Apply ownership to both halves of the existing lock, while keeping the old
-- budget guard intact for unconverted/Beta accounts and historical snapshots.
do $migration$
declare
  definition text := pg_get_functiondef('public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure);
  original_guard text;
  start_at int;
  end_at int;
begin
  start_at := strpos(definition,'    and case user_gameweek.market_plan_key_snapshot');
  end_at := strpos(substring(definition from start_at),'    and exists (');
  if start_at=0 or end_at=0 then raise exception 'CLUB_LOCK_SOURCE_MISMATCH'; end if;
  original_guard := substring(definition from start_at for end_at-1);
  if (length(definition)-length(replace(definition,original_guard,'')))/length(original_guard)<>2 then raise exception 'CLUB_LOCK_SOURCE_MISMATCH_COUNT'; end if;
  execute replace(definition,original_guard,'    and (case when user_gameweek.collection_revision_snapshot is not null then public.touchline_club_round_is_owned(user_gameweek.id) else ('
    || substring(original_guard from 9) || ') end)' || E'\n');
end;
$migration$;
commit;
