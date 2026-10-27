-- Approved fresh Beta model only. No backfill, legacy conversion, wallet grant or remote activation.
begin;
set local lock_timeout='5s';
create function public.touchline_club_assert_beta_club(p_plan text,p_club uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_plan='beta' and not exists(select 1 from public.football_clubs where id=p_club and provider='sportmonks' and provider_team_id::text=any(array['22','117','116','52','3','13']::text[])) then raise exception 'CLUB_CLUB_NOT_ALLOWED'; end if;
end $$;
revoke all on function public.touchline_club_assert_beta_club(text,uuid) from public,anon,authenticated;
grant execute on function public.touchline_club_assert_beta_club(text,uuid) to service_role;
do $constraint$
declare c record; matches integer:=0;
begin
 for c in select conname,pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.touchline_club_collections'::regclass and contype='c' loop
  if c.def like '%plan%' and c.def like '%standard%' and c.def like '%master%' and c.def like '%vip%' then
   matches:=matches+1;execute format('alter table public.touchline_club_collections drop constraint %I',c.conname);
  end if;
 end loop;
 if matches<>1 then raise exception 'CLUB_BETA_PLAN_CONSTRAINT_MISMATCH';end if;
 alter table public.touchline_club_collections add constraint club_collection_supported_plan check(state->>'plan' in('beta','standard','master','vip'));
end $constraint$;
-- Patch installed functions instead of replacing predecessor lock/idempotency fixes.
do $patch$
declare r record; target oid; definition text; patched text; owner_before oid; acl_before aclitem[]; config_before text[]; security_before boolean;
begin
 for r in select * from (values
 ($s0$public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)$s0$,$o0$when v_plan_key = 'beta' then 50000000$o0$,$n0$when v_plan_key = 'beta' then 100000000$n0$),
 ($s1$public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)$s1$,$o1$when v_plan_key = 'beta' then 50000000$o1$,$n1$when v_plan_key = 'beta' then 100000000$n1$),
 ($s2$public.touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text)$s2$,$o2$when v_plan_key = 'beta' then 50000000$o2$,$n2$when v_plan_key = 'beta' then 100000000$n2$),
 ($s3$public.touchline_fantasy_enroll_beta(uuid,text)$s3$,$o3$'budgetEur',50000000$o3$,$n3$'budgetEur',100000000$n3$),
 ($s4$public.touchline_club_initialize_collection(uuid,uuid,text,jsonb)$s4$,$o4$v_budget := case p_plan when 'standard'$o4$,$n4$v_budget := case p_plan when 'beta' then 100000000 when 'standard'$n4$),
 ($s5$public.touchline_club_initialize_collection(uuid,uuid,text,jsonb)$s5$,$o5$  if v_budget is null or v_coach_value is null$o5$,$n5$  if p_plan = 'beta' and p_coach->>'tier' is distinct from 'ruby-red' then raise exception 'CLUB_BETA_COACH_REQUIRED'; end if;
  if v_budget is null or v_coach_value is null$n5$),
 ($s6$public.touchline_club_commit_acquisition(uuid,uuid,bigint,jsonb,jsonb)$s6$,$o6$  v_price := (v_player->>'valueEur')::numeric;$o6$,$n6$  perform public.touchline_club_assert_beta_club(v_current.state->>'plan',(v_player->>'clubId')::uuid);
  v_price := (v_player->>'valueEur')::numeric;$n6$),
 ($s7$public.touchline_club_coach_lifecycle(uuid,uuid,jsonb,jsonb)$s7$,$o7$not in ('standard','master','vip')$o7$,$n7$not in ('beta','standard','master','vip')$n7$),
 ($s8$public.touchline_club_exchange_assert_owner(uuid,uuid,jsonb)$s8$,$o8$not in('standard','master','vip')$o8$,$n8$not in('beta','standard','master','vip')$n8$),
 ($s9$public.touchline_club_exchange_discovery(uuid,uuid)$s9$,$o9$other.state->>'plan' in('standard','master','vip')$o9$,$n9$other.state->>'plan' in('beta','standard','master','vip')$n9$),
 ($s10$public.touchline_club_exchange_propose(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint)$s10$,$o10$rate:=case a.state->>'plan' when 'standard'$o10$,$n10$rate:=case a.state->>'plan' when 'beta' then 7 when 'standard'$n10$),
 ($s11$public.touchline_club_exchange_propose(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint)$s11$,$o11$ oa:=public.touchline_club_exchange_offer(p_out,p_season);ob:=public.touchline_club_exchange_offer(p_in,p_season);$o11$,$n11$ oa:=public.touchline_club_exchange_offer(p_out,p_season);ob:=public.touchline_club_exchange_offer(p_in,p_season);
 perform public.touchline_club_assert_beta_club(a.state->>'plan',(ob->>'clubId')::uuid);
 perform public.touchline_club_assert_beta_club(b.state->>'plan',(oa->>'clubId')::uuid);$n11$),
 ($s12$public.touchline_club_exchange_resolve(uuid,uuid,uuid,text)$s12$,$o12$ oa:=public.touchline_club_exchange_offer((proposal.terms->'outgoing'->>'playerId')::uuid,p_season);ob:=public.touchline_club_exchange_offer((proposal.terms->'incoming'->>'playerId')::uuid,p_season);$o12$,$n12$ oa:=public.touchline_club_exchange_offer((proposal.terms->'outgoing'->>'playerId')::uuid,p_season);ob:=public.touchline_club_exchange_offer((proposal.terms->'incoming'->>'playerId')::uuid,p_season);
 perform public.touchline_club_assert_beta_club(a.state->>'plan',(ob->>'clubId')::uuid);
 perform public.touchline_club_assert_beta_club(b.state->>'plan',(oa->>'clubId')::uuid);$n12$),
 ($s13$public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)$s13$,$o13$begin
$o13$,$n13$begin
  if exists(select 1 from public.touchline_fantasy_entitlements where user_id=p_user_id and entitlement_key='fantasy_access' and status='active' and plan_key='beta' and (current_period_start is null or current_period_start<=clock_timestamp()) and (current_period_end is null or current_period_end>clock_timestamp())) then raise exception 'CLUB_COLLECTION_ROUTE_REQUIRED'; end if;
$n13$),
 ($s14$public.checkout_touchline_market_cart(uuid,uuid[],text)$s14$,$o14$begin
$o14$,$n14$begin
  if exists(select 1 from public.touchline_fantasy_entitlements where user_id=requested_user_id and entitlement_key='fantasy_access' and status='active' and plan_key='beta' and (current_period_start is null or current_period_start<=clock_timestamp()) and (current_period_end is null or current_period_end>clock_timestamp())) then raise exception 'CLUB_COLLECTION_ROUTE_REQUIRED'; end if;
$n14$),
 ($s15$public.touchline_hire_coach_contract(uuid,text,uuid,text)$s15$,$o15$begin
$o15$,$n15$begin
  if exists(select 1 from public.touchline_fantasy_entitlements where user_id=p_user_id and entitlement_key='fantasy_access' and status='active' and plan_key='beta' and (current_period_start is null or current_period_start<=clock_timestamp()) and (current_period_end is null or current_period_end>clock_timestamp())) then raise exception 'CLUB_COLLECTION_ROUTE_REQUIRED'; end if;
$n15$)
 ) as changes(signature,old_text,new_text) loop
  target:=to_regprocedure(r.signature);if target is null then raise exception 'CLUB_BETA_SOURCE_MISSING: %',r.signature;end if;
  select pg_get_functiondef(oid),proowner,proacl,proconfig,prosecdef into definition,owner_before,acl_before,config_before,security_before from pg_proc where oid=target;
  if (length(definition)-length(replace(definition,r.old_text,'')))/length(r.old_text)<>1 then raise exception 'CLUB_BETA_SOURCE_MISMATCH: %',r.signature;end if;
  patched:=replace(definition,r.old_text,r.new_text);execute patched;
  if not exists(select 1 from pg_proc where oid=target and proowner=owner_before and proacl is not distinct from acl_before and proconfig is not distinct from config_before and prosecdef=security_before and pg_get_functiondef(oid)=patched) then raise exception 'CLUB_BETA_FUNCTION_DRIFT';end if;
 end loop;
end $patch$;
commit;
