-- PENDING EXECUTION: real PostgreSQL integration, NOT a source-test PASS.
-- Run only in a disposable local database named touchline_avatar_qa_test_<id>.
-- The root-owned runner must provision real migrations + QA001/003/057 and the
-- representative dataset first. Do not stub checkout/release or football tables.
-- Required session settings (synthetic UUIDs only):
-- touchline.avatar_qa_test_mode = isolated
-- touchline.qa_test_run_id = applied representative fixture run
-- touchline.qa_test_user_with_avatar / touchline.qa_test_user_empty_avatar
-- Both users: confirmed synthetic @example.invalid email, empty active roster,
-- no existing scenario for this run. One has a photo, the other NULL/empty.
-- This checks real SQL behavior and grants, not concurrent upload publication or
-- hosted Storage. Execute the separate CAS/concurrency gate before activation.
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if current_setting('touchline.avatar_qa_test_mode', true) is distinct from 'isolated'
    or current_database() !~ '^touchline_avatar_qa_test_[a-z0-9_]+$'
  then raise exception 'ISOLATED_DATASET_REQUIRED'; end if;
  if to_regprocedure('public.touchline_apply_qa_owner_scenario(text,uuid,uuid,text)') is null
    or to_regprocedure('public.touchline_rollback_qa_owner_scenario(text,uuid,uuid)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='touchline_qa_owner_scenarios' and column_name='avatar_apply_outcome')
  then raise exception 'QA_FORWARD_PREREQUISITES_REQUIRED'; end if;
end $$;

-- Tripwire exercises both actual functions: even SET avatar_url = avatar_url
-- is forbidden. All objects and scenario changes are rolled back at the end.
create function public.touchline_test_reject_qa_avatar_update()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'AVATAR_WRITE_ATTEMPT'; end $$;
create trigger touchline_test_reject_qa_avatar_update
before update of avatar_url on public.users
for each row execute function public.touchline_test_reject_qa_avatar_update();

do $$
declare
  v_run uuid := nullif(current_setting('touchline.qa_test_run_id', true), '')::uuid;
  v_with_avatar uuid := nullif(current_setting('touchline.qa_test_user_with_avatar', true), '')::uuid;
  v_empty_avatar uuid := nullif(current_setting('touchline.qa_test_user_empty_avatar', true), '')::uuid;
  v_user uuid;
  v_email text;
  v_before jsonb;
  v_after jsonb;
  v_prior_arena jsonb;
  v_arena jsonb;
  v_result jsonb;
  v_expected text;
  v_apply_outcome text;
  v_rollback_outcome text;
  v_signature text;
  v_rejected boolean;
begin
  if v_run is null or v_with_avatar is null or v_empty_avatar is null or v_with_avatar=v_empty_avatar
  then raise exception 'SYNTHETIC_FIXTURE_IDENTITIES_REQUIRED'; end if;
  foreach v_signature in array array[
    'public.touchline_apply_qa_owner_scenario(text,uuid,uuid,text)',
    'public.touchline_rollback_qa_owner_scenario(text,uuid,uuid)'
  ] loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
      or has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or not has_function_privilege('service_role', v_signature, 'EXECUTE')
    then raise exception 'QA_EXECUTION_GRANTS_CHANGED'; end if;
  end loop;

  foreach v_user in array array[v_with_avatar, v_empty_avatar] loop
    select email into v_email from auth.users where id=v_user
      and email_confirmed_at is not null and deleted_at is null
      and lower(email) like '%@example.invalid';
    if not found then raise exception 'CONFIRMED_SYNTHETIC_USER_REQUIRED'; end if;
    select to_jsonb(u) into v_before from public.users u where id=v_user;
    if not found or (v_user=v_with_avatar and coalesce(v_before->>'avatar_url','')='')
      or (v_user=v_empty_avatar and coalesce(v_before->>'avatar_url','')<>'')
    then raise exception 'PHOTO_AND_EMPTY_FIXTURES_REQUIRED'; end if;
    if exists(select 1 from public.touchline_qa_owner_scenarios where run_id=v_run and user_id=v_user)
      or exists(select 1 from public.touchline_card_contracts where user_id=v_user and status='active')
    then raise exception 'PRISTINE_OWNER_SCENARIO_REQUIRED'; end if;
    select to_jsonb(a) into v_prior_arena from public.touchline_user_arena_state a where user_id=v_user;

    v_rejected := false;
    begin
      perform public.touchline_apply_qa_owner_scenario('not-the-qa-project', v_run, v_user, v_email);
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'TL_QA_FIXTURE_TARGET_FORBIDDEN' then raise; end if;
      v_rejected := true;
    end;
    if not v_rejected then raise exception 'QA_PROJECT_GUARD_NOT_ENFORCED'; end if;
    v_rejected := false;
    begin
      perform public.touchline_apply_qa_owner_scenario('xgxbwqxjssxxuihuwmgy', v_run, v_user, 'mismatch@example.invalid');
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'TL_QA_OWNER_SCENARIO_AUTH_IDENTITY_MISMATCH' then raise; end if;
      v_rejected := true;
    end;
    if not v_rejected then raise exception 'QA_IDENTITY_GUARD_NOT_ENFORCED'; end if;

    v_result := public.touchline_apply_qa_owner_scenario('xgxbwqxjssxxuihuwmgy', v_run, v_user, v_email);
    if v_result->>'avatarApplyOutcome' is distinct from 'preserved_no_write'
      or v_result->>'idempotentReplay' is distinct from 'false'
      or v_result->>'activeContracts' is distinct from '35'
    then raise exception 'NEW_APPLY_RECEIPT_INVALID'; end if;
    select to_jsonb(u) into v_after from public.users u where id=v_user;
    if v_after->'avatar_url' is distinct from v_before->'avatar_url'
      or v_after->'avatar_revision' is distinct from v_before->'avatar_revision'
    then raise exception 'APPLY_CHANGED_AVATAR'; end if;
    select to_jsonb(a) into v_arena from public.touchline_user_arena_state a where user_id=v_user;
    if v_arena->>'formation_key' is distinct from '4-3-3'
      or v_arena->>'coach_provider_id' is distinct from '455907'
      or jsonb_array_length(v_arena->'lineup') is distinct from 11
    then raise exception 'REAL_LINEUP_NOT_PRESERVED'; end if;

    -- QA008 may restore the entire metadata snapshot. Dedicated outcomes survive.
    update public.touchline_qa_owner_scenarios set metadata = '{}'::jsonb where run_id=v_run and user_id=v_user;
    select avatar_apply_outcome into v_apply_outcome from public.touchline_qa_owner_scenarios where run_id=v_run and user_id=v_user;
    if v_apply_outcome is distinct from 'preserved_no_write' then raise exception 'METADATA_RESET_LOST_OUTCOME'; end if;
    v_result := public.touchline_apply_qa_owner_scenario('xgxbwqxjssxxuihuwmgy', v_run, v_user, v_email);
    if v_result->>'avatarApplyOutcome' is distinct from 'preserved_no_write'
      or v_result->>'idempotentReplay' is distinct from 'true'
    then raise exception 'NEW_APPLY_REPLAY_INVALID'; end if;

    if v_user=v_with_avatar then
      -- Simulate a pre-forward scenario: no revision/outcome can be invented.
      update public.touchline_qa_owner_scenarios set avatar_apply_outcome = null where run_id=v_run and user_id=v_user;
      v_result := public.touchline_apply_qa_owner_scenario('xgxbwqxjssxxuihuwmgy', v_run, v_user, v_email);
      if v_result->>'avatarApplyOutcome' is distinct from 'legacy_unversioned' then raise exception 'LEGACY_APPLY_REPLAY_INVENTED_HISTORY'; end if;
      v_expected := 'skipped_legacy_unversioned';
    else v_expected := 'preserved_no_write'; end if;
    v_result := public.touchline_rollback_qa_owner_scenario('xgxbwqxjssxxuihuwmgy', v_run, v_user);
    if v_result->>'avatarRollbackOutcome' is distinct from v_expected
      or v_result->>'idempotentReplay' is distinct from 'false'
    then raise exception 'ROLLBACK_RECEIPT_INVALID'; end if;
    select to_jsonb(u) into v_after from public.users u where id=v_user;
    if v_after->'avatar_url' is distinct from v_before->'avatar_url'
      or v_after->'avatar_revision' is distinct from v_before->'avatar_revision'
    then raise exception 'ROLLBACK_CHANGED_AVATAR'; end if;
    select to_jsonb(a) into v_arena from public.touchline_user_arena_state a where user_id=v_user;
    if v_arena is distinct from v_prior_arena then raise exception 'PRIOR_ARENA_NOT_RESTORED'; end if;
    if exists(select 1 from public.touchline_card_contracts where user_id=v_user and status='active')
    then raise exception 'REAL_CONTRACT_ROLLBACK_INCOMPLETE'; end if;
    select avatar_rollback_outcome into v_rollback_outcome from public.touchline_qa_owner_scenarios where run_id=v_run and user_id=v_user;
    if v_rollback_outcome is distinct from v_expected then raise exception 'ROLLBACK_OUTCOME_NOT_RECORDED'; end if;
    v_result := public.touchline_rollback_qa_owner_scenario('xgxbwqxjssxxuihuwmgy', v_run, v_user);
    if v_result->>'avatarRollbackOutcome' is distinct from v_expected
      or v_result->>'idempotentReplay' is distinct from 'true'
    then raise exception 'ROLLBACK_REPLAY_INVALID'; end if;
    if v_user=v_with_avatar then
      update public.touchline_qa_owner_scenarios set avatar_rollback_outcome = null where run_id=v_run and user_id=v_user;
      v_result := public.touchline_rollback_qa_owner_scenario('xgxbwqxjssxxuihuwmgy', v_run, v_user);
      if v_result->>'avatarRollbackOutcome' is distinct from 'legacy_unversioned' then raise exception 'LEGACY_COMPLETED_REPLAY_INVENTED_SKIP'; end if;
    end if;
  end loop;
end $$;

-- Success is established by the assertions, not a printed unconditional PASS.
rollback;
