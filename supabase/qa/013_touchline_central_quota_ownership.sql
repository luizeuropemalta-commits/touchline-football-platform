-- PREPARATION ONLY. Install exclusively in the selected central authority,
-- after drain, backup, independent review and explicit deployment gates.
-- Not an automatic content-database migration. Retires legacy RPC access.
begin;
set local lock_timeout = '5s';
-- Cutover cannot orphan an in-flight legacy receipt. Lock in the same scope
-- then attempt order before inspecting or changing any authority object.
lock table public.touchline_fixture_quota_scopes in access exclusive mode;
lock table public.touchline_fixture_quota_attempts in access exclusive mode;
do $$ begin
  if exists(select 1 from public.touchline_fixture_quota_scopes where enabled or active_token is not null)
    or exists(select 1 from public.touchline_fixture_quota_attempts where completed_at is null) then
    raise exception 'Central quota installation requires disabled, drained scopes.';
  end if;
end $$;
create schema touchline_quota_private;
revoke all on schema touchline_quota_private from public, anon, authenticated, service_role;

create table touchline_quota_private.workers (
  worker_id text primary key check (worker_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  environment text not null check (environment in ('qa','production')),
  account_scope text not null references public.touchline_fixture_quota_scopes(account_scope),
  enabled boolean not null default false,
  unique(worker_id,environment,account_scope)
);
alter table touchline_quota_private.workers enable row level security;
revoke all on touchline_quota_private.workers from public,anon,authenticated,service_role;
alter table public.touchline_fixture_quota_attempts
  add column owner_worker_id text,
  add column owner_environment text,
  add constraint fixture_quota_owner_pair check ((owner_worker_id is null) = (owner_environment is null)),
  add constraint fixture_quota_owner_fk foreign key(owner_worker_id,owner_environment,account_scope)
    references touchline_quota_private.workers(worker_id,environment,account_scope);

-- Keep the reviewed policy implementation, but remove all caller access.
alter function public.touchline_fixture_quota_admit(text,uuid,text,integer,integer)
  set schema touchline_quota_private;
alter function public.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)
  set schema touchline_quota_private;
revoke all on function touchline_quota_private.touchline_fixture_quota_admit(text,uuid,text,integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function touchline_quota_private.touchline_fixture_quota_complete(text,uuid,text,integer,uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on public.touchline_fixture_quota_scopes,public.touchline_fixture_quota_attempts
  from public,anon,authenticated,service_role;

create function public.touchline_central_quota_admit(
  p_worker_id text,p_environment text,p_account_scope text,
  p_request_id uuid,p_endpoint text,p_attempt integer,p_budget_ms integer
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare w touchline_quota_private.workers; answer jsonb; changed integer;
begin
  -- Only the trusted gateway supplies this identity, never the HTTP body.
  select * into w from touchline_quota_private.workers
    where worker_id=p_worker_id and environment=p_environment and account_scope=p_account_scope and enabled for share;
  if not found then return jsonb_build_object('allowed',false); end if;
  perform 1 from public.touchline_fixture_quota_scopes where account_scope=w.account_scope for update;
  if not found then return jsonb_build_object('allowed',false); end if;
  answer:=touchline_quota_private.touchline_fixture_quota_admit(w.account_scope,p_request_id,p_endpoint,p_attempt,p_budget_ms);
  if answer->'allowed' is distinct from 'true'::jsonb then return jsonb_build_object('allowed',false); end if;
  update public.touchline_fixture_quota_attempts set owner_worker_id=w.worker_id,owner_environment=w.environment
    where account_scope=w.account_scope and request_id=p_request_id and attempt=p_attempt
      and endpoint=p_endpoint and token=(answer->>'token')::uuid
      and owner_worker_id is null and completed_at is null;
  get diagnostics changed=row_count;
  -- Raising aborts the entire transaction: no lease without durable owner.
  if changed<>1 then raise exception 'Central quota ownership unavailable.'; end if;
  return answer;
end $$;

create function public.touchline_central_quota_complete(
  p_worker_id text,p_environment text,p_account_scope text,
  p_request_id uuid,p_endpoint text,p_attempt integer,p_token uuid,p_observation jsonb
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare w touchline_quota_private.workers; a public.touchline_fixture_quota_attempts;
begin
  select * into w from touchline_quota_private.workers
    where worker_id=p_worker_id and environment=p_environment and account_scope=p_account_scope and enabled for share;
  if not found then return jsonb_build_object('persisted',false); end if;
  perform 1 from public.touchline_fixture_quota_scopes where account_scope=w.account_scope for update;
  if not found then return jsonb_build_object('persisted',false); end if;
  select * into a from public.touchline_fixture_quota_attempts
    where account_scope=w.account_scope and request_id=p_request_id and attempt=p_attempt for update;
  if not found or a.owner_worker_id is distinct from w.worker_id
    or a.owner_environment is distinct from w.environment or a.endpoint is distinct from p_endpoint
    or a.token is distinct from p_token then return jsonb_build_object('persisted',false); end if;
  -- Ownership checked BEFORE any state changes or idempotent replay.
  return touchline_quota_private.touchline_fixture_quota_complete(w.account_scope,p_request_id,p_endpoint,p_attempt,p_token,p_observation);
end $$;
revoke all on function public.touchline_central_quota_admit(text,text,text,uuid,text,integer,integer)
  from public,anon,authenticated;
revoke all on function public.touchline_central_quota_complete(text,text,text,uuid,text,integer,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.touchline_central_quota_admit(text,text,text,uuid,text,integer,integer) to service_role;
grant execute on function public.touchline_central_quota_complete(text,text,text,uuid,text,integer,uuid,jsonb) to service_role;
-- No workers, scopes, secrets, schedules or flags are inserted/activated.
commit;
