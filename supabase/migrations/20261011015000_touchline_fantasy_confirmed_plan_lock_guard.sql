-- A confirmed XI may become immutable only when the server-owned plan which
-- authorized its snapshot is still current and active at the locking instant.
-- This is intentionally additive: historical LOCKED/FINAL records are never
-- rewritten. A CONFIRMED XI which cannot be locked returns to DRAFT so it
-- cannot block scoring for other customers in the same gameweek. Market-close
-- guards still prevent it from being edited or re-confirmed.

begin;
set local lock_timeout = '5s';

alter table public.touchline_fantasy_audit_events
  drop constraint if exists touchline_fantasy_audit_events_event_type_check,
  add constraint touchline_fantasy_audit_events_event_type_check
    check (event_type in (
      'DRAFT_SAVED', 'XI_CONFIRMED', 'XI_LOCKED', 'XI_REJECTED',
      'SCORE_RECONCILED', 'ENTITLEMENT_CHANGED'
    ));

do $migration$
declare
  v_definition text;
  v_patched text;
  v_plan_guard text := $guard$
    and user_gameweek.market_plan_key_snapshot in ('beta', 'standard', 'pro', 'master', 'vip')
    and case user_gameweek.market_plan_key_snapshot
      when 'beta' then user_gameweek.budget_eur_snapshot = 50000000
      when 'standard' then user_gameweek.budget_eur_snapshot = 500000000
      when 'pro' then user_gameweek.budget_eur_snapshot = 1000000000
      when 'master' then user_gameweek.budget_eur_snapshot = 2000000000
      when 'vip' then user_gameweek.budget_eur_snapshot is null
      else false
    end
    and (user_gameweek.market_plan_key_snapshot = 'vip' or (
      select coalesce(sum(current_selection.market_value_eur), 0)
      from public.touchline_fantasy_user_gameweek_selections current_selection
      where current_selection.user_gameweek_id = user_gameweek.id
    ) <= case user_gameweek.market_plan_key_snapshot
      when 'beta' then 50000000
      when 'standard' then 500000000
      when 'pro' then 1000000000
      when 'master' then 2000000000
    end)
    and exists (
      select 1
      from public.touchline_fantasy_entitlements entitlement
      where entitlement.user_id = user_gameweek.user_id
        and entitlement.entitlement_key = 'fantasy_access'
        and entitlement.status = 'active'
        and entitlement.plan_key = user_gameweek.market_plan_key_snapshot
        and (entitlement.current_period_start is null or entitlement.current_period_start <= v_lock_observed_at)
        and (entitlement.current_period_end is null or entitlement.current_period_end > v_lock_observed_at)
    )$guard$;
begin
  select pg_get_functiondef('public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure)
    into v_definition;

  v_patched := replace(
    v_definition,
    $before$    and (select count(*) from public.touchline_fantasy_user_gameweek_selections check_selection
      where check_selection.user_gameweek_id = user_gameweek.id) = 11
  on conflict do nothing;$before$,
    $after$    and (select count(*) from public.touchline_fantasy_user_gameweek_selections check_selection
      where check_selection.user_gameweek_id = user_gameweek.id) = 11$after$ || v_plan_guard || $after$
  on conflict do nothing;$after$
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_CONFIRMED_PLAN_LOCK_SOURCE_MISMATCH_1';
  end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    $before$  v_effective_locks_at timestamptz;$before$,
    $after$  v_effective_locks_at timestamptz;
  v_lock_observed_at timestamptz;
  v_confirmed_user_id uuid;
  v_rejected_user_ids uuid[] := array[]::uuid[];$after$
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_CONFIRMED_PLAN_LOCK_SOURCE_MISMATCH_2';
  end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    $before$  insert into public.touchline_fantasy_locked_selections ($before$,
    $after$  -- This is the same per-user mutex used by entitlement grant and
  -- provider-event writers. Acquire it in user-id order, then observe one
  -- entitlement instant used by both locked-row writes and the state change.
  for v_confirmed_user_id in
    select distinct user_gameweek.user_id
    from public.touchline_fantasy_user_gameweeks user_gameweek
    where user_gameweek.gameweek_id = p_gameweek_id
      and user_gameweek.state = 'CONFIRMED'
    order by user_gameweek.user_id
  loop
    perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'touchline-fantasy-subscription:' || v_confirmed_user_id::text, 0
    ));
  end loop;
  v_lock_observed_at := clock_timestamp();

  insert into public.touchline_fantasy_locked_selections ($after$
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_CONFIRMED_PLAN_LOCK_SOURCE_MISMATCH_3';
  end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    $before$    and (select count(*) from public.touchline_fantasy_locked_selections locked
      where locked.user_gameweek_id = user_gameweek.id) = 11;$before$,
    $after$    and (select count(*) from public.touchline_fantasy_locked_selections locked
      where locked.user_gameweek_id = user_gameweek.id) = 11$after$ || v_plan_guard || $after$;

  -- Do not leave a known-ineligible confirmation able to block the whole
  -- game's reconciliation. DRAFT is an existing non-scoring state and market
  -- closure blocks edits/reconfirmation; LOCKED/FINAL snapshots are untouched.
  with rejected as (
    update public.touchline_fantasy_user_gameweeks user_gameweek
    set state = 'DRAFT'
    where user_gameweek.gameweek_id = p_gameweek_id
      and user_gameweek.state = 'CONFIRMED'
    returning user_gameweek.user_id
  )
  select coalesce(array_agg(rejected.user_id), array[]::uuid[])
    into v_rejected_user_ids
  from rejected;$after$
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_CONFIRMED_PLAN_LOCK_SOURCE_MISMATCH_4';
  end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    $before$  return jsonb_build_object('ok', true, 'lockedSelectionRows', v_locked);$before$,
    $after$  insert into public.touchline_fantasy_audit_events (user_id, gameweek_id, event_type, metadata)
  select rejected.user_id, p_gameweek_id, 'XI_REJECTED',
    jsonb_build_object(
      'beforeState', 'CONFIRMED',
      'observedAt', v_lock_observed_at,
      'reason', 'LOCK_ELIGIBILITY_REJECTED'
    )
  from unnest(v_rejected_user_ids) as rejected(user_id)
  where not exists (select 1 from public.touchline_fantasy_audit_events audit
      where audit.user_id = rejected.user_id and audit.gameweek_id = p_gameweek_id
        and audit.event_type = 'XI_REJECTED');
  return jsonb_build_object('ok', true, 'lockedSelectionRows', v_locked);$after$
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_CONFIRMED_PLAN_LOCK_SOURCE_MISMATCH_5';
  end if;

  execute v_patched;
end
$migration$;

comment on function public.touchline_fantasy_lock_gameweek(uuid) is
  'Service-role-only. Locks only a complete CONFIRMED XI whose immutable server-owned plan snapshot matches a currently active, unexpired entitlement; unknown, expired, or downgraded plans return to audit-recorded DRAFT and cannot block reconciliation.';

commit;
