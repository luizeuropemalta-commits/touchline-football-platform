-- Local additive foundation only. No payment execution, email ingestion, TC writes or remote application.
begin;
create table public.touchline_company_currencies (code text primary key check (code ~ '^[A-Z]{3}$'));
-- ISO currency identities; source minor-unit exponent is retained separately (not inferred from Stripe).
insert into public.touchline_company_currencies(code) values
('AED'),('AFN'),('ALL'),('AMD'),('ANG'),('AOA'),('ARS'),('AUD'),('AWG'),('AZN'),('BAM'),('BBD'),('BDT'),('BGN'),('BHD'),('BIF'),('BMD'),('BND'),('BOB'),('BRL'),('BSD'),('BTN'),('BWP'),('BYN'),('BZD'),('CAD'),('CDF'),('CHF'),('CLP'),('CNY'),('COP'),('CRC'),('CUC'),('CUP'),('CVE'),('CZK'),('DJF'),('DKK'),('DOP'),('DZD'),('EGP'),('ERN'),('ETB'),('EUR'),('FJD'),('FKP'),('GBP'),('GEL'),('GHS'),('GIP'),('GMD'),('GNF'),('GTQ'),('GYD'),('HKD'),('HNL'),('HRK'),('HTG'),('HUF'),('IDR'),('ILS'),('INR'),('IQD'),('IRR'),('ISK'),('JMD'),('JOD'),('JPY'),('KES'),('KGS'),('KHR'),('KMF'),('KPW'),('KRW'),('KWD'),('KYD'),('KZT'),('LAK'),('LBP'),('LKR'),('LRD'),('LSL'),('LYD'),('MAD'),('MDL'),('MGA'),('MKD'),('MMK'),('MNT'),('MOP'),('MRU'),('MUR'),('MVR'),('MWK'),('MXN'),('MYR'),('MZN'),('NAD'),('NGN'),('NIO'),('NOK'),('NPR'),('NZD'),('OMR'),('PAB'),('PEN'),('PGK'),('PHP'),('PKR'),('PLN'),('PYG'),('QAR'),('RON'),('RSD'),('RUB'),('RWF'),('SAR'),('SBD'),('SCR'),('SDG'),('SEK'),('SGD'),('SHP'),('SLE'),('SLL'),('SOS'),('SRD'),('SSP'),('STN'),('SVC'),('SYP'),('SZL'),('THB'),('TJS'),('TMT'),('TND'),('TOP'),('TRY'),('TTD'),('TWD'),('TZS'),('UAH'),('UGX'),('USD'),('UYU'),('UZS'),('VES'),('VND'),('VUV'),('WST'),('XAF'),('XCD'),('XCG'),('XDR'),('XOF'),('XPF'),('XSU'),('YER'),('ZAR'),('ZMW'),('ZWG'),('ZWL');
create table public.touchline_company_suppliers (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 200),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.touchline_company_contracts (
 id uuid primary key default gen_random_uuid(), supplier_id uuid not null references public.touchline_company_suppliers(id),
 title text not null check(length(btrim(title)) between 1 and 300), starts_on date not null, ends_on date,
 renewal_on date, cancellation_deadline_on date, document_reference text check(document_reference is null or length(btrim(document_reference)) between 1 and 1024),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(isfinite(starts_on) and (ends_on is null or isfinite(ends_on)) and (renewal_on is null or isfinite(renewal_on)) and (cancellation_deadline_on is null or isfinite(cancellation_deadline_on))),
 unique(id,supplier_id), check(ends_on is null or ends_on >= starts_on), check(renewal_on is null or renewal_on >= starts_on),
 check(cancellation_deadline_on is null or renewal_on is null or cancellation_deadline_on <= renewal_on)
);
create table public.touchline_company_obligations (
 id uuid primary key default gen_random_uuid(), supplier_id uuid not null references public.touchline_company_suppliers(id), contract_id uuid,
 source_reference text not null check(length(btrim(source_reference)) between 1 and 1024),
 issued_on date not null check(isfinite(issued_on)), due_on date not null check(isfinite(due_on) and due_on >= issued_on),
 currency text not null references public.touchline_company_currencies(code), unit_exponent smallint not null check(unit_exponent between 0 and 4),
 amount_minor bigint not null check(amount_minor between 0 and 9007199254740991),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(contract_id,supplier_id) references public.touchline_company_contracts(id,supplier_id),
 unique(supplier_id,source_reference), unique(id,currency,unit_exponent)
);
create table public.touchline_company_settlements (
 id uuid primary key, obligation_id uuid not null, currency text not null, unit_exponent smallint not null,
 amount_minor bigint not null check(amount_minor between 1 and 9007199254740991), paid_on date not null check(isfinite(paid_on)),
 source text not null check(source in ('BANK','PROVIDER','MANUAL')),
 source_reference text not null check(length(btrim(source_reference)) between 1 and 1024),
 confirmed_by uuid not null references auth.users(id), confirmed_at timestamptz not null default now(),
 foreign key(obligation_id,currency,unit_exponent) references public.touchline_company_obligations(id,currency,unit_exponent),
 unique(source,source_reference)
);
-- Confirmation evidence can be an auditable bank/provider/manual reference; no compulsory attachment.
-- Settlements are confirmed allocations only. Forecasts and email invoices never enter this table.
create table public.touchline_company_audit_events (
 id bigint generated always as identity primary key, entity_table text not null, entity_id uuid not null,
 actor_id uuid not null references auth.users(id), record_snapshot jsonb not null, recorded_at timestamptz not null default now()
);
create function public.touchline_company_append_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.touchline_company_audit_events(entity_table,entity_id,actor_id,record_snapshot)
 values(tg_table_name,new.id,coalesce((to_jsonb(new)->>'created_by')::uuid,(to_jsonb(new)->>'confirmed_by')::uuid),to_jsonb(new));
 return new;
end $$;
revoke all on function public.touchline_company_append_audit() from public,anon,authenticated,service_role;
create trigger company_supplier_audit after insert on public.touchline_company_suppliers for each row execute function public.touchline_company_append_audit();
create trigger company_contract_audit after insert on public.touchline_company_contracts for each row execute function public.touchline_company_append_audit();
create trigger company_obligation_audit after insert on public.touchline_company_obligations for each row execute function public.touchline_company_append_audit();
create trigger company_settlement_audit after insert on public.touchline_company_settlements for each row execute function public.touchline_company_append_audit();

create function public.touchline_company_record_settlement(
 p_request_id uuid,p_obligation_id uuid,p_currency text,p_unit_exponent smallint,p_amount_minor bigint,
 p_paid_on date,p_source text,p_source_reference text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.touchline_company_settlements; inserted public.touchline_company_settlements; total numeric;
begin
 if p_request_id is null or p_obligation_id is null or p_actor_id is null or p_paid_on is null or not isfinite(p_paid_on) or p_paid_on > current_date then
  raise exception 'COMPANY_INVALID_SETTLEMENT' using errcode='22023';
 end if;
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
 select coalesce(sum(amount_minor),0) into total from public.touchline_company_settlements where obligation_id=p_obligation_id;
 if total+p_amount_minor > 9007199254740991 then raise exception 'COMPANY_AMOUNT_OVERFLOW' using errcode='22003'; end if;
 insert into public.touchline_company_settlements(id,obligation_id,currency,unit_exponent,amount_minor,paid_on,source,source_reference,confirmed_by)
 values(p_request_id,p_obligation_id,p_currency,p_unit_exponent,p_amount_minor,p_paid_on,p_source,p_source_reference,p_actor_id) returning * into inserted;
 return to_jsonb(inserted);
end $$;
revoke all on function public.touchline_company_record_settlement(uuid,uuid,text,smallint,bigint,date,text,text,uuid) from public,anon,authenticated;
grant execute on function public.touchline_company_record_settlement(uuid,uuid,text,smallint,bigint,date,text,text,uuid) to service_role;

alter table public.touchline_company_currencies enable row level security;
alter table public.touchline_company_suppliers enable row level security;
alter table public.touchline_company_contracts enable row level security;
alter table public.touchline_company_obligations enable row level security;
alter table public.touchline_company_settlements enable row level security;
alter table public.touchline_company_audit_events enable row level security;
revoke all on public.touchline_company_currencies,public.touchline_company_suppliers,public.touchline_company_contracts,public.touchline_company_obligations,public.touchline_company_settlements,public.touchline_company_audit_events from public,anon,authenticated,service_role;
grant select on public.touchline_company_currencies,public.touchline_company_suppliers,public.touchline_company_contracts,public.touchline_company_obligations,public.touchline_company_settlements,public.touchline_company_audit_events to service_role;
grant insert on public.touchline_company_suppliers,public.touchline_company_contracts,public.touchline_company_obligations to service_role;
create index company_obligations_due_idx on public.touchline_company_obligations(due_on,id);
create index company_contracts_renewal_idx on public.touchline_company_contracts(renewal_on,id);
create index company_settlements_obligation_idx on public.touchline_company_settlements(obligation_id);
create index company_audit_entity_idx on public.touchline_company_audit_events(entity_table,entity_id,id);
commit;
