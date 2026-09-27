-- Runner owns transaction including history. No HTTP, scheduler or sender.
-- Reservation is a single opportunity to attempt transport, NOT delivery proof.
-- A lost reservation response must never cause a retry or a send.
alter table public.touchline_match_push_outbox
  add column attempt_id uuid,
  add column attempt_started_at timestamptz,
  add constraint touchline_match_push_attempt_pair check (
    (attempt_id is null and attempt_started_at is null)
    or (attempt_id is not null and attempt_started_at is not null and isfinite(attempt_started_at))
  );

create function public.touchline_guard_match_push_attempt()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if old.attempt_id is not null and
    row(new.attempt_id,new.attempt_started_at) is distinct from row(old.attempt_id,old.attempt_started_at) then
    raise exception using errcode = '23514', message = 'PUSH_ATTEMPT_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function public.touchline_guard_match_push_attempt() from public,anon,authenticated,service_role;
create trigger touchline_match_push_attempt_guard before update on public.touchline_match_push_outbox
  for each row execute function public.touchline_guard_match_push_attempt();

create function public.touchline_reserve_match_push_attempt(p_id uuid,p_lease_token uuid,p_attempt_id uuid)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_now timestamptz; v_count integer;
begin
  if p_id is null or p_lease_token is null or p_attempt_id is null then return false; end if;
  perform 1 from public.touchline_match_push_outbox where id=p_id for update;
  v_now := clock_timestamp();
  update public.touchline_match_push_outbox set attempt_id=p_attempt_id,attempt_started_at=v_now
    where id=p_id and state='claimed' and lease_token=p_lease_token
      and isfinite(lease_until) and lease_until>v_now and isfinite(expires_at) and expires_at>v_now
      and delivery_kind in ('initial','revision')
      and subscription_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and attempt_id is null and attempt_started_at is null;
  get diagnostics v_count = row_count;
  return v_count=1; -- Same nonce replay is false, not renewed permission.
end;
$$;

-- Intentional protocol tightening: old callers may only cancel before any
-- attempt reservation. A losing invocation cannot complete the winner's row.
create or replace function public.touchline_finish_match_push(p_id uuid,p_lease_token uuid,p_state text)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_now timestamptz; v_count integer;
begin
  if p_id is null or p_lease_token is null or p_state is distinct from 'cancelled' then return false; end if;
  perform 1 from public.touchline_match_push_outbox where id=p_id for update;
  v_now := clock_timestamp();
  update public.touchline_match_push_outbox
    set state='cancelled',lease_token=null,lease_until=null,completed_at=v_now
    where id=p_id and state='claimed' and lease_token=p_lease_token
      and isfinite(lease_until) and lease_until>v_now
      and attempt_id is null and attempt_started_at is null;
  get diagnostics v_count = row_count;
  return v_count=1;
end;
$$;

create function public.touchline_finish_match_push_attempt(p_id uuid,p_lease_token uuid,p_attempt_id uuid,p_state text)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_now timestamptz; v_count integer;
begin
  if p_id is null or p_lease_token is null or p_attempt_id is null or p_state is null
    or p_state not in ('provider_accepted','cancelled','uncertain','failed') then return false; end if;
  perform 1 from public.touchline_match_push_outbox where id=p_id for update;
  v_now := clock_timestamp();
  update public.touchline_match_push_outbox
    set state=p_state,lease_token=null,lease_until=null,completed_at=v_now
    where id=p_id and state='claimed' and lease_token=p_lease_token
      and isfinite(lease_until) and lease_until>v_now
      and attempt_id=p_attempt_id and attempt_started_at is not null;
  get diagnostics v_count = row_count;
  return v_count=1;
end;
$$;
revoke all on function public.touchline_reserve_match_push_attempt(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.touchline_finish_match_push(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.touchline_finish_match_push_attempt(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.touchline_reserve_match_push_attempt(uuid,uuid,uuid) to service_role;
grant execute on function public.touchline_finish_match_push(uuid,uuid,text) to service_role;
grant execute on function public.touchline_finish_match_push_attempt(uuid,uuid,uuid,text) to service_role;
-- Direct service UPDATE remains trusted. Final source/recipient checks and
-- confirmed reservation receipt are still required before the one HTTP attempt.
