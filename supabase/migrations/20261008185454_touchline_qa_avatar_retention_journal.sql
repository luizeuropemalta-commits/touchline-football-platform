-- QA only. No Storage deletion, scheduler, writer mutation, or final-clean state.
-- Pin the actual QA connection independently of the supplied project string.
begin;
set local lock_timeout='5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
do $$ begin
  if current_database()<>'postgres' or current_user<>'postgres'
    or to_regprocedure('touchline_avatar_private.authorize_retention_candidate(text,uuid,uuid,text,text)') is null
  then raise exception 'AVATAR_RETENTION_JOURNAL_PREREQUISITE_REQUIRED'; end if;
end $$;

create table touchline_avatar_private.retention_candidates (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null, operation_id uuid not null, digest text not null,
  object_key text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  next_check_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz, active_attempt_id uuid,
  check (digest ~ '^[a-f0-9]{64}$'),
  check (object_key=actor_id::text||'/'||operation_id::text||'/'||digest||'.webp'),
  check ((lease_until is null)=(active_attempt_id is null)),
  unique(actor_id,operation_id,digest)
);
create index retention_candidates_due on touchline_avatar_private.retention_candidates(next_check_at,id);
create table touchline_avatar_private.retention_attempts (
  id uuid primary key,
  candidate_id uuid not null references touchline_avatar_private.retention_candidates(id),
  authorized_at timestamptz not null,
  expires_at timestamptz not null,
  authority jsonb not null,
  outcome text check (outcome in ('accepted','not_found','error','unknown')),
  recorded_at timestamptz,
  check ((outcome is null)=(recorded_at is null)),
  check (expires_at>authorized_at)
);
alter table touchline_avatar_private.retention_candidates enable row level security;
alter table touchline_avatar_private.retention_attempts enable row level security;
revoke all on touchline_avatar_private.retention_candidates,touchline_avatar_private.retention_attempts from public,anon,authenticated,service_role;

create function touchline_avatar_private.register_retention_candidate(
 p_project_ref text,p_actor uuid,p_operation uuid,p_digest text,p_object_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_authority jsonb; v_id uuid;
begin
  v_authority:=touchline_avatar_private.authorize_retention_candidate(p_project_ref,p_actor,p_operation,p_digest,p_object_key);
  if v_authority->>'allowed' is distinct from 'true' then return '{"version":1,"allowed":false}'::jsonb; end if;
  -- Registration never refreshes a lease or postpones a pending reconciliation.
  insert into touchline_avatar_private.retention_candidates(actor_id,operation_id,digest,object_key)
    values(p_actor,p_operation,p_digest,p_object_key) on conflict(object_key) do nothing;
  select id into v_id from touchline_avatar_private.retention_candidates where object_key=p_object_key
    and actor_id=p_actor and operation_id=p_operation and digest=p_digest;
  return jsonb_build_object('version',1,'allowed',v_id is not null,'candidateId',v_id);
end $$;

create function touchline_avatar_private.begin_retention_attempt(p_project_ref text,p_candidate uuid,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare v_candidate touchline_avatar_private.retention_candidates%rowtype; v_authority jsonb; v_now timestamptz;
begin
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' or auth.uid() is not null or p_attempt is null
    then return '{"version":1,"allowed":false}'::jsonb; end if;
  -- Read identity without taking a journal lock. Existing authority takes locks
  -- users -> account -> operations -> receipts, THEN this function locks journal.
  select * into v_candidate from touchline_avatar_private.retention_candidates where id=p_candidate;
  if not found then return '{"version":1,"allowed":false}'::jsonb; end if;
  v_authority:=touchline_avatar_private.authorize_retention_candidate(p_project_ref,v_candidate.actor_id,
    v_candidate.operation_id,v_candidate.digest,v_candidate.object_key);
  if v_authority->>'allowed' is distinct from 'true' then
    -- A denied/deleted actor must not permanently monopolize the oldest batch.
    update touchline_avatar_private.retention_candidates set next_check_at=clock_timestamp()+interval '5 minutes'
      where id=p_candidate and (lease_until is null or lease_until<=clock_timestamp());
    return '{"version":1,"allowed":false}'::jsonb;
  end if;
  select * into v_candidate from touchline_avatar_private.retention_candidates where id=p_candidate for update;
  v_now:=clock_timestamp();
  if v_candidate.next_check_at>v_now or v_candidate.lease_until>v_now
    or exists(select 1 from touchline_avatar_private.retention_attempts where id=p_attempt)
    then return '{"version":1,"allowed":false}'::jsonb; end if;
  insert into touchline_avatar_private.retention_attempts(id,candidate_id,authorized_at,expires_at,authority)
    values(p_attempt,p_candidate,v_now,v_now+interval '30 seconds',v_authority);
  update touchline_avatar_private.retention_candidates set active_attempt_id=p_attempt,lease_until=v_now+interval '30 seconds'
    where id=p_candidate;
  -- Adapter must check all five authority fields and call DELETE immediately.
  -- An expired/lost response or a repeated attempt ID is never a new grant.
  return v_authority||jsonb_build_object('candidateId',p_candidate,'attemptId',p_attempt,
    'checkedAt',v_now,'expiresAt',v_now+interval '30 seconds');
end $$;

create function touchline_avatar_private.record_retention_attempt(p_project_ref text,p_attempt uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare v_attempt touchline_avatar_private.retention_attempts%rowtype; v_candidate uuid; v_same boolean;
begin
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' or auth.uid() is not null
    or p_outcome is null or p_outcome not in ('accepted','not_found','error','unknown')
    then return '{"version":1,"recorded":false}'::jsonb; end if;
  select candidate_id into v_candidate from touchline_avatar_private.retention_attempts where id=p_attempt;
  if not found then return '{"version":1,"recorded":false}'::jsonb; end if;
  perform 1 from touchline_avatar_private.retention_candidates where id=v_candidate for update;
  select * into v_attempt from touchline_avatar_private.retention_attempts where id=p_attempt for update;
  if v_attempt.outcome is not null then
    v_same:=v_attempt.outcome=p_outcome;
    return jsonb_build_object('version',1,'recorded',v_same,'reconciliationRequired',true);
  end if;
  update touchline_avatar_private.retention_attempts set outcome=p_outcome,recorded_at=clock_timestamp() where id=p_attempt;
  -- Even accepted HTTP 200 / 404 is only an observation: a late POST can recreate
  -- bytes. Never mark clean, delete the candidate, or terminate reconciliation.
  -- A stale attempt must not release a newer worker's lease.
  update touchline_avatar_private.retention_candidates
    set active_attempt_id=null,lease_until=null,next_check_at=clock_timestamp()+interval '5 minutes'
    where id=v_candidate and active_attempt_id=p_attempt;
  return '{"version":1,"recorded":true,"reconciliationRequired":true}'::jsonb;
end $$;

create function touchline_avatar_private.list_due_retention_candidates(p_project_ref text,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;
begin
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' or auth.uid() is not null
    or p_limit is null or p_limit<1 or p_limit>25 then return '{"version":1,"candidates":[]}'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('candidateId',c.id,'actorId',c.actor_id,'operationId',c.operation_id,
    'digest',c.digest,'objectKey',c.object_key) order by c.next_check_at,c.id),'[]'::jsonb) into v_rows
    from (select * from touchline_avatar_private.retention_candidates
      where next_check_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())
      order by next_check_at,id limit p_limit) c;
  return jsonb_build_object('version',1,'candidates',v_rows);
end $$;

create function public.touchline_register_qa_avatar_retention_candidate(p_project_ref text,p_actor uuid,p_operation uuid,p_digest text,p_object_key text)
returns jsonb language sql security invoker set search_path='' as $$ select touchline_avatar_private.register_retention_candidate($1,$2,$3,$4,$5) $$;
create function public.touchline_begin_qa_avatar_retention_attempt(p_project_ref text,p_candidate uuid,p_attempt uuid)
returns jsonb language sql security invoker set search_path='' as $$ select touchline_avatar_private.begin_retention_attempt($1,$2,$3) $$;
create function public.touchline_record_qa_avatar_retention_attempt(p_project_ref text,p_attempt uuid,p_outcome text)
returns jsonb language sql security invoker set search_path='' as $$ select touchline_avatar_private.record_retention_attempt($1,$2,$3) $$;
create function public.touchline_list_due_qa_avatar_retention_candidates(p_project_ref text,p_limit integer)
returns jsonb language sql security invoker set search_path='' as $$ select touchline_avatar_private.list_due_retention_candidates($1,$2) $$;
revoke all on function touchline_avatar_private.register_retention_candidate(text,uuid,uuid,text,text),
 touchline_avatar_private.begin_retention_attempt(text,uuid,uuid),touchline_avatar_private.record_retention_attempt(text,uuid,text),
 touchline_avatar_private.list_due_retention_candidates(text,integer),public.touchline_register_qa_avatar_retention_candidate(text,uuid,uuid,text,text),
 public.touchline_begin_qa_avatar_retention_attempt(text,uuid,uuid),public.touchline_record_qa_avatar_retention_attempt(text,uuid,text),
 public.touchline_list_due_qa_avatar_retention_candidates(text,integer) from public,anon,authenticated,service_role;
grant execute on function touchline_avatar_private.register_retention_candidate(text,uuid,uuid,text,text),
 touchline_avatar_private.begin_retention_attempt(text,uuid,uuid),touchline_avatar_private.record_retention_attempt(text,uuid,text),
 touchline_avatar_private.list_due_retention_candidates(text,integer),public.touchline_register_qa_avatar_retention_candidate(text,uuid,uuid,text,text),
 public.touchline_begin_qa_avatar_retention_attempt(text,uuid,uuid),public.touchline_record_qa_avatar_retention_attempt(text,uuid,text),
 public.touchline_list_due_qa_avatar_retention_candidates(text,integer) to service_role;
commit;
