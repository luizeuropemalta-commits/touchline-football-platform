-- Make the Founding 20 beta grant part of the same append-only ledger used by
-- the authoritative TouchLine Market. The public.users balance remains a
-- compatibility mirror; clubowner_credit_ledger is the spending source of truth.

insert into public.clubowner_credit_ledger (
  user_id,
  amount_cents,
  currency,
  entry_type,
  reason,
  idempotency_key,
  metadata,
  created_by,
  created_at
)
select
  beta_grant.user_id,
  beta_grant.amount_tc * 100,
  'EUR',
  'promotion',
  'TouchLine Founding 20 beta grant',
  'touchline-beta-welcome:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text,
  jsonb_build_object(
    'source', 'touchline_beta_welcome',
    'campaignKey', beta_grant.campaign_key,
    'amountTc', beta_grant.amount_tc,
    'slot', beta_grant.slot_number
  ),
  null,
  beta_grant.granted_at
from public.touchline_beta_tc_grants as beta_grant
on conflict (idempotency_key) do nothing;

create or replace function public.claim_touchline_beta_welcome_grant(requested_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  beta_grant public.touchline_beta_tc_grants%rowtype;
  next_slot integer;
begin
  if requested_user_id is null then
    raise exception using errcode = 'P0001', message = 'TL_BETA_AUTH_REQUIRED';
  end if;

  -- One global transaction lock keeps the 20-slot campaign race-safe.
  perform pg_advisory_xact_lock(hashtext('touchline-founding-20-2026'));

  select * into beta_grant
    from public.touchline_beta_tc_grants
   where user_id = requested_user_id;
  if found then
    -- Replays repair older grants that predate the authoritative ledger without
    -- ever issuing a second credit.
    insert into public.clubowner_credit_ledger (
      user_id,
      amount_cents,
      currency,
      entry_type,
      reason,
      idempotency_key,
      metadata,
      created_by,
      created_at
    ) values (
      beta_grant.user_id,
      beta_grant.amount_tc * 100,
      'EUR',
      'promotion',
      'TouchLine Founding 20 beta grant',
      'touchline-beta-welcome:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text,
      jsonb_build_object(
        'source', 'touchline_beta_welcome',
        'campaignKey', beta_grant.campaign_key,
        'amountTc', beta_grant.amount_tc,
        'slot', beta_grant.slot_number
      ),
      null,
      beta_grant.granted_at
    )
    on conflict (idempotency_key) do nothing;

    return jsonb_build_object(
      'granted', true,
      'alreadyGranted', true,
      'slot', beta_grant.slot_number,
      'amountTc', beta_grant.amount_tc
    );
  end if;

  perform id from public.users where id = requested_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TL_BETA_USER_NOT_FOUND';
  end if;

  select coalesce(max(slot_number), 0) + 1 into next_slot
    from public.touchline_beta_tc_grants;
  if next_slot > 20 then
    return jsonb_build_object('granted', false, 'campaignFull', true, 'amountTc', 0);
  end if;

  insert into public.touchline_beta_tc_grants (
    user_id,
    campaign_key,
    slot_number,
    amount_tc
  ) values (
    requested_user_id,
    'founding-20-2026',
    next_slot,
    35
  )
  returning * into beta_grant;

  -- Compatibility mirror for older admin reads. Market spending reads only the
  -- append-only ledger entry written below.
  update public.users
     set balance_cents = balance_cents + (beta_grant.amount_tc * 100),
         updated_at = now()
   where id = requested_user_id;

  insert into public.clubowner_credit_ledger (
    user_id,
    amount_cents,
    currency,
    entry_type,
    reason,
    idempotency_key,
    metadata,
    created_by,
    created_at
  ) values (
    beta_grant.user_id,
    beta_grant.amount_tc * 100,
    'EUR',
    'promotion',
    'TouchLine Founding 20 beta grant',
    'touchline-beta-welcome:' || beta_grant.campaign_key || ':' || beta_grant.user_id::text,
    jsonb_build_object(
      'source', 'touchline_beta_welcome',
      'campaignKey', beta_grant.campaign_key,
      'amountTc', beta_grant.amount_tc,
      'slot', beta_grant.slot_number
    ),
    null,
    beta_grant.granted_at
  )
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object(
    'granted', true,
    'alreadyGranted', false,
    'slot', beta_grant.slot_number,
    'amountTc', beta_grant.amount_tc
  );
end;
$$;

revoke all on function public.claim_touchline_beta_welcome_grant(uuid) from public, anon, authenticated;
grant execute on function public.claim_touchline_beta_welcome_grant(uuid) to service_role;
