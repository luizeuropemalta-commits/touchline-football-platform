-- TouchLine Development QA only. Target is asserted in-database.
-- Separates provider-detail coverage from mathematically complete scoring and
-- hardens canonical ranking snapshot publication. Production is out of scope.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

alter table public.football_player_fixture_statistics
  add column if not exists ranking_coverage_status text not null default 'unavailable';

alter table public.football_player_fixture_statistics
  drop constraint if exists football_player_fixture_statistics_ranking_coverage_check,
  add constraint football_player_fixture_statistics_ranking_coverage_check
    check (ranking_coverage_status in ('complete','complete_for_scoring','blocking_partial','unavailable'));

alter table public.football_player_season_statistics
  drop constraint if exists football_player_season_statistics_coverage_status_check,
  add constraint football_player_season_statistics_coverage_status_check
    check (coverage_status in ('complete','complete_for_scoring','partial','unavailable'));

alter table public.touchline_card_ranking_snapshots
  add column if not exists coverage_status text not null default 'complete',
  add column if not exists expected_fixture_ids jsonb not null default '[]'::jsonb,
  add column if not exists total_score_points integer not null default 0;

alter table public.touchline_card_ranking_snapshots
  drop constraint if exists touchline_card_ranking_coverage_status_check,
  add constraint touchline_card_ranking_coverage_status_check
    check (coverage_status in ('complete','complete_for_scoring')),
  drop constraint if exists touchline_card_ranking_expected_fixture_ids_check,
  add constraint touchline_card_ranking_expected_fixture_ids_check
    check (jsonb_typeof(expected_fixture_ids) = 'array');

create or replace function public.publish_touchline_card_ranking_snapshot(
  requested_snapshot_id text,
  requested_league_key text,
  requested_published_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.touchline_card_ranking_snapshots%rowtype;
  calculated_total_score_points integer;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_RANKING_ADMIN_REQUIRED';
  end if;

  select *
    into candidate
    from public.touchline_card_ranking_snapshots
   where snapshot_id = requested_snapshot_id
     and league_key = requested_league_key
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_SNAPSHOT_NOT_FOUND';
  end if;
  if candidate.status <> 'audited' or candidate.source <> 'sportmonks-audited' then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_NOT_AUDITED';
  end if;
  if candidate.scoring_version <> 'player_scoring_v2'
     or candidate.coverage_status not in ('complete','complete_for_scoring')
     or jsonb_typeof(candidate.fixture_ids) <> 'array'
     or jsonb_typeof(candidate.expected_fixture_ids) <> 'array'
     or jsonb_array_length(candidate.fixture_ids) = 0
     or candidate.fixture_ids <> candidate.expected_fixture_ids then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_FIXTURE_COVERAGE_INCOMPLETE';
  end if;
  if jsonb_typeof(candidate.ranking_payload -> 'players') <> 'array' then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_PAYLOAD_INVALID';
  end if;

  begin
    select coalesce(sum((player ->> 'touchlinePoints')::integer), 0)::integer
      into calculated_total_score_points
      from jsonb_array_elements(candidate.ranking_payload -> 'players') as player;
  exception when others then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_POINT_SUM_INVALID';
  end;

  if calculated_total_score_points <> candidate.total_score_points then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_POINT_SUM_MISMATCH';
  end if;
  if candidate.actual_player_count <> candidate.expected_player_count
     or candidate.actual_player_count <> jsonb_array_length(candidate.ranking_payload -> 'players')
     or coalesce(candidate.checksum, '') = ''
     or (candidate.audit_report ->> 'passed')::boolean is not true
     or (candidate.selection_payload ->> 'complete')::boolean is not true
     or candidate.selection_payload ->> 'sourceSnapshotId' <> candidate.snapshot_id
     or jsonb_array_length(candidate.selection_payload -> 'players') <> 11 then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_PUBLICATION_BARRIER_FAILED';
  end if;
  if requested_published_at < candidate.audited_at then
    raise exception using errcode = '22023', message = 'TL_RANKING_PUBLICATION_TIME_INVALID';
  end if;

  update public.touchline_card_ranking_snapshots
     set status = 'published', published_at = requested_published_at
   where snapshot_id = candidate.snapshot_id;

  insert into public.touchline_card_ranking_active_snapshots (
    league_key, snapshot_id, activated_at, updated_at
  ) values (
    requested_league_key, candidate.snapshot_id, requested_published_at, clock_timestamp()
  )
  on conflict (league_key) do update
    set snapshot_id = excluded.snapshot_id,
        activated_at = excluded.activated_at,
        updated_at = excluded.updated_at
  where public.touchline_card_ranking_active_snapshots.snapshot_id is distinct from excluded.snapshot_id;

  return candidate.snapshot_id;
end;
$$;

alter table public.football_player_fixture_statistics enable row level security;
alter table public.football_player_fixture_statistics force row level security;
alter table public.football_player_season_statistics enable row level security;
alter table public.football_player_season_statistics force row level security;
alter table public.touchline_card_ranking_snapshots enable row level security;
alter table public.touchline_card_ranking_snapshots force row level security;
alter table public.touchline_card_ranking_active_snapshots enable row level security;
alter table public.touchline_card_ranking_active_snapshots force row level security;

revoke all privileges on table public.football_player_fixture_statistics from public, anon, authenticated;
revoke all privileges on table public.football_player_season_statistics from public, anon, authenticated;
revoke all privileges on table public.touchline_card_ranking_snapshots from public, anon, authenticated;
revoke all privileges on table public.touchline_card_ranking_active_snapshots from public, anon, authenticated;
revoke all on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz) from public, anon, authenticated;

grant select, insert, update, delete on table public.football_player_fixture_statistics to service_role;
grant select, insert, update, delete on table public.football_player_season_statistics to service_role;
grant select, insert on table public.touchline_card_ranking_snapshots to service_role;
grant select, insert, update on table public.touchline_card_ranking_active_snapshots to service_role;
grant execute on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz) to service_role;

comment on column public.football_player_fixture_statistics.ranking_coverage_status is
  'Ranking eligibility independent from provider detail display. COMPLETE_FOR_SCORING never converts absent facts to zero.';
comment on column public.football_player_season_statistics.coverage_status is
  'Season detail/scoring coverage; COMPLETE_FOR_SCORING preserves unavailable provider details while closing the recorded scoring sum.';
comment on column public.touchline_card_ranking_snapshots.coverage_status is
  'Publication requires COMPLETE or COMPLETE_FOR_SCORING over final persisted V2 settlements.';
comment on column public.touchline_card_ranking_snapshots.expected_fixture_ids is
  'Canonical provider fixture set that must exactly match fixture_ids before publication.';
comment on column public.touchline_card_ranking_snapshots.total_score_points is
  'Audited sum of ranking_payload.players[*].touchlinePoints, checked again by the publication RPC.';

commit;

-- Rollback (documented, not executed): restore the prior function definition
-- and data from QA backup migration 022 after explicit authority. Preserve the
-- added columns for audit unless an approved rollback explicitly removes them.
