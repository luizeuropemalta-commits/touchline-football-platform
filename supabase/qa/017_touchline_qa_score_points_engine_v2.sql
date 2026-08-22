-- TouchLine Development QA only. Target is asserted in-database.
-- Player scoring columns, coach_scoring_v2 and canonical coach ranking.
-- Production is deliberately outside this mission.

begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

alter table public.football_player_fixture_statistics
  add column if not exists position_group text,
  add column if not exists scoring_coverage_status text,
  add column if not exists missing_scoring_facts jsonb not null default '[]'::jsonb;

alter table public.football_player_fixture_statistics
  drop constraint if exists football_player_fixture_statistics_position_group_check,
  add constraint football_player_fixture_statistics_position_group_check
    check (position_group is null or position_group in ('Goalkeeper','Defender','Midfielder','Attacker')),
  drop constraint if exists football_player_fixture_statistics_scoring_coverage_check,
  add constraint football_player_fixture_statistics_scoring_coverage_check
    check (scoring_coverage_status is null or scoring_coverage_status in ('complete','partial','unavailable')),
  drop constraint if exists football_player_fixture_statistics_missing_facts_check,
  add constraint football_player_fixture_statistics_missing_facts_check
    check (jsonb_typeof(missing_scoring_facts) = 'array');

alter table public.football_player_season_statistics
  add column if not exists scoring_version text;

alter table public.touchline_card_ranking_snapshots
  add column if not exists scoring_version text,
  add column if not exists fixture_ids jsonb not null default '[]'::jsonb;

alter table public.touchline_card_ranking_snapshots
  drop constraint if exists touchline_card_ranking_scoring_version_check,
  add constraint touchline_card_ranking_scoring_version_check
    check (scoring_version is null or scoring_version in ('player_scoring_v1','player_scoring_v2')),
  drop constraint if exists touchline_card_ranking_fixture_ids_check,
  add constraint touchline_card_ranking_fixture_ids_check
    check (jsonb_typeof(fixture_ids) = 'array');

alter table public.touchline_coach_contracts
  alter column scoring_version set default 'coach_scoring_v2',
  drop constraint if exists touchline_coach_contracts_scoring_version_check,
  add constraint touchline_coach_contracts_scoring_version_check
    check (scoring_version in ('coach_scoring_v1','coach_scoring_v2'));

alter table public.touchline_coach_fixture_points
  drop constraint if exists touchline_coach_fixture_points_touchline_points_check,
  add constraint touchline_coach_fixture_points_touchline_points_check
    check (touchline_points between -2 and 6),
  drop constraint if exists touchline_coach_fixture_points_scoring_version_check,
  add constraint touchline_coach_fixture_points_scoring_version_check
    check (scoring_version in ('coach_scoring_v1','coach_scoring_v2')),
  drop constraint if exists touchline_coach_fixture_points_contract_id_fixture_id_key;

alter table public.touchline_coach_fixture_points
  add constraint touchline_coach_fixture_points_contract_fixture_version_key
    unique (contract_id, fixture_id, scoring_version);

-- Existing v1 rows remain immutable history. Active contracts opt into V2;
-- reconciliation inserts a parallel V2 settlement for eligible fixtures.
update public.touchline_coach_contracts
set scoring_version = 'coach_scoring_v2', updated_at = clock_timestamp()
where status = 'active' and scoring_version <> 'coach_scoring_v2';

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
  if not found then raise exception using errcode = 'P0001', message = 'TL_COACH_USER_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.football_clubs
    where id = p_club_id and provider = 'sportmonks' and nullif(trim(provider_team_id), '') is not null
  ) then raise exception using errcode = 'P0001', message = 'TL_COACH_CLUB_NOT_CANONICAL'; end if;

  select * into v_existing from public.touchline_coach_contracts
  where user_id = p_user_id and hire_idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.coach_provider_id <> trim(p_coach_provider_id) or v_existing.club_id <> p_club_id then
      raise exception using errcode = 'P0001', message = 'TL_COACH_HIRE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok',true,'idempotentReplay',true,'contractId',v_existing.id,'status',v_existing.status,'scoringVersion',v_existing.scoring_version);
  end if;

  select * into v_existing from public.touchline_coach_contracts
  where user_id = p_user_id and status = 'active' for update;
  if found then
    if v_existing.coach_provider_id = trim(p_coach_provider_id) and v_existing.club_id = p_club_id then
      return jsonb_build_object('ok',true,'idempotentReplay',true,'contractId',v_existing.id,'status','active','scoringVersion',v_existing.scoring_version);
    end if;
    raise exception using errcode = 'P0001', message = 'TL_COACH_ACTIVE_CONTRACT_EXISTS';
  end if;

  insert into public.touchline_coach_contracts (
    user_id,coach_provider_id,club_id,status,scoring_version,started_at,hire_idempotency_key
  ) values (
    p_user_id,trim(p_coach_provider_id),p_club_id,'active','coach_scoring_v2',v_now,trim(p_idempotency_key)
  ) returning * into v_contract;
  insert into public.touchline_coach_contract_events (
    contract_id,user_id,event_type,idempotency_key,reason,occurred_at
  ) values (
    v_contract.id,p_user_id,'hired',trim(p_idempotency_key),'ClubOwner hired coach',v_now
  );
  insert into public.touchline_user_arena_state (user_id,coach_provider_id,updated_at)
  values (p_user_id,trim(p_coach_provider_id),v_now)
  on conflict (user_id) do update set coach_provider_id=excluded.coach_provider_id,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'idempotentReplay',false,'contractId',v_contract.id,'status','active','scoringVersion','coach_scoring_v2');
end;
$$;

create table if not exists public.touchline_coach_ranking_snapshots (
  snapshot_id text primary key,
  league_key text not null check (league_key = 'touchline-england'),
  season_id uuid not null references public.football_seasons(id) on delete restrict,
  scoring_version text not null check (scoring_version = 'coach_scoring_v2'),
  fixture_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(fixture_ids) = 'array'),
  generated_at timestamptz not null,
  checksum text not null unique,
  ranking_payload jsonb not null check (jsonb_typeof(ranking_payload) = 'array'),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.touchline_coach_ranking_active_snapshots (
  league_key text primary key check (league_key = 'touchline-england'),
  snapshot_id text not null references public.touchline_coach_ranking_snapshots(snapshot_id) on delete restrict,
  activated_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.touchline_coach_ranking_snapshots enable row level security;
alter table public.touchline_coach_ranking_snapshots force row level security;
alter table public.touchline_coach_ranking_active_snapshots enable row level security;
alter table public.touchline_coach_ranking_active_snapshots force row level security;
revoke all privileges on table public.touchline_coach_ranking_snapshots from public, anon, authenticated;
revoke all privileges on table public.touchline_coach_ranking_active_snapshots from public, anon, authenticated;
grant select, insert on table public.touchline_coach_ranking_snapshots to service_role;
grant select, insert, update on table public.touchline_coach_ranking_active_snapshots to service_role;

create or replace function public.touchline_coach_points_snapshot(p_contract_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with contract as (
    select scoring_version from public.touchline_coach_contracts where id = p_contract_id
  ), record as (
    select fixture_context,
      count(*) filter (where outcome = 'win')::integer as wins,
      count(*) filter (where outcome = 'draw')::integer as draws,
      count(*) filter (where outcome = 'loss')::integer as losses,
      coalesce(sum(touchline_points), 0)::integer as points
    from public.touchline_coach_fixture_points
    where contract_id = p_contract_id
      and scoring_version = (select scoring_version from contract)
    group by fixture_context
  )
  select jsonb_build_object(
    'scoringVersion', (select scoring_version from contract),
    'home', jsonb_build_object('wins', coalesce((select wins from record where fixture_context='home'),0), 'draws', coalesce((select draws from record where fixture_context='home'),0), 'losses', coalesce((select losses from record where fixture_context='home'),0), 'touchlinePoints', coalesce((select points from record where fixture_context='home'),0)),
    'away', jsonb_build_object('wins', coalesce((select wins from record where fixture_context='away'),0), 'draws', coalesce((select draws from record where fixture_context='away'),0), 'losses', coalesce((select losses from record where fixture_context='away'),0), 'touchlinePoints', coalesce((select points from record where fixture_context='away'),0)),
    'totalTouchlinePoints', coalesce((select sum(points) from record),0)
  );
$$;

create or replace function public.touchline_rebuild_coach_ranking_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_payload jsonb;
  v_fixture_ids jsonb;
  v_checksum text;
  v_snapshot_id text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;
  select season.id into v_season_id
  from public.football_seasons season
  join public.football_competitions competition on competition.id = season.competition_id
  where season.is_current is true and competition.provider = 'sportmonks' and competition.provider_competition_id = '8'
  order by season.starts_at desc nulls last limit 1;
  if v_season_id is null then return jsonb_build_object('ok', false, 'reason', 'season-unavailable'); end if;

  with totals as (
    select contract.id as contract_id, contract.coach_provider_id, club.name as club_name,
      coalesce(sum(points.touchline_points) filter (where fixture.season_id=v_season_id),0)::integer as touchline_points,
      count(*) filter (where fixture.season_id=v_season_id and points.outcome='win')::integer as wins,
      count(*) filter (where fixture.season_id=v_season_id and points.outcome='draw')::integer as draws,
      count(*) filter (where fixture.season_id=v_season_id and points.outcome='loss')::integer as losses,
      count(*) filter (where fixture.season_id=v_season_id and points.fixture_context='away' and points.outcome='win')::integer as away_wins
    from public.touchline_coach_contracts contract
    join public.football_clubs club on club.id = contract.club_id
    left join public.touchline_coach_fixture_points points
      on points.contract_id = contract.id and points.scoring_version='coach_scoring_v2'
    left join public.football_fixtures fixture on fixture.id=points.fixture_id
    where contract.scoring_version='coach_scoring_v2'
    group by contract.id, contract.coach_provider_id, club.name
  ), ranked as (
    select *, row_number() over (order by touchline_points desc, wins desc, away_wins desc, coach_provider_id) as rank
    from totals
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank, 'contractId', contract_id, 'coachProviderId', coach_provider_id,
    'clubName', club_name, 'touchlinePoints', touchline_points,
    'wins', wins, 'draws', draws, 'losses', losses, 'awayWins', away_wins,
    'tiebreaker', 'points,wins,awayWins,coachProviderId'
  ) order by rank), '[]'::jsonb) into v_payload from ranked;

  select coalesce(jsonb_agg(distinct fixture.provider_fixture_id order by fixture.provider_fixture_id), '[]'::jsonb)
  into v_fixture_ids
  from public.touchline_coach_fixture_points points
  join public.football_fixtures fixture on fixture.id=points.fixture_id
  where points.scoring_version='coach_scoring_v2' and fixture.season_id=v_season_id;

  v_checksum := md5(v_season_id::text || ':coach_scoring_v2:' || v_fixture_ids::text || ':' || v_payload::text);
  v_snapshot_id := 'coach-v2:' || v_season_id::text || ':' || v_checksum;
  insert into public.touchline_coach_ranking_snapshots (
    snapshot_id, league_key, season_id, scoring_version, fixture_ids, generated_at, checksum, ranking_payload
  ) values (v_snapshot_id, 'touchline-england', v_season_id, 'coach_scoring_v2', v_fixture_ids, v_now, v_checksum, v_payload)
  on conflict (snapshot_id) do nothing;
  insert into public.touchline_coach_ranking_active_snapshots (league_key,snapshot_id,activated_at,updated_at)
  values ('touchline-england',v_snapshot_id,v_now,v_now)
  on conflict (league_key) do update set snapshot_id=excluded.snapshot_id, activated_at=excluded.activated_at, updated_at=excluded.updated_at
  where touchline_coach_ranking_active_snapshots.snapshot_id is distinct from excluded.snapshot_id;
  return jsonb_build_object('ok',true,'snapshotId',v_snapshot_id,'checksum',v_checksum,'rows',jsonb_array_length(v_payload));
end;
$$;

create or replace function public.touchline_reconcile_coach_fixture_points(p_fixture_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record; v_context text; v_outcome text; v_points integer; v_settlement text; v_count integer := 0; v_ranking jsonb;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then raise exception using errcode='42501', message='TL_COACH_ADMIN_REQUIRED'; end if;
  for v_record in
    select contract.id contract_id, contract.club_id, fixture.id fixture_id, fixture.home_club_id, fixture.away_club_id,
      fixture.starts_at, fixture.status, fixture.home_score, fixture.away_score, fixture.source_updated_at
    from public.touchline_coach_contracts contract
    join public.football_fixtures fixture on contract.club_id in (fixture.home_club_id,fixture.away_club_id)
    where contract.scoring_version='coach_scoring_v2'
      and (p_fixture_id is null or fixture.id=p_fixture_id)
      and fixture.starts_at >= contract.started_at
      and (contract.ended_at is null or fixture.starts_at < contract.ended_at)
      and fixture.home_score is not null and fixture.away_score is not null
  loop
    v_context := case when v_record.home_club_id=v_record.club_id then 'home' else 'away' end;
    v_outcome := case when v_record.home_score=v_record.away_score then 'draw'
      when (v_context='home' and v_record.home_score>v_record.away_score) or (v_context='away' and v_record.away_score>v_record.home_score) then 'win' else 'loss' end;
    v_points := case
      when v_context='home' and v_outcome='win' then 3 when v_context='home' and v_outcome='draw' then 1 when v_context='home' then -2
      when v_outcome='win' then 6 when v_outcome='draw' then 3 else -1 end;
    v_settlement := case when lower(trim(coalesce(v_record.status,''))) in ('ft','aet','pen','finished','full time','after extra time','after penalties') then 'final' else 'provisional' end;
    insert into public.touchline_coach_fixture_points (
      contract_id,fixture_id,fixture_context,outcome,home_score,away_score,touchline_points,settlement_status,scoring_version,provider_source_updated_at,settled_at,updated_at
    ) values (v_record.contract_id,v_record.fixture_id,v_context,v_outcome,v_record.home_score,v_record.away_score,v_points,v_settlement,'coach_scoring_v2',v_record.source_updated_at,case when v_settlement='final' then clock_timestamp() end,clock_timestamp())
    on conflict (contract_id,fixture_id,scoring_version) do update set
      fixture_context=excluded.fixture_context,outcome=excluded.outcome,home_score=excluded.home_score,away_score=excluded.away_score,
      touchline_points=excluded.touchline_points,settlement_status=excluded.settlement_status,provider_source_updated_at=excluded.provider_source_updated_at,
      settled_at=case when excluded.settlement_status='final' then excluded.settled_at end,updated_at=excluded.updated_at
    where public.touchline_coach_fixture_points.settlement_status <> 'final'
      and row(public.touchline_coach_fixture_points.fixture_context,public.touchline_coach_fixture_points.outcome,public.touchline_coach_fixture_points.home_score,public.touchline_coach_fixture_points.away_score,public.touchline_coach_fixture_points.touchline_points,public.touchline_coach_fixture_points.settlement_status,public.touchline_coach_fixture_points.provider_source_updated_at)
        is distinct from row(excluded.fixture_context,excluded.outcome,excluded.home_score,excluded.away_score,excluded.touchline_points,excluded.settlement_status,excluded.provider_source_updated_at);
    if found then v_count := v_count + 1; end if;
  end loop;
  v_ranking := public.touchline_rebuild_coach_ranking_v2();
  return jsonb_build_object('ok',true,'reconciled',v_count,'scoringVersion','coach_scoring_v2','ranking',v_ranking);
end;
$$;

revoke execute on function public.touchline_rebuild_coach_ranking_v2() from public, anon, authenticated;
revoke execute on function public.touchline_reconcile_coach_fixture_points(uuid) from public, anon, authenticated;
revoke execute on function public.touchline_hire_coach_contract(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.touchline_rebuild_coach_ranking_v2() to service_role;
grant execute on function public.touchline_reconcile_coach_fixture_points(uuid) to service_role;
grant execute on function public.touchline_hire_coach_contract(uuid, text, uuid, text) to service_role;

comment on column public.football_player_fixture_statistics.missing_scoring_facts is 'Provider facts absent for this player settlement; absence is never converted to zero.';
comment on table public.touchline_coach_ranking_snapshots is 'Immutable content-addressed coach_scoring_v2 ranking snapshots with fixture traceability.';

commit;

-- Rollback (documented, not executed): point active contracts back to V1,
-- leave V2 settlements/snapshots preserved for audit, and restore the prior
-- reconciliation function from QA migration 013.
