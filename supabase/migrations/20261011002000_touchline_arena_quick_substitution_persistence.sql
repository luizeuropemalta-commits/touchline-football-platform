-- Server-owned, fixture-scoped Quick Substitution state.
-- This migration creates a persistence contract only; no client route or
-- worker is enabled by applying it. Initialization remains service-role-only
-- until a server-owned active matchday source is wired and validated.

begin;
set local lock_timeout = '5s';

create table public.touchline_arena_quick_substitution_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  fixture_id uuid not null references public.football_fixtures(id) on delete restrict,
  roster_revision text not null check (length(btrim(roster_revision)) between 1 and 128),
  starting_inventory_ids uuid[] not null check (cardinality(starting_inventory_ids) = 11),
  bench_inventory_ids uuid[] not null check (cardinality(bench_inventory_ids) = 9),
  active_inventory_ids uuid[] not null check (cardinality(active_inventory_ids) = 11),
  available_bench_inventory_ids uuid[] not null check (cardinality(available_bench_inventory_ids) <= 9),
  substituted_out_inventory_ids uuid[] not null default '{}',
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (user_id, fixture_id)
);

create table public.touchline_arena_quick_substitution_events (
  command_id uuid primary key,
  session_id uuid not null references public.touchline_arena_quick_substitution_sessions(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  expected_revision bigint not null check (expected_revision >= 0),
  resulting_revision bigint not null check (resulting_revision = expected_revision + 1),
  outgoing_inventory_id uuid not null references public.touchline_card_inventory(id) on delete restrict,
  incoming_inventory_id uuid not null references public.touchline_card_inventory(id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (session_id, resulting_revision),
  check (outgoing_inventory_id <> incoming_inventory_id)
);

create index touchline_arena_quick_substitution_events_session_idx
  on public.touchline_arena_quick_substitution_events (session_id, resulting_revision);

alter table public.touchline_arena_quick_substitution_sessions enable row level security;
alter table public.touchline_arena_quick_substitution_events enable row level security;

create policy "Owners read own Quick Sub sessions"
  on public.touchline_arena_quick_substitution_sessions
  for select to authenticated using (auth.uid() = user_id);
create policy "Owners read own Quick Sub events"
  on public.touchline_arena_quick_substitution_events
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.touchline_arena_quick_substitution_sessions from public, anon, authenticated, service_role;
revoke all on public.touchline_arena_quick_substitution_events from public, anon, authenticated, service_role;
grant select on public.touchline_arena_quick_substitution_sessions to authenticated, service_role;
grant select on public.touchline_arena_quick_substitution_events to authenticated, service_role;

create or replace function public.touchline_arena_quick_substitution_events_are_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'TL_QUICK_SUB_EVENT_IMMUTABLE';
end;
$$;

create trigger touchline_arena_quick_substitution_events_immutable
  before update or delete on public.touchline_arena_quick_substitution_events
  for each row execute function public.touchline_arena_quick_substitution_events_are_immutable();

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

  perform fixture.id
    from public.football_fixtures as fixture
   where fixture.id = p_fixture_id
     and fixture.provider = 'sportmonks'
     and fixture.round_id is not null;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_MATCH_NOT_CANONICAL';
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

  insert into public.touchline_arena_quick_substitution_sessions (
    user_id, fixture_id, roster_revision, starting_inventory_ids,
    bench_inventory_ids, active_inventory_ids, available_bench_inventory_ids
  ) values (
    p_user_id, p_fixture_id, p_roster_revision, p_starting_inventory_ids,
    p_bench_inventory_ids, p_starting_inventory_ids, p_bench_inventory_ids
  ) on conflict (user_id, fixture_id) do nothing;

  select * into v_session
    from public.touchline_arena_quick_substitution_sessions
   where user_id = p_user_id and fixture_id = p_fixture_id
   for update;
  if v_session.roster_revision <> p_roster_revision
     or v_session.starting_inventory_ids <> p_starting_inventory_ids
     or v_session.bench_inventory_ids <> p_bench_inventory_ids then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_MATCHDAY_CONFLICT';
  end if;
  return to_jsonb(v_session);
end;
$$;

create or replace function public.touchline_arena_quick_substitution_apply(
  p_user_id uuid,
  p_session_id uuid,
  p_command_id uuid,
  p_expected_revision bigint,
  p_outgoing_inventory_id uuid,
  p_incoming_inventory_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.touchline_arena_quick_substitution_sessions%rowtype;
  v_event public.touchline_arena_quick_substitution_events%rowtype;
  v_slot integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_QUICK_SUB_SERVICE_ONLY';
  end if;
  if p_user_id is null or p_session_id is null or p_command_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or p_outgoing_inventory_id is null or p_incoming_inventory_id is null
     or p_outgoing_inventory_id = p_incoming_inventory_id then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_INVALID_COMMAND';
  end if;

  select * into v_session
    from public.touchline_arena_quick_substitution_sessions
   where id = p_session_id and user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_SESSION_NOT_FOUND';
  end if;

  select * into v_event
    from public.touchline_arena_quick_substitution_events
   where command_id = p_command_id;
  if found then
    if v_event.session_id = p_session_id
       and v_event.user_id = p_user_id
       and v_event.expected_revision = p_expected_revision
       and v_event.outgoing_inventory_id = p_outgoing_inventory_id
       and v_event.incoming_inventory_id = p_incoming_inventory_id then
      return jsonb_build_object('status', 'replayed', 'session', to_jsonb(v_session), 'event', to_jsonb(v_event));
    end if;
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_COMMAND_ID_CONFLICT';
  end if;

  if v_session.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_STALE_REVISION';
  end if;
  v_slot := array_position(v_session.active_inventory_ids, p_outgoing_inventory_id);
  if v_slot is null then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_OUTGOING_NOT_ACTIVE';
  end if;
  if p_incoming_inventory_id = any(v_session.substituted_out_inventory_ids) then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_PLAYER_CANNOT_REENTER';
  end if;
  if p_incoming_inventory_id = any(v_session.active_inventory_ids) then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_INCOMING_ALREADY_ACTIVE';
  end if;
  if not (p_incoming_inventory_id = any(v_session.available_bench_inventory_ids)) then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_INCOMING_NOT_ON_BENCH';
  end if;

  update public.touchline_arena_quick_substitution_sessions
     set active_inventory_ids = array_replace(active_inventory_ids, p_outgoing_inventory_id, p_incoming_inventory_id),
         available_bench_inventory_ids = array_remove(available_bench_inventory_ids, p_incoming_inventory_id),
         substituted_out_inventory_ids = array_append(substituted_out_inventory_ids, p_outgoing_inventory_id),
         revision = revision + 1,
         updated_at = clock_timestamp()
   where id = p_session_id
   returning * into v_session;

  insert into public.touchline_arena_quick_substitution_events (
    command_id, session_id, user_id, expected_revision, resulting_revision,
    outgoing_inventory_id, incoming_inventory_id
  ) values (
    p_command_id, p_session_id, p_user_id, p_expected_revision, v_session.revision,
    p_outgoing_inventory_id, p_incoming_inventory_id
  ) returning * into v_event;

  return jsonb_build_object('status', 'applied', 'session', to_jsonb(v_session), 'event', to_jsonb(v_event));
end;
$$;

revoke all on function public.touchline_arena_quick_substitution_events_are_immutable() from public, anon, authenticated, service_role;
revoke all on function public.touchline_arena_quick_substitution_start(uuid, uuid, text, uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.touchline_arena_quick_substitution_apply(uuid, uuid, uuid, bigint, uuid, uuid) from public, anon, authenticated;
grant execute on function public.touchline_arena_quick_substitution_start(uuid, uuid, text, uuid[], uuid[]) to service_role;
grant execute on function public.touchline_arena_quick_substitution_apply(uuid, uuid, uuid, bigint, uuid, uuid) to service_role;

comment on table public.touchline_arena_quick_substitution_sessions is
  'Server-owned per-owner/per-fixture 11+9 Quick Sub match snapshot and durable current projection. No roster/XI mutation is performed.';
comment on table public.touchline_arena_quick_substitution_events is
  'Append-only command audit for Quick Sub. Events cannot be edited or deleted; the current feature has no correction/retraction operation.';
comment on function public.touchline_arena_quick_substitution_start(uuid, uuid, text, uuid[], uuid[]) is
  'Service-role-only initializer. Caller must first resolve an authorized canonical active matchday and validate the current server-owned XI/bench; this RPC rechecks official fixture identity, exact 11+9 uniqueness and active contract ownership.';
comment on function public.touchline_arena_quick_substitution_apply(uuid, uuid, uuid, bigint, uuid, uuid) is
  'Service-role-only, row-locked idempotent Quick Sub command. Substituted-out players are never returned to the bench or allowed to re-enter.';

commit;
