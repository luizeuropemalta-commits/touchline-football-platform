-- New paid collections only. No balance backfill, entitlement or Beta activation.
-- Keep the installed function, including subsequent locking/window patches and ACL.
begin;
set local lock_timeout='5s';
do $migration$
declare
  definition text := pg_get_functiondef('public.touchline_club_initialize_collection(uuid,uuid,text,jsonb)'::regprocedure);
  old_budget text := 'v_budget := case p_plan when ''standard'' then 500000000 when ''master'' then 800000000 when ''vip'' then 1200000000 else null end;';
  new_budget text := 'v_budget := case p_plan when ''standard'' then 750000000 when ''master'' then 1500000000 when ''vip'' then 3000000000 else null end;';
begin
  if strpos(definition,new_budget)>0 and strpos(definition,old_budget)=0 then
    return; -- safe replay; never grants existing accounts additional funds
  end if;
  if (length(definition)-length(replace(definition,old_budget,''))) / length(old_budget) <> 1 then
    raise exception 'CLUB_APPROVED_BUDGET_SOURCE_MISMATCH';
  end if;
  execute replace(definition,old_budget,new_budget);
end;
$migration$;
commit;
