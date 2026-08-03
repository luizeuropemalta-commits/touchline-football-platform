-- Local-only V2.10.6–9 foundation. Do not apply remotely until migration
-- history, backup, Test Mode configuration and launch gates are reviewed.
-- This contains no live Stripe key, Product, Price, customer, payment, tax,
-- wallet balance, invoice or commercial activation.

begin;
set local lock_timeout = '5s';

-- Preserve the old subscription-reservation rows as historical evidence, but
-- remove its browser execution path. Founder allocation now requires a server
-- confirmed England operation plus an activated England entitlement.
revoke all on function public.reserve_founder_plan_slot() from public, anon, authenticated;
revoke all on function public.founder_plan_remaining() from public, anon, authenticated;
comment on table public.founder_plan_slots is
  'Retired historical subscription-reservation model. Preserve rows for audit; do not allocate or reuse Founder numbers from this table.';

create table if not exists public.touchline_commercial_activation_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  competition_key text not null check (competition_key = 'england'),
  official_currency char(3) not null check (official_currency = 'GBP'),
  quote_id text not null check (length(btrim(quote_id)) between 8 and 160),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 160),
  provider_mode text not null check (provider_mode = 'test'),
  state text not null check (state in (
    'PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'FULFILLMENT_PENDING',
    'FULFILLED', 'PAYMENT_FAILED', 'CANCELLED'
  )),
  provider_payment_reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, competition_key, quote_id)
);

create table if not exists public.touchline_founder_entitlements (
  user_id uuid primary key references public.users(id) on delete restrict,
  founder_number integer not null unique check (founder_number between 1 and 100),
  initial_activation_operation_id uuid not null unique
    references public.touchline_commercial_activation_operations(id) on delete restrict,
  competition_key text not null check (competition_key = 'england'),
  founder_badge boolean not null default true check (founder_badge),
  maintenance_benefit text not null default 'one-season-england'
    check (maintenance_benefit = 'one-season-england'),
  maintenance_benefit_applied_at timestamptz,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.touchline_founder_allocation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  founder_number integer not null check (founder_number between 1 and 100),
  initial_activation_operation_id uuid not null
    references public.touchline_commercial_activation_operations(id) on delete restrict,
  event_type text not null check (event_type in ('assigned', 'benefit-applied')),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 160),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Durable Test Mode webhook claims are separate from the legacy generic
-- stripe_webhook_events table. They cannot authorize fulfillment by themselves.
create table if not exists public.touchline_stripe_test_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null default false check (livemode = false),
  operation_id uuid not null references public.touchline_commercial_activation_operations(id) on delete restrict,
  claim_status text not null default 'claimed' check (claim_status in ('claimed', 'observed', 'rejected')),
  claimed_at timestamptz not null default now(),
  observed_at timestamptz
);

-- Test-only, non-monetary observation stream. This is deliberately not a
-- competition wallet, balance, accounting ledger, invoice or tax record.
create table if not exists public.touchline_stripe_test_ledger_observations (
  stripe_event_id text primary key references public.touchline_stripe_test_webhook_events(stripe_event_id) on delete restrict,
  operation_id uuid not null references public.touchline_commercial_activation_operations(id) on delete restrict,
  observation_kind text not null check (observation_kind in (
    'payment-confirmed', 'payment-failed', 'checkout-expired',
    'refund-simulated', 'dispute-simulated'
  )),
  test_only boolean not null default true check (test_only),
  created_at timestamptz not null default now()
);

create index if not exists touchline_commercial_activation_operations_user_idx
  on public.touchline_commercial_activation_operations(user_id, competition_key, state);
create index if not exists touchline_founder_allocation_events_user_idx
  on public.touchline_founder_allocation_events(user_id, created_at desc);

create trigger touchline_commercial_activation_operations_updated
  before update on public.touchline_commercial_activation_operations
  for each row execute function public.touch_updated_at();

create or replace function public.assign_touchline_founder_for_england_activation(
  p_operation_id uuid,
  p_idempotency_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  eligible_user_id uuid;
  existing_number integer;
  next_number integer;
begin
  if length(btrim(p_idempotency_key)) < 8 then
    raise exception 'Founder allocation requires an idempotency key';
  end if;
  perform pg_advisory_xact_lock(729101);

  select operation.user_id into eligible_user_id
  from public.touchline_commercial_activation_operations operation
  join public.touchline_competition_entitlements entitlement
    on entitlement.user_id = operation.user_id
    and entitlement.competition_key = 'england'
    and entitlement.official_currency = 'GBP'
    and entitlement.status in ('ACTIVE', 'REACTIVATED')
    and entitlement.activated_at is not null
  where operation.id = p_operation_id
    and operation.competition_key = 'england'
    and operation.official_currency = 'GBP'
    and operation.provider_mode = 'test'
    and operation.state = 'FULFILLED'
  for update of operation;

  if eligible_user_id is null then
    raise exception 'Founder eligibility requires fulfilled Test Mode England activation';
  end if;

  select founder_number into existing_number
  from public.touchline_founder_entitlements
  where user_id = eligible_user_id;
  if existing_number is not null then return existing_number; end if;

  select candidate into next_number
  from generate_series(1, 100) candidate
  where not exists (
    select 1 from public.touchline_founder_entitlements
    where founder_number = candidate
  )
  order by candidate
  limit 1;
  if next_number is null then raise exception 'Founder allocation is full'; end if;

  insert into public.touchline_founder_entitlements (
    user_id, founder_number, initial_activation_operation_id
  ) values (eligible_user_id, next_number, p_operation_id);
  insert into public.touchline_founder_allocation_events (
    user_id, founder_number, initial_activation_operation_id, event_type, idempotency_key
  ) values (eligible_user_id, next_number, p_operation_id, 'assigned', p_idempotency_key);
  return next_number;
end;
$$;

create or replace function public.claim_touchline_stripe_test_webhook_event(
  p_stripe_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_operation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_livemode then raise exception 'Live Stripe events are forbidden in this Test Mode boundary'; end if;
  insert into public.touchline_stripe_test_webhook_events (
    stripe_event_id, event_type, livemode, operation_id
  ) values (p_stripe_event_id, p_event_type, false, p_operation_id)
  on conflict (stripe_event_id) do nothing;
  return found;
end;
$$;

alter table public.touchline_commercial_activation_operations enable row level security;
alter table public.touchline_founder_entitlements enable row level security;
alter table public.touchline_founder_allocation_events enable row level security;
alter table public.touchline_stripe_test_webhook_events enable row level security;
alter table public.touchline_stripe_test_ledger_observations enable row level security;

revoke all on table public.touchline_commercial_activation_operations from public, anon, authenticated;
revoke all on table public.touchline_founder_entitlements from public, anon, authenticated;
revoke all on table public.touchline_founder_allocation_events from public, anon, authenticated;
revoke all on table public.touchline_stripe_test_webhook_events from public, anon, authenticated;
revoke all on table public.touchline_stripe_test_ledger_observations from public, anon, authenticated;
revoke all on function public.assign_touchline_founder_for_england_activation(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_touchline_stripe_test_webhook_event(text, text, boolean, uuid) from public, anon, authenticated;

grant select, insert, update, delete on table public.touchline_commercial_activation_operations to service_role;
grant select, insert, update, delete on table public.touchline_founder_entitlements to service_role;
grant select, insert on table public.touchline_founder_allocation_events to service_role;
grant select, insert, update on table public.touchline_stripe_test_webhook_events to service_role;
grant select, insert on table public.touchline_stripe_test_ledger_observations to service_role;
grant execute on function public.assign_touchline_founder_for_england_activation(uuid, text) to service_role;
grant execute on function public.claim_touchline_stripe_test_webhook_event(text, text, boolean, uuid) to service_role;

create policy "users read own permanent Founder entitlement"
  on public.touchline_founder_entitlements
  for select to authenticated using (user_id = auth.uid());
create policy "users read own Founder allocation events"
  on public.touchline_founder_allocation_events
  for select to authenticated using (user_id = auth.uid());

comment on table public.touchline_founder_entitlements is
  'Permanent Founder #001–#100 entitlement. Assigned only after server-confirmed fulfilled England activation; the benefit is one England maintenance season and does not grant cards.';
comment on table public.touchline_stripe_test_webhook_events is
  'Local-only durable Stripe Test Mode event claim. No live event, fulfillment, money movement or production activation is permitted here.';
comment on table public.touchline_stripe_test_ledger_observations is
  'Non-monetary Test Mode audit observations only; not a wallet or accounting ledger.';

commit;
