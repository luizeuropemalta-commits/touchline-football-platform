-- Emergency rollback for QA migration 037. Never apply to Production.
-- Fails closed if new V2 settlements appeared after the pre-image, because an
-- exact rollback must not erase or silently reinterpret later fixture history.

begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
declare
  v_expected bigint;
  v_actual bigint;
  v_rebuild text;
  v_reconcile text;
begin
  if to_regclass('touchline_qa_backup.coach_scoring_canonical_points_20260829') is null
     or to_regclass('touchline_qa_backup.coach_scoring_canonical_metadata_20260829') is null
     or to_regclass('touchline_qa_backup.coach_scoring_canonical_active_snapshot_20260829') is null then
    raise exception using errcode = 'P0001', message = 'TL_COACH_CANONICAL_ROLLBACK_PREIMAGE_MISSING';
  end if;

  select count(*) into v_expected
  from touchline_qa_backup.coach_scoring_canonical_points_20260829;
  select count(*) into v_actual
  from public.touchline_coach_fixture_points
  where scoring_version = 'coach_scoring_v2';

  if v_expected <> v_actual or exists (
    select 1
    from public.touchline_coach_fixture_points points
    full join touchline_qa_backup.coach_scoring_canonical_points_20260829 backup
      on backup.id = points.id
    where coalesce(points.scoring_version, backup.scoring_version) = 'coach_scoring_v2'
      and (points.id is null or backup.id is null)
  ) then
    raise exception using errcode = 'P0001', message = 'TL_COACH_CANONICAL_ROLLBACK_NEW_HISTORY';
  end if;

  select rebuild_definition, reconcile_definition
    into v_rebuild, v_reconcile
  from touchline_qa_backup.coach_scoring_canonical_metadata_20260829
  where backup_id = 'coach-scoring-canonical-20260829';

  if nullif(trim(v_rebuild), '') is null or nullif(trim(v_reconcile), '') is null then
    raise exception using errcode = 'P0001', message = 'TL_COACH_CANONICAL_ROLLBACK_DEFINITION_MISSING';
  end if;

  execute v_rebuild;
  execute v_reconcile;
end;
$$;

lock table public.touchline_coach_fixture_points in access exclusive mode;
drop trigger if exists touchline_coach_fixture_points_immutable
  on public.touchline_coach_fixture_points;

update public.touchline_coach_fixture_points points
set fixture_context = backup.fixture_context,
    outcome = backup.outcome,
    home_score = backup.home_score,
    away_score = backup.away_score,
    touchline_points = backup.touchline_points,
    settlement_status = backup.settlement_status,
    provider_source_updated_at = backup.provider_source_updated_at,
    settled_at = backup.settled_at,
    updated_at = backup.updated_at
from touchline_qa_backup.coach_scoring_canonical_points_20260829 backup
where points.id = backup.id
  and points.scoring_version = 'coach_scoring_v2';

create trigger touchline_coach_fixture_points_immutable
  before update or delete on public.touchline_coach_fixture_points
  for each row execute function public.touchline_coach_final_points_are_immutable();

delete from public.touchline_coach_ranking_active_snapshots active
where active.league_key = 'touchline-england'
  and not exists (
    select 1
    from touchline_qa_backup.coach_scoring_canonical_active_snapshot_20260829 backup
    where backup.league_key = active.league_key
  );

insert into public.touchline_coach_ranking_active_snapshots (
  league_key, snapshot_id, activated_at, updated_at
)
select league_key, snapshot_id, activated_at, updated_at
from touchline_qa_backup.coach_scoring_canonical_active_snapshot_20260829
on conflict (league_key) do update set
  snapshot_id = excluded.snapshot_id,
  activated_at = excluded.activated_at,
  updated_at = excluded.updated_at;

drop function if exists public.touchline_coach_points_v2(text, text);

commit;
