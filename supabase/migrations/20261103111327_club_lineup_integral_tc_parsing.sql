-- JSON numeric values can retain a decimal scale after Exchange calculations.
-- Parse exact whole TC through numeric; reject fractions instead of rounding.
-- No wallet, contract, price or existing snapshot is rewritten.
begin;
set local lock_timeout='5s';
create function public.touchline_club_integral_tc(p_value text)
returns bigint language plpgsql immutable set search_path='' as $$
declare amount numeric;
begin
  begin amount:=p_value::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'CLUB_BUDGET_AMOUNT_INVALID';
  end;
  if amount is null or amount<0 or amount>9007199254740991 or amount<>trunc(amount) then
    raise exception 'CLUB_BUDGET_AMOUNT_INVALID';
  end if;
  return amount::bigint;
end;
$$;
revoke all on function public.touchline_club_integral_tc(text) from public,anon,authenticated,service_role;

do $migration$
declare signature text; source text; balance_expression text;
begin
  foreach signature in array array[
    'public.touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text)',
    'public.touchline_club_project_deadline_lineup(uuid,uuid,text,text,jsonb,text,text)',
    'public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'] loop
    source:=pg_get_functiondef(signature::regprocedure);
    balance_expression:=case when signature like '%prepare_user_gameweek%' then '(c.state->>''balanceEur'')::bigint'
      else '(v_collection.state->>''balanceEur'')::bigint' end;
    if strpos(source,balance_expression)=0 or strpos(source,'(p->>''valueEur'')::bigint')=0 then
      raise exception 'CLUB_TC_PARSER_PREDECESSOR_MISMATCH';
    end if;
    source:=replace(source,balance_expression,'public.touchline_club_integral_tc('||
      case when signature like '%prepare_user_gameweek%' then 'c.state' else 'v_collection.state' end||'->>''balanceEur'')');
    source:=replace(source,'(p->>''valueEur'')::bigint','public.touchline_club_integral_tc(p->>''valueEur'')');
    execute source;
  end loop;
  -- Reject one invalid collection explicitly without blocking valid owners.
  source:=pg_get_functiondef('public.touchline_club_auto_confirm_round(uuid)'::regprocedure);
  if strpos(source,'^(CLUB_PRIMARY_DETAIL_MISSING|')=0 then raise exception 'CLUB_TC_AUTO_AUDIT_PREDECESSOR_MISMATCH'; end if;
  execute replace(source,'^(CLUB_PRIMARY_DETAIL_MISSING|','^(CLUB_BUDGET_AMOUNT_INVALID|CLUB_PRIMARY_DETAIL_MISSING|');
end;
$migration$;
commit;
