-- Diagnostic only: no game preferences, events, enrollment, scheduler or HTTP.
-- Apply together with migration history in the runner's transaction.
set local lock_timeout = '5s';

create table public.touchline_push_rehearsal_cooldowns (
  actor_id uuid primary key references public.users(id) on delete cascade,
  next_allowed_at timestamptz not null
);
create table public.touchline_push_rehearsal_attempts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.users(id) on delete cascade,
  request_id uuid not null,
  installation_id uuid not null,
  -- Deliberately no cascading device FK: deleting a registration cannot erase
  -- the consumed request and turn a lost response into a new send.
  device_id uuid not null,
  subscription_fingerprint text not null check(subscription_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  explicit_test_consent_at timestamptz not null,
  expires_at timestamptz not null,
  outcome text not null default 'pending' check(outcome in ('pending','provider_accepted','rejected','cancelled','unknown')),
  finished_at timestamptz,
  unique(actor_id,request_id),
  check(isfinite(expires_at) and expires_at > explicit_test_consent_at),
  check((outcome='pending' and finished_at is null) or (outcome<>'pending' and finished_at is not null))
);
alter table public.touchline_push_rehearsal_cooldowns enable row level security;
alter table public.touchline_push_rehearsal_cooldowns force row level security;
alter table public.touchline_push_rehearsal_attempts enable row level security;
alter table public.touchline_push_rehearsal_attempts force row level security;
-- Existing 005 default grants include DELETE for service_role; GRANT alone
-- cannot narrow them. Remove inherited rights before applying the minimum.
revoke all on public.touchline_push_rehearsal_cooldowns,public.touchline_push_rehearsal_attempts from public,anon,authenticated,service_role;
grant select,insert,update on public.touchline_push_rehearsal_cooldowns,public.touchline_push_rehearsal_attempts to service_role;

-- Server-only trusted adapter computes fingerprint from the exact validated
-- subscription passed here. SQL checks that JSON binding under the device lock;
-- fingerprint text alone is not proof of current subscription ownership.
create function public.touchline_reserve_push_rehearsal(
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

  -- The account lock serializes different request IDs and devices as well as
  -- duplicates. This conservative diagnostic cooldown is not a game rule.
  insert into public.touchline_push_rehearsal_cooldowns(actor_id,next_allowed_at)
    values(p_actor,v_now) on conflict(actor_id) do nothing;
  select next_allowed_at into v_next from public.touchline_push_rehearsal_cooldowns
    where actor_id=p_actor for update nowait;
  if exists(select 1 from public.touchline_push_rehearsal_attempts
    where actor_id=p_actor and request_id=p_request)
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
  -- PL/pgSQL rolls back this block. No committed reservation receipt means no
  -- transport, even if another transaction has reserved the same request.
  return jsonb_build_object('status','unavailable');
end $$;

create function public.touchline_finish_push_rehearsal(
  p_reservation uuid,p_actor uuid,p_request uuid,p_outcome text
) returns boolean language plpgsql security invoker set search_path='' set lock_timeout='500ms' as $$
declare v_outcome text;
begin
  if p_reservation is null or p_actor is null or p_request is null
    or (p_outcome in ('provider_accepted','rejected','cancelled','unknown')) is not true
  then return false; end if;
  select outcome into v_outcome from public.touchline_push_rehearsal_attempts
    where id=p_reservation and actor_id=p_actor and request_id=p_request for update nowait;
  if not found then return false; end if;
  if v_outcome<>'pending' then return v_outcome=p_outcome; end if;
  update public.touchline_push_rehearsal_attempts set outcome=p_outcome,finished_at=clock_timestamp()
    where id=p_reservation and actor_id=p_actor and request_id=p_request;
  -- Never unlock, delete, reschedule or make a consumed request retryable.
  return true;
exception when lock_not_available then return false;
end $$;

revoke all on function public.touchline_reserve_push_rehearsal(uuid,uuid,uuid,uuid,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.touchline_finish_push_rehearsal(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.touchline_reserve_push_rehearsal(uuid,uuid,uuid,uuid,text,jsonb,timestamptz) to service_role;
grant execute on function public.touchline_finish_push_rehearsal(uuid,uuid,uuid,text) to service_role;
