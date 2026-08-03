-- Local-only preparation for the approved TouchLine seasonal contract model.
-- Do not apply remotely without a separately reviewed season-rollover runbook.
-- No existing order, contract, wallet, inventory or historical result is
-- rewritten by this migration.

begin;
set local lock_timeout = '5s';

alter table public.touchline_card_contracts
  add column if not exists season_id uuid references public.football_seasons(id) on delete restrict,
  add column if not exists season_starts_at date,
  add column if not exists season_ends_at date,
  add column if not exists expires_at timestamptz,
  add column if not exists end_reason text,
  add column if not exists season_lifecycle_state text not null default 'active',
  add column if not exists renewed_from_contract_id uuid references public.touchline_card_contracts(id) on delete restrict;

alter table public.touchline_card_contracts
  drop constraint if exists touchline_card_contracts_season_term_check;
alter table public.touchline_card_contracts
  add constraint touchline_card_contracts_season_term_check
  check (
    (
      season_id is null
      and season_starts_at is null
      and season_ends_at is null
      and expires_at is null
    )
    or (
      season_id is not null
      and season_starts_at is not null
      and season_ends_at is not null
      and expires_at is not null
      and season_ends_at >= season_starts_at
      and expires_at >= contracted_at
    )
  );

alter table public.touchline_card_contracts
  drop constraint if exists touchline_card_contracts_end_reason_check;
alter table public.touchline_card_contracts
  add constraint touchline_card_contracts_end_reason_check
  check (
    end_reason is null
    or end_reason in ('released', 'season_expired', 'reversed', 'administrative_correction')
  );

alter table public.touchline_card_contracts
  drop constraint if exists touchline_card_contracts_season_lifecycle_state_check;
alter table public.touchline_card_contracts
  add constraint touchline_card_contracts_season_lifecycle_state_check
  check (season_lifecycle_state in (
    'active',
    'season_finished',
    'renewal_available',
    'renewed',
    'not_eligible',
    'archived'
  ));

create index if not exists touchline_card_contracts_season_owner_status_idx
  on public.touchline_card_contracts(season_id, user_id, status, expires_at);

create unique index if not exists touchline_card_contracts_one_renewal_per_source_idx
  on public.touchline_card_contracts(renewed_from_contract_id)
  where renewed_from_contract_id is not null;

create table if not exists public.touchline_season_lifecycles (
  season_id uuid primary key references public.football_seasons(id) on delete restrict,
  competition_ends_at timestamptz not null,
  data_validation_ends_at timestamptz not null,
  renewal_window_opens_at timestamptz not null,
  next_season_starts_at timestamptz not null,
  status text not null default 'competitive' check (status in (
    'competitive',
    'data_validation',
    'post_season',
    'renewal_window',
    'next_season_live'
  )),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_validation_ends_at >= competition_ends_at),
  check (renewal_window_opens_at >= data_validation_ends_at),
  check (next_season_starts_at > renewal_window_opens_at)
);

alter table public.touchline_season_lifecycles enable row level security;
revoke all on table public.touchline_season_lifecycles from anon, authenticated;
grant select, insert, update on table public.touchline_season_lifecycles to service_role;

create table if not exists public.touchline_season_reset_runs (
  id uuid primary key default gen_random_uuid(),
  closing_season_id uuid not null references public.football_seasons(id) on delete restrict,
  next_season_id uuid not null references public.football_seasons(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned', 'executed', 'cancelled')),
  requested_by uuid references public.users(id) on delete set null,
  executed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (closing_season_id <> next_season_id)
);

create unique index if not exists touchline_season_reset_runs_closing_once_idx
  on public.touchline_season_reset_runs(closing_season_id)
  where status = 'executed';

alter table public.touchline_season_reset_runs enable row level security;
revoke all on table public.touchline_season_reset_runs from anon, authenticated;
grant select, insert, update on table public.touchline_season_reset_runs to service_role;

comment on column public.touchline_card_contracts.season_id is
  'The football season a TouchLine contract belongs to. A contract is a one-season licence, not permanent ownership.';
comment on column public.touchline_card_contracts.expires_at is
  'Immutable end-of-season expiry snapshot. A renewal is a new contract using the next season server quote.';
comment on column public.touchline_card_contracts.season_lifecycle_state is
  'Server-owned lifecycle state: active, season finished, renewal available, renewed, not eligible or archived.';
comment on table public.touchline_season_lifecycles is
  'Server-owned competition close, data validation, renewal and next-season boundaries. No automatic final-whistle close.';
comment on table public.touchline_season_reset_runs is
  'Auditable execution record for a controlled season reset. Historical contracts, results, rankings and achievements are retained.';

commit;
