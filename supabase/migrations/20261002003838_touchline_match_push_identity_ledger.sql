-- Runner owns the transaction, including migration history. No sender,
-- enrollment authority or new permission to classify an initial notification.
-- Acquire parents before the queue, like enqueue. NOWAIT makes a busy rollout
-- abort transactionally rather than deadlock with active writers. The runner
-- must schedule a quiet window; do not blindly retry this migration.
lock table public.notification_devices, public.football_fixtures in exclusive mode nowait;
-- Block concurrent queue INSERT/cleanup until backfill and trigger are atomic.
lock table public.touchline_match_push_outbox in share row exclusive mode nowait;

create table public.touchline_match_push_identity_ledger (
  device_id uuid not null references public.notification_devices(id) on delete cascade,
  fixture_id uuid not null references public.football_fixtures(id) on delete cascade,
  provider_event_id text not null check (provider_event_id ~ '^[1-9][0-9]{0,19}$'),
  source_checksum text not null check (source_checksum ~ '^sha256:[a-f0-9]{64}$'),
  outbox_id uuid not null unique,
  delivery_kind text check (delivery_kind in ('initial', 'revision')),
  admitted_at timestamptz not null,
  primary key (device_id, fixture_id, provider_event_id, source_checksum)
);
-- Deliberately no FK to outbox: deleting payloads must not erase deduplication.
create unique index touchline_match_push_ledger_one_initial_idx
  on public.touchline_match_push_identity_ledger(device_id, fixture_id, provider_event_id)
  where delivery_kind = 'initial';
alter table public.touchline_match_push_identity_ledger enable row level security;
alter table public.touchline_match_push_identity_ledger force row level security;
revoke all on public.touchline_match_push_identity_ledger from public, anon, authenticated, service_role;
grant select, insert on public.touchline_match_push_identity_ledger to service_role;

-- Preserve every state and unknown legacy classification; never infer delivery.
insert into public.touchline_match_push_identity_ledger
  (device_id, fixture_id, provider_event_id, source_checksum, outbox_id, delivery_kind, admitted_at)
select device_id, fixture_id, provider_event_id, source_checksum, id, delivery_kind, created_at
from public.touchline_match_push_outbox;

create function public.touchline_record_match_push_identity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  -- No ON CONFLICT overwrite: contradictory/direct duplicate insertion aborts
  -- its queue INSERT atomically. The enqueue RPC returns existing receipts.
  insert into public.touchline_match_push_identity_ledger
    (device_id, fixture_id, provider_event_id, source_checksum, outbox_id, delivery_kind, admitted_at)
  values (new.device_id, new.fixture_id, new.provider_event_id, new.source_checksum,
    new.id, new.delivery_kind, new.created_at);
  return new;
end;
$$;
revoke all on function public.touchline_record_match_push_identity() from public, anon, authenticated, service_role;
create trigger touchline_match_push_identity_receipt
  after insert on public.touchline_match_push_outbox
  for each row execute function public.touchline_record_match_push_identity();

create or replace function public.touchline_enqueue_match_push(
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
  perform 1 from public.notification_devices where id = p_device_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'PUSH_ENQUEUE_DEVICE_MISSING';
  end if;
  select outbox_id into v_id from public.touchline_match_push_identity_ledger
    where device_id = p_device_id and fixture_id = p_fixture_id
      and provider_event_id = p_event_id and source_checksum = p_checksum;
  if found then return v_id; end if; -- Receipt only, not a delivery/existing-payload claim.
  v_now := clock_timestamp();
  if p_snapshot_at is null or not isfinite(p_snapshot_at) or p_snapshot_at > v_now
    or p_expires_at is null or not isfinite(p_expires_at) or p_expires_at <= v_now
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'PUSH_ENQUEUE_INVALID_INPUT';
  end if;
  if exists(select 1 from public.touchline_match_push_identity_ledger
    where device_id = p_device_id and fixture_id = p_fixture_id and provider_event_id = p_event_id) then
    v_kind := 'revision';
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
