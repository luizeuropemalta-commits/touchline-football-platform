-- Bind every durable Quick Sub session to the canonical TouchLine gameweek
-- that owns the Sportmonks fixture. The client may name a fixture, but cannot
-- initialize a session for an unrelated or already-final gameweek.

begin;
set local lock_timeout = '5s';

alter table public.touchline_arena_quick_substitution_sessions
  add column gameweek_id uuid references public.touchline_fantasy_gameweeks(id) on delete restrict;

update public.touchline_arena_quick_substitution_sessions as session
   set gameweek_id = gameweek.id
  from public.football_fixtures as fixture
  join public.touchline_fantasy_gameweeks as gameweek on gameweek.round_id = fixture.round_id
 where fixture.id = session.fixture_id;

do $$
begin
  if exists (
    select 1 from public.touchline_arena_quick_substitution_sessions where gameweek_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_GAMEWEEK_BACKFILL_REQUIRED';
  end if;
end;
$$;

alter table public.touchline_arena_quick_substitution_sessions
  alter column gameweek_id set not null;

create index touchline_arena_quick_substitution_sessions_gameweek_idx
  on public.touchline_arena_quick_substitution_sessions (user_id, gameweek_id, fixture_id);

create or replace function public.touchline_arena_quick_substitution_start(
  p_user_id uuid,
  p_fixture_id uuid,
  p_roster_revision text,
  p_starting_inventory_ids uuid[],
  p_bench_inventory_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_all_ids uuid[];
  v_owned_count integer;
  v_gameweek_id uuid;
  v_fixture_starts_at timestamptz;
  v_session public.touchline_arena_quick_substitution_sessions%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_QUICK_SUB_SERVICE_ONLY';
  end if;
  if p_user_id is null or p_fixture_id is null
     or p_roster_revision is null or length(btrim(p_roster_revision)) not between 1 and 128
     or coalesce(cardinality(p_starting_inventory_ids), 0) <> 11
     or coalesce(cardinality(p_bench_inventory_ids), 0) <> 9 then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_INVALID_MATCHDAY';
  end if;

  v_all_ids := p_starting_inventory_ids || p_bench_inventory_ids;
  if (select count(distinct player_id) from unnest(v_all_ids) as ids(player_id)) <> 20
     or array_position(v_all_ids, null) is not null then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_INVALID_MATCHDAY';
  end if;

  select gameweek.id, fixture.starts_at into v_gameweek_id, v_fixture_starts_at
    from public.football_fixtures as fixture
    join public.touchline_fantasy_gameweeks as gameweek on gameweek.round_id = fixture.round_id
   where fixture.id = p_fixture_id
     and fixture.provider = 'sportmonks'
     and fixture.round_id is not null
     and gameweek.state in ('LOCKED', 'LIVE')
     and clock_timestamp() >= gameweek.locks_at
     and clock_timestamp() <= gameweek.last_fixture_at;
  if v_gameweek_id is null then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_MATCH_NOT_ACTIVE';
  end if;
  if v_fixture_starts_at is null then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_MATCH_NOT_ACTIVE';
  end if;

  select count(distinct contract.card_id)::integer
    into v_owned_count
    from public.touchline_card_contracts as contract
   where contract.user_id = p_user_id
     and contract.status = 'active'
     and contract.card_id = any(v_all_ids);
  if v_owned_count <> 20 then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_ROSTER_OWNERSHIP_INVALID';
  end if;

  -- Freeze the user's XI+9 before this fixture starts. Post-kickoff retries
  -- may only return the identical already-persisted matchday selection.
  if clock_timestamp() >= v_fixture_starts_at then
    select * into v_session
      from public.touchline_arena_quick_substitution_sessions
     where user_id = p_user_id and fixture_id = p_fixture_id
     for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_MATCHDAY_ALREADY_STARTED';
    end if;
    if v_session.gameweek_id <> v_gameweek_id
       or v_session.roster_revision <> p_roster_revision
       or v_session.starting_inventory_ids <> p_starting_inventory_ids
       or v_session.bench_inventory_ids <> p_bench_inventory_ids then
      raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_MATCHDAY_CONFLICT';
    end if;
    return to_jsonb(v_session);
  end if;

  insert into public.touchline_arena_quick_substitution_sessions (
    user_id, gameweek_id, fixture_id, roster_revision, starting_inventory_ids,
    bench_inventory_ids, active_inventory_ids, available_bench_inventory_ids
  ) values (
    p_user_id, v_gameweek_id, p_fixture_id, p_roster_revision, p_starting_inventory_ids,
    p_bench_inventory_ids, p_starting_inventory_ids, p_bench_inventory_ids
  ) on conflict (user_id, fixture_id) do nothing;

  select * into v_session
    from public.touchline_arena_quick_substitution_sessions
   where user_id = p_user_id and fixture_id = p_fixture_id
   for update;
  if v_session.gameweek_id <> v_gameweek_id
     or v_session.roster_revision <> p_roster_revision
     or v_session.starting_inventory_ids <> p_starting_inventory_ids
     or v_session.bench_inventory_ids <> p_bench_inventory_ids then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_MATCHDAY_CONFLICT';
  end if;
  return to_jsonb(v_session);
end;
$$;

revoke all on function public.touchline_arena_quick_substitution_start(uuid, uuid, text, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.touchline_arena_quick_substitution_start(uuid, uuid, text, uuid[], uuid[]) to service_role;

comment on column public.touchline_arena_quick_substitution_sessions.gameweek_id is
  'Canonical TouchLine matchweek resolved from the fixture round at session creation; never supplied as client authority.';
comment on function public.touchline_arena_quick_substitution_start(uuid, uuid, text, uuid[], uuid[]) is
  'Creates and freezes the owner’s XI+9 Quick Sub matchday selection before the canonical fixture kickoff. After kickoff only an identical idempotent retry can read the existing session.';

commit;
