-- QA Card Engine review state. Provider facts remain immutable; the owner may
-- only supply editorial overrides in this isolated, service-role-only store.
begin;
set local lock_timeout = '5s';

-- This extends the existing per-field protected override contract; it never
-- creates a competing override store or overwrites the approved rows already
-- present in QA.
alter table public.touchline_card_editorial_overrides
  drop constraint if exists touchline_card_editorial_overrides_field_key_check;
alter table public.touchline_card_editorial_overrides
  add constraint touchline_card_editorial_overrides_field_key_check check (field_key = any (array[
    'displayName', 'shirtNumber', 'marketValueEur', 'cardTemplateKey',
    'countryCode3', 'position'
  ]));

create table if not exists public.touchline_card_editorial_override_audit (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.football_players(id) on delete restrict,
  changed_fields text[] not null check (cardinality(changed_fields) > 0),
  provider_before jsonb not null,
  override_before jsonb not null,
  override_after jsonb not null,
  effective_before jsonb not null,
  effective_after jsonb not null,
  card_state_before text not null check (card_state_before in ('COMPLETE', 'REVIEW_REQUIRED')),
  card_state_after text not null check (card_state_after in ('COMPLETE', 'REVIEW_REQUIRED')),
  actor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists touchline_card_editorial_override_audit_player_created_idx
  on public.touchline_card_editorial_override_audit(player_id, created_at desc);

create or replace function public.touchline_card_editorial_override_audit_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception using errcode = '55000', message = 'TL_CARD_EDITORIAL_OVERRIDE_AUDIT_IMMUTABLE'; end;
$$;
drop trigger if exists touchline_card_editorial_override_audit_immutable on public.touchline_card_editorial_override_audit;
create trigger touchline_card_editorial_override_audit_immutable
  before update or delete on public.touchline_card_editorial_override_audit
  for each row execute function public.touchline_card_editorial_override_audit_immutable();

alter table public.touchline_card_editorial_override_audit enable row level security;
revoke all on public.touchline_card_editorial_override_audit from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_card_editorial_override_audit to service_role;

comment on table public.touchline_card_editorial_override_audit is
  'Immutable protected audit trail for editor overrides and card completeness transitions.';
commit;
