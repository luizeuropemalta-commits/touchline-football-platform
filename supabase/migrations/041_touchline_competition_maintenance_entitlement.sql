-- Local-only V2.10.2–3 foundation for commercial competition entitlement.
--
-- This migration creates no payment, Stripe object, card price, wallet debit,
-- automatic activation or remote side effect. It only preserves a server-owned
-- competition access and maintenance lifecycle for a future reviewed flow.
-- Apply nowhere until the published remote migration history is reconciled and
-- a recoverable backup is confirmed.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_commercial_competitions (
  competition_key text primary key check (competition_key in ('england', 'europe', 'brazil')),
  official_currency char(3) not null check (official_currency in ('GBP', 'EUR', 'BRL')),
  launch_status text not null check (launch_status in ('future', 'planned', 'ready', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_key, official_currency),
  check (
    (competition_key = 'england' and official_currency = 'GBP')
    or (competition_key = 'europe' and official_currency = 'EUR')
    or (competition_key = 'brazil' and official_currency = 'BRL')
  )
);

-- England is the only first-launch scope but stays planned until an explicitly
-- approved launch-readiness operation changes it. Europe and Brazil remain
-- future structural states and cannot become active through this migration.
insert into public.touchline_commercial_competitions (
  competition_key,
  official_currency,
  launch_status
) values
  ('england', 'GBP', 'planned'),
  ('europe', 'EUR', 'future'),
  ('brazil', 'BRL', 'future')
on conflict (competition_key) do nothing;

create table if not exists public.touchline_competition_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  competition_key text not null,
  official_currency char(3) not null,
  status text not null check (status in (
    'ACTIVE',
    'PAYMENT_PAST_DUE',
    'INACTIVE_MAINTENANCE',
    'REACTIVATED'
  )),
  maintenance_entitled_until timestamptz,
  next_eligible_round_at timestamptz,
  activated_at timestamptz,
  past_due_at timestamptz,
  inactivated_at timestamptz,
  reactivated_at timestamptz,
  last_status_changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, competition_key),
  foreign key (competition_key, official_currency)
    references public.touchline_commercial_competitions(competition_key, official_currency)
    on update restrict
    on delete restrict,
  check (
    next_eligible_round_at is null
    or next_eligible_round_at >= last_status_changed_at
  )
);

create index if not exists touchline_competition_entitlements_user_status_idx
  on public.touchline_competition_entitlements(user_id, competition_key, status);
create index if not exists touchline_competition_entitlements_next_round_idx
  on public.touchline_competition_entitlements(competition_key, next_eligible_round_at)
  where next_eligible_round_at is not null;

-- The event log is an append-only audit boundary. A future server transaction
-- writes the entitlement and exactly one idempotent event together. The browser
-- receives no insert/update policy for either table.
create table if not exists public.touchline_competition_entitlement_events (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.touchline_competition_entitlements(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  competition_key text not null check (competition_key in ('england', 'europe', 'brazil')),
  event_type text not null check (event_type in (
    'activated',
    'payment_past_due',
    'maintenance_inactivated',
    'reactivated',
    'administrative_correction'
  )),
  from_status text check (from_status is null or from_status in (
    'ACTIVE',
    'PAYMENT_PAST_DUE',
    'INACTIVE_MAINTENANCE',
    'REACTIVATED'
  )),
  to_status text not null check (to_status in (
    'ACTIVE',
    'PAYMENT_PAST_DUE',
    'INACTIVE_MAINTENANCE',
    'REACTIVATED'
  )),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 160),
  actor_id uuid references public.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists touchline_competition_entitlement_events_entitlement_idx
  on public.touchline_competition_entitlement_events(entitlement_id, created_at desc);
create index if not exists touchline_competition_entitlement_events_user_idx
  on public.touchline_competition_entitlement_events(user_id, competition_key, created_at desc);

create trigger touchline_commercial_competitions_updated
  before update on public.touchline_commercial_competitions
  for each row execute function public.touch_updated_at();
create trigger touchline_competition_entitlements_updated
  before update on public.touchline_competition_entitlements
  for each row execute function public.touch_updated_at();

alter table public.touchline_commercial_competitions enable row level security;
alter table public.touchline_competition_entitlements enable row level security;
alter table public.touchline_competition_entitlement_events enable row level security;

revoke all on table public.touchline_commercial_competitions from public, anon, authenticated;
revoke all on table public.touchline_competition_entitlements from public, anon, authenticated;
revoke all on table public.touchline_competition_entitlement_events from public, anon, authenticated;

grant select, insert, update, delete on table public.touchline_commercial_competitions to service_role;
grant select, insert, update, delete on table public.touchline_competition_entitlements to service_role;
grant select, insert on table public.touchline_competition_entitlement_events to service_role;

create policy "users read own touchline competition entitlement"
  on public.touchline_competition_entitlements
  for select to authenticated
  using (user_id = auth.uid());

create policy "users read own touchline competition entitlement events"
  on public.touchline_competition_entitlement_events
  for select to authenticated
  using (user_id = auth.uid());

comment on table public.touchline_commercial_competitions is
  'Local V2.10 commercial competition registry. England is planned until controlled launch readiness; Europe and Brazil are future-only.';
comment on table public.touchline_competition_entitlements is
  'Server-owned competition maintenance entitlement. It is separate from TouchLine seasonal card contracts and creates no payment by itself.';
comment on table public.touchline_competition_entitlement_events is
  'Append-only entitlement audit event. Service role may insert only; no browser mutation policy exists.';

commit;
