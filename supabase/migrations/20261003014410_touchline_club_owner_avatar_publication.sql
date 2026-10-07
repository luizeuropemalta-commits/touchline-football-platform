-- LOCAL CANDIDATE ONLY. No bucket, route, upload UI or financial activation.
-- Requires an explicitly authorized administrative executor able to transfer
-- ownership without granting runtime membership in the dedicated writer.
-- The conservative superuser gate below is NOT proof of hosted applicability.
-- QA057 compatibility must precede this boundary when QA owner functions exist.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$
declare v_apply oid; v_rollback oid;
begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and rolsuper)
  then raise exception 'AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED'; end if;
  v_apply := to_regprocedure('public.touchline_apply_qa_owner_scenario(text,uuid,uuid,text)');
  v_rollback := to_regprocedure('public.touchline_rollback_qa_owner_scenario(text,uuid,uuid)');
  if v_apply is not null or v_rollback is not null then
    -- Exact approved QA057 bodies, not a GUC assertion or a comment-marker gate.
    -- A later compatible forward requires explicit review of this admission.
    if v_apply is null or v_rollback is null
      or (select md5(prosrc) from pg_catalog.pg_proc where oid=v_apply) is distinct from 'b2ec1de447878dcec22d22a2fa5eec5a'
      or (select md5(prosrc) from pg_catalog.pg_proc where oid=v_rollback) is distinct from 'd5158f470a643641d4bd169f49842bcd'
      or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='touchline_qa_owner_scenarios' and column_name='avatar_apply_outcome')
      or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='touchline_qa_owner_scenarios' and column_name='avatar_rollback_outcome')
    then raise exception 'AVATAR_QA057_COMPATIBILITY_REQUIRED'; end if;
  end if;
end $$;

-- Unexpected pre-existing objects/roles are a collision, not authority to reuse.
create role touchline_avatar_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema touchline_avatar_private;
revoke all on schema touchline_avatar_private from public,anon,authenticated,service_role;
grant usage on schema touchline_avatar_private to service_role,touchline_avatar_writer;
-- CREATE is needed only for ownership transfer; revoked before transaction end.
grant create on schema touchline_avatar_private to touchline_avatar_writer;
grant usage on schema public,auth to touchline_avatar_writer;
grant execute on function auth.uid() to touchline_avatar_writer;
grant select(id,deleted_at) on auth.users to touchline_avatar_writer;

alter table public.users add column avatar_revision bigint not null default 0
  check(avatar_revision >= 0);
-- Existing URLs are preserved at revision zero; no synthetic history/backfill.
create table touchline_avatar_private.receipts (
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation_id uuid not null,
  expected_revision bigint not null check(expected_revision >= 0 and expected_revision <= 9223372036854775806),
  revision bigint not null check(revision > 0),
  digest text not null check(digest ~ '^[a-f0-9]{64}$'),
  object_key text not null,
  avatar_url text not null,
  committed_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,operation_id),
  unique(actor_id,revision),
  check(revision = expected_revision + 1),
  check(actor_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check(operation_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  check(object_key = actor_id::text || '/' || operation_id::text || '/' || digest || '.webp'),
  check(avatar_url = '/api/account/avatar?version=' || operation_id::text)
);
alter table touchline_avatar_private.receipts enable row level security;
alter table touchline_avatar_private.receipts force row level security;
revoke all on touchline_avatar_private.receipts from public,anon,authenticated,service_role;
grant select,insert on touchline_avatar_private.receipts to touchline_avatar_writer;
create policy avatar_writer_read_receipts on touchline_avatar_private.receipts for select to touchline_avatar_writer using(true);
create policy avatar_writer_insert_receipts on touchline_avatar_private.receipts for insert to touchline_avatar_writer with check(true);
grant select(id,avatar_url,avatar_revision) on public.users to touchline_avatar_writer;
grant update(avatar_url,avatar_revision) on public.users to touchline_avatar_writer;
create policy avatar_writer_read_profile on public.users for select to touchline_avatar_writer using(true);
create policy avatar_writer_update_profile on public.users for update to touchline_avatar_writer using(true) with check(true);
-- These policies isolate a service-only capability, NOT per-browser-user RLS.
-- The trusted server must capture/authorize the session actor before any RPC.

create function touchline_avatar_private.assert_actor(p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_actor is null or p_actor::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_ACTOR'; end if;
  if auth.uid() is not null and auth.uid() <> p_actor
  then raise exception using errcode='42501',message='AVATAR_AUTH_SUBJECT_MISMATCH'; end if;
  if not exists(select 1 from auth.users where id=p_actor and deleted_at is null)
  then raise exception 'AVATAR_AUTH_IDENTITY_UNAVAILABLE'; end if;
end $$;

create function touchline_avatar_private.receipt_json(r touchline_avatar_private.receipts)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('actorId',r.actor_id::text,'operationId',r.operation_id::text,
    'expectedRevision',r.expected_revision::text,'revision',r.revision::text,
    'digest',r.digest,'objectKey',r.object_key,'avatarUrl',r.avatar_url)
$$;

create function touchline_avatar_private.read_current(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_revision bigint; v_url text; v_receipt touchline_avatar_private.receipts%rowtype;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  select avatar_revision,avatar_url into v_revision,v_url from public.users where id=p_actor;
  if not found then raise exception 'AVATAR_PROFILE_UNAVAILABLE'; end if;
  if v_revision=0 then
    if exists(select 1 from touchline_avatar_private.receipts where actor_id=p_actor)
    then raise exception 'AVATAR_PROFILE_HISTORY_MISMATCH'; end if;
    return jsonb_build_object('actorId',p_actor::text,'revision','0','avatarUrl',v_url,'operationId',null,'digest',null);
  end if;
  select * into v_receipt from touchline_avatar_private.receipts where actor_id=p_actor and revision=v_revision;
  if not found or v_receipt.avatar_url is distinct from v_url
  then raise exception 'AVATAR_PROFILE_HISTORY_MISMATCH'; end if;
  return jsonb_build_object('actorId',p_actor::text,'revision',v_revision::text,'avatarUrl',v_url,
    'operationId',v_receipt.operation_id::text,'digest',v_receipt.digest);
end $$;

create function touchline_avatar_private.find_operation(p_actor uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_receipt touchline_avatar_private.receipts%rowtype;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  if p_operation is null or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'AVATAR_INVALID_OPERATION'; end if;
  select * into v_receipt from touchline_avatar_private.receipts where actor_id=p_actor and operation_id=p_operation;
  if not found then return null; end if;
  return touchline_avatar_private.receipt_json(v_receipt);
end $$;

create function touchline_avatar_private.publish(p_actor uuid,p_operation uuid,p_expected text,p_digest text,p_key text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare v_revision bigint; v_expected bigint; v_url text; v_receipt touchline_avatar_private.receipts%rowtype;
begin
  perform touchline_avatar_private.assert_actor(p_actor);
  if p_operation is null or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_expected is null or p_expected !~ '^(0|[1-9][0-9]{0,18})$'
    or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
    or p_key is distinct from p_actor::text || '/' || p_operation::text || '/' || p_digest || '.webp'
  then raise exception 'AVATAR_INVALID_PUBLICATION'; end if;
  if p_expected::numeric > 9223372036854775806 then raise exception 'AVATAR_REVISION_OVERFLOW'; end if;
  v_expected := p_expected::bigint;
  v_url := '/api/account/avatar?version=' || p_operation::text;
  -- Lock serializes same/different operations on this account. All writers must
  -- cross the trigger below. Cancellation/transport loss is not rollback proof.
  select avatar_revision into v_revision from public.users where id=p_actor for update;
  if not found then raise exception 'AVATAR_PROFILE_UNAVAILABLE'; end if;
  select * into v_receipt from touchline_avatar_private.receipts where actor_id=p_actor and operation_id=p_operation;
  if found then
    if v_receipt.expected_revision<>v_expected or v_receipt.digest<>p_digest or v_receipt.object_key<>p_key
    then return jsonb_build_object('status','operation_conflict'); end if;
    return jsonb_build_object('status','committed','receipt',touchline_avatar_private.receipt_json(v_receipt));
  end if;
  if v_revision <> v_expected then return jsonb_build_object('status','conflict'); end if;
  if exists(select 1 from touchline_avatar_private.receipts where actor_id=p_actor and revision>=v_revision+1)
  then raise exception 'AVATAR_PROFILE_HISTORY_MISMATCH'; end if;
  insert into touchline_avatar_private.receipts(actor_id,operation_id,expected_revision,revision,digest,object_key,avatar_url)
  values(p_actor,p_operation,v_expected,v_revision+1,p_digest,p_key,v_url) returning * into v_receipt;
  update public.users set avatar_url=v_url,avatar_revision=v_revision+1 where id=p_actor;
  if not found then raise exception 'AVATAR_PROFILE_UNAVAILABLE'; end if;
  return jsonb_build_object('status','committed','receipt',touchline_avatar_private.receipt_json(v_receipt));
end $$;

-- Invoker trigger observes the effective caller, including entry from the
-- dedicated SECURITY DEFINER publish helper. A user-writable GUC cannot confer it.
create function touchline_avatar_private.guard_update()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.id is distinct from old.id then raise exception 'AVATAR_PROFILE_IDENTITY_IMMUTABLE'; end if;
  if new.avatar_url is distinct from old.avatar_url or new.avatar_revision is distinct from old.avatar_revision then
    if current_user <> 'touchline_avatar_writer' then raise exception using errcode='42501',message='AVATAR_DIRECT_WRITE_FORBIDDEN'; end if;
    if old.avatar_revision=9223372036854775807 or new.avatar_revision is distinct from old.avatar_revision+1
    then raise exception 'AVATAR_INVALID_REVISION_TRANSITION'; end if;
  end if;
  return new;
end $$;

-- Separate definer trigger can inspect private history on profile creation; it
-- never authorizes avatar mutations, and cannot be called as a normal function.
create function touchline_avatar_private.guard_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- ensureArenaUserProfile uses INSERT ON CONFLICT DO NOTHING on every visit.
  -- Existing-profile upserts must remain valid. Lock the existing identity so
  -- a concurrent DELETE cannot turn this admission into a fresh revision-zero
  -- row between the trigger check and the insert/conflict decision.
  perform 1 from public.users where id=new.id for key share;
  if not found and exists(select 1 from touchline_avatar_private.receipts where actor_id=new.id)
  then raise exception 'AVATAR_PROFILE_RECREATION_FORBIDDEN'; end if;
  if new.avatar_revision is distinct from 0::bigint or new.avatar_url is not null
  then raise exception using errcode='42501',message='AVATAR_DIRECT_WRITE_FORBIDDEN'; end if;
  return new;
end $$;
create trigger touchline_avatar_guard_insert before insert on public.users for each row execute function touchline_avatar_private.guard_insert();
create trigger touchline_avatar_guard_update before update on public.users for each row execute function touchline_avatar_private.guard_update();

alter function touchline_avatar_private.assert_actor(uuid) owner to touchline_avatar_writer;
alter function touchline_avatar_private.receipt_json(touchline_avatar_private.receipts) owner to touchline_avatar_writer;
alter function touchline_avatar_private.read_current(uuid) owner to touchline_avatar_writer;
alter function touchline_avatar_private.find_operation(uuid,uuid) owner to touchline_avatar_writer;
alter function touchline_avatar_private.publish(uuid,uuid,text,text,text) owner to touchline_avatar_writer;
alter function touchline_avatar_private.guard_update() owner to touchline_avatar_writer;
alter function touchline_avatar_private.guard_insert() owner to touchline_avatar_writer;
revoke all on all functions in schema touchline_avatar_private from public,anon,authenticated,service_role;
grant execute on function touchline_avatar_private.read_current(uuid) to service_role;
grant execute on function touchline_avatar_private.find_operation(uuid,uuid) to service_role;
grant execute on function touchline_avatar_private.publish(uuid,uuid,text,text,text) to service_role;
revoke create on schema touchline_avatar_private from touchline_avatar_writer;

create function public.touchline_read_club_owner_avatar(p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select touchline_avatar_private.read_current(p_actor)
$$;
create function public.touchline_find_club_owner_avatar_operation(p_actor uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select touchline_avatar_private.find_operation(p_actor,p_operation)
$$;
create function public.touchline_publish_club_owner_avatar(p_actor uuid,p_operation uuid,p_expected text,p_digest text,p_key text)
returns jsonb language sql security invoker set search_path='' as $$
  select touchline_avatar_private.publish(p_actor,p_operation,p_expected,p_digest,p_key)
$$;
revoke all on function public.touchline_read_club_owner_avatar(uuid) from public,anon,authenticated,service_role;
revoke all on function public.touchline_find_club_owner_avatar_operation(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.touchline_publish_club_owner_avatar(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.touchline_read_club_owner_avatar(uuid) to service_role;
grant execute on function public.touchline_find_club_owner_avatar_operation(uuid,uuid) to service_role;
grant execute on function public.touchline_publish_club_owner_avatar(uuid,uuid,text,text,text) to service_role;

do $$
begin
  if exists(select 1 from pg_catalog.pg_auth_members
    where roleid='touchline_avatar_writer'::regrole or member='touchline_avatar_writer'::regrole)
  then raise exception 'AVATAR_WRITER_MEMBERSHIP_FORBIDDEN'; end if;
end $$;
-- No receipt UPDATE/DELETE API, no object deletion, no URL fetch, no retry.
-- SQL cannot attest Storage bytes: the trusted server calls publish only after
-- the immutable Storage adapter confirms canonical key + exact normalized bytes.
commit;
