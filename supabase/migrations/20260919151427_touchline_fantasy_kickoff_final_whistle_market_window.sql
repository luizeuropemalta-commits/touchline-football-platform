-- The Markt closes at the first fixture kickoff and opens a subsequent
-- Gameweek only when every fixture in the preceding round has a persisted
-- provider-final observation. No client clock is an authority for this rule.
--
-- `finalized_at` is the immutable first TouchLine observation of the provider
-- final status. It is intentionally the opening fact here: this schema has no
-- independently verified physical-whistle timestamp. Unknown, postponed,
-- cancelled, abandoned or otherwise non-final fixture statuses remain closed.
--
-- This is a forward-only, one-time migration. The migration runner records it;
-- do not execute its function-rewrite DO block manually a second time. The
-- resulting touchline_fantasy_sync_gameweeks() function itself is idempotent.

begin;
set local lock_timeout = '5s';

-- The original anonymous check required the old "before kickoff" offset.
-- Find only that exact legacy interval check so deployments with generated
-- constraint names remain forward-compatible.
do $migration$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.touchline_fantasy_gameweeks'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) like '%market_opens_at < locks_at%'
      and pg_get_constraintdef(constraint_row.oid) like '%locks_at < first_fixture_at%'
  loop
    execute format(
      'alter table public.touchline_fantasy_gameweeks drop constraint %I',
      v_constraint_name
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.touchline_fantasy_gameweeks'::regclass
      and conname = 'touchline_fantasy_gameweeks_market_interval_check'
  ) then
    alter table public.touchline_fantasy_gameweeks
      add constraint touchline_fantasy_gameweeks_market_interval_check
      check (
        market_opens_at < locks_at
        and locks_at <= first_fixture_at
        and first_fixture_at <= last_fixture_at
      );
  end if;
end
$migration$;

comment on column public.touchline_fantasy_gameweeks.locks_at is
  'Canonical Markt close instant: exactly the first fixture kickoff for the Gameweek.';

comment on column public.touchline_fantasy_gameweeks.market_opens_at is
  'Canonical Markt opening: first persisted provider-final observation of every preceding-round fixture; no opening for incomplete rounds.';

comment on column public.touchline_fantasy_configs.lock_offset_minutes is
  'Deprecated compatibility field. Gameweek Markt locks close exactly at first_fixture_at.';

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
      case
        when round.name ~ '[0-9]+' then substring(round.name from '([0-9]+)\D*$')::integer
      end as round_sort_number,
      min(fixture.starts_at) as first_fixture_at,
      max(fixture.starts_at) as last_fixture_at,
      bool_or(public.touchline_fantasy_fixture_is_live(fixture.status)) as any_live,
      bool_or(public.touchline_fantasy_fixture_is_final(fixture.status)) as any_final,
      count(fixture.id) > 0 and bool_and(
        public.touchline_fantasy_fixture_is_final(fixture.status)
        and fixture.finalized_at is not null
      ) as all_final,
      max(fixture.finalized_at) filter (
        where public.touchline_fantasy_fixture_is_final(fixture.status)
      ) as round_completed_at
    from public.football_rounds round
    -- A known round with no observed fixtures must remain in the predecessor
    -- sequence. Omitting it would incorrectly bootstrap the next round.
    left join public.football_fixtures fixture on fixture.round_id = round.id
    join public.touchline_fantasy_configs config
      on config.competition_id = round.competition_id
     and config.season_id = round.season_id
     and config.status = 'active'
    group by
      round.id,
      round.competition_id,
      round.season_id,
      round.name
  ), ordered_rounds as (
    select
      round_facts.*,
      bool_or(
        round_sort_number is null
        and first_fixture_at is null
      ) over (
        partition by season_id
      ) as has_ambiguous_unscheduled_round,
      row_number() over (
        partition by season_id
        order by round_sort_number nulls last, first_fixture_at nulls last, round_id
      )::integer as round_sequence,
      lag(all_final) over (
        partition by season_id
        order by round_sort_number nulls last, first_fixture_at nulls last, round_id
      ) as previous_round_all_final,
      lag(round_completed_at) over (
        partition by season_id
        order by round_sort_number nulls last, first_fixture_at nulls last, round_id
      ) as previous_round_completed_at
    from round_facts
  ), timing as (
    select
      ordered_rounds.*,
      first_fixture_at as locks_at
    from ordered_rounds
  ), prepared as (
    select
      timing.*,
      case
        -- Provider round names with a numeric sequence are authoritative. An
        -- unscheduled unnumbered round has no safe predecessor ordering, so
        -- keep the season closed until provider schedule data resolves it.
        when has_ambiguous_unscheduled_round then false
        -- A partial season import starting at Round 2 is not a bootstrap.
        -- Fully scheduled unnamed rounds retain the earliest-schedule fallback;
        -- the ambiguous-unscheduled guard above still closes that whole season.
        when round_sequence = 1
          and (round_sort_number is null or round_sort_number = 1) then true
        when previous_round_all_final
          and previous_round_completed_at is not null
          and previous_round_completed_at < locks_at then true
        else false
      end as market_window_available,
      case
        when has_ambiguous_unscheduled_round then locks_at - interval '1 microsecond'
        -- Season bootstrap is the only round without a preceding final whistle.
        when round_sequence = 1
          and (round_sort_number is null or round_sort_number = 1)
          then first_fixture_at - interval '7 days'
        when previous_round_all_final
          and previous_round_completed_at is not null
          and previous_round_completed_at < locks_at
          then previous_round_completed_at
        -- Keep invalid/incomplete/overlapping rounds materialized but closed.
        else locks_at - interval '1 microsecond'
      end as market_opens_at
    from timing
  ), closed_unscheduled_gameweeks as (
    update public.touchline_fantasy_gameweeks gameweek
    set state = case
      when gameweek.state = 'SETTLED' then 'SETTLED'
      else 'LOCKED'
    end
    where exists (
      select 1
      from public.football_rounds round
      join public.touchline_fantasy_configs config
        on config.competition_id = round.competition_id
       and config.season_id = round.season_id
       and config.status = 'active'
      where round.id = gameweek.round_id
        and not exists (
          select 1
          from public.football_fixtures fixture
          where fixture.round_id = round.id
            and fixture.starts_at is not null
        )
    )
    returning gameweek.id
  ), synchronized as (
    select
      competition_id,
      season_id,
      round_id,
      case
        when round_sort_number is not null then round_sort_number
        else round_sequence
      end as gameweek_number,
      case
        -- Provider LIVE takes precedence even when a stale schedule still says
        -- the kickoff is in the future. Never leave that Markt open.
        when any_live then 'LIVE'
        -- A provider-final result proves play already occurred regardless of
        -- a stale future kickoff. Complete observation coverage finalizes the
        -- round; partial coverage only closes it, never opens the next round.
        when all_final then 'FINAL'
        when any_final then 'LOCKED'
        when round_sequence = 1
          and not market_window_available
          and clock_timestamp() < locks_at then 'UPCOMING'
        when round_sequence > 1
          and not market_window_available
          and clock_timestamp() < locks_at then 'UPCOMING'
        when clock_timestamp() < market_opens_at then 'UPCOMING'
        when market_window_available and clock_timestamp() < locks_at then 'MARKET_OPEN'
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
  -- A round with no scheduled kickoff cannot be played, but it remains in
  -- ordered_rounds above as a fail-closed predecessor for later Gameweeks.
  where first_fixture_at is not null
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

-- Make the write boundary refresh the canonical fixture-derived window before
-- deciding. This prevents a direct POST from relying on a stale UI snapshot.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_patched text;
  v_before_prepare_guard text;
begin
  v_signature := 'public.touchline_fantasy_save_lineup(uuid,uuid,text,text,jsonb,text,text)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := replace(
    v_definition,
    '  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || '':'' || p_gameweek_id::text, 0));',
    '  perform public.touchline_fantasy_sync_gameweeks();' || chr(10)
    || '  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || '':'' || p_gameweek_id::text, 0));'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_SAVE_WINDOW_GUARD_SOURCE_MISMATCH';
  end if;
  execute v_patched;

  v_signature := 'public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := replace(
    v_definition,
    '  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id;',
    '  perform public.touchline_fantasy_sync_gameweeks();' || chr(10)
    || '  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id;'
  );
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_PREPARE_WINDOW_SYNC_SOURCE_MISMATCH';
  end if;
  v_before_prepare_guard := v_patched;
  v_patched := replace(
    v_patched,
    '  if v_existing is not null then return v_existing; end if;',
    '  if v_existing is not null then return v_existing; end if;' || chr(10)
    || '  if v_gameweek.state <> ''MARKET_OPEN'' or clock_timestamp() >= v_gameweek.locks_at then' || chr(10)
    || '    raise exception ''TL_FANTASY_GAMEWEEK_LOCKED'';' || chr(10)
    || '  end if;'
  );
  if v_patched = v_before_prepare_guard
    or strpos(
      v_patched,
      'if v_existing is not null then return v_existing; end if;' || chr(10)
      || '  if v_gameweek.state <> ''MARKET_OPEN'''
    ) = 0 then
    raise exception 'TL_FANTASY_PREPARE_WINDOW_GUARD_SOURCE_MISMATCH';
  end if;
  execute v_patched;
end
$migration$;

revoke all on function public.touchline_fantasy_sync_gameweeks()
  from public, anon, authenticated;
grant execute on function public.touchline_fantasy_sync_gameweeks()
  to service_role;
revoke all on function public.touchline_fantasy_prepare_user_gameweek(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.touchline_fantasy_prepare_user_gameweek(uuid, uuid)
  to service_role;
revoke all on function public.touchline_fantasy_save_lineup(uuid, uuid, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.touchline_fantasy_save_lineup(uuid, uuid, text, text, jsonb, text, text)
  to service_role;

-- Review requirement: the fixture persistence owner must invoke
-- touchline_fantasy_sync_gameweeks() after recording a provider-final status so
-- the persisted observation is materialized without waiting for a user read.
-- This migration also refreshes at both server write/prepare boundaries to
-- prevent a stale POST from bypassing the canonical window.
--
-- Rollback is deliberately forward-only: restore a separately reviewed
-- successor definition of touchline_fantasy_sync_gameweeks() if policy changes.
-- Do not rewrite finalized_at or historical user_gameweeks; those are evidence
-- and snapshots, not a rollback lever.

commit;
