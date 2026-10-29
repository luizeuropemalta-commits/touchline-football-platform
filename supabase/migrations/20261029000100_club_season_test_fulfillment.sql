begin;
set local lock_timeout='5s';

create table public.touchline_club_season_test_events (
 event_id text primary key check(event_id ~ '^evt_[A-Za-z0-9_]+$'),
 order_id uuid not null references public.touchline_club_season_test_orders(id) on delete restrict,
 kind text not null check(kind in ('paid','expired','charge.refunded','charge.dispute.created','season.payment_late')),
 session_id text not null check(session_id ~ '^cs_test_[A-Za-z0-9]+$'),
 receipt jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.touchline_club_season_test_events enable row level security;
revoke all on public.touchline_club_season_test_events from public,anon,authenticated;
grant select,insert on public.touchline_club_season_test_events to service_role;
alter table public.touchline_club_season_test_orders add column fulfillment_receipt jsonb;
-- Review cases are historical risks and can coexist; only one live pending quote.
drop index public.touchline_club_season_test_one_pending;
create unique index touchline_club_season_test_one_pending
 on public.touchline_club_season_test_orders(user_id,season_id) where state='pending';

-- Shared preparation/fulfillment guard; every caller already holds the owner
-- mutex, and these locks share the existing collection/bootstrap/subscription namespaces.
-- The owner mutex must be NO KEY UPDATE: bootstrap takes those advisory locks
-- before inserting user-referencing rows (FK KEY SHARE). A stronger UPDATE
-- lock here would invert that wait and deadlock without changing any user key.
-- Every caller also acquires subscription BEFORE the owner row, matching
-- initializer and avoiding subscription -> ownership -> users -> subscription
-- cycles involving an older checkout/hire request.
create function public.touchline_club_assert_season_test_eligible(p_user_id uuid,p_season_id uuid,p_plan text,p_previous text)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.touchline_fantasy_entitlements%rowtype; c public.touchline_club_collections%rowtype;
 target_rank int:=case p_plan when 'standard' then 1 when 'master' then 2 when 'vip' then 3 end;
begin
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||p_user_id::text,0));
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||':'||p_season_id::text,0));
 select * into c from public.touchline_club_collections where user_id=p_user_id and season_id=p_season_id for update;
 select * into e from public.touchline_fantasy_entitlements where user_id=p_user_id and entitlement_key='fantasy_access' for update;
 if e.provider_subscription_reference is not null or (e.source='stripe_test' and e.metadata->>'seasonTestSeasonId' is null) then
   raise exception 'SEASON_LEGACY_SUBSCRIPTION_REQUIRES_REVIEW'; end if;
 if p_previous is not null then
   if e.status is distinct from 'active' or e.source is distinct from 'stripe_test' or e.plan_key is distinct from p_previous
      or e.metadata->>'seasonTestSeasonId' is distinct from p_season_id::text then raise exception 'SEASON_PREVIOUS_ACCESS_MISMATCH'; end if;
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
revoke all on function public.touchline_club_assert_season_test_eligible(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.touchline_club_assert_season_test_eligible(uuid,uuid,text,text) to service_role;
-- Use the same eligibility gate before creating or resuming a charge. Pending
-- records survive access revocation for webhook reconciliation, but cannot redirect.
do $patch$
declare src text; dst text;
begin
 src:=pg_get_functiondef('public.touchline_club_prepare_season_test_order(uuid,text)'::regprocedure);
 -- Forward-compatible when an earlier version of the orders function already
 -- exists. New installations also use the weaker, still-serializing mutex.
 src:=replace(src,'perform 1 from public.users where id=p_user_id for update;',
   'perform 1 from public.users where id=p_user_id for no key update;');
 if strpos(src,'perform 1 from public.users where id=p_user_id for no key update;')=0 then
   raise exception 'SEASON_PREPARE_OWNER_LOCK_PATCH_MISSING'; end if;
 if strpos(src,'pg_advisory_xact_lock(pg_catalog.hashtextextended(''touchline-fantasy-subscription:''||p_user_id::text,0))')=0 then
   src:=replace(src,'perform 1 from public.users where id=p_user_id for no key update;',
    'perform pg_advisory_xact_lock(pg_catalog.hashtextextended(''touchline-fantasy-subscription:''||p_user_id::text,0));'||chr(10)||
    ' perform 1 from public.users where id=p_user_id for no key update;');
 end if;
 dst:=replace(src,' insert into public.touchline_club_season_test_orders',
  ' perform public.touchline_club_assert_season_test_eligible(p_user_id,v_season.id,p_plan,v_previous);'||chr(10)||' insert into public.touchline_club_season_test_orders');
 if dst=src then raise exception 'SEASON_PREPARE_GUARD_PATCH_MISSING'; end if;
 src:=dst;
 dst:=replace(src,
  ' select * into v_order from public.touchline_club_season_test_orders'||chr(10)||' where user_id=p_user_id and season_id=v_season.id and state in (''pending'',''review'') for update;',
  ' if exists(select 1 from public.touchline_club_season_test_orders where user_id=p_user_id and season_id=v_season.id and state=''review'') then raise exception ''SEASON_PAYMENT_REQUIRES_REVIEW''; end if;'||chr(10)||
  ' select * into v_order from public.touchline_club_season_test_orders'||chr(10)||' where user_id=p_user_id and season_id=v_season.id and state=''pending'' for update;');
 if dst=src then raise exception 'SEASON_PREPARE_REVIEW_GUARD_PATCH_MISSING'; end if;
 src:=dst;
 dst:=replace(src,
  '   if v_order.plan<>p_plan then raise exception ''SEASON_ORDER_IN_PROGRESS''; end if;',
  '   if v_order.plan<>p_plan then raise exception ''SEASON_ORDER_IN_PROGRESS''; end if;'||chr(10)||
  '   perform public.touchline_club_assert_season_test_eligible(p_user_id,v_season.id,v_order.plan,v_order.previous_paid_plan);');
 if dst=src then raise exception 'SEASON_PREPARE_RECOVERY_GUARD_PATCH_MISSING'; end if;
 execute dst;
end $patch$;

create function public.touchline_club_fulfill_season_test_order(p_order_id uuid,p_event_id text,p_evidence jsonb)
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
 if session is null or session !~ '^cs_test_[A-Za-z0-9]+$'
   or (o.session_id is not null and o.session_id<>session)
   or p_evidence->>'accountId' is distinct from o.provider_account
   or p_evidence->'livemode' is distinct from 'false'::jsonb
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
 expected_product:=case o.plan when 'standard' then 'prod_VWfOj7xUoHtTzf' when 'master' then 'prod_VWfPhe2OKyhU2B' when 'vip' then 'prod_VWfRYf4MYKPBLM' end;
 expected_price:=case o.plan when 'standard' then 'price_1UVc3eH0T0OdBC6sejXIyxSA' when 'master' then 'price_1UVc4rH0T0OdBC6sTZadG7qv' when 'vip' then 'price_1UVc6EH0T0OdBC6sXm0WRqIz' end;
 if line->'quantity' is distinct from '1'::jsonb or product is distinct from expected_product
   or price->>'currency' is distinct from 'eur' or price->'livemode' is distinct from 'false'::jsonb
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
 select plan into previous_plan from public.touchline_club_season_test_orders where user_id=o.user_id and season_id=o.season_id and state='paid'
 order by amount_minor+(case previous_paid_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end) desc limit 1;
 if previous_plan is distinct from o.previous_paid_plan then raise exception 'SEASON_PAID_HISTORY_CHANGED'; end if;
 perform public.touchline_club_assert_season_test_eligible(o.user_id,o.season_id,o.plan,o.previous_paid_plan);
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
 order_ids:=case when e.metadata->>'seasonTestSeasonId'=o.season_id::text then coalesce(e.metadata->'seasonTestOrderIds','[]'::jsonb) else '[]'::jsonb end;
 if jsonb_typeof(order_ids)<>'array' then raise exception 'SEASON_PAYMENT_HISTORY_INVALID'; end if;
 order_ids:=order_ids||to_jsonb(o.id::text);
 insert into public.touchline_fantasy_entitlements(user_id,entitlement_key,status,source,plan_key,current_period_start,current_period_end,metadata)
 values(o.user_id,'fantasy_access','active','stripe_test',o.plan,o.created_at,o.season_ends_at,
  jsonb_build_object('seasonTestOrderId',o.id,'seasonTestOrderIds',order_ids,'seasonTestSeasonId',o.season_id,'checkoutSessionId',session))
 on conflict(user_id,entitlement_key) do update set status='active',source='stripe_test',plan_key=excluded.plan_key,
  current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,metadata=excluded.metadata,
  provider_customer_reference=null,provider_subscription_reference=null,last_provider_event_created_at=null,updated_at=stamp;
 receipt:=jsonb_build_object('ok',true,'replay',false,'orderId',o.id,'userId',o.user_id,'seasonId',o.season_id,'plan',o.plan,
  'sessionId',session,'amountMinor',o.amount_minor,'creditsAdded',credits_added,'collectionInitialized',c.user_id is not null,'expiresAt',o.season_ends_at);
 update public.touchline_club_season_test_orders set state='paid',session_id=session,paid_at=stamp,fulfillment_receipt=receipt where id=o.id;
 insert into public.touchline_club_season_test_events(event_id,order_id,kind,session_id,receipt) values(p_event_id,o.id,'paid',session,receipt);
 return receipt;
end $$;

-- Provider has been re-fetched by the server. No automatic money movement,
-- contract deletion or negative wallet; risk remains reviewable by Admin.
create function public.touchline_club_review_season_test_order(p_order_id uuid,p_event_id text,p_event_type text,p_session_id text)
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
 if p_session_id is null or p_session_id !~ '^cs_test_[A-Za-z0-9]+$' or (o.session_id is not null and o.session_id<>p_session_id) then raise exception 'SEASON_SESSION_CONFLICT'; end if;
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
 metadata=metadata||jsonb_build_object('seasonTestReviewOrderId',o.id,'seasonTestReviewEventId',p_event_id)
 where p_event_type<>'season.payment_late' and user_id=o.user_id and entitlement_key='fantasy_access' and source='stripe_test'
  and metadata->>'seasonTestSeasonId'=o.season_id::text and metadata->'seasonTestOrderIds' ? o.id::text;
 -- Keep other uncertain provider requests intact; their payments cannot activate
 -- against a suspended entitlement and require reconciliation.
 update public.touchline_club_season_test_orders set state='review',session_id=coalesce(session_id,p_session_id) where id=o.id;
 receipt:=jsonb_build_object('ok',true,'reviewRequired',true,'orderId',o.id,'eventType',p_event_type);
 insert into public.touchline_club_season_test_events(event_id,order_id,kind,session_id,receipt) values(p_event_id,o.id,p_event_type,p_session_id,receipt);
 return receipt;
end $$;

create function public.touchline_club_expire_season_test_order(p_order_id uuid,p_event_id text,p_session_id text)
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
 if p_session_id is null or p_session_id !~ '^cs_test_[A-Za-z0-9]+$' or (o.session_id is not null and o.session_id<>p_session_id) then raise exception 'SEASON_SESSION_CONFLICT'; end if;
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
revoke all on function public.touchline_club_fulfill_season_test_order(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.touchline_club_review_season_test_order(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.touchline_club_expire_season_test_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.touchline_club_fulfill_season_test_order(uuid,text,jsonb) to service_role;
grant execute on function public.touchline_club_review_season_test_order(uuid,text,text,text) to service_role;
grant execute on function public.touchline_club_expire_season_test_order(uuid,text,text) to service_role;

-- A late historical monthly event must never overwrite seasonal access.
do $legacy$
declare src text; dst text; anchor text:='  if not v_claimed then return jsonb_build_object(''ok'', true, ''duplicate'', true, ''stale'', false); end if;';
begin
 src:=pg_get_functiondef('public.touchline_fantasy_apply_test_subscription_event(text,timestamptz,text,boolean,uuid,text,text,text,timestamptz,timestamptz)'::regprocedure);
 dst:=replace(src,anchor,anchor||chr(10)||$guard$
  if exists(select 1 from public.touchline_fantasy_entitlements where user_id=p_user_id
   and entitlement_key='fantasy_access' and metadata->>'seasonTestOrderId' is not null) then
   return jsonb_build_object('ok',true,'duplicate',false,'stale',false,'seasonalPlanPreserved',true);
  end if;
$guard$);
 if dst=src then raise exception 'SEASON_LEGACY_GUARD_PATCH_MISSING'; end if;
 execute dst;
end $legacy$;

-- Read-only quote projection. It uses the same locked eligibility guard as
-- creation/fulfillment, and never creates an order or touches credits.
create function public.touchline_club_quote_season_test_plans(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare season public.football_seasons%rowtype; pending public.touchline_club_season_test_orders%rowtype;
 previous text; target text; amount int; result jsonb:='{}'::jsonb; stop_at timestamptz;
begin
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||p_user_id::text,0));
 perform 1 from public.users where id=p_user_id for no key update;
 if not found then return result; end if;
 select s.* into strict season from public.football_seasons s join public.touchline_fantasy_configs c on c.season_id=s.id
  where c.competition_key='england' and c.status='active';
 if exists(select 1 from public.touchline_club_season_test_orders where user_id=p_user_id and season_id=season.id and state='review') then return result; end if;
 select * into pending from public.touchline_club_season_test_orders where user_id=p_user_id and season_id=season.id and state='pending';
 if found then
   if pending.checkout_expires_at<=clock_timestamp() then return result; end if;
   begin
    perform public.touchline_club_assert_season_test_eligible(p_user_id,season.id,pending.plan,pending.previous_paid_plan);
    return jsonb_build_object(pending.plan,jsonb_build_object('amountMinor',pending.amount_minor));
   exception when raise_exception then
    if sqlerrm like 'SEASON_%' then return result; else raise; end if;
   end;
 end if;
 stop_at:=((season.ends_at+1)::timestamp at time zone 'UTC')-interval '1 millisecond';
 if season.starts_at is null or stop_at is null or clock_timestamp()<season.starts_at::timestamp at time zone 'UTC'
   or stop_at-clock_timestamp()<interval '31 minutes' then return result; end if;
 select plan into previous from public.touchline_club_season_test_orders where user_id=p_user_id and season_id=season.id and state='paid'
 order by amount_minor+(case previous_paid_plan when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end) desc limit 1;
 foreach target in array array['standard','master','vip'] loop
   amount:=(case target when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 end)
    -(case previous when 'standard' then 4990 when 'master' then 8990 when 'vip' then 16990 else 0 end);
   if amount<=0 then continue; end if;
   begin
    perform public.touchline_club_assert_season_test_eligible(p_user_id,season.id,target,previous);
    result:=result||jsonb_build_object(target,jsonb_build_object('amountMinor',amount));
   exception when raise_exception then
    if sqlerrm not like 'SEASON_%' then raise; end if;
   end;
 end loop;
 return result;
exception when no_data_found then return '{}'::jsonb;
end $$;
revoke all on function public.touchline_club_quote_season_test_plans(uuid) from public,anon,authenticated;
grant execute on function public.touchline_club_quote_season_test_plans(uuid) to service_role;

commit;
