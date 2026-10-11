-- Owner-issued, perpetual complimentary access for a confirmed auth account.
-- The application profile/access flag are provisioned in the same transaction.
-- No auth accounts, email, payments, wallet credits, lineups or scores change.
begin;
set local lock_timeout = '5s';

alter table public.touchline_fantasy_entitlements
  drop constraint touchline_fantasy_entitlements_source_check,
  add constraint touchline_fantasy_entitlements_source_check
    check (source in ('stripe_test', 'qa_grant', 'owner_vip_grant'));

create table public.touchline_fantasy_vip_grants (
  command_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_email text not null,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  target_email text not null,
  reason text not null check (length(reason) between 2 and 240),
  granted_at timestamptz not null,
  access_previously_granted boolean not null,
  profile_created boolean not null,
  before_entitlement jsonb,
  after_entitlement jsonb not null,
  receipt jsonb not null
);
alter table public.touchline_fantasy_vip_grants enable row level security;
revoke all on table public.touchline_fantasy_vip_grants from public, anon, authenticated, service_role;
grant select on table public.touchline_fantasy_vip_grants to service_role;

create function public.touchline_fantasy_vip_grant_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'VIP_AUDIT_IMMUTABLE';
end;
$$;
create trigger touchline_fantasy_vip_grant_immutable
  before update or delete on public.touchline_fantasy_vip_grants
  for each row execute function public.touchline_fantasy_vip_grant_immutable();
revoke all on function public.touchline_fantasy_vip_grant_immutable() from public, anon, authenticated, service_role;

create function public.touchline_fantasy_grant_vip_access(
  p_actor_id uuid, p_actor_email text, p_target_email text, p_reason text, p_command_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.touchline_fantasy_vip_grants%rowtype;
  v_target record;
  v_target_id uuid;
  v_target_confirmed timestamptz;
  v_target_metadata jsonb;
  v_access_previously_granted boolean;
  v_profile_created boolean;
  v_count integer := 0;
  v_before jsonb;
  v_after jsonb;
  v_receipt jsonb;
  v_now timestamptz;
begin
  if p_command_id is null or p_actor_id is null or p_actor_email is null
     or p_target_email is null or p_reason is null
     or p_target_email <> lower(btrim(p_target_email))
     or length(p_target_email) not between 3 and 254
     or p_target_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or p_reason <> btrim(p_reason) or length(p_reason) not between 2 and 240
     or p_reason ~ '[[:cntrl:]]' or p_target_email ~ '[[:cntrl:]]' then
    raise exception 'VIP_INVALID_COMMAND';
  end if;
  -- Owner email allowlisting is enforced by the authenticated HTTP boundary.
  -- The service-only RPC independently verifies canonical actor identity and
  -- server-owned access metadata, never raw_user_meta_data.
  perform actor.id from auth.users actor
    where actor.id = p_actor_id and lower(actor.email) = p_actor_email
      and actor.email_confirmed_at is not null
      and actor.raw_app_meta_data -> 'touchline_arena_access_v1' = 'true'::jsonb
    for share;
  if not found then raise exception 'VIP_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-vip-command:' || p_command_id::text, 0));
  select * into v_existing from public.touchline_fantasy_vip_grants where command_id = p_command_id;
  if found then
    if v_existing.actor_id <> p_actor_id or v_existing.actor_email <> p_actor_email
       or v_existing.target_email <> p_target_email or v_existing.reason <> p_reason then
      raise exception 'VIP_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok', true, 'replay', true, 'grant', v_existing.receipt);
  end if;
  -- Match the existing platform-owner registration mutex, so the persisted
  -- admin-only boundary cannot change while gameplay access is provisioned.
  perform pg_advisory_xact_lock(hashtext('touchline-founding-20-2026'));
  for v_target in select account.id, account.email_confirmed_at, account.raw_app_meta_data from auth.users account
    where lower(account.email) = p_target_email for update
  loop
    v_count := v_count + 1; v_target_id := v_target.id; v_target_confirmed := v_target.email_confirmed_at;
    v_target_metadata := v_target.raw_app_meta_data;
  end loop;
  if v_count = 0 then raise exception 'VIP_TARGET_NOT_REGISTERED'; end if;
  if v_count <> 1 then raise exception 'VIP_TARGET_AMBIGUOUS'; end if;
  if v_target_confirmed is null then raise exception 'VIP_TARGET_EMAIL_UNVERIFIED'; end if;
  if v_target_id = p_actor_id or exists (
    select 1 from public.touchline_platform_owner_accounts owner_account
    where owner_account.user_id = v_target_id or owner_account.normalized_email = p_target_email
  ) then raise exception 'VIP_OWNER_EXCLUDED'; end if;
  if v_target_metadata is not null and jsonb_typeof(v_target_metadata) <> 'object' then
    raise exception 'VIP_TARGET_METADATA_INVALID';
  end if;
  v_access_previously_granted := coalesce(v_target_metadata -> 'touchline_arena_access_v1' = 'true'::jsonb, false);
  -- Exactly the same lock as the signed Stripe Test event application. A
  -- concurrent provider cancellation cannot overwrite a complimentary grant.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:' || v_target_id::text, 0));
  select to_jsonb(entitlement) into v_before from public.touchline_fantasy_entitlements entitlement
    where user_id = v_target_id and entitlement_key = 'fantasy_access' for update;
  -- A paid entitlement cannot be replaced until a separately audited billing
  -- operation has confirmed that future renewals are stopped. Otherwise this
  -- upsert would erase provider references while billing could continue.
  if v_before is not null and (
    v_before ->> 'source' = 'stripe_test'
    or nullif(v_before ->> 'provider_subscription_reference', '') is not null
    or nullif(v_before ->> 'provider_customer_reference', '') is not null
  ) then
    raise exception 'VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED';
  end if;
  v_now := clock_timestamp();
  -- Same minimal profile as Arena onboarding, without user-editable metadata
  -- as authority, without replacing an existing profile, and without TC grants.
  insert into public.users(id,full_name) values(v_target_id,'TouchLine ClubOwner')
    on conflict(id) do nothing;
  v_profile_created := found;
  update auth.users set raw_app_meta_data = coalesce(v_target_metadata,'{}'::jsonb)
    || jsonb_build_object('touchline_arena_access_v1',true), updated_at = v_now
    where id = v_target_id;
  insert into public.touchline_fantasy_entitlements
    (user_id,entitlement_key,status,source,plan_key,current_period_start,current_period_end,metadata)
    values (v_target_id,'fantasy_access','active','owner_vip_grant','vip',null,null,
      jsonb_build_object('vipCommandId',p_command_id,'grantedBy',p_actor_id,'complimentary',true))
    on conflict (user_id,entitlement_key) do update set
      status='active', source='owner_vip_grant', plan_key='vip',
      current_period_start=null, current_period_end=null,
      provider_customer_reference=null, provider_subscription_reference=null, last_provider_event_created_at=null,
      metadata=excluded.metadata;
  select to_jsonb(entitlement) into v_after from public.touchline_fantasy_entitlements entitlement
    where user_id = v_target_id and entitlement_key = 'fantasy_access';
  v_receipt := jsonb_build_object('commandId',p_command_id,'targetUserId',v_target_id,
    'planKey','vip','status','active','source','owner_vip_grant','expiresAt',null,'grantedAt',v_now,'accessReady',true);
  insert into public.touchline_fantasy_vip_grants
    (command_id,actor_id,actor_email,target_user_id,target_email,reason,granted_at,
     access_previously_granted,profile_created,before_entitlement,after_entitlement,receipt)
    values (p_command_id,p_actor_id,p_actor_email,v_target_id,p_target_email,p_reason,v_now,
     v_access_previously_granted,v_profile_created,v_before,v_after,v_receipt);
  return jsonb_build_object('ok',true,'replay',false,'grant',v_receipt);
end;
$$;
revoke all on function public.touchline_fantasy_grant_vip_access(uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.touchline_fantasy_grant_vip_access(uuid,text,text,text,uuid) to service_role;

-- Preserve event deduplication/auditing but make the older Stripe path unable
-- to revoke or reprice a complimentary VIP entitlement. No Stripe request runs.
do $migration$
declare v_source text; v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_apply_test_subscription_event(text,timestamptz,text,boolean,uuid,text,text,text,timestamptz,timestamptz)'::regprocedure) into v_source;
  v_patched := replace(v_source,
    '  if not v_claimed then return jsonb_build_object(''ok'', true, ''duplicate'', true, ''stale'', false); end if;',
    '  if not v_claimed then return jsonb_build_object(''ok'', true, ''duplicate'', true, ''stale'', false); end if;' || chr(10)
    || '  if exists (select 1 from public.touchline_fantasy_entitlements where user_id=p_user_id' || chr(10)
    || '    and entitlement_key=''fantasy_access'' and source=''owner_vip_grant'' and plan_key=''vip'' and status=''active'') then' || chr(10)
    || '    return jsonb_build_object(''ok'',true,''duplicate'',false,''stale'',false,''complimentaryVipPreserved'',true);' || chr(10)
    || '  end if;');
  if v_patched = v_source then raise exception 'VIP_SUBSCRIPTION_GUARD_SOURCE_MISMATCH'; end if;
  execute v_patched;
end;
$migration$;
comment on table public.touchline_fantasy_vip_grants is
  'Immutable owner-authorized complimentary VIP receipts. Perpetual administrative access; no invitation, payment, credits or scoring mutation.';
commit;
