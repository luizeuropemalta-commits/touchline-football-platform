-- QA-only postflight receipt for 20260919151427. Run immediately after the
-- forward migration. It creates no game data and makes recovery fail closed
-- if the approved post-migration functions or interval constraint drift.

begin;
set local lock_timeout = '5s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $postflight$
declare
  v_key constant text := '20260919151427_touchline_fantasy_kickoff_final_whistle_market_window';
  v_function_md5 jsonb;
  v_acl jsonb;
  v_constraint jsonb;
  v_receipt public.touchline_qa_fantasy_market_window_20260919_recovery_receipts%rowtype;
begin
  lock table public.touchline_fantasy_gameweeks in share row exclusive mode;

  select * into v_receipt
  from public.touchline_qa_fantasy_market_window_20260919_recovery_receipts
  where migration_key = v_key
    and project_ref = 'xgxbwqxjssxxuihuwmgy'
  for update;
  if v_receipt.migration_key is null or v_receipt.state <> 'PREIMAGE_CAPTURED' then
    raise exception 'TL_FANTASY_RECOVERY_POSTFLIGHT_PREIMAGE_REQUIRED';
  end if;

  with target_functions(signature) as (
    values
      ('public.touchline_fantasy_sync_gameweeks()'::regprocedure),
      ('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure),
      ('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)
  )
  select
    jsonb_object_agg(signature::text, md5(pg_get_functiondef(signature))),
    jsonb_object_agg(signature::text, jsonb_build_object(
      'security_definer', procedure.prosecdef,
      'search_path_empty', coalesce(procedure.proconfig, array[]::text[]) @> array['search_path=""'],
      'public_execute', has_function_privilege('public', signature, 'execute'),
      'anon_execute', has_function_privilege('anon', signature, 'execute'),
      'authenticated_execute', has_function_privilege('authenticated', signature, 'execute'),
      'service_role_execute', has_function_privilege('service_role', signature, 'execute')
    ))
  into v_function_md5, v_acl
  from target_functions
  join pg_proc procedure on procedure.oid = signature::oid;

  select jsonb_build_object(
    'name', constraint_row.conname,
    'definition', pg_get_constraintdef(constraint_row.oid),
    'definition_md5', md5(pg_get_constraintdef(constraint_row.oid))
  ) into v_constraint
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.touchline_fantasy_gameweeks'::regclass
    and constraint_row.contype = 'c'
    and constraint_row.conname = 'touchline_fantasy_gameweeks_market_interval_check';

  if v_constraint is null
    or pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.touchline_fantasy_gameweeks'::regclass and conname = 'touchline_fantasy_gameweeks_market_interval_check')) not like '%locks_at <= first_fixture_at%' then
    raise exception 'TL_FANTASY_RECOVERY_POSTFLIGHT_CONSTRAINT_MISMATCH';
  end if;
  if (select pg_get_functiondef('public.touchline_fantasy_sync_gameweeks()'::regprocedure)) not like '%closed_unscheduled_gameweeks%'
    or (select pg_get_functiondef('public.touchline_fantasy_sync_gameweeks()'::regprocedure)) not like '%left join public.football_fixtures fixture on fixture.round_id = round.id%'
    or (select pg_get_functiondef('public.touchline_fantasy_sync_gameweeks()'::regprocedure)) not like '%count(fixture.id) > 0 and bool_and(%'
    or (select pg_get_functiondef('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure)) not like '%perform public.touchline_fantasy_sync_gameweeks();%'
    or (select pg_get_functiondef('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)) not like '%TL_FANTASY_GAMEWEEK_LOCKED%' then
    raise exception 'TL_FANTASY_RECOVERY_POSTFLIGHT_FUNCTION_MISMATCH';
  end if;
  if v_acl is distinct from v_receipt.preimage_acl then
    raise exception 'TL_FANTASY_RECOVERY_POSTFLIGHT_ACL_MISMATCH';
  end if;

  update public.touchline_qa_fantasy_market_window_20260919_recovery_receipts
  set state = 'POSTFLIGHT_CAPTURED',
      postflight_function_md5 = v_function_md5,
      postflight_acl = v_acl,
      postflight_interval_constraint = v_constraint,
      postflight_captured_at = clock_timestamp()
  where migration_key = v_key;
end
$postflight$;

commit;
