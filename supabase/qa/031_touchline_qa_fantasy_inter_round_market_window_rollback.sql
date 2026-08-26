-- Emergency QA-only rollback for 20260826173229. The additive finalized_at
-- column is intentionally retained; this restores only the previous opening
-- state machine and removes the finalization trigger.

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

drop trigger if exists touchline_stamp_fixture_finalized_at
  on public.football_fixtures;
drop function if exists public.touchline_stamp_fixture_finalized_at();

create or replace function public.touchline_fantasy_sync_gameweeks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  insert into public.touchline_fantasy_gameweeks (
    competition_id, season_id, round_id, gameweek_number, state,
    market_opens_at, locks_at, first_fixture_at, last_fixture_at
  )
  select
    round.competition_id,
    round.season_id,
    round.id,
    case when round.name ~ '^[0-9]+$' then round.name::integer else row_number() over (partition by round.season_id order by min(fixture.starts_at))::integer end,
    case
      when clock_timestamp() < min(fixture.starts_at) - interval '7 days' then 'UPCOMING'
      when clock_timestamp() < min(fixture.starts_at) - make_interval(mins => config.lock_offset_minutes) then 'MARKET_OPEN'
      when bool_or(public.touchline_fantasy_fixture_is_live(fixture.status)) then 'LIVE'
      when bool_and(public.touchline_fantasy_fixture_is_final(fixture.status)) then 'FINAL'
      else 'LOCKED'
    end,
    min(fixture.starts_at) - interval '7 days',
    min(fixture.starts_at) - make_interval(mins => config.lock_offset_minutes),
    min(fixture.starts_at),
    max(fixture.starts_at)
  from public.football_rounds round
  join public.football_fixtures fixture on fixture.round_id = round.id
  join public.touchline_fantasy_configs config
    on config.competition_id = round.competition_id
   and config.season_id = round.season_id
   and config.status = 'active'
  where fixture.starts_at is not null
  group by round.id, round.competition_id, round.season_id, round.name, config.lock_offset_minutes
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
