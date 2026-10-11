-- Add a durable, release-linked audit envelope to every immutable Quick Sub
-- command. Refuse to fabricate audit fields for any pre-existing event.

begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.touchline_arena_quick_substitution_events) then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_AUDIT_BACKFILL_REVIEW_REQUIRED';
  end if;
end;
$$;

alter table public.touchline_arena_quick_substitution_events
  add column command_hash text not null check (command_hash ~ '^[0-9a-f]{64}$'),
  add column expected_roster_revision text not null check (length(btrim(expected_roster_revision)) between 1 and 128),
  add column actor_id uuid not null references public.users(id) on delete restrict,
  add column before_state jsonb not null check (jsonb_typeof(before_state) = 'object'),
  add column after_state jsonb not null check (jsonb_typeof(after_state) = 'object'),
  add column release_sha text not null check (release_sha = 'unknown' or release_sha ~ '^[0-9a-f]{40}$');

create unique index touchline_arena_quick_substitution_events_command_hash_idx
  on public.touchline_arena_quick_substitution_events (session_id, command_hash);

revoke all on function public.touchline_arena_quick_substitution_apply(uuid, uuid, uuid, bigint, uuid, uuid) from public, anon, authenticated, service_role;
drop function public.touchline_arena_quick_substitution_apply(uuid, uuid, uuid, bigint, uuid, uuid);

create function public.touchline_arena_quick_substitution_apply(
  p_user_id uuid,
  p_session_id uuid,
  p_command_id uuid,
  p_expected_revision bigint,
  p_expected_roster_revision text,
  p_command_hash text,
  p_release_sha text,
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
  v_before_state jsonb;
  v_after_state jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_QUICK_SUB_SERVICE_ONLY';
  end if;
  if p_user_id is null or p_session_id is null or p_command_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or p_expected_roster_revision is null
     or p_command_hash is null or p_command_hash !~ '^[0-9a-f]{64}$'
     or p_release_sha is null or (p_release_sha <> 'unknown' and p_release_sha !~ '^[0-9a-f]{40}$')
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
  if v_session.roster_revision <> p_expected_roster_revision then
    raise exception using errcode = 'P0001', message = 'TL_QUICK_SUB_STALE_ROSTER_REVISION';
  end if;

  select * into v_event
    from public.touchline_arena_quick_substitution_events
   where command_id = p_command_id;
  if found then
    if v_event.session_id = p_session_id
       and v_event.user_id = p_user_id
       and v_event.actor_id = p_user_id
       and v_event.expected_revision = p_expected_revision
       and v_event.expected_roster_revision = p_expected_roster_revision
       and v_event.command_hash = p_command_hash
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

  v_before_state := jsonb_build_object(
    'activeInventoryIds', to_jsonb(v_session.active_inventory_ids),
    'availableBenchInventoryIds', to_jsonb(v_session.available_bench_inventory_ids),
    'substitutedOutInventoryIds', to_jsonb(v_session.substituted_out_inventory_ids),
    'revision', v_session.revision
  );
  update public.touchline_arena_quick_substitution_sessions
     set active_inventory_ids = array_replace(active_inventory_ids, p_outgoing_inventory_id, p_incoming_inventory_id),
         available_bench_inventory_ids = array_remove(available_bench_inventory_ids, p_incoming_inventory_id),
         substituted_out_inventory_ids = array_append(substituted_out_inventory_ids, p_outgoing_inventory_id),
         revision = revision + 1,
         updated_at = clock_timestamp()
   where id = p_session_id
   returning * into v_session;
  v_after_state := jsonb_build_object(
    'activeInventoryIds', to_jsonb(v_session.active_inventory_ids),
    'availableBenchInventoryIds', to_jsonb(v_session.available_bench_inventory_ids),
    'substitutedOutInventoryIds', to_jsonb(v_session.substituted_out_inventory_ids),
    'revision', v_session.revision
  );

  insert into public.touchline_arena_quick_substitution_events (
    command_id, session_id, user_id, actor_id, expected_revision, resulting_revision,
    expected_roster_revision, command_hash, before_state, after_state, release_sha,
    outgoing_inventory_id, incoming_inventory_id
  ) values (
    p_command_id, p_session_id, p_user_id, p_user_id, p_expected_revision, v_session.revision,
    p_expected_roster_revision, p_command_hash, v_before_state, v_after_state, p_release_sha,
    p_outgoing_inventory_id, p_incoming_inventory_id
  ) returning * into v_event;

  return jsonb_build_object('status', 'applied', 'session', to_jsonb(v_session), 'event', to_jsonb(v_event));
end;
$$;

revoke all on function public.touchline_arena_quick_substitution_apply(uuid, uuid, uuid, bigint, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.touchline_arena_quick_substitution_apply(uuid, uuid, uuid, bigint, text, text, text, uuid, uuid) to service_role;

comment on table public.touchline_arena_quick_substitution_events is
  'Append-only command audit with deterministic server command hash, authenticated actor, expected roster/state revisions, before/after projection, and deployment SHA.';

commit;
