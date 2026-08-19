-- TouchLine Development QA only. Do not add this file to supabase/migrations.
--
-- Full reversible pre-image for the twenty-club Sportmonks roster reconcile.
-- It preserves cards, publications, inventory, prices and history: a rollback
-- restores the provider-backed roster fields and marks only newly-created
-- memberships inactive. Production is structurally excluded by the project
-- reference guard.

begin;
set local lock_timeout = '5s';

create table if not exists public.touchline_qa_twenty_club_roster_runs (
  run_id uuid primary key,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  status text not null check (status in ('backed_up', 'applied', 'rolling_back', 'rolled_back', 'failed')),
  expected_counts jsonb not null default '{}'::jsonb,
  observed_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  backed_up_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz
);

create table if not exists public.touchline_qa_twenty_club_roster_players_before (
  run_id uuid not null references public.touchline_qa_twenty_club_roster_runs(run_id) on delete restrict,
  player_id uuid not null references public.football_players(id) on delete restrict,
  payload jsonb not null,
  primary key (run_id, player_id)
);

create table if not exists public.touchline_qa_twenty_club_roster_members_before (
  run_id uuid not null references public.touchline_qa_twenty_club_roster_runs(run_id) on delete restrict,
  membership_id uuid not null references public.football_squad_members(id) on delete restrict,
  payload jsonb not null,
  primary key (run_id, membership_id)
);

alter table public.touchline_qa_twenty_club_roster_runs enable row level security;
alter table public.touchline_qa_twenty_club_roster_players_before enable row level security;
alter table public.touchline_qa_twenty_club_roster_members_before enable row level security;
revoke all on public.touchline_qa_twenty_club_roster_runs from public, anon, authenticated;
revoke all on public.touchline_qa_twenty_club_roster_players_before from public, anon, authenticated;
revoke all on public.touchline_qa_twenty_club_roster_members_before from public, anon, authenticated;
grant select, insert, update, delete on public.touchline_qa_twenty_club_roster_runs to service_role;
grant select, insert, update, delete on public.touchline_qa_twenty_club_roster_players_before to service_role;
grant select, insert, update, delete on public.touchline_qa_twenty_club_roster_members_before to service_role;

create or replace function public.touchline_capture_qa_twenty_club_roster_backup(
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
  v_status text;
  v_players integer;
  v_memberships integer;
begin
  if p_project_ref is distinct from v_expected_project_ref then
    raise exception 'TL_QA_TWENTY_CLUB_ROSTER_PROJECT_REF_MISMATCH';
  end if;
  perform public.touchline_assert_qa_fixture_target(p_project_ref);

  select status into v_status
  from public.touchline_qa_twenty_club_roster_runs
  where run_id = p_run_id
  for update;
  if v_status is not null and v_status <> 'backed_up' then
    raise exception 'TL_QA_TWENTY_CLUB_ROSTER_BACKUP_STATE_INVALID_%', v_status;
  end if;

  insert into public.touchline_qa_twenty_club_roster_runs (
    run_id, project_ref, status, expected_counts, observed_counts, backed_up_at
  ) values (
    p_run_id, p_project_ref, 'backed_up', '{}'::jsonb, '{}'::jsonb, clock_timestamp()
  )
  on conflict (run_id) do update
    set status = 'backed_up',
        backed_up_at = coalesce(public.touchline_qa_twenty_club_roster_runs.backed_up_at, excluded.backed_up_at);

  -- The QA project currently contains the twenty-club canonical Sportmonks
  -- boundary. Capturing all provider rows also protects a transfer whose old
  -- membership is outside the new provider club before it is deactivated.
  insert into public.touchline_qa_twenty_club_roster_players_before (run_id, player_id, payload)
  select p_run_id, p.id, to_jsonb(p)
  from public.football_players p
  where p.provider = 'sportmonks'
  on conflict (run_id, player_id) do nothing;

  insert into public.touchline_qa_twenty_club_roster_members_before (run_id, membership_id, payload)
  select p_run_id, m.id, to_jsonb(m)
  from public.football_squad_members m
  where m.provider = 'sportmonks'
  on conflict (run_id, membership_id) do nothing;

  select count(*) into v_players
  from public.touchline_qa_twenty_club_roster_players_before
  where run_id = p_run_id;
  select count(*) into v_memberships
  from public.touchline_qa_twenty_club_roster_members_before
  where run_id = p_run_id;
  if v_players < 220 or v_memberships < 220 then
    raise exception 'TL_QA_TWENTY_CLUB_ROSTER_BACKUP_INCOMPLETE players=% memberships=%', v_players, v_memberships;
  end if;

  update public.touchline_qa_twenty_club_roster_runs
  set expected_counts = jsonb_build_object('players', v_players, 'memberships', v_memberships),
      observed_counts = jsonb_build_object('players_backed_up', v_players, 'memberships_backed_up', v_memberships)
  where run_id = p_run_id;

  return jsonb_build_object('status', 'backed_up', 'run_id', p_run_id, 'players', v_players, 'memberships', v_memberships);
end;
$$;

create or replace function public.touchline_mark_qa_twenty_club_roster_applied(
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
  select status into v_status from public.touchline_qa_twenty_club_roster_runs where run_id = p_run_id for update;
  if v_status = 'applied' then
    return jsonb_build_object('status', 'already_applied', 'run_id', p_run_id);
  end if;
  if v_status is distinct from 'backed_up' then
    raise exception 'TL_QA_TWENTY_CLUB_ROSTER_APPLY_STATE_INVALID_%', coalesce(v_status, 'missing');
  end if;
  update public.touchline_qa_twenty_club_roster_runs
  set status = 'applied', observed_counts = coalesce(p_observed_counts, '{}'::jsonb), applied_at = clock_timestamp()
  where run_id = p_run_id;
  return jsonb_build_object('status', 'applied', 'run_id', p_run_id);
end;
$$;

create or replace function public.touchline_rollback_qa_twenty_club_roster(
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
  v_players integer;
  v_memberships integer;
begin
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select status into v_status from public.touchline_qa_twenty_club_roster_runs where run_id = p_run_id for update;
  if v_status = 'rolled_back' then
    return jsonb_build_object('status', 'already_rolled_back', 'run_id', p_run_id);
  end if;
  if v_status not in ('backed_up', 'applied') then
    raise exception 'TL_QA_TWENTY_CLUB_ROSTER_ROLLBACK_STATE_INVALID_%', coalesce(v_status, 'missing');
  end if;

  update public.touchline_qa_twenty_club_roster_runs set status = 'rolling_back' where run_id = p_run_id;

  update public.football_players current
  set current_club_id = nullif(before.payload->>'current_club_id', '')::uuid,
      name = before.payload->>'name',
      display_name = before.payload->>'display_name',
      nationality = nullif(before.payload->>'nationality', ''),
      country_id = nullif(before.payload->>'country_id', ''),
      position = nullif(before.payload->>'position', ''),
      market_value = nullif(before.payload->>'market_value', '')::numeric,
      market_value_currency = nullif(before.payload->>'market_value_currency', ''),
      source_updated_at = (before.payload->>'source_updated_at')::timestamptz
  from public.touchline_qa_twenty_club_roster_players_before before
  where before.run_id = p_run_id and current.id = before.player_id and current.provider = 'sportmonks';
  get diagnostics v_players = row_count;

  update public.football_squad_members current
  set competition_id = nullif(before.payload->>'competition_id', '')::uuid,
      jersey_number = nullif(before.payload->>'jersey_number', '')::integer,
      position = nullif(before.payload->>'position', ''),
      status = before.payload->>'status',
      source_updated_at = (before.payload->>'source_updated_at')::timestamptz
  from public.touchline_qa_twenty_club_roster_members_before before
  where before.run_id = p_run_id and current.id = before.membership_id and current.provider = 'sportmonks';
  get diagnostics v_memberships = row_count;

  -- Never delete records created by the attempted import: keep an auditable
  -- inactive history so a bad provider revision cannot destroy evidence.
  update public.football_squad_members m
  set status = 'inactive', source_updated_at = clock_timestamp()
  where m.provider = 'sportmonks'
    and not exists (
      select 1 from public.touchline_qa_twenty_club_roster_members_before before
      where before.run_id = p_run_id and before.membership_id = m.id
    );
  update public.football_players p
  set current_club_id = null, source_updated_at = clock_timestamp()
  where p.provider = 'sportmonks'
    and not exists (
      select 1 from public.touchline_qa_twenty_club_roster_players_before before
      where before.run_id = p_run_id and before.player_id = p.id
    );

  update public.touchline_qa_twenty_club_roster_runs
  set status = 'rolled_back', rolled_back_at = clock_timestamp(),
      observed_counts = observed_counts || jsonb_build_object('players_restored', v_players, 'memberships_restored', v_memberships)
  where run_id = p_run_id;
  return jsonb_build_object('status', 'rolled_back', 'run_id', p_run_id, 'players_restored', v_players, 'memberships_restored', v_memberships);
end;
$$;

revoke all on function public.touchline_capture_qa_twenty_club_roster_backup(text, uuid) from public, anon, authenticated;
revoke all on function public.touchline_mark_qa_twenty_club_roster_applied(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.touchline_rollback_qa_twenty_club_roster(text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_capture_qa_twenty_club_roster_backup(text, uuid) to service_role;
grant execute on function public.touchline_mark_qa_twenty_club_roster_applied(text, uuid, jsonb) to service_role;
grant execute on function public.touchline_rollback_qa_twenty_club_roster(text, uuid) to service_role;

commit;
