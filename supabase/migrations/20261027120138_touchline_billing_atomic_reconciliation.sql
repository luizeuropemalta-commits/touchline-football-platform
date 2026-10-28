-- Additive webhook reconciliation. No charges, refunds, transfers or historical rewrites.
-- Event.created is audit metadata, never an ordering/version authority.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Missing provider tax metadata is unknown, not a fabricated zero or subtotal delta.
alter table public.billing_invoices alter column tax drop not null;

-- A snapshot event cannot prove that its old failure/authentication reason is current.
-- Preserve existing alerts; future reconciliation uses a factual outstanding-invoice alert.
alter table public.billing_alerts drop constraint billing_alerts_type_check;
alter table public.billing_alerts add constraint billing_alerts_type_check
 check(type in ('payment_failed','payment_action_required','subscription_ending','trial_ending','invoice_unpaid'));

create table public.touchline_billing_event_journal (
 event_id text primary key,
 identity jsonb not null check(jsonb_typeof(identity) = 'object'),
 invoice_id text,
 status text not null default 'pending' check(status in ('pending','applied','ignored')),
 attempts integer not null default 0 check(attempts >= 0),
 received_at timestamptz not null default clock_timestamp(),
 last_attempt_at timestamptz,
 completed_at timestamptz,
 observed_invoice jsonb,
 check((status = 'pending' and completed_at is null) or (status <> 'pending' and completed_at is not null))
);
create table public.touchline_billing_invoice_leases (
 invoice_id text primary key,
 event_id text references public.touchline_billing_event_journal(event_id),
 token uuid,
 deleted_identity jsonb,
 expires_at timestamptz,
 check((token is null and event_id is null and expires_at is null)
   or (token is not null and event_id is not null and expires_at is not null))
);
alter table public.touchline_billing_event_journal enable row level security;
alter table public.touchline_billing_invoice_leases enable row level security;
-- Supabase default ACLs may give service_role ALL. Remove them before granting reads.
revoke all on public.touchline_billing_event_journal,public.touchline_billing_invoice_leases from public,anon,authenticated,service_role;
grant select on public.touchline_billing_event_journal,public.touchline_billing_invoice_leases to service_role;
create index touchline_billing_event_pending_idx on public.touchline_billing_event_journal(received_at,event_id) where status='pending';

create function public.touchline_billing_claim_event(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_id text := p_event->>'id'; v_type text := p_event->>'type'; v_invoice text := p_event->>'invoice_id';
 v_supported boolean; v_job public.touchline_billing_event_journal;
 v_receipt public.stripe_webhook_events; v_lease public.touchline_billing_invoice_leases;
 v_token uuid;
begin
 if jsonb_typeof(p_event) is distinct from 'object'
   or v_id is null or v_id !~ '^evt_[A-Za-z0-9_]{1,250}$'
   or v_type is null or length(v_type) not between 1 and 200
   or jsonb_typeof(p_event->'livemode') is distinct from 'boolean'
   or jsonb_typeof(p_event->'created') is distinct from 'number'
   or (p_event->>'created') !~ '^[0-9]{1,15}$' then
  raise exception 'BILLING_INVALID_EVENT' using errcode='22023';
 end if;
 v_supported := v_type in ('invoice.created','invoice.finalized','invoice.updated','invoice.voided','invoice.marked_uncollectible','invoice.deleted','invoice.paid','invoice.payment_failed','invoice.payment_action_required');
 if v_supported and (v_invoice is null or v_invoice !~ '^in_[A-Za-z0-9_]{1,250}$'
   or p_event->>'customer_id' is null or p_event->>'customer_id' !~ '^cus_[A-Za-z0-9_]{1,250}$'
   or jsonb_typeof(p_event->'source_snapshot') is distinct from 'object') then
  raise exception 'BILLING_INVALID_INVOICE_IDENTITY' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-billing-event:'||v_id,0));
 select * into v_job from public.touchline_billing_event_journal where event_id=v_id for update;
 if found and v_job.identity is distinct from p_event then
  raise exception 'BILLING_EVENT_IDENTITY_CONFLICT' using errcode='40001';
 end if;
 select * into v_receipt from public.stripe_webhook_events where stripe_event_id=v_id;
 if found then
  if v_receipt.event_type is distinct from v_type or v_receipt.livemode is distinct from (p_event->>'livemode')::boolean then
   raise exception 'BILLING_RECEIPT_IDENTITY_CONFLICT' using errcode='40001';
  end if;
  -- Preserve historical receipts; never replay their effects to backfill the new journal.
  return jsonb_build_object('status','duplicate','eventId',v_id);
 end if;
 if v_job.event_id is not null and v_job.status <> 'pending' then
  raise exception 'BILLING_RECEIPT_MISSING' using errcode='40001';
 end if;
 insert into public.touchline_billing_event_journal(event_id,identity,invoice_id)
 values(v_id,p_event,case when v_supported then v_invoice end) on conflict(event_id) do nothing;
 if not v_supported then
  insert into public.stripe_webhook_events(stripe_event_id,event_type,livemode)
  values(v_id,v_type,(p_event->>'livemode')::boolean);
  update public.touchline_billing_event_journal set status='ignored',completed_at=clock_timestamp() where event_id=v_id;
  return jsonb_build_object('status','ignored','eventId',v_id);
 end if;
 insert into public.touchline_billing_invoice_leases(invoice_id) values(v_invoice) on conflict do nothing;
 select * into v_lease from public.touchline_billing_invoice_leases where invoice_id=v_invoice for update;
 if v_lease.deleted_identity is not null then
  if v_lease.deleted_identity->>'customer_id' is distinct from p_event->>'customer_id'
    or v_lease.deleted_identity->'livemode' is distinct from p_event->'livemode' then
   raise exception 'BILLING_DELETED_IDENTITY_CONFLICT' using errcode='40001';
  end if;
  insert into public.stripe_webhook_events(stripe_event_id,event_type,livemode) values(v_id,v_type,(p_event->>'livemode')::boolean);
  update public.touchline_billing_event_journal set status='ignored',observed_invoice=v_lease.deleted_identity,completed_at=clock_timestamp() where event_id=v_id;
  return jsonb_build_object('status','ignored','eventId',v_id);
 end if;
 if v_lease.token is not null and v_lease.expires_at > clock_timestamp() then
  return jsonb_build_object('status','busy','eventId',v_id);
 end if;
 v_token := gen_random_uuid();
 update public.touchline_billing_invoice_leases set event_id=v_id,token=v_token,expires_at=clock_timestamp()+interval '90 seconds' where invoice_id=v_invoice;
 update public.touchline_billing_event_journal set attempts=attempts+1,last_attempt_at=clock_timestamp() where event_id=v_id;
 return jsonb_build_object('status','claimed','eventId',v_id,'token',v_token);
end $$;

create function public.touchline_billing_finish_event(p_event_id text,p_token uuid,p_invoice jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_job public.touchline_billing_event_journal; v_lease public.touchline_billing_invoice_leases;
 v_user uuid; v_existing_user uuid; v_existing_status text; v_existing_paid bigint; v_type text; v_status text; v_outstanding boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-billing-event:'||p_event_id,0));
 select * into v_job from public.touchline_billing_event_journal where event_id=p_event_id for update;
 if not found or v_job.status <> 'pending' or v_job.invoice_id is null then
  raise exception 'BILLING_EVENT_NOT_PENDING' using errcode='40001';
 end if;
 select * into v_lease from public.touchline_billing_invoice_leases where invoice_id=v_job.invoice_id for update;
 if not found or p_token is null or v_lease.token is distinct from p_token
   or v_lease.event_id is distinct from p_event_id or v_lease.expires_at <= clock_timestamp() then
  raise exception 'BILLING_LEASE_LOST' using errcode='40001';
 end if;
 if jsonb_typeof(p_invoice) is distinct from 'object'
   or p_invoice->>'id' is distinct from v_job.invoice_id
   or p_invoice->>'customer_id' is distinct from v_job.identity->>'customer_id'
   or p_invoice->'livemode' is distinct from v_job.identity->'livemode' then
  raise exception 'BILLING_INVOICE_IDENTITY_MISMATCH' using errcode='22023';
 end if;
 select user_id into v_user from public.billing_customers where stripe_customer_id=p_invoice->>'customer_id';
 if v_user is null then raise exception 'BILLING_CUSTOMER_MAPPING_UNAVAILABLE' using errcode='22023'; end if;
 select user_id,status,amount_paid into v_existing_user,v_existing_status,v_existing_paid from public.billing_invoices where stripe_invoice_id=v_job.invoice_id for update;
 if found and v_existing_user is distinct from v_user then raise exception 'BILLING_CUSTOMER_CONFLICT' using errcode='40001'; end if;
 v_type := v_job.identity->>'type';
 if p_invoice->'deleted' = 'true'::jsonb then
  if v_type <> 'invoice.deleted' or v_job.identity->'source_snapshot'->>'status' is distinct from 'draft'
    or v_job.identity->'source_snapshot'->>'amount_paid' is distinct from '0'
    or (v_existing_user is not null and (v_existing_status <> 'draft' or v_existing_paid <> 0)) then
   raise exception 'BILLING_DELETION_CONFLICT' using errcode='40001';
  end if;
  update public.billing_invoices set status='deleted' where stripe_invoice_id=v_job.invoice_id;
  update public.billing_alerts set resolved_at=clock_timestamp() where user_id=v_user and stripe_object_id=v_job.invoice_id
   and type in ('payment_failed','payment_action_required','invoice_unpaid') and resolved_at is null;
  update public.touchline_billing_invoice_leases set deleted_identity=p_invoice where invoice_id=v_job.invoice_id;
 else
  if v_lease.deleted_identity is not null or v_existing_status='deleted' or v_type='invoice.deleted' then
   raise exception 'BILLING_DELETED_INVOICE_CONFLICT' using errcode='40001';
  end if;
 v_status := p_invoice->>'status';
 if v_status is null or v_status not in ('draft','open','paid','uncollectible','void')
   or p_invoice->>'currency' is null or p_invoice->>'currency' !~ '^[a-z]{3}$'
   or exists(select 1 from unnest(array['subtotal','tax','total','amount_paid','amount_due','amount_remaining']) as f(key)
      where (f.key <> 'tax' or p_invoice->f.key is distinct from 'null'::jsonb) and (jsonb_typeof(p_invoice->f.key) is distinct from 'number'
        or p_invoice->>f.key !~ '^-?[0-9]{1,16}$'
        or abs((p_invoice->>f.key)::numeric) > 9007199254740991)) then
  raise exception 'BILLING_INVALID_INVOICE' using errcode='22023';
 end if;
 insert into public.billing_invoices(user_id,stripe_invoice_id,stripe_subscription_id,number,status,currency,subtotal,tax,total,amount_paid,amount_due,
   hosted_invoice_url,invoice_pdf,period_start,period_end,paid_at)
 values(v_user,v_job.invoice_id,p_invoice->>'subscription_id',p_invoice->>'number',v_status,p_invoice->>'currency',
   (p_invoice->>'subtotal')::bigint,(p_invoice->>'tax')::bigint,(p_invoice->>'total')::bigint,(p_invoice->>'amount_paid')::bigint,(p_invoice->>'amount_due')::bigint,
   p_invoice->>'hosted_invoice_url',p_invoice->>'invoice_pdf',(p_invoice->>'period_start')::timestamptz,(p_invoice->>'period_end')::timestamptz,(p_invoice->>'paid_at')::timestamptz)
 on conflict(stripe_invoice_id) do update set
   stripe_subscription_id=excluded.stripe_subscription_id,number=excluded.number,status=excluded.status,currency=excluded.currency,
   subtotal=excluded.subtotal,tax=excluded.tax,total=excluded.total,amount_paid=excluded.amount_paid,amount_due=excluded.amount_due,
   hosted_invoice_url=excluded.hosted_invoice_url,invoice_pdf=excluded.invoice_pdf,period_start=excluded.period_start,period_end=excluded.period_end,paid_at=excluded.paid_at;
 v_type := v_job.identity->>'type';
 -- The current invoice proves an outstanding amount, not the cause in an old event.
 -- Retire obsolete instructions, including bank-authentication prompts and voided debt.
 v_outstanding := v_status in ('open','uncollectible') and (p_invoice->>'amount_remaining')::bigint > 0;
 update public.billing_alerts set resolved_at=clock_timestamp()
  where user_id=v_user and stripe_object_id=v_job.invoice_id and resolved_at is null
   and (type in ('payment_failed','payment_action_required') or (type='invoice_unpaid' and not v_outstanding));
 if v_outstanding then
  -- The invoice lease row remains locked through all effects and the receipt.
  insert into public.billing_alerts(user_id,type,title,message,stripe_object_id)
  select v_user,'invoice_unpaid','Invoice balance outstanding',
   'The current invoice has an outstanding balance. Review the invoice for its current payment options.',v_job.invoice_id
  where not exists(select 1 from public.billing_alerts where user_id=v_user and stripe_object_id=v_job.invoice_id and type='invoice_unpaid' and resolved_at is null);
 end if;
 end if;
 insert into public.stripe_webhook_events(stripe_event_id,event_type,livemode)
 values(p_event_id,v_type,(v_job.identity->>'livemode')::boolean);
 update public.touchline_billing_event_journal set status='applied',observed_invoice=p_invoice,completed_at=clock_timestamp() where event_id=p_event_id;
 update public.touchline_billing_invoice_leases set event_id=null,token=null,expires_at=null where invoice_id=v_job.invoice_id;
 return jsonb_build_object('status','applied','eventId',p_event_id);
end $$;

create function public.touchline_billing_release_event(p_event_id text,p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_invoice text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-billing-event:'||p_event_id,0));
 select invoice_id into v_invoice from public.touchline_billing_event_journal where event_id=p_event_id for update;
 -- An old worker cannot clear a successor's lease. Pending journal evidence remains.
 update public.touchline_billing_invoice_leases set event_id=null,token=null,expires_at=null
  where invoice_id=v_invoice and event_id=p_event_id and token=p_token;
end $$;

revoke all on function public.touchline_billing_claim_event(jsonb),public.touchline_billing_finish_event(text,uuid,jsonb),public.touchline_billing_release_event(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.touchline_billing_claim_event(jsonb),public.touchline_billing_finish_event(text,uuid,jsonb),public.touchline_billing_release_event(text,uuid) to service_role;
commit;
