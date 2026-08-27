begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Deployment compatibility: an already-running QA function may complete one
-- final ingestion call before the new application bundle starts supplying the
-- canonical 20-club map. Preserve contract reconciliation and the last active
-- full ranking snapshot instead of failing that provider ingestion boundary.
create or replace function public.touchline_reconcile_coach_fixture_points(
  p_fixture_id uuid default null,
  p_competition_coaches jsonb default '[]'::jsonb
)
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
  v_ranking jsonb;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;

  for v_record in
    select contract.id contract_id, contract.club_id, fixture.id fixture_id,
      fixture.home_club_id, fixture.away_club_id, fixture.starts_at, fixture.status,
      fixture.home_score, fixture.away_score, fixture.source_updated_at
    from public.touchline_coach_contracts contract
    join public.football_fixtures fixture
      on contract.club_id in (fixture.home_club_id, fixture.away_club_id)
    where contract.scoring_version = 'coach_scoring_v2'
      and (p_fixture_id is null or fixture.id = p_fixture_id)
      and fixture.starts_at >= contract.started_at
      and (contract.ended_at is null or fixture.starts_at < contract.ended_at)
      and public.touchline_is_scoreable_fixture_status(fixture.status)
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
      when v_context = 'home' then 0
      when v_outcome = 'win' then 4
      when v_outcome = 'draw' then 2
      else 0
    end;
    v_settlement := case when public.touchline_is_final_fixture_status(v_record.status) then 'final' else 'provisional' end;

    insert into public.touchline_coach_fixture_points (
      contract_id, fixture_id, fixture_context, outcome, home_score, away_score,
      touchline_points, settlement_status, scoring_version,
      provider_source_updated_at, settled_at, updated_at
    ) values (
      v_record.contract_id, v_record.fixture_id, v_context, v_outcome,
      v_record.home_score, v_record.away_score, v_points, v_settlement,
      'coach_scoring_v2', v_record.source_updated_at,
      case when v_settlement = 'final' then clock_timestamp() end, clock_timestamp()
    )
    on conflict (contract_id, fixture_id, scoring_version) do update set
      fixture_context = excluded.fixture_context,
      outcome = excluded.outcome,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      touchline_points = excluded.touchline_points,
      settlement_status = excluded.settlement_status,
      provider_source_updated_at = excluded.provider_source_updated_at,
      settled_at = case when excluded.settlement_status = 'final' then excluded.settled_at end,
      updated_at = excluded.updated_at
    where public.touchline_coach_fixture_points.settlement_status <> 'final'
      and row(
        public.touchline_coach_fixture_points.fixture_context,
        public.touchline_coach_fixture_points.outcome,
        public.touchline_coach_fixture_points.home_score,
        public.touchline_coach_fixture_points.away_score,
        public.touchline_coach_fixture_points.touchline_points,
        public.touchline_coach_fixture_points.settlement_status,
        public.touchline_coach_fixture_points.provider_source_updated_at
      ) is distinct from row(
        excluded.fixture_context, excluded.outcome, excluded.home_score, excluded.away_score,
        excluded.touchline_points, excluded.settlement_status, excluded.provider_source_updated_at
      );
    if found then v_count := v_count + 1; end if;
  end loop;

  if jsonb_typeof(coalesce(p_competition_coaches, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_competition_coaches, '[]'::jsonb)) = 0 then
    return jsonb_build_object(
      'ok', true,
      'reconciled', v_count,
      'scoringVersion', 'coach_scoring_v2',
      'ranking', jsonb_build_object(
        'ok', false,
        'reason', 'competition-coaches-unavailable',
        'preservedActiveSnapshot', true
      )
    );
  end if;

  v_ranking := public.touchline_rebuild_coach_ranking_v2(p_competition_coaches);
  return jsonb_build_object(
    'ok', true,
    'reconciled', v_count,
    'scoringVersion', 'coach_scoring_v2',
    'ranking', v_ranking
  );
end;
$$;

revoke execute on function public.touchline_reconcile_coach_fixture_points(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.touchline_reconcile_coach_fixture_points(uuid, jsonb)
  to service_role;

comment on function public.touchline_reconcile_coach_fixture_points(uuid, jsonb) is
  'QA-only contract reconciliation plus full competition ranking refresh; an empty deploy-transition map preserves the last active snapshot.';

commit;
