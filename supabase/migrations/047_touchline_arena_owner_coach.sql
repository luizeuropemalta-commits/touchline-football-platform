-- Coach-first Arena ownership. This is identity-only state: it creates no
-- wallet entry, price, payment, Touch Credit movement or commercial contract.

alter table public.touchline_user_arena_state
  add column if not exists coach_provider_id text;

create index if not exists touchline_user_arena_state_coach_provider_idx
  on public.touchline_user_arena_state (coach_provider_id)
  where coach_provider_id is not null;

comment on column public.touchline_user_arena_state.coach_provider_id is
  'Selected official coach provider ID for the ClubOwner Arena. Server validation restricts this to the canonical England coach registry.';
