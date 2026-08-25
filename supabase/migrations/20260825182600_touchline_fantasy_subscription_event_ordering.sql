-- Keep QA Stripe Test Mode entitlement transitions monotonic when signed
-- provider events are retried or delivered out of order.

begin;
set local lock_timeout = '5s';

alter table public.touchline_fantasy_subscription_events
  add column if not exists provider_event_created_at timestamptz;

alter table public.touchline_fantasy_entitlements
  add column if not exists last_provider_event_created_at timestamptz;

update public.touchline_fantasy_entitlements entitlement
set last_provider_event_created_at = coalesce((
  select max(event.processed_at)
  from public.touchline_fantasy_subscription_events event
  where event.user_id = entitlement.user_id
    and event.provider_subscription_reference = entitlement.provider_subscription_reference
), entitlement.updated_at)
where entitlement.source = 'stripe_test'
  and entitlement.last_provider_event_created_at is null;

drop function if exists public.touchline_fantasy_apply_test_subscription_event(
  text, text, boolean, uuid, text, text, text, timestamptz, timestamptz
);

create function public.touchline_fantasy_apply_test_subscription_event(
  p_provider_event_id text,
  p_provider_event_created_at timestamptz,
  p_event_type text,
  p_livemode boolean,
  p_user_id uuid,
  p_provider_customer_reference text,
  p_provider_subscription_reference text,
  p_entitlement_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
  v_existing_event_created_at timestamptz;
begin
  if p_livemode then raise exception 'TL_FANTASY_LIVE_BILLING_FORBIDDEN'; end if;
  if p_provider_event_created_at is null then raise exception 'TL_FANTASY_EVENT_CREATED_AT_REQUIRED'; end if;
  if p_entitlement_status not in ('active', 'inactive', 'past_due', 'canceled', 'expired') then raise exception 'TL_FANTASY_ENTITLEMENT_STATUS_INVALID'; end if;
  if length(btrim(coalesce(p_provider_event_id, ''))) < 8 then raise exception 'TL_FANTASY_EVENT_ID_INVALID'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'TL_FANTASY_USER_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-fantasy-subscription:' || p_user_id::text,
    0
  ));

  insert into public.touchline_fantasy_subscription_events (
    provider_event_id, provider_event_created_at, event_type, livemode, user_id,
    provider_subscription_reference, entitlement_status
  ) values (
    p_provider_event_id, p_provider_event_created_at, p_event_type, false, p_user_id,
    p_provider_subscription_reference, p_entitlement_status
  ) on conflict (provider_event_id) do nothing;
  v_claimed := found;
  if not v_claimed then return jsonb_build_object('ok', true, 'duplicate', true, 'stale', false); end if;

  select entitlement.last_provider_event_created_at
    into v_existing_event_created_at
  from public.touchline_fantasy_entitlements entitlement
  where entitlement.user_id = p_user_id
    and entitlement.entitlement_key = 'fantasy_access'
    and entitlement.source = 'stripe_test'
  for update;

  if v_existing_event_created_at is not null
     and p_provider_event_created_at < v_existing_event_created_at then
    return jsonb_build_object('ok', true, 'duplicate', false, 'stale', true);
  end if;

  insert into public.touchline_fantasy_entitlements (
    user_id, entitlement_key, status, source, provider_customer_reference,
    provider_subscription_reference, current_period_start, current_period_end,
    last_provider_event_created_at, metadata
  ) values (
    p_user_id, 'fantasy_access', p_entitlement_status, 'stripe_test', p_provider_customer_reference,
    p_provider_subscription_reference, p_current_period_start, p_current_period_end,
    p_provider_event_created_at,
    jsonb_build_object('lastEventId', p_provider_event_id, 'lastEventType', p_event_type)
  )
  on conflict (user_id, entitlement_key) do update
    set status = excluded.status,
        source = excluded.source,
        provider_customer_reference = excluded.provider_customer_reference,
        provider_subscription_reference = excluded.provider_subscription_reference,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        last_provider_event_created_at = excluded.last_provider_event_created_at,
        metadata = excluded.metadata;

  insert into public.touchline_fantasy_audit_events (user_id, event_type, metadata)
  values (p_user_id, 'ENTITLEMENT_CHANGED', jsonb_build_object(
    'source', 'stripe_test', 'status', p_entitlement_status, 'eventType', p_event_type,
    'providerEventCreatedAt', p_provider_event_created_at
  ));

  return jsonb_build_object('ok', true, 'duplicate', false, 'stale', false, 'status', p_entitlement_status);
end;
$$;

revoke all on function public.touchline_fantasy_apply_test_subscription_event(
  text, timestamptz, text, boolean, uuid, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.touchline_fantasy_apply_test_subscription_event(
  text, timestamptz, text, boolean, uuid, text, text, text, timestamptz, timestamptz
) to service_role;

comment on column public.touchline_fantasy_entitlements.last_provider_event_created_at is
  'Newest signed Stripe Test Mode event allowed to mutate this entitlement; older deliveries are audit-only.';

commit;
