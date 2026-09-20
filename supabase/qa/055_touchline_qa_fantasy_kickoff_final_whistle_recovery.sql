-- QA-only, forward recovery for 20260919151427.
-- Requires the paired preimage and postflight receipts. It restores exactly
-- the captured QA definitions and the legacy strict interval check. It never
-- rewrites fixtures, user XIs, selections, locked selections or snapshots.
-- The restored synchronizer must recalculate derived Gameweek timing BEFORE
-- validating the old strict interval: the forward rule materializes equality.
-- If current provider/config data cannot reconcile every row, abort atomically
-- rather than inventing timing for an unscheduled or inactive Gameweek.

begin;
set local lock_timeout = '5s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $recovery$
declare
  v_key constant text := '20260919151427_touchline_fantasy_kickoff_final_whistle_market_window';
  v_receipt public.touchline_qa_fantasy_market_window_20260919_recovery_receipts%rowtype;
  v_current_function_md5 jsonb;
  v_current_acl jsonb;
  v_current_constraint jsonb;
  v_before_user_gameweeks_md5 text;
  v_before_selections_md5 text;
  v_before_locked_md5 text;
  v_after_user_gameweeks_md5 text;
  v_after_selections_md5 text;
  v_after_locked_md5 text;
  v_constraint_name text;
  v_constraint_definition text;
begin
  lock table
    public.touchline_fantasy_gameweeks,
    public.touchline_fantasy_user_gameweeks,
    public.touchline_fantasy_user_gameweek_selections,
    public.touchline_fantasy_locked_selections
  in share row exclusive mode;

  select * into v_receipt
  from public.touchline_qa_fantasy_market_window_20260919_recovery_receipts
  where migration_key = v_key
    and project_ref = 'xgxbwqxjssxxuihuwmgy'
  for update;
  if v_receipt.migration_key is null or v_receipt.state <> 'POSTFLIGHT_CAPTURED' then
    raise exception 'TL_FANTASY_RECOVERY_POSTFLIGHT_RECEIPT_REQUIRED';
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
  into v_current_function_md5, v_current_acl
  from target_functions
  join pg_proc procedure on procedure.oid = signature::oid;

  select jsonb_build_object(
    'name', constraint_row.conname,
    'definition', pg_get_constraintdef(constraint_row.oid),
    'definition_md5', md5(pg_get_constraintdef(constraint_row.oid))
  ) into v_current_constraint
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.touchline_fantasy_gameweeks'::regclass
    and constraint_row.contype = 'c'
    and constraint_row.conname = 'touchline_fantasy_gameweeks_market_interval_check';

  if v_current_function_md5 is distinct from v_receipt.postflight_function_md5
    or v_current_acl is distinct from v_receipt.postflight_acl
    or v_current_constraint is distinct from v_receipt.postflight_interval_constraint then
    raise exception 'TL_FANTASY_RECOVERY_POSTFLIGHT_FINGERPRINT_MISMATCH';
  end if;

  select md5(coalesce(string_agg(md5(row_to_json(user_gameweek)::text), '' order by user_gameweek.id), ''))
    into v_before_user_gameweeks_md5
  from public.touchline_fantasy_user_gameweeks user_gameweek;
  select md5(coalesce(string_agg(md5(row_to_json(selection)::text), '' order by selection.user_gameweek_id, selection.slot_id), ''))
    into v_before_selections_md5
  from public.touchline_fantasy_user_gameweek_selections selection;
  select md5(coalesce(string_agg(md5(row_to_json(locked)::text), '' order by locked.user_gameweek_id, locked.slot_id), ''))
    into v_before_locked_md5
  from public.touchline_fantasy_locked_selections locked;

  execute v_receipt.preimage_function_definitions ->> 'touchline_fantasy_sync_gameweeks()';
  execute v_receipt.preimage_function_definitions ->> 'touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)';
  execute v_receipt.preimage_function_definitions ->> 'touchline_fantasy_prepare_user_gameweek(uuid,uuid)';

  if (select jsonb_object_agg(signature::text, md5(pg_get_functiondef(signature)))
      from (values
        ('public.touchline_fantasy_sync_gameweeks()'::regprocedure),
        ('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure),
        ('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)
      ) as target_functions(signature)) is distinct from v_receipt.preimage_function_md5 then
    raise exception 'TL_FANTASY_RECOVERY_PREIMAGE_FUNCTION_RESTORE_MISMATCH';
  end if;

  -- Keep the permissive forward constraint in force while restoring the
  -- original derived windows. It accepts both the old offset and equality.
  -- User Gameweeks and their selections are deliberately not recalculated.
  perform public.touchline_fantasy_sync_gameweeks();
  if exists (
    select 1 from public.touchline_fantasy_gameweeks
    where not (
      market_opens_at < locks_at
      and locks_at < first_fixture_at
      and first_fixture_at <= last_fixture_at
    )
  ) then
    raise exception 'TL_FANTASY_RECOVERY_UNRECONCILED_GAMEWEEK_TIMING';
  end if;

  alter table public.touchline_fantasy_gameweeks
    drop constraint touchline_fantasy_gameweeks_market_interval_check;
  v_constraint_name := v_receipt.preimage_interval_constraint ->> 'name';
  v_constraint_definition := v_receipt.preimage_interval_constraint ->> 'definition';
  execute format(
    'alter table public.touchline_fantasy_gameweeks add constraint %I %s',
    v_constraint_name,
    v_constraint_definition
  );
  if (select md5(pg_get_constraintdef(oid)) from pg_constraint
      where conrelid = 'public.touchline_fantasy_gameweeks'::regclass
        and conname = v_constraint_name) is distinct from v_receipt.preimage_interval_constraint ->> 'definition_md5' then
    raise exception 'TL_FANTASY_RECOVERY_PREIMAGE_CONSTRAINT_RESTORE_MISMATCH';
  end if;

  select md5(coalesce(string_agg(md5(row_to_json(user_gameweek)::text), '' order by user_gameweek.id), ''))
    into v_after_user_gameweeks_md5
  from public.touchline_fantasy_user_gameweeks user_gameweek;
  select md5(coalesce(string_agg(md5(row_to_json(selection)::text), '' order by selection.user_gameweek_id, selection.slot_id), ''))
    into v_after_selections_md5
  from public.touchline_fantasy_user_gameweek_selections selection;
  select md5(coalesce(string_agg(md5(row_to_json(locked)::text), '' order by locked.user_gameweek_id, locked.slot_id), ''))
    into v_after_locked_md5
  from public.touchline_fantasy_locked_selections locked;
  if v_after_user_gameweeks_md5 is distinct from v_before_user_gameweeks_md5
    or v_after_selections_md5 is distinct from v_before_selections_md5
    or v_after_locked_md5 is distinct from v_before_locked_md5 then
    raise exception 'TL_FANTASY_RECOVERY_SNAPSHOT_MUTATION';
  end if;

  update public.touchline_qa_fantasy_market_window_20260919_recovery_receipts
  set state = 'RECOVERED', recovered_at = clock_timestamp()
  where migration_key = v_key;
end
$recovery$;

commit;
