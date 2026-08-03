-- Privacy-conscious first-party product analytics and the first-20 ClubOwner grant.
-- No passwords, message contents, form values or raw query strings are stored.

alter table public.users
  add column if not exists balance_cents bigint not null default 0;

create table if not exists public.touchline_beta_tc_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete restrict,
  campaign_key text not null default 'founding-20-2026',
  slot_number smallint not null unique check (slot_number between 1 and 20),
  amount_tc integer not null default 35 check (amount_tc = 35),
  granted_at timestamptz not null default now()
);

create table if not exists public.touchline_analytics_sessions (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds bigint not null default 0 check (active_seconds >= 0),
  entry_area text not null default 'unknown',
  current_area text not null default 'unknown',
  device_class text not null default 'unknown' check (device_class in ('mobile', 'tablet', 'desktop', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists touchline_analytics_sessions_last_seen_idx
  on public.touchline_analytics_sessions(last_seen_at desc);
create index if not exists touchline_analytics_sessions_user_idx
  on public.touchline_analytics_sessions(user_id, started_at desc);
create index if not exists touchline_analytics_sessions_area_idx
  on public.touchline_analytics_sessions(current_area, last_seen_at desc);

create table if not exists public.touchline_user_arena_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  formation_key text not null default '4-3-3' check (formation_key in ('3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1')),
  lineup jsonb not null default '[]'::jsonb,
  saved_formation_layouts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(lineup) = 'array'),
  check (jsonb_typeof(saved_formation_layouts) = 'object'),
  check (jsonb_array_length(lineup) <= 35)
);

alter table public.touchline_beta_tc_grants enable row level security;
alter table public.touchline_analytics_sessions enable row level security;
alter table public.touchline_user_arena_state enable row level security;

drop policy if exists "Users read own beta grant" on public.touchline_beta_tc_grants;
create policy "Users read own beta grant" on public.touchline_beta_tc_grants
  for select using (auth.uid() = user_id);

drop policy if exists "Users read own analytics" on public.touchline_analytics_sessions;
create policy "Users read own analytics" on public.touchline_analytics_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "Users manage own arena state" on public.touchline_user_arena_state;
create policy "Users manage own arena state" on public.touchline_user_arena_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.claim_touchline_beta_welcome_grant(requested_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.touchline_beta_tc_grants%rowtype;
  next_slot integer;
begin
  if requested_user_id is null then
    raise exception using errcode = 'P0001', message = 'TL_BETA_AUTH_REQUIRED';
  end if;

  -- One global transaction lock makes the 20-slot campaign race-safe.
  perform pg_advisory_xact_lock(hashtext('touchline-founding-20-2026'));

  select * into existing
    from public.touchline_beta_tc_grants
   where user_id = requested_user_id;
  if found then
    return jsonb_build_object('granted', true, 'alreadyGranted', true, 'slot', existing.slot_number, 'amountTc', existing.amount_tc);
  end if;

  perform id from public.users where id = requested_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_BETA_USER_NOT_FOUND';
  end if;

  select coalesce(max(slot_number), 0) + 1 into next_slot
    from public.touchline_beta_tc_grants;
  if next_slot > 20 then
    return jsonb_build_object('granted', false, 'campaignFull', true, 'amountTc', 0);
  end if;

  update public.users
     set balance_cents = balance_cents + 3500,
         updated_at = now()
   where id = requested_user_id;

  insert into public.touchline_beta_tc_grants(user_id, slot_number)
  values (requested_user_id, next_slot);

  return jsonb_build_object('granted', true, 'alreadyGranted', false, 'slot', next_slot, 'amountTc', 35);
end;
$$;

revoke all on function public.claim_touchline_beta_welcome_grant(uuid) from public, anon, authenticated;
grant execute on function public.claim_touchline_beta_welcome_grant(uuid) to service_role;
