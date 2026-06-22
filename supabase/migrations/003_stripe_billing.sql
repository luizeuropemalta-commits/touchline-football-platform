-- Touchline Stripe billing and entitlement state.
-- Stripe webhooks are the source of truth; application reads are served from these tables.

create table public.billing_customers (
  user_id uuid primary key references public.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  plan_key text not null check (plan_key in (
    'starter_agent', 'pro_agent', 'elite_agency',
    'club_basic', 'club_pro', 'club_elite',
    'academy', 'founder'
  )),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  status text not null,
  quantity integer not null default 1 check (quantity > 0),
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_invoice_id text not null unique,
  stripe_subscription_id text,
  number text,
  status text,
  currency char(3) not null default 'eur',
  subtotal bigint not null default 0,
  tax bigint not null default 0,
  total bigint not null default 0,
  amount_paid bigint not null default 0,
  amount_due bigint not null default 0,
  hosted_invoice_url text,
  invoice_pdf text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('payment_failed', 'payment_action_required', 'subscription_ending', 'trial_ending')),
  title text not null,
  message text not null,
  stripe_object_id text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  processed_at timestamptz not null default now()
);

create table public.founder_plan_slots (
  user_id uuid primary key references public.users(id) on delete cascade,
  slot_number integer not null unique check (slot_number between 1 and 100),
  status text not null default 'reserved' check (status in ('reserved', 'claimed', 'released')),
  reservation_expires_at timestamptz,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index billing_subscriptions_user_status_idx on public.billing_subscriptions(user_id, status);
create index billing_invoices_user_created_idx on public.billing_invoices(user_id, created_at desc);
create index billing_alerts_user_open_idx on public.billing_alerts(user_id, created_at desc) where resolved_at is null;

create trigger billing_customers_updated before update on public.billing_customers for each row execute function public.touch_updated_at();
create trigger billing_subscriptions_updated before update on public.billing_subscriptions for each row execute function public.touch_updated_at();
create trigger billing_invoices_updated before update on public.billing_invoices for each row execute function public.touch_updated_at();

create or replace function public.reserve_founder_plan_slot()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_slot integer;
  next_slot integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(729100);

  update public.founder_plan_slots
  set status = 'released'
  where status = 'reserved' and reservation_expires_at < now();

  select slot_number into existing_slot
  from public.founder_plan_slots
  where user_id = auth.uid() and status in ('reserved', 'claimed');

  if existing_slot is not null then return existing_slot; end if;

  select candidate into next_slot
  from generate_series(1, 100) candidate
  where not exists (
    select 1 from public.founder_plan_slots
    where slot_number = candidate and status in ('reserved', 'claimed')
  )
  order by candidate
  limit 1;

  if next_slot is null then raise exception 'Founder Plan is sold out'; end if;

  insert into public.founder_plan_slots (user_id, slot_number, status, reservation_expires_at)
  values (auth.uid(), next_slot, 'reserved', now() + interval '30 minutes')
  on conflict (user_id) do update set
    slot_number = excluded.slot_number,
    status = 'reserved',
    reservation_expires_at = excluded.reservation_expires_at;

  return next_slot;
end;
$$;

create or replace function public.founder_plan_remaining()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, 100 - count(*)::integer)
  from public.founder_plan_slots
  where status = 'claimed' or (status = 'reserved' and reservation_expires_at > now())
$$;

grant execute on function public.reserve_founder_plan_slot() to authenticated;
grant execute on function public.founder_plan_remaining() to anon, authenticated;

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_alerts enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.founder_plan_slots enable row level security;

create policy "users read own billing customer" on public.billing_customers
for select to authenticated using (user_id = auth.uid());
create policy "users read own subscriptions" on public.billing_subscriptions
for select to authenticated using (user_id = auth.uid());
create policy "users read own billing invoices" on public.billing_invoices
for select to authenticated using (user_id = auth.uid());
create policy "users read own billing alerts" on public.billing_alerts
for select to authenticated using (user_id = auth.uid());
create policy "users resolve own billing alerts" on public.billing_alerts
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users read own founder slot" on public.founder_plan_slots
for select to authenticated using (user_id = auth.uid());

-- There are deliberately no client mutation policies for customers, subscriptions,
-- invoices, webhook events, or claimed founder slots. Only the service-role webhook
-- processor may write authoritative Stripe state.
