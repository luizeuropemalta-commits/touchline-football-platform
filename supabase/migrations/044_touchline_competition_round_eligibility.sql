-- Local-only V2.10.11 foundation for TouchLine competition-engine round
-- eligibility. It has no Premier League, fixture-provider, payment, tax,
-- wallet, contract or remote side effect. Apply nowhere until remote migration
-- history and the controlled fulfillment boundary are reviewed.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_competition_engine_rounds (
  id uuid primary key default gen_random_uuid(),
  competition_key text not null check (competition_key in ('england', 'europe', 'brazil')),
  season_key text not null check (length(btrim(season_key)) between 3 and 80),
  round_sequence integer not null check (round_sequence > 0),
  entry_status text not null check (entry_status in ('SCHEDULED', 'OPEN', 'LOCKED', 'SETTLED')),
  entry_opens_at timestamptz,
  entry_locks_at timestamptz,
  locked_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_key, season_key, round_sequence),
  check (entry_locks_at is null or entry_opens_at is null or entry_locks_at >= entry_opens_at),
  check ((entry_status <> 'LOCKED') or locked_at is not null),
  check ((entry_status <> 'SETTLED') or settled_at is not null)
);

-- The entry is a TouchLine engine snapshot, not an external match fixture.
-- `eligibility_status` is fixed at entry lock and never re-evaluated later.
create table if not exists public.touchline_competition_round_entries (
  round_id uuid not null references public.touchline_competition_engine_rounds(id) on delete restrict,
  entitlement_id uuid not null references public.touchline_competition_entitlements(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  competition_key text not null check (competition_key in ('england', 'europe', 'brazil')),
  eligibility_status text not null check (eligibility_status = 'ELIGIBLE_AT_LOCK'),
  locked_at timestamptz not null default now(),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 160),
  created_at timestamptz not null default now(),
  primary key (round_id, entitlement_id)
);

create index if not exists touchline_competition_engine_rounds_next_idx
  on public.touchline_competition_engine_rounds(competition_key, season_key, entry_status, round_sequence);
create index if not exists touchline_competition_round_entries_user_idx
  on public.touchline_competition_round_entries(user_id, competition_key, locked_at desc);

create trigger touchline_competition_engine_rounds_updated
  before update on public.touchline_competition_engine_rounds
  for each row execute function public.touch_updated_at();

create or replace function public.lock_touchline_competition_round_entry(
  p_entitlement_id uuid,
  p_round_id uuid,
  p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  entitlement_user_id uuid;
  entitlement_competition text;
  round_competition text;
  round_status text;
  existing_entry boolean;
begin
  if length(btrim(p_idempotency_key)) < 8 then
    raise exception 'Round entry requires an idempotency key';
  end if;
  perform pg_advisory_xact_lock(hashtext('touchline-round-entry:' || p_round_id::text || ':' || p_entitlement_id::text));

  select user_id, competition_key into entitlement_user_id, entitlement_competition
  from public.touchline_competition_entitlements
  where id = p_entitlement_id
    and status in ('ACTIVE', 'REACTIVATED')
  for update;
  if entitlement_user_id is null then
    raise exception 'Club maintenance is not eligible for a new TouchLine round';
  end if;

  select competition_key, entry_status into round_competition, round_status
  from public.touchline_competition_engine_rounds
  where id = p_round_id
  for update;
  if round_competition is null or round_competition <> entitlement_competition or round_status <> 'OPEN' then
    raise exception 'TouchLine competition round is not open for this club';
  end if;

  select exists(
    select 1 from public.touchline_competition_round_entries
    where round_id = p_round_id and entitlement_id = p_entitlement_id
  ) into existing_entry;
  if existing_entry then return false; end if;

  insert into public.touchline_competition_round_entries (
    round_id, entitlement_id, user_id, competition_key, idempotency_key
  ) values (p_round_id, p_entitlement_id, entitlement_user_id, entitlement_competition, p_idempotency_key);
  return true;
end;
$$;

alter table public.touchline_competition_engine_rounds enable row level security;
alter table public.touchline_competition_round_entries enable row level security;

revoke all on table public.touchline_competition_engine_rounds from public, anon, authenticated;
revoke all on table public.touchline_competition_round_entries from public, anon, authenticated;
revoke all on function public.lock_touchline_competition_round_entry(uuid, uuid, text) from public, anon, authenticated;

grant select, insert, update, delete on table public.touchline_competition_engine_rounds to service_role;
grant select, insert on table public.touchline_competition_round_entries to service_role;
grant execute on function public.lock_touchline_competition_round_entry(uuid, uuid, text) to service_role;

create policy "ClubOwner reads own TouchLine round entries"
  on public.touchline_competition_round_entries
  for select to authenticated using (user_id = auth.uid());

comment on table public.touchline_competition_engine_rounds is
  'TouchLine competition-engine schedule, independent of real-football league calendars and providers.';
comment on table public.touchline_competition_round_entries is
  'Immutable club eligibility snapshot at TouchLine round lock. Later maintenance expiry cannot remove a locked entry or alter prior results.';

commit;
