-- Device registration only. This migration deliberately has no delivery job,
-- provider credential or outbound network path.
create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  installation_id uuid not null,
  permission text not null check (permission in ('granted', 'denied', 'default')),
  push_subscription jsonb,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id),
  -- Permission is not delivery state. A device can be delivered to only when
  -- the browser has granted permission *and* supplied a structurally valid
  -- HTTPS PushSubscription. Revoked/default permissions must erase a stale
  -- subscription instead of leaving a seemingly deliverable row behind.
  check (
    (
      permission in ('denied', 'default')
      and push_subscription is null
    )
    or (
      permission = 'granted'
      and jsonb_typeof(push_subscription) = 'object'
      and jsonb_typeof(push_subscription->'endpoint') = 'string'
      and length(btrim(push_subscription->>'endpoint')) between 8 and 2048
      -- Require a non-empty HTTPS authority. This refuses strings such as
      -- https:/// and https://?x, which have a scheme but no usable host.
      and btrim(push_subscription->>'endpoint') ~ '^https://[^/:?#[:space:]]+(?::[0-9]{1,5})?(?:/[^[:space:]]*)?$'
      and jsonb_typeof(push_subscription->'keys') = 'object'
      and jsonb_typeof(push_subscription->'keys'->'p256dh') = 'string'
      and btrim(push_subscription->'keys'->>'p256dh') ~ '^[A-Za-z0-9_-]{16,512}$'
      and jsonb_typeof(push_subscription->'keys'->'auth') = 'string'
      and btrim(push_subscription->'keys'->>'auth') ~ '^[A-Za-z0-9_-]{16,512}$'
    )
  )
);

create index if not exists notification_devices_user_seen_idx
  on public.notification_devices (user_id, last_seen_at desc);

create trigger notification_devices_updated
  before update on public.notification_devices
  for each row execute function public.touch_updated_at();

alter table public.notification_devices enable row level security;
alter table public.notification_devices force row level security;
drop policy if exists "users manage own notification devices" on public.notification_devices;
create policy "users manage own notification devices"
  on public.notification_devices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.notification_devices to authenticated;
grant select, insert, update, delete on public.notification_devices to service_role;
