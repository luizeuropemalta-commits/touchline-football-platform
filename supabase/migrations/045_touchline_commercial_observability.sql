-- Local-only V2.10.12 operational hardening. This audit stream contains only
-- allowlisted opaque references and codes. It must not store raw Stripe events,
-- secrets, card data, email, money, tax, invoice or wallet balance.
-- Apply nowhere until remote migration history is reconciled.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_commercial_operational_observations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid references public.touchline_commercial_activation_operations(id) on delete restrict,
  round_id uuid references public.touchline_competition_engine_rounds(id) on delete restrict,
  observation_code text not null check (observation_code in (
    'WEBHOOK_CLAIMED', 'WEBHOOK_DUPLICATE', 'OPERATION_AWAITING_FULFILLMENT',
    'ROUND_ENTRY_LOCKED', 'RECONCILIATION_REQUIRED'
  )),
  test_only boolean not null default true check (test_only),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 160),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (operation_id is not null or round_id is not null)
);

create index if not exists touchline_commercial_operational_observations_operation_idx
  on public.touchline_commercial_operational_observations(operation_id, occurred_at desc)
  where operation_id is not null;
create index if not exists touchline_commercial_operational_observations_round_idx
  on public.touchline_commercial_operational_observations(round_id, occurred_at desc)
  where round_id is not null;

alter table public.touchline_commercial_operational_observations enable row level security;
revoke all on table public.touchline_commercial_operational_observations from public, anon, authenticated;
grant select, insert on table public.touchline_commercial_operational_observations to service_role;

comment on table public.touchline_commercial_operational_observations is
  'Local-only allowlisted operational observability. No raw event, secret, personal data or financial amount may be stored.';

commit;
