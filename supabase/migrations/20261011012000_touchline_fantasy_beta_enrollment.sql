-- Explicit self-enrollment only: no account scan, mass grant, payment or TC.
-- Existing non-Beta plans, including inactive/legacy plans, are never replaced.
begin;
set local lock_timeout = '5s';

alter table public.touchline_fantasy_entitlements
  drop constraint touchline_fantasy_entitlements_source_check,
  add constraint touchline_fantasy_entitlements_source_check
    check (source in ('stripe_test', 'qa_grant', 'owner_vip_grant', 'beta_free'));

create table public.touchline_fantasy_beta_enrollments (
  user_id uuid primary key references auth.users(id) on delete restrict,
  recorded_at timestamptz not null,
  created_entitlement boolean not null,
  profile_created boolean not null,
  before_entitlement jsonb,
  after_entitlement jsonb not null,
  receipt jsonb not null
);
alter table public.touchline_fantasy_beta_enrollments enable row level security;
revoke all on table public.touchline_fantasy_beta_enrollments from public, anon, authenticated, service_role;
grant select on table public.touchline_fantasy_beta_enrollments to service_role;

create function public.touchline_fantasy_beta_enrollment_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'BETA_AUDIT_IMMUTABLE';
end;
$$;
create trigger touchline_fantasy_beta_enrollment_immutable
  before update or delete on public.touchline_fantasy_beta_enrollments
  for each row execute function public.touchline_fantasy_beta_enrollment_immutable();
revoke all on function public.touchline_fantasy_beta_enrollment_immutable() from public, anon, authenticated, service_role;

create function public.touchline_fantasy_enroll_beta(p_user_id uuid, p_user_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_entitlement public.touchline_fantasy_entitlements%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_created boolean := false;
  v_profile_created boolean := false;
  v_now timestamptz;
  v_receipt jsonb;
begin
  if p_user_id is null or p_user_email is null or p_user_email <> lower(btrim(p_user_email)) then
    raise exception 'BETA_FORBIDDEN';
  end if;
  -- Same owner-registration mutex as VIP, followed by the common entitlement
  -- lock used by VIP and signed Stripe events. Never infer identity from metadata.
  perform pg_advisory_xact_lock(hashtext('touchline-founding-20-2026'));
  perform account.id from auth.users account
    where account.id=p_user_id and lower(account.email)=p_user_email
      and account.email_confirmed_at is not null
      and account.raw_app_meta_data -> 'touchline_arena_access_v1' = 'true'::jsonb
    for share;
  if not found then raise exception 'BETA_FORBIDDEN'; end if;
  if exists (select 1 from public.touchline_platform_owner_accounts owner_account
    where owner_account.user_id=p_user_id or owner_account.normalized_email=p_user_email) then
    raise exception 'BETA_OWNER_EXCLUDED';
  end if;
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:' || p_user_id::text,0));
  select * into v_entitlement from public.touchline_fantasy_entitlements
    where user_id=p_user_id and entitlement_key='fantasy_access' for update;
  v_now := clock_timestamp();
  if found then
    v_before := to_jsonb(v_entitlement);
    if v_entitlement.plan_key is distinct from 'beta' then
      if v_entitlement.status='active'
        and (v_entitlement.current_period_start is null or v_entitlement.current_period_start <= v_now)
        and (v_entitlement.current_period_end is null or v_entitlement.current_period_end > v_now) then
        raise exception 'BETA_ACTIVE_PLAN_PRESERVED';
      end if;
      raise exception 'BETA_EXISTING_PLAN_REQUIRES_REVIEW';
    end if;
    if v_entitlement.status <> 'active'
      or (v_entitlement.current_period_start is not null and v_entitlement.current_period_start > v_now)
      or (v_entitlement.current_period_end is not null and v_entitlement.current_period_end <= v_now) then
      raise exception 'BETA_EXISTING_PLAN_REQUIRES_REVIEW';
    end if;
  else
    -- An old immutable receipt without its entitlement is a recovery issue,
    -- never permission to recreate access after a separate administrative action.
    if exists (select 1 from public.touchline_fantasy_beta_enrollments where user_id=p_user_id) then
      raise exception 'BETA_EXISTING_PLAN_REQUIRES_REVIEW';
    end if;
    insert into public.users(id,full_name) values(p_user_id,'TouchLine ClubOwner') on conflict(id) do nothing;
    v_profile_created := found;
    insert into public.touchline_fantasy_entitlements
      (user_id,entitlement_key,status,source,plan_key,current_period_start,current_period_end,metadata)
      values (p_user_id,'fantasy_access','active','beta_free','beta',null,null,
        jsonb_build_object('complimentary',true,'enrollment','self_service'))
      returning * into v_entitlement;
    v_created := true;
  end if;
  v_after := to_jsonb(v_entitlement);
  v_receipt := jsonb_build_object('ok',true,'planKey','beta','status','active',
    'budgetEur',50000000,'allowedClubTeamIds',jsonb_build_array('22','117','116','52'));
  insert into public.touchline_fantasy_beta_enrollments
    (user_id,recorded_at,created_entitlement,profile_created,before_entitlement,after_entitlement,receipt)
    values(p_user_id,v_now,v_created,v_profile_created,v_before,v_after,v_receipt)
    on conflict(user_id) do nothing;
  -- Re-evaluate current entitlement on every retry; a historic Beta receipt
  -- never grants Beta after this account has moved to another plan.
  return v_receipt;
end;
$$;
revoke all on function public.touchline_fantasy_enroll_beta(uuid,text) from public, anon, authenticated;
grant execute on function public.touchline_fantasy_enroll_beta(uuid,text) to service_role;

-- Late legacy events may be recorded and deduplicated, but cannot cancel or
-- convert this free enrollment. The existing VIP protection remains in place.
do $migration$
declare v_source text; v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_apply_test_subscription_event(text,timestamptz,text,boolean,uuid,text,text,text,timestamptz,timestamptz)'::regprocedure) into v_source;
  v_patched := replace(v_source,
    '  if not v_claimed then return jsonb_build_object(''ok'', true, ''duplicate'', true, ''stale'', false); end if;',
    '  if not v_claimed then return jsonb_build_object(''ok'', true, ''duplicate'', true, ''stale'', false); end if;' || chr(10)
    || '  if exists (select 1 from public.touchline_fantasy_entitlements where user_id=p_user_id' || chr(10)
    || '    and entitlement_key=''fantasy_access'' and source=''beta_free'' and plan_key=''beta'' and status=''active'') then' || chr(10)
    || '    return jsonb_build_object(''ok'',true,''duplicate'',false,''stale'',false,''complimentaryBetaPreserved'',true);' || chr(10)
    || '  end if;');
  if v_patched = v_source then raise exception 'BETA_SUBSCRIPTION_GUARD_SOURCE_MISMATCH'; end if;
  execute v_patched;
end;
$migration$;
comment on table public.touchline_fantasy_beta_enrollments is
  'Immutable self-service free Beta enrollment receipts; fixed 50M TC/four-club game-budget policy. No payments, wallet-credit grants, lineup or scoring mutations.';
commit;
