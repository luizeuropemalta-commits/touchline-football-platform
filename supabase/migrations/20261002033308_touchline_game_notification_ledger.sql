-- Dormant bookkeeping/admission only. No claim, transport, scheduler or sender.
-- Tombstones have no FK to device or payload: device deletion cannot erase them.
-- Not a fence over all football/geometry writers. Future delivery MUST reread
-- readiness/kind/deadline and consent under a reviewed claim protocol. Lock order:
-- parents -> enrollment -> delivery, never delivery -> enrollment.
create table public.touchline_game_notification_enrollments (
 user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null, gameweek_id uuid not null,
 generation bigint not null check(generation>0), needs_baseline boolean not null,
 baseline_at timestamptz not null, deadline timestamptz not null,
 lead_seconds integer not null check(lead_seconds between 1 and 86400),
 suppressed boolean not null, subscription jsonb not null, consent_at timestamptz not null,
 primary key(user_id,device_id,gameweek_id)
);
create table public.touchline_game_notification_identities (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 gameweek_id uuid not null, kind text not null check(kind in ('missing_xi','complete_unconfirmed')),
 admitted_at timestamptz not null, unique(user_id,gameweek_id,kind)
);
create table public.touchline_game_notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 identity_id uuid not null references public.touchline_game_notification_identities(id) on delete cascade,
 device_id uuid not null, generation bigint not null check(generation>0),
 subscription jsonb not null, created_at timestamptz not null, expires_at timestamptz not null,
 state text not null default 'queued' check(state in ('queued','cancelled','provider_accepted','uncertain','failed')),
 payload jsonb, lease_token uuid, lease_expires_at timestamptz, attempt_id uuid, attempt_started_at timestamptz,
 unique(identity_id,device_id), check(expires_at>created_at),
 check((lease_token is null)=(lease_expires_at is null)),
 check(lease_expires_at is null or lease_expires_at<=expires_at),
 check((attempt_id is null)=(attempt_started_at is null)),
 check(attempt_started_at is null or (attempt_started_at>=created_at and attempt_started_at<expires_at)),
 check(state not in ('provider_accepted','uncertain','failed') or attempt_id is not null)
);
alter table public.touchline_game_notification_enrollments enable row level security;
alter table public.touchline_game_notification_enrollments force row level security;
alter table public.touchline_game_notification_identities enable row level security;
alter table public.touchline_game_notification_identities force row level security;
alter table public.touchline_game_notification_deliveries enable row level security;
alter table public.touchline_game_notification_deliveries force row level security;
revoke all on public.touchline_game_notification_enrollments,public.touchline_game_notification_identities,public.touchline_game_notification_deliveries from public,anon,authenticated,service_role;
grant select on public.touchline_game_notification_enrollments,public.touchline_game_notification_identities,public.touchline_game_notification_deliveries to service_role;

-- Parent writers already own their row. Never lock another parent here.
create function public.touchline_game_notification_invalidate()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_row jsonb:='{}';new_row jsonb:='{}';e record;owners uuid[];devices uuid[];
begin
 if tg_op<>'INSERT' then old_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then new_row:=to_jsonb(new);end if;
 if tg_table_name='notification_preferences' then
  if tg_op='UPDATE' and jsonb_build_array(old_row->'user_id',old_row->'channels'->'push',old_row->'settings'->'lineupReminders',old_row->'frequency',old_row->'explicit_consent_at',old_row->'quiet_hours')
   =jsonb_build_array(new_row->'user_id',new_row->'channels'->'push',new_row->'settings'->'lineupReminders',new_row->'frequency',new_row->'explicit_consent_at',new_row->'quiet_hours') then return null;end if;
  owners:=array[(old_row->>'user_id')::uuid,(new_row->>'user_id')::uuid];
 elsif tg_table_name='notification_devices' then
  if tg_op='UPDATE' and jsonb_build_array(old_row->'id',old_row->'user_id',old_row->'installation_id',old_row->'permission',old_row->'push_subscription')
   =jsonb_build_array(new_row->'id',new_row->'user_id',new_row->'installation_id',new_row->'permission',new_row->'push_subscription') then return null;end if;
  devices:=array[(old_row->>'id')::uuid,(new_row->>'id')::uuid];
 else raise exception 'GAME_NOTIFICATION_INVALID_TRIGGER';end if;
 for e in select x.* from public.touchline_game_notification_enrollments x
  where x.user_id=any(owners) or x.device_id=any(devices)
  order by x.user_id,x.device_id,x.gameweek_id for update of x
 loop
  update public.touchline_game_notification_enrollments set generation=generation+1,needs_baseline=true,suppressed=true
   where user_id=e.user_id and device_id=e.device_id and gameweek_id=e.gameweek_id;
  update public.touchline_game_notification_deliveries d set state='cancelled',payload=null
   from public.touchline_game_notification_identities i where i.id=d.identity_id and i.user_id=e.user_id
    and i.gameweek_id=e.gameweek_id and d.device_id=e.device_id and d.state='queued' and d.attempt_id is null;
 end loop;
 return null;
end$$;
revoke all on function public.touchline_game_notification_invalidate() from public,anon,authenticated,service_role;
create trigger touchline_game_notification_preferences_epoch after insert or update or delete on public.notification_preferences
 for each row execute function public.touchline_game_notification_invalidate();
create trigger touchline_game_notification_device_epoch after insert or update or delete on public.notification_devices
 for each row execute function public.touchline_game_notification_invalidate();

create function public.touchline_game_notification_admit(p_user_id uuid,p_gameweek_id uuid,p_lead_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pref public.notification_preferences%rowtype;d record;e public.touchline_game_notification_enrollments%rowtype;
 source jsonb;r jsonb;at_time timestamptz;deadline timestamptz;window_start timestamptz;v_kind text;
 logical uuid;eligible uuid[]:='{}';n integer;coach text;
begin
 if p_user_id is null or p_gameweek_id is null or p_lead_seconds is null or p_lead_seconds not between 1 and 86400 then return jsonb_build_object('status','unavailable');end if;
 if not pg_try_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_gameweek_id::text,0)) then return jsonb_build_object('status','unavailable');end if;
 -- NOWAIT avoids cross-parent inversions with both existing match and new epoch triggers.
 -- Protect the FK parent first: account deletion cascades auth.users -> public.users.
 -- Taking public.users first could deadlock against the later FK check on INSERT.
 perform 1 from auth.users where id=p_user_id for key share nowait;
 if not found then return jsonb_build_object('status','unavailable');end if;
 perform 1 from public.users where id=p_user_id for share nowait;
 if not found then return jsonb_build_object('status','unavailable');end if;
 perform 1 from public.touchline_fantasy_gameweeks where id=p_gameweek_id for share nowait;
 if not found then return jsonb_build_object('status','unavailable');end if;
 select * into pref from public.notification_preferences where user_id=p_user_id for share nowait;
 if not found then return jsonb_build_object('status','suppressed');end if;
 if (select count(*) from public.notification_devices where user_id=p_user_id)>50 then return jsonb_build_object('status','unavailable');end if;
 perform 1 from public.notification_devices where user_id=p_user_id order by id for update nowait;
 perform 1 from public.touchline_fantasy_user_gameweeks where user_id=p_user_id and gameweek_id=p_gameweek_id for share nowait;
 perform 1 from public.touchline_fantasy_user_gameweek_selections s join public.touchline_fantasy_user_gameweeks u on u.id=s.user_gameweek_id
  where u.user_id=p_user_id and u.gameweek_id=p_gameweek_id for share of s nowait;
 at_time:=clock_timestamp();
 if (pref.channels @> '{"push":true}') is not true or (pref.settings @> '{"lineupReminders":true}') is not true
  or pref.frequency is distinct from 'realtime' or pref.explicit_consent_at is null or not isfinite(pref.explicit_consent_at)
  or pref.explicit_consent_at>at_time then return jsonb_build_object('status','suppressed');end if;
 source:=public.touchline_fantasy_read_lineup_reminder(p_user_id,p_gameweek_id);r:=source->'read';
 if r->>'status' is distinct from 'complete' then return jsonb_build_object('status','unavailable');end if;
 deadline:=to_timestamp((r->>'effectiveDeadlineMs')::numeric/1000);
 window_start:=deadline-make_interval(secs=>p_lead_seconds);
 if r->'marketEditable' is distinct from 'true'::jsonb or at_time>=deadline
  or r->'userGameweek'->>'state' in ('CONFIRMED','LOCKED','FINAL') then
  update public.touchline_game_notification_deliveries closed_delivery set state='cancelled',payload=null
   from public.touchline_game_notification_identities i where i.id=closed_delivery.identity_id and i.user_id=p_user_id and i.gameweek_id=p_gameweek_id
    and closed_delivery.state='queued' and closed_delivery.attempt_id is null;
  return jsonb_build_object('status','closed');
 end if;
 n:=jsonb_array_length(r->'selections');coach:=r->'userGameweek'->>'selectedCoachId';
 if (r->'userGameweek'<>'null'::jsonb and r->'userGameweek'->>'state' is distinct from 'DRAFT')
  or (coach is not null and coach !~ '^[0-9]{1,16}$') then return jsonb_build_object('status','unavailable');end if;
 if n=11 and coach is not null then v_kind:='complete_unconfirmed';else v_kind:='missing_xi';end if;
 for d in select * from public.notification_devices where user_id=p_user_id order by id loop
  if d.permission is distinct from 'granted' or d.push_subscription is null or d.installation_id is null then continue;end if;
  -- Existing registration schema validates the subscription. Retain exact JSON
  -- binding privately; cryptographic transport parsing remains a later gate.
  select * into e from public.touchline_game_notification_enrollments
   where user_id=p_user_id and device_id=d.id and gameweek_id=p_gameweek_id for update;
  if not found then
   insert into public.touchline_game_notification_enrollments values(p_user_id,d.id,p_gameweek_id,1,false,at_time,deadline,p_lead_seconds,
    at_time>=window_start,d.push_subscription,pref.explicit_consent_at);
   continue; -- First encounter is baseline only, never an immediate notification.
  end if;
  if e.deadline is distinct from deadline or e.lead_seconds<>p_lead_seconds or e.needs_baseline
   or e.subscription is distinct from d.push_subscription or e.consent_at is distinct from pref.explicit_consent_at then
   update public.touchline_game_notification_enrollments set suppressed=true,needs_baseline=true
    where user_id=p_user_id and device_id=d.id and gameweek_id=p_gameweek_id;
   continue; -- Conservative per-round tombstone survives rescheduling/ABA.
  end if;
  if not e.suppressed and e.baseline_at<window_start and at_time>=window_start then eligible:=array_append(eligible,d.id);end if;
 end loop;
 update public.touchline_game_notification_deliveries q set state='cancelled',payload=null
  from public.touchline_game_notification_identities i where q.identity_id=i.id and i.user_id=p_user_id
   and i.gameweek_id=p_gameweek_id and i.kind<>v_kind and q.state='queued' and q.attempt_id is null;
 if cardinality(eligible)=0 then return jsonb_build_object('status','baselined-or-suppressed');end if;
 select id into logical from public.touchline_game_notification_identities where user_id=p_user_id and gameweek_id=p_gameweek_id and kind=v_kind;
 if found then return jsonb_build_object('status','existing','id',logical);end if;
 at_time:=clock_timestamp();if at_time>=deadline then return jsonb_build_object('status','closed');end if;
 insert into public.touchline_game_notification_identities(user_id,gameweek_id,kind,admitted_at) values(p_user_id,p_gameweek_id,v_kind,at_time) returning id into logical;
 for d in select * from public.touchline_game_notification_enrollments where user_id=p_user_id and gameweek_id=p_gameweek_id and device_id=any(eligible) order by device_id loop
  insert into public.touchline_game_notification_deliveries(identity_id,device_id,generation,subscription,created_at,expires_at,payload)
   values(logical,d.device_id,d.generation,d.subscription,at_time,deadline,jsonb_build_object('schemaVersion',1,'kind',v_kind,'gameweekId',p_gameweek_id));
 end loop;
 return jsonb_build_object('status','stored','id',logical,'deliveries',cardinality(eligible));
exception when lock_not_available then return jsonb_build_object('status','unavailable');
end$$;
revoke all on function public.touchline_game_notification_admit(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.touchline_game_notification_admit(uuid,uuid,integer) to service_role;
