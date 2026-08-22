-- TouchLine Development QA only. Do not add this file to supabase/migrations.
--
-- Provider-backed round normalization for the canonical Sportmonks fixture
-- schedule. This package is additive, browser-inaccessible and reversible at
-- the fixture-link level. Production must never receive this QA package.

begin;
set local lock_timeout = '5s';

create table if not exists public.football_rounds (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_round_id text not null,
  competition_id uuid not null references public.football_competitions(id) on delete restrict,
  season_id uuid not null references public.football_seasons(id) on delete restrict,
  name text,
  source_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_round_id)
);

alter table public.football_fixtures
  add column if not exists round_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'football_fixtures_round_id_fkey'
      and conrelid = 'public.football_fixtures'::regclass
  ) then
    alter table public.football_fixtures
      add constraint football_fixtures_round_id_fkey
      foreign key (round_id) references public.football_rounds(id) on delete restrict;
  end if;
end;
$$;

create index if not exists football_rounds_competition_season_idx
  on public.football_rounds (competition_id, season_id, provider_round_id);
create index if not exists football_fixtures_round_id_idx
  on public.football_fixtures (round_id);

alter table public.football_rounds enable row level security;
alter table public.football_rounds force row level security;
revoke all privileges on table public.football_rounds from public, anon, authenticated;
grant select, insert, update, delete on table public.football_rounds to service_role;

create table if not exists public.touchline_qa_fixture_round_sync_runs (
  run_id uuid primary key,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  status text not null check (status in ('backed_up', 'applied', 'rolling_back', 'rolled_back')),
  fixture_count integer not null default 0 check (fixture_count >= 0),
  observed_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  backed_up_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz
);

create table if not exists public.touchline_qa_fixture_round_links_before (
  run_id uuid not null references public.touchline_qa_fixture_round_sync_runs(run_id) on delete restrict,
  fixture_id uuid not null references public.football_fixtures(id) on delete restrict,
  prior_round_id uuid,
  primary key (run_id, fixture_id)
);

alter table public.touchline_qa_fixture_round_sync_runs enable row level security;
alter table public.touchline_qa_fixture_round_sync_runs force row level security;
alter table public.touchline_qa_fixture_round_links_before enable row level security;
alter table public.touchline_qa_fixture_round_links_before force row level security;
revoke all privileges on table public.touchline_qa_fixture_round_sync_runs from public, anon, authenticated;
revoke all privileges on table public.touchline_qa_fixture_round_links_before from public, anon, authenticated;
grant select, insert, update, delete on table public.touchline_qa_fixture_round_sync_runs to service_role;
grant select, insert, update, delete on table public.touchline_qa_fixture_round_links_before to service_role;

create or replace function public.touchline_capture_qa_fixture_round_backup(
  p_project_ref text,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_fixture_count integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  select status into v_status
  from public.touchline_qa_fixture_round_sync_runs
  where run_id = p_run_id
  for update;

  if v_status = 'backed_up' then
    return jsonb_build_object('status', 'already_backed_up', 'run_id', p_run_id);
  end if;
  if v_status is not null then
    raise exception 'TL_QA_FIXTURE_ROUND_BACKUP_STATE_INVALID_%', v_status;
  end if;

  insert into public.touchline_qa_fixture_round_sync_runs (
    run_id, project_ref, status, backed_up_at
  ) values (
    p_run_id, p_project_ref, 'backed_up', clock_timestamp()
  );

  insert into public.touchline_qa_fixture_round_links_before (run_id, fixture_id, prior_round_id)
  select p_run_id, fixture.id, fixture.round_id
  from public.football_fixtures fixture
  join public.football_competitions competition on competition.id = fixture.competition_id
  where fixture.provider = 'sportmonks'
    and competition.provider = 'sportmonks'
    and competition.provider_competition_id = '8'
  on conflict (run_id, fixture_id) do nothing;

  select count(*) into v_fixture_count
  from public.touchline_qa_fixture_round_links_before
  where run_id = p_run_id;

  if v_fixture_count < 10 then
    raise exception 'TL_QA_FIXTURE_ROUND_BACKUP_INCOMPLETE_%', v_fixture_count;
  end if;

  update public.touchline_qa_fixture_round_sync_runs
  set fixture_count = v_fixture_count,
      observed_counts = jsonb_build_object('fixtures_backed_up', v_fixture_count)
  where run_id = p_run_id;

  return jsonb_build_object('status', 'backed_up', 'run_id', p_run_id, 'fixtures', v_fixture_count);
end;
$$;

create or replace function public.touchline_mark_qa_fixture_round_applied(
  p_project_ref text,
  p_run_id uuid,
  p_observed_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select status into v_status
  from public.touchline_qa_fixture_round_sync_runs
  where run_id = p_run_id
  for update;

  if v_status = 'applied' then
    return jsonb_build_object('status', 'already_applied', 'run_id', p_run_id);
  end if;
  if v_status is distinct from 'backed_up' then
    raise exception 'TL_QA_FIXTURE_ROUND_APPLY_STATE_INVALID_%', coalesce(v_status, 'missing');
  end if;

  update public.touchline_qa_fixture_round_sync_runs
  set status = 'applied',
      observed_counts = coalesce(p_observed_counts, '{}'::jsonb),
      applied_at = clock_timestamp()
  where run_id = p_run_id;

  return jsonb_build_object('status', 'applied', 'run_id', p_run_id);
end;
$$;

create or replace function public.touchline_rollback_qa_fixture_round_sync(
  p_project_ref text,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_restored integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select status into v_status
  from public.touchline_qa_fixture_round_sync_runs
  where run_id = p_run_id
  for update;

  if v_status = 'rolled_back' then
    return jsonb_build_object('status', 'already_rolled_back', 'run_id', p_run_id);
  end if;
  if v_status not in ('backed_up', 'applied') then
    raise exception 'TL_QA_FIXTURE_ROUND_ROLLBACK_STATE_INVALID_%', coalesce(v_status, 'missing');
  end if;

  update public.touchline_qa_fixture_round_sync_runs
  set status = 'rolling_back'
  where run_id = p_run_id;

  update public.football_fixtures fixture
  set round_id = before.prior_round_id,
      updated_at = clock_timestamp()
  from public.touchline_qa_fixture_round_links_before before
  where before.run_id = p_run_id
    and fixture.id = before.fixture_id;
  get diagnostics v_restored = row_count;

  update public.touchline_qa_fixture_round_sync_runs
  set status = 'rolled_back',
      rolled_back_at = clock_timestamp(),
      observed_counts = observed_counts || jsonb_build_object('fixtures_restored', v_restored)
  where run_id = p_run_id;

  return jsonb_build_object('status', 'rolled_back', 'run_id', p_run_id, 'fixtures_restored', v_restored);
end;
$$;

revoke all on function public.touchline_capture_qa_fixture_round_backup(text, uuid) from public, anon, authenticated;
revoke all on function public.touchline_mark_qa_fixture_round_applied(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_fixture_round_sync(text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_capture_qa_fixture_round_backup(text, uuid) to service_role;
grant execute on function public.touchline_mark_qa_fixture_round_applied(text, uuid, jsonb) to service_role;
grant execute on function public.touchline_rollback_qa_fixture_round_sync(text, uuid) to service_role;

commit;
