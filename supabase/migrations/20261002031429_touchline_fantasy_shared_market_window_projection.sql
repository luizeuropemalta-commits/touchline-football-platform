-- Owner-only pure projection; trusted callers supply a newly captured database
-- wall clock inside their SQL snapshot. Consumers must revalidate before send.
create function public.touchline_fantasy_market_window_projection(p_as_of timestamptz)
returns table (
  competition_id uuid, season_id uuid, round_id uuid, gameweek_number integer,
  state text, market_opens_at timestamptz, locks_at timestamptz,
  first_fixture_at timestamptz, last_fixture_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  with round_facts as (
    select round.id as round_id, round.competition_id, round.season_id,
      round.name as round_name,
      case when round.name ~ '[0-9]+' then substring(round.name from '([0-9]+)\D*$')::integer end as round_sort_number,
      min(fixture.starts_at) as first_fixture_at, max(fixture.starts_at) as last_fixture_at,
      bool_or(public.touchline_fantasy_fixture_is_live(fixture.status)) as any_live,
      bool_or(public.touchline_fantasy_fixture_is_final(fixture.status)) as any_final,
      count(fixture.id)>0 and bool_and(public.touchline_fantasy_fixture_is_final(fixture.status)
        and fixture.finalized_at is not null) as all_final,
      max(fixture.finalized_at) filter (where public.touchline_fantasy_fixture_is_final(fixture.status)) as round_completed_at
    from public.football_rounds round
    left join public.football_fixtures fixture on fixture.round_id=round.id
    join public.touchline_fantasy_configs config on config.competition_id=round.competition_id
      and config.season_id=round.season_id and config.status='active'
    group by round.id,round.competition_id,round.season_id,round.name
  ), ordered_rounds as (
    select round_facts.*,
      bool_or(round_sort_number is null and first_fixture_at is null) over (partition by season_id) as has_ambiguous_unscheduled_round,
      row_number() over (partition by season_id order by round_sort_number nulls last,first_fixture_at nulls last,round_id)::integer as round_sequence,
      lag(all_final) over (partition by season_id order by round_sort_number nulls last,first_fixture_at nulls last,round_id) as previous_round_all_final,
      lag(round_completed_at) over (partition by season_id order by round_sort_number nulls last,first_fixture_at nulls last,round_id) as previous_round_completed_at
    from round_facts
  ), timing as (
    select ordered_rounds.*,first_fixture_at as locks_at from ordered_rounds
  ), prepared as (
    select timing.*,
      case when has_ambiguous_unscheduled_round then false
        when round_sequence=1 and (round_sort_number is null or round_sort_number=1) then true
        when previous_round_all_final and previous_round_completed_at is not null and previous_round_completed_at<locks_at then true
        else false end as market_window_available,
      case when has_ambiguous_unscheduled_round then locks_at-interval '1 microsecond'
        when round_sequence=1 and (round_sort_number is null or round_sort_number=1) then first_fixture_at-interval '7 days'
        when previous_round_all_final and previous_round_completed_at is not null and previous_round_completed_at<locks_at then previous_round_completed_at
        else locks_at-interval '1 microsecond' end as market_opens_at
    from timing
  )
  select competition_id,season_id,round_id,coalesce(round_sort_number,round_sequence),
    case when any_live then 'LIVE' when all_final then 'FINAL' when any_final then 'LOCKED'
      when round_sequence=1 and not market_window_available and p_as_of<locks_at then 'UPCOMING'
      when round_sequence>1 and not market_window_available and p_as_of<locks_at then 'UPCOMING'
      when p_as_of<market_opens_at then 'UPCOMING'
      when market_window_available and p_as_of<locks_at then 'MARKET_OPEN'
      else 'LOCKED' end,
    market_opens_at,locks_at,first_fixture_at,last_fixture_at
  from prepared
$$;

revoke all on function public.touchline_fantasy_market_window_projection(timestamptz) from public,anon,authenticated,service_role;

create or replace function public.touchline_fantasy_sync_gameweeks()
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  with execution_clock as materialized (
    select clock_timestamp() as as_of
  ), projected as materialized (
    select projection.* from execution_clock
    cross join lateral public.touchline_fantasy_market_window_projection(execution_clock.as_of) projection
  ), closed_unscheduled_gameweeks as (
    update public.touchline_fantasy_gameweeks gameweek
    set state=case when gameweek.state='SETTLED' then 'SETTLED' else 'LOCKED' end
    where exists (select 1 from projected p where p.round_id=gameweek.round_id and p.first_fixture_at is null)
    returning gameweek.id
  )
  insert into public.touchline_fantasy_gameweeks
    (competition_id,season_id,round_id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at)
  select competition_id,season_id,round_id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at
  from projected where first_fixture_at is not null
  on conflict (round_id) do update
    set first_fixture_at=excluded.first_fixture_at,last_fixture_at=excluded.last_fixture_at,
      locks_at=excluded.locks_at,market_opens_at=excluded.market_opens_at,
      state=case when public.touchline_fantasy_gameweeks.state='SETTLED' then 'SETTLED' else excluded.state end;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.touchline_fantasy_sync_gameweeks() from public,anon,authenticated;
grant execute on function public.touchline_fantasy_sync_gameweeks() to service_role;
