-- Server-owned XI budgets for persisted Fantasy plans. NULL means genuinely
-- unlimited only for VIP; it is never a large numeric sentinel. A missing plan
-- fails closed without an authenticated plan entitlement.

begin;
set local lock_timeout = '5s';

alter table public.touchline_fantasy_user_gameweeks
  alter column budget_eur_snapshot drop not null;

alter table public.touchline_fantasy_user_gameweeks
  drop constraint if exists touchline_fantasy_user_gameweeks_budget_eur_snapshot_check,
  add constraint touchline_fantasy_user_gameweeks_budget_eur_snapshot_check
    check (budget_eur_snapshot is null or budget_eur_snapshot > 0),
  add column if not exists market_plan_key_snapshot text,
  drop constraint if exists touchline_fantasy_user_gameweeks_market_plan_key_snapshot_check,
  add constraint touchline_fantasy_user_gameweeks_market_plan_key_snapshot_check
    check (market_plan_key_snapshot is null or market_plan_key_snapshot in ('beta', 'standard', 'pro', 'master', 'vip'));

comment on column public.touchline_fantasy_user_gameweeks.budget_eur_snapshot is
  'Server-resolved XI budget at draft creation or save. NULL means unlimited only for a VIP entitlement.';
comment on column public.touchline_fantasy_user_gameweeks.market_plan_key_snapshot is
  'Server-owned entitlement plan recorded with a mutable draft or immutable locked XI; missing plans fail closed on new prepare/save.';

create or replace function public.touchline_fantasy_user_gameweek_snapshot_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state in ('LOCKED', 'FINAL') and row(
    new.formation_code, new.selected_coach_id, new.locked_coach_id,
    new.budget_eur_snapshot, new.market_plan_key_snapshot,
    new.max_players_per_club_snapshot, new.total_market_value_eur,
    new.confirmed_at, new.locked_at
  ) is distinct from row(
    old.formation_code, old.selected_coach_id, old.locked_coach_id,
    old.budget_eur_snapshot, old.market_plan_key_snapshot,
    old.max_players_per_club_snapshot, old.total_market_value_eur,
    old.confirmed_at, old.locked_at
  ) then
    raise exception using errcode = '55000', message = 'TL_FANTASY_LOCKED_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;

do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure)
    into v_definition;

  v_patched := replace(
    v_definition,
    '  v_effective_budget := case when v_plan_key = ''beta'' then 50000000 else v_config.budget_eur end;',
    '  if v_plan_key is null or v_plan_key not in (''beta'', ''standard'', ''pro'', ''master'', ''vip'') then' || chr(10)
    || '    raise exception ''TL_FANTASY_PLAN_INVALID'';' || chr(10)
    || '  end if;' || chr(10)
    || '  v_effective_budget := case' || chr(10)
    || '    when v_plan_key = ''beta'' then 50000000' || chr(10)
    || '    when v_plan_key = ''standard'' then 500000000' || chr(10)
    || '    when v_plan_key = ''pro'' then 1000000000' || chr(10)
    || '    when v_plan_key = ''master'' then 2000000000' || chr(10)
    || '    when v_plan_key = ''vip'' then null end;'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_PREPARE_SOURCE_MISMATCH_1'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    '  if v_previous.id is not null and v_plan_key = ''beta'' then',
    '  if v_previous.id is not null then'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_PREPARE_SOURCE_MISMATCH_2'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'and policy_club.provider = ''sportmonks'' and policy_club.provider_team_id::text = any(array[''22'',''117'',''116'',''52'']::text[])',
    'and policy_club.provider = ''sportmonks''' || chr(10)
    || '        and (v_plan_key is distinct from ''beta'' or policy_club.provider_team_id::text = any(array[''22'',''117'',''116'',''52'']::text[]))'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_PREPARE_SOURCE_MISMATCH_3'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'and coalesce(sum(market_value_eur), 0) <= v_effective_budget',
    'and (v_effective_budget is null or coalesce(sum(market_value_eur), 0) <= v_effective_budget)'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_PREPARE_SOURCE_MISMATCH_4'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'and coalesce((select max(n) from (select count(*) n from resolved where club_id is not null group by club_id) clubs), 0) <= v_config.max_players_per_club,',
    'and coalesce((select max(n) from (select count(*) n from resolved where club_id is not null group by club_id) clubs), 0) <= 11,'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_PREPARE_SOURCE_MISMATCH_5'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'budget_eur_snapshot, max_players_per_club_snapshot, carry_source_user_gameweek_id',
    'budget_eur_snapshot, market_plan_key_snapshot, max_players_per_club_snapshot, carry_source_user_gameweek_id'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_PREPARE_SOURCE_MISMATCH_6'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'v_effective_budget, v_config.max_players_per_club, v_previous.id',
    'v_effective_budget, v_plan_key, v_config.max_players_per_club, v_previous.id'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_PREPARE_SOURCE_MISMATCH_7'; end if;
  execute v_patched;
end
$migration$;

do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure)
    into v_definition;

  v_patched := replace(
    v_definition,
    '  v_effective_budget := case when v_plan_key = ''beta'' then 50000000 else v_config.budget_eur end;',
    '  if v_plan_key is null or v_plan_key not in (''beta'', ''standard'', ''pro'', ''master'', ''vip'') then' || chr(10)
    || '    raise exception ''TL_FANTASY_PLAN_INVALID'';' || chr(10)
    || '  end if;' || chr(10)
    || '  v_effective_budget := case' || chr(10)
    || '    when v_plan_key = ''beta'' then 50000000' || chr(10)
    || '    when v_plan_key = ''standard'' then 500000000' || chr(10)
    || '    when v_plan_key = ''pro'' then 1000000000' || chr(10)
    || '    when v_plan_key = ''master'' then 2000000000' || chr(10)
    || '    when v_plan_key = ''vip'' then null end;'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_SAVE_SOURCE_MISMATCH_1'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'if v_total > v_effective_budget then raise exception ''TL_FANTASY_BUDGET_EXCEEDED''; end if;',
    'if v_effective_budget is not null and v_total > v_effective_budget then raise exception ''TL_FANTASY_BUDGET_EXCEEDED''; end if;'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_SAVE_SOURCE_MISMATCH_2'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'state, budget_eur_snapshot,',
    'state, budget_eur_snapshot, market_plan_key_snapshot,'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_SAVE_SOURCE_MISMATCH_3'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'v_effective_budget, v_config.max_players_per_club, v_total, p_idempotency_key,',
    'v_effective_budget, v_plan_key, v_config.max_players_per_club, v_total, p_idempotency_key,'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_SAVE_SOURCE_MISMATCH_4'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    'state = excluded.state, budget_eur_snapshot = excluded.budget_eur_snapshot,',
    'state = excluded.state, budget_eur_snapshot = excluded.budget_eur_snapshot,' || chr(10)
    || '    market_plan_key_snapshot = excluded.market_plan_key_snapshot,'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_SAVE_SOURCE_MISMATCH_5'; end if;
  v_definition := v_patched;

  v_patched := replace(
    v_definition,
    '''budgetRemainingEur'', v_effective_budget - v_total',
    '''budgetRemainingEur'', case when v_effective_budget is null then null else v_effective_budget - v_total end'
  );
  if v_patched = v_definition then raise exception 'TL_FANTASY_PLAN_BUDGET_SAVE_SOURCE_MISMATCH_6'; end if;
  execute v_patched;
end
$migration$;

comment on function public.touchline_fantasy_prepare_user_gameweek(uuid,uuid) is
  'Service-role-only. Resolves the active server-owned plan before creating a draft, snapshots its budget, and carries an entire predecessor XI only when it remains currently eligible and within that plan budget.';
comment on function public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text) is
  'Service-role-only. Resolves the active server-owned plan within the locked save transaction; no request field selects a plan or budget.';

commit;
