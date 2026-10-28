-- Cancel an erroneous bookkeeping settlement; never refund or move bank funds.
begin;
create table public.touchline_company_settlement_corrections (
 id uuid primary key,
 settlement_id uuid not null unique references public.touchline_company_settlements(id),
 reason text not null check(length(btrim(reason)) between 20 and 2000),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.touchline_company_settlement_corrections enable row level security;
revoke all on public.touchline_company_settlement_corrections from public,anon,authenticated,service_role;
grant select on public.touchline_company_settlement_corrections to service_role;
create trigger company_settlement_correction_audit after insert on public.touchline_company_settlement_corrections
 for each row execute function public.touchline_company_append_audit();
-- Active-source uniqueness is enforced under a source lock by the only write RPC.
-- A cancelled, immutable entry may be replaced using its original evidence reference.
do $$ declare v_name text; begin
 select conname into strict v_name from pg_constraint
 where conrelid='public.touchline_company_settlements'::regclass
 and contype='u' and pg_get_constraintdef(oid)='UNIQUE (source, source_reference)';
 execute format('alter table public.touchline_company_settlements drop constraint %I',v_name);
end $$;
create index company_settlement_source_history_idx on public.touchline_company_settlements(source,source_reference);

create function public.touchline_company_cancel_settlement(p_request_id uuid,p_settlement_id uuid,p_reason text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare original public.touchline_company_settlements; existing public.touchline_company_settlement_corrections;
begin
 if p_request_id is null or p_settlement_id is null or p_actor_id is null or p_reason is null
 or length(btrim(p_reason)) not between 20 and 2000 then
  raise exception 'COMPANY_INVALID_CORRECTION' using errcode='22023';
 end if;
 select * into original from public.touchline_company_settlements where id=p_settlement_id;
 if not found then raise exception 'COMPANY_SETTLEMENT_NOT_FOUND' using errcode='22023'; end if;
 -- Same order as recording: source -> request -> obligation. Original rows are immutable.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(jsonb_build_array(original.source,original.source_reference)::text,1));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into existing from public.touchline_company_settlement_corrections where id=p_request_id;
 if found then
  if row(existing.settlement_id,existing.reason,existing.created_by) is distinct from row(p_settlement_id,btrim(p_reason),p_actor_id) then
   raise exception 'COMPANY_IDEMPOTENCY_CONFLICT' using errcode='40001';
  end if;
  return to_jsonb(existing);
 end if;
 perform 1 from public.touchline_company_obligations where id=original.obligation_id for update;
 if exists(select 1 from public.touchline_company_settlement_corrections where settlement_id=p_settlement_id) then
  raise exception 'COMPANY_SETTLEMENT_ALREADY_CANCELLED' using errcode='40001';
 end if;
 insert into public.touchline_company_settlement_corrections(id,settlement_id,reason,created_by)
 values(p_request_id,p_settlement_id,btrim(p_reason),p_actor_id) returning * into existing;
 return to_jsonb(existing);
end $$;
revoke all on function public.touchline_company_cancel_settlement(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_cancel_settlement(uuid,uuid,text,uuid) to service_role;

create or replace function public.touchline_company_record_settlement(
 p_request_id uuid,p_obligation_id uuid,p_currency text,p_unit_exponent smallint,p_amount_minor bigint,
 p_paid_on date,p_source text,p_source_reference text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.touchline_company_settlements; inserted public.touchline_company_settlements; total numeric;
begin
 if p_request_id is null or p_obligation_id is null or p_actor_id is null or p_paid_on is null or not isfinite(p_paid_on) or p_paid_on > current_date then
  raise exception 'COMPANY_INVALID_SETTLEMENT' using errcode='22023';
 end if;
 if p_source is null or p_source not in ('BANK','PROVIDER','MANUAL') or p_source_reference is null or length(btrim(p_source_reference)) not between 1 and 1024 then raise exception 'COMPANY_INVALID_SOURCE' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(jsonb_build_array(p_source,p_source_reference)::text,1));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into existing from public.touchline_company_settlements where id=p_request_id;
 if found then
  if row(existing.obligation_id,existing.currency,existing.unit_exponent,existing.amount_minor,existing.paid_on,existing.source,existing.source_reference,existing.confirmed_by)
     is distinct from row(p_obligation_id,p_currency,p_unit_exponent,p_amount_minor,p_paid_on,p_source,p_source_reference,p_actor_id) then
   raise exception 'COMPANY_IDEMPOTENCY_CONFLICT' using errcode='40001';
  end if;
  return to_jsonb(existing);
 end if;
 perform 1 from public.touchline_company_obligations where id=p_obligation_id for update;
 if not found then raise exception 'COMPANY_OBLIGATION_NOT_FOUND' using errcode='22023'; end if;
 if exists(select 1 from public.touchline_company_settlements s where s.source=p_source and s.source_reference=p_source_reference
   and not exists(select 1 from public.touchline_company_settlement_corrections c where c.settlement_id=s.id)) then
  raise exception 'COMPANY_SOURCE_UNIQUE_CONFLICT' using errcode='23505';
 end if;
 select coalesce(sum(s.amount_minor),0) into total from public.touchline_company_settlements s where s.obligation_id=p_obligation_id
 and not exists(select 1 from public.touchline_company_settlement_corrections c where c.settlement_id=s.id);
 if total+p_amount_minor > 9007199254740991 then raise exception 'COMPANY_AMOUNT_OVERFLOW' using errcode='22003'; end if;
 insert into public.touchline_company_settlements(id,obligation_id,currency,unit_exponent,amount_minor,paid_on,source,source_reference,confirmed_by)
 values(p_request_id,p_obligation_id,p_currency,p_unit_exponent,p_amount_minor,p_paid_on,p_source,p_source_reference,p_actor_id) returning * into inserted;
 return to_jsonb(inserted);
end $$;

create or replace function public.touchline_company_finance_overview()
returns jsonb language sql stable security invoker set search_path = '' as $$
 with paid as (
  select obligation_id, sum(amount_minor)::numeric amount
  from public.touchline_company_settlements s
  where not exists(select 1 from public.touchline_company_settlement_corrections c where c.settlement_id=s.id)
  group by obligation_id
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
commit;
