-- TouchLine Development QA only. Do not add this file to supabase/migrations.
-- Target: xgxbwqxjssxxuihuwmgy. Production is structurally excluded.
--
-- TouchLine coach contracts and fixture-backed scoring.
--
-- Sportmonks remains the raw football-data provider. TouchLine owns the game
-- contract, scoring version and immutable result history. Provider refreshes
-- may reconcile a provisional row, but they can never rewrite a final row.

begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Narrow pre-image for a non-destructive application rollback. The migration
-- never removes or rewrites the legacy selection; an old QA deployment can be
-- restored immediately while these additive audit tables remain preserved.
create table if not exists public.touchline_qa_coach_contract_before (
  user_id uuid primary key references public.users(id) on delete restrict,
  coach_provider_id text,
  captured_at timestamptz not null default clock_timestamp(),
  project_ref text not null default 'xgxbwqxjssxxuihuwmgy'
    check (project_ref = 'xgxbwqxjssxxuihuwmgy')
);

alter table public.touchline_qa_coach_contract_before enable row level security;
alter table public.touchline_qa_coach_contract_before force row level security;
revoke all privileges on table public.touchline_qa_coach_contract_before from public, anon, authenticated;
grant select, insert on table public.touchline_qa_coach_contract_before to service_role;

insert into public.touchline_qa_coach_contract_before (user_id, coach_provider_id)
select user_id, coach_provider_id
from public.touchline_user_arena_state
on conflict (user_id) do nothing;

create table if not exists public.touchline_coach_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  coach_provider_id text not null check (length(trim(coach_provider_id)) between 1 and 80),
  club_id uuid not null references public.football_clubs(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'ended')),
  scoring_version text not null default 'coach_scoring_v1' check (scoring_version = 'coach_scoring_v1'),
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  end_reason text,
  hire_idempotency_key text not null,
  end_idempotency_key text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (status = 'active' and ended_at is null and end_reason is null)
    or (status = 'ended' and ended_at is not null and ended_at >= started_at and nullif(trim(end_reason), '') is not null)
  ),
  unique (user_id, hire_idempotency_key)
);

create unique index if not exists touchline_coach_contracts_one_active_owner_idx
  on public.touchline_coach_contracts (user_id)
  where status = 'active';
create index if not exists touchline_coach_contracts_owner_history_idx
  on public.touchline_coach_contracts (user_id, started_at desc);
create index if not exists touchline_coach_contracts_club_time_idx
  on public.touchline_coach_contracts (club_id, started_at, ended_at);

create table if not exists public.touchline_coach_contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.touchline_coach_contracts(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  event_type text not null check (event_type in ('hired', 'cancelled')),
  idempotency_key text not null,
  reason text,
  points_snapshot jsonb not null default '{"home":{"wins":0,"draws":0,"losses":0,"touchlinePoints":0},"away":{"wins":0,"draws":0,"losses":0,"touchlinePoints":0},"totalTouchlinePoints":0}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (user_id, idempotency_key)
);

create index if not exists touchline_coach_contract_events_contract_idx
  on public.touchline_coach_contract_events (contract_id, occurred_at desc);

create table if not exists public.touchline_coach_fixture_points (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.touchline_coach_contracts(id) on delete restrict,
  fixture_id uuid not null references public.football_fixtures(id) on delete restrict,
  fixture_context text not null check (fixture_context in ('home', 'away')),
  outcome text not null check (outcome in ('win', 'draw', 'loss')),
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  touchline_points integer not null check (touchline_points between 0 and 4),
  settlement_status text not null check (settlement_status in ('provisional', 'final')),
  scoring_version text not null check (scoring_version = 'coach_scoring_v1'),
  provider_source_updated_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (contract_id, fixture_id),
  check ((settlement_status = 'final' and settled_at is not null) or settlement_status = 'provisional')
);

create index if not exists touchline_coach_fixture_points_contract_idx
  on public.touchline_coach_fixture_points (contract_id, settlement_status, fixture_id);
create index if not exists touchline_coach_fixture_points_fixture_idx
  on public.touchline_coach_fixture_points (fixture_id);

create or replace function public.touchline_coach_history_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'TL_COACH_HISTORY_IMMUTABLE';
end;
$$;

drop trigger if exists touchline_coach_contract_events_immutable on public.touchline_coach_contract_events;
create trigger touchline_coach_contract_events_immutable
  before update or delete on public.touchline_coach_contract_events
  for each row execute function public.touchline_coach_history_is_immutable();

create or replace function public.touchline_coach_final_points_are_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or old.settlement_status = 'final' then
    raise exception using errcode = 'P0001', message = 'TL_COACH_FINAL_POINTS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists touchline_coach_fixture_points_immutable on public.touchline_coach_fixture_points;
create trigger touchline_coach_fixture_points_immutable
  before update or delete on public.touchline_coach_fixture_points
  for each row execute function public.touchline_coach_final_points_are_immutable();

create or replace function public.touchline_coach_points_snapshot(p_contract_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with record as (
    select
      fixture_context,
      count(*) filter (where outcome = 'win')::integer as wins,
      count(*) filter (where outcome = 'draw')::integer as draws,
      count(*) filter (where outcome = 'loss')::integer as losses,
      coalesce(sum(touchline_points), 0)::integer as points
    from public.touchline_coach_fixture_points
    where contract_id = p_contract_id
    group by fixture_context
  )
  select jsonb_build_object(
    'home', jsonb_build_object(
      'wins', coalesce((select wins from record where fixture_context = 'home'), 0),
      'draws', coalesce((select draws from record where fixture_context = 'home'), 0),
      'losses', coalesce((select losses from record where fixture_context = 'home'), 0),
      'touchlinePoints', coalesce((select points from record where fixture_context = 'home'), 0)
    ),
    'away', jsonb_build_object(
      'wins', coalesce((select wins from record where fixture_context = 'away'), 0),
      'draws', coalesce((select draws from record where fixture_context = 'away'), 0),
      'losses', coalesce((select losses from record where fixture_context = 'away'), 0),
      'touchlinePoints', coalesce((select points from record where fixture_context = 'away'), 0)
    ),
    'totalTouchlinePoints', coalesce((select sum(points) from record), 0)
  );
$$;

create or replace function public.touchline_hire_coach_contract(
  p_user_id uuid,
  p_coach_provider_id text,
  p_club_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.touchline_coach_contracts%rowtype;
  v_contract public.touchline_coach_contracts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;
  if p_user_id is null or p_club_id is null or nullif(trim(p_coach_provider_id), '') is null
     or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'TL_COACH_HIRE_INVALID';
  end if;

  perform id from public.users where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_COACH_USER_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.football_clubs
    where id = p_club_id and provider = 'sportmonks' and nullif(trim(provider_team_id), '') is not null
  ) then
    raise exception using errcode = 'P0001', message = 'TL_COACH_CLUB_NOT_CANONICAL';
  end if;

  select * into v_existing
  from public.touchline_coach_contracts
  where user_id = p_user_id and hire_idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.coach_provider_id <> trim(p_coach_provider_id) or v_existing.club_id <> p_club_id then
      raise exception using errcode = 'P0001', message = 'TL_COACH_HIRE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok', true, 'idempotentReplay', true, 'contractId', v_existing.id, 'status', v_existing.status);
  end if;

  select * into v_existing
  from public.touchline_coach_contracts
  where user_id = p_user_id and status = 'active'
  for update;
  if found then
    if v_existing.coach_provider_id = trim(p_coach_provider_id) and v_existing.club_id = p_club_id then
      return jsonb_build_object('ok', true, 'idempotentReplay', true, 'contractId', v_existing.id, 'status', 'active');
    end if;
    raise exception using errcode = 'P0001', message = 'TL_COACH_ACTIVE_CONTRACT_EXISTS';
  end if;

  insert into public.touchline_coach_contracts (
    user_id, coach_provider_id, club_id, status, scoring_version, started_at, hire_idempotency_key
  ) values (
    p_user_id, trim(p_coach_provider_id), p_club_id, 'active', 'coach_scoring_v1', v_now, trim(p_idempotency_key)
  ) returning * into v_contract;

  insert into public.touchline_coach_contract_events (
    contract_id, user_id, event_type, idempotency_key, reason, occurred_at
  ) values (
    v_contract.id, p_user_id, 'hired', trim(p_idempotency_key), 'ClubOwner hired coach', v_now
  );

  insert into public.touchline_user_arena_state (user_id, coach_provider_id, updated_at)
  values (p_user_id, trim(p_coach_provider_id), v_now)
  on conflict (user_id) do update set
    coach_provider_id = excluded.coach_provider_id,
    updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'idempotentReplay', false, 'contractId', v_contract.id, 'status', 'active');
end;
$$;

create or replace function public.touchline_end_coach_contract(
  p_user_id uuid,
  p_end_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.touchline_coach_contracts%rowtype;
  v_event public.touchline_coach_contract_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;
  if p_user_id is null or length(trim(coalesce(p_end_reason, ''))) not between 3 and 240
     or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'TL_COACH_END_INVALID';
  end if;

  perform id from public.users where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_COACH_USER_NOT_FOUND';
  end if;
  select * into v_event from public.touchline_coach_contract_events
  where user_id = p_user_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_event.event_type <> 'cancelled' then
      raise exception using errcode = 'P0001', message = 'TL_COACH_END_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok', true, 'idempotentReplay', true, 'contractId', v_event.contract_id, 'status', 'ended');
  end if;

  select * into v_contract from public.touchline_coach_contracts
  where user_id = p_user_id and status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_COACH_ACTIVE_CONTRACT_NOT_FOUND';
  end if;
  v_snapshot := public.touchline_coach_points_snapshot(v_contract.id);

  update public.touchline_coach_contracts
  set status = 'ended', ended_at = v_now, end_reason = trim(p_end_reason),
      end_idempotency_key = trim(p_idempotency_key), updated_at = v_now
  where id = v_contract.id and status = 'active';

  insert into public.touchline_coach_contract_events (
    contract_id, user_id, event_type, idempotency_key, reason, points_snapshot, occurred_at
  ) values (
    v_contract.id, p_user_id, 'cancelled', trim(p_idempotency_key), trim(p_end_reason), v_snapshot, v_now
  );

  update public.touchline_user_arena_state
  set coach_provider_id = null, updated_at = v_now
  where user_id = p_user_id and coach_provider_id = v_contract.coach_provider_id;

  return jsonb_build_object('ok', true, 'idempotentReplay', false, 'contractId', v_contract.id, 'status', 'ended', 'points', v_snapshot);
end;
$$;

create or replace function public.touchline_reconcile_coach_fixture_points(p_fixture_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record;
  v_context text;
  v_outcome text;
  v_points integer;
  v_settlement text;
  v_count integer := 0;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;

  for v_record in
    select contract.id as contract_id, contract.club_id, contract.started_at, contract.ended_at,
      fixture.id as fixture_id, fixture.home_club_id, fixture.away_club_id,
      fixture.starts_at, fixture.status, fixture.home_score, fixture.away_score,
      fixture.source_updated_at
    from public.touchline_coach_contracts as contract
    join public.football_fixtures as fixture
      on contract.club_id in (fixture.home_club_id, fixture.away_club_id)
    where (p_fixture_id is null or fixture.id = p_fixture_id)
      and fixture.starts_at >= contract.started_at
      and (contract.ended_at is null or fixture.starts_at < contract.ended_at)
      and fixture.home_score is not null
      and fixture.away_score is not null
  loop
    v_context := case when v_record.home_club_id = v_record.club_id then 'home' else 'away' end;
    v_outcome := case
      when v_record.home_score = v_record.away_score then 'draw'
      when (v_context = 'home' and v_record.home_score > v_record.away_score)
        or (v_context = 'away' and v_record.away_score > v_record.home_score) then 'win'
      else 'loss'
    end;
    v_points := case
      when v_context = 'home' and v_outcome = 'win' then 3
      when v_context = 'home' and v_outcome = 'draw' then 1
      when v_context = 'away' and v_outcome = 'win' then 4
      when v_context = 'away' and v_outcome = 'draw' then 2
      else 0
    end;
    v_settlement := case
      when lower(coalesce(v_record.status, '')) in ('ft', 'aet', 'pen', 'finished', 'after extra time', 'after penalties') then 'final'
      else 'provisional'
    end;

    insert into public.touchline_coach_fixture_points (
      contract_id, fixture_id, fixture_context, outcome, home_score, away_score,
      touchline_points, settlement_status, scoring_version,
      provider_source_updated_at, settled_at, updated_at
    ) values (
      v_record.contract_id, v_record.fixture_id, v_context, v_outcome,
      v_record.home_score, v_record.away_score, v_points, v_settlement,
      'coach_scoring_v1', v_record.source_updated_at,
      case when v_settlement = 'final' then clock_timestamp() else null end,
      clock_timestamp()
    )
    on conflict (contract_id, fixture_id) do update set
      fixture_context = excluded.fixture_context,
      outcome = excluded.outcome,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      touchline_points = excluded.touchline_points,
      settlement_status = excluded.settlement_status,
      scoring_version = excluded.scoring_version,
      provider_source_updated_at = excluded.provider_source_updated_at,
      settled_at = case when excluded.settlement_status = 'final' then excluded.settled_at else null end,
      updated_at = excluded.updated_at
    where touchline_coach_fixture_points.settlement_status <> 'final'
      and row(
        touchline_coach_fixture_points.fixture_context,
        touchline_coach_fixture_points.outcome,
        touchline_coach_fixture_points.home_score,
        touchline_coach_fixture_points.away_score,
        touchline_coach_fixture_points.touchline_points,
        touchline_coach_fixture_points.settlement_status,
        touchline_coach_fixture_points.provider_source_updated_at
      ) is distinct from row(
        excluded.fixture_context, excluded.outcome, excluded.home_score, excluded.away_score,
        excluded.touchline_points, excluded.settlement_status, excluded.provider_source_updated_at
      );
    if found then v_count := v_count + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'reconciled', v_count, 'scoringVersion', 'coach_scoring_v1');
end;
$$;

alter table public.touchline_coach_contracts enable row level security;
alter table public.touchline_coach_contracts force row level security;
alter table public.touchline_coach_contract_events enable row level security;
alter table public.touchline_coach_contract_events force row level security;
alter table public.touchline_coach_fixture_points enable row level security;
alter table public.touchline_coach_fixture_points force row level security;

revoke all privileges on table public.touchline_coach_contracts from public, anon, authenticated;
revoke all privileges on table public.touchline_coach_contract_events from public, anon, authenticated;
revoke all privileges on table public.touchline_coach_fixture_points from public, anon, authenticated;
grant select, insert, update on table public.touchline_coach_contracts to service_role;
grant select, insert on table public.touchline_coach_contract_events to service_role;
grant select, insert, update on table public.touchline_coach_fixture_points to service_role;

revoke execute on function public.touchline_coach_points_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.touchline_hire_coach_contract(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.touchline_end_coach_contract(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.touchline_reconcile_coach_fixture_points(uuid) from public, anon, authenticated;
grant execute on function public.touchline_coach_points_snapshot(uuid) to service_role;
grant execute on function public.touchline_hire_coach_contract(uuid, text, uuid, text) to service_role;
grant execute on function public.touchline_end_coach_contract(uuid, text, text) to service_role;
grant execute on function public.touchline_reconcile_coach_fixture_points(uuid) to service_role;

-- Existing canonical coach selections become contracts from migration time.
-- This intentionally grants no retroactive points: started_at is now().
with approved_coaches(coach_provider_id, team_provider_id) as (
  values
    ('307','19'),('455907','15'),('29710','52'),('255','236'),('37679','78'),
    ('511','18'),('95','117'),('37732840','51'),('455355','13'),('515','11'),
    ('74546','22'),('270','116'),('460535','71'),('19960388','8'),('107439','9'),
    ('645','14'),('523911','20'),('51518','63'),('529482','3'),('127889','6')
), legacy as (
  select arena.user_id, arena.coach_provider_id, club.id as club_id
  from public.touchline_user_arena_state as arena
  join approved_coaches as approved on approved.coach_provider_id = arena.coach_provider_id
  join public.football_clubs as club
    on club.provider = 'sportmonks' and club.provider_team_id = approved.team_provider_id
  where arena.coach_provider_id is not null
    and not exists (
      select 1 from public.touchline_coach_contracts as contract
      where contract.user_id = arena.user_id and contract.status = 'active'
    )
), inserted as (
  insert into public.touchline_coach_contracts (
    user_id, coach_provider_id, club_id, status, scoring_version, started_at, hire_idempotency_key
  )
  select user_id, coach_provider_id, club_id, 'active', 'coach_scoring_v1', clock_timestamp(),
    'legacy-selection-' || coach_provider_id
  from legacy
  on conflict do nothing
  returning id, user_id
)
insert into public.touchline_coach_contract_events (
  contract_id, user_id, event_type, idempotency_key, reason
)
select id, user_id, 'hired', 'legacy-selection-migration-' || id::text,
  'Existing canonical Arena coach selection migrated without retroactive points'
from inserted
on conflict do nothing;

comment on table public.touchline_coach_contracts is
  'TouchLine-authoritative ClubOwner coach contracts. Sportmonks coach/club IDs are identity references and cannot overwrite TouchLine contract history.';
comment on table public.touchline_coach_fixture_points is
  'Versioned fixture-backed TouchLine coach points. Provisional provider scores may reconcile; final TouchLine settlements are immutable.';

commit;
