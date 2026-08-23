-- TouchLine Development QA only. Target is asserted in-database.
-- Forward-hardens the ranking publication barrier after migration 023:
-- PostgreSQL NULL comparisons must fail closed for malformed JSON payloads.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

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
     or jsonb_typeof(candidate.fixture_ids) is distinct from 'array'
     or jsonb_typeof(candidate.expected_fixture_ids) is distinct from 'array'
     or jsonb_array_length(candidate.fixture_ids) = 0
     or candidate.fixture_ids is distinct from candidate.expected_fixture_ids then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_FIXTURE_COVERAGE_INCOMPLETE';
  end if;
  if jsonb_typeof(candidate.ranking_payload -> 'players') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_PAYLOAD_INVALID';
  end if;
  if jsonb_typeof(candidate.selection_payload -> 'players') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_SELECTION_INVALID';
  end if;

  begin
    select coalesce(sum((player ->> 'touchlinePoints')::integer), 0)::integer
      into calculated_total_score_points
      from jsonb_array_elements(candidate.ranking_payload -> 'players') as player;
  exception when others then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_POINT_SUM_INVALID';
  end;

  if calculated_total_score_points is distinct from candidate.total_score_points then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_POINT_SUM_MISMATCH';
  end if;
  if candidate.actual_player_count is distinct from candidate.expected_player_count
     or candidate.actual_player_count is distinct from jsonb_array_length(candidate.ranking_payload -> 'players')
     or coalesce(candidate.checksum, '') = ''
     or (candidate.audit_report ->> 'passed')::boolean is not true
     or (candidate.selection_payload ->> 'complete')::boolean is not true
     or candidate.selection_payload ->> 'sourceSnapshotId' is distinct from candidate.snapshot_id
     or jsonb_array_length(candidate.selection_payload -> 'players') is distinct from 11 then
    raise exception using errcode = 'P0001', message = 'TL_RANKING_PUBLICATION_BARRIER_FAILED';
  end if;
  if requested_published_at is null
     or candidate.audited_at is null
     or requested_published_at < candidate.audited_at then
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

revoke all on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz)
  to service_role;

comment on function public.publish_touchline_card_ranking_snapshot(text, text, timestamptz) is
  'Service-role-only QA ranking publication barrier. Missing or malformed audit, coverage, selection, point-sum and timestamp evidence fails closed.';

commit;

-- Rollback (documented, not executed): restore the migration 023 function
-- definition only after explicit authority. Never apply to Production.
