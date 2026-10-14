-- Owner-approved finite XI budgets. No entitlement, billing or lineup rewrite.
-- Apply only under the documented QA write hold after confirmed-XI preflight.
begin;
set local lock_timeout = '5s';
lock table public.touchline_fantasy_user_gameweeks in share row exclusive mode;

do $migration$
declare
  signature text;
  definition text;
  patched text;
  old_value text;
  new_value text;
  replacements text[][] := array[
    array['when v_plan_key = ''standard'' then 500000000', 'when v_plan_key = ''standard'' then 400000000'],
    array['when v_plan_key = ''pro'' then 1000000000', 'when v_plan_key = ''pro'' then 650000000'],
    array['when v_plan_key = ''master'' then 2000000000', 'when v_plan_key = ''master'' then 850000000'],
    array['when v_plan_key = ''vip'' then null end;', 'when v_plan_key = ''vip'' then 1000000000 end;']
  ];
  pair text[];
begin
  -- Do not silently invalidate or downgrade confirmations approved under old rules.
  if exists (select 1 from public.touchline_fantasy_user_gameweeks where state = 'CONFIRMED') then
    raise exception 'TL_FINITE_BUDGET_CONFIRMED_TRANSITION_REQUIRED';
  end if;
  foreach signature in array array[
    'public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)',
    'public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    foreach pair slice 1 in array replacements loop
      old_value := pair[1]; new_value := pair[2];
      patched := replace(definition, old_value, new_value);
      if patched = definition then raise exception 'TL_FINITE_BUDGET_SOURCE_MISMATCH: %', signature; end if;
      definition := patched;
    end loop;
    execute definition;
  end loop;

  definition := pg_get_functiondef('public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure);
  replacements := array[
    array['when ''standard'' then user_gameweek.budget_eur_snapshot = 500000000', 'when ''standard'' then user_gameweek.budget_eur_snapshot = 400000000'],
    array['when ''pro'' then user_gameweek.budget_eur_snapshot = 1000000000', 'when ''pro'' then user_gameweek.budget_eur_snapshot = 650000000'],
    array['when ''master'' then user_gameweek.budget_eur_snapshot = 2000000000', 'when ''master'' then user_gameweek.budget_eur_snapshot = 850000000'],
    array['when ''vip'' then user_gameweek.budget_eur_snapshot is null', 'when ''vip'' then user_gameweek.budget_eur_snapshot = 1000000000'],
    array['and (user_gameweek.market_plan_key_snapshot = ''vip'' or (', 'and (('],
    array['when ''standard'' then 500000000', 'when ''standard'' then 400000000'],
    array['when ''pro'' then 1000000000', 'when ''pro'' then 650000000'],
    array['when ''master'' then 2000000000', 'when ''master'' then 850000000' || chr(10) || '      when ''vip'' then 1000000000']
  ];
  foreach pair slice 1 in array replacements loop
    patched := replace(definition, pair[1], pair[2]);
    if patched = definition then raise exception 'TL_FINITE_BUDGET_LOCK_SOURCE_MISMATCH'; end if;
    definition := patched;
  end loop;
  execute definition;
end
$migration$;
commit;
