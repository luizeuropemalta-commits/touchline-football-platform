-- Local forward migration only. Application capability remains OFF until QA validation.
-- The server resolves the canonical coach offer; request JSON supplies no price/club.
begin;
set local lock_timeout='5s';
create table public.touchline_club_coach_operations (
  user_id uuid not null,
  season_id uuid not null,
  idempotency_key text not null,
  command jsonb not null,
  before_state jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,season_id,idempotency_key),
  foreign key(user_id,season_id,idempotency_key) references public.touchline_club_collection_operations(user_id,season_id,idempotency_key) on delete restrict
);
alter table public.touchline_club_coach_operations enable row level security;
revoke all on public.touchline_club_coach_operations from public,anon,authenticated,service_role;
grant select,insert on public.touchline_club_coach_operations to service_role;

create function public.touchline_club_coach_lifecycle(p_user_id uuid,p_season_id uuid,p_command jsonb,p_offer jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
  v_current public.touchline_club_collections%rowtype;
  v_prior public.touchline_club_coach_operations%rowtype;
  v_contract public.touchline_coach_contracts%rowtype;
  v_coach jsonb;
  v_next jsonb;
  v_receipt jsonb;
  v_response jsonb;
  v_key text:=p_command->>'idempotencyKey';
  v_action text:=p_command->>'action';
  v_field text;
  v_value numeric;
  v_balance numeric;
  v_fee numeric;
  v_now timestamptz;
  v_club uuid;
begin
  v_field:=case v_action when 'release-coach' then 'currentCoachId' when 'hire-coach' then 'incomingCoachId' end;
  if jsonb_typeof(p_command) is distinct from 'object' or v_field is null
    or not (p_command ?& array['action',v_field,'expectedRevision','idempotencyKey'])
    or (p_command-array['action',v_field,'expectedRevision','idempotencyKey'])<>'{}'::jsonb
    or coalesce(v_key,'')!~'^[a-zA-Z0-9_-]{8,120}$'
    or jsonb_typeof(p_command->v_field) is distinct from 'string' or coalesce(p_command->>v_field,'')!~'^[0-9]{1,16}$'
    or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number'
    or (p_command->>'expectedRevision')::numeric<0 or (p_command->>'expectedRevision')::numeric>=9007199254740991
    or trunc((p_command->>'expectedRevision')::numeric)<>(p_command->>'expectedRevision')::numeric
    then raise exception 'CLUB_INVALID_REQUEST'; end if;
  -- Durable historical response is immutable: replay is allowed even after market closure.
  select * into v_prior from public.touchline_club_coach_operations
    where user_id=p_user_id and season_id=p_season_id and idempotency_key=v_key;
  if found then
    if v_prior.command is distinct from p_command then raise exception 'CLUB_IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.response||jsonb_build_object('replayed',true);
  end if;
  perform public.touchline_club_lock_open_round(p_season_id);
  -- Serialize entitlement changes with the same round -> subscription -> ownership
  -- ordering used by collection initialization; recheck entitlement under the lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||p_user_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-club-ownership:'||p_user_id::text,0));
  select * into v_current from public.touchline_club_collections where user_id=p_user_id and season_id=p_season_id for update;
  if not found then raise exception 'CLUB_COLLECTION_REQUIRED'; end if;
  select * into v_prior from public.touchline_club_coach_operations
    where user_id=p_user_id and season_id=p_season_id and idempotency_key=v_key;
  if found then
    if v_prior.command is distinct from p_command then raise exception 'CLUB_IDEMPOTENCY_CONFLICT'; end if;
    return v_prior.response||jsonb_build_object('replayed',true);
  end if;
  if exists(select 1 from public.touchline_club_collection_operations where user_id=p_user_id and season_id=p_season_id and idempotency_key=v_key)
    then raise exception 'CLUB_IDEMPOTENCY_CONFLICT'; end if;
  if v_current.revision is distinct from (p_command->>'expectedRevision')::bigint then raise exception 'CLUB_STALE_REVISION'; end if;
  if v_current.state->>'plan' not in ('standard','master','vip') then raise exception 'CLUB_COLLECTION_PAID_PLAN_REQUIRED'; end if;
  if not exists(select 1 from public.touchline_fantasy_entitlements e where e.user_id=p_user_id and e.entitlement_key='fantasy_access'
    and e.status='active' and e.plan_key=v_current.state->>'plan'
    and (e.current_period_start is null or e.current_period_start<=clock_timestamp())
    and (e.current_period_end is null or e.current_period_end>clock_timestamp())) then raise exception 'CLUB_ACCESS_REQUIRED'; end if;
  if not public.touchline_club_market_is_open(p_season_id) then raise exception 'CLUB_MARKET_CLOSED'; end if;
  -- QA market override must never permit changes in any locked/live season round.
  if exists(select 1 from public.touchline_fantasy_gameweeks where season_id=p_season_id and state in ('LOCKED','LIVE'))
    then raise exception 'CLUB_COACH_ROUND_LOCKED'; end if;
  v_coach:=v_current.state->'coach';
  v_balance:=(v_current.state->>'balanceEur')::numeric;
  if v_balance is null or v_balance<0 or trunc(v_balance)<>v_balance or v_balance>9007199254740991 then raise exception 'CLUB_BALANCE_INVALID'; end if;
  v_now:=clock_timestamp();
  select * into v_contract from public.touchline_coach_contracts where user_id=p_user_id and status='active' for update;
  if v_action='release-coach' then
    if v_coach is null or v_coach='null'::jsonb then raise exception 'CLUB_COACH_REQUIRED'; end if;
    if v_coach->>'id' is distinct from p_command->>'currentCoachId' then raise exception 'CLUB_COACH_NOT_OWNED'; end if;
    v_value:=case v_coach->>'tier' when 'ruby-red' then 5000000 when 'sapphire-blue' then 10000000 when 'amethyst-purple' then 15000000
      when 'radiant-gold' then 25000000 when 'emerald-green' then 35000000 when 'clear-diamond' then 50000000 when 'diamond-gold' then 70000000 end;
    if v_value is null or (v_coach->>'valueEur')::numeric is distinct from v_value then raise exception 'CLUB_PRICE_INVALID'; end if;
    if v_contract.id is not null then
      if v_contract.coach_provider_id is distinct from v_coach->>'id' then raise exception 'CLUB_COACH_CONTRACT_MISMATCH'; end if;
      update public.touchline_coach_contracts set status='ended',ended_at=v_now,end_reason='Collection coach released',end_idempotency_key=v_key,updated_at=v_now where id=v_contract.id;
      insert into public.touchline_coach_contract_events(contract_id,user_id,event_type,idempotency_key,reason,points_snapshot,occurred_at)
        values(v_contract.id,p_user_id,'cancelled',v_key,'Collection coach released',public.touchline_coach_points_snapshot(v_contract.id),v_now);
    end if;
    -- No retroactive contract or fabricated historic points when a legacy collection has none.
    v_fee:=v_value/10;
    v_balance:=v_balance+v_value-v_fee;
    v_receipt:=jsonb_build_object('action',v_action,'outgoingContract',v_coach,'paidCredits',v_value,'feeCredits',v_fee,'refundCredits',v_value-v_fee);
    v_coach:='null'::jsonb;
  else
    if v_coach is distinct from 'null'::jsonb then raise exception 'CLUB_COACH_ALREADY_OWNED'; end if;
    if v_contract.id is not null then raise exception 'CLUB_COACH_CONTRACT_MISMATCH'; end if;
    if jsonb_typeof(p_offer) is distinct from 'object' or p_offer->>'id' is distinct from p_command->>'incomingCoachId'
      or p_offer->'published' is distinct from 'true'::jsonb then raise exception 'CLUB_COACH_UNAVAILABLE'; end if;
    v_value:=case p_offer->>'tier' when 'ruby-red' then 5000000 when 'sapphire-blue' then 10000000 when 'amethyst-purple' then 15000000
      when 'radiant-gold' then 25000000 when 'emerald-green' then 35000000 when 'clear-diamond' then 50000000 when 'diamond-gold' then 70000000 end;
    if v_value is null or (p_offer->>'valueEur')::numeric is distinct from v_value then raise exception 'CLUB_PRICE_INVALID'; end if;
    v_club:=(p_offer->>'clubId')::uuid;
    perform id from public.football_clubs where id=v_club and provider='sportmonks' and nullif(trim(provider_team_id),'') is not null for share;
    if not found then raise exception 'CLUB_COACH_UNAVAILABLE'; end if;
    if v_balance<v_value then raise exception 'CLUB_INSUFFICIENT_BALANCE'; end if;
    v_balance:=v_balance-v_value;
    v_coach:=jsonb_build_object('id',p_offer->>'id','tier',p_offer->>'tier','valueEur',v_value);
    insert into public.touchline_coach_contracts(user_id,coach_provider_id,club_id,status,scoring_version,started_at,hire_idempotency_key)
      values(p_user_id,p_offer->>'id',v_club,'active','coach_scoring_v2',v_now,v_key) returning * into v_contract;
    insert into public.touchline_coach_contract_events(contract_id,user_id,event_type,idempotency_key,reason,occurred_at)
      values(v_contract.id,p_user_id,'hired',v_key,'Collection coach hired',v_now);
    v_receipt:=jsonb_build_object('action',v_action,'incomingContract',v_coach,'signingCredits',v_value);
  end if;
  if v_balance>9007199254740991 then raise exception 'CLUB_CREDITS_OVERFLOW'; end if;
  v_next:=v_current.state||jsonb_build_object('coach',v_coach,'balanceEur',v_balance,'revision',v_current.revision+1);
  v_receipt:=v_receipt||jsonb_build_object('key',v_key,'revision',v_current.revision+1,'balanceCredits',v_balance);
  v_response:=jsonb_build_object('ok',true,'accountId',p_user_id,'seasonId',p_season_id,'state',v_next,'receipt',v_receipt,'replayed',false);
  update public.touchline_club_collections set state=v_next,revision=revision+1,updated_at=v_now where user_id=p_user_id and season_id=p_season_id;
  insert into public.touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision) values(p_user_id,p_season_id,v_key,p_command,v_current.revision+1);
  insert into public.touchline_club_coach_operations(user_id,season_id,idempotency_key,command,before_state,response) values(p_user_id,p_season_id,v_key,p_command,v_current.state,v_response);
  return v_response;
end;
$$;
revoke all on function public.touchline_club_coach_lifecycle(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.touchline_club_coach_lifecycle(uuid,uuid,jsonb,jsonb) to service_role;
commit;
