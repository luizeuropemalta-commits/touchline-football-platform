-- Runner owns DDL + migration-history transaction. No sender or scheduler.
-- Unknown historical classification stays NULL and must fail closed at delivery.
alter table public.touchline_match_push_outbox
  add column delivery_kind text check (delivery_kind in ('initial', 'revision'));

create unique index touchline_match_push_one_initial_idx
  on public.touchline_match_push_outbox (device_id, fixture_id, provider_event_id)
  where delivery_kind = 'initial';

create function public.touchline_guard_match_push_identity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if row(new.id, new.device_id, new.fixture_id, new.provider_event_id,
         new.source_checksum, new.subscription_fingerprint, new.delivery_kind)
     is distinct from
     row(old.id, old.device_id, old.fixture_id, old.provider_event_id,
         old.source_checksum, old.subscription_fingerprint, old.delivery_kind) then
    raise exception using errcode = '23514', message = 'PUSH_EVENT_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public.touchline_guard_match_push_identity() from public, anon, authenticated, service_role;
create trigger touchline_match_push_identity_guard
  before update on public.touchline_match_push_outbox
  for each row execute function public.touchline_guard_match_push_identity();

-- Internal persistence seam only. The server must verify source freshness,
-- canonical identity and derive the subscription fingerprint before this call.
-- p_history_complete is a trusted server attestation, NEVER client input or
-- inferred from an empty query. Default/unknown blocks a first initial alert.
create function public.touchline_enqueue_match_push(
  p_device_id uuid, p_fixture_id uuid, p_event_id text, p_checksum text,
  p_snapshot_at timestamptz, p_payload jsonb, p_expires_at timestamptz,
  p_fingerprint text, p_history_complete boolean default false
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid; v_kind text; v_now timestamptz;
begin
  if p_device_id is null or p_fixture_id is null
    or (p_event_id ~ '^[1-9][0-9]{0,19}$') is not true
    or (p_checksum ~ '^sha256:[a-f0-9]{64}$') is not true
    or (p_fingerprint ~ '^sha256:[a-f0-9]{64}$') is not true then
    raise exception using errcode = '22023', message = 'PUSH_ENQUEUE_INVALID_INPUT';
  end if;
  -- Existing device row serializes even the first event, where no queue row
  -- exists to lock. Keep this transaction short; no provider/network I/O here.
  perform 1 from public.notification_devices where id = p_device_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'PUSH_ENQUEUE_DEVICE_MISSING';
  end if;
  select id into v_id from public.touchline_match_push_outbox
    where device_id = p_device_id and fixture_id = p_fixture_id
      and provider_event_id = p_event_id and source_checksum = p_checksum;
  if found then return v_id; end if; -- No rewrite, requeue or renewed expiry.
  v_now := clock_timestamp();
  if p_snapshot_at is null or not isfinite(p_snapshot_at) or p_snapshot_at > v_now
    or p_expires_at is null or not isfinite(p_expires_at) or p_expires_at <= v_now
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'PUSH_ENQUEUE_INVALID_INPUT';
  end if;
  if exists(select 1 from public.touchline_match_push_outbox
    where device_id = p_device_id and fixture_id = p_fixture_id and provider_event_id = p_event_id) then
    v_kind := 'revision'; -- Includes NULL legacy, cancelled, failed and uncertain.
  elsif p_history_complete is true then
    v_kind := 'initial';
  else
    raise exception using errcode = '22023', message = 'PUSH_HISTORY_UNVERIFIED';
  end if;
  insert into public.touchline_match_push_outbox
    (device_id,fixture_id,provider_event_id,source_checksum,source_snapshot_at,
     payload,created_at,expires_at,subscription_fingerprint,delivery_kind)
    values(p_device_id,p_fixture_id,p_event_id,p_checksum,p_snapshot_at,
      p_payload,v_now,p_expires_at,p_fingerprint,v_kind) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.touchline_enqueue_match_push(uuid,uuid,text,text,timestamptz,jsonb,timestamptz,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.touchline_enqueue_match_push(uuid,uuid,text,text,timestamptz,jsonb,timestamptz,text,boolean) to service_role;
-- Service role remains trusted; all real producers must use this function,
-- not direct INSERT. No runtime caller/history attestation is installed here.
