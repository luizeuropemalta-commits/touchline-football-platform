-- No transport. A queued row with a lease is claimed; a consumed nonce never
-- becomes claimable again, including when reserve/finish responses are lost.
create function public.touchline_game_notification_delivery_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if row(new.id,new.identity_id,new.device_id,new.generation,new.subscription,new.created_at,new.expires_at)
  is distinct from row(old.id,old.identity_id,old.device_id,old.generation,old.subscription,old.created_at,old.expires_at)
  or (old.attempt_id is not null and row(new.attempt_id,new.attempt_started_at) is distinct from row(old.attempt_id,old.attempt_started_at))
  or (old.state<>'queued' and new.state is distinct from old.state) then raise exception 'GAME_DELIVERY_IDENTITY_IMMUTABLE';end if;
 return new;
end$$;
revoke all on function public.touchline_game_notification_delivery_guard() from public,anon,authenticated,service_role;
create trigger touchline_game_notification_delivery_guard before update on public.touchline_game_notification_deliveries
 for each row execute function public.touchline_game_notification_delivery_guard();

-- Owner-only helper. Every parent is acquired before enrollment and delivery.
-- Source rows may change after transaction end: caller must revalidate before
-- transport and cannot infer a global football-source fence from these locks.
create function public.touchline_game_notification_lock_current(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare i public.touchline_game_notification_identities%rowtype;
 q public.touchline_game_notification_deliveries%rowtype;
 e public.touchline_game_notification_enrollments%rowtype;
 pref public.notification_preferences%rowtype;device public.notification_devices%rowtype;
 r jsonb;v_now timestamptz;deadline timestamptz;v_kind text;valid boolean;missing_parent boolean:=false;
begin
 select d.* into q from public.touchline_game_notification_deliveries d where d.id=p_id;
 if not found then return false;end if;
 select * into i from public.touchline_game_notification_identities where id=q.identity_id;
 if not found then return false;end if;
 if not pg_try_advisory_xact_lock(hashtextextended(i.user_id::text||':'||i.gameweek_id::text,0)) then return false;end if;
 perform 1 from auth.users where id=i.user_id for key share nowait;missing_parent:=not found;
 if not missing_parent then
  perform 1 from public.users where id=i.user_id for share nowait;missing_parent:=not found;
 end if;
 if not missing_parent then
  perform 1 from public.touchline_fantasy_gameweeks where id=i.gameweek_id for share nowait;missing_parent:=not found;
 end if;
 if missing_parent then
  -- A confirmed absent parent cannot become sendable by retrying this delivery.
  -- Keep identity/dedupe history and never rewrite a consumed attempt. NOWAIT
  -- distinguishes contention from absence: any lock_not_available unwinds this
  -- function's subtransaction without terminalizing a busy, otherwise valid row.
  perform 1 from public.touchline_game_notification_deliveries where id=p_id for update nowait;
  update public.touchline_game_notification_deliveries
   set state='cancelled',payload=null,lease_token=null,lease_expires_at=null
   where id=p_id and state='queued' and attempt_id is null and attempt_started_at is null;
  return false;
 end if;
 select * into pref from public.notification_preferences where user_id=i.user_id for share nowait;
 select * into device from public.notification_devices where id=q.device_id for update nowait;
 perform 1 from public.touchline_fantasy_user_gameweeks where user_id=i.user_id and gameweek_id=i.gameweek_id for share nowait;
 perform 1 from public.touchline_fantasy_user_gameweek_selections s join public.touchline_fantasy_user_gameweeks u on u.id=s.user_gameweek_id
  where u.user_id=i.user_id and u.gameweek_id=i.gameweek_id for share of s nowait;
 select * into e from public.touchline_game_notification_enrollments where user_id=i.user_id and device_id=q.device_id and gameweek_id=i.gameweek_id for update nowait;
 select * into q from public.touchline_game_notification_deliveries where id=p_id for update nowait;
 if not found or q.state<>'queued' or q.attempt_id is not null then return false;end if;
 v_now:=clock_timestamp();
 r:=public.touchline_fantasy_read_lineup_reminder(i.user_id,i.gameweek_id)->'read';
 valid:=r->>'status'='complete';
 if valid then
  deadline:=to_timestamp((r->>'effectiveDeadlineMs')::numeric/1000);
  v_kind:=case when jsonb_array_length(r->'selections')=11 and r->'userGameweek'->>'selectedCoachId' is not null then 'complete_unconfirmed' else 'missing_xi' end;
  valid:=r->'marketEditable'='true'::jsonb
   and (r->'userGameweek'='null'::jsonb or r->'userGameweek'->>'state'='DRAFT')
   and (r->'userGameweek'->>'selectedCoachId' is null or r->'userGameweek'->>'selectedCoachId' ~ '^[0-9]{1,16}$')
   and v_kind=i.kind and deadline=e.deadline and q.expires_at<=deadline;
 end if;
 v_now:=clock_timestamp();
 valid:=valid and q.expires_at>v_now and pref.user_id=i.user_id and device.user_id=i.user_id
  and pref.channels @> '{"push":true}'::jsonb and pref.settings @> '{"lineupReminders":true}'::jsonb
  and pref.frequency='realtime' and pref.explicit_consent_at is not null and isfinite(pref.explicit_consent_at)
  and pref.explicit_consent_at<=v_now and pref.explicit_consent_at=e.consent_at
  and device.permission='granted' and device.installation_id is not null
  and device.push_subscription=q.subscription and e.subscription=q.subscription
  and e.generation=q.generation and not e.needs_baseline and not e.suppressed;
 if valid is not true then
  update public.touchline_game_notification_deliveries set state='cancelled',payload=null,lease_token=null,lease_expires_at=null where id=p_id;
  return false;
 end if;
 return true;
exception when lock_not_available then return false;
end$$;
revoke all on function public.touchline_game_notification_lock_current(uuid) from public,anon,authenticated,service_role;

create function public.touchline_game_notification_claim(p_id uuid,p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.touchline_game_notification_deliveries%rowtype;i public.touchline_game_notification_identities%rowtype;v_now timestamptz;
begin
 if p_id is null or p_lease_seconds is null or p_lease_seconds not between 1 and 60 then return null;end if;
 if not public.touchline_game_notification_lock_current(p_id) then return null;end if;
 select * into q from public.touchline_game_notification_deliveries where id=p_id;
 v_now:=clock_timestamp();
 if q.attempt_id is not null or q.expires_at<=v_now or (q.lease_token is not null and q.lease_expires_at>v_now) then return null;end if;
 update public.touchline_game_notification_deliveries set lease_token=gen_random_uuid(),lease_expires_at=least(expires_at,v_now+make_interval(secs=>p_lease_seconds)) where id=p_id returning * into q;
 select * into i from public.touchline_game_notification_identities where id=q.identity_id;
 return jsonb_build_object('id',q.id,'identityId',i.id,'userId',i.user_id,'gameweekId',i.gameweek_id,'kind',i.kind,
  'deviceId',q.device_id,'generation',q.generation::text,'subscription',q.subscription,'expiresAt',q.expires_at,'leaseToken',q.lease_token,'leaseUntil',q.lease_expires_at,'leaseExpiresAt',q.lease_expires_at);
end$$;

create function public.touchline_game_notification_reserve(p_id uuid,p_lease_token uuid,p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_now timestamptz;n integer;
begin
 if p_id is null or p_lease_token is null or p_attempt_id is null then return false;end if;
 if not public.touchline_game_notification_lock_current(p_id) then return false;end if;
 v_now:=clock_timestamp();
 update public.touchline_game_notification_deliveries set attempt_id=p_attempt_id,attempt_started_at=v_now
 where id=p_id and state='queued' and attempt_id is null and lease_token=p_lease_token and lease_expires_at>v_now and expires_at>v_now;
 get diagnostics n=row_count;return n=1;
end$$;

create function public.touchline_game_notification_finish(p_id uuid,p_lease_token uuid,p_attempt_id uuid,p_state text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_id is null or p_lease_token is null or p_state is null or p_state not in ('provider_accepted','cancelled','uncertain','failed') then return false;end if;
 if p_attempt_id is null and p_state<>'cancelled' then return false;end if;
 -- Terminal acknowledgment only; no transport permission and no parent locks after this row.
 perform 1 from public.touchline_game_notification_deliveries where id=p_id for update nowait;
 update public.touchline_game_notification_deliveries set state=p_state,payload=null,lease_token=null,lease_expires_at=null
 where id=p_id and state='queued' and lease_token=p_lease_token
  and ((p_attempt_id is null and attempt_id is null and attempt_started_at is null)
   or (p_attempt_id is not null and attempt_id=p_attempt_id and attempt_started_at is not null));
 get diagnostics n=row_count;return n=1;
exception when lock_not_available then return false;
end$$;

create function public.touchline_game_notification_expire(p_limit integer)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_limit is null or p_limit not between 1 and 100 then return 0;end if;
 with expired as (select id from public.touchline_game_notification_deliveries where state='queued' and expires_at<=clock_timestamp()
  order by expires_at,id for update skip locked limit p_limit)
 update public.touchline_game_notification_deliveries d set state=case when attempt_id is null then 'cancelled' else 'uncertain' end,
  payload=null,lease_token=null,lease_expires_at=null from expired e where d.id=e.id;
 get diagnostics n=row_count;return n;
end$$;
revoke all on function public.touchline_game_notification_claim(uuid,integer),public.touchline_game_notification_reserve(uuid,uuid,uuid),public.touchline_game_notification_finish(uuid,uuid,uuid,text),public.touchline_game_notification_expire(integer) from public,anon,authenticated;
grant execute on function public.touchline_game_notification_claim(uuid,integer),public.touchline_game_notification_reserve(uuid,uuid,uuid),public.touchline_game_notification_finish(uuid,uuid,uuid,text),public.touchline_game_notification_expire(integer) to service_role;
