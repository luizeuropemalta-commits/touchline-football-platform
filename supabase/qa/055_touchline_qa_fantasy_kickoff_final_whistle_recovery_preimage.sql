-- QA-only preimage for the 20260919151427 Fantasy market-window migration.
-- Run immediately before that forward migration, once, on xgxbwqxjssxxuihuwmgy.
-- It stores definitions/ACL metadata only: no customer, XI or fixture rows.

begin;
set local lock_timeout = '5s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

create table if not exists public.touchline_qa_fantasy_market_window_20260919_recovery_receipts (
  migration_key text primary key,
  project_ref text not null check (project_ref = 'xgxbwqxjssxxuihuwmgy'),
  state text not null check (state in ('PREIMAGE_CAPTURED', 'POSTFLIGHT_CAPTURED', 'RECOVERED')),
  preimage_function_definitions jsonb not null,
  preimage_function_md5 jsonb not null,
  preimage_acl jsonb not null,
  preimage_interval_constraint jsonb not null,
  postflight_function_md5 jsonb,
  postflight_acl jsonb,
  postflight_interval_constraint jsonb,
  captured_at timestamptz not null default clock_timestamp(),
  postflight_captured_at timestamptz,
  recovered_at timestamptz
);

alter table public.touchline_qa_fantasy_market_window_20260919_recovery_receipts enable row level security;
alter table public.touchline_qa_fantasy_market_window_20260919_recovery_receipts force row level security;
revoke all on table public.touchline_qa_fantasy_market_window_20260919_recovery_receipts from public, anon, authenticated;
grant select, insert, update on table public.touchline_qa_fantasy_market_window_20260919_recovery_receipts to service_role;

do $preimage$
declare
  v_key constant text := '20260919151427_touchline_fantasy_kickoff_final_whistle_market_window';
  v_expected_function_md5 constant jsonb := '{
    "touchline_fantasy_sync_gameweeks()": "bb212970a821da595632c4f9577f6bdb",
    "touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)": "7cbbcef208e07f829aa7beea00ff25cb",
    "touchline_fantasy_prepare_user_gameweek(uuid,uuid)": "328a56a158a4eb2fccba00c4e80d2849"
  }'::jsonb;
  v_expected_interval_constraint constant jsonb := jsonb_build_object(
    'name', 'touchline_fantasy_gameweeks_check',
    'definition_md5', 'e48d1e6eda6355c2eddb7429e4926d28'
  );
  v_function_definitions jsonb;
  v_function_md5 jsonb;
  v_acl jsonb;
  v_constraint jsonb;
  v_existing public.touchline_qa_fantasy_market_window_20260919_recovery_receipts%rowtype;
begin
  lock table public.touchline_fantasy_gameweeks in share row exclusive mode;

  with target_functions(signature) as (
    values
      ('public.touchline_fantasy_sync_gameweeks()'::regprocedure),
      ('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure),
      ('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)
  )
  select
    jsonb_object_agg(signature::text, pg_get_functiondef(signature)),
    jsonb_object_agg(signature::text, md5(pg_get_functiondef(signature))),
    jsonb_object_agg(signature::text, jsonb_build_object(
      'security_definer', procedure.prosecdef,
      'search_path_empty', coalesce(procedure.proconfig, array[]::text[]) @> array['search_path=""'],
      'public_execute', has_function_privilege('public', signature, 'execute'),
      'anon_execute', has_function_privilege('anon', signature, 'execute'),
      'authenticated_execute', has_function_privilege('authenticated', signature, 'execute'),
      'service_role_execute', has_function_privilege('service_role', signature, 'execute')
    ))
  into v_function_definitions, v_function_md5, v_acl
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
    and constraint_row.conname = 'touchline_fantasy_gameweeks_check';

  if v_function_md5 is distinct from v_expected_function_md5 then
    raise exception 'TL_FANTASY_RECOVERY_PREIMAGE_FUNCTION_FINGERPRINT_MISMATCH';
  end if;
  if v_constraint is null
    or v_constraint ->> 'name' <> v_expected_interval_constraint ->> 'name'
    or v_constraint ->> 'definition_md5' <> v_expected_interval_constraint ->> 'definition_md5' then
    raise exception 'TL_FANTASY_RECOVERY_PREIMAGE_CONSTRAINT_FINGERPRINT_MISMATCH';
  end if;
  if exists (
    select 1
    from jsonb_each(v_acl) as acl(signature, value)
    where coalesce((value ->> 'security_definer')::boolean, false) is not true
      or coalesce((value ->> 'search_path_empty')::boolean, false) is not true
      or coalesce((value ->> 'public_execute')::boolean, true) is not false
      or coalesce((value ->> 'anon_execute')::boolean, true) is not false
      or coalesce((value ->> 'authenticated_execute')::boolean, true) is not false
      or coalesce((value ->> 'service_role_execute')::boolean, false) is not true
  ) then
    raise exception 'TL_FANTASY_RECOVERY_PREIMAGE_ACL_MISMATCH';
  end if;

  select * into v_existing
  from public.touchline_qa_fantasy_market_window_20260919_recovery_receipts
  where migration_key = v_key
  for update;

  if v_existing.migration_key is not null then
    if v_existing.preimage_function_md5 is distinct from v_function_md5
      or v_existing.preimage_acl is distinct from v_acl
      or v_existing.preimage_interval_constraint is distinct from v_constraint then
      raise exception 'TL_FANTASY_RECOVERY_PREIMAGE_REPLAY_MISMATCH';
    end if;
    return;
  end if;

  insert into public.touchline_qa_fantasy_market_window_20260919_recovery_receipts (
    migration_key, project_ref, state, preimage_function_definitions,
    preimage_function_md5, preimage_acl, preimage_interval_constraint
  ) values (
    v_key, 'xgxbwqxjssxxuihuwmgy', 'PREIMAGE_CAPTURED', v_function_definitions,
    v_function_md5, v_acl, v_constraint
  );
end
$preimage$;

commit;
