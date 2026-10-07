-- Forward-only rehearsal guard. Historical attempts remain intact, including
-- multiple pre-guard requests for an installation. No preferences or sends.
set local lock_timeout = '5s';

create index touchline_push_rehearsal_attempts_actor_installation_idx
  on public.touchline_push_rehearsal_attempts(actor_id,installation_id);

create or replace function public.touchline_reserve_push_rehearsal(
  p_actor uuid,p_request uuid,p_installation uuid,p_device uuid,
  p_fingerprint text,p_subscription jsonb,p_expires_at timestamptz
) returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='500ms' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_next timestamptz;
  v_id uuid;
begin
  if p_actor is null or p_request is null or p_installation is null or p_device is null
    or (p_fingerprint ~ '^sha256:[a-f0-9]{64}$') is not true
    or jsonb_typeof(p_subscription) is distinct from 'object'
    or p_expires_at is null or not isfinite(p_expires_at)
    or p_expires_at <= v_now or p_expires_at > v_now + interval '30 seconds'
  then return jsonb_build_object('status','unavailable'); end if;

  -- Serialize every request and device for this account before consulting
  -- consumption. A new request ID must not race past the installation guard.
  insert into public.touchline_push_rehearsal_cooldowns(actor_id,next_allowed_at)
    values(p_actor,v_now) on conflict(actor_id) do nothing;
  select next_allowed_at into v_next from public.touchline_push_rehearsal_cooldowns
    where actor_id=p_actor for update nowait;
  if exists(select 1 from public.touchline_push_rehearsal_attempts
    where actor_id=p_actor and request_id=p_request)
  then return jsonb_build_object('status','duplicate'); end if;
  -- Every committed attempt consumes this logical installation, regardless of
  -- expiry, outcome, changed subscription or deleted/recreated device row.
  -- Installation identity/configuration changes need separate authorization.
  if exists(select 1 from public.touchline_push_rehearsal_attempts
    where actor_id=p_actor and installation_id=p_installation)
  then return jsonb_build_object('status','duplicate'); end if;
  v_now := clock_timestamp();
  if v_next > v_now then return jsonb_build_object('status','cooldown'); end if;
  perform 1 from public.notification_devices
    where id=p_device and user_id=p_actor and installation_id=p_installation
      and permission='granted' and push_subscription=p_subscription for share nowait;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  v_now := clock_timestamp();
  if p_expires_at <= v_now then return jsonb_build_object('status','unavailable'); end if;

  insert into public.touchline_push_rehearsal_attempts
    (actor_id,request_id,installation_id,device_id,subscription_fingerprint,explicit_test_consent_at,expires_at)
    values(p_actor,p_request,p_installation,p_device,p_fingerprint,v_now,p_expires_at) returning id into v_id;
  update public.touchline_push_rehearsal_cooldowns set next_allowed_at=v_now+interval '60 seconds' where actor_id=p_actor;
  return jsonb_build_object('status','reserved','reservationId',v_id,'actorId',p_actor,
    'requestId',p_request,'installationId',p_installation,'deviceId',p_device,
    'fingerprint',p_fingerprint,'expiresAt',p_expires_at);
exception when lock_not_available or foreign_key_violation or unique_violation then
  return jsonb_build_object('status','unavailable');
end $$;

-- Keep the original server-only execution boundary explicit.
revoke all on function public.touchline_reserve_push_rehearsal(uuid,uuid,uuid,uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.touchline_reserve_push_rehearsal(uuid,uuid,uuid,uuid,text,jsonb,timestamptz) to service_role;
