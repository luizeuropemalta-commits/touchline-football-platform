-- Forward preparation for seasonal TEST/LIVE separation. Live remains disabled.
-- Retain historical TEST table names, receipts, timestamps and RPC signatures.
-- No Live account, price, credential or enabled Live profile is provisioned here.
begin;
set local lock_timeout='250ms';

create schema touchline_payments_private;
revoke all on schema touchline_payments_private from public,anon,authenticated,service_role;
grant usage on schema touchline_payments_private to service_role;

-- This is operator-owned target configuration, never a request parameter or
-- browser flag. QA is TEST even if a caller supplies a Live profile. Production
-- provisioning must explicitly install its own project reference and mode.
create table touchline_payments_private.configuration (
 singleton boolean primary key default true check(singleton),
 deployment_target text not null default 'qa',
 project_ref text not null default 'xgxbwqxjssxxuihuwmgy' check(project_ref ~ '^[a-z]{20}$'),
 allowed_mode text not null default 'test' check(allowed_mode in ('test','live')),
 live_enabled boolean not null default false,
 check((deployment_target='qa' and project_ref='xgxbwqxjssxxuihuwmgy' and allowed_mode='test' and not live_enabled)
    or (deployment_target='production' and project_ref<>'xgxbwqxjssxxuihuwmgy' and allowed_mode='live'))
);
insert into touchline_payments_private.configuration(singleton) values(true);
alter table touchline_payments_private.configuration enable row level security;
revoke all on touchline_payments_private.configuration from public,anon,authenticated,service_role;
grant select on touchline_payments_private.configuration to service_role;

create table touchline_payments_private.profiles (
 id text primary key check(id ~ '^[a-z][a-z0-9-]{2,79}$'),
 payment_mode text not null check(payment_mode in ('test','live')),
 provider_account text not null check(provider_account ~ '^acct_[A-Za-z0-9]+$'),
 catalogue_version text not null check(catalogue_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
 return_origin text not null check(return_origin ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
  and return_origin ~ '[.]' and return_origin !~ '[.][.]'
  -- A numeric final host label also covers shortened/hex/octal IPv4 forms.
  and return_origin !~ '[.]([0-9]+|0x[0-9a-f]+)$'),
 standard_product_id text not null check(standard_product_id ~ '^prod_[A-Za-z0-9]+$'),
 standard_price_id text not null check(standard_price_id ~ '^price_[A-Za-z0-9]+$'),
 master_product_id text not null check(master_product_id ~ '^prod_[A-Za-z0-9]+$'),
 master_price_id text not null check(master_price_id ~ '^price_[A-Za-z0-9]+$'),
 vip_product_id text not null check(vip_product_id ~ '^prod_[A-Za-z0-9]+$'),
 vip_price_id text not null check(vip_price_id ~ '^price_[A-Za-z0-9]+$'),
 create_enabled boolean not null default false,
 reconcile_enabled boolean not null default false,
 check(not create_enabled or reconcile_enabled),
 unique(payment_mode,provider_account,catalogue_version),
 check(standard_product_id<>master_product_id and standard_product_id<>vip_product_id and master_product_id<>vip_product_id),
 check(standard_price_id<>master_price_id and standard_price_id<>vip_price_id and master_price_id<>vip_price_id),
 check(payment_mode<>'test' or (id='club-season-test-v1' and provider_account='acct_1Tl6XQH0T0OdBC6s'
  and catalogue_version='test-20261028' and return_origin='https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app'
  and standard_product_id='prod_VWfOj7xUoHtTzf' and standard_price_id='price_1UVc3eH0T0OdBC6sejXIyxSA'
  and master_product_id='prod_VWfPhe2OKyhU2B' and master_price_id='price_1UVc4rH0T0OdBC6sTZadG7qv'
  and vip_product_id='prod_VWfRYf4MYKPBLM' and vip_price_id='price_1UVc6EH0T0OdBC6sXm0WRqIz')),
 check(payment_mode<>'live' or (id<>'club-season-test-v1' and provider_account<>'acct_1Tl6XQH0T0OdBC6s'
  and return_origin<>'https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app'))
);
insert into touchline_payments_private.profiles values(
 'club-season-test-v1','test','acct_1Tl6XQH0T0OdBC6s','test-20261028',
 'https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app',
 'prod_VWfOj7xUoHtTzf','price_1UVc3eH0T0OdBC6sejXIyxSA',
 'prod_VWfPhe2OKyhU2B','price_1UVc4rH0T0OdBC6sTZadG7qv',
 'prod_VWfRYf4MYKPBLM','price_1UVc6EH0T0OdBC6sXm0WRqIz',true,true);
alter table touchline_payments_private.profiles enable row level security;
revoke all on touchline_payments_private.profiles from public,anon,authenticated,service_role;
grant select on touchline_payments_private.profiles to service_role;

create function touchline_payments_private.guard_profile_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-array['create_enabled','reconcile_enabled']) is distinct from
    (to_jsonb(old)-array['create_enabled','reconcile_enabled']) then raise exception 'SEASON_PROFILE_IMMUTABLE'; end if;
 return new;
end $$;
create trigger touchline_season_profile_immutable before update on touchline_payments_private.profiles
 for each row execute function touchline_payments_private.guard_profile_snapshot();
revoke all on function touchline_payments_private.guard_profile_snapshot() from public,anon,authenticated,service_role;

-- Definer is private and service-only, solely so gate rows can be held FOR SHARE
-- without granting service_role permission to change the configuration itself.
create function touchline_payments_private.require_profile(p_profile_id text,p_operation text)
returns touchline_payments_private.profiles language plpgsql security definer set search_path='' as $$
declare p touchline_payments_private.profiles%rowtype; cfg touchline_payments_private.configuration%rowtype;
begin
 if p_operation is null or p_operation not in ('create','reconcile') then raise exception 'SEASON_PROFILE_UNAVAILABLE'; end if;
 select * into strict cfg from touchline_payments_private.configuration where singleton for share;
 select * into p from touchline_payments_private.profiles where id=p_profile_id for share;
 if not found or p.payment_mode is distinct from cfg.allowed_mode
  or (p.payment_mode='live' and (cfg.deployment_target<>'production' or not cfg.live_enabled
    or cfg.project_ref='xgxbwqxjssxxuihuwmgy'))
  or (p_operation='create' and (not p.create_enabled or not p.reconcile_enabled))
  or (p_operation='reconcile' and not p.reconcile_enabled) then raise exception 'SEASON_PROFILE_UNAVAILABLE'; end if;
 return p;
exception when no_data_found then raise exception 'SEASON_PROFILE_UNAVAILABLE';
end $$;
revoke all on function touchline_payments_private.require_profile(text,text) from public,anon,authenticated;
grant execute on function touchline_payments_private.require_profile(text,text) to service_role;

alter table public.touchline_club_season_test_orders
 add column payment_mode text,
 add column payment_profile_id text references touchline_payments_private.profiles(id) on delete restrict,
 add column catalogue_version text,
 add column product_id text,
 add column price_id text,
 add column return_origin text;
-- Only add context to old rows; never rewrite receipts, amounts, states or dates.
update public.touchline_club_season_test_orders set payment_mode='test',payment_profile_id='club-season-test-v1',
 catalogue_version='test-20261028',return_origin='https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app',
 product_id=case plan when 'standard' then 'prod_VWfOj7xUoHtTzf' when 'master' then 'prod_VWfPhe2OKyhU2B' when 'vip' then 'prod_VWfRYf4MYKPBLM' end,
 price_id=case plan when 'standard' then 'price_1UVc3eH0T0OdBC6sejXIyxSA' when 'master' then 'price_1UVc4rH0T0OdBC6sTZadG7qv' when 'vip' then 'price_1UVc6EH0T0OdBC6sXm0WRqIz' end;
alter table public.touchline_club_season_test_orders
 alter column payment_mode set not null,alter column payment_profile_id set not null,
 alter column catalogue_version set not null,alter column product_id set not null,
 alter column price_id set not null,alter column return_origin set not null,
 alter column provider_account drop default,
 drop constraint touchline_club_season_test_orders_provider_account_check,
 drop constraint touchline_club_season_test_orders_session_id_check,
 add constraint touchline_season_order_mode_check check(payment_mode in ('test','live')),
 add constraint touchline_season_order_session_check check(session_id is null or
   (payment_mode='test' and session_id ~ '^cs_test_[A-Za-z0-9]+$') or
   (payment_mode='live' and session_id ~ '^cs_live_[A-Za-z0-9]+$'));

create function touchline_payments_private.guard_order_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
declare p touchline_payments_private.profiles%rowtype; product text; price text;
begin
 if tg_op='UPDATE' then
  if (to_jsonb(new)-array['state','session_id','paid_at','fulfillment_receipt']) is distinct from
     (to_jsonb(old)-array['state','session_id','paid_at','fulfillment_receipt'])
   or (old.session_id is not null and new.session_id is distinct from old.session_id)
   or (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
   or (old.fulfillment_receipt is not null and new.fulfillment_receipt is distinct from old.fulfillment_receipt) then
   raise exception 'SEASON_ORDER_SNAPSHOT_IMMUTABLE'; end if;
  return new;
 end if;
 p:=touchline_payments_private.require_profile(new.payment_profile_id,'create');
 product:=case new.plan when 'standard' then p.standard_product_id when 'master' then p.master_product_id when 'vip' then p.vip_product_id end;
 price:=case new.plan when 'standard' then p.standard_price_id when 'master' then p.master_price_id when 'vip' then p.vip_price_id end;
 if new.payment_mode is distinct from p.payment_mode or new.provider_account is distinct from p.provider_account
  or new.catalogue_version is distinct from p.catalogue_version or new.return_origin is distinct from p.return_origin
  or new.product_id is distinct from product or new.price_id is distinct from price then raise exception 'SEASON_ORDER_CONTEXT_MISMATCH'; end if;
 return new;
end $$;
create trigger touchline_season_order_snapshot before insert or update on public.touchline_club_season_test_orders
 for each row execute function touchline_payments_private.guard_order_snapshot();
revoke all on function touchline_payments_private.guard_order_snapshot() from public,anon,authenticated,service_role;

alter table public.touchline_club_season_test_events
 add column payment_mode text,add column provider_account text,add column payment_profile_id text,add column catalogue_version text;
update public.touchline_club_season_test_events e set payment_mode=o.payment_mode,provider_account=o.provider_account,
 payment_profile_id=o.payment_profile_id,catalogue_version=o.catalogue_version
 from public.touchline_club_season_test_orders o where o.id=e.order_id;
alter table public.touchline_club_season_test_events
 alter column payment_mode set not null,alter column provider_account set not null,
 alter column payment_profile_id set not null,alter column catalogue_version set not null,
 drop constraint touchline_club_season_test_events_session_id_check,
 add constraint touchline_season_event_mode_check check(payment_mode in ('test','live')),
 add constraint touchline_season_event_session_check check(
  (payment_mode='test' and session_id ~ '^cs_test_[A-Za-z0-9]+$') or
  (payment_mode='live' and session_id ~ '^cs_live_[A-Za-z0-9]+$'));
create function touchline_payments_private.bind_event_context()
returns trigger language plpgsql security invoker set search_path='' as $$
declare o public.touchline_club_season_test_orders%rowtype;
begin
 select * into strict o from public.touchline_club_season_test_orders where id=new.order_id;
 if (new.payment_mode is not null and new.payment_mode<>o.payment_mode)
  or (new.provider_account is not null and new.provider_account<>o.provider_account)
  or (new.payment_profile_id is not null and new.payment_profile_id<>o.payment_profile_id)
  or (new.catalogue_version is not null and new.catalogue_version<>o.catalogue_version)
  or (o.session_id is not null and new.session_id<>o.session_id) then raise exception 'SEASON_EVENT_CONTEXT_MISMATCH'; end if;
 new.payment_mode:=o.payment_mode;new.provider_account:=o.provider_account;
 new.payment_profile_id:=o.payment_profile_id;new.catalogue_version:=o.catalogue_version;
 return new;
end $$;
create trigger touchline_season_event_context before insert on public.touchline_club_season_test_events
 for each row execute function touchline_payments_private.bind_event_context();
revoke all on function touchline_payments_private.bind_event_context() from public,anon,authenticated,service_role;

-- Validate immutable context before *any* paid/review/expired/replay shortcut.
-- Reconciliation deliberately does not depend on create_enabled.
create function touchline_payments_private.assert_order_context(
 o public.touchline_club_season_test_orders,p_mode text,p_account_id text,p_profile_id text,p_catalogue_version text,p_session_id text
) returns void language plpgsql security invoker set search_path='' as $$
declare p touchline_payments_private.profiles%rowtype;
begin
 p:=touchline_payments_private.require_profile(p_profile_id,'reconcile');
 if o.id is null or p_mode is distinct from o.payment_mode or p_account_id is distinct from o.provider_account
  or p_profile_id is distinct from o.payment_profile_id or p_catalogue_version is distinct from o.catalogue_version
  or p.payment_mode is distinct from o.payment_mode or p.provider_account is distinct from o.provider_account
  or p.catalogue_version is distinct from o.catalogue_version or p.return_origin is distinct from o.return_origin
  or o.product_id is distinct from (case o.plan when 'standard' then p.standard_product_id when 'master' then p.master_product_id when 'vip' then p.vip_product_id end)
  or o.price_id is distinct from (case o.plan when 'standard' then p.standard_price_id when 'master' then p.master_price_id when 'vip' then p.vip_price_id end)
  then raise exception 'SEASON_ORDER_CONTEXT_MISMATCH'; end if;
 if p_session_id is null or p_session_id !~ (case o.payment_mode when 'test' then '^cs_test_[A-Za-z0-9]+$' when 'live' then '^cs_live_[A-Za-z0-9]+$' else '^$' end)
  or (o.session_id is not null and o.session_id<>p_session_id) then raise exception 'SEASON_SESSION_CONFLICT'; end if;
end $$;
revoke all on function touchline_payments_private.assert_order_context(public.touchline_club_season_test_orders,text,text,text,text,text) from public,anon,authenticated;
grant execute on function touchline_payments_private.assert_order_context(public.touchline_club_season_test_orders,text,text,text,text,text) to service_role;

alter table public.touchline_fantasy_entitlements drop constraint touchline_fantasy_entitlements_source_check;
alter table public.touchline_fantasy_entitlements add constraint touchline_fantasy_entitlements_source_check
 check(source in ('stripe_test','stripe_live','qa_grant','owner_vip_grant','owner_guest_grant','beta_free'));


create function public.touchline_club_assert_season_eligible(p_user_id uuid,p_season_id uuid,p_plan text,p_previous text,p_mode text,p_account_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.touchline_fantasy_entitlements%rowtype; c public.touchline_club_collections%rowtype;
 target_rank int:=case p_plan when 'standard' then 1 when 'master' then 2 when 'vip' then 3 end;
begin
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||p_user_id::text,0));
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||':'||p_season_id::text,0));
 select * into c from public.touchline_club_collections where user_id=p_user_id and season_id=p_season_id for update;
 select * into e from public.touchline_fantasy_entitlements where user_id=p_user_id and entitlement_key='fantasy_access' for update;
 if e.provider_subscription_reference is not null or (e.source in ('stripe_test','stripe_live') and coalesce(e.metadata->>'seasonPaymentSeasonId',e.metadata->>'seasonTestSeasonId') is null) then
   raise exception 'SEASON_LEGACY_SUBSCRIPTION_REQUIRES_REVIEW'; end if;
 if e.source in ('stripe_test','stripe_live') and (
    e.source is distinct from ('stripe_'||p_mode)
    or coalesce(e.metadata->>'seasonPaymentAccountId',case when e.source='stripe_test' then 'acct_1Tl6XQH0T0OdBC6s' end) is distinct from p_account_id
 ) then raise exception 'SEASON_PAYMENT_CONTEXT_REQUIRES_REVIEW'; end if;
 if p_previous is not null then
   if e.status is distinct from 'active' or e.source is distinct from ('stripe_'||p_mode) or e.plan_key is distinct from p_previous
      or coalesce(e.metadata->>'seasonPaymentSeasonId',e.metadata->>'seasonTestSeasonId') is distinct from p_season_id::text then raise exception 'SEASON_PREVIOUS_ACCESS_MISMATCH'; end if;
 elsif e.status='active' and (e.current_period_end is null or e.current_period_end>clock_timestamp())
   and coalesce(case e.plan_key when 'standard' then 1 when 'master' then 2 when 'vip' then 3 else 0 end,0)>=target_rank then
   raise exception 'SEASON_PLAN_ALREADY_AVAILABLE';
 end if;
 if c.user_id is null and (
   exists(select 1 from public.touchline_card_contracts where user_id=p_user_id and (season_id=p_season_id or season_id is null) and status='active')
   or exists(select 1 from public.touchline_coach_contracts where user_id=p_user_id and status='active')
   or exists(select 1 from public.touchline_fantasy_user_gameweeks ug
      join public.touchline_fantasy_gameweeks g on g.id=ug.gameweek_id
      join public.touchline_fantasy_user_gameweek_selections sel on sel.user_gameweek_id=ug.id
      where ug.user_id=p_user_id and g.season_id=p_season_id)
 ) then raise exception 'SEASON_LEGACY_COLLECTION_REQUIRES_REVIEW'; end if;
 if c.user_id is not null then
   if c.state->>'plan' is distinct from e.plan_key or e.status is distinct from 'active'
      or (p_previous is not null and c.state->>'plan' is distinct from p_previous) then raise exception 'SEASON_COLLECTION_ACCESS_MISMATCH'; end if;
   if (case c.state->>'plan' when 'beta' then 0 when 'standard' then 1 when 'master' then 2 when 'vip' then 3 else 99 end)>=target_rank then
     raise exception 'SEASON_COLLECTION_UPGRADE_REQUIRED'; end if;
 end if;
end $$;

create function public.touchline_club_prepare_season_order(p_user_id uuid,p_plan text,p_profile_id text)
returns public.touchline_club_season_test_orders
language plpgsql security invoker set search_path='' as $$
declare
 v_season public.football_seasons%rowtype;
 v_order public.touchline_club_season_test_orders%rowtype;
 v_previous text; profile touchline_payments_private.profiles%rowtype;
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
 profile:=touchline_payments_private.require_profile(p_profile_id,'create');
 if exists(select 1 from public.touchline_club_season_test_orders where user_id=p_user_id and season_id=v_season.id and state='review') then raise exception 'SEASON_PAYMENT_REQUIRES_REVIEW'; end if;
 select * into v_order from public.touchline_club_season_test_orders
 where user_id=p_user_id and season_id=v_season.id and state='pending' for update;
 if found then
   -- Never expire an uncertain request locally: provider reconciliation must
   -- prove it unpaid/expired before another order can be created.
   if v_order.plan<>p_plan then raise exception 'SEASON_ORDER_IN_PROGRESS'; end if;
   if v_order.payment_profile_id is distinct from profile.id then raise exception 'SEASON_ORDER_CONTEXT_MISMATCH'; end if;
   perform public.touchline_club_assert_season_eligible(p_user_id,v_season.id,v_order.plan,v_order.previous_paid_plan,profile.payment_mode,profile.provider_account);
   return v_order;
 end if;
 if v_season.starts_at is null or v_end is null
   or v_now<(v_season.starts_at::timestamp at time zone 'UTC')
   or v_end-v_now<interval '31 minutes' then raise exception 'SEASON_WINDOW_INVALID'; end if;
 select plan into v_previous from public.touchline_club_season_test_orders
 where user_id=p_user_id and season_id=v_season.id and state='paid' and payment_mode=profile.payment_mode and provider_account=profile.provider_account
 order by amount_minor+(case previous_paid_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end) desc
 limit 1;
 v_amount:=(case p_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 end)
  -(case v_previous when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end);
 if v_amount<=0 then raise exception 'SEASON_PAID_UPGRADE_REQUIRED'; end if;
 perform public.touchline_club_assert_season_eligible(p_user_id,v_season.id,p_plan,v_previous,profile.payment_mode,profile.provider_account);
 insert into public.touchline_club_season_test_orders
  (user_id,season_id,plan,previous_paid_plan,amount_minor,created_at,first_attempt_at,checkout_expires_at,season_starts_at,season_ends_at,payment_mode,payment_profile_id,provider_account,catalogue_version,product_id,price_id,return_origin)
 values(p_user_id,v_season.id,p_plan,v_previous,v_amount,v_now,v_now,
   least(v_now+interval '1 hour',date_trunc('second',v_end)),v_season.starts_at::timestamp at time zone 'UTC',v_end,profile.payment_mode,profile.id,profile.provider_account,profile.catalogue_version,
   case p_plan when 'standard' then profile.standard_product_id when 'master' then profile.master_product_id when 'vip' then profile.vip_product_id end,
   case p_plan when 'standard' then profile.standard_price_id when 'master' then profile.master_price_id when 'vip' then profile.vip_price_id end,profile.return_origin)
 returning * into v_order;
 return v_order;
end $$;

create function public.touchline_club_attach_season_session(p_user_id uuid,p_order_id uuid,p_session_id text,p_mode text,p_account_id text,p_profile_id text,p_catalogue_version text)
returns public.touchline_club_season_test_orders
language plpgsql security invoker set search_path='' as $$
declare v_order public.touchline_club_season_test_orders%rowtype;
begin
 select * into v_order from public.touchline_club_season_test_orders
 where id=p_order_id and user_id=p_user_id for update;
 if not found then raise exception 'SEASON_ORDER_NOT_FOUND'; end if;
 perform touchline_payments_private.assert_order_context(v_order,p_mode,p_account_id,p_profile_id,p_catalogue_version,p_session_id);
 if v_order.session_id is not null then
  if v_order.session_id<>p_session_id then raise exception 'SEASON_SESSION_CONFLICT'; end if;
  return v_order;
 end if;
 if v_order.state<>'pending' then raise exception 'SEASON_ORDER_NOT_PENDING'; end if;
 update public.touchline_club_season_test_orders set session_id=p_session_id
 where id=v_order.id returning * into v_order;
 return v_order;
end $$;

create function public.touchline_club_fulfill_season_order(p_order_id uuid,p_event_id text,p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.touchline_club_season_test_orders%rowtype; old_event public.touchline_club_season_test_events%rowtype;
 c public.touchline_club_collections%rowtype; e public.touchline_fantasy_entitlements%rowtype;
 owner_id uuid; previous_plan text; line jsonb; price jsonb; product text; expected_product text; expected_price text;
 budget bigint; old_budget bigint; credits_added bigint:=0; next_state jsonb; receipt jsonb; order_ids jsonb;
 session text:=p_evidence->>'id'; stamp timestamptz:=clock_timestamp();
begin
 if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' then raise exception 'SEASON_EVENT_INVALID'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('club-season-event:'||p_event_id,0));
 select user_id into owner_id from public.touchline_club_season_test_orders where id=p_order_id;
 if not found then raise exception 'SEASON_ORDER_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||owner_id::text,0));
 perform 1 from public.users where id=owner_id for no key update;
 select * into o from public.touchline_club_season_test_orders where id=p_order_id for update;
 perform touchline_payments_private.assert_order_context(o,
   case p_evidence->'livemode' when 'false'::jsonb then 'test' when 'true'::jsonb then 'live' end,
   p_evidence->>'accountId',p_evidence->>'profileId',p_evidence->>'catalogueVersion',session);
 if session is null or session !~ (case o.payment_mode when 'test' then '^cs_test_[A-Za-z0-9]+$' else '^cs_live_[A-Za-z0-9]+$' end)
   or (o.session_id is not null and o.session_id<>session)
   or p_evidence->>'accountId' is distinct from o.provider_account
   or p_evidence->'livemode' is distinct from to_jsonb(o.payment_mode='live')
   or (o.payment_mode='live' and (
     p_evidence#>>'{metadata,touchlinePaymentMode}' is distinct from o.payment_mode
     or p_evidence#>>'{metadata,touchlinePaymentProfileId}' is distinct from o.payment_profile_id
     or p_evidence#>>'{metadata,touchlinePaymentAccountId}' is distinct from o.provider_account
     or p_evidence#>>'{metadata,touchlineCatalogueVersion}' is distinct from o.catalogue_version))
   or p_evidence->>'mode' is distinct from 'payment'
   or p_evidence->>'status' is distinct from 'complete'
   or p_evidence->>'payment_status' is distinct from 'paid'
   or p_evidence->>'currency' is distinct from 'eur'
   or p_evidence->'amount_total' is distinct from to_jsonb(o.amount_minor)
   or p_evidence->'amount_subtotal' is distinct from to_jsonb(o.amount_minor)
   or p_evidence#>'{total_details,amount_tax}' is distinct from '0'::jsonb
   or p_evidence#>'{total_details,amount_discount}' is distinct from '0'::jsonb
   or p_evidence#>'{total_details,amount_shipping}' is distinct from '0'::jsonb
   or p_evidence->>'client_reference_id' is distinct from o.user_id::text
   or p_evidence#>>'{metadata,touchlineOrderId}' is distinct from o.id::text
   or p_evidence#>>'{metadata,touchlineSeasonId}' is distinct from o.season_id::text
   or p_evidence#>>'{metadata,touchlinePlan}' is distinct from o.plan
   or p_evidence#>>'{metadata,touchlinePreviousPaidPlan}' is distinct from o.previous_paid_plan
   or p_evidence#>'{lines,has_more}' is distinct from 'false'::jsonb
   or jsonb_typeof(p_evidence#>'{lines,data}') is distinct from 'array' then raise exception 'SEASON_PAYMENT_UNCONFIRMED'; end if;
 if jsonb_array_length(p_evidence#>'{lines,data}')<>1 then raise exception 'SEASON_PAYMENT_UNCONFIRMED'; end if;
 line:=p_evidence#>'{lines,data,0}'; price:=line->'price';
 product:=case when jsonb_typeof(price->'product')='object' then price#>>'{product,id}' else price->>'product' end;
 expected_product:=o.product_id;
 expected_price:=o.price_id;
 if line->'quantity' is distinct from '1'::jsonb or product is distinct from expected_product
   or price->>'currency' is distinct from 'eur' or price->'livemode' is distinct from to_jsonb(o.payment_mode='live')
   or price->'unit_amount' is distinct from to_jsonb(o.amount_minor) or price->'recurring' is distinct from 'null'::jsonb
   or coalesce(price->>'id','') !~ '^price_[A-Za-z0-9]+$'
   or (o.previous_paid_plan is null and (price->>'id' is distinct from expected_price or price->'active' is distinct from 'true'::jsonb)) then
   raise exception 'SEASON_PAYMENT_UNCONFIRMED'; end if;
 select * into old_event from public.touchline_club_season_test_events where event_id=p_event_id;
 if found then
   if old_event.order_id<>o.id or old_event.kind<>'paid' or old_event.session_id<>session then raise exception 'SEASON_EVENT_CONFLICT'; end if;
   return old_event.receipt||jsonb_build_object('replay',true);
 end if;
 if o.state in ('review','refunded') then return jsonb_build_object('ok',false,'reviewRequired',true,'orderId',o.id); end if;
 if o.state='paid' then
   receipt:=o.fulfillment_receipt||jsonb_build_object('replay',true);
   insert into public.touchline_club_season_test_events(event_id,order_id,kind,session_id,receipt) values(p_event_id,o.id,'paid',session,receipt);
   return receipt;
 end if;
 if o.state<>'pending' or stamp<o.season_starts_at or stamp>=o.season_ends_at
  or not exists(select 1 from public.touchline_fantasy_configs where competition_key='england' and status='active' and season_id=o.season_id) then
   raise exception 'SEASON_FULFILLMENT_WINDOW_INVALID'; end if;
 select plan into previous_plan from public.touchline_club_season_test_orders where user_id=o.user_id and season_id=o.season_id and state='paid' and payment_mode=o.payment_mode and provider_account=o.provider_account
 order by amount_minor+(case previous_paid_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end) desc limit 1;
 if previous_plan is distinct from o.previous_paid_plan then raise exception 'SEASON_PAID_HISTORY_CHANGED'; end if;
 perform public.touchline_club_assert_season_eligible(o.user_id,o.season_id,o.plan,o.previous_paid_plan,o.payment_mode,o.provider_account);
 select * into c from public.touchline_club_collections where user_id=o.user_id and season_id=o.season_id for update;
 select * into e from public.touchline_fantasy_entitlements where user_id=o.user_id and entitlement_key='fantasy_access' for update;
 budget:=case o.plan when 'standard' then 750000000 when 'master' then 1500000000 when 'vip' then 3000000000 end;
 if c.user_id is not null then
   old_budget:=case c.state->>'plan' when 'beta' then 100000000 when 'standard' then 750000000 when 'master' then 1500000000 when 'vip' then 3000000000 end;
   credits_added:=budget-old_budget;
   if credits_added is null or credits_added<=0 or c.revision>=9007199254740991
     or (c.state->>'balanceEur')::numeric+credits_added>9007199254740991 then raise exception 'SEASON_CREDIT_TRANSITION_INVALID'; end if;
   next_state:=c.state||jsonb_build_object('plan',o.plan,'revision',c.revision+1,'balanceEur',(c.state->>'balanceEur')::numeric+credits_added);
   update public.touchline_club_collections set revision=revision+1,state=next_state,updated_at=stamp where user_id=o.user_id and season_id=o.season_id;
 end if;
 order_ids:=case when coalesce(e.metadata->>'seasonPaymentSeasonId',e.metadata->>'seasonTestSeasonId')=o.season_id::text
   and e.source=('stripe_'||o.payment_mode)
   and coalesce(e.metadata->>'seasonPaymentAccountId',case when o.payment_mode='test' then 'acct_1Tl6XQH0T0OdBC6s' end)=o.provider_account
   then coalesce(e.metadata->'seasonPaymentOrderIds',e.metadata->'seasonTestOrderIds','[]'::jsonb) else '[]'::jsonb end;
 if jsonb_typeof(order_ids)<>'array' then raise exception 'SEASON_PAYMENT_HISTORY_INVALID'; end if;
 order_ids:=order_ids||to_jsonb(o.id::text);
 insert into public.touchline_fantasy_entitlements(user_id,entitlement_key,status,source,plan_key,current_period_start,current_period_end,metadata)
 values(o.user_id,'fantasy_access','active','stripe_'||o.payment_mode,o.plan,o.created_at,o.season_ends_at,
  case when o.payment_mode='test' then jsonb_build_object('seasonTestOrderId',o.id,'seasonTestOrderIds',order_ids,'seasonTestSeasonId',o.season_id,'checkoutSessionId',session)
  else jsonb_build_object('seasonPaymentOrderId',o.id,'seasonPaymentOrderIds',order_ids,'seasonPaymentSeasonId',o.season_id,
   'seasonPaymentMode',o.payment_mode,'seasonPaymentAccountId',o.provider_account,'seasonPaymentProfileId',o.payment_profile_id,
   'seasonPaymentCatalogueVersion',o.catalogue_version,'checkoutSessionId',session) end)
 on conflict(user_id,entitlement_key) do update set status='active',source=excluded.source,plan_key=excluded.plan_key,
  current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,metadata=excluded.metadata,
  provider_customer_reference=null,provider_subscription_reference=null,last_provider_event_created_at=null,updated_at=stamp;
 receipt:=jsonb_build_object('ok',true,'replay',false,'orderId',o.id,'userId',o.user_id,'seasonId',o.season_id,'plan',o.plan,
  'sessionId',session,'amountMinor',o.amount_minor,'creditsAdded',credits_added,'collectionInitialized',c.user_id is not null,'expiresAt',o.season_ends_at);
 update public.touchline_club_season_test_orders set state='paid',session_id=session,paid_at=stamp,fulfillment_receipt=receipt where id=o.id;
 insert into public.touchline_club_season_test_events(event_id,order_id,kind,session_id,receipt) values(p_event_id,o.id,'paid',session,receipt);
 return receipt;
end $$;

create function public.touchline_club_review_season_order(p_order_id uuid,p_event_id text,p_event_type text,p_session_id text,p_mode text,p_account_id text,p_profile_id text,p_catalogue_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.touchline_club_season_test_orders%rowtype; event public.touchline_club_season_test_events%rowtype; owner_id uuid; receipt jsonb;
begin
 if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' or p_event_type is null
   or p_event_type not in ('charge.refunded','charge.dispute.created','season.payment_late') then raise exception 'SEASON_EVENT_INVALID'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('club-season-event:'||p_event_id,0));
 select user_id into owner_id from public.touchline_club_season_test_orders where id=p_order_id;
 if not found then raise exception 'SEASON_ORDER_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||owner_id::text,0));
 perform 1 from public.users where id=owner_id for no key update;
 select * into o from public.touchline_club_season_test_orders where id=p_order_id for update;
 perform touchline_payments_private.assert_order_context(o,p_mode,p_account_id,p_profile_id,p_catalogue_version,p_session_id);
 select * into event from public.touchline_club_season_test_events where event_id=p_event_id;
 if found then
   if event.order_id<>o.id or event.kind<>p_event_type or event.session_id<>p_session_id then raise exception 'SEASON_EVENT_CONFLICT'; end if;
   return event.receipt||jsonb_build_object('replay',true);
 end if;
 if p_event_type='season.payment_late' and o.state='paid' then
   receipt:=o.fulfillment_receipt||jsonb_build_object('replay',true);
   insert into public.touchline_club_season_test_events(event_id,order_id,kind,session_id,receipt) values(p_event_id,o.id,p_event_type,p_session_id,receipt);
   return receipt;
 end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||o.user_id::text,0));
 update public.touchline_fantasy_entitlements set status='past_due',updated_at=clock_timestamp(),
 metadata=metadata||(case when o.payment_mode='test' then jsonb_build_object('seasonTestReviewOrderId',o.id,'seasonTestReviewEventId',p_event_id) else jsonb_build_object('seasonPaymentReviewOrderId',o.id,'seasonPaymentReviewEventId',p_event_id) end)
 where p_event_type<>'season.payment_late' and user_id=o.user_id and entitlement_key='fantasy_access' and source=('stripe_'||o.payment_mode)
  and coalesce(metadata->>'seasonPaymentAccountId',case when o.payment_mode='test' then 'acct_1Tl6XQH0T0OdBC6s' end)=o.provider_account
  and coalesce(metadata->>'seasonPaymentSeasonId',metadata->>'seasonTestSeasonId')=o.season_id::text
  and coalesce(metadata->'seasonPaymentOrderIds',metadata->'seasonTestOrderIds') ? o.id::text;
 -- Keep other uncertain provider requests intact; their payments cannot activate
 -- against a suspended entitlement and require reconciliation.
 update public.touchline_club_season_test_orders set state='review',session_id=coalesce(session_id,p_session_id) where id=o.id;
 receipt:=jsonb_build_object('ok',true,'reviewRequired',true,'orderId',o.id,'eventType',p_event_type);
 insert into public.touchline_club_season_test_events(event_id,order_id,kind,session_id,receipt) values(p_event_id,o.id,p_event_type,p_session_id,receipt);
 return receipt;
end $$;

create function public.touchline_club_expire_season_order(p_order_id uuid,p_event_id text,p_session_id text,p_mode text,p_account_id text,p_profile_id text,p_catalogue_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.touchline_club_season_test_orders%rowtype; event public.touchline_club_season_test_events%rowtype; owner_id uuid; receipt jsonb;
begin
 if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' then raise exception 'SEASON_EVENT_INVALID'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('club-season-event:'||p_event_id,0));
 select user_id into owner_id from public.touchline_club_season_test_orders where id=p_order_id;
 if not found then raise exception 'SEASON_ORDER_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||owner_id::text,0));
 perform 1 from public.users where id=owner_id for no key update;
 select * into o from public.touchline_club_season_test_orders where id=p_order_id for update;
 perform touchline_payments_private.assert_order_context(o,p_mode,p_account_id,p_profile_id,p_catalogue_version,p_session_id);
 select * into event from public.touchline_club_season_test_events where event_id=p_event_id;
 if found then
   if event.order_id<>o.id or event.kind<>'expired' or event.session_id<>p_session_id then raise exception 'SEASON_EVENT_CONFLICT'; end if;
   return event.receipt||jsonb_build_object('replay',true);
 end if;
 if o.state='pending' then update public.touchline_club_season_test_orders set state='expired',session_id=coalesce(session_id,p_session_id) where id=o.id; end if;
 receipt:=jsonb_build_object('ok',true,'orderId',o.id,'expired',o.state in ('pending','expired'));
 insert into public.touchline_club_season_test_events(event_id,order_id,kind,session_id,receipt) values(p_event_id,o.id,'expired',p_session_id,receipt);
 return receipt;
end $$;

create function public.touchline_club_quote_season_plans(p_user_id uuid,p_profile_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare season public.football_seasons%rowtype; pending public.touchline_club_season_test_orders%rowtype;
 profile touchline_payments_private.profiles%rowtype; previous text; target text; amount int; result jsonb:='{}'::jsonb; stop_at timestamptz;
begin
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||p_user_id::text,0));
 perform 1 from public.users where id=p_user_id for no key update;
 if not found then return result; end if;
 profile:=touchline_payments_private.require_profile(p_profile_id,'create');
 select s.* into strict season from public.football_seasons s join public.touchline_fantasy_configs c on c.season_id=s.id
  where c.competition_key='england' and c.status='active';
 if exists(select 1 from public.touchline_club_season_test_orders where user_id=p_user_id and season_id=season.id and state='review') then return result; end if;
 select * into pending from public.touchline_club_season_test_orders where user_id=p_user_id and season_id=season.id and state='pending';
 if found then
   if pending.payment_profile_id is distinct from profile.id or pending.checkout_expires_at<=clock_timestamp() then return result; end if;
   begin
    perform public.touchline_club_assert_season_eligible(p_user_id,season.id,pending.plan,pending.previous_paid_plan,profile.payment_mode,profile.provider_account);
    return jsonb_build_object(pending.plan,jsonb_build_object('amountMinor',pending.amount_minor));
   exception when raise_exception then
    if sqlerrm like 'SEASON_%' then return result; else raise; end if;
   end;
 end if;
 stop_at:=((season.ends_at+1)::timestamp at time zone 'UTC')-interval '1 millisecond';
 if season.starts_at is null or stop_at is null or clock_timestamp()<season.starts_at::timestamp at time zone 'UTC'
   or stop_at-clock_timestamp()<interval '31 minutes' then return result; end if;
 select plan into previous from public.touchline_club_season_test_orders where user_id=p_user_id and season_id=season.id and state='paid' and payment_mode=profile.payment_mode and provider_account=profile.provider_account
 order by amount_minor+(case previous_paid_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end) desc limit 1;
 foreach target in array array['standard','master','vip'] loop
   amount:=(case target when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 end)
    -(case previous when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end);
   if amount<=0 then continue; end if;
   begin
    perform public.touchline_club_assert_season_eligible(p_user_id,season.id,target,previous,profile.payment_mode,profile.provider_account);
    result:=result||jsonb_build_object(target,jsonb_build_object('amountMinor',amount));
   exception when raise_exception then
    if sqlerrm not like 'SEASON_%' then raise; end if;
   end;
 end loop;
 return result;
exception when no_data_found then return '{}'::jsonb;
end $$;

revoke all on function public.touchline_club_assert_season_eligible(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.touchline_club_assert_season_eligible(uuid,uuid,text,text,text,text) to service_role;
revoke all on function public.touchline_club_prepare_season_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.touchline_club_prepare_season_order(uuid,text,text) to service_role;
revoke all on function public.touchline_club_attach_season_session(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.touchline_club_attach_season_session(uuid,uuid,text,text,text,text,text) to service_role;
revoke all on function public.touchline_club_fulfill_season_order(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.touchline_club_fulfill_season_order(uuid,text,jsonb) to service_role;
revoke all on function public.touchline_club_review_season_order(uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.touchline_club_review_season_order(uuid,text,text,text,text,text,text,text) to service_role;
revoke all on function public.touchline_club_expire_season_order(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.touchline_club_expire_season_order(uuid,text,text,text,text,text,text) to service_role;
revoke all on function public.touchline_club_quote_season_plans(uuid,text) from public,anon,authenticated;
grant execute on function public.touchline_club_quote_season_plans(uuid,text) to service_role;

-- Exact published TEST signatures and payload contract remain supported.
create or replace function public.touchline_club_prepare_season_test_order(p_user_id uuid,p_plan text)
returns public.touchline_club_season_test_orders language sql security invoker set search_path='' as $$
 select public.touchline_club_prepare_season_order(p_user_id,p_plan,'club-season-test-v1'); $$;
create or replace function public.touchline_club_quote_season_test_plans(p_user_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select public.touchline_club_quote_season_plans(p_user_id,'club-season-test-v1'); $$;
create or replace function public.touchline_club_assert_season_test_eligible(p_user_id uuid,p_season_id uuid,p_plan text,p_previous text)
returns void language sql security invoker set search_path='' as $$
 select public.touchline_club_assert_season_eligible(p_user_id,p_season_id,p_plan,p_previous,'test','acct_1Tl6XQH0T0OdBC6s'); $$;
create or replace function public.touchline_club_attach_season_test_session(p_user_id uuid,p_order_id uuid,p_session_id text)
returns public.touchline_club_season_test_orders language plpgsql security invoker set search_path='' as $$
begin
 if p_session_id is null or p_session_id !~ '^cs_test_[A-Za-z0-9]+$' then raise exception 'SEASON_SESSION_INVALID'; end if;
 return public.touchline_club_attach_season_session(p_user_id,p_order_id,p_session_id,'test','acct_1Tl6XQH0T0OdBC6s','club-season-test-v1','test-20261028');
end $$;
create or replace function public.touchline_club_fulfill_season_test_order(p_order_id uuid,p_event_id text,p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_evidence) is distinct from 'object'
  or p_evidence->'livemode' is distinct from 'false'::jsonb
  or p_evidence->>'accountId' is distinct from 'acct_1Tl6XQH0T0OdBC6s'
  or (p_evidence ? 'profileId' and p_evidence->>'profileId' is distinct from 'club-season-test-v1')
  or (p_evidence ? 'catalogueVersion' and p_evidence->>'catalogueVersion' is distinct from 'test-20261028') then
  raise exception 'SEASON_PAYMENT_UNCONFIRMED'; end if;
 return public.touchline_club_fulfill_season_order(p_order_id,p_event_id,p_evidence||jsonb_build_object('profileId','club-season-test-v1','catalogueVersion','test-20261028'));
exception when raise_exception then
 if sqlerrm in ('SEASON_ORDER_CONTEXT_MISMATCH','SEASON_SESSION_CONFLICT') then raise exception 'SEASON_PAYMENT_UNCONFIRMED'; end if;
 raise;
end $$;
create or replace function public.touchline_club_review_season_test_order(p_order_id uuid,p_event_id text,p_event_type text,p_session_id text)
returns jsonb language sql security invoker set search_path='' as $$
 select public.touchline_club_review_season_order(p_order_id,p_event_id,p_event_type,p_session_id,'test','acct_1Tl6XQH0T0OdBC6s','club-season-test-v1','test-20261028'); $$;
create or replace function public.touchline_club_expire_season_test_order(p_order_id uuid,p_event_id text,p_session_id text)
returns jsonb language sql security invoker set search_path='' as $$
 select public.touchline_club_expire_season_order(p_order_id,p_event_id,p_session_id,'test','acct_1Tl6XQH0T0OdBC6s','club-season-test-v1','test-20261028'); $$;

-- Existing ACL/owner/definer/search_path are preserved by CREATE OR REPLACE.
-- All source patches are exact, fail closed on drift, and retain replay/locks.
do $legacy$
declare change record; target regprocedure; src text; dst text; owner_before oid; acl_before aclitem[]; cfg_before text[]; definer_before boolean;
begin
 for change in select * from (values
  ('public.touchline_fantasy_apply_test_subscription_event(text,timestamptz,text,boolean,uuid,text,text,text,timestamptz,timestamptz)',
   'metadata->>''seasonTestOrderId'' is not null',
   '(metadata->>''seasonTestOrderId'' is not null or metadata->>''seasonPaymentOrderId'' is not null or source=''stripe_live'')'),
  ('public.checkout_touchline_market_cart(uuid,uuid[],text)',
   'e.metadata->>''seasonTestOrderId'' is not null',
   '(e.metadata->>''seasonTestOrderId'' is not null or e.metadata->>''seasonPaymentOrderId'' is not null or e.source=''stripe_live'')'),
  ('public.touchline_hire_coach_contract(uuid,text,uuid,text,integer,uuid)',
   'e.metadata->>''seasonTestOrderId'' is not null',
   '(e.metadata->>''seasonTestOrderId'' is not null or e.metadata->>''seasonPaymentOrderId'' is not null or e.source=''stripe_live'')'),
  ('public.touchline_fantasy_grant_guest_access(uuid,text,text,text,uuid,text)',
   'v_before ->> ''source'' = ''stripe_test''',
   '(v_before ->> ''source'' in (''stripe_test'',''stripe_live'') or v_before #>> ''{metadata,seasonPaymentOrderId}'' is not null or v_before #>> ''{metadata,seasonTestOrderId}'' is not null)')
 ) as changes(signature,marker,replacement) loop
  target:=to_regprocedure(change.signature);
  if target is null then raise exception 'SEASON_MODE_LEGACY_SOURCE_MISSING: %',change.signature; end if;
  select pg_get_functiondef(oid),proowner,proacl,proconfig,prosecdef into src,owner_before,acl_before,cfg_before,definer_before from pg_proc where oid=target;
  if (length(src)-length(replace(src,change.marker,'')))/length(change.marker)<>1 then raise exception 'SEASON_MODE_LEGACY_SOURCE_DRIFT: %',change.signature; end if;
  dst:=replace(src,change.marker,change.replacement);
  execute dst;
  if not exists(select 1 from pg_proc where oid=target and proowner=owner_before and proacl is not distinct from acl_before
    and proconfig is not distinct from cfg_before and prosecdef=definer_before and pg_get_functiondef(oid)=dst) then
   raise exception 'SEASON_MODE_LEGACY_ATTRIBUTES_CHANGED'; end if;
 end loop;
end $legacy$;

-- Revoke inherited Supabase defaults too: event receipts remain append-only,
-- orders cannot be removed/truncated and profiles/config cannot be edited by API.
revoke all on public.touchline_club_season_test_orders,public.touchline_club_season_test_events from public,anon,authenticated,service_role;
grant select,insert,update on public.touchline_club_season_test_orders to service_role;
grant select,insert on public.touchline_club_season_test_events to service_role;
commit;
