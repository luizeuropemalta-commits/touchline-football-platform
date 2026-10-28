-- Read-only company overview. This never executes payments or reads TC wallets.
begin;
create function public.touchline_company_finance_overview()
returns jsonb language sql stable security invoker set search_path = '' as $$
 with paid as (
  select obligation_id, sum(amount_minor)::numeric amount
  from public.touchline_company_settlements group by obligation_id
 ), reconciled as (
  select o.*, coalesce(p.amount,0) paid,
   greatest(o.amount_minor-coalesce(p.amount,0),0) outstanding,
   greatest(coalesce(p.amount,0)-o.amount_minor,0) overpaid
  from public.touchline_company_obligations o left join paid p on p.obligation_id=o.id
 ), currencies as (
  select currency, unit_exponent,
   count(*)::text obligations,
   sum(amount_minor)::text registered,
   sum(paid)::text paid,
   sum(outstanding)::text outstanding,
   sum(overpaid)::text overpaid,
   coalesce(sum(outstanding) filter(where due_on < current_date),0)::text overdue,
   count(*) filter(where outstanding>0 and due_on<current_date)::text overdue_count
  from reconciled group by currency,unit_exponent
 )
 select jsonb_build_object(
  'asOf', current_date::text,
  'suppliers', (select count(*)::text from public.touchline_company_suppliers),
  'contracts', (select count(*)::text from public.touchline_company_contracts),
  'contractDeadlines', (select count(*)::text from public.touchline_company_contracts c
   where (c.cancellation_deadline_on between current_date and current_date+30)
      or (c.renewal_on between current_date and current_date+30)
      or (c.ends_on between current_date and current_date+30)),
  'currencies', coalesce((select jsonb_agg(jsonb_build_object(
   'currency',currency,'exponent',unit_exponent,'obligations',obligations,
   'registered',registered,'paid',paid,'outstanding',outstanding,'overpaid',overpaid,
   'overdue',overdue,'overdueCount',overdue_count
  ) order by currency,unit_exponent) from currencies),'[]'::jsonb)
 );
$$;
revoke all on function public.touchline_company_finance_overview() from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_finance_overview() to service_role;
commit;
