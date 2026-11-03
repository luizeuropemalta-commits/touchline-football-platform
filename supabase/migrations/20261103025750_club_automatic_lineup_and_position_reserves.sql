-- Automatic ClubOwner XI, frozen at the deadline. Forward-only: historic rounds
-- and the legacy non-collection journey retain their existing scoring contract.
begin;
set local lock_timeout='5s';

create table public.touchline_club_automatic_lineup_policy (
  singleton boolean primary key default true check(singleton),
  starts_at timestamptz not null default clock_timestamp()
);
insert into public.touchline_club_automatic_lineup_policy(singleton) values(true);
alter table public.touchline_club_automatic_lineup_policy enable row level security;
revoke all on public.touchline_club_automatic_lineup_policy from public,anon,authenticated;
grant select on public.touchline_club_automatic_lineup_policy to service_role;

alter table public.touchline_fantasy_user_gameweeks
  add column collection_squad_snapshot jsonb,
  add column automatic_lineup_version integer check(automatic_lineup_version=1);

create function public.touchline_club_automatic_snapshot_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.state in ('LOCKED','FINAL') and row(new.collection_squad_snapshot,new.automatic_lineup_version)
    is distinct from row(old.collection_squad_snapshot,old.automatic_lineup_version) then
    raise exception 'TL_FANTASY_LOCKED_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger touchline_club_automatic_snapshot_immutable before update
on public.touchline_fantasy_user_gameweeks for each row execute function public.touchline_club_automatic_snapshot_immutable();

-- Private deadline-only copy of the installed complete validator. Client save
-- retains its wall-clock guard. Neither role can invoke this internal function.
do $migration$
declare
  source text := pg_get_functiondef('public.touchline_club_project_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure);
  marker text := '  if v_gameweek.state <> ''MARKET_OPEN'' or clock_timestamp() >= v_gameweek.locks_at then raise exception ''TL_FANTASY_GAMEWEEK_LOCKED''; end if;';
begin
  if strpos(source,marker)=0 then raise exception 'CLUB_AUTO_PROJECT_PREDECESSOR'; end if;
  source := replace(source,'FUNCTION public.touchline_club_project_lineup(', 'FUNCTION public.touchline_club_project_deadline_lineup(');
  -- The caller owns the round lock first. Reacquiring the manual-save mutex
  -- after it would invert manual save's user/round -> round lock order.
  source := replace(source,'  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || '':'' || p_gameweek_id::text, 0));',
    '  -- Deadline caller already owns the round and collection locks.');
  source := replace(source,marker,$guard$
  if v_gameweek.state='SETTLED' or
    (clock_timestamp()<v_gameweek.locks_at and not exists(select 1 from public.football_fixtures f
      where f.round_id=v_gameweek.round_id and (public.touchline_fantasy_fixture_is_live(f.status) or public.touchline_fantasy_fixture_is_final(f.status))))
    or not exists(select 1 from public.touchline_club_automatic_lineup_policy p where v_gameweek.locks_at>p.starts_at)
    or exists(select 1 from public.touchline_fantasy_user_gameweeks ug
      where ug.user_id=p_user_id and ug.gameweek_id=p_gameweek_id and ug.state in ('LOCKED','FINAL'))
  then raise exception 'CLUB_AUTO_ROUND_INELIGIBLE'; end if;
$guard$);
  marker := '  if not found then raise exception ''CLUB_COLLECTION_REQUIRED''; end if;';
  if strpos(source,marker)=0 then raise exception 'CLUB_AUTO_COLLECTION_PREDECESSOR'; end if;
  source := replace(source,marker,marker || $guard$
  if v_collection.updated_at>least(v_gameweek.locks_at,clock_timestamp()) then
    raise exception 'CLUB_AUTO_COLLECTION_AFTER_DEADLINE'; end if;
$guard$);
  execute source;
end;
$migration$;
revoke all on function public.touchline_club_project_deadline_lineup(uuid,uuid,text,text,jsonb,text,text) from public,anon,authenticated,service_role;

create function public.touchline_club_auto_confirm_round(p_gameweek_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  g public.touchline_fantasy_gameweeks%rowtype;
  c public.touchline_club_collections%rowtype;
  geometry jsonb;
  selections jsonb;
  receipt jsonb;
  error_code text;
begin
  select * into strict g from public.touchline_fantasy_gameweeks where id=p_gameweek_id for update;
  if g.state='SETTLED' or not exists(select 1 from public.touchline_club_automatic_lineup_policy p where g.locks_at>p.starts_at) then return; end if;
  for c in select * from public.touchline_club_collections collection
    where collection.season_id=g.season_id and not exists(select 1 from public.touchline_fantasy_user_gameweeks ug
      where ug.user_id=collection.user_id and ug.gameweek_id=g.id and ug.state in ('LOCKED','FINAL'))
    order by collection.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-subscription:' || c.user_id::text,0));
    select * into c from public.touchline_club_collections where user_id=c.user_id and season_id=g.season_id for update;
    begin
      select v.geometry into geometry from public.touchline_formation_geometry_versions v
        where v.formation_code=c.state->>'formationCode' and v.status='published' order by v.geometry_version desc limit 1;
      select jsonb_agg(jsonb_build_object('playerId',p->>'playerId','slotId',geometry->'slots'->((p->>'slot')::int)->>'id') order by (p->>'slot')::int)
        into selections from jsonb_array_elements(c.state->'players') p where p->>'area'='starters';
      if geometry is null or coalesce(jsonb_array_length(selections),0)<>11 then raise exception 'CLUB_AUTO_INCOMPLETE_XI'; end if;
      receipt:=public.touchline_club_project_deadline_lineup(c.user_id,g.id,c.state->'coach'->>'id',c.state->>'formationCode',
        selections,'confirm','auto-xi:'||g.id::text||':'||c.user_id::text);
      update public.touchline_fantasy_user_gameweeks set collection_squad_snapshot=(
        select jsonb_agg(p || jsonb_build_object(
          'clubId',(select f.current_club_id from public.football_players f where f.id=(p->>'playerId')::uuid),
          'primaryDetail',public.touchline_club_owned_primary_detail(p),
          'eligibleSlotIds',(select coalesce(jsonb_agg(s->>'id'),'[]'::jsonb) from jsonb_array_elements(geometry->'slots') s
            where public.touchline_club_owned_primary_detail(p)=any(public.touchline_club_slot_primary_details(c.state->>'formationCode',s->>'id')))))
        from jsonb_array_elements(c.state->'players') p),automatic_lineup_version=1
        where id=(receipt->>'userGameweekId')::uuid and state='CONFIRMED';
    exception when raise_exception then
      error_code:=sqlerrm;
      -- A genuinely incomplete or no-longer-eligible squad cannot be invented.
      -- Unknown errors must abort the transaction and be retried by the worker.
      if error_code !~ '^(CLUB_PRIMARY_DETAIL_MISSING|CLUB_PRIMARY_DETAIL_UNSUPPORTED|CLUB_PRIMARY_DETAIL_CONFLICT|CLUB_PRIMARY_POSITION_CONFLICT|CLUB_POSITION_COMPLETION_IMPOSSIBLE|CLUB_FORMATION_INVALID|CLUB_AUTO_INCOMPLETE_XI|CLUB_AUTO_COLLECTION_AFTER_DEADLINE|CLUB_LINEUP_OWNERSHIP_MISMATCH|CLUB_PLAN_MISMATCH|CLUB_PRIMARY_POSITION_UNCONFIRMED|CLUB_SLOT_POSITION_INVALID|CLUB_COLLECTION_POSITION_INVALID|TL_FANTASY_(ENTITLEMENT_REQUIRED|COACH_INVALID|PLAN_INVALID|FORMATION_NOT_PUBLISHED|SELECTION_INELIGIBLE|BUDGET_EXCEEDED|XI_REQUIRES_11))$' then raise; end if;
      insert into public.touchline_fantasy_audit_events(user_id,gameweek_id,event_type,idempotency_key,metadata)
        values(c.user_id,g.id,'XI_REJECTED','auto-xi-rejected:'||g.id::text||':'||c.user_id::text,jsonb_build_object('reason',error_code,'automatic',true))
        on conflict(idempotency_key) where idempotency_key is not null do nothing;
      -- A stale manually confirmed XI must never lock after failed validation.
      update public.touchline_fantasy_user_gameweeks set state='DRAFT',confirmed_at=null
        where user_id=c.user_id and gameweek_id=g.id and state='CONFIRMED';
    end;
  end loop;
end;
$$;
revoke all on function public.touchline_club_auto_confirm_round(uuid) from public,anon,authenticated,service_role;

do $migration$
declare
  source text := pg_get_functiondef('public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure);
  marker text := '  v_effective_locks_at := least(v_gameweek.locks_at, clock_timestamp());';
begin
  if strpos(source,marker)=0 then raise exception 'CLUB_AUTO_LOCK_PREDECESSOR'; end if;
  execute replace(source,marker,'  perform public.touchline_club_auto_confirm_round(p_gameweek_id);' || E'\n' || marker);
end;
$migration$;

-- If the worker was delayed, freeze all due rounds BEFORE any new-market
-- ownership mutation. This uses the same round -> subscription -> collection order.
create or replace function public.touchline_club_lock_open_round(p_season_id uuid)
returns void language plpgsql volatile security definer set search_path='' set lock_timeout='5s' as $$
declare due uuid;
begin
  for due in select g.id from public.touchline_fantasy_gameweeks g
    where g.season_id=p_season_id and g.state<>'SETTLED'
      and g.locks_at<=clock_timestamp()
      and exists(select 1 from public.touchline_club_automatic_lineup_policy p where g.locks_at>p.starts_at)
    order by g.gameweek_number
  loop perform public.touchline_fantasy_lock_gameweek(due); end loop;
  perform g.id from public.touchline_fantasy_gameweeks g
    join public.touchline_fantasy_market_window_projection(clock_timestamp()) projected on projected.round_id=g.round_id
    where g.season_id=p_season_id and projected.state='MARKET_OPEN'
    order by g.gameweek_number for update of g;
end;
$$;

-- Original locked XI remains immutable. Effective players are an auditable
-- scoring projection; corrected final football data can recompute this projection.
create table public.touchline_club_effective_selections (
  user_gameweek_id uuid not null references public.touchline_fantasy_user_gameweeks(id) on delete cascade,
  slot_id text not null,
  source_player_id uuid not null references public.football_players(id),
  player_id uuid not null references public.football_players(id),
  source_area text not null check(source_area in ('starters','reserves','outside')),
  primary key(user_gameweek_id,slot_id),
  unique(user_gameweek_id,player_id)
);
alter table public.touchline_club_effective_selections enable row level security;
revoke all on public.touchline_club_effective_selections from public,anon,authenticated;
grant select,insert,update,delete on public.touchline_club_effective_selections to service_role;

create function public.touchline_club_resolve_effective_xi(p_user_gameweek_id uuid)
returns table(slot_id text,source_player_id uuid,player_id uuid,source_area text)
language plpgsql stable security definer set search_path='' as $$
declare
  ug public.touchline_fantasy_user_gameweeks%rowtype;
  locked public.touchline_fantasy_locked_selections%rowtype;
  starter jsonb;
  candidate jsonb;
  picked jsonb;
  used uuid[] := array[]::uuid[];
  final_round boolean;
begin
  select * into ug from public.touchline_fantasy_user_gameweeks where id=p_user_gameweek_id;
  select coalesce(bool_and(public.touchline_fantasy_fixture_is_final(f.status)),false) into final_round
    from public.football_fixtures f join public.touchline_fantasy_gameweeks g on g.round_id=f.round_id where g.id=ug.gameweek_id;
  for locked in select * from public.touchline_fantasy_locked_selections s where s.user_gameweek_id=ug.id order by s.slot_index,s.slot_id loop
    picked:=null;
    select p into starter from jsonb_array_elements(ug.collection_squad_snapshot) p where p->>'playerId'=locked.player_id::text;
    if final_round and ug.automatic_lineup_version=1 and starter is not null
      and not exists(select 1 from public.touchline_fantasy_player_fixture_scores score
        where score.gameweek_id=ug.gameweek_id and score.player_id=locked.player_id and score.appearance_status not in ('absent','unused')) then
      for candidate in select p from jsonb_array_elements(ug.collection_squad_snapshot) p
        where p->>'area' in ('reserves','outside') and p->>'position'=starter->>'position'
          and not ((p->>'playerId')::uuid=any(used))
          and (p->'eligibleSlotIds') ? locked.slot_id
        order by case p->>'area' when 'reserves' then 0 else 1 end,(p->>'slot')::int
      loop
        -- Any actual appearance counts, including a zero or missing rating.
        if exists(select 1 from public.touchline_fantasy_player_fixture_scores score
          where score.gameweek_id=ug.gameweek_id and score.player_id=(candidate->>'playerId')::uuid
            and score.appearance_status in ('started','substitute')) then picked:=candidate; exit; end if;
      end loop;
    end if;
    slot_id:=locked.slot_id; source_player_id:=locked.player_id;
    player_id:=coalesce((picked->>'playerId')::uuid,locked.player_id);
    source_area:=coalesce(picked->>'area','starters');
    used:=array_append(used,player_id);
    return next;
  end loop;
end;
$$;
revoke all on function public.touchline_club_resolve_effective_xi(uuid) from public,anon,authenticated,service_role;

do $migration$
declare
  source text:=pg_get_functiondef('public.touchline_fantasy_reconcile_gameweek(uuid)'::regprocedure);
  marker text:='      union
      select stats.football_player_id, stats.fixture_id';
  anchor text:='  insert into public.touchline_fantasy_user_gameweek_scores (';
  score_join text:='  left join public.touchline_fantasy_player_fixture_scores score
    on score.player_id = locked.player_id and score.fixture_id = fixture.id';
begin
  if strpos(source,marker)=0 or strpos(source,anchor)=0 or strpos(source,score_join)=0 then raise exception 'CLUB_AUTO_SCORING_PREDECESSOR'; end if;
  source:=replace(source,marker,$coverage$
      union
      select (p->>'playerId')::uuid, fixture.id
      from public.touchline_fantasy_user_gameweeks ug
      cross join lateral jsonb_array_elements(ug.collection_squad_snapshot) p
      join public.football_fixtures fixture on fixture.round_id=v_gameweek.round_id
        and (p->>'clubId')::uuid in (fixture.home_club_id,fixture.away_club_id)
      where ug.gameweek_id=p_gameweek_id and ug.automatic_lineup_version=1 and v_all_final
$coverage$ || marker);
  source:=replace(source,anchor,$projection$
  -- Rebuild atomically with the sporting score. This never mutates the saved XI.
  delete from public.touchline_club_effective_selections e using public.touchline_fantasy_user_gameweeks ug
    where ug.id=e.user_gameweek_id and ug.gameweek_id=p_gameweek_id;
  insert into public.touchline_club_effective_selections(user_gameweek_id,slot_id,source_player_id,player_id,source_area)
    select ug.id,e.slot_id,e.source_player_id,e.player_id,e.source_area
    from public.touchline_fantasy_user_gameweeks ug cross join lateral public.touchline_club_resolve_effective_xi(ug.id) e
    where ug.gameweek_id=p_gameweek_id and ug.automatic_lineup_version=1;
$projection$ || anchor);
  source:=replace(source,score_join,$join$
  left join public.touchline_club_effective_selections effective
    on effective.user_gameweek_id=locked.user_gameweek_id and effective.slot_id=locked.slot_id
  left join public.touchline_fantasy_player_fixture_scores score
    on score.player_id = coalesce(effective.player_id,locked.player_id) and score.fixture_id = fixture.id$join$);
  source:=replace(source,'locked.player_id::text || '':'' || fixture.id::text',
    'coalesce(effective.player_id,locked.player_id)::text || '':'' || fixture.id::text');
  execute source;
end;
$migration$;
commit;
