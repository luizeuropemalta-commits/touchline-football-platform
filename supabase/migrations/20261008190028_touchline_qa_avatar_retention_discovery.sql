-- QA-only recurring prefix discovery. This never authorizes a Storage DELETE.
-- Pin actual QA transport independently; a supplied project ref is not attestation.
begin;
set local lock_timeout='5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
do $$ begin
  if current_database()<>'postgres' or current_user<>'postgres'
    or to_regclass('touchline_avatar_private.retention_candidates') is null
  then raise exception 'AVATAR_DISCOVERY_PREREQUISITE_REQUIRED'; end if;
end $$;
create table touchline_avatar_private.retention_discovery_claims (
  attempt_id uuid primary key,
  created_at timestamptz not null default clock_timestamp()
);
create table touchline_avatar_private.retention_discovery_scans (
  actor_id uuid not null, operation_id uuid not null,
  object_offset integer not null default 0 check(object_offset>=0 and object_offset%25=0),
  next_check_at timestamptz not null default clock_timestamp(),
  attempt_id uuid references touchline_avatar_private.retention_discovery_claims(attempt_id),
  lease_until timestamptz,
  primary key(actor_id,operation_id),
  check((attempt_id is null)=(lease_until is null))
);
create index retention_discovery_due on touchline_avatar_private.retention_discovery_scans(next_check_at,actor_id,operation_id);
alter table touchline_avatar_private.retention_discovery_claims enable row level security;
alter table touchline_avatar_private.retention_discovery_scans enable row level security;
revoke all on touchline_avatar_private.retention_discovery_claims,touchline_avatar_private.retention_discovery_scans from public,anon,authenticated,service_role;

create function touchline_avatar_private.claim_retention_discovery(p_project_ref text,p_attempt uuid,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare
 v_pick record; v_user public.users%rowtype;
 v_account touchline_avatar_private.account_operations%rowtype;
 v_op touchline_avatar_private.operations%rowtype;
 v_scan touchline_avatar_private.retention_discovery_scans%rowtype;
 v_now timestamptz; v_rows jsonb:='[]'::jsonb;
begin
 if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' or auth.uid() is not null
   or p_attempt is null or p_limit is null or p_limit<1 or p_limit>5
 then return '{"version":1,"allowed":false,"scans":[]}'::jsonb; end if;
 -- IDs are single-use even for an empty batch. A lost response is recovered by
 -- expiry and a NEW ID; replay never hands an old lease to another worker.
 insert into touchline_avatar_private.retention_discovery_claims(attempt_id) values(p_attempt)
   on conflict(attempt_id) do nothing;
 if not found then return '{"version":1,"allowed":false,"scans":[]}'::jsonb; end if;
 -- Select the oldest due work, then lock the bounded batch in actor/op order.
 -- Unseen rows use their original eligibility time, not an unconditional priority.
 for v_pick in select * from (
   select o.actor_id,o.operation_id from touchline_avatar_private.operations o
   join public.users u on u.id=o.actor_id
   join auth.users a on a.id=o.actor_id and a.deleted_at is null
   join touchline_avatar_private.account_operations ac on ac.actor_id=o.actor_id
   left join touchline_avatar_private.retention_discovery_scans s on s.actor_id=o.actor_id and s.operation_id=o.operation_id
   where o.state in ('committed','fenced') and o.terminal_at<=clock_timestamp()-interval '5 minutes'
     and ac.generation>o.generation and ac.active_operation_id is distinct from o.operation_id
     and u.avatar_url is distinct from '/api/account/avatar?version='||o.operation_id::text
     and not exists(select 1 from touchline_avatar_private.receipts r where r.actor_id=o.actor_id
       and r.operation_id=o.operation_id and r.revision>=u.avatar_revision)
     and (s.actor_id is null or (s.next_check_at<=clock_timestamp() and (s.lease_until is null or s.lease_until<=clock_timestamp())))
   order by coalesce(s.next_check_at,o.terminal_at+interval '5 minutes'),o.actor_id,o.operation_id limit p_limit
 ) chosen order by actor_id,operation_id loop
   select * into v_user from public.users where id=v_pick.actor_id for update;
   if not found or not exists(select 1 from auth.users where id=v_pick.actor_id and deleted_at is null) then continue; end if;
   select * into v_account from touchline_avatar_private.account_operations where actor_id=v_pick.actor_id for update;
   if not found then continue; end if;
   select * into v_op from touchline_avatar_private.operations
     where actor_id=v_pick.actor_id and operation_id=v_pick.operation_id for update;
   if not found then continue; end if;
   perform 1 from touchline_avatar_private.receipts where actor_id=v_pick.actor_id
     and (operation_id=v_pick.operation_id or revision=v_user.avatar_revision) order by revision for update;
   v_now:=clock_timestamp();
   if v_op.state not in ('committed','fenced') or v_op.terminal_at is null
     or v_op.terminal_at>v_now-interval '5 minutes' or v_account.generation<=v_op.generation
     or v_account.active_operation_id=v_op.operation_id
     or v_user.avatar_url='/api/account/avatar?version='||v_op.operation_id::text
     or exists(select 1 from touchline_avatar_private.receipts where actor_id=v_pick.actor_id
       and operation_id=v_pick.operation_id and revision>=v_user.avatar_revision)
     then continue; end if;
   insert into touchline_avatar_private.retention_discovery_scans(actor_id,operation_id,next_check_at)
     values(v_pick.actor_id,v_pick.operation_id,v_now) on conflict do nothing;
   select * into v_scan from touchline_avatar_private.retention_discovery_scans
     where actor_id=v_pick.actor_id and operation_id=v_pick.operation_id for update;
   if v_scan.next_check_at>v_now or v_scan.lease_until>v_now then continue; end if;
   update touchline_avatar_private.retention_discovery_scans set attempt_id=p_attempt,lease_until=v_now+interval '30 seconds'
     where actor_id=v_pick.actor_id and operation_id=v_pick.operation_id;
   v_rows:=v_rows||jsonb_build_array(jsonb_build_object('actorId',v_pick.actor_id,'operationId',v_pick.operation_id,
     'prefix',v_pick.actor_id::text||'/'||v_pick.operation_id::text||'/',
     'offset',v_scan.object_offset,'limit',25,'attemptId',p_attempt,'expiresAt',v_now+interval '30 seconds'));
 end loop;
 return jsonb_build_object('version',1,'allowed',true,'scans',v_rows);
end $$;

create function touchline_avatar_private.ack_retention_discovery(
 p_project_ref text,p_actor uuid,p_operation uuid,p_attempt uuid,p_expected_offset integer,p_next_offset integer,p_complete boolean
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare v_scan touchline_avatar_private.retention_discovery_scans%rowtype; v_now timestamptz;
begin
 if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy' or auth.uid() is not null
   or p_attempt is null or p_complete is null or p_expected_offset is null or p_next_offset is null
   or p_expected_offset<0 or p_expected_offset%25<>0
   or (p_complete and p_next_offset<>0)
   or (not p_complete and p_next_offset::bigint<>p_expected_offset::bigint+25)
 then return '{"version":1,"acknowledged":false}'::jsonb; end if;
 select * into v_scan from touchline_avatar_private.retention_discovery_scans
   where actor_id=p_actor and operation_id=p_operation for update;
 v_now:=clock_timestamp();
 if not found or v_scan.attempt_id is distinct from p_attempt or v_scan.object_offset<>p_expected_offset
   or v_scan.lease_until is null or v_scan.lease_until<=v_now
 then return '{"version":1,"acknowledged":false}'::jsonb; end if;
 -- ACK only after every key on the page has been durably registered or rejected.
 -- Incomplete traversal yields its lease and goes behind already-due work.
 -- Complete, including empty, restarts from zero in five minutes forever.
 update touchline_avatar_private.retention_discovery_scans set object_offset=p_next_offset,
   next_check_at=case when p_complete then v_now+interval '5 minutes' else v_now end,
   attempt_id=null,lease_until=null where actor_id=p_actor and operation_id=p_operation;
 return '{"version":1,"acknowledged":true,"reconciliationRequired":true}'::jsonb;
end $$;

create function public.touchline_claim_qa_avatar_retention_discovery(p_project_ref text,p_attempt uuid,p_limit integer)
returns jsonb language sql security invoker set search_path='' as $$ select touchline_avatar_private.claim_retention_discovery($1,$2,$3) $$;
create function public.touchline_ack_qa_avatar_retention_discovery(
 p_project_ref text,p_actor uuid,p_operation uuid,p_attempt uuid,p_expected_offset integer,p_next_offset integer,p_complete boolean
) returns jsonb language sql security invoker set search_path='' as $$ select touchline_avatar_private.ack_retention_discovery($1,$2,$3,$4,$5,$6,$7) $$;
revoke all on function touchline_avatar_private.claim_retention_discovery(text,uuid,integer),
 touchline_avatar_private.ack_retention_discovery(text,uuid,uuid,uuid,integer,integer,boolean),
 public.touchline_claim_qa_avatar_retention_discovery(text,uuid,integer),
 public.touchline_ack_qa_avatar_retention_discovery(text,uuid,uuid,uuid,integer,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function touchline_avatar_private.claim_retention_discovery(text,uuid,integer),
 touchline_avatar_private.ack_retention_discovery(text,uuid,uuid,uuid,integer,integer,boolean),
 public.touchline_claim_qa_avatar_retention_discovery(text,uuid,integer),
 public.touchline_ack_qa_avatar_retention_discovery(text,uuid,uuid,uuid,integer,integer,boolean) to service_role;
commit;
