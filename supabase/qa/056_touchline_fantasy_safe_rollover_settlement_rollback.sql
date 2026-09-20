-- Forward rollback of Fantasy rollover locking and score finality.
-- Function-only change: no customer rows, scores, ACLs or RLS are rewritten.
-- Fail closed if the deployed canonical function definitions have drifted.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_prepare_user_gameweek(uuid,uuid)'::regprocedure) into v_definition;
  v_patched := replace(v_definition, $before$  -- An existing draft returned above is always preserved. A new draft may
  -- never silently skip a confirmed predecessor whose XI has not been locked.
  perform user_gameweek.id
  from public.touchline_fantasy_user_gameweeks user_gameweek
  join public.touchline_fantasy_gameweeks gameweek on gameweek.id = user_gameweek.gameweek_id
  where user_gameweek.user_id = p_user_id and gameweek.season_id = v_gameweek.season_id
    and gameweek.gameweek_number < v_gameweek.gameweek_number
    and user_gameweek.state = 'CONFIRMED'
  order by gameweek.gameweek_number
  for update of user_gameweek;
  if exists (
    select 1 from public.touchline_fantasy_user_gameweeks user_gameweek
    join public.touchline_fantasy_gameweeks gameweek on gameweek.id = user_gameweek.gameweek_id
    where user_gameweek.user_id = p_user_id and gameweek.season_id = v_gameweek.season_id
      and gameweek.gameweek_number < v_gameweek.gameweek_number
      and user_gameweek.state = 'CONFIRMED'
  ) then
    raise exception 'TL_FANTASY_PREDECESSOR_NOT_LOCKED';
  end if;

  select user_gameweek.* into v_previous$before$, $after$  select user_gameweek.* into v_previous$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_1_1';
  end if;
  v_definition := v_patched;
  v_patched := replace(v_definition, $before$  perform public.touchline_fantasy_sync_gameweeks();
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_gameweek_id::text, 0));$before$, $after$  perform public.touchline_fantasy_sync_gameweeks();$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_1_2';
  end if;
  v_definition := v_patched;
  execute v_definition;
end
$migration$;

do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_reconcile_gameweek(uuid)'::regprocedure) into v_definition;
  v_patched := replace(v_definition, $before$  v_all_final := coalesce(v_all_final, false);

  -- Keep the observed source versions stable through the score writes. These
  -- locks also serialize a concurrent producer's feed/statistics upserts.
  if v_all_final then
    perform feed.id
    from public.football_fantasy_fixture_feeds feed
    join public.football_fixtures fixture on fixture.provider = feed.provider
      and fixture.provider_fixture_id = feed.provider_fixture_id
    where fixture.round_id = v_gameweek.round_id
    order by feed.id for share of feed;
    perform stats.football_player_id
    from public.football_player_fixture_statistics stats
    join public.football_fixtures fixture on fixture.id = stats.fixture_id
    where fixture.round_id = v_gameweek.round_id
    order by stats.fixture_id, stats.football_player_id for share of stats;
  end if;

  -- The final fixture observation can precede the statistics producer, including
  -- a concurrent customer GET. Only the final feed version can certify scores.
  -- source_synced_at comes from feed.last_synced_at, NOT fixture timestamps:
  -- feed persistence precedes fixture persistence within the same sync run.
  if v_all_final and exists (
    select 1
    from public.touchline_fantasy_user_gameweeks user_gameweek
    join public.touchline_fantasy_locked_selections locked
      on locked.user_gameweek_id = user_gameweek.id
    join public.football_fixtures fixture on fixture.round_id = v_gameweek.round_id
      and locked.club_id in (fixture.home_club_id, fixture.away_club_id)
    left join public.football_player_fixture_statistics stats
      on stats.football_player_id = locked.player_id and stats.fixture_id = fixture.id
    left join public.football_fantasy_fixture_feeds feed
      on feed.provider = fixture.provider and feed.provider_fixture_id = fixture.provider_fixture_id
    where user_gameweek.gameweek_id = p_gameweek_id
      and (stats.football_player_id is null or stats.source_synced_at is null
        or feed.last_synced_at is null
        or not public.touchline_fantasy_fixture_is_final(feed.fixture_payload ->> 'status')
        or jsonb_typeof(feed.lineups_payload) is distinct from 'array'
        or feed.lineups_payload = '[]'::jsonb
        or stats.source_synced_at <> feed.last_synced_at)
  ) then
    -- A correction can arrive after an earlier settlement. Record retry work
    -- durably so a later idle run needs no new fixture event to discover it.
    -- Preserve the last published score and every immutable customer snapshot.
    update public.touchline_fantasy_gameweeks set state = 'FINAL'
      where id = p_gameweek_id and state = 'SETTLED';
    return jsonb_build_object('ok', true, 'allFixturesFinal', true,
      'pendingStatistics', true, 'playerFixtureRowsChanged', 0, 'userScoresChanged', 0);
  end if;$before$, $after$  v_all_final := coalesce(v_all_final, false);$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_2_1';
  end if;
  v_definition := v_patched;
  v_patched := replace(v_definition, $before$  v_lock_result := public.touchline_fantasy_lock_gameweek(p_gameweek_id);
  if (v_lock_result ->> 'ok') is distinct from 'true' then
    return jsonb_build_object('ok', false, 'reason', 'lineup-lock-not-ready');
  end if;
  if exists (
    select 1 from public.touchline_fantasy_user_gameweeks user_gameweek
    where user_gameweek.gameweek_id = p_gameweek_id and user_gameweek.state = 'CONFIRMED'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'confirmed-lineup-not-locked');
  end if;$before$, $after$  perform public.touchline_fantasy_lock_gameweek(p_gameweek_id);$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_2_2';
  end if;
  v_definition := v_patched;
  v_patched := replace(v_definition, $before$  v_user_rows integer := 0;
  v_lock_result jsonb;$before$, $after$  v_user_rows integer := 0;$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_2_3';
  end if;
  v_definition := v_patched;
  execute v_definition;
end
$migration$;

do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef('public.touchline_fantasy_lock_gameweek(uuid)'::regprocedure) into v_definition;
  v_patched := replace(v_definition, $before$jsonb_build_object('lockedAt', v_effective_locks_at,$before$, $after$jsonb_build_object('lockedAt', v_gameweek.locks_at,$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_3_1';
  end if;
  v_definition := v_patched;
  v_patched := replace(v_definition, $before$locked_coach_id = selected_coach_id, locked_at = v_effective_locks_at$before$, $after$locked_coach_id = selected_coach_id, locked_at = v_gameweek.locks_at$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_3_2';
  end if;
  v_definition := v_patched;
  v_patched := replace(v_definition, $before$selection.position_bucket, selection.market_value_eur, v_effective_locks_at$before$, $after$selection.position_bucket, selection.market_value_eur, v_gameweek.locks_at$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_3_3';
  end if;
  v_definition := v_patched;
  v_patched := replace(v_definition, $before$  -- Provider live/final observations outrank a stale future kickoff.
  if clock_timestamp() < v_gameweek.locks_at and not exists (
    select 1 from public.football_fixtures fixture
    where fixture.round_id = v_gameweek.round_id
      and (public.touchline_fantasy_fixture_is_live(fixture.status)
        or public.touchline_fantasy_fixture_is_final(fixture.status))
  ) then return jsonb_build_object('ok', false, 'reason', 'market-open'); end if;
  v_effective_locks_at := least(v_gameweek.locks_at, clock_timestamp());$before$, $after$  if clock_timestamp() < v_gameweek.locks_at then return jsonb_build_object('ok', false, 'reason', 'market-open'); end if;$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_3_4';
  end if;
  v_definition := v_patched;
  v_patched := replace(v_definition, $before$  v_locked integer := 0;
  v_effective_locks_at timestamptz;$before$, $after$  v_locked integer := 0;$after$);
  if v_patched = v_definition then
    raise exception 'TL_FANTASY_LIFECYCLE_ROLLBACK_SOURCE_MISMATCH_3_5';
  end if;
  v_definition := v_patched;
  execute v_definition;
end
$migration$;

drop function public.touchline_fantasy_pending_gameweeks(uuid);

commit;
