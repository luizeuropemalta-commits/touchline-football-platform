-- PENDING REAL EXECUTION. Source checks are not a PostgreSQL PASS.
-- Disposable local DB only; real migrations + QA057 if QA functions exist.
-- Before applying the avatar migration, seed two confirmed @example.invalid
-- auth users with the real profile trigger: one existing legacy URL, one NULL.
-- Supply settings touchline.avatar_publication_test_mode=isolated,
-- touchline.avatar_test_photo_user and touchline.avatar_test_empty_user.
-- The two profiles must have revision zero, no receipts or dependent game rows.
-- Run as the explicitly admitted local administrative executor. No hosted DB.
-- A future runner must prove concurrency in separate sessions and committed
-- lost-response/reconnect durability; this transaction cannot prove those.
\set ON_ERROR_STOP on
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

do $$
declare v_role record; v_signature text; v_user uuid;
begin
  if current_setting('touchline.avatar_publication_test_mode',true) is distinct from 'isolated'
    or current_database() !~ '^touchline_avatar_publication_test_[a-z0-9_]+$'
  then raise exception 'ISOLATED_DATASET_REQUIRED'; end if;
  if not exists(select 1 from pg_roles where rolname=current_user and rolsuper)
  then raise exception 'LOCAL_ADMINISTRATIVE_EXECUTOR_REQUIRED'; end if;
  select * into strict v_role from pg_roles where rolname='touchline_avatar_writer';
  if v_role.rolcanlogin or v_role.rolsuper or v_role.rolcreatedb or v_role.rolcreaterole or v_role.rolinherit or v_role.rolbypassrls
    or exists(select 1 from pg_auth_members where roleid=v_role.oid or member=v_role.oid)
  then raise exception 'WRITER_PRIVILEGE_OR_MEMBERSHIP_DRIFT'; end if;
  if has_schema_privilege('touchline_avatar_writer','touchline_avatar_private','CREATE')
    or has_table_privilege('service_role','touchline_avatar_private.receipts','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('touchline_avatar_writer','touchline_avatar_private.receipts','UPDATE,DELETE')
    or has_column_privilege('touchline_avatar_writer','public.users','full_name','UPDATE')
  then raise exception 'WRITER_MINIMUM_GRANTS_DRIFT'; end if;
  if not exists(select 1 from pg_class where oid='touchline_avatar_private.receipts'::regclass and relrowsecurity and relforcerowsecurity)
  then raise exception 'RECEIPT_RLS_REQUIRED'; end if;
  foreach v_signature in array array[
    'public.touchline_read_club_owner_avatar(uuid)',
    'public.touchline_find_club_owner_avatar_operation(uuid,uuid)',
    'public.touchline_publish_club_owner_avatar(uuid,uuid,text,text,text)'
  ] loop
    if has_function_privilege('anon',v_signature,'EXECUTE')
      or has_function_privilege('authenticated',v_signature,'EXECUTE')
      or not has_function_privilege('service_role',v_signature,'EXECUTE')
      or (select prosecdef from pg_proc where oid=v_signature::regprocedure)
    then raise exception 'PUBLIC_RPC_ACL_OR_DEFINER_DRIFT'; end if;
  end loop;
  foreach v_user in array array[
    nullif(current_setting('touchline.avatar_test_photo_user',true),'')::uuid,
    nullif(current_setting('touchline.avatar_test_empty_user',true),'')::uuid
  ] loop
    if not exists(select 1 from auth.users a join public.users u on u.id=a.id
      where a.id=v_user and a.email like '%@example.invalid' and a.email_confirmed_at is not null
        and a.deleted_at is null and u.avatar_revision=0)
      or exists(select 1 from touchline_avatar_private.receipts where actor_id=v_user)
    then raise exception 'PRISTINE_SYNTHETIC_PROFILE_REQUIRED'; end if;
  end loop;
  if current_setting('touchline.avatar_test_photo_user')=current_setting('touchline.avatar_test_empty_user')
    or coalesce((select avatar_url from public.users where id=current_setting('touchline.avatar_test_photo_user')::uuid),'')=''
    or (select avatar_url from public.users where id=current_setting('touchline.avatar_test_empty_user')::uuid) is not null
  then raise exception 'LEGACY_AND_EMPTY_PROFILE_REQUIRED'; end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.touchline_read_club_owner_avatar(current_setting('touchline.avatar_test_photo_user')::uuid);
    raise exception 'ANON_RPC_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$
begin
  -- Reproduce the migration's administrative capability admission under a real
  -- non-superuser, then independently attempt a real ownership transfer.
  begin
    if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and rolsuper)
    then raise exception 'AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED'; end if;
    raise exception 'UNPRIVILEGED_MIGRATION_GATE_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED' then raise; end if;
  end;
  begin
    alter function public.touchline_read_club_owner_avatar(uuid) owner to touchline_avatar_writer;
    raise exception 'UNPRIVILEGED_OWNER_TRANSFER_ACCEPTED';
  exception when insufficient_privilege then null; end;
  begin
    perform public.touchline_read_club_owner_avatar(current_setting('touchline.avatar_test_photo_user')::uuid);
    raise exception 'AUTHENTICATED_RPC_ACCEPTED';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('touchline.avatar_test_photo_user'),true);
  update public.users set full_name='Synthetic profile field remains editable'
    where id=current_setting('touchline.avatar_test_photo_user')::uuid;
  if not found then raise exception 'UNRELATED_PROFILE_UPDATE_BROKEN'; end if;
  begin
    update public.users set avatar_url='/forbidden.webp' where id=current_setting('touchline.avatar_test_photo_user')::uuid;
    raise exception 'DIRECT_WRITE_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claim.sub='';
set local role service_role;
do $$
declare
  v_actor uuid := current_setting('touchline.avatar_test_photo_user')::uuid;
  v_other uuid := current_setting('touchline.avatar_test_empty_user')::uuid;
  v_op uuid := gen_random_uuid(); v_next uuid := gen_random_uuid(); v_rolled uuid := gen_random_uuid();
  v_digest text := repeat('a',64); v_key text; v_current jsonb; v_first jsonb; v_result jsonb; v_bad text;
begin
  v_key := v_actor::text || '/' || v_op::text || '/' || v_digest || '.webp';
  v_current := public.touchline_read_club_owner_avatar(v_actor);
  if (v_current->>'revision') is distinct from '0' or (v_current->'operationId') is distinct from 'null'::jsonb
    or coalesce(v_current->>'avatarUrl','')=''
  then raise exception 'LEGACY_READ_CHANGED'; end if;
  if public.touchline_find_club_owner_avatar_operation(v_actor,v_op) is distinct from
    jsonb_build_object('version',1,'status','absent','actorId',v_actor::text,'operationId',v_op::text,'receipt',null)
  then raise exception 'ABSENT_OPERATION_ENVELOPE_INVALID'; end if;
  if (public.touchline_read_club_owner_avatar(v_other)->'avatarUrl') is distinct from 'null'::jsonb
  then raise exception 'EMPTY_READ_CHANGED'; end if;
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  begin
    perform public.touchline_read_club_owner_avatar(v_actor);
    raise exception 'AUTH_SUBJECT_MISMATCH_ACCEPTED';
  exception when insufficient_privilege then
    if sqlerrm<>'AVATAR_AUTH_SUBJECT_MISMATCH' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','',true);
  -- A user-writable marker is deliberately powerless; guard uses effective role.
  perform set_config('touchline.avatar_writer','true',true);
  begin
    update public.users set avatar_url='/forbidden-service.webp' where id=v_actor;
    raise exception 'DIRECT_WRITE_ACCEPTED';
  exception when insufficient_privilege then
    if sqlerrm<>'AVATAR_DIRECT_WRITE_FORBIDDEN' then raise; end if;
  end;
  begin
    update public.users set avatar_revision=1 where id=v_actor;
    raise exception 'DIRECT_REVISION_WRITE_ACCEPTED';
  exception when insufficient_privilege then null; end;
  begin
    perform * from touchline_avatar_private.receipts;
    raise exception 'DIRECT_RECEIPT_READ_ACCEPTED';
  exception when insufficient_privilege then null; end;

  v_result := public.touchline_publish_club_owner_avatar(v_actor,v_op,'0',v_digest,v_key);
  if (v_result->>'status') is distinct from 'committed' then raise exception 'FIRST_PUBLICATION_FAILED'; end if;
  v_first := v_result->'receipt';
  if (v_first->>'actorId') is distinct from v_actor::text or (v_first->>'operationId') is distinct from v_op::text
    or (v_first->>'revision') is distinct from '1' or (v_first->>'expectedRevision') is distinct from '0'
    or jsonb_typeof(v_first->'revision') is distinct from 'string' or jsonb_typeof(v_first->'expectedRevision') is distinct from 'string'
    or (v_first->>'objectKey') is distinct from v_key or (v_first->>'digest') is distinct from v_digest
    or (v_first->>'avatarUrl') is distinct from ('/api/account/avatar?version='||v_op::text)
  then raise exception 'CANONICAL_RECEIPT_INVALID'; end if;
  if public.touchline_publish_club_owner_avatar(v_actor,v_op,'0',v_digest,v_key)->'receipt' is distinct from v_first
    or (public.touchline_read_club_owner_avatar(v_actor)->>'revision') is distinct from '1'
  then raise exception 'REPLAY_CHANGED_REVISION'; end if;
  if public.touchline_find_club_owner_avatar_operation(v_actor,v_op) is distinct from
      jsonb_build_object('version',1,'status','found','actorId',v_actor::text,'operationId',v_op::text,'receipt',v_first)
    or public.touchline_find_club_owner_avatar_operation(v_other,v_op) is distinct from
      jsonb_build_object('version',1,'status','absent','actorId',v_other::text,'operationId',v_op::text,'receipt',null)
  then raise exception 'OWNER_RECEIPT_SCOPE_INVALID'; end if;
  if (public.touchline_publish_club_owner_avatar(v_actor,v_op,'1',v_digest,v_key)->>'status') is distinct from 'operation_conflict'
    or (public.touchline_publish_club_owner_avatar(v_actor,v_op,'0',repeat('b',64),v_actor::text||'/'||v_op::text||'/'||repeat('b',64)||'.webp')->>'status') is distinct from 'operation_conflict'
  then raise exception 'OPERATION_REBIND_ACCEPTED'; end if;
  if (public.touchline_publish_club_owner_avatar(v_actor,v_next,'0',v_digest,v_actor::text||'/'||v_next::text||'/'||v_digest||'.webp')->>'status') is distinct from 'conflict'
  then raise exception 'STALE_REVISION_ACCEPTED'; end if;
  perform public.touchline_publish_club_owner_avatar(v_actor,v_next,'1',v_digest,v_actor::text||'/'||v_next::text||'/'||v_digest||'.webp');
  if (public.touchline_read_club_owner_avatar(v_actor)->>'revision') is distinct from '2'
    or public.touchline_find_club_owner_avatar_operation(v_actor,v_op) is distinct from
      jsonb_build_object('version',1,'status','found','actorId',v_actor::text,'operationId',v_op::text,'receipt',v_first)
  then raise exception 'SUPERSEDED_HISTORY_LOST'; end if;
  -- Actual ensureArenaUserProfile payload/mode, plus unrelated field upsert.
  insert into public.users(id,full_name) values(v_actor,'Synthetic ignored profile') on conflict(id) do nothing;
  insert into public.users(id,full_name) values(v_actor,'Synthetic renamed profile')
    on conflict(id) do update set full_name=excluded.full_name;
  if (public.touchline_read_club_owner_avatar(v_actor)->>'revision') is distinct from '2'
    or (public.touchline_read_club_owner_avatar(v_actor)->>'operationId') is distinct from v_next::text
  then raise exception 'PROFILE_UPSERT_CHANGED_AVATAR'; end if;
  -- A real PostgreSQL subtransaction failure must roll back BOTH profile+receipt.
  begin
    perform public.touchline_publish_club_owner_avatar(v_actor,v_rolled,'2',v_digest,v_actor::text||'/'||v_rolled::text||'/'||v_digest||'.webp');
    raise exception using errcode='ZX001',message='INJECTED_AFTER_PUBLICATION';
  exception when sqlstate 'ZX001' then null; end;
  if (public.touchline_read_club_owner_avatar(v_actor)->>'revision') is distinct from '2'
    or public.touchline_find_club_owner_avatar_operation(v_actor,v_rolled) is distinct from
      jsonb_build_object('version',1,'status','absent','actorId',v_actor::text,'operationId',v_rolled::text,'receipt',null)
  then raise exception 'ROLLBACK_LOST_PRIOR_STATE'; end if;
  foreach v_bad in array array['-1','01','1.0','9223372036854775807','9999999999999999999'] loop
    begin
      perform public.touchline_publish_club_owner_avatar(v_actor,v_rolled,v_bad,v_digest,v_actor::text||'/'||v_rolled::text||'/'||v_digest||'.webp');
      raise exception 'INVALID_REVISION_ACCEPTED';
    exception when sqlstate 'P0001' then
      if sqlerrm not in ('AVATAR_INVALID_PUBLICATION','AVATAR_REVISION_OVERFLOW') then raise; end if;
    end;
  end loop;
  begin
    perform public.touchline_publish_club_owner_avatar(v_actor,v_rolled,'2',v_digest,'https://invalid.example/photo');
    raise exception 'ARBITRARY_KEY_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'AVATAR_INVALID_PUBLICATION' then raise; end if;
  end;
  -- Deleting the public profile cannot erase operation receipts or reset CAS.
  begin
    delete from public.users where id=v_actor;
    if public.touchline_find_club_owner_avatar_operation(v_actor,v_op) is distinct from
      jsonb_build_object('version',1,'status','found','actorId',v_actor::text,'operationId',v_op::text,'receipt',v_first)
    then raise exception 'PROFILE_DELETE_ERASED_RECEIPT'; end if;
    begin
      insert into public.users(id,full_name) values(v_actor,'Synthetic recreation');
      raise exception 'PROFILE_RECREATION_ACCEPTED';
    exception when sqlstate 'P0001' then
      if sqlerrm<>'AVATAR_PROFILE_RECREATION_FORBIDDEN' then raise; end if;
    end;
    begin
      perform public.touchline_read_club_owner_avatar(v_actor);
      raise exception 'MISSING_PROFILE_ASSUMED_ZERO';
    exception when sqlstate 'P0001' then
      if sqlerrm<>'AVATAR_PROFILE_UNAVAILABLE' then raise; end if;
    end;
    raise exception using errcode='ZX002',message='RESTORE_DELETED_PROFILE';
  exception when sqlstate 'ZX002' then null; end;
  if (public.touchline_read_club_owner_avatar(v_actor)->>'revision') is distinct from '2'
  then raise exception 'PROFILE_DELETE_ROLLBACK_FAILED'; end if;
end $$;
reset role;

do $$
declare v_json jsonb;
begin
  -- Exact large-bigint JSON serializer, without bypassing publication guards to
  -- fabricate billions of commits. Max-revision publication needs a future
  -- explicitly admitted bootstrap fixture; this is serializer coverage only.
  select touchline_avatar_private.receipt_json(row(
    current_setting('touchline.avatar_test_photo_user')::uuid,gen_random_uuid(),
    9223372036854775806::bigint,9223372036854775807::bigint,repeat('a',64),
    'serializer-only','serializer-only',clock_timestamp()
  )::touchline_avatar_private.receipts) into v_json;
  if (v_json->>'revision') is distinct from '9223372036854775807' or jsonb_typeof(v_json->'revision') is distinct from 'string'
  then raise exception 'BIGINT_SERIALIZATION_LOST_PRECISION'; end if;
end $$;
-- Entire fixture mutation set is disposable; durable/concurrent proofs pending.
rollback;
