-- New collection operations end with the configured football season, even for
-- an entitlement without an expiry or an explicitly open QA market. Before
-- applying remotely, verify the active season's canonical dates; unknown dates
-- fail closed. This migration does not backfill dates or expire/delete holdings.
begin;
set local lock_timeout = '5s';

-- Explicit time makes UTC date boundaries testable without changing server time.
-- This is an internal predicate, not a replacement for ownership/plan checks.
create function public.touchline_club_season_is_open(p_season_id uuid,p_at timestamptz)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(
    select 1 from public.football_seasons s
    join public.touchline_fantasy_configs c on c.season_id=s.id and c.competition_id=s.competition_id
    where s.id=p_season_id and c.competition_key='england' and c.status='active'
      and s.starts_at is not null and s.ends_at is not null
      and isfinite(s.starts_at) and isfinite(s.ends_at) and s.starts_at<=s.ends_at
      and isfinite(p_at)
      and p_at >= (s.starts_at::timestamp at time zone 'UTC')
      and p_at < ((s.ends_at+1)::timestamp at time zone 'UTC')
  );
$$;
revoke all on function public.touchline_club_season_is_open(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.touchline_club_season_is_open(uuid,timestamptz) to service_role;

-- Preserve the installed normal OR authorized QA expression rather than
-- replacing a QA deployment with the production definition. Unknown bodies
-- abort atomically. No QA control is introduced in a normal database.
do $migration$
declare
  signature regprocedure := 'public.touchline_club_market_is_open(uuid)'::regprocedure;
  source text;
  definition text;
  expected text;
  guarded text;
  matched boolean := false;
begin
  select p.prosrc,pg_get_functiondef(p.oid) into source,definition
  from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid=signature and l.lanname='sql' and p.prorettype='boolean'::regtype
    and p.prosecdef and p.provolatile='v';
  if source is null then raise exception 'CLUB_SEASON_GUARD_UNKNOWN_PREDECESSOR'; end if;
  foreach expected in array array[
    'select exists(select 1 from public.touchline_fantasy_market_window_projection(clock_timestamp()) p
      where p.season_id=p_season_id and p.state=''MARKET_OPEN'')',
    'select public.touchline_qa_club_market_is_open(p_season_id)
      or exists(select 1 from public.touchline_fantasy_market_window_projection(clock_timestamp()) p
        where p.season_id=p_season_id and p.state=''MARKET_OPEN'')'
  ] loop
    guarded := 'select public.touchline_club_season_is_open(p_season_id,clock_timestamp()) and ('||expected||');';
    if regexp_replace(source,'[[:space:];]','','g')=regexp_replace(guarded,'[[:space:];]','','g') then
      matched := true; exit;
    end if;
    if regexp_replace(source,'[[:space:];]','','g')=regexp_replace(expected,'[[:space:];]','','g') then
      execute replace(definition,source,E'\n  '||guarded||E'\n');
      matched := true; exit;
    end if;
  end loop;
  if not matched then raise exception 'CLUB_SEASON_GUARD_UNKNOWN_PREDECESSOR'; end if;
end;
$migration$;

-- The QA read snapshot calls this narrower predicate directly. Guard it too so
-- the interface cannot advertise an open QA market outside the season. Leave
-- normal databases without this QA-only function/control entirely unchanged.
do $qa_read$
declare
  signature regprocedure := to_regprocedure('public.touchline_qa_club_market_is_open(uuid)');
  source text;
  definition text;
  expected text := 'select exists(select 1 from public.touchline_qa_club_market_control where season_id=p_season_id and enabled)';
  guarded text;
begin
  if signature is null then return; end if;
  select p.prosrc,pg_get_functiondef(p.oid) into source,definition
  from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid=signature and l.lanname='sql' and p.prorettype='boolean'::regtype
    and p.prosecdef and p.provolatile='s';
  guarded := 'select public.touchline_club_season_is_open(p_season_id,clock_timestamp()) and ('||expected||');';
  if regexp_replace(source,'[[:space:];]','','g')=regexp_replace(guarded,'[[:space:];]','','g') then return; end if;
  if source is null or regexp_replace(source,'[[:space:];]','','g')<>regexp_replace(expected,'[[:space:];]','','g') then
    raise exception 'CLUB_SEASON_GUARD_UNKNOWN_QA_PREDECESSOR';
  end if;
  execute replace(definition,source,E'\n  '||guarded||E'\n');
end;
$qa_read$;

-- Existing collection/operation replay returns before this market predicate.
-- Do not add the calendar guard to the earlier round-lock helper or read paths.
commit;
