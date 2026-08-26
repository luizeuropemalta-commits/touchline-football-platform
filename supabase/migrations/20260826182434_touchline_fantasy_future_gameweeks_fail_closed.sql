-- Materialize every scheduled Gameweek while keeping rounds after an
-- unfinished predecessor strictly fail-closed. This replaces the same
-- canonical synchronizer introduced by the preceding migration; it does not
-- create a parallel market-window system.

create or replace function public.touchline_fantasy_sync_gameweeks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  with round_facts as (
    select
      round.id as round_id,
      round.competition_id,
      round.season_id,
      round.name as round_name,
      config.lock_offset_minutes,
      min(fixture.starts_at) as first_fixture_at,
      max(fixture.starts_at) as last_fixture_at,
      bool_or(public.touchline_fantasy_fixture_is_live(fixture.status)) as any_live,
      bool_and(public.touchline_fantasy_fixture_is_final(fixture.status)) as all_final,
      max(fixture.finalized_at) as round_completed_at
    from public.football_rounds round
    join public.football_fixtures fixture on fixture.round_id = round.id
    join public.touchline_fantasy_configs config
      on config.competition_id = round.competition_id
     and config.season_id = round.season_id
     and config.status = 'active'
    where fixture.starts_at is not null
    group by
      round.id,
      round.competition_id,
      round.season_id,
      round.name,
      config.lock_offset_minutes
  ), ordered_rounds as (
    select
      round_facts.*,
      row_number() over (
        partition by season_id
        order by first_fixture_at, round_id
      )::integer as round_sequence,
      lag(all_final) over (
        partition by season_id
        order by first_fixture_at, round_id
      ) as previous_round_all_final,
      lag(round_completed_at) over (
        partition by season_id
        order by first_fixture_at, round_id
      ) as previous_round_completed_at
    from round_facts
  ), timing as (
    select
      ordered_rounds.*,
      first_fixture_at - make_interval(mins => lock_offset_minutes) as locks_at
    from ordered_rounds
  ), prepared as (
    select
      timing.*,
      case
        when round_sequence = 1 then first_fixture_at - interval '7 days'
        when previous_round_all_final then previous_round_completed_at + interval '5 minutes'
        else locks_at - interval '1 microsecond'
      end as market_opens_at
    from timing
  ), synchronized as (
    select
      competition_id,
      season_id,
      round_id,
      case
        when round_name ~ '^[0-9]+$' then round_name::integer
        else round_sequence
      end as gameweek_number,
      case
        when round_sequence > 1 and not coalesce(previous_round_all_final, false) then 'UPCOMING'
        when clock_timestamp() < market_opens_at then 'UPCOMING'
        when clock_timestamp() < locks_at then 'MARKET_OPEN'
        when any_live then 'LIVE'
        when all_final then 'FINAL'
        else 'LOCKED'
      end as state,
      market_opens_at,
      locks_at,
      first_fixture_at,
      last_fixture_at
    from prepared
  )
  insert into public.touchline_fantasy_gameweeks (
    competition_id,
    season_id,
    round_id,
    gameweek_number,
    state,
    market_opens_at,
    locks_at,
    first_fixture_at,
    last_fixture_at
  )
  select
    competition_id,
    season_id,
    round_id,
    gameweek_number,
    state,
    market_opens_at,
    locks_at,
    first_fixture_at,
    last_fixture_at
  from synchronized
  on conflict (round_id) do update
    set first_fixture_at = excluded.first_fixture_at,
        last_fixture_at = excluded.last_fixture_at,
        locks_at = excluded.locks_at,
        market_opens_at = excluded.market_opens_at,
        state = case
          when public.touchline_fantasy_gameweeks.state = 'SETTLED' then 'SETTLED'
          else excluded.state
        end;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.touchline_fantasy_sync_gameweeks()
  from public, anon, authenticated;
grant execute on function public.touchline_fantasy_sync_gameweeks()
  to service_role;

select public.touchline_fantasy_sync_gameweeks();
