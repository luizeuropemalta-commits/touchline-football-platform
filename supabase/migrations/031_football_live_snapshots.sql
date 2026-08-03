create table if not exists public.football_live_snapshots (
  snapshot_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.football_live_snapshots enable row level security;

revoke all on table public.football_live_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.football_live_snapshots to service_role;

comment on table public.football_live_snapshots is
  'Atomic server-side snapshots for public TouchLine Live; provider payloads are sanitized before persistence.';
