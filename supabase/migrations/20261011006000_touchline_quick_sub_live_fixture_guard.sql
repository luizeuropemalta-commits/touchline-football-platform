-- A durable Quick Sub command may only be applied against a fresh canonical
-- fixture that is actually in play. Rejecting the event insert rolls back the
-- session projection update in the same transaction.

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
begin
  select fixture.status, fixture.starts_at, fixture.source_updated_at
    into v_status, v_starts_at, v_source_updated_at
    from public.touchline_arena_quick_substitution_sessions as session
    join public.football_fixtures as fixture on fixture.id = session.fixture_id
   where session.id = new.session_id
     and session.user_id = new.user_id
     and fixture.provider = 'sportmonks'
     and fixture.round_id is not null;

  if not found
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

create trigger touchline_arena_quick_substitution_live_fixture_guard
  before insert on public.touchline_arena_quick_substitution_events
  for each row execute function public.touchline_arena_quick_substitution_live_fixture_guard();

comment on function public.touchline_arena_quick_substitution_live_fixture_guard() is
  'Allows durable substitution events only for canonical Sportmonks fixtures whose persisted status is live and source timestamp is within five minutes; rejects stale/offline events atomically.';

commit;
