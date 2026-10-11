-- Close the command-time race as well as the initializer-time check: an event
-- must still belong to the currently locked/live canonical gameweek.

begin;
set local lock_timeout = '5s';

create or replace function public.touchline_arena_quick_substitution_live_fixture_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_starts_at timestamptz;
  v_source_updated_at timestamptz;
  v_gameweek_state text;
  v_round_id uuid;
  v_gameweek_round_id uuid;
  v_locks_at timestamptz;
  v_last_fixture_at timestamptz;
begin
  select fixture.status, fixture.starts_at, fixture.source_updated_at,
         gameweek.state, fixture.round_id, gameweek.round_id,
         gameweek.locks_at, gameweek.last_fixture_at
    into v_status, v_starts_at, v_source_updated_at,
         v_gameweek_state, v_round_id, v_gameweek_round_id,
         v_locks_at, v_last_fixture_at
    from public.touchline_arena_quick_substitution_sessions as session
    join public.football_fixtures as fixture on fixture.id = session.fixture_id
    join public.touchline_fantasy_gameweeks as gameweek on gameweek.id = session.gameweek_id
   where session.id = new.session_id
     and session.user_id = new.user_id
     and session.fixture_id = fixture.id
     and fixture.provider = 'sportmonks'
     and fixture.round_id = gameweek.round_id
   for share of fixture, gameweek;

  if not found
     or v_gameweek_state not in ('LOCKED', 'LIVE')
     or clock_timestamp() < v_locks_at
     or clock_timestamp() > v_last_fixture_at
     or v_round_id is distinct from v_gameweek_round_id
     or v_status is null
     or lower(regexp_replace(replace(v_status, '_', ' '), '\s+', ' ', 'g')) !~ '^(live|in play|inplay|in progress|1st half|2nd half|half time|ht|extra time|penalties)$'
     or v_starts_at is null
     or v_starts_at > clock_timestamp()
     or v_source_updated_at is null
     or v_source_updated_at < clock_timestamp() - interval '5 minutes'
     or v_source_updated_at > clock_timestamp() + interval '1 minute' then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_FIXTURE_NOT_LIVE_OR_STALE';
  end if;
  return new;
end;
$$;

revoke all on function public.touchline_arena_quick_substitution_live_fixture_guard() from public, anon, authenticated, service_role;

comment on function public.touchline_arena_quick_substitution_live_fixture_guard() is
  'Requires a fresh live canonical fixture inside its persisted locked/live TouchLine gameweek; rejection atomically rolls back the session projection.';

commit;
