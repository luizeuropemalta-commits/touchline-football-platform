-- TouchLine Development QA only. Do not add this file to supabase/migrations.
--
-- This is a narrow, reversible backup for the Sportmonks country/nationality
-- repair. It snapshots exactly the canonical Premier League player fields the
-- repair may change; it never rewrites clubs, memberships, publications,
-- inventory, prices, or any Production project.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_country_sync_runs (
  run_id uuid primary key,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  status text not null check (status in ('planned', 'backed_up', 'applied', 'rolling_back', 'rolled_back', 'failed')),
  expected_counts jsonb not null default '{}'::jsonb,
  observed_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  backed_up_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz
);

create table if not exists public.touchline_qa_country_sync_before (
  run_id uuid not null references public.touchline_qa_country_sync_runs(run_id) on delete restrict,
  player_id uuid not null references public.football_players(id) on delete restrict,
  provider_player_id text not null,
  current_club_id uuid,
  nationality text,
  country_id text,
  source_updated_at timestamptz not null,
  primary key (run_id, player_id),
  unique (run_id, provider_player_id)
);

alter table public.touchline_qa_country_sync_runs enable row level security;
alter table public.touchline_qa_country_sync_before enable row level security;
revoke all on public.touchline_qa_country_sync_runs from public, anon, authenticated;
revoke all on public.touchline_qa_country_sync_before from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_qa_country_sync_runs to service_role;
grant select, insert, update, delete on public.touchline_qa_country_sync_before to service_role;

create or replace function public.touchline_capture_qa_country_sync_backup(
  p_project_ref text,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected_project_ref constant text := 'xgxbwqxjssxxuihuwmgy';
  v_expected_players constant integer := 588;
  v_status text;
  v_player_count integer;
  v_duplicate_provider_ids integer;
begin
  if p_project_ref is distinct from v_expected_project_ref then
    raise exception 'TL_QA_COUNTRY_SYNC_PROJECT_REF_MISMATCH';
  end if;
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  select status into v_status
  from public.touchline_qa_country_sync_runs
  where run_id = p_run_id
  for update;

  if v_status is not null and v_status not in ('planned', 'backed_up') then
    raise exception 'TL_QA_COUNTRY_SYNC_BACKUP_STATE_INVALID_%', v_status;
  end if;

  create temporary table tl_qa_country_sync_scope on commit drop as
  select distinct on (p.id)
    p.id as player_id,
    p.provider_player_id,
    p.current_club_id,
    p.nationality,
    p.country_id,
    p.source_updated_at
  from public.football_players p
  join public.football_squad_members m
    on m.player_id = p.id
   and m.provider = 'sportmonks'
   and m.status = 'active'
  join public.football_clubs c
    on c.id = m.club_id
   and c.provider = 'sportmonks'
  where p.provider = 'sportmonks'
    and c.provider_team_id = any (array[
      '3', '6', '8', '9', '11', '13', '14', '15', '18', '19',
      '20', '22', '51', '52', '63', '71', '78', '116', '117', '236'
    ])
  order by p.id, m.source_updated_at desc;

  select count(*) into v_player_count from tl_qa_country_sync_scope;
  select count(*) - count(distinct provider_player_id) into v_duplicate_provider_ids
  from tl_qa_country_sync_scope;
  if v_player_count <> v_expected_players or v_duplicate_provider_ids <> 0 then
    raise exception 'TL_QA_COUNTRY_SYNC_SCOPE_INVALID players=% duplicates=%', v_player_count, v_duplicate_provider_ids;
  end if;

  insert into public.touchline_qa_country_sync_runs (
    run_id, project_ref, status, expected_counts, observed_counts, backed_up_at
  ) values (
    p_run_id,
    p_project_ref,
    'backed_up',
    jsonb_build_object('players', v_expected_players),
    jsonb_build_object('players_backed_up', v_player_count, 'duplicate_provider_ids', v_duplicate_provider_ids),
    clock_timestamp()
  )
  on conflict (run_id) do update
    set status = 'backed_up',
        observed_counts = excluded.observed_counts,
        backed_up_at = coalesce(public.touchline_qa_country_sync_runs.backed_up_at, excluded.backed_up_at);

  insert into public.touchline_qa_country_sync_before (
    run_id, player_id, provider_player_id, current_club_id, nationality, country_id, source_updated_at
  )
  select p_run_id, player_id, provider_player_id, current_club_id, nationality, country_id, source_updated_at
  from tl_qa_country_sync_scope
  on conflict (run_id, player_id) do nothing;

  if (select count(*) from public.touchline_qa_country_sync_before where run_id = p_run_id) <> v_expected_players then
    raise exception 'TL_QA_COUNTRY_SYNC_BACKUP_INCOMPLETE';
  end if;

  return jsonb_build_object('status', 'backed_up', 'run_id', p_run_id, 'players', v_player_count);
end;
$$;

create or replace function public.touchline_mark_qa_country_sync_applied(
  p_project_ref text,
  p_run_id uuid,
  p_observed_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select status into v_status from public.touchline_qa_country_sync_runs where run_id = p_run_id for update;
  if v_status = 'applied' then
    return jsonb_build_object('status', 'already_applied', 'run_id', p_run_id);
  end if;
  if v_status is distinct from 'backed_up' then
    raise exception 'TL_QA_COUNTRY_SYNC_APPLY_STATE_INVALID_%', coalesce(v_status, 'missing');
  end if;
  if (select count(*) from public.touchline_qa_country_sync_before where run_id = p_run_id) <> 588 then
    raise exception 'TL_QA_COUNTRY_SYNC_BACKUP_REQUIRED';
  end if;

  update public.touchline_qa_country_sync_runs
  set status = 'applied', observed_counts = coalesce(p_observed_counts, '{}'::jsonb), applied_at = clock_timestamp()
  where run_id = p_run_id;
  return jsonb_build_object('status', 'applied', 'run_id', p_run_id);
end;
$$;

create or replace function public.touchline_rollback_qa_country_sync(
  p_project_ref text,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_restored integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select status into v_status from public.touchline_qa_country_sync_runs where run_id = p_run_id for update;
  if v_status = 'rolled_back' then
    return jsonb_build_object('status', 'already_rolled_back', 'run_id', p_run_id);
  end if;
  -- A failed update can happen before the run is marked applied. The complete
  -- pre-image is already present at that point, so restoring it is safe and
  -- prevents a partial country update from becoming stranded.
  if v_status not in ('backed_up', 'applied') then
    raise exception 'TL_QA_COUNTRY_SYNC_ROLLBACK_STATE_INVALID_%', coalesce(v_status, 'missing');
  end if;

  update public.touchline_qa_country_sync_runs
  set status = 'rolling_back'
  where run_id = p_run_id;

  update public.football_players current
  set nationality = before.nationality,
      country_id = before.country_id
  from public.touchline_qa_country_sync_before before
  where before.run_id = p_run_id
    and current.id = before.player_id
    and current.provider = 'sportmonks';
  get diagnostics v_restored = row_count;
  if v_restored <> 588 then
    raise exception 'TL_QA_COUNTRY_SYNC_ROLLBACK_INCOMPLETE restored=%', v_restored;
  end if;

  update public.touchline_qa_country_sync_runs
  set status = 'rolled_back', rolled_back_at = clock_timestamp()
  where run_id = p_run_id;
  return jsonb_build_object('status', 'rolled_back', 'run_id', p_run_id, 'players_restored', v_restored);
end;
$$;

revoke all on function public.touchline_capture_qa_country_sync_backup(text, uuid) from public, anon, authenticated;
revoke all on function public.touchline_mark_qa_country_sync_applied(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_country_sync(text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_capture_qa_country_sync_backup(text, uuid) to service_role;
grant execute on function public.touchline_mark_qa_country_sync_applied(text, uuid, jsonb) to service_role;
grant execute on function public.touchline_rollback_qa_country_sync(text, uuid) to service_role;

commit;
