begin;
set local lock_timeout='5s';

-- Test-only orders. Service role owns mutations; clients never choose amount,
-- previous paid plan, provider session, timestamps or season boundaries.
create table public.touchline_club_season_test_orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete restrict,
 season_id uuid not null references public.football_seasons(id) on delete restrict,
 plan text not null check(plan in ('standard','master','vip')),
 previous_paid_plan text check(previous_paid_plan in ('standard','master','vip')),
 amount_minor integer not null check(amount_minor>0),
 currency text not null default 'eur' check(currency='eur'),
 provider_account text not null default 'acct_1Tl6XQH0T0OdBC6s' check(provider_account='acct_1Tl6XQH0T0OdBC6s'),
 state text not null default 'pending' check(state in ('pending','paid','expired','review','refunded')),
 session_id text unique check(session_id ~ '^cs_test_[A-Za-z0-9]+$'),
 created_at timestamptz not null,
 first_attempt_at timestamptz not null,
 checkout_expires_at timestamptz not null,
 season_starts_at timestamptz not null,
 season_ends_at timestamptz not null,
 paid_at timestamptz,
 check(first_attempt_at=created_at),
 check(checkout_expires_at>=created_at+interval '30 minutes' and checkout_expires_at<=created_at+interval '24 hours'),
 check(created_at>=season_starts_at and checkout_expires_at<=season_ends_at),
 check(amount_minor=(case plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 end)
   -(case previous_paid_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end))
);
create unique index touchline_club_season_test_one_pending
 on public.touchline_club_season_test_orders(user_id,season_id) where state in ('pending','review');
create index touchline_club_season_test_paid_owner
 on public.touchline_club_season_test_orders(user_id,season_id,paid_at desc) where state='paid';
alter table public.touchline_club_season_test_orders enable row level security;
revoke all on public.touchline_club_season_test_orders from public,anon,authenticated;
grant select,insert,update on public.touchline_club_season_test_orders to service_role;

create function public.touchline_club_prepare_season_test_order(p_user_id uuid,p_plan text)
returns public.touchline_club_season_test_orders
language plpgsql security invoker set search_path='' as $$
declare
 v_season public.football_seasons%rowtype;
 v_order public.touchline_club_season_test_orders%rowtype;
 v_previous text;
 v_amount integer;
 v_now timestamptz:=date_trunc('second',clock_timestamp());
 v_end timestamptz;
begin
 if p_plan is null or p_plan not in ('standard','master','vip') then raise exception 'SEASON_PLAN_INVALID'; end if;
 -- Match collection initialization before taking the owner row: legacy
 -- operations can hold ownership locks while waiting for that same row.
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||p_user_id::text,0));
 -- Serialize orders without blocking the FK KEY SHARE used by collection
 -- initialization while it owns the subscription/season advisory locks.
 perform 1 from public.users where id=p_user_id for no key update;
 if not found then raise exception 'SEASON_USER_REQUIRED'; end if;
 select s.* into strict v_season from public.football_seasons s
 join public.touchline_fantasy_configs c on c.season_id=s.id
 where c.competition_key='england' and c.status='active';
 v_end:=((v_season.ends_at+1)::timestamp at time zone 'UTC')-interval '1 millisecond';
 select * into v_order from public.touchline_club_season_test_orders
 where user_id=p_user_id and season_id=v_season.id and state in ('pending','review') for update;
 if found then
   -- Never expire an uncertain request locally: provider reconciliation must
   -- prove it unpaid/expired before another order can be created.
   if v_order.plan<>p_plan then raise exception 'SEASON_ORDER_IN_PROGRESS'; end if;
   return v_order;
 end if;
 if v_season.starts_at is null or v_end is null
   or v_now<(v_season.starts_at::timestamp at time zone 'UTC')
   or v_end-v_now<interval '31 minutes' then raise exception 'SEASON_WINDOW_INVALID'; end if;
 select plan into v_previous from public.touchline_club_season_test_orders
 where user_id=p_user_id and season_id=v_season.id and state='paid'
 order by amount_minor+(case previous_paid_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end) desc
 limit 1;
 v_amount:=(case p_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 end)
  -(case v_previous when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end);
 if v_amount<=0 then raise exception 'SEASON_PAID_UPGRADE_REQUIRED'; end if;
 insert into public.touchline_club_season_test_orders
  (user_id,season_id,plan,previous_paid_plan,amount_minor,created_at,first_attempt_at,checkout_expires_at,season_starts_at,season_ends_at)
 values(p_user_id,v_season.id,p_plan,v_previous,v_amount,v_now,v_now,
   least(v_now+interval '1 hour',date_trunc('second',v_end)),v_season.starts_at::timestamp at time zone 'UTC',v_end)
 returning * into v_order;
 return v_order;
end $$;

create function public.touchline_club_attach_season_test_session(p_user_id uuid,p_order_id uuid,p_session_id text)
returns public.touchline_club_season_test_orders
language plpgsql security invoker set search_path='' as $$
declare v_order public.touchline_club_season_test_orders%rowtype;
begin
 if p_session_id is null or p_session_id !~ '^cs_test_[A-Za-z0-9]+$' then raise exception 'SEASON_SESSION_INVALID'; end if;
 select * into v_order from public.touchline_club_season_test_orders
 where id=p_order_id and user_id=p_user_id for update;
 if not found then raise exception 'SEASON_ORDER_NOT_FOUND'; end if;
 if v_order.session_id is not null then
  if v_order.session_id<>p_session_id then raise exception 'SEASON_SESSION_CONFLICT'; end if;
  return v_order;
 end if;
 if v_order.state<>'pending' then raise exception 'SEASON_ORDER_NOT_PENDING'; end if;
 update public.touchline_club_season_test_orders set session_id=p_session_id
 where id=v_order.id returning * into v_order;
 return v_order;
end $$;
revoke all on function public.touchline_club_prepare_season_test_order(uuid,text) from public,anon,authenticated;
revoke all on function public.touchline_club_attach_season_test_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.touchline_club_prepare_season_test_order(uuid,text) to service_role;
grant execute on function public.touchline_club_attach_season_test_session(uuid,uuid,text) to service_role;
commit;
