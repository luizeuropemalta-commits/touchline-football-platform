-- QA-only LOCAL candidate. Classification is NOT durable cleanup or deletion.
-- Independently pin the QA connection; a supplied project ref is not attestation.
-- No existing writer helper/owner is changed; no enumeration, job or Storage DML.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
do $$ begin
  if current_database()<>'postgres' or current_user<>'postgres'
    or to_regclass('touchline_avatar_private.operations') is null
    or to_regprocedure('public.touchline_publish_club_owner_avatar_v2(uuid,uuid,text,text,text,text)') is null
  then raise exception 'AVATAR_RETENTION_QA_PREREQUISITE_REQUIRED'; end if;
end $$;

create function touchline_avatar_private.authorize_retention_candidate(
  p_project_ref text,p_actor uuid,p_operation uuid,p_digest text,p_object_key text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare
  v_denied constant jsonb := '{"version":1,"allowed":false}'::jsonb;
  v_user public.users%rowtype;
  v_account touchline_avatar_private.account_operations%rowtype;
  v_operation touchline_avatar_private.operations%rowtype;
  v_current_operation touchline_avatar_private.operations%rowtype;
  v_active_operation touchline_avatar_private.operations%rowtype;
  v_receipt touchline_avatar_private.receipts%rowtype;
  v_current_receipt touchline_avatar_private.receipts%rowtype;
  v_current_operation_id uuid;
  v_now timestamptz;
  v_kind text;
begin
  -- This worker capability is never admitted with a browser subject, even self.
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' or auth.uid() is not null
    or p_actor is null or p_operation is null
    or p_actor::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
    or p_object_key is distinct from p_actor::text||'/'||p_operation::text||'/'||p_digest||'.webp'
  then return v_denied; end if;
  select * into v_user from public.users where id=p_actor for update;
  if not found or not exists(select 1 from auth.users where id=p_actor and deleted_at is null)
  then return v_denied; end if;
  select * into v_account from touchline_avatar_private.account_operations where actor_id=p_actor for update;
  if not found then return v_denied; end if;
  -- Read immutable identity first; locks remain users -> account -> operations -> receipts.
  select operation_id into v_current_operation_id from touchline_avatar_private.receipts
    where actor_id=p_actor and revision=v_user.avatar_revision;
  perform 1 from touchline_avatar_private.operations where actor_id=p_actor
    and operation_id in (p_operation,v_current_operation_id,v_account.active_operation_id) order by operation_id for update;
  select * into v_operation from touchline_avatar_private.operations where actor_id=p_actor and operation_id=p_operation;
  if not found then return v_denied; end if;
  select * into v_current_operation from touchline_avatar_private.operations where actor_id=p_actor and operation_id=v_current_operation_id;
  select * into v_active_operation from touchline_avatar_private.operations where actor_id=p_actor and operation_id=v_account.active_operation_id;
  if v_account.active_operation_id is not null and (v_active_operation.operation_id is null
    or v_active_operation.state is distinct from 'pending' or v_active_operation.generation is distinct from v_account.generation)
  then return v_denied; end if;
  perform 1 from touchline_avatar_private.receipts where actor_id=p_actor
    and operation_id in (p_operation,v_current_operation_id) order by revision for update;
  select * into v_current_receipt from touchline_avatar_private.receipts where actor_id=p_actor and revision=v_user.avatar_revision;
  select * into v_receipt from touchline_avatar_private.receipts where actor_id=p_actor and operation_id=p_operation;
  if v_user.avatar_revision=0 then
    if exists(select 1 from touchline_avatar_private.receipts where actor_id=p_actor) then return v_denied; end if;
  elsif v_current_receipt.operation_id is null or v_current_receipt.avatar_url is distinct from v_user.avatar_url
    or v_current_operation.operation_id is null or v_current_operation.state is distinct from 'committed'
    or v_current_operation.receipt_operation_id is distinct from v_current_receipt.operation_id
    or v_current_operation.expected_revision is distinct from v_current_receipt.expected_revision
    or v_current_operation.terminal_at is null
    or v_account.generation<=v_current_operation.generation
    or v_account.active_operation_id=v_current_operation.operation_id
  then return v_denied; end if;
  if exists(select 1 from touchline_avatar_private.receipts where actor_id=p_actor and revision>v_user.avatar_revision)
  then return v_denied; end if;
  v_now:=clock_timestamp();
  if v_operation.terminal_at is null or v_operation.terminal_at>v_now-interval '5 minutes'
    or v_account.active_operation_id=p_operation or v_account.generation<=v_operation.generation
  then return v_denied; end if;
  if v_operation.state='committed' then
    if v_receipt.operation_id is null or v_receipt.revision>=v_user.avatar_revision
      or v_operation.receipt_operation_id is distinct from p_operation
      or v_operation.expected_revision is distinct from v_receipt.expected_revision
      or v_receipt.object_key is distinct from p_object_key or v_receipt.digest is distinct from p_digest
    then return v_denied; end if;
    v_kind:='superseded_committed';
  elsif v_operation.state='fenced' then
    if v_receipt.operation_id is not null or v_operation.receipt_operation_id is not null
      or v_account.fenced_through_generation<v_operation.generation
    then return v_denied; end if;
    v_kind:='fenced_without_receipt';
  else return v_denied; end if;
  -- The nonce is diagnostic metadata, not a durable deletion grant or job receipt.
  return jsonb_build_object('version',1,'allowed',true,'authorizationId',gen_random_uuid()::text,
    'actorId',p_actor::text,'operationId',p_operation::text,'digest',p_digest,'objectKey',p_object_key,
    'kind',v_kind,'currentRevision',v_user.avatar_revision::text,'operationGeneration',v_operation.generation::text,
    'terminalAt',v_operation.terminal_at,'eligibleAfter',v_operation.terminal_at+interval '5 minutes');
end $$;
revoke all on function touchline_avatar_private.authorize_retention_candidate(text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function touchline_avatar_private.authorize_retention_candidate(text,uuid,uuid,text,text) to service_role;

create function public.touchline_authorize_qa_avatar_retention_candidate(
  p_project_ref text,p_actor uuid,p_operation uuid,p_digest text,p_object_key text
) returns jsonb language sql security invoker set search_path='' as $$
  select touchline_avatar_private.authorize_retention_candidate(p_project_ref,p_actor,p_operation,p_digest,p_object_key)
$$;
revoke all on function public.touchline_authorize_qa_avatar_retention_candidate(text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.touchline_authorize_qa_avatar_retention_candidate(text,uuid,uuid,text,text) to service_role;
commit;
