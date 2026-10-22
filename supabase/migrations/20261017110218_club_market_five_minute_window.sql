-- Owner-confirmed window: first kickoff -5m, preceding final whistle +5m.
-- Update the single shared projector; no football values or scoring changes.
begin;
set local lock_timeout='5s';
do $migration$
declare
  definition text := pg_get_functiondef('public.touchline_fantasy_market_window_projection(timestamptz)'::regprocedure);
  patched text;
  pair text[];
begin
  foreach pair slice 1 in array array[
    array['first_fixture_at as locks_at','first_fixture_at - interval ''5 minutes'' as locks_at'],
    array['previous_round_completed_at<locks_at','previous_round_completed_at + interval ''5 minutes''<locks_at'],
    array['then previous_round_completed_at','then previous_round_completed_at + interval ''5 minutes''']
  ] loop
    patched := replace(definition,pair[1],pair[2]);
    if patched=definition then raise exception 'CLUB_FIVE_MINUTE_WINDOW_SOURCE_MISMATCH'; end if;
    definition:=patched;
  end loop;
  execute definition;
end;
$migration$;

create function public.touchline_club_market_is_open(p_season_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from public.touchline_fantasy_market_window_projection(clock_timestamp()) p
    where p.season_id=p_season_id and p.state='MARKET_OPEN');
$$;
revoke all on function public.touchline_club_market_is_open(uuid) from public,anon,authenticated;
grant execute on function public.touchline_club_market_is_open(uuid) to service_role;

-- The projector is intentionally private, including from service_role.
-- Delegate only the required row locks, never its unrestricted read surface.
create function public.touchline_club_lock_open_round(p_season_id uuid)
returns void language plpgsql volatile security definer set search_path='' set lock_timeout='5s' as $$
begin
  perform g.id from public.touchline_fantasy_gameweeks g
    join public.touchline_fantasy_market_window_projection(clock_timestamp()) projected on projected.round_id=g.round_id
    where g.season_id=p_season_id and projected.state='MARKET_OPEN'
    order by g.gameweek_number for update of g;
end;
$$;
revoke all on function public.touchline_club_lock_open_round(uuid) from public,anon,authenticated;
grant execute on function public.touchline_club_lock_open_round(uuid) to service_role;

-- Purchases/allocation must not trust an old materialized MARKET_OPEN row.
do $migration$
declare
  signature text;
  definition text;
  start_at int;
  end_at int;
  marker text := 'raise exception ''CLUB_MARKET_CLOSED'';';
  tail text;
begin
  foreach signature in array array[
    'public.touchline_club_commit_acquisition(uuid,uuid,bigint,jsonb,jsonb)',
    'public.touchline_club_commit_allocation(uuid,uuid,bigint,jsonb,jsonb)',
    'public.touchline_club_initialize_collection(uuid,uuid,text,jsonb)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    start_at:=strpos(definition,'if not exists(select 1 from public.touchline_fantasy_gameweeks g');
    if start_at=0 then raise exception 'CLUB_WINDOW_GUARD_SOURCE_MISMATCH'; end if;
    tail:=substring(definition from start_at);
    end_at:=strpos(tail,marker);
    if end_at=0 then raise exception 'CLUB_WINDOW_GUARD_END_MISSING'; end if;
    tail:=substring(tail from 1 for end_at+length(marker)-1);
    definition:=replace(definition,tail,'if not public.touchline_club_market_is_open(p_season_id) then ' || marker);
    if strpos(definition,E'begin\n')=0 then raise exception 'CLUB_ROUND_LOCK_SOURCE_MISMATCH'; end if;
    -- The closing worker locks the round first. All ownership/allocation
    -- writers take that same lock before a collection lock, then recheck time.
    -- A request crossing the deadline cannot race the immutable XI snapshot.
    definition:=replace(definition,E'begin\n',$lock$begin
  perform public.touchline_club_lock_open_round(p_season_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:' || p_user_id::text,0));
$lock$);
    execute definition;
    execute 'alter function ' || signature || ' set lock_timeout=''5s''';
  end loop;
end;
$migration$;
commit;
