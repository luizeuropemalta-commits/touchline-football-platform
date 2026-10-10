-- QA-only read gate after each guarded squad fetch. Never enables a scope.
-- It estimates three possible attempts per remaining club above a 500-call
-- entity floor. This read checkpoint is not a reservation of the entire run.
-- The forward admission guard must recheck the floor under the account lock
-- before each HTTP; a competing consumer may still make the run abort safely.
begin;
set local lock_timeout = '5s';

create or replace function public.touchline_qa_roster_quota_checkpoint(
  p_project_ref text,
  p_account_scope text,
  p_remaining_clubs integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope public.touchline_fixture_quota_scopes;
  v_basic jsonb;
  v_extended jsonb;
  v_now timestamptz := clock_timestamp();
  v_floor integer;
begin
  if p_project_ref is distinct from 'xgxbwqxjssxxuihuwmgy'
    or p_account_scope is null or p_account_scope !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_remaining_clubs is null or p_remaining_clubs < 0 or p_remaining_clubs > 20 then
    return jsonb_build_object('allowed',false);
  end if;
  perform public.touchline_assert_qa_fixture_target(p_project_ref);
  select * into v_scope from public.touchline_fixture_quota_scopes
    where account_scope = p_account_scope for share;
  if not found or not v_scope.enabled or v_scope.blocked_unknown
    or v_scope.active_token is not null or v_scope.cooldown_until > v_now then
    return jsonb_build_object('allowed',false);
  end if;
  select observation into v_basic from public.touchline_fixture_quota_attempts
    where account_scope = p_account_scope and endpoint = 'squad' and completed_at is not null
    order by admitted_at desc limit 1;
  select observation into v_extended from public.touchline_fixture_quota_attempts
    where account_scope = p_account_scope and endpoint = 'squadExtended' and completed_at is not null
    order by admitted_at desc limit 1;
  v_floor := 500 + 3 * p_remaining_clubs;
  if v_basic is null or v_extended is null
    or v_basic->>'requestedEntity' is distinct from 'PlayerTeam'
    or v_extended->>'requestedEntity' is distinct from 'Player'
    or v_basic->>'status' is null or v_extended->>'status' is null
    or v_basic->>'remaining' is null or v_extended->>'remaining' is null
    or v_basic->>'observedAt' is null or v_extended->>'observedAt' is null
    or v_basic->>'resetAt' is null or v_extended->>'resetAt' is null
    or (v_basic->>'status')::integer not between 200 and 299
    or (v_extended->>'status')::integer not between 200 and 299
    or (v_basic->>'remaining')::integer < v_floor
    or (v_extended->>'remaining')::integer < v_floor
    or (v_basic->>'observedAt')::timestamptz not between v_now - interval '2 minutes' and v_now
    or (v_extended->>'observedAt')::timestamptz not between v_now - interval '2 minutes' and v_now
    or (v_basic->>'resetAt')::timestamptz <= v_now
    or (v_extended->>'resetAt')::timestamptz <= v_now then
    return jsonb_build_object('allowed',false);
  end if;
  return jsonb_build_object('allowed',true,'remaining_clubs',p_remaining_clubs);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('allowed',false);
end;
$$;

revoke all on function public.touchline_qa_roster_quota_checkpoint(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.touchline_qa_roster_quota_checkpoint(text,text,integer)
  to service_role;
commit;
