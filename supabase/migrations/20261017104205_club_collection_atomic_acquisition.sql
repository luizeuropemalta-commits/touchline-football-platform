begin;
set local lock_timeout = '5s';

-- Private season collection. This is not the immutable round XI, football
-- statistics, or the legacy purchased-TC wallet. No automatic account backfill.
create table public.touchline_club_collections (
  user_id uuid not null references public.users(id) on delete restrict,
  season_id uuid not null references public.football_seasons(id) on delete restrict,
  revision bigint not null check (revision >= 0 and revision <= 9007199254740991),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(user_id, season_id),
  check (jsonb_typeof(state) = 'object'),
  check (state ?& array['seasonId','revision','plan','coach','balanceEur','players','receipts']),
  check (jsonb_typeof(state->'revision') = 'number' and jsonb_typeof(state->'balanceEur') = 'number'),
  check (state->>'plan' in ('standard','master','vip')),
  check (state->>'seasonId' = season_id::text),
  check ((state->>'revision')::bigint = revision),
  check (jsonb_typeof(state->'players') = 'array' and jsonb_array_length(state->'players') <= 35),
  check (jsonb_typeof(state->'receipts') = 'array'),
  check ((state->>'balanceEur')::numeric >= 0 and (state->>'balanceEur')::numeric <= 9007199254740991)
);
create index touchline_club_collections_season_idx on public.touchline_club_collections(season_id);
alter table public.touchline_club_collections enable row level security;
revoke all on public.touchline_club_collections from public, anon, authenticated;
grant select, insert, update on public.touchline_club_collections to service_role;

create table public.touchline_club_collection_operations (
  user_id uuid not null,
  season_id uuid not null,
  idempotency_key text not null check (idempotency_key ~ '^[a-zA-Z0-9_-]{8,120}$'),
  command jsonb not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key(user_id, season_id, idempotency_key),
  foreign key(user_id, season_id) references public.touchline_club_collections(user_id, season_id) on delete restrict
);
alter table public.touchline_club_collection_operations enable row level security;
revoke all on public.touchline_club_collection_operations from public, anon, authenticated;
grant select, insert on public.touchline_club_collection_operations to service_role;

-- Active proposal reservations are private and independent of public listings.
create table public.touchline_club_player_reservations (
  user_id uuid not null,season_id uuid not null,player_id uuid not null,proposal_id uuid not null,
  primary key(user_id,season_id,player_id),
  foreign key(user_id,season_id) references public.touchline_club_collections(user_id,season_id) on delete restrict
);
create index touchline_club_player_reservations_proposal_idx on public.touchline_club_player_reservations(proposal_id);
alter table public.touchline_club_player_reservations enable row level security;
revoke all on public.touchline_club_player_reservations from public,anon,authenticated;
grant select,insert,delete on public.touchline_club_player_reservations to service_role;

-- Only the authenticated application server can supply the domain-validated
-- transition. Caller-controlled balances are never accepted by the HTTP route.
create function public.touchline_club_commit_acquisition(
  p_user_id uuid, p_season_id uuid, p_expected_revision bigint, p_next jsonb, p_command jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_current public.touchline_club_collections%rowtype;
  v_prior public.touchline_club_collection_operations%rowtype;
  v_player jsonb;
  v_price numeric;
  v_position_limit int;
  v_slot_limit int;
  v_geometry jsonb;
  v_key text := p_command->>'idempotencyKey';
begin
  select * into v_current from public.touchline_club_collections
    where user_id=p_user_id and season_id=p_season_id for update;
  if not found then raise exception 'CLUB_COLLECTION_REQUIRED'; end if;
  select * into v_prior from public.touchline_club_collection_operations
    where user_id=p_user_id and season_id=p_season_id and idempotency_key=v_key;
  if found then
    if v_prior.command is distinct from p_command then raise exception 'CLUB_IDEMPOTENCY_CONFLICT'; end if;
    return v_current.state;
  end if;
  if p_expected_revision is distinct from v_current.revision
    or (p_command->>'expectedRevision')::bigint is distinct from v_current.revision then
    raise exception 'CLUB_STALE_REVISION';
  end if;
  if not exists(select 1 from public.touchline_fantasy_entitlements e
    where e.user_id=p_user_id and e.entitlement_key='fantasy_access' and e.status='active'
    and e.plan_key=v_current.state->>'plan'
    and (e.current_period_start is null or e.current_period_start <= clock_timestamp())
    and (e.current_period_end is null or e.current_period_end > clock_timestamp())) then
    raise exception 'CLUB_ACCESS_REQUIRED';
  end if;
  -- Reuse the published round window. Never infer a final whistle here.
  if not exists(select 1 from public.touchline_fantasy_gameweeks g
    join public.touchline_fantasy_configs c on c.season_id=g.season_id and c.status='active'
    where g.season_id=p_season_id and c.competition_key='england' and g.state='MARKET_OPEN'
      and g.market_opens_at <= clock_timestamp() and g.locks_at > clock_timestamp()) then
    raise exception 'CLUB_MARKET_CLOSED';
  end if;
  if p_next->>'seasonId' is distinct from p_season_id::text
    or (p_next-array['players','receipts','revision','balanceEur']) is distinct from (v_current.state-array['players','receipts','revision','balanceEur'])
    or p_next->>'plan' is distinct from v_current.state->>'plan'
    or p_next->'coach' is distinct from v_current.state->'coach'
    or (p_next->>'revision')::bigint is distinct from v_current.revision+1
    or jsonb_array_length(p_next->'players') is distinct from jsonb_array_length(v_current.state->'players')+1
    or jsonb_array_length(p_next->'receipts') is distinct from jsonb_array_length(v_current.state->'receipts')+1 then
    raise exception 'CLUB_INVALID_TRANSITION';
  end if;
  v_player := p_next->'players'->-1;
  if (p_next->'players') - (jsonb_array_length(p_next->'players')-1) is distinct from v_current.state->'players'
    or (p_next->'receipts') - (jsonb_array_length(p_next->'receipts')-1) is distinct from v_current.state->'receipts'
    or v_player->>'playerId' is distinct from p_command->>'playerId'
    or v_player->>'area' is distinct from p_command->>'area'
    or v_player->'slot' is distinct from p_command->'slot' then
    raise exception 'CLUB_INVALID_TRANSITION';
  end if;
  v_price := (v_player->>'valueEur')::numeric;
  if v_price is null or v_price <= 0 or trunc(v_price) <> v_price
    or (p_next->>'balanceEur')::numeric is distinct from (v_current.state->>'balanceEur')::numeric-v_price then
    raise exception 'CLUB_INVALID_DEBIT';
  end if;
  if not exists(select 1 from public.touchline_card_publications p
    join public.football_players f on f.id=p.player_id
    join public.football_player_market_values m on m.id=p.market_value_id and m.player_id=p.player_id
    where p.player_id=(v_player->>'playerId')::uuid and p.publication_status='published'
      and f.current_club_id=(v_player->>'clubId')::uuid
      and m.status='verified' and m.confidence='verified' and m.market_value_eur=v_price) then
    raise exception 'CLUB_OFFER_UNAVAILABLE';
  end if;
  if p_next->'receipts'->-1 is distinct from jsonb_build_object('key',v_key,
    'playerId',v_player->>'playerId','area',v_player->>'area','slot',v_player->'slot',
    'valueEur',v_price,'revision',v_current.revision+1) then raise exception 'CLUB_RECEIPTS_INVALID'; end if;
  v_slot_limit:=case v_player->>'area' when 'starters' then 11 when 'reserves' then 9 when 'outside' then 15 end;
  if v_slot_limit is null or jsonb_typeof(v_player->'slot') is distinct from 'number'
    or (v_player->>'slot')::numeric<>trunc((v_player->>'slot')::numeric)
    or (v_player->>'slot')::int<0 or (v_player->>'slot')::int>=v_slot_limit then raise exception 'CLUB_ROSTER_INVALID'; end if;
  v_position_limit:=case v_player->>'position' when 'GK' then 3 when 'CB' then 6 when 'RB' then 3 when 'LB' then 3
    when 'DM' then 5 when 'MID' then 5 when 'RW' then 3 when 'LW' then 3 when 'CF' then 4 end;
  if v_position_limit is null or (select count(*) from jsonb_array_elements(p_next->'players') p
    where p->>'position'=v_player->>'position')>v_position_limit then raise exception 'CLUB_POSITION_FULL'; end if;
  if (select count(*) from jsonb_array_elements(p_next->'players') p
    where p->>'clubId'=v_player->>'clubId' and not p ? 'transferException')>3 then raise exception 'CLUB_TEAM_LIMIT'; end if;
  if exists(select 1 from jsonb_array_elements(v_current.state->'players') p
    where p->>'playerId'=v_player->>'playerId' or (p->>'area'=v_player->>'area' and p->'slot'=v_player->'slot')) then
    raise exception 'CLUB_ALREADY_OWNED_OR_SLOT_OCCUPIED';
  end if;
  if v_player ? 'transferException' then raise exception 'CLUB_INVALID_TRANSITION'; end if;
  if v_player->>'area'='starters' then
    select geometry into v_geometry from public.touchline_formation_geometry_versions
      where formation_code=p_next->>'formationCode' and status='published' order by geometry_version desc limit 1;
    if v_geometry is null or jsonb_array_length(v_geometry->'slots')<>11 then raise exception 'CLUB_FORMATION_INVALID'; end if;
    if not coalesce((v_geometry->'slots'->((v_player->>'slot')::int)->'allowedPositions') ?
      (case v_player->>'position' when 'GK' then 'goalkeeper' when 'CB' then 'centre-back'
        when 'RB' then 'right-back' when 'LB' then 'left-back' when 'DM' then 'defensive-midfield'
        when 'MID' then 'midfield' when 'RW' then 'attacker' when 'LW' then 'attacker'
        when 'CF' then 'centre-forward' end),false) then raise exception 'CLUB_SLOT_POSITION_INVALID'; end if;
  end if;
  update public.touchline_club_collections set state=p_next, revision=revision+1, updated_at=now()
    where user_id=p_user_id and season_id=p_season_id;
  insert into public.touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision)
    values(p_user_id,p_season_id,v_key,p_command,v_current.revision+1);
  return p_next;
end;
$$;
revoke all on function public.touchline_club_commit_acquisition(uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.touchline_club_commit_acquisition(uuid,uuid,bigint,jsonb,jsonb) to service_role;

-- Bootstrap is explicit after a verified coach selection, never a GET side effect.
-- The server supplies the published coach identity/tier; credits are computed here.
create function public.touchline_club_initialize_collection(
  p_user_id uuid, p_season_id uuid, p_plan text, p_coach jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_state jsonb;
  v_budget bigint;
  v_coach_value bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_season_id::text,0));
  select state into v_state from public.touchline_club_collections where user_id=p_user_id and season_id=p_season_id;
  if found then
    if v_state->>'plan' is distinct from p_plan or v_state->'coach' is distinct from p_coach then
      raise exception 'CLUB_COLLECTION_ALREADY_INITIALIZED';
    end if;
    return v_state;
  end if;
  v_budget := case p_plan when 'standard' then 500000000 when 'master' then 800000000 when 'vip' then 1200000000 else null end;
  v_coach_value := case p_coach->>'tier' when 'ruby-red' then 5000000 when 'sapphire-blue' then 10000000
    when 'amethyst-purple' then 15000000 when 'radiant-gold' then 25000000 when 'emerald-green' then 35000000
    when 'clear-diamond' then 50000000 when 'diamond-gold' then 70000000 else null end;
  if v_budget is null or v_coach_value is null or nullif(p_coach->>'id','') is null
    or (p_coach->>'valueEur')::bigint is distinct from v_coach_value then raise exception 'CLUB_INITIAL_STATE_INVALID'; end if;
  if not exists(select 1 from public.touchline_fantasy_entitlements e
    where e.user_id=p_user_id and e.entitlement_key='fantasy_access' and e.status='active' and e.plan_key=p_plan
    and (e.current_period_start is null or e.current_period_start<=clock_timestamp()) and (e.current_period_end is null or e.current_period_end>clock_timestamp())) then
    raise exception 'CLUB_ACCESS_REQUIRED';
  end if;
  if not exists(select 1 from public.touchline_fantasy_gameweeks g
    join public.touchline_fantasy_configs c on c.season_id=g.season_id and c.status='active'
    where g.season_id=p_season_id and c.competition_key='england' and g.state='MARKET_OPEN'
    and g.market_opens_at<=clock_timestamp() and g.locks_at>clock_timestamp()) then raise exception 'CLUB_MARKET_CLOSED'; end if;
  -- Never silently grant a second budget over the previous account's collection.
  if exists(select 1 from public.touchline_card_contracts where user_id=p_user_id and season_id=p_season_id and status='active')
    or exists(select 1 from public.touchline_coach_contracts where user_id=p_user_id and status='active')
    or exists(select 1 from public.touchline_fantasy_user_gameweeks ug
      join public.touchline_fantasy_gameweeks g on g.id=ug.gameweek_id
      join public.touchline_fantasy_user_gameweek_selections s on s.user_gameweek_id=ug.id
      where ug.user_id=p_user_id and g.season_id=p_season_id) then
    raise exception 'CLUB_LEGACY_RESET_REQUIRED';
  end if;
  v_state := jsonb_build_object('revision',0,'seasonId',p_season_id::text,'plan',p_plan,
    'balanceEur',v_budget-v_coach_value,'coach',p_coach,'players','[]'::jsonb,'receipts','[]'::jsonb);
  insert into public.touchline_club_collections(user_id,season_id,revision,state) values(p_user_id,p_season_id,0,v_state);
  return v_state;
end;
$$;
revoke all on function public.touchline_club_initialize_collection(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.touchline_club_initialize_collection(uuid,uuid,text,jsonb) to service_role;

create function public.touchline_club_commit_allocation(
  p_user_id uuid,p_season_id uuid,p_expected_revision bigint,p_next jsonb,p_command jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_current public.touchline_club_collections%rowtype;
  v_prior public.touchline_club_collection_operations%rowtype;
  v_geometry jsonb;
  v_key text := p_command->>'idempotencyKey';
begin
  select * into v_current from public.touchline_club_collections
    where user_id=p_user_id and season_id=p_season_id for update;
  if not found then raise exception 'CLUB_COLLECTION_REQUIRED'; end if;
  select * into v_prior from public.touchline_club_collection_operations
    where user_id=p_user_id and season_id=p_season_id and idempotency_key=v_key;
  if found then
    if v_prior.command is distinct from p_command then raise exception 'CLUB_IDEMPOTENCY_CONFLICT'; end if;
    return v_current.state;
  end if;
  if p_expected_revision is distinct from v_current.revision
    or (p_command->>'expectedRevision')::bigint is distinct from v_current.revision then raise exception 'CLUB_STALE_REVISION'; end if;
  if p_command->>'action' not in ('formation','move') then raise exception 'CLUB_INVALID_TRANSITION'; end if;
  if not exists(select 1 from public.touchline_fantasy_entitlements e
    where e.user_id=p_user_id and e.entitlement_key='fantasy_access' and e.status='active'
      and e.plan_key=v_current.state->>'plan'
      and (e.current_period_start is null or e.current_period_start<=clock_timestamp())
      and (e.current_period_end is null or e.current_period_end>clock_timestamp())) then raise exception 'CLUB_ACCESS_REQUIRED'; end if;
  if not exists(select 1 from public.touchline_fantasy_gameweeks g
    join public.touchline_fantasy_configs c on c.season_id=g.season_id and c.status='active'
    where g.season_id=p_season_id and c.competition_key='england' and g.state='MARKET_OPEN'
      and g.market_opens_at<=clock_timestamp() and g.locks_at>clock_timestamp()) then raise exception 'CLUB_MARKET_CLOSED'; end if;
  -- Immutable ownership payload, wallet, receipts, coach and all extra fields.
  if (p_next-array['players','revision','formationCode']) is distinct from (v_current.state-array['players','revision','formationCode'])
    or (p_next->>'revision')::bigint is distinct from v_current.revision+1
    or jsonb_array_length(p_next->'players') is distinct from jsonb_array_length(v_current.state->'players')
    or (select jsonb_agg(p-array['area','slot'] order by p->>'playerId') from jsonb_array_elements(p_next->'players') p)
       is distinct from (select jsonb_agg(p-array['area','slot'] order by p->>'playerId') from jsonb_array_elements(v_current.state->'players') p) then
    raise exception 'CLUB_INVALID_TRANSITION';
  end if;
  if p_command->>'action'='formation' and p_next->>'formationCode' is distinct from p_command->>'formationCode' then
    raise exception 'CLUB_FORMATION_INVALID'; end if;
  if p_command->>'action'='move' and (
    p_next->>'formationCode' is distinct from v_current.state->>'formationCode'
    or not exists(select 1 from jsonb_array_elements(p_next->'players') p where p->>'playerId'=p_command->>'playerId'
      and p->>'area'=p_command->>'area' and p->'slot'=p_command->'slot')) then raise exception 'CLUB_INVALID_TRANSITION'; end if;
  if exists(select 1 from public.touchline_club_player_reservations r
    join lateral (select p from jsonb_array_elements(v_current.state->'players') p where p->>'playerId'=r.player_id::text) old on true
    join lateral (select p from jsonb_array_elements(p_next->'players') p where p->>'playerId'=r.player_id::text) next on true
    where r.user_id=p_user_id and r.season_id=p_season_id
      and row(old.p->'area',old.p->'slot') is distinct from row(next.p->'area',next.p->'slot')) then
    raise exception 'CLUB_PLAYER_RESERVED_OR_MISSING'; end if;
  if exists(select 1 from jsonb_array_elements(p_next->'players') p
    where not (p ?& array['playerId','area','slot']) or p->>'area' not in ('starters','reserves','outside')
      or jsonb_typeof(p->'slot')<>'number' or (p->>'slot')::numeric<>trunc((p->>'slot')::numeric)
      or (p->>'slot')::int<0 or (p->>'slot')::int >= case p->>'area' when 'starters' then 11 when 'reserves' then 9 else 15 end)
    or exists(select 1 from jsonb_array_elements(p_next->'players') p group by p->>'area',p->'slot' having count(*)>1) then
    raise exception 'CLUB_ROSTER_INVALID'; end if;
  select geometry into v_geometry from public.touchline_formation_geometry_versions
    where formation_code=p_next->>'formationCode' and status='published' order by geometry_version desc limit 1;
  if v_geometry is null or jsonb_array_length(v_geometry->'slots')<>11 then raise exception 'CLUB_FORMATION_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_next->'players') p where p->>'area'='starters'
    and not coalesce((v_geometry->'slots'->((p->>'slot')::int)->'allowedPositions') ? (case p->>'position'
      when 'GK' then 'goalkeeper' when 'CB' then 'centre-back' when 'RB' then 'right-back' when 'LB' then 'left-back'
      when 'DM' then 'defensive-midfield' when 'MID' then 'midfield' when 'RW' then 'attacker'
      when 'LW' then 'attacker' when 'CF' then 'centre-forward' end),false)) then raise exception 'CLUB_SLOT_POSITION_INVALID'; end if;
  update public.touchline_club_collections set state=p_next,revision=revision+1,updated_at=clock_timestamp()
    where user_id=p_user_id and season_id=p_season_id;
  insert into public.touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision)
    values(p_user_id,p_season_id,v_key,p_command,v_current.revision+1);
  return p_next;
end;
$$;
revoke all on function public.touchline_club_commit_allocation(uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.touchline_club_commit_allocation(uuid,uuid,bigint,jsonb,jsonb) to service_role;
commit;
