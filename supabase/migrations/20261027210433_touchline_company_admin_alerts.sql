-- Company finance alerts are an internal Admin inbox only.
-- No email, push, payment execution, or external delivery is performed here.
begin;
set local lock_timeout = '5s';

create table public.touchline_company_admin_alert_job_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.touchline_company_admin_alert_job_config(id, enabled)
values (true, false) on conflict (id) do nothing;

create table public.touchline_company_admin_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_kind text not null check (alert_kind in ('OBLIGATION_DUE','OBLIGATION_OVERDUE','OBLIGATION_PARTIAL','CONTRACT_CANCELLATION_DEADLINE','CONTRACT_RENEWAL','CONTRACT_EXPIRY')),
  severity text not null check (severity in ('NORMAL','HIGH','CRITICAL')),
  supplier_id uuid references public.touchline_company_suppliers(id) on delete restrict,
  contract_id uuid references public.touchline_company_contracts(id) on delete restrict,
  obligation_id uuid references public.touchline_company_obligations(id) on delete restrict,
  milestone_on date,
  deduplication_key text not null unique check (length(btrim(deduplication_key)) between 8 and 256),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  read_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (supplier_id is not null or contract_id is not null or obligation_id is not null),
  check (milestone_on is null or isfinite(milestone_on))
);
create index touchline_company_admin_alerts_unread_idx
  on public.touchline_company_admin_alerts(read_at, created_at desc);
create index touchline_company_admin_alerts_entity_idx
  on public.touchline_company_admin_alerts(contract_id, obligation_id, created_at desc);

alter table public.touchline_company_admin_alert_job_config enable row level security;
alter table public.touchline_company_admin_alerts enable row level security;
revoke all on public.touchline_company_admin_alert_job_config, public.touchline_company_admin_alerts from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.touchline_company_admin_alert_job_config to service_role;
grant select on public.touchline_company_admin_alerts to service_role;

create function public.touchline_company_set_admin_alert_job_enabled(p_enabled boolean, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' or p_actor_id is null then
    raise exception using errcode='42501', message='COMPANY_ADMIN_ALERTS_SERVICE_ONLY';
  end if;
  update public.touchline_company_admin_alert_job_config
    set enabled=p_enabled, updated_by=p_actor_id, updated_at=clock_timestamp() where id=true;
  return (select to_jsonb(c) from public.touchline_company_admin_alert_job_config c where c.id=true);
end $$;
revoke all on function public.touchline_company_set_admin_alert_job_enabled(boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_set_admin_alert_job_enabled(boolean,uuid) to service_role;

create function public.touchline_company_generate_admin_alerts(
  p_run_id uuid, p_today date, p_horizon_days integer default 30
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
  v_inserted integer := 0;
  v_alert_kind text;
  v_key text;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
    or p_run_id is null or p_today is null or not isfinite(p_today)
    or p_horizon_days is null or p_horizon_days < 0 or p_horizon_days > 366 then
    raise exception using errcode='22023', message='COMPANY_ADMIN_ALERTS_INVALID_RUN';
  end if;
  select enabled into v_enabled from public.touchline_company_admin_alert_job_config where id=true;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('ok',false,'state','DISABLED','inserted',0);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-company-admin-alert-generation', 0));

  for v_alert_kind, v_key in
    select kind, key from (
      select 'OBLIGATION_DUE'::text kind,
        'obligation:'||o.id||':due:'||o.due_on::text key
      from public.touchline_company_obligations o
      where o.due_on between p_today and p_today+p_horizon_days
        and o.amount_minor > coalesce((select sum(s.amount_minor) from public.touchline_company_settlements s
          where s.obligation_id=o.id and not exists (select 1 from public.touchline_company_settlement_corrections c where c.settlement_id=s.id)),0)
      union all
      select 'OBLIGATION_OVERDUE'::text kind,
        'obligation:'||o.id||':overdue:'||o.due_on::text key
      from public.touchline_company_obligations o
      where o.due_on < p_today
        and o.amount_minor > coalesce((select sum(s.amount_minor) from public.touchline_company_settlements s
          where s.obligation_id=o.id and not exists (select 1 from public.touchline_company_settlement_corrections c where c.settlement_id=s.id)),0)
      union all
      select 'OBLIGATION_PARTIAL', 'obligation:'||o.id||':partial:'||o.due_on::text
      from public.touchline_company_obligations o
      where (select coalesce(sum(s.amount_minor),0) from public.touchline_company_settlements s
        where s.obligation_id=o.id and not exists (select 1 from public.touchline_company_settlement_corrections c where c.settlement_id=s.id)) > 0
        and (select coalesce(sum(s.amount_minor),0) from public.touchline_company_settlements s
          where s.obligation_id=o.id and not exists (select 1 from public.touchline_company_settlement_corrections c where c.settlement_id=s.id)) < o.amount_minor
      union all
      select 'CONTRACT_CANCELLATION_DEADLINE', 'contract:'||c.id||':cancellation:'||c.cancellation_deadline_on::text
      from public.touchline_company_contracts c where c.cancellation_deadline_on is not null
        and c.cancellation_deadline_on between p_today and p_today + p_horizon_days
      union all
      select 'CONTRACT_RENEWAL', 'contract:'||c.id||':renewal:'||c.renewal_on::text
      from public.touchline_company_contracts c where c.renewal_on is not null
        and c.renewal_on between p_today and p_today + p_horizon_days
      union all
      select 'CONTRACT_EXPIRY', 'contract:'||c.id||':expiry:'||c.ends_on::text
      from public.touchline_company_contracts c where c.ends_on is not null
        and c.ends_on between p_today and p_today + p_horizon_days
    ) candidates
  loop
    insert into public.touchline_company_admin_alerts(alert_kind,severity,supplier_id,contract_id,obligation_id,milestone_on,deduplication_key,title,body,metadata)
    select v_alert_kind,
      case when v_alert_kind='OBLIGATION_OVERDUE' then 'CRITICAL' when v_alert_kind='OBLIGATION_PARTIAL' then 'HIGH' else 'NORMAL' end,
      o.supplier_id, o.contract_id, o.id, o.due_on, v_key,
      'Company finance alert', 'Review the recorded company finance milestone.', jsonb_build_object('runId',p_run_id,'sourceReference',o.source_reference,'supplierName',(select name from public.touchline_company_suppliers where id=o.supplier_id),'currency',o.currency,'unitExponent',o.unit_exponent,'amountMinor',o.amount_minor)
    from public.touchline_company_obligations o where v_alert_kind like 'OBLIGATION_%' and v_key like 'obligation:'||o.id||':%'
    on conflict (deduplication_key) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
    insert into public.touchline_company_admin_alerts(alert_kind,severity,supplier_id,contract_id,milestone_on,deduplication_key,title,body,metadata)
    select v_alert_kind, 'NORMAL', c.supplier_id, c.id,
      case v_alert_kind when 'CONTRACT_CANCELLATION_DEADLINE' then c.cancellation_deadline_on when 'CONTRACT_RENEWAL' then c.renewal_on else c.ends_on end,
      v_key, 'Company contract alert', 'Review the upcoming company contract milestone.', jsonb_build_object('runId',p_run_id,'contractTitle',c.title,'supplierName',(select name from public.touchline_company_suppliers where id=c.supplier_id))
    from public.touchline_company_contracts c where v_alert_kind like 'CONTRACT_%' and v_key like 'contract:'||c.id||':%'
    on conflict (deduplication_key) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;
  -- Preserve history and recompute the open condition after payment corrections.
  with balances as (
    select o.id,o.amount_minor,o.due_on,coalesce((select sum(s.amount_minor)
      from public.touchline_company_settlements s where s.obligation_id=o.id
      and not exists(select 1 from public.touchline_company_settlement_corrections c where c.settlement_id=s.id)),0) paid
    from public.touchline_company_obligations o
  ), conditions as (
    select a.id,greatest(0,b.amount_minor-b.paid) outstanding,
      (b.paid>=b.amount_minor or (a.alert_kind='OBLIGATION_PARTIAL' and b.paid=0)
       or (a.alert_kind='OBLIGATION_DUE' and b.due_on<p_today)) closed
    from public.touchline_company_admin_alerts a join balances b on b.id=a.obligation_id
  )
  update public.touchline_company_admin_alerts a
    set metadata=a.metadata||jsonb_build_object('outstandingMinor',c.outstanding),
      resolved_at=case when c.closed then coalesce(a.resolved_at,clock_timestamp()) else null end,
      read_at=case when not c.closed and a.resolved_at is not null then null else a.read_at end,
      read_by=case when not c.closed and a.resolved_at is not null then null else a.read_by end
    from conditions c where a.id=c.id;
  return jsonb_build_object('ok',true,'state','COMPLETED','inserted',v_inserted);
end $$;
revoke all on function public.touchline_company_generate_admin_alerts(uuid,date,integer) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_generate_admin_alerts(uuid,date,integer) to service_role;

create function public.touchline_company_mark_admin_alert_read(p_alert_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' or p_alert_id is null or p_actor_id is null then
    raise exception using errcode='42501', message='COMPANY_ADMIN_ALERTS_SERVICE_ONLY';
  end if;
  update public.touchline_company_admin_alerts set read_at=coalesce(read_at,clock_timestamp()),read_by=coalesce(read_by,p_actor_id) where id=p_alert_id;
  return (select to_jsonb(a) from public.touchline_company_admin_alerts a where a.id=p_alert_id);
end $$;
revoke all on function public.touchline_company_mark_admin_alert_read(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.touchline_company_mark_admin_alert_read(uuid,uuid) to service_role;
commit;
