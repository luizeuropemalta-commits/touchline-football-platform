-- LOCAL CANDIDATE ONLY; no route/UI/flag/bucket activation. Forward-only.
-- Apply with upload gates OFF and all OLD publish requests/transactions drained.
-- Replacing a function does not cancel a previously executing function body.
-- Additional retention boundary: after begin/idle fence, public.users deletion
-- is RESTRICTed even before the first receipt. No purge/reset policy is added.
-- Lock order for mutations: public.users -> account_operations -> operations
-- -> receipts. Object creation is outside SQL; orphan private objects may remain.
-- Service-only capability, NOT per-browser-user RLS: the trusted server must
-- capture/authorize the actor. assert_actor additionally checks non-null auth.uid.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare r record;
begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and rolsuper)
  then raise exception 'AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED'; end if;
  select * into strict r from pg_catalog.pg_roles where rolname='touchline_avatar_writer';
  if r.rolcanlogin or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolinherit or r.rolbypassrls
    or exists(select 1 from pg_catalog.pg_auth_members where roleid=r.oid or member=r.oid)
  then raise exception 'AVATAR_WRITER_CAPABILITY_DRIFT'; end if;
  if to_regprocedure('touchline_avatar_private.find_operation(uuid,uuid)') is null
    or to_regprocedure('touchline_avatar_private.publish(uuid,uuid,text,text,text)') is null
    or to_regclass('touchline_avatar_private.receipts') is null
  then raise exception 'AVATAR_PUBLICATION_PREREQUISITE_REQUIRED'; end if;
end $$;

create table touchline_avatar_private.account_operations (
  actor_id uuid primary key references public.users(id) on delete restrict,
  generation bigint not null default 0 check(generation >= 0),
  active_operation_id uuid,
  -- -1 means no fence ever committed, unlike an idle fence of generation zero.
  fenced_through_generation bigint not null default -1,
  check(fenced_through_generation >= -1 and fenced_through_generation < generation),
  foreign key(actor_id) references auth.users(id) on delete restrict
);
create table touchline_avatar_private.operations (
  actor_id uuid not null references touchline_avatar_private.account_operations(actor_id) on delete restrict,
  operation_id uuid not null check(operation_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  expected_revision bigint not null check(expected_revision between 0 and 9223372036854775806),
  base_generation bigint not null check(base_generation between 0 and 9223372036854775805),
  generation bigint not null check(generation=base_generation+1),
  state text not null check(state in ('pending','committed','fenced')),
  receipt_operation_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  terminal_at timestamptz,
  primary key(actor_id,operation_id),
  unique(actor_id,generation),
  foreign key(actor_id,receipt_operation_id) references touchline_avatar_private.receipts(actor_id,operation_id) on delete restrict,
  check((state='committed' and receipt_operation_id is not null and receipt_operation_id=operation_id and terminal_at is not null)
    or (state='fenced' and receipt_operation_id is null and terminal_at is not null)
    or (state='pending' and receipt_operation_id is null and terminal_at is null))
);
create unique index avatar_one_pending_per_account on touchline_avatar_private.operations(actor_id) where state='pending';
alter table touchline_avatar_private.account_operations add constraint avatar_active_operation_fk
  foreign key(actor_id,active_operation_id) references touchline_avatar_private.operations(actor_id,operation_id) on delete restrict;
alter table touchline_avatar_private.account_operations enable row level security;
alter table touchline_avatar_private.account_operations force row level security;
alter table touchline_avatar_private.operations enable row level security;
alter table touchline_avatar_private.operations force row level security;
revoke all on touchline_avatar_private.account_operations,touchline_avatar_private.operations from public,anon,authenticated,service_role;
grant select,insert on touchline_avatar_private.account_operations,touchline_avatar_private.operations to touchline_avatar_writer;
grant update(generation,active_operation_id,fenced_through_generation) on touchline_avatar_private.account_operations to touchline_avatar_writer;
grant update(state,receipt_operation_id,terminal_at) on touchline_avatar_private.operations to touchline_avatar_writer;
create policy avatar_writer_account_read on touchline_avatar_private.account_operations for select to touchline_avatar_writer using(true);
create policy avatar_writer_account_insert on touchline_avatar_private.account_operations for insert to touchline_avatar_writer with check(true);
create policy avatar_writer_account_update on touchline_avatar_private.account_operations for update to touchline_avatar_writer using(true) with check(true);
create policy avatar_writer_operation_read on touchline_avatar_private.operations for select to touchline_avatar_writer using(true);
create policy avatar_writer_operation_insert on touchline_avatar_private.operations for insert to touchline_avatar_writer with check(true);
create policy avatar_writer_operation_update on touchline_avatar_private.operations for update to touchline_avatar_writer using(true) with check(true);

create function touchline_avatar_private.guard_operation_binding()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.actor_id is distinct from old.actor_id or new.operation_id is distinct from old.operation_id
    or new.expected_revision is distinct from old.expected_revision
    or new.base_generation is distinct from old.base_generation or new.generation is distinct from old.generation
    or new.created_at is distinct from old.created_at or old.state <> 'pending'
    or new.state not in ('committed','fenced')
  then raise exception 'AVATAR_OPERATION_BINDING_IMMUTABLE'; end if;
  return new;
end $$;
create trigger avatar_operation_binding before update on touchline_avatar_private.operations
for each row execute function touchline_avatar_private.guard_operation_binding();

create function touchline_avatar_private.recovery_number(p_value text)
returns bigint language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_value is null or p_value !~ '^(0|[1-9][0-9]{0,18})$'
  then raise exception 'AVATAR_INVALID_RECOVERY_NUMBER'; end if;
  if p_value::numeric > 9223372036854775807
  then raise exception 'AVATAR_INVALID_RECOVERY_NUMBER'; end if;
  return p_value::bigint;
end $$;

-- One joined statement is the snapshot; no read-side INSERT or inferred success.
-- VOLATILE snapshot semantics intentionally see prior writes in a calling RPC.
-- Null p_operation selects the current active operation for recovery after reload.
-- A legacy receipt has null operation generations: its historical generation
-- is unknown. Account generation zero means this protocol has not mutated it.
create function touchline_avatar_private.operation_status(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v record; v_operation jsonb;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  if p_operation is not null and p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_OPERATION'; end if;
  select u.avatar_revision,u.avatar_url,coalesce(a.generation,0) as account_generation,
    a.active_operation_id,coalesce(a.fenced_through_generation,-1) as fenced_through,
    coalesce(p_operation,a.active_operation_id) as requested_operation,
    o.operation_id as journal_operation,o.expected_revision,o.base_generation,o.generation as operation_generation,o.state,
    r.operation_id as receipt_operation,r.expected_revision as receipt_expected,r.revision as receipt_revision,
    touchline_avatar_private.receipt_json(r) as receipt,
    cr.operation_id as current_operation,cr.avatar_url as current_url,
    exists(select 1 from touchline_avatar_private.receipts h where h.actor_id=u.id) as has_history
  into v from public.users u
    left join touchline_avatar_private.account_operations a on a.actor_id=u.id
    left join touchline_avatar_private.operations o on o.actor_id=u.id and o.operation_id=coalesce(p_operation,a.active_operation_id)
    left join touchline_avatar_private.receipts r on r.actor_id=u.id and r.operation_id=coalesce(p_operation,a.active_operation_id)
    left join touchline_avatar_private.receipts cr on cr.actor_id=u.id and cr.revision=u.avatar_revision
    where u.id=p_actor;
  if not found then raise exception 'AVATAR_PROFILE_UNAVAILABLE'; end if;
  if (v.avatar_revision=0 and v.has_history) or (v.avatar_revision>0 and (v.current_operation is null or v.current_url is distinct from v.avatar_url))
    or (v.state='committed' and (v.receipt_operation is null or v.receipt_expected is distinct from v.expected_revision))
    or (v.state in ('pending','fenced') and v.receipt_operation is not null)
    or (v.state='pending' and (v.active_operation_id is distinct from v.journal_operation or v.account_generation<>v.operation_generation))
  then raise exception 'AVATAR_PROFILE_HISTORY_MISMATCH'; end if;
  v_operation := case when v.journal_operation is not null or v.receipt_operation is not null then
    jsonb_build_object('operationId',v.requested_operation::text,'state',coalesce(v.state,'committed'),
      'expectedRevision',coalesce(v.expected_revision,v.receipt_expected)::text,
      'baseGeneration',v.base_generation::text,'generation',v.operation_generation::text,
      'legacy',v.journal_operation is null,'receipt',case when v.receipt_operation is not null then v.receipt else null end)
    else null end;
  return jsonb_build_object('version',1,'actorId',p_actor::text,'revision',v.avatar_revision::text,
    'generation',v.account_generation::text,'activeOperationId',v.active_operation_id::text,
    'fencedThroughGeneration',v.fenced_through::text,'requestedOperationId',v.requested_operation::text,
    'operation',v_operation);
end $$;

create function touchline_avatar_private.begin_operation(p_actor uuid,p_operation uuid,p_expected text,p_base_generation text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare v_revision bigint; v_expected bigint; v_base bigint; v_account touchline_avatar_private.account_operations%rowtype;
  v_op touchline_avatar_private.operations%rowtype; v_receipt touchline_avatar_private.receipts%rowtype; v_existing boolean;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  if p_operation is null or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_OPERATION'; end if;
  v_expected := touchline_avatar_private.recovery_number(p_expected);
  v_base := touchline_avatar_private.recovery_number(p_base_generation);
  select avatar_revision into v_revision from public.users where id=p_actor for update;
  if not found then raise exception 'AVATAR_PROFILE_UNAVAILABLE'; end if;
  -- Fail closed for a corrupt profile before creating a journal epoch.
  perform touchline_avatar_private.read_current(p_actor);
  select * into v_account from touchline_avatar_private.account_operations where actor_id=p_actor for update;
  select * into v_op from touchline_avatar_private.operations where actor_id=p_actor and operation_id=p_operation for update;
  v_existing := found;
  select * into v_receipt from touchline_avatar_private.receipts where actor_id=p_actor and operation_id=p_operation;
  if v_existing then
    if v_op.expected_revision<>v_expected or v_op.base_generation<>v_base then
      return jsonb_build_object('version',1,'status','operation_conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
    end if;
    return jsonb_build_object('version',1,'status',v_op.state,'snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
  end if;
  if v_receipt.operation_id is not null then
    return jsonb_build_object('version',1,'status',case when v_receipt.expected_revision=v_expected then 'committed' else 'operation_conflict' end,
      'snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
  end if;
  if v_account.actor_id is null then
    if v_base<>0 or v_revision<>v_expected then return jsonb_build_object('version',1,'status','conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation)); end if;
    insert into touchline_avatar_private.account_operations(actor_id) values(p_actor) returning * into v_account;
  end if;
  if v_revision <> v_expected or v_account.generation <> v_base then
    return jsonb_build_object('version',1,'status','conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
  end if;
  if v_account.active_operation_id is not null then
    return jsonb_build_object('version',1,'status','busy','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
  end if;
  -- Reserve begin + terminal increments before admitting any worker.
  if v_base > 9223372036854775805 or v_expected > 9223372036854775806
  then raise exception 'AVATAR_RECOVERY_OVERFLOW'; end if;
  insert into touchline_avatar_private.operations(actor_id,operation_id,expected_revision,base_generation,generation,state)
    values(p_actor,p_operation,v_expected,v_base,v_base+1,'pending');
  update touchline_avatar_private.account_operations set generation=v_base+1,active_operation_id=p_operation where actor_id=p_actor;
  return jsonb_build_object('version',1,'status','started','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
end $$;

create function touchline_avatar_private.fence_operation(p_actor uuid,p_generation text,p_expected_active uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare v_expected bigint; v_account touchline_avatar_private.account_operations%rowtype; v_op touchline_avatar_private.operations%rowtype;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  v_expected := touchline_avatar_private.recovery_number(p_generation);
  if p_expected_active is not null and p_expected_active::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_OPERATION'; end if;
  perform 1 from public.users where id=p_actor for update;
  if not found then raise exception 'AVATAR_PROFILE_UNAVAILABLE'; end if;
  perform touchline_avatar_private.read_current(p_actor);
  select * into v_account from touchline_avatar_private.account_operations where actor_id=p_actor for update;
  if v_account.actor_id is null then
    if v_expected<>0 or p_expected_active is not null then
      return jsonb_build_object('version',1,'status','conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_expected_active));
    end if;
    insert into touchline_avatar_private.account_operations(actor_id) values(p_actor) returning * into v_account;
  end if;
  select * into v_op from touchline_avatar_private.operations where actor_id=p_actor and operation_id=p_expected_active for update;
  if v_op.state='committed' and v_op.generation=v_expected then
    return jsonb_build_object('version',1,'status','committed','snapshot',touchline_avatar_private.operation_status(p_actor,p_expected_active));
  end if;
  -- A high-water acknowledgement proves a barrier only, NEVER readiness or
  -- the requested operation's terminal state; snapshot may contain newer work.
  if v_account.fenced_through_generation>=v_expected then
    return jsonb_build_object('version',1,'status','barrier_applied','snapshot',touchline_avatar_private.operation_status(p_actor,p_expected_active));
  end if;
  if v_account.generation<>v_expected or v_account.active_operation_id is distinct from p_expected_active then
    return jsonb_build_object('version',1,'status','conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_expected_active));
  end if;
  if v_expected=9223372036854775807 then raise exception 'AVATAR_RECOVERY_OVERFLOW'; end if;
  if p_expected_active is not null then
    if v_op.state is distinct from 'pending' or v_op.generation<>v_expected then raise exception 'AVATAR_OPERATION_HISTORY_MISMATCH'; end if;
    update touchline_avatar_private.operations set state='fenced',terminal_at=clock_timestamp()
      where actor_id=p_actor and operation_id=p_expected_active;
  end if;
  update touchline_avatar_private.account_operations set generation=generation+1,active_operation_id=null,
    fenced_through_generation=greatest(fenced_through_generation,v_expected) where actor_id=p_actor;
  return jsonb_build_object('version',1,'status','barrier_applied','snapshot',touchline_avatar_private.operation_status(p_actor,p_expected_active));
end $$;

create function touchline_avatar_private.publish_v2(p_actor uuid,p_operation uuid,p_expected text,p_generation text,p_digest text,p_key text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare v_expected bigint; v_generation bigint; v_revision bigint; v_url text;
  v_account touchline_avatar_private.account_operations%rowtype; v_op touchline_avatar_private.operations%rowtype;
  v_receipt touchline_avatar_private.receipts%rowtype;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  v_expected := touchline_avatar_private.recovery_number(p_expected);
  v_generation := touchline_avatar_private.recovery_number(p_generation);
  if p_operation is null or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
    or p_key is distinct from p_actor::text || '/' || p_operation::text || '/' || p_digest || '.webp'
  then raise exception 'AVATAR_INVALID_PUBLICATION'; end if;
  select avatar_revision into v_revision from public.users where id=p_actor for update;
  if not found then raise exception 'AVATAR_PROFILE_UNAVAILABLE'; end if;
  select * into v_account from touchline_avatar_private.account_operations where actor_id=p_actor for update;
  select * into v_op from touchline_avatar_private.operations where actor_id=p_actor and operation_id=p_operation for update;
  select * into v_receipt from touchline_avatar_private.receipts where actor_id=p_actor and operation_id=p_operation;
  if v_op.operation_id is null then
    return jsonb_build_object('version',1,'status','conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
  end if;
  if v_op.generation <> v_generation or v_op.expected_revision <> v_expected then
    return jsonb_build_object('version',1,'status','operation_conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
  end if;
  if v_op.state='committed' then
    if v_receipt.operation_id is null then raise exception 'AVATAR_OPERATION_HISTORY_MISMATCH'; end if;
    if v_receipt.expected_revision<>v_expected or v_receipt.digest<>p_digest or v_receipt.object_key<>p_key then
      return jsonb_build_object('version',1,'status','operation_conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
    end if;
    return jsonb_build_object('version',1,'status','committed','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
  end if;
  if v_op.state <> 'pending' or v_account.active_operation_id is distinct from p_operation
    or v_account.generation<>v_generation or v_revision<>v_expected then
    return jsonb_build_object('version',1,'status','conflict','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
  end if;
  if v_generation=9223372036854775807 or v_expected=9223372036854775807 then raise exception 'AVATAR_RECOVERY_OVERFLOW'; end if;
  perform touchline_avatar_private.read_current(p_actor);
  v_url := '/api/account/avatar?version=' || p_operation::text;
  insert into touchline_avatar_private.receipts(actor_id,operation_id,expected_revision,revision,digest,object_key,avatar_url)
    values(p_actor,p_operation,v_expected,v_revision+1,p_digest,p_key,v_url);
  update public.users set avatar_url=v_url,avatar_revision=v_revision+1 where id=p_actor;
  update touchline_avatar_private.operations set state='committed',receipt_operation_id=p_operation,terminal_at=clock_timestamp()
    where actor_id=p_actor and operation_id=p_operation;
  update touchline_avatar_private.account_operations set generation=generation+1,active_operation_id=null where actor_id=p_actor;
  return jsonb_build_object('version',1,'status','committed','snapshot',touchline_avatar_private.operation_status(p_actor,p_operation));
end $$;

-- Both old public wrapper and direct service helper now reach this replay-only
-- body. Existing receipts remain readable; no invented generation/backfill.
create or replace function touchline_avatar_private.publish(p_actor uuid,p_operation uuid,p_expected text,p_digest text,p_key text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare v_expected bigint; v_receipt touchline_avatar_private.receipts%rowtype;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  v_expected := touchline_avatar_private.recovery_number(p_expected);
  if p_operation is null or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
    or p_key is distinct from p_actor::text || '/' || p_operation::text || '/' || p_digest || '.webp'
  then raise exception 'AVATAR_INVALID_PUBLICATION'; end if;
  perform 1 from public.users where id=p_actor for update;
  if not found then raise exception 'AVATAR_PROFILE_UNAVAILABLE'; end if;
  select * into v_receipt from touchline_avatar_private.receipts where actor_id=p_actor and operation_id=p_operation;
  if not found then raise exception 'AVATAR_GENERATION_REQUIRED'; end if;
  if v_receipt.expected_revision<>v_expected or v_receipt.digest<>p_digest or v_receipt.object_key<>p_key
  then return jsonb_build_object('status','operation_conflict'); end if;
  return jsonb_build_object('status','committed','receipt',touchline_avatar_private.receipt_json(v_receipt));
end $$;

-- Transfer requires actual administrative capability; never grant runtime
-- membership or use a user-writable GUC as writer authority.
grant create on schema touchline_avatar_private to touchline_avatar_writer;
alter function touchline_avatar_private.guard_operation_binding() owner to touchline_avatar_writer;
alter function touchline_avatar_private.recovery_number(text) owner to touchline_avatar_writer;
alter function touchline_avatar_private.operation_status(uuid,uuid) owner to touchline_avatar_writer;
alter function touchline_avatar_private.begin_operation(uuid,uuid,text,text) owner to touchline_avatar_writer;
alter function touchline_avatar_private.fence_operation(uuid,text,uuid) owner to touchline_avatar_writer;
alter function touchline_avatar_private.publish_v2(uuid,uuid,text,text,text,text) owner to touchline_avatar_writer;
revoke create on schema touchline_avatar_private from touchline_avatar_writer;
revoke all on function touchline_avatar_private.guard_operation_binding() from public,anon,authenticated,service_role;
revoke all on function touchline_avatar_private.recovery_number(text) from public,anon,authenticated,service_role;
revoke all on function touchline_avatar_private.operation_status(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function touchline_avatar_private.begin_operation(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function touchline_avatar_private.fence_operation(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function touchline_avatar_private.publish_v2(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function touchline_avatar_private.operation_status(uuid,uuid) to service_role;
grant execute on function touchline_avatar_private.begin_operation(uuid,uuid,text,text) to service_role;
grant execute on function touchline_avatar_private.fence_operation(uuid,text,uuid) to service_role;
grant execute on function touchline_avatar_private.publish_v2(uuid,uuid,text,text,text,text) to service_role;

create function public.touchline_begin_club_owner_avatar_operation(p_actor uuid,p_operation uuid,p_expected text,p_base_generation text)
returns jsonb language sql security invoker set search_path='' as $$
  select touchline_avatar_private.begin_operation(p_actor,p_operation,p_expected,p_base_generation)
$$;
create function public.touchline_read_club_owner_avatar_operation_status(p_actor uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select touchline_avatar_private.operation_status(p_actor,p_operation)
$$;
create function public.touchline_fence_club_owner_avatar_operation(p_actor uuid,p_generation text,p_expected_active uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select touchline_avatar_private.fence_operation(p_actor,p_generation,p_expected_active)
$$;
create function public.touchline_publish_club_owner_avatar_v2(p_actor uuid,p_operation uuid,p_expected text,p_generation text,p_digest text,p_key text)
returns jsonb language sql security invoker set search_path='' as $$
  select touchline_avatar_private.publish_v2(p_actor,p_operation,p_expected,p_generation,p_digest,p_key)
$$;
revoke all on function public.touchline_begin_club_owner_avatar_operation(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.touchline_read_club_owner_avatar_operation_status(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.touchline_fence_club_owner_avatar_operation(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.touchline_publish_club_owner_avatar_v2(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.touchline_begin_club_owner_avatar_operation(uuid,uuid,text,text) to service_role;
grant execute on function public.touchline_read_club_owner_avatar_operation_status(uuid,uuid) to service_role;
grant execute on function public.touchline_fence_club_owner_avatar_operation(uuid,text,uuid) to service_role;
grant execute on function public.touchline_publish_club_owner_avatar_v2(uuid,uuid,text,text,text,text) to service_role;
commit;
