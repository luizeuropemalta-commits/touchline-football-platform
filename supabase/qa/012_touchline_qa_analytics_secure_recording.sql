-- TouchLine Development QA only. Do not add this file to supabase/migrations.
-- Apply only to the isolated QA project xgxbwqxjssxxuihuwmgy in this mission.
-- Concurrent observations for one authenticated principal fail fast instead of
-- waiting on a transaction lock and consuming database connection capacity.

begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create index if not exists touchline_analytics_sessions_user_last_seen_idx
  on public.touchline_analytics_sessions(user_id, last_seen_at desc);

drop function if exists public.touchline_record_analytics_observation(
  uuid, uuid, text, text, integer
);

create or replace function public.touchline_record_analytics_observation(
  p_session_id uuid,
  p_user_id uuid,
  p_area text,
  p_device text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.touchline_analytics_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_user_last_observation_at timestamptz;
  v_user_elapsed_seconds integer := 0;
  v_credited_seconds integer := 0;
  v_total_sessions integer := 0;
  v_inserted_rows integer := 0;
  v_principal_lock_acquired boolean := false;
  v_session_limit constant integer := 64;
  v_minimum_cadence_seconds constant integer := 10;
  v_maximum_credit_seconds constant integer := 15;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_ANALYTICS_SERVICE_ROLE_REQUIRED';
  end if;
  if p_session_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'TL_ANALYTICS_ID_REQUIRED';
  end if;
  if p_area is null or p_area <> all (array[
    'arena', 'club-owner', 'club', 'player', 'market',
    'training', 'ranking', 'admin', 'other'
  ]) then
    raise exception using errcode = '22023', message = 'TL_ANALYTICS_AREA_INVALID';
  end if;
  if p_device is null or p_device <> all (array['mobile', 'tablet', 'desktop', 'unknown']) then
    raise exception using errcode = '22023', message = 'TL_ANALYTICS_DEVICE_INVALID';
  end if;

  -- Never queue concurrent requests for the same principal. The caller treats
  -- this status as a normal 429 and retries on the next activity cadence.
  v_principal_lock_acquired := pg_try_advisory_xact_lock(
    hashtextextended('touchline-analytics:' || p_user_id::text, 0)
  );
  if not v_principal_lock_acquired then
    return jsonb_build_object('status', 'rate_limited', 'retryAfterSeconds', 10);
  end if;

  select *
    into v_existing
    from public.touchline_analytics_sessions
   where id = p_session_id
   for update;

  if found and v_existing.user_id is distinct from p_user_id then
    return jsonb_build_object('status', 'owner_mismatch');
  end if;

  select max(last_seen_at), count(*)::integer
    into v_user_last_observation_at, v_total_sessions
    from public.touchline_analytics_sessions
   where user_id = p_user_id;

  if v_user_last_observation_at is not null then
    v_user_elapsed_seconds := greatest(
      0,
      floor(extract(epoch from (v_now - v_user_last_observation_at)))::integer
    );
    if v_user_elapsed_seconds < v_minimum_cadence_seconds then
      return jsonb_build_object(
        'status', 'rate_limited',
        'retryAfterSeconds', v_minimum_cadence_seconds - v_user_elapsed_seconds
      );
    end if;
  end if;

  if v_existing.id is not null then
    v_credited_seconds := least(v_user_elapsed_seconds, v_maximum_credit_seconds);

    update public.touchline_analytics_sessions
       set last_seen_at = v_now,
           updated_at = v_now,
           current_area = p_area,
           device_class = p_device,
           active_seconds = active_seconds + v_credited_seconds
     where id = p_session_id
       and user_id = p_user_id;

    return jsonb_build_object(
      'status', 'recorded',
      'creditedSeconds', v_credited_seconds
    );
  end if;

  if v_total_sessions >= v_session_limit then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.touchline_analytics_sessions(
    id, user_id, started_at, last_seen_at, updated_at,
    entry_area, current_area, device_class, active_seconds
  ) values (
    p_session_id, p_user_id, v_now, v_now, v_now,
    p_area, p_area, p_device, 0
  )
  on conflict (id) do nothing;
  get diagnostics v_inserted_rows = row_count;

  if v_inserted_rows <> 1 then
    return jsonb_build_object('status', 'owner_mismatch');
  end if;

  return jsonb_build_object('status', 'created', 'creditedSeconds', 0);
end;
$$;

revoke all on function public.touchline_record_analytics_observation(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.touchline_record_analytics_observation(uuid, uuid, text, text)
  to service_role;

comment on function public.touchline_record_analytics_observation(uuid, uuid, text, text) is
  'Service-only atomic analytics recorder with a nonblocking principal lock, cadence, time budget, ownership and total session cap.';

commit;
