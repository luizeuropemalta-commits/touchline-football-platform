-- Ordinary contract release: 10% of the paid contract, never today's market price.
-- No exchange fee, football fact, historical round snapshot or purchase receipt is changed.
begin;
set local lock_timeout='5s';

create table public.touchline_club_release_receipts (
  user_id uuid not null,
  season_id uuid not null,
  idempotency_key text not null,
  player_id uuid not null,
  paid_credits bigint not null check(paid_credits>0 and paid_credits<=9007199254740991),
  fee_credits bigint not null check(fee_credits>=0),
  refund_credits bigint not null check(refund_credits>=0),
  contract jsonb not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key(user_id,season_id,idempotency_key),
  foreign key(user_id,season_id,idempotency_key)
    references public.touchline_club_collection_operations(user_id,season_id,idempotency_key) on delete restrict,
  check(fee_credits+refund_credits=paid_credits),
  check(fee_credits=floor((paid_credits::numeric*10+50)/100))
);
alter table public.touchline_club_release_receipts enable row level security;
revoke all on public.touchline_club_release_receipts from public,anon,authenticated;
grant select,insert on public.touchline_club_release_receipts to service_role;

create function public.touchline_club_release_player(p_user_id uuid,p_season_id uuid,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
  v_current public.touchline_club_collections%rowtype;
  v_prior public.touchline_club_collection_operations%rowtype;
  v_receipt public.touchline_club_release_receipts%rowtype;
  v_player jsonb;
  v_next jsonb;
  v_players jsonb;
  v_paid numeric;
  v_fee numeric;
  v_refund numeric;
  v_balance numeric;
  v_key text:=p_command->>'idempotencyKey';
begin
  if jsonb_typeof(p_command) is distinct from 'object'
    or not (p_command ?& array['action','playerId','expectedRevision','idempotencyKey'])
    or (p_command-array['action','playerId','expectedRevision','idempotencyKey'])<>'{}'::jsonb
    or p_command->>'action' is distinct from 'release'
    or coalesce(v_key,'')!~'^[a-zA-Z0-9_-]{8,120}$'
    or coalesce(p_command->>'playerId','')!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number'
    or (p_command->>'expectedRevision')::numeric<0
    or (p_command->>'expectedRevision')::numeric>9007199254740991
    or trunc((p_command->>'expectedRevision')::numeric)<>(p_command->>'expectedRevision')::numeric then
    raise exception 'CLUB_INVALID_REQUEST';
  end if;
  -- Canonical lock order: QA switch (when installed), round, then collection.
  -- The QA implementation also locks LIVE rounds despite the test market override.
  perform public.touchline_club_lock_open_round(p_season_id);
  select * into v_current from public.touchline_club_collections
    where user_id=p_user_id and season_id=p_season_id for update;
  if not found then raise exception 'CLUB_COLLECTION_REQUIRED'; end if;
  select * into v_prior from public.touchline_club_collection_operations
    where user_id=p_user_id and season_id=p_season_id and idempotency_key=v_key;
  if found then
    if v_prior.command is distinct from p_command then raise exception 'CLUB_IDEMPOTENCY_CONFLICT'; end if;
    select * into v_receipt from public.touchline_club_release_receipts
      where user_id=p_user_id and season_id=p_season_id and idempotency_key=v_key;
    if not found then raise exception 'CLUB_RELEASE_RECEIPT_REQUIRED'; end if;
    return jsonb_build_object('state',v_current.state,'receipt',to_jsonb(v_receipt)-array['user_id','season_id'],'replayed',true);
  end if;
  if (p_command->>'expectedRevision')::bigint is distinct from v_current.revision then raise exception 'CLUB_STALE_REVISION'; end if;
  if v_current.revision>=9007199254740991 then raise exception 'CLUB_REVISION_INVALID'; end if;
  if not exists(select 1 from public.touchline_fantasy_entitlements e
    where e.user_id=p_user_id and e.entitlement_key='fantasy_access' and e.status='active'
      and e.plan_key=v_current.state->>'plan'
      and (e.current_period_start is null or e.current_period_start<=clock_timestamp())
      and (e.current_period_end is null or e.current_period_end>clock_timestamp())) then raise exception 'CLUB_ACCESS_REQUIRED'; end if;
  if not public.touchline_club_market_is_open(p_season_id) then raise exception 'CLUB_MARKET_CLOSED'; end if;
  select p into v_player from jsonb_array_elements(v_current.state->'players') p
    where p->>'playerId'=p_command->>'playerId';
  if v_player is null then raise exception 'CLUB_PLAYER_NOT_OWNED'; end if;
  if exists(select 1 from public.touchline_club_player_reservations r
    where r.user_id=p_user_id and r.season_id=p_season_id and r.player_id=(p_command->>'playerId')::uuid) then
    raise exception 'CLUB_PLAYER_RESERVED';
  end if;
  -- A QA opening must not silently release a player from a locked competition round.
  if exists(select 1 from public.touchline_fantasy_user_gameweeks ug
    join public.touchline_fantasy_gameweeks g on g.id=ug.gameweek_id
    where ug.user_id=p_user_id and g.season_id=p_season_id and g.state in ('LOCKED','LIVE')
      and ug.state='LOCKED' and exists(select 1 from jsonb_array_elements(coalesce(ug.collection_related_snapshot,'[]'::jsonb)) p
        where p->>'playerId'=p_command->>'playerId')) then raise exception 'CLUB_PLAYER_ROUND_LOCKED'; end if;
  v_paid:=(v_player->>'valueEur')::numeric;
  if v_paid is null or v_paid<=0 or v_paid>9007199254740991 or trunc(v_paid)<>v_paid then raise exception 'CLUB_PRICE_INVALID'; end if;
  v_fee:=floor((v_paid*10+50)/100);
  v_refund:=v_paid-v_fee;
  v_balance:=(v_current.state->>'balanceEur')::numeric+v_refund;
  if v_balance>9007199254740991 then raise exception 'CLUB_CREDITS_OVERFLOW'; end if;
  select coalesce(jsonb_agg(p order by ord),'[]'::jsonb) into v_players
    from jsonb_array_elements(v_current.state->'players') with ordinality as entries(p,ord)
    where p->>'playerId'<>p_command->>'playerId';
  if jsonb_array_length(v_players)<>jsonb_array_length(v_current.state->'players')-1 then raise exception 'CLUB_INVALID_TRANSITION'; end if;
  v_next:=v_current.state||jsonb_build_object('players',v_players,'balanceEur',v_balance,'revision',v_current.revision+1);
  update public.touchline_club_collections set state=v_next,revision=revision+1,updated_at=clock_timestamp()
    where user_id=p_user_id and season_id=p_season_id;
  insert into public.touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision)
    values(p_user_id,p_season_id,v_key,p_command,v_current.revision+1);
  insert into public.touchline_club_release_receipts(user_id,season_id,idempotency_key,player_id,paid_credits,fee_credits,refund_credits,contract,revision)
    values(p_user_id,p_season_id,v_key,(p_command->>'playerId')::uuid,v_paid,v_fee,v_refund,v_player,v_current.revision+1)
    returning * into v_receipt;
  return jsonb_build_object('state',v_next,'receipt',to_jsonb(v_receipt)-array['user_id','season_id'],'replayed',false);
end;
$$;
revoke all on function public.touchline_club_release_player(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.touchline_club_release_player(uuid,uuid,jsonb) to service_role;
commit;
