-- Deactivate the retired Founding 20 / 35 TC automatic welcome bonus.
--
-- Historical rows in touchline_beta_tc_grants and clubowner_credit_ledger are
-- intentionally preserved. This migration only prevents future automatic
-- credits if an older server still calls the retired RPC.

create or replace function public.claim_touchline_beta_welcome_grant(requested_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if requested_user_id is null then
    raise exception 'TL_BETA_GRANT_USER_REQUIRED';
  end if;

  return jsonb_build_object(
    'granted', false,
    'campaignClosed', true,
    'amountTc', 0
  );
end;
$$;

revoke all on function public.claim_touchline_beta_welcome_grant(uuid) from public, anon, authenticated;
grant execute on function public.claim_touchline_beta_welcome_grant(uuid) to service_role;

comment on function public.claim_touchline_beta_welcome_grant(uuid) is
  'Retired compatibility boundary. New TouchLine accounts receive Arena access only and 0 automatic TC; historical ledgers are preserved.';
