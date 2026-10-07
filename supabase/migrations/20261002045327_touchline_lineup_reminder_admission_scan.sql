-- Dormant bounded discovery/admission. No claim, send, provider or scheduler.
-- A cursor is not a source authorization: every due pair calls the actual
-- admission authority again. Lost HTTP receipts are safe to resume from DB state.
create table public.touchline_lineup_reminder_scan_state (
 competition_id uuid not null, season_id uuid not null,
 lead_seconds integer not null check(lead_seconds between 1 and 86400),
 sweep bigint not null default 1 check(sweep>0),
 last_gameweek_id uuid, last_user_id uuid,
 last_sweep_completed_at timestamptz, updated_at timestamptz not null,
 primary key(competition_id,season_id),
 check((last_gameweek_id is null)=(last_user_id is null))
);
create table public.touchline_lineup_reminder_admission_work (
 user_id uuid not null references auth.users(id) on delete cascade,
 gameweek_id uuid not null, competition_id uuid not null, season_id uuid not null,
 discovered_at timestamptz not null, next_attempt_at timestamptz not null,
 last_attempt_at timestamptz, attempts bigint not null default 0 check(attempts>=0),
 last_result text check(last_result in ('unavailable','suppressed','closed','baselined-or-suppressed','existing','stored')),
 closed boolean not null default false,
 primary key(user_id,gameweek_id)
);
create index touchline_lineup_reminder_work_due_idx
 on public.touchline_lineup_reminder_admission_work(competition_id,season_id,next_attempt_at,gameweek_id,user_id)
 where not closed;
alter table public.touchline_lineup_reminder_scan_state enable row level security;
alter table public.touchline_lineup_reminder_scan_state force row level security;
alter table public.touchline_lineup_reminder_admission_work enable row level security;
alter table public.touchline_lineup_reminder_admission_work force row level security;
revoke all on public.touchline_lineup_reminder_scan_state,public.touchline_lineup_reminder_admission_work from public,anon,authenticated,service_role;
grant select on public.touchline_lineup_reminder_scan_state,public.touchline_lineup_reminder_admission_work to service_role;

create function public.touchline_lineup_reminder_admission_scan(
 p_competition_id uuid,p_season_id uuid,p_lead_seconds integer,p_page_size integer,p_retry_seconds integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 cursor_row public.touchline_lineup_reminder_scan_state%rowtype;
 pair record;result jsonb;result_status text;v_now timestamptz;
 scanned integer:=0;inserted integer:=0;processed integer:=0;deferred integer:=0;
 stored integer:=0;closed_count integer:=0;discovery_busy integer:=0;n integer;
 wrapped boolean:=false;blocked_discovery boolean:=false;close_pair boolean;
begin
 if p_competition_id is null or p_season_id is null
  or p_lead_seconds is null or p_lead_seconds not between 1 and 86400
  or p_page_size is null or p_page_size not between 1 and 50
  or p_retry_seconds is null or p_retry_seconds not between 1 and 3600 then
  return jsonb_build_object('status','unconfigured');
 end if;
 -- Serialize this scope before any work row or admission parent. Other public
 -- writers do not acquire this lock. Never wait for their parent locks below.
 if not pg_try_advisory_xact_lock(hashtextextended('lineup-reminder-scan:'||p_competition_id::text||':'||p_season_id::text,0)) then
  return jsonb_build_object('status','busy');
 end if;
 if (select count(*) from public.touchline_fantasy_configs where competition_id=p_competition_id and season_id=p_season_id and status='active')<>1 then
  return jsonb_build_object('status','unavailable');
 end if;
 v_now:=clock_timestamp();
 insert into public.touchline_lineup_reminder_scan_state(competition_id,season_id,lead_seconds,updated_at)
 values(p_competition_id,p_season_id,p_lead_seconds,v_now) on conflict do nothing;
 select * into cursor_row from public.touchline_lineup_reminder_scan_state
 where competition_id=p_competition_id and season_id=p_season_id for update nowait;
 if cursor_row.lead_seconds<>p_lead_seconds then return jsonb_build_object('status','policy-mismatch');end if;

 -- Include all open-market users, not only the notification lead window or
 -- existing teams. Baseline creation still happens ONLY in admit().
 for pair in
  with windows as materialized (
   select * from public.touchline_fantasy_market_window_projection(v_now)
   where competition_id=p_competition_id and season_id=p_season_id
    and state='MARKET_OPEN' and locks_at>v_now and isfinite(locks_at)
  )
  select g.id as gameweek_id,p.user_id
  from public.touchline_fantasy_gameweeks g join windows w
   on w.round_id=g.round_id and w.competition_id=g.competition_id and w.season_id=g.season_id
  cross join public.notification_preferences p
  join public.users u on u.id=p.user_id join auth.users a on a.id=p.user_id
  where g.state<>'SETTLED' and p.channels @> '{"push":true}'::jsonb
   and p.settings @> '{"lineupReminders":true}'::jsonb and p.frequency='realtime'
   and p.explicit_consent_at is not null and isfinite(p.explicit_consent_at) and p.explicit_consent_at<=v_now
   and exists(select 1 from public.notification_devices d where d.user_id=p.user_id
    and d.permission='granted' and d.installation_id is not null and d.push_subscription is not null)
   and (cursor_row.last_gameweek_id is null or (g.id,p.user_id)>(cursor_row.last_gameweek_id,cursor_row.last_user_id))
  order by g.id,p.user_id limit p_page_size
 loop
  -- The work FK targets auth.users. Acquire that parent BEFORE an insertion;
  -- a concurrent delete must not form a parent/work inversion. A busy parent
  -- stops cursor advancement at that pair, visibly, without losing it.
  begin
   perform 1 from auth.users where id=pair.user_id for key share nowait;
   if found then
    insert into public.touchline_lineup_reminder_admission_work
     (user_id,gameweek_id,competition_id,season_id,discovered_at,next_attempt_at)
    values(pair.user_id,pair.gameweek_id,p_competition_id,p_season_id,v_now,v_now)
    on conflict(user_id,gameweek_id) do nothing;
    get diagnostics n=row_count;inserted:=inserted+n;
   end if;
  exception when lock_not_available then
   blocked_discovery:=true;discovery_busy:=discovery_busy+1;
  end;
  if blocked_discovery then exit;end if;
  scanned:=scanned+1;
  cursor_row.last_gameweek_id:=pair.gameweek_id;cursor_row.last_user_id:=pair.user_id;
 end loop;
 if scanned<p_page_size and not blocked_discovery then
  cursor_row.last_gameweek_id:=null;cursor_row.last_user_id:=null;
  cursor_row.sweep:=cursor_row.sweep+1;wrapped:=true;
 end if;
 update public.touchline_lineup_reminder_scan_state
 set last_gameweek_id=cursor_row.last_gameweek_id,last_user_id=cursor_row.last_user_id,
  sweep=cursor_row.sweep,updated_at=clock_timestamp(),
  last_sweep_completed_at=case when wrapped then clock_timestamp() else last_sweep_completed_at end
 where competition_id=p_competition_id and season_id=p_season_id;

 -- Work ordering is independent from discovery. A temporarily unavailable
 -- pair gets a future due time; it cannot remain the head of every invocation.
 for pair in select w.* from public.touchline_lineup_reminder_admission_work w
  where w.competition_id=p_competition_id and w.season_id=p_season_id
   and not w.closed and w.next_attempt_at<=clock_timestamp()
  order by w.next_attempt_at,w.gameweek_id,w.user_id for update skip locked limit p_page_size
 loop
  close_pair:=false;
  if not exists(select 1 from public.touchline_fantasy_gameweeks g
    where g.id=pair.gameweek_id and g.competition_id=p_competition_id and g.season_id=p_season_id) then
   result_status:='closed';close_pair:=true;
  else
   -- This authority acquires every parent NOWAIT before enrollment/delivery.
   -- Unknown results/errors must rollback this whole scan, never advance as success.
   result:=public.touchline_game_notification_admit(pair.user_id,pair.gameweek_id,p_lead_seconds);
   result_status:=result->>'status';
   if result_status is null or result_status not in ('unavailable','suppressed','closed','baselined-or-suppressed','existing','stored') then
    raise exception 'LINEUP_REMINDER_ADMISSION_RECEIPT_INVALID';
   end if;
   -- A confirmed team can still be edited while its market is open. Its
   -- admission is closed for now, not terminal work for the whole round.
   if result_status='closed' then
    close_pair:=not exists(
     select 1 from public.touchline_fantasy_gameweeks g
     join public.touchline_fantasy_market_window_projection(clock_timestamp()) p
      on p.round_id=g.round_id and p.competition_id=g.competition_id and p.season_id=g.season_id
     where g.id=pair.gameweek_id and g.state<>'SETTLED'
      and p.state='MARKET_OPEN' and p.locks_at>clock_timestamp());
   end if;
  end if;
  v_now:=clock_timestamp();
  update public.touchline_lineup_reminder_admission_work
   set attempts=attempts+1,last_attempt_at=v_now,last_result=result_status,
    next_attempt_at=v_now+make_interval(secs=>p_retry_seconds),closed=close_pair
   where user_id=pair.user_id and gameweek_id=pair.gameweek_id;
  processed:=processed+1;
  if result_status='unavailable' then deferred:=deferred+1;end if;
  if result_status='stored' then stored:=stored+1;end if;
  if result_status='closed' then closed_count:=closed_count+1;end if;
 end loop;
 return jsonb_build_object('status',case when deferred>0 or discovery_busy>0 then 'partial' else 'complete' end,
  'scanned',scanned,'inserted',inserted,'processed',processed,'deferred',deferred,'discoveryBusy',discovery_busy,
  'stored',stored,'closed',closed_count,'sweep',cursor_row.sweep::text,'sweepCompleted',wrapped);
exception when lock_not_available then return jsonb_build_object('status','busy');
end$$;
revoke all on function public.touchline_lineup_reminder_admission_scan(uuid,uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.touchline_lineup_reminder_admission_scan(uuid,uuid,integer,integer,integer) to service_role;
