-- PENDING REAL EXECUTION. Run only in the disposable runner's local database.
-- Source tests cannot prove PostgreSQL behavior. No hosted/Storage/UI claim.
-- Two synthetic auth users: empty revision 0 + legacy receipt revision 1,
-- created through the REAL profile trigger and old publication BEFORE recovery.
-- Transaction rollback below is fixture cleanup, not a claim about lost replies.
-- Separate-session races/reconnect durability belong to the finite runner.
\set ON_ERROR_STOP on
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$
declare r record; n text;
begin
  if current_database() !~ '^touchline_avatar_recovery_test_[a-f0-9]{28}$'
    or current_setting('touchline.avatar_recovery_test_mode',true) is distinct from 'isolated'
  then raise exception 'ISOLATED_DATASET_REQUIRED'; end if;
  if not exists(select 1 from pg_roles where rolname=current_user and rolsuper)
  then raise exception 'LOCAL_ADMINISTRATIVE_EXECUTOR_REQUIRED'; end if;
  select * into strict r from pg_roles where rolname='touchline_avatar_writer';
  if r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolbypassrls
    or exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid)
  then raise exception 'WRITER_CAPABILITY_DRIFT'; end if;
  foreach n in array array['account_operations','operations'] loop
    if not exists(select 1 from pg_class where oid=('touchline_avatar_private.'||n)::regclass and relrowsecurity and relforcerowsecurity)
      or has_table_privilege('service_role','touchline_avatar_private.'||n,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('touchline_avatar_writer','touchline_avatar_private.'||n,'DELETE,TRUNCATE')
    then raise exception 'JOURNAL_RLS_OR_ACL_DRIFT'; end if;
  end loop;
  if exists(select 1 from touchline_avatar_private.account_operations)
    or (select avatar_revision from public.users where id=current_setting('touchline.avatar_test_empty_user')::uuid) is distinct from 0
    or (select avatar_revision from public.users where id=current_setting('touchline.avatar_test_photo_user')::uuid) is distinct from 1
  then raise exception 'PRISTINE_RECOVERY_FIXTURE_REQUIRED'; end if;
end $$;

set local role service_role;
do $$
declare
  a uuid:=current_setting('touchline.avatar_test_empty_user')::uuid;
  b uuid:=current_setting('touchline.avatar_test_photo_user')::uuid;
  legacy uuid:=current_setting('touchline.avatar_test_legacy_operation')::uuid;
  op uuid:=gen_random_uuid(); nextop uuid:=gen_random_uuid(); late uuid:=gen_random_uuid();
  digest text:=repeat('b',64); k text; r jsonb; first jsonb; saved jsonb;
begin
  r:=public.touchline_read_club_owner_avatar_operation_status(a,null);
  if r->>'generation' is distinct from '0' or r->>'fencedThroughGeneration' is distinct from '-1' or r->'operation' is distinct from 'null'::jsonb
  then raise exception 'INITIAL_STATUS_INVALID'; end if;
  -- Legacy receipt remains real; no journal generation is fabricated.
  r:=public.touchline_read_club_owner_avatar_operation_status(b,legacy);
  if r#>>'{operation,state}' is distinct from 'committed' or r#>>'{operation,legacy}' is distinct from 'true'
    or r#>'{operation,generation}' is distinct from 'null'::jsonb or r#>'{operation,baseGeneration}' is distinct from 'null'::jsonb
    or r#>>'{operation,receipt,revision}' is distinct from '1'
  then raise exception 'LEGACY_HISTORY_FABRICATED'; end if;
  r:=public.touchline_publish_club_owner_avatar(b,legacy,'0',repeat('a',64),b::text||'/'||legacy::text||'/'||repeat('a',64)||'.webp');
  if r->>'status' is distinct from 'committed' then raise exception 'LEGACY_REPLAY_LOST'; end if;
  foreach k in array array['public.touchline_publish_club_owner_avatar','touchline_avatar_private.publish'] loop
    begin
      execute format('select %s($1,$2,$3,$4,$5)',k) using a,op,'0',digest,a::text||'/'||op::text||'/'||digest||'.webp';
      raise exception 'LEGACY_PUBLISH_ACCEPTED';
    exception when sqlstate 'P0001' then if sqlerrm<>'AVATAR_GENERATION_REQUIRED' then raise; end if; end;
  end loop;
  perform set_config('request.jwt.claim.sub',b::text,true);
  begin
    perform public.touchline_begin_club_owner_avatar_operation(a,op,'0','0');
    raise exception 'AUTH_SUBJECT_MISMATCH_ACCEPTED';
  exception when insufficient_privilege then if sqlerrm<>'AVATAR_AUTH_SUBJECT_MISMATCH' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','',true);
  first:=public.touchline_begin_club_owner_avatar_operation(a,op,'0','0');
  if first->>'status' is distinct from 'started' or first#>>'{snapshot,generation}' is distinct from '1'
    or first#>>'{snapshot,operation,state}' is distinct from 'pending' then raise exception 'BEGIN_NOT_STARTED'; end if;
  r:=public.touchline_begin_club_owner_avatar_operation(a,op,'0','0');
  if r->>'status' is distinct from 'pending' or r->'snapshot' is distinct from first->'snapshot' then raise exception 'DUPLICATE_BEGIN_RESTARTED'; end if;
  if public.touchline_begin_club_owner_avatar_operation(a,op,'0','1')->>'status' is distinct from 'operation_conflict'
    or public.touchline_begin_club_owner_avatar_operation(a,op,'1','0')->>'status' is distinct from 'operation_conflict'
  then raise exception 'BEGIN_BINDING_NOT_IMMUTABLE'; end if;
  if public.touchline_begin_club_owner_avatar_operation(a,nextop,'0','1')->>'status' is distinct from 'busy'
    or public.touchline_begin_club_owner_avatar_operation(a,nextop,'0','0')->>'status' is distinct from 'conflict'
  then raise exception 'SECOND_WORKER_ACCEPTED'; end if;
  -- A stale/incorrect active binding cannot fence the owner of the current slot.
  if public.touchline_fence_club_owner_avatar_operation(a,'1',null)->>'status' is distinct from 'conflict'
  then raise exception 'WRONG_ACTIVE_FENCED'; end if;
  begin
    delete from public.users where id=a;
    raise exception 'PROFILE_DELETE_WITH_PENDING_ACCEPTED';
  exception when foreign_key_violation then null; end;
  insert into public.users(id,full_name) values(a,'Must not replace') on conflict(id) do nothing;
  k:=a::text||'/'||op::text||'/'||digest||'.webp';
  -- Force rollback after a successful publication within a subtransaction.
  saved:=public.touchline_read_club_owner_avatar_operation_status(a,op);
  begin
    perform public.touchline_publish_club_owner_avatar_v2(a,op,'0','1',digest,k);
    raise exception 'ROLLBACK_SENTINEL';
  exception when sqlstate 'P0001' then if sqlerrm<>'ROLLBACK_SENTINEL' then raise; end if; end;
  if public.touchline_read_club_owner_avatar_operation_status(a,op) is distinct from saved
  then raise exception 'ROLLBACK_LOST_PENDING'; end if;
  r:=public.touchline_publish_club_owner_avatar_v2(a,op,'0','1',digest,k);
  if r->>'status' is distinct from 'committed' or r#>>'{snapshot,revision}' is distinct from '1'
    or r#>>'{snapshot,generation}' is distinct from '2' or r#>>'{snapshot,operation,state}' is distinct from 'committed'
  then raise exception 'PUBLICATION_NOT_ATOMIC'; end if;
  if public.touchline_publish_club_owner_avatar_v2(a,op,'0','1',digest,k) is distinct from r
  then raise exception 'TERMINAL_REPLAY_LOST'; end if;
  if public.touchline_publish_club_owner_avatar_v2(a,op,'0','1',repeat('c',64),a::text||'/'||op::text||'/'||repeat('c',64)||'.webp')->>'status' is distinct from 'operation_conflict'
    or public.touchline_publish_club_owner_avatar_v2(a,op,'0','2',digest,k)->>'status' is distinct from 'operation_conflict'
  then raise exception 'PUBLISH_REPLAY_BINDING_LOST'; end if;
  if public.touchline_fence_club_owner_avatar_operation(a,'1',op)->>'status' is distinct from 'committed'
  then raise exception 'PUBLISH_WINNER_ERASED'; end if;
  -- Idle fence closes the base-generation window of a begin not yet observed.
  r:=public.touchline_fence_club_owner_avatar_operation(a,'2',null);
  if r->>'status' is distinct from 'barrier_applied' or r#>>'{snapshot,generation}' is distinct from '3'
    or r#>>'{snapshot,fencedThroughGeneration}' is distinct from '2' then raise exception 'IDLE_FENCE_FAILED'; end if;
  if public.touchline_begin_club_owner_avatar_operation(a,late,'1','2')->>'status' is distinct from 'conflict'
  then raise exception 'IDLE_FENCE_LATE_BEGIN_ACCEPTED'; end if;
  if public.touchline_begin_club_owner_avatar_operation(a,nextop,'1','3')->>'status' is distinct from 'started'
  then raise exception 'POST_FENCE_PROGRESS_BLOCKED'; end if;
  -- Lost fence response replay must NOT close a newer pending operation.
  r:=public.touchline_fence_club_owner_avatar_operation(a,'2',null);
  if r->>'status' is distinct from 'barrier_applied' or r#>>'{snapshot,activeOperationId}' is distinct from nextop::text
    or r#>>'{snapshot,generation}' is distinct from '4' then raise exception 'FENCE_CLOSED_NEW_OPERATION'; end if;
  perform public.touchline_fence_club_owner_avatar_operation(a,'4',nextop);
  r:=public.touchline_publish_club_owner_avatar_v2(a,nextop,'1','4',digest,a::text||'/'||nextop::text||'/'||digest||'.webp');
  if r->>'status' is distinct from 'conflict' or r#>>'{snapshot,operation,state}' is distinct from 'fenced'
    or r#>>'{snapshot,revision}' is distinct from '1' then raise exception 'FENCED_PUBLICATION_ACCEPTED'; end if;
end $$;
reset role;

-- Explicit local admin fixture at the boundary; NOT a claim of naturally
-- accumulating MAX generations. Actual begin/fence/replay arithmetic is tested.
update touchline_avatar_private.account_operations set generation=9223372036854775805
  where actor_id=current_setting('touchline.avatar_test_empty_user')::uuid;
insert into touchline_avatar_private.account_operations(actor_id,generation)
  values(current_setting('touchline.avatar_test_photo_user')::uuid,9223372036854775806);
set local role service_role;
do $$
declare a uuid:=current_setting('touchline.avatar_test_empty_user')::uuid;
  b uuid:=current_setting('touchline.avatar_test_photo_user')::uuid; op uuid:=gen_random_uuid(); r jsonb;
begin
  begin
    perform public.touchline_begin_club_owner_avatar_operation(b,gen_random_uuid(),'1','9223372036854775806');
    raise exception 'GENERATION_HEADROOM_MISSING';
  exception when sqlstate 'P0001' then if sqlerrm<>'AVATAR_RECOVERY_OVERFLOW' then raise; end if; end;
  r:=public.touchline_begin_club_owner_avatar_operation(a,op,'1','9223372036854775805');
  if r->>'status' is distinct from 'started' or r#>>'{snapshot,generation}' is distinct from '9223372036854775806'
  then raise exception 'BIGINT_SERIALIZER_CHANGED'; end if;
  r:=public.touchline_fence_club_owner_avatar_operation(a,'9223372036854775806',op);
  if r#>>'{snapshot,generation}' is distinct from '9223372036854775807'
    or public.touchline_begin_club_owner_avatar_operation(a,op,'1','9223372036854775805')->>'status' is distinct from 'fenced'
    or public.touchline_fence_club_owner_avatar_operation(a,'9223372036854775806',op)->>'status' is distinct from 'barrier_applied'
  then raise exception 'TERMINAL_REPLAY_AT_MAX_LOST'; end if;
  begin
    perform public.touchline_begin_club_owner_avatar_operation(a,gen_random_uuid(),'1','9223372036854775807');
    raise exception 'GENERATION_HEADROOM_MISSING';
  exception when sqlstate 'P0001' then if sqlerrm<>'AVATAR_RECOVERY_OVERFLOW' then raise; end if; end;
end $$;
reset role;
rollback;
