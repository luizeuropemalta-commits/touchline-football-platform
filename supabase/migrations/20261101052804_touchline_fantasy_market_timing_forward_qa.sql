-- QA-only forward proposal, artifact only. Original historical file is NOT replayed.
-- Target project_id: xgxbwqxjssxxuihuwmgy. No sync_gameweeks invocation or replacement.
-- Preserves OID, owner, ACL, stability, security mode and all routine metadata.
DO $tl_market_timing_forward$
DECLARE
  v_target constant text := $tl_exact_projection_target$CREATE OR REPLACE FUNCTION public.touchline_fantasy_market_window_projection(p_as_of timestamp with time zone)
 RETURNS TABLE(competition_id uuid, season_id uuid, round_id uuid, gameweek_number integer, state text, market_opens_at timestamp with time zone, locks_at timestamp with time zone, first_fixture_at timestamp with time zone, last_fixture_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with round_facts as (
    select round.id as round_id, round.competition_id, round.season_id,
      round.name as round_name,
      case when round.name ~ '[0-9]+' then substring(round.name from '([0-9]+)\D*$')::integer end as round_sort_number,
      min(fixture.starts_at) as first_fixture_at, max(fixture.starts_at) as last_fixture_at,
      bool_or(public.touchline_fantasy_fixture_is_live(fixture.status)) as any_live,
      bool_or(public.touchline_fantasy_fixture_is_final(fixture.status)) as any_final,
      count(fixture.id)>0 and bool_and(public.touchline_fantasy_fixture_is_final(fixture.status)
        and fixture.finalized_at is not null) as all_final,
      max(fixture.finalized_at) filter (where public.touchline_fantasy_fixture_is_final(fixture.status)) as round_completed_at
    from public.football_rounds round
    left join public.football_fixtures fixture on fixture.round_id=round.id
    join public.touchline_fantasy_configs config on config.competition_id=round.competition_id
      and config.season_id=round.season_id and config.status='active'
    group by round.id,round.competition_id,round.season_id,round.name
  ), ordered_rounds as (
    select round_facts.*,
      bool_or(round_sort_number is null and first_fixture_at is null) over (partition by season_id) as has_ambiguous_unscheduled_round,
      row_number() over (partition by season_id order by round_sort_number nulls last,first_fixture_at nulls last,round_id)::integer as round_sequence,
      lag(all_final) over (partition by season_id order by round_sort_number nulls last,first_fixture_at nulls last,round_id) as previous_round_all_final,
      lag(round_completed_at) over (partition by season_id order by round_sort_number nulls last,first_fixture_at nulls last,round_id) as previous_round_completed_at
    from round_facts
  ), timing as (
    select ordered_rounds.*,first_fixture_at as locks_at from ordered_rounds
  ), prepared as (
    select timing.*,
      case when has_ambiguous_unscheduled_round then false
        when round_sequence=1 and (round_sort_number is null or round_sort_number=1) then true
        when previous_round_all_final and previous_round_completed_at is not null and previous_round_completed_at<locks_at then true
        else false end as market_window_available,
      case when has_ambiguous_unscheduled_round then locks_at-interval '1 microsecond'
        when round_sequence=1 and (round_sort_number is null or round_sort_number=1) then first_fixture_at-interval '7 days'
        when previous_round_all_final and previous_round_completed_at is not null and previous_round_completed_at<locks_at then previous_round_completed_at
        else locks_at-interval '1 microsecond' end as market_opens_at
    from timing
  )
  select competition_id,season_id,round_id,coalesce(round_sort_number,round_sequence),
    case when any_live then 'LIVE' when all_final then 'FINAL' when any_final then 'LOCKED'
      when round_sequence=1 and not market_window_available and p_as_of<locks_at then 'UPCOMING'
      when round_sequence>1 and not market_window_available and p_as_of<locks_at then 'UPCOMING'
      when p_as_of<market_opens_at then 'UPCOMING'
      when market_window_available and p_as_of<locks_at then 'MARKET_OPEN'
      else 'LOCKED' end,
    market_opens_at,locks_at,first_fixture_at,last_fixture_at
  from prepared
$function$
;
$tl_exact_projection_target$;
  v_before jsonb; v_sync_before jsonb; v_after jsonb; v_oid oid;
BEGIN
  PERFORM public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
  IF NOT pg_try_advisory_xact_lock(hashtextextended('touchline.qa.market_timing_forward.20261101',0)) THEN
    RAISE EXCEPTION 'TL_MARKET_TIMING_FORWARD_BUSY';
  END IF;
  PERFORM set_config('lock_timeout','5s',true);
  v_oid:=to_regprocedure('public.touchline_fantasy_market_window_projection(timestamptz)');
  IF v_oid IS NULL OR to_regprocedure('public.touchline_fantasy_sync_gameweeks()') IS NULL THEN
    RAISE EXCEPTION 'TL_MARKET_TIMING_FORWARD_FUNCTION_MISSING';
  END IF;
  SELECT to_jsonb(p) INTO v_before FROM pg_proc p WHERE p.oid=v_oid;
  SELECT to_jsonb(p) INTO v_sync_before FROM pg_proc p WHERE p.oid='public.touchline_fantasy_sync_gameweeks()'::regprocedure;
  IF md5(pg_get_functiondef(v_oid))<>'e40b5f762d9b065331e3b26a24a3dff6'
    OR md5(pg_get_functiondef('public.touchline_fantasy_sync_gameweeks()'::regprocedure))<>'a54aed23cad04215235eeef009a7072d'
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_oid AND NOT prosecdef AND provolatile='s'
      AND proconfig=ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'TL_MARKET_TIMING_FORWARD_PREIMAGE_DRIFT';
  END IF;
  IF has_function_privilege('anon',v_oid,'EXECUTE') OR has_function_privilege('authenticated',v_oid,'EXECUTE')
    OR has_function_privilege('service_role',v_oid,'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=v_oid AND a.grantee<>p.proowner) THEN
    RAISE EXCEPTION 'TL_MARKET_TIMING_FORWARD_PRIVILEGE_DRIFT';
  END IF;
  EXECUTE v_target;
  -- LOCAL_PROJECTION_ROLLBACK_INSERT_HERE
  SELECT to_jsonb(p) INTO v_after FROM pg_proc p WHERE p.oid=to_regprocedure('public.touchline_fantasy_market_window_projection(timestamptz)');
  IF (v_after-'prosrc') IS DISTINCT FROM (v_before-'prosrc')
    OR md5(pg_get_functiondef(v_oid))<>'e9776c6f9df37360660a3e56e4a827d8'
    OR (SELECT to_jsonb(p) FROM pg_proc p WHERE p.oid='public.touchline_fantasy_sync_gameweeks()'::regprocedure) IS DISTINCT FROM v_sync_before THEN
    RAISE EXCEPTION 'TL_MARKET_TIMING_FORWARD_PRESERVATION_FAILED';
  END IF;
END
$tl_market_timing_forward$;
