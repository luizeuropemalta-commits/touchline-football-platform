-- One SQL statement/snapshot. No sync, preparation, reconciliation or consent.
create function public.touchline_fantasy_read_lineup_reminder(p_user_id uuid,p_gameweek_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$
with execution_clock as materialized (
  select clock_timestamp() as as_of
), window_projection as materialized (
  select p.* from execution_clock c
  cross join lateral public.touchline_fantasy_market_window_projection(c.as_of) p
), gameweek as materialized (
  select g.* from public.touchline_fantasy_gameweeks g where g.id=p_gameweek_id
), scoped as materialized (
  select g.id,g.competition_id,g.season_id,g.state as stored_state,p.state,p.locks_at,
    p.market_opens_at,p.first_fixture_at
  from gameweek g join public.football_rounds r on r.id=g.round_id
    and r.competition_id=g.competition_id and r.season_id=g.season_id
  join window_projection p on p.round_id=g.round_id and p.competition_id=g.competition_id and p.season_id=g.season_id
  where (select count(*) from public.touchline_fantasy_configs c where c.competition_id=g.competition_id
    and c.season_id=g.season_id and c.status='active')=1
  -- Predecessors also influence the market window. Refuse inconsistent source
  -- scope across the season; never silently omit a fixture and open early.
  and not exists (
    select 1 from public.football_fixtures f
    join public.football_rounds source_round on source_round.id=f.round_id
    where source_round.season_id=g.season_id
      and (f.season_id is distinct from source_round.season_id
        or f.competition_id is distinct from source_round.competition_id)
  )
), user_record as materialized (
  select u.* from public.touchline_fantasy_user_gameweeks u where u.user_id=p_user_id and u.gameweek_id=p_gameweek_id
), chosen_formation as (
  select coalesce((select formation_code from user_record limit 1),'4-3-3') as code
), published as materialized (
  select f.* from public.touchline_formation_geometry_versions f
  join chosen_formation c on c.code=f.formation_code where f.status='published'
), geometry as materialized (
  select f.formation_code as code,
    (select jsonb_agg(s.value->>'id' order by s.ordinal)
     from jsonb_array_elements(case when jsonb_typeof(f.geometry->'slots')='array' then f.geometry->'slots' else '[]'::jsonb end)
       with ordinality s(value,ordinal)) as slots,
    public.touchline_formation_geometry_payload_is_valid(f.formation_code,f.geometry,f.validation_report) as valid
  from published f
), selections as materialized (
  select s.player_id,s.slot_id,s.slot_index from public.touchline_fantasy_user_gameweek_selections s
  join user_record u on u.id=s.user_gameweek_id
), evidence as (
  select (floor(extract(epoch from c.as_of)*1000))::bigint as checked_ms,
    (select competition_id from gameweek limit 1) as competition_id,
    (select season_id from gameweek limit 1) as season_id,
    exists(select 1 from public.users u join auth.users a on a.id=u.id where u.id=p_user_id)
    and (select count(*) from scoped)=1
    and (select count(*) from user_record)<=1
    and (select count(*) from published)=1
    and coalesce((select valid from geometry limit 1),false)
    and (select count(*) from selections)<=11
    and (select count(*)=count(distinct player_id) and count(*)=count(distinct slot_id) from selections)
    and not exists(select 1 from selections s where s.player_id is null or s.slot_id is null
      or not coalesce((select slots ? s.slot_id from geometry limit 1),false))
    and exists(select 1 from scoped s where s.locks_at is not null and s.first_fixture_at is not null)
    as valid
  from execution_clock c
)
select jsonb_build_object('schemaVersion',1,'userId',p_user_id,'gameweekId',p_gameweek_id,
 'competitionId',e.competition_id,'seasonId',e.season_id,'checkedAtMs',e.checked_ms,
 'read',case when e.valid then jsonb_build_object(
   'status','complete','checkedAtMs',e.checked_ms,
   'marketEditable',(select stored_state<>'SETTLED' and state='MARKET_OPEN' from scoped),
   'effectiveDeadlineMs',(select floor(extract(epoch from locks_at)*1000)::bigint from scoped),
   'formation',(select jsonb_build_object('published',true,'code',code,'slotIds',slots) from geometry),
   'userGameweek',(select jsonb_build_object('state',state,'formationCode',formation_code,'selectedCoachId',selected_coach_id) from user_record),
   'selections',(select coalesce(jsonb_agg(jsonb_build_object('playerId',player_id,'slotId',slot_id) order by slot_index,slot_id),'[]'::jsonb) from selections)
 ) else jsonb_build_object('status','unavailable') end)
from evidence e
$$;
revoke all on function public.touchline_fantasy_read_lineup_reminder(uuid,uuid) from public,anon,authenticated;
grant execute on function public.touchline_fantasy_read_lineup_reminder(uuid,uuid) to service_role;
