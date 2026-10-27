-- Collection ownership must use its atomic coach economy, never the legacy
-- cancellation endpoint. Preserve legacy contracts and their existing history.
begin;
set local lock_timeout='5s';
do $migration$
declare definition text; marker text:=E'begin\n';
begin
  definition:=pg_get_functiondef('public.touchline_end_coach_contract(uuid,text,text)'::regprocedure);
  if strpos(definition,marker)=0
    or strpos(definition,'update public.touchline_coach_contracts')=0
    or strpos(definition,'TL_COACH_ADMIN_REQUIRED')=0 then
    raise exception 'CLUB_LEGACY_COACH_END_SOURCE_MISMATCH';
  end if;
  -- Same owner mutex as collection initialization and legacy hiring: concurrent
  -- initialization cannot slip between this ownership check and cancellation.
  definition:=replace(definition,marker,$guard$begin
  if coalesce((select auth.jwt() ->> 'role'),'') <> 'service_role' then
    raise exception using errcode='42501',message='TL_COACH_ADMIN_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-club-ownership:' || p_user_id::text,0));
  if exists(select 1 from public.touchline_club_collections owned
    join public.touchline_fantasy_configs config on config.season_id=owned.season_id
    where owned.user_id=p_user_id and config.status='active' and config.competition_key='england') then
    raise exception 'CLUB_COLLECTION_ROUTE_REQUIRED';
  end if;
$guard$);
  execute definition;
end;
$migration$;
commit;
