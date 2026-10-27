-- Local-only migration. Application Exchange capability remains OFF.
begin;
set local lock_timeout='5s';
create table public.touchline_club_exchange_listings(
 user_id uuid not null,season_id uuid not null,player_id uuid not null,
 primary key(user_id,season_id,player_id),
 foreign key(user_id,season_id) references public.touchline_club_collections(user_id,season_id)
);
create table public.touchline_club_exchange_proposals(
 id uuid primary key,season_id uuid not null,proposer_id uuid not null,accepter_id uuid not null,
 command jsonb not null,terms jsonb not null,status text not null default 'pending' check(status in('pending','accepted','declined','cancelled','expired')),
 expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,
 check(proposer_id<>accepter_id),
 foreign key(proposer_id,season_id) references public.touchline_club_collections(user_id,season_id),
 foreign key(accepter_id,season_id) references public.touchline_club_collections(user_id,season_id)
);
create table public.touchline_club_exchange_receipts(
 proposal_id uuid primary key references public.touchline_club_exchange_proposals(id),
 season_id uuid not null,proposer_id uuid not null,accepter_id uuid not null,
 receipt jsonb not null,proposer_state jsonb not null,accepter_state jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index touchline_club_exchange_proposer_history on public.touchline_club_exchange_receipts(proposer_id,season_id,created_at);
create index touchline_club_exchange_accepter_history on public.touchline_club_exchange_receipts(accepter_id,season_id,created_at);
alter table public.touchline_club_exchange_listings enable row level security;
alter table public.touchline_club_exchange_proposals enable row level security;
alter table public.touchline_club_exchange_receipts enable row level security;
revoke all on public.touchline_club_exchange_listings,public.touchline_club_exchange_proposals,public.touchline_club_exchange_receipts from public,anon,authenticated,service_role;
grant select,insert,delete on public.touchline_club_exchange_listings to service_role;
grant select,insert,update on public.touchline_club_exchange_proposals to service_role;
grant select,insert on public.touchline_club_exchange_receipts to service_role;

-- Publication SHARE locks are mutually compatible across different owner pairs.
-- Collection TC uses verified market_value_eur, as acquisition does.
-- calculated_price_tc/nominal GBP belongs to a distinct Card Engine economy.
-- Canonical current card facts; caller cannot submit prices, labels or position.
create function public.touchline_club_exchange_offer(p_player uuid,p_season uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r record; detail text; category text;
begin
 select f.id,f.current_club_id,f.display_name,m.market_value_eur as value_tc into r
 from public.touchline_card_publications p join public.football_players f on f.id=p.player_id
 join public.football_player_market_values m on m.id=p.market_value_id and m.player_id=f.id
 join public.football_seasons season on season.id=p_season and season.competition_id=p.competition_id
 where p.player_id=p_player and p.publication_status='published'
 and p.effective_season ~ '^[0-9]{4}[-/]([0-9]{2}|[0-9]{4})$'
 and season.name ~ '^[0-9]{4}[-/]([0-9]{2}|[0-9]{4})$'
 and left(p.effective_season,4)=left(season.name,4) and right(p.effective_season,2)=right(season.name,2) and m.status='verified' and m.confidence='verified'
 order by p.published_at desc nulls last,p.id desc limit 1 for share of p,f,m;
 if not found or nullif(trim(r.display_name),'') is null or r.current_club_id is null or r.value_tc is null or r.value_tc<=0
   or r.value_tc>9007199254740991 or trunc(r.value_tc)<>r.value_tc then raise exception 'CLUB_OFFER_UNAVAILABLE'; end if;
 detail:=public.touchline_club_current_primary_detail(p_player);
 category:=public.touchline_club_primary_category(detail);
 if category is null then raise exception 'CLUB_POSITION_MISMATCH'; end if;
 return jsonb_build_object('playerId',r.id,'clubId',r.current_club_id,'name',r.display_name,'valueTc',r.value_tc,'position',category,'primaryDetail',detail);
end;$$;

-- Serializes both parties in deterministic order; compatible with existing
-- round -> subscription -> ownership -> collection order. Never requires the
-- ordinary market to be open: only outside-match cards may be exchanged.
create function public.touchline_club_exchange_lock(p_season uuid,p_first uuid,p_second uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare actor uuid;
begin
 perform public.touchline_club_lock_open_round(p_season);
 for actor in select distinct x from unnest(array[p_first,p_second]) x order by x loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:'||actor::text,0));
 end loop;
 for actor in select distinct x from unnest(array[p_first,p_second]) x order by x loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-club-ownership:'||actor::text,0));
 end loop;
 perform user_id from public.touchline_club_collections where season_id=p_season and user_id in(p_first,p_second) order by user_id for update;
end;$$;

create function public.touchline_club_exchange_assert_owner(p_user uuid,p_season uuid,p_state jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_state is null then raise exception 'CLUB_COLLECTION_REQUIRED'; end if;
 -- Beta currently uses the legacy XI journey, not a 35-card collection. No backfill.
 if p_state->>'plan' not in('standard','master','vip') then raise exception 'CLUB_COLLECTION_PAID_PLAN_REQUIRED'; end if;
 if jsonb_typeof(p_state->'players') is distinct from 'array' then raise exception 'CLUB_ROSTER_INVALID'; end if;
 if jsonb_array_length(p_state->'players')<>35 then raise exception 'CLUB_COMPLETE_ROSTER_REQUIRED'; end if;
 if jsonb_typeof(p_state->'balanceEur') is distinct from 'number' or (p_state->>'balanceEur')::numeric<0
  or (p_state->>'balanceEur')::numeric>9007199254740991 or trunc((p_state->>'balanceEur')::numeric)<>(p_state->>'balanceEur')::numeric then raise exception 'CLUB_BALANCE_INVALID'; end if;
 if p_state->>'seasonId' is distinct from p_season::text then raise exception 'CLUB_SEASON_MISMATCH'; end if;
 if (select count(distinct p->>'playerId') from jsonb_array_elements(p_state->'players') p)<>35
  or (select count(distinct (p->>'area',p->>'slot')) from jsonb_array_elements(p_state->'players') p)<>35
  or exists(select 1 from jsonb_array_elements(p_state->'players') p where
   coalesce(p->>'playerId','')!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   or coalesce(p->>'clubId','')!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   or coalesce(p->>'area','') not in('starters','reserves','outside')
   or jsonb_typeof(p->'slot') is distinct from 'number' or coalesce(p->>'slot','')!~'^[0-9]+$'
   or (p->>'slot')::numeric>=case p->>'area' when 'starters' then 11 when 'reserves' then 9 when 'outside' then 15 else 0 end
   or jsonb_typeof(p->'valueEur') is distinct from 'number' or (p->>'valueEur')::numeric<=0
   or (p->>'valueEur')::numeric>9007199254740991 or trunc((p->>'valueEur')::numeric)<>(p->>'valueEur')::numeric
   or coalesce(p->>'position','') not in('GK','CB','RB','LB','DM','MID','RW','LW','CF'))
 then raise exception 'CLUB_ROSTER_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_state->'players') p group by p->>'position'
  having count(*)>case p->>'position' when 'GK' then 3 when 'CB' then 6 when 'RB' then 3 when 'LB' then 3 when 'DM' then 5 when 'MID' then 5 when 'RW' then 3 when 'LW' then 3 when 'CF' then 4 else 0 end)
 then raise exception 'CLUB_POSITION_FULL'; end if;
 if not exists(select 1 from public.touchline_fantasy_entitlements e where e.user_id=p_user
   and e.entitlement_key='fantasy_access' and e.status='active' and e.plan_key=p_state->>'plan'
   and (e.current_period_start is null or e.current_period_start<=clock_timestamp())
   and (e.current_period_end is null or e.current_period_end>clock_timestamp())) then raise exception 'CLUB_ACCESS_REQUIRED'; end if;
 if not exists(select 1 from public.football_seasons s join public.touchline_fantasy_configs c on c.season_id=s.id
   where s.id=p_season and c.status='active' and c.competition_key='england'
    and s.starts_at is not null and s.ends_at is not null
    and clock_timestamp()>=s.starts_at::timestamptz and clock_timestamp()<(s.ends_at+1)::timestamptz)
 then raise exception 'CLUB_SEASON_CLOSED'; end if;
end;$$;

create function public.touchline_club_exchange_assert_player(p_user uuid,p_season uuid,p_state jsonb,p_player uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owned jsonb;
begin
 select p into owned from jsonb_array_elements(p_state->'players') p where p->>'playerId'=p_player::text;
 if owned is null or owned->>'area'<>'outside' then raise exception 'CLUB_MATCH_RELATED_PLAYER'; end if;
 if exists(select 1 from public.touchline_fantasy_user_gameweeks ug join public.touchline_fantasy_gameweeks g on g.id=ug.gameweek_id
   where ug.user_id=p_user and g.season_id=p_season and ug.state='LOCKED' and g.state in('LOCKED','LIVE')
   and exists(select 1 from jsonb_array_elements(coalesce(ug.collection_related_snapshot,'[]'::jsonb)) p where p->>'playerId'=p_player::text))
 then raise exception 'CLUB_PLAYER_ROUND_LOCKED'; end if;
 -- Reject confirmed active sidelined evidence for a current fixture. Historical
 -- final-fixture injuries never block today's Exchange; no provider request here.
 if exists(select 1 from public.football_players fp
  join public.football_fixtures f on f.season_id=p_season and f.provider=fp.provider
  join public.football_fantasy_fixture_feeds feed on feed.provider=f.provider and feed.provider_fixture_id=f.provider_fixture_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(feed.sidelined_payload)='array' then feed.sidelined_payload else '[]'::jsonb end) item
  where fp.id=p_player and fp.provider='sportmonks'
   and lower(f.status) in('ns','not started','not_started','live','inplay','in play','1st half','2nd half','half time','ht','extra time','et','break')
   and feed.fixture_payload->>'provider'='sportmonks'
   and feed.fixture_payload->>'providerId'=f.provider_fixture_id
   and lower(feed.fixture_payload->>'status') in('ns','not started','not_started','live','inplay','in play','1st half','2nd half','half time','ht','extra time','et','break')
   and item->>'provider'='sportmonks' and item->>'fixtureId'=f.provider_fixture_id
   and item->>'playerId'=fp.provider_player_id and item->'completed'='false'::jsonb
   and lower(item->>'category') in('injury','illness','suspension'))
 then raise exception 'CLUB_PLAYER_UNAVAILABLE';end if;
 return owned;
end;$$;

create function public.touchline_club_exchange_listing(p_actor uuid,p_season uuid,p_player uuid,p_publish boolean) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare state jsonb;n integer;
begin
 if p_actor is null or p_season is null or p_player is null or p_publish is null then raise exception 'CLUB_INVALID_REQUEST';end if;
 perform public.touchline_club_exchange_lock(p_season,p_actor,p_actor);
 select c.state into state from public.touchline_club_collections c where user_id=p_actor and season_id=p_season;
 if p_publish then
  perform public.touchline_club_exchange_assert_owner(p_actor,p_season,state);
  perform public.touchline_club_exchange_assert_player(p_actor,p_season,state,p_player);
  perform public.touchline_club_exchange_offer(p_player,p_season);
  if exists(select 1 from public.touchline_club_player_reservations where user_id=p_actor and season_id=p_season and player_id=p_player) then raise exception 'CLUB_PLAYER_RESERVED'; end if;
  select count(*) into n from (select player_id from public.touchline_club_exchange_listings where user_id=p_actor and season_id=p_season union select player_id from public.touchline_club_player_reservations where user_id=p_actor and season_id=p_season union select p_player) x;
  if n>11 then raise exception 'CLUB_EMERGENCY_PLAYERS_REQUIRED'; end if;
  insert into public.touchline_club_exchange_listings values(p_actor,p_season,p_player) on conflict do nothing;
 else
  delete from public.touchline_club_exchange_listings where user_id=p_actor and season_id=p_season and player_id=p_player;
 end if;
 return jsonb_build_object('ok',true,'listed',p_publish,'playerId',p_player);
end;$$;

create function public.touchline_club_exchange_propose(p_actor uuid,p_season uuid,p_id uuid,p_other uuid,p_out uuid,p_in uuid,p_actor_revision bigint,p_other_revision bigint) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare a public.touchline_club_collections%rowtype;b public.touchline_club_collections%rowtype;
 prior public.touchline_club_exchange_proposals%rowtype;cmd jsonb;oa jsonb;ob jsonb;ca jsonb;cb jsonb;terms jsonb;rate int;fee numeric;comp numeric;expiry timestamptz;aname text;bname text;
begin
 if p_actor is null or p_other is null or p_season is null or p_out is null or p_in is null or p_actor=p_other or p_out=p_in or p_id is null then raise exception 'CLUB_INVALID_REQUEST'; end if;
 cmd:=jsonb_build_object('actor',p_actor,'other',p_other,'outgoing',p_out,'incoming',p_in,'actorRevision',p_actor_revision,'otherRevision',p_other_revision);
 perform public.touchline_club_exchange_lock(p_season,p_actor,p_other);
 select * into prior from public.touchline_club_exchange_proposals where id=p_id for update;
 if found then
  if prior.proposer_id<>p_actor or prior.season_id<>p_season or prior.command<>cmd then raise exception 'CLUB_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('ok',true,'proposalId',p_id,'status',prior.status,'terms',prior.terms-array['proposerContract','accepterContract','proposerPlan','accepterPlan'],'replayed',true);
 end if;
 select * into a from public.touchline_club_collections where user_id=p_actor and season_id=p_season;
 select * into b from public.touchline_club_collections where user_id=p_other and season_id=p_season;
 perform public.touchline_club_exchange_assert_owner(p_actor,p_season,a.state);
 perform public.touchline_club_exchange_assert_owner(p_other,p_season,b.state);
 if a.revision is distinct from p_actor_revision or b.revision is distinct from p_other_revision then raise exception 'CLUB_STALE_REVISION'; end if;
 ca:=public.touchline_club_exchange_assert_player(p_actor,p_season,a.state,p_out);
 cb:=public.touchline_club_exchange_assert_player(p_other,p_season,b.state,p_in);
 if ca->>'position' is distinct from cb->>'position' then raise exception 'CLUB_POSITION_MISMATCH'; end if;
 if exists(select 1 from jsonb_array_elements(a.state->'players') p where p->>'playerId'=p_in::text)
  or exists(select 1 from jsonb_array_elements(b.state->'players') p where p->>'playerId'=p_out::text) then raise exception 'CLUB_ALREADY_OWNED'; end if;
 if not exists(select 1 from public.touchline_club_exchange_listings where user_id=p_actor and season_id=p_season and player_id=p_out)
  or not exists(select 1 from public.touchline_club_exchange_listings where user_id=p_other and season_id=p_season and player_id=p_in) then raise exception 'CLUB_PLAYER_NOT_LISTED'; end if;
 if exists(select 1 from public.touchline_club_player_reservations where season_id=p_season and ((user_id=p_actor and player_id=p_out) or(user_id=p_other and player_id=p_in))) then raise exception 'CLUB_PLAYER_RESERVED'; end if;
 oa:=public.touchline_club_exchange_offer(p_out,p_season);ob:=public.touchline_club_exchange_offer(p_in,p_season);
 if oa->>'position' is distinct from ca->>'position' or ob->>'position' is distinct from cb->>'position' then raise exception 'CLUB_POSITION_MISMATCH'; end if;
 rate:=case a.state->>'plan' when 'standard' then 5 when 'master' then 4 when 'vip' then 2 end;
 fee:=floor((greatest((oa->>'valueTc')::numeric,(ob->>'valueTc')::numeric)*rate+50)/100);
 if mod(fee,2)<>0 then raise exception 'CLUB_EXCHANGE_HALF_CREDIT_UNSUPPORTED'; end if;
 comp:=(oa->>'valueTc')::numeric-(ob->>'valueTc')::numeric;
 select nullif(trim(full_name),'') into aname from public.users where id=p_actor;
 select nullif(trim(full_name),'') into bname from public.users where id=p_other;
 if aname is null or bname is null then raise exception 'CLUB_PROFILE_UNAVAILABLE'; end if;
 terms:=jsonb_build_object('outgoing',oa,'incoming',ob,'proposer',jsonb_build_object('accountId',p_actor,'name',aname),'accepter',jsonb_build_object('accountId',p_other,'name',bname),
  'proposerContract',ca,'accepterContract',cb,'proposerPlan',a.state->>'plan','accepterPlan',b.state->>'plan',
  'quote',jsonb_build_object('feeTc',fee,'bonusTc',fee/2,'retiredTc',fee/2,'compensationTc',comp));
 select (ends_at+1)::timestamptz into expiry from public.football_seasons where id=p_season;
 insert into public.touchline_club_exchange_proposals(id,season_id,proposer_id,accepter_id,command,terms,expires_at) values(p_id,p_season,p_actor,p_other,cmd,terms,expiry);
 insert into public.touchline_club_player_reservations values(p_actor,p_season,p_out,p_id),(p_other,p_season,p_in,p_id);
 return jsonb_build_object('ok',true,'proposalId',p_id,'status','pending','terms',terms-array['proposerContract','accepterContract','proposerPlan','accepterPlan'],'replayed',false);
end;$$;

create function public.touchline_club_exchange_resolve(p_actor uuid,p_season uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare proposal public.touchline_club_exchange_proposals%rowtype;a public.touchline_club_collections%rowtype;b public.touchline_club_collections%rowtype;
 oa jsonb;ob jsonb;ca jsonb;cb jsonb;ap jsonb;bp jsonb;nexta jsonb;nextb jsonb;receipt jsonb;bal_a numeric;bal_b numeric;fee numeric;bonus numeric;comp numeric;stamp timestamptz;key text;
begin
 if p_actor is null or p_season is null or p_id is null or p_action is null or p_action not in('accept','decline','cancel','expire') then raise exception 'CLUB_INVALID_REQUEST'; end if;
 select * into proposal from public.touchline_club_exchange_proposals where id=p_id and season_id=p_season;
 if not found or p_actor not in(proposal.proposer_id,proposal.accepter_id) then raise exception 'CLUB_PROPOSAL_UNAVAILABLE'; end if;
 if (p_action in('accept','decline') and p_actor<>proposal.accepter_id) or(p_action='cancel' and p_actor<>proposal.proposer_id) then raise exception 'CLUB_ACCESS_REQUIRED'; end if;
 perform public.touchline_club_exchange_lock(p_season,proposal.proposer_id,proposal.accepter_id);
 select * into proposal from public.touchline_club_exchange_proposals where id=p_id for update;
 if proposal.status='accepted' and p_action='accept' then
  select r.receipt into receipt from public.touchline_club_exchange_receipts r where proposal_id=p_id;
  if receipt is null then raise exception 'CLUB_RECEIPT_REQUIRED'; end if;
  return jsonb_build_object('ok',true,'status','accepted','receipt',receipt,'replayed',true);
 end if;
 if proposal.status<>'pending' then
  if proposal.status=(case p_action when 'decline' then 'declined' when 'cancel' then 'cancelled' when 'expire' then 'expired' end) then return jsonb_build_object('ok',true,'status',proposal.status,'replayed',true);end if;
  raise exception 'CLUB_PROPOSAL_CLOSED';
 end if;
 if p_action='expire' and clock_timestamp()<proposal.expires_at then raise exception 'CLUB_PROPOSAL_NOT_EXPIRED'; end if;
 if p_action<>'accept' then
  update public.touchline_club_exchange_proposals set status=case p_action when 'decline' then 'declined' when 'cancel' then 'cancelled' else 'expired' end,resolved_at=clock_timestamp() where id=p_id;
  delete from public.touchline_club_player_reservations where proposal_id=p_id;
  return jsonb_build_object('ok',true,'status',case p_action when 'decline' then 'declined' when 'cancel' then 'cancelled' else 'expired' end,'replayed',false);
 end if;
 if clock_timestamp()>=proposal.expires_at then raise exception 'CLUB_PROPOSAL_EXPIRED'; end if;
 select * into a from public.touchline_club_collections where user_id=proposal.proposer_id and season_id=p_season;
 select * into b from public.touchline_club_collections where user_id=proposal.accepter_id and season_id=p_season;
 perform public.touchline_club_exchange_assert_owner(a.user_id,p_season,a.state);perform public.touchline_club_exchange_assert_owner(b.user_id,p_season,b.state);
 if a.state->>'plan' is distinct from proposal.terms->>'proposerPlan' or b.state->>'plan' is distinct from proposal.terms->>'accepterPlan' then raise exception 'CLUB_PLAN_CHANGED';end if;
 oa:=public.touchline_club_exchange_offer((proposal.terms->'outgoing'->>'playerId')::uuid,p_season);ob:=public.touchline_club_exchange_offer((proposal.terms->'incoming'->>'playerId')::uuid,p_season);
 if oa<>proposal.terms->'outgoing' or ob<>proposal.terms->'incoming' then raise exception 'CLUB_OFFER_CHANGED';end if;
 ca:=public.touchline_club_exchange_assert_player(a.user_id,p_season,a.state,(oa->>'playerId')::uuid);
 cb:=public.touchline_club_exchange_assert_player(b.user_id,p_season,b.state,(ob->>'playerId')::uuid);
 if ca<>proposal.terms->'proposerContract' or cb<>proposal.terms->'accepterContract' then raise exception 'CLUB_CONTRACT_CHANGED';end if;
 if (select count(*) from public.touchline_club_player_reservations where proposal_id=p_id and season_id=p_season and ((user_id=a.user_id and player_id=(oa->>'playerId')::uuid) or(user_id=b.user_id and player_id=(ob->>'playerId')::uuid)))<>2 then raise exception 'CLUB_RESERVATION_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements(a.state->'players') p where p->>'playerId'=ob->>'playerId') or exists(select 1 from jsonb_array_elements(b.state->'players') p where p->>'playerId'=oa->>'playerId') then raise exception 'CLUB_ALREADY_OWNED';end if;
 fee:=(proposal.terms->'quote'->>'feeTc')::numeric;bonus:=(proposal.terms->'quote'->>'bonusTc')::numeric;comp:=(proposal.terms->'quote'->>'compensationTc')::numeric;
 if fee<>bonus+(proposal.terms->'quote'->>'retiredTc')::numeric or bonus*2<>fee then raise exception 'CLUB_INVALID_RECEIPT';end if;
 bal_a:=(a.state->>'balanceEur')::numeric+comp-fee;bal_b:=(b.state->>'balanceEur')::numeric-comp+bonus;
 if least(bal_a,bal_b)<0 then raise exception 'CLUB_INSUFFICIENT_BALANCE';end if;
 if greatest(bal_a,bal_b)>9007199254740991 or greatest(a.revision,b.revision)>=9007199254740991 then raise exception 'CLUB_CREDITS_OVERFLOW';end if;
 select jsonb_agg(case when p->>'playerId'=oa->>'playerId' then jsonb_build_object('playerId',ob->>'playerId','clubId',ob->>'clubId','position',ob->>'position','primaryDetail',ob->>'primaryDetail','valueEur',ob->'valueTc','area',p->'area','slot',p->'slot') else p end order by ord) into ap from jsonb_array_elements(a.state->'players') with ordinality t(p,ord);
 select jsonb_agg(case when p->>'playerId'=ob->>'playerId' then jsonb_build_object('playerId',oa->>'playerId','clubId',oa->>'clubId','position',oa->>'position','primaryDetail',oa->>'primaryDetail','valueEur',oa->'valueTc','area',p->'area','slot',p->'slot') else p end order by ord) into bp from jsonb_array_elements(b.state->'players') with ordinality t(p,ord);
 nexta:=a.state||jsonb_build_object('players',ap,'balanceEur',bal_a,'revision',a.revision+1);nextb:=b.state||jsonb_build_object('players',bp,'balanceEur',bal_b,'revision',b.revision+1);
 perform public.touchline_club_exchange_assert_owner(a.user_id,p_season,nexta);
 perform public.touchline_club_exchange_assert_owner(b.user_id,p_season,nextb);
 stamp:=clock_timestamp();key:='exchange_'||p_id::text;
 receipt:=jsonb_build_object('tradeId',p_id,'seasonId',p_season,'occurredAt',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'proposer',proposal.terms->'proposer','accepter',proposal.terms->'accepter','outgoing',oa-array['clubId','position','primaryDetail'],'incoming',ob-array['clubId','position','primaryDetail'],
 'quote',proposal.terms->'quote','proposerBalanceAfterTc',bal_a,'accepterBalanceAfterTc',bal_b);
 update public.touchline_club_collections set state=nexta,revision=a.revision+1,updated_at=stamp where user_id=a.user_id and season_id=p_season;
 update public.touchline_club_collections set state=nextb,revision=b.revision+1,updated_at=stamp where user_id=b.user_id and season_id=p_season;
 insert into public.touchline_club_collection_operations(user_id,season_id,idempotency_key,command,revision) values(a.user_id,p_season,key,jsonb_build_object('action','exchange','proposalId',p_id),a.revision+1),(b.user_id,p_season,key,jsonb_build_object('action','exchange','proposalId',p_id),b.revision+1);
 insert into public.touchline_club_exchange_receipts values(p_id,p_season,a.user_id,b.user_id,receipt,nexta,nextb,stamp);
 update public.touchline_club_exchange_proposals set status='accepted',resolved_at=stamp where id=p_id;
 delete from public.touchline_club_player_reservations where proposal_id=p_id;
 delete from public.touchline_club_exchange_listings where season_id=p_season and ((user_id=a.user_id and player_id=(oa->>'playerId')::uuid) or(user_id=b.user_id and player_id=(ob->>'playerId')::uuid));
 return jsonb_build_object('ok',true,'status','accepted','receipt',receipt,'replayed',false);
end;$$;

-- One stable statement snapshot: wallet revision, immutable receipts, aggregate.
create function public.touchline_club_exchange_history(p_actor uuid,p_season uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('accountId',c.user_id,'seasonId',c.season_id,'collectionRevision',c.revision,'coverage','complete',
 'seasonNegotiationIncomeTc',coalesce((select sum((r.receipt->'quote'->>'bonusTc')::numeric) from public.touchline_club_exchange_receipts r where r.season_id=p_season and r.accepter_id=p_actor),0),
 'receipts',coalesce((select jsonb_agg(r.receipt order by r.created_at desc,r.proposal_id) from public.touchline_club_exchange_receipts r where r.season_id=p_season and p_actor in(r.proposer_id,r.accepter_id)),'[]'::jsonb))
 from public.touchline_club_collections c where c.user_id=p_actor and c.season_id=p_season;
$$;
-- Discovery exposes listed cards and the caller's proposals, never another wallet.
-- One statement snapshot; no reservation cleanup or other writes on a read.
create function public.touchline_club_exchange_discovery(p_actor uuid,p_season uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('version',1,'accountId',c.user_id,'seasonId',c.season_id,'collectionRevision',c.revision,
 'ownListedIds',coalesce((select jsonb_agg(l.player_id order by l.player_id) from public.touchline_club_exchange_listings l where l.user_id=p_actor and l.season_id=p_season),'[]'::jsonb),
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('playerId',r.player_id,'proposalId',r.proposal_id) order by r.player_id) from public.touchline_club_player_reservations r where r.user_id=p_actor and r.season_id=p_season),'[]'::jsonb),
 'listings',coalesce((select jsonb_agg(jsonb_build_object('owner',jsonb_build_object('accountId',l.user_id,'name',u.full_name),'collectionRevision',other.revision,
   'player',jsonb_build_object('playerId',f.id,'name',f.display_name,'clubId',f.current_club_id,'valueTc',m.market_value_eur,'primaryDetail',public.touchline_club_current_primary_detail(f.id),'position',public.touchline_club_primary_category(public.touchline_club_current_primary_detail(f.id)))) order by l.user_id,l.player_id)
  from public.touchline_club_exchange_listings l
  join public.touchline_club_collections other on other.user_id=l.user_id and other.season_id=l.season_id
  join public.users u on u.id=l.user_id
  join public.football_players f on f.id=l.player_id
  join public.football_seasons season on season.id=l.season_id
  join lateral (select pub.* from public.touchline_card_publications pub where pub.player_id=l.player_id
    and pub.competition_id=season.competition_id and pub.publication_status='published'
    and pub.effective_season ~ '^[0-9]{4}[-/]([0-9]{2}|[0-9]{4})$'
    and season.name ~ '^[0-9]{4}[-/]([0-9]{2}|[0-9]{4})$'
    and left(pub.effective_season,4)=left(season.name,4) and right(pub.effective_season,2)=right(season.name,2)
    order by pub.published_at desc nulls last,pub.id desc limit 1) publication on true
  join public.football_player_market_values m on m.id=publication.market_value_id and m.player_id=f.id and m.status='verified' and m.confidence='verified'
  where l.season_id=p_season and other.state->>'plan' in('standard','master','vip')
   and nullif(trim(u.full_name),'') is not null and nullif(trim(f.display_name),'') is not null
   and m.market_value_eur>0 and m.market_value_eur<=9007199254740991
   and jsonb_array_length(other.state->'players')=35
   and exists(select 1 from jsonb_array_elements(other.state->'players') p where p->>'playerId'=l.player_id::text and p->>'area'='outside')
   and exists(select 1 from public.touchline_fantasy_entitlements e where e.user_id=l.user_id and e.status='active' and e.entitlement_key='fantasy_access' and e.plan_key=other.state->>'plan'
    and (e.current_period_start is null or e.current_period_start<=now()) and (e.current_period_end is null or e.current_period_end>now()))
   and not exists(select 1 from public.touchline_club_player_reservations r where r.user_id=l.user_id and r.season_id=l.season_id and r.player_id=l.player_id)
 ),'[]'::jsonb),
 'proposals',coalesce((select jsonb_agg(jsonb_build_object('proposalId',p.id,'status',p.status,'expiresAt',to_char(p.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'proposer',p.terms->'proposer','accepter',p.terms->'accepter','outgoing',p.terms->'outgoing','incoming',p.terms->'incoming','quote',p.terms->'quote') order by p.created_at desc,p.id)
  from public.touchline_club_exchange_proposals p where p.season_id=p_season and p_actor in(p.proposer_id,p.accepter_id)),'[]'::jsonb))
 from public.touchline_club_collections c where c.user_id=p_actor and c.season_id=p_season;
$$;
revoke all on function public.touchline_club_exchange_discovery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.touchline_club_exchange_discovery(uuid,uuid) to service_role;
revoke all on function public.touchline_club_exchange_offer(uuid,uuid),public.touchline_club_exchange_lock(uuid,uuid,uuid),public.touchline_club_exchange_assert_owner(uuid,uuid,jsonb),public.touchline_club_exchange_assert_player(uuid,uuid,jsonb,uuid),public.touchline_club_exchange_listing(uuid,uuid,uuid,boolean),public.touchline_club_exchange_propose(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint),public.touchline_club_exchange_resolve(uuid,uuid,uuid,text),public.touchline_club_exchange_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.touchline_club_exchange_offer(uuid,uuid),public.touchline_club_exchange_lock(uuid,uuid,uuid),public.touchline_club_exchange_assert_owner(uuid,uuid,jsonb),public.touchline_club_exchange_assert_player(uuid,uuid,jsonb,uuid),public.touchline_club_exchange_listing(uuid,uuid,uuid,boolean),public.touchline_club_exchange_propose(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint),public.touchline_club_exchange_resolve(uuid,uuid,uuid,text),public.touchline_club_exchange_history(uuid,uuid) to service_role;
commit;
