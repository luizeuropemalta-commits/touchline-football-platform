create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  channels jsonb not null default '{"in_app": true, "push": false, "email": false}'::jsonb,
  frequency text not null default 'realtime' check (frequency in ('realtime', 'hourly_digest', 'daily_digest', 'paused')),
  quiet_hours jsonb not null default '{"enabled": false, "start": "22:00", "end": "07:00", "timezone": "UTC"}'::jsonb,
  explicit_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'push', 'email')),
  deep_link text,
  deduplication_key text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_history_user_created_idx
  on public.notification_history (user_id, created_at desc);

create unique index if not exists notification_history_user_dedupe_idx
  on public.notification_history (user_id, deduplication_key)
  where deduplication_key is not null;

create trigger notification_preferences_updated
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.notification_history enable row level security;

drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences"
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "users insert own notification preferences" on public.notification_preferences;
create policy "users insert own notification preferences"
  on public.notification_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users update own notification preferences" on public.notification_preferences;
create policy "users update own notification preferences"
  on public.notification_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users read own notification history" on public.notification_history;
create policy "users read own notification history"
  on public.notification_history
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "users mark own notification history read" on public.notification_history;
create policy "users mark own notification history read"
  on public.notification_history
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.notification_preferences to authenticated;
grant select, update on public.notification_history to authenticated;
grant select, insert, update, delete on public.notification_preferences to service_role;
grant select, insert, update, delete on public.notification_history to service_role;
