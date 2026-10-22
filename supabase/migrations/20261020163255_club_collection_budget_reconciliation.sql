-- Operator-only, explicitly approved VIP 1.2B -> 3B reconciliation.
-- Installation alone changes no account. No Data API/service-role grants.
begin;
create schema if not exists touchline_budget_admin;
revoke all on schema touchline_budget_admin from public,anon,authenticated,service_role;
create table touchline_budget_admin.reconciliations (
  user_id uuid not null references public.users(id),
  season_id uuid not null references public.football_seasons(id),
  budget_version text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  delta bigint not null check(delta=1800000000),
  evidence text not null check(length(evidence)>=20),
  operator_name text not null default session_user,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,season_id,budget_version)
);
alter table touchline_budget_admin.reconciliations enable row level security;
revoke all on touchline_budget_admin.reconciliations from public,anon,authenticated,service_role;

create function touchline_budget_admin.reconcile_vip(
  p_user_id uuid,p_season_id uuid,p_expected_state jsonb,p_base_evidence text
) returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
  current_state jsonb;
  next_state jsonb;
  prior touchline_budget_admin.reconciliations%rowtype;
  version constant text := '2026-10-20-approved-plan-budgets';
begin
  -- Evidence must be a separately verified original grant + full operation audit,
  -- not merely an inference from balance + owned value.
  if p_base_evidence is null or length(p_base_evidence)<20 then raise exception 'BUDGET_BASE_EVIDENCE_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:' || p_user_id::text,0));
  select state into current_state from public.touchline_club_collections
    where user_id=p_user_id and season_id=p_season_id for update;
  if not found then raise exception 'BUDGET_COLLECTION_REQUIRED'; end if;
  select * into prior from touchline_budget_admin.reconciliations
    where user_id=p_user_id and season_id=p_season_id and budget_version=version;
  if found then
    if prior.before_state is distinct from p_expected_state or prior.evidence is distinct from p_base_evidence then
      raise exception 'BUDGET_REPLAY_CONFLICT';
    end if;
    return jsonb_build_object('replayed',true,'receipt',to_jsonb(prior),'state',current_state);
  end if;
  if not exists(select 1 from public.touchline_fantasy_entitlements e
    where e.user_id=p_user_id and e.entitlement_key='fantasy_access' and e.plan_key='vip' and e.status='active'
      and (e.current_period_start is null or e.current_period_start<=clock_timestamp())
      and (e.current_period_end is null or e.current_period_end>clock_timestamp())) then
    raise exception 'BUDGET_VIP_ENTITLEMENT_REQUIRED';
  end if;
  if current_state is distinct from p_expected_state then raise exception 'BUDGET_STALE_STATE'; end if;
  -- Narrow authorized snapshot, not a general top-up facility.
  if current_state->>'plan' is distinct from 'vip'
    or current_state->>'seasonId' is distinct from p_season_id::text
    or (current_state->>'revision')::bigint is distinct from 42
    or (current_state->>'balanceEur')::bigint is distinct from 100000
    or (current_state->'coach'->>'valueEur')::bigint is distinct from 10000000
    or jsonb_array_length(current_state->'players') is distinct from 22
    or jsonb_array_length(current_state->'receipts') is distinct from 22
    or (select sum((p->>'valueEur')::bigint) from jsonb_array_elements(current_state->'players') p) is distinct from 1189900000::bigint
    or exists(select 1 from jsonb_array_elements(current_state->'players') p
      where (select count(*) from jsonb_array_elements(current_state->'receipts') r
        where r->>'playerId'=p->>'playerId' and r->>'valueEur'=p->>'valueEur')<>1)
    then raise exception 'BUDGET_BASE_UNEXPECTED'; end if;
  next_state:=jsonb_set(jsonb_set(current_state,'{balanceEur}','1800100000'::jsonb),'{revision}','43'::jsonb);
  update public.touchline_club_collections set state=next_state,revision=43,updated_at=clock_timestamp()
    where user_id=p_user_id and season_id=p_season_id and revision=42 and state=p_expected_state;
  if not found then raise exception 'BUDGET_STALE_STATE'; end if;
  insert into touchline_budget_admin.reconciliations(user_id,season_id,budget_version,before_state,after_state,delta,evidence)
    values(p_user_id,p_season_id,version,current_state,next_state,1800000000,p_base_evidence)
    returning * into prior;
  return jsonb_build_object('replayed',false,'receipt',to_jsonb(prior),'state',next_state);
end;
$$;
revoke all on function touchline_budget_admin.reconcile_vip(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
commit;
