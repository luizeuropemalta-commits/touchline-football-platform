-- Fantasy consumes canonical V3 FOOTBALL FACTS, never V3 band points.
-- Function-only forward migration; preserve historical V2 rows and all customer XI.
-- Installed QA preimages captured 2026-10-01; drift aborts before replacing either function.
-- The SQL rule remains rating x 2 for >=3 goals, with the existing NULL/DNP semantics.
begin;
set local lock_timeout = '5s';

do $migration$
begin
  if md5(pg_get_functiondef('public.touchline_fantasy_reconcile_gameweek(uuid)'::regprocedure))
       <> 'ccf0832880754d46b34863d8fc521046'
     or md5(pg_get_functiondef('public.touchline_fantasy_pending_gameweeks(uuid)'::regprocedure))
       <> '97b2365498f9a6538049ff2a1ad8dc79' then
    raise exception 'TL_FANTASY_V3_FACTS_SOURCE_MISMATCH';
  end if;
end
$migration$;

CREATE OR REPLACE FUNCTION public.touchline_fantasy_reconcile_gameweek(p_gameweek_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gameweek public.touchline_fantasy_gameweeks%rowtype;
  v_all_final boolean;
  v_score_rows integer := 0;
  v_user_rows integer := 0;
  v_lock_result jsonb;
begin
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-fantasy-score:' || p_gameweek_id::text, 0));
  select * into v_gameweek from public.touchline_fantasy_gameweeks where id = p_gameweek_id for update;
  if v_gameweek.id is null then raise exception 'TL_FANTASY_GAMEWEEK_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.football_rounds round
    join public.touchline_fantasy_configs config on config.season_id = round.season_id
      and config.competition_id = round.competition_id
    where round.id = v_gameweek.round_id and round.season_id = v_gameweek.season_id
      and round.competition_id = v_gameweek.competition_id
      and config.competition_key = 'england' and config.status = 'active'
  ) then raise exception 'TL_FANTASY_CANONICAL_SCOPE_UNAVAILABLE'; end if;

  v_lock_result := public.touchline_fantasy_lock_gameweek(p_gameweek_id);
  if (v_lock_result ->> 'ok') is distinct from 'true' then
    return jsonb_build_object('ok', false, 'reason', 'lineup-lock-not-ready');
  end if;
  if exists (
    select 1 from public.touchline_fantasy_user_gameweeks user_gameweek
    where user_gameweek.gameweek_id = p_gameweek_id and user_gameweek.state = 'CONFIRMED'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'confirmed-lineup-not-locked');
  end if;
  select bool_and(public.touchline_fantasy_fixture_is_final(fixture.status))
    into v_all_final
  from public.football_fixtures fixture
  where fixture.round_id = v_gameweek.round_id;
  v_all_final := coalesce(v_all_final, false);

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
    from public.touchline_player_fixture_score_settlements stats
    join public.football_fixtures fixture on fixture.id = stats.fixture_id
    where fixture.round_id = v_gameweek.round_id and stats.scoring_version = 'player_scoring_v3'
    order by stats.fixture_id, stats.football_player_id for share of stats;
  end if;

  -- Preserve the final-feed fence for every materialized/source row, not only a
  -- customer's XI. An absent/invalid V3 source must never partially resettle a round.
  -- NULL goals and no-provider-rating remain the existing Fantasy zero contract.
  if exists (
    with required as (
      select locked.player_id, fixture.id as fixture_id
      from public.touchline_fantasy_user_gameweeks user_gameweek
      join public.touchline_fantasy_locked_selections locked on locked.user_gameweek_id = user_gameweek.id
      join public.football_fixtures fixture on fixture.round_id = v_gameweek.round_id
        and locked.club_id in (fixture.home_club_id, fixture.away_club_id)
      -- Scheduled fixtures legitimately have no statistics during a live round.
      -- Only round finalization requires complete source coverage of the locked XI.
      where user_gameweek.gameweek_id = p_gameweek_id and v_all_final
      union
      select stats.football_player_id, stats.fixture_id
      from public.touchline_player_fixture_score_settlements stats
      join public.football_fixtures fixture on fixture.id = stats.fixture_id
      where fixture.round_id = v_gameweek.round_id and stats.scoring_version = 'player_scoring_v3'
      union
      select score.player_id, score.fixture_id
      from public.touchline_fantasy_player_fixture_scores score where score.gameweek_id = p_gameweek_id
    )
    select 1 from required
    left join public.football_fixtures fixture on fixture.id = required.fixture_id
      and fixture.round_id = v_gameweek.round_id
    left join public.touchline_player_fixture_score_settlements stats
      on stats.fixture_id = fixture.id and stats.football_player_id = required.player_id
      and fixture.provider = 'sportmonks'
      and fixture.season_id = v_gameweek.season_id and fixture.competition_id = v_gameweek.competition_id
      and stats.scoring_version = 'player_scoring_v3'
      and stats.season_id = v_gameweek.season_id and stats.competition_id = v_gameweek.competition_id
      and exists (select 1 from public.football_players player
        where player.id = stats.football_player_id and player.provider = 'sportmonks')
    left join public.football_fantasy_fixture_feeds feed
      on feed.provider = fixture.provider and feed.provider_fixture_id = fixture.provider_fixture_id
    where stats.football_player_id is null
      or (v_all_final and (
        stats.settlement_status <> 'final' or stats.source_synced_at is null
        or feed.last_synced_at is null
        or not public.touchline_fantasy_fixture_is_final(feed.fixture_payload ->> 'status')
        or jsonb_typeof(feed.lineups_payload) is distinct from 'array'
        or feed.lineups_payload = '[]'::jsonb
        or stats.source_synced_at is distinct from feed.last_synced_at
      ))
  ) then
    update public.touchline_fantasy_gameweeks set state = 'FINAL'
      where id = p_gameweek_id and state = 'SETTLED';
    return jsonb_build_object('ok', true, 'allFixturesFinal', v_all_final,
      'pendingStatistics', true, 'playerFixtureRowsChanged', 0, 'userScoresChanged', 0);
  end if;

  insert into public.touchline_fantasy_player_fixture_scores (
    gameweek_id, player_id, fixture_id, appearance_status, participation_status,
    rating, goals, hat_trick_multiplier, fantasy_contribution, reason_code,
    settlement_status, source_synced_at, settled_at
  )
  select
    p_gameweek_id,
    stats.football_player_id,
    stats.fixture_id,
    stats.appearance_status,
    case
      when stats.appearance_status in ('started', 'substitute') and stats.rating is not null then 'rated_appearance'
      when stats.appearance_status in ('started', 'substitute') then 'no_provider_rating'
      else 'did_not_play'
    end,
    case when stats.appearance_status in ('started', 'substitute') then stats.rating else null end,
    case when coalesce(stats.statistics_payload ->> 'goals', '') ~ '^[0-9]+$' then (stats.statistics_payload ->> 'goals')::integer else 0 end,
    case when coalesce(stats.statistics_payload ->> 'goals', '') ~ '^[0-9]+$' and (stats.statistics_payload ->> 'goals')::integer >= 3 then 2 else 1 end,
    case
      when stats.appearance_status in ('started', 'substitute') and stats.rating is not null
      then round(stats.rating * case when coalesce(stats.statistics_payload ->> 'goals', '') ~ '^[0-9]+$' and (stats.statistics_payload ->> 'goals')::integer >= 3 then 2 else 1 end, 2)
      else 0
    end,
    case
      when stats.appearance_status in ('started', 'substitute') and stats.rating is not null then 'RATED_APPEARANCE'
      when stats.appearance_status in ('started', 'substitute') then 'NO_PROVIDER_RATING'
      else 'DID_NOT_PLAY'
    end,
    case when public.touchline_fantasy_fixture_is_final(fixture.status) then 'FINAL' else 'PROVISIONAL' end,
    stats.source_synced_at,
    case when public.touchline_fantasy_fixture_is_final(fixture.status) then now() else null end
  from public.touchline_player_fixture_score_settlements stats
  join public.football_fixtures fixture on fixture.id = stats.fixture_id
  where fixture.round_id = v_gameweek.round_id and fixture.provider = 'sportmonks'
      and fixture.season_id = v_gameweek.season_id and fixture.competition_id = v_gameweek.competition_id
      and stats.scoring_version = 'player_scoring_v3'
      and stats.season_id = v_gameweek.season_id and stats.competition_id = v_gameweek.competition_id
      and exists (select 1 from public.football_players player
        where player.id = stats.football_player_id and player.provider = 'sportmonks')
  on conflict (player_id, fixture_id) do update
    set gameweek_id = excluded.gameweek_id,
        appearance_status = excluded.appearance_status,
        participation_status = excluded.participation_status,
        rating = excluded.rating,
        goals = excluded.goals,
        hat_trick_multiplier = excluded.hat_trick_multiplier,
        fantasy_contribution = excluded.fantasy_contribution,
        reason_code = excluded.reason_code,
        settlement_status = excluded.settlement_status,
        source_synced_at = excluded.source_synced_at,
        settled_at = excluded.settled_at
  where row(
    public.touchline_fantasy_player_fixture_scores.gameweek_id,
    public.touchline_fantasy_player_fixture_scores.appearance_status,
    public.touchline_fantasy_player_fixture_scores.participation_status,
    public.touchline_fantasy_player_fixture_scores.rating,
    public.touchline_fantasy_player_fixture_scores.goals,
    public.touchline_fantasy_player_fixture_scores.hat_trick_multiplier,
    public.touchline_fantasy_player_fixture_scores.fantasy_contribution,
    public.touchline_fantasy_player_fixture_scores.reason_code,
    public.touchline_fantasy_player_fixture_scores.settlement_status,
    public.touchline_fantasy_player_fixture_scores.source_synced_at
  ) is distinct from row(
    excluded.gameweek_id,
    excluded.appearance_status, excluded.participation_status, excluded.rating,
    excluded.goals, excluded.hat_trick_multiplier, excluded.fantasy_contribution,
    excluded.reason_code, excluded.settlement_status, excluded.source_synced_at
  );
  get diagnostics v_score_rows = row_count;

  insert into public.touchline_fantasy_user_gameweek_scores (
    user_gameweek_id, gameweek_score, settlement_status, checksum,
    calculated_at, settled_at
  )
  select
    user_gameweek.id,
    coalesce(sum(score.fantasy_contribution), 0),
    case when v_all_final then 'FINAL' else 'PROVISIONAL' end,
    md5(
      user_gameweek.id::text || ':' ||
      coalesce(string_agg(locked.player_id::text || ':' || fixture.id::text || ':' || coalesce(score.fantasy_contribution, 0)::text, ',' order by locked.player_id, fixture.id), '')
    ),
    now(),
    case when v_all_final then now() else null end
  from public.touchline_fantasy_user_gameweeks user_gameweek
  join public.touchline_fantasy_locked_selections locked on locked.user_gameweek_id = user_gameweek.id
  join public.football_fixtures fixture on fixture.round_id = v_gameweek.round_id
  left join public.touchline_fantasy_player_fixture_scores score
    on score.player_id = locked.player_id and score.fixture_id = fixture.id
  where user_gameweek.gameweek_id = p_gameweek_id
  group by user_gameweek.id
  on conflict (user_gameweek_id) do update
    set gameweek_score = excluded.gameweek_score,
        settlement_status = excluded.settlement_status,
        checksum = excluded.checksum,
        calculated_at = excluded.calculated_at,
        settled_at = excluded.settled_at
  where public.touchline_fantasy_user_gameweek_scores.checksum is distinct from excluded.checksum
     or public.touchline_fantasy_user_gameweek_scores.settlement_status is distinct from excluded.settlement_status;
  get diagnostics v_user_rows = row_count;

  if v_all_final then
    update public.touchline_fantasy_user_gameweeks
       set state = 'FINAL', finalized_at = coalesce(finalized_at, now())
     where gameweek_id = p_gameweek_id and state = 'LOCKED';
    update public.touchline_fantasy_gameweeks
       set state = 'SETTLED', finalized_at = coalesce(finalized_at, now()), settled_at = coalesce(settled_at, now())
     where id = p_gameweek_id;
  elsif exists (
    select 1 from public.football_fixtures fixture
    where fixture.round_id = v_gameweek.round_id and public.touchline_fantasy_fixture_is_live(fixture.status)
  ) then
    update public.touchline_fantasy_gameweeks set state = 'LIVE' where id = p_gameweek_id;
  end if;

  insert into public.touchline_fantasy_audit_events (gameweek_id, event_type, metadata)
  values (p_gameweek_id, 'SCORE_RECONCILED', jsonb_build_object(
    'playerFixtureRowsChanged', v_score_rows,
    'userScoresChanged', v_user_rows,
    'allFixturesFinal', v_all_final
  ));

  return jsonb_build_object(
    'ok', true,
    'playerFixtureRowsChanged', v_score_rows,
    'userScoresChanged', v_user_rows,
    'allFixturesFinal', v_all_final
  );
end;
$function$;

create or replace function public.touchline_fantasy_pending_gameweeks(p_season_id uuid)
returns table (id uuid, state text)
language sql stable security definer set search_path = ''
as $function$
  with gameweeks as (
    select gameweek.*
    from public.touchline_fantasy_gameweeks gameweek
    where gameweek.season_id = p_season_id
      and exists (
        select 1 from public.touchline_fantasy_configs config
        where config.season_id = gameweek.season_id and config.competition_id = gameweek.competition_id
          and config.competition_key = 'england' and config.status = 'active'
      )
  ), required as (
    select gameweek.id as gameweek_id, locked.player_id, fixture.id as fixture_id
    from gameweeks gameweek
    join public.touchline_fantasy_user_gameweeks user_gameweek on user_gameweek.gameweek_id = gameweek.id
    join public.touchline_fantasy_locked_selections locked on locked.user_gameweek_id = user_gameweek.id
    join public.football_fixtures fixture on fixture.round_id = gameweek.round_id
      and locked.club_id in (fixture.home_club_id, fixture.away_club_id)
    union
    -- Source and inverse-materialization branches intentionally have no user/XI join.
    select gameweek.id, stats.football_player_id, stats.fixture_id
    from gameweeks gameweek
    join public.football_fixtures fixture on fixture.round_id = gameweek.round_id
    join public.touchline_player_fixture_score_settlements stats on stats.fixture_id = fixture.id
      and stats.scoring_version = 'player_scoring_v3'
    union
    select gameweek.id, score.player_id, score.fixture_id
    from gameweeks gameweek
    join public.touchline_fantasy_player_fixture_scores score on score.gameweek_id = gameweek.id
  ), observed as (
    select gameweek.id as gameweek_id, required.player_id, required.fixture_id,
      stats.football_player_id as source_player_id, stats.appearance_status,
      stats.rating, case when coalesce(stats.statistics_payload ->> 'goals', '') ~ '^[0-9]+$' then (stats.statistics_payload ->> 'goals')::integer else 0 end as goals,
      stats.source_synced_at, stats.settlement_status as source_status,
      feed.last_synced_at, feed.fixture_payload, feed.lineups_payload
    from required
    join gameweeks gameweek on gameweek.id = required.gameweek_id
    left join public.football_fixtures fixture on fixture.id = required.fixture_id and fixture.round_id = gameweek.round_id
    left join public.touchline_player_fixture_score_settlements stats
      on stats.fixture_id = fixture.id and stats.football_player_id = required.player_id
      and fixture.provider = 'sportmonks'
      and fixture.season_id = gameweek.season_id and fixture.competition_id = gameweek.competition_id
      and stats.scoring_version = 'player_scoring_v3'
      and stats.season_id = gameweek.season_id and stats.competition_id = gameweek.competition_id
      and exists (select 1 from public.football_players player
        where player.id = stats.football_player_id and player.provider = 'sportmonks')
    left join public.football_fantasy_fixture_feeds feed
      on feed.provider = fixture.provider and feed.provider_fixture_id = fixture.provider_fixture_id
  ), expected as (
    select observed.*,
      case when appearance_status in ('started','substitute') then rating else null end as effective_rating,
      case when goals >= 3 then 2 else 1 end as multiplier,
      case when appearance_status in ('started','substitute') and rating is not null
        then round(rating * case when goals >= 3 then 2 else 1 end, 2) else 0 end as contribution,
      case when appearance_status in ('started','substitute') and rating is not null then 'rated_appearance'
        when appearance_status in ('started','substitute') then 'no_provider_rating'
        else 'did_not_play' end as participation,
      case when appearance_status in ('started','substitute') and rating is not null then 'RATED_APPEARANCE'
        when appearance_status in ('started','substitute') then 'NO_PROVIDER_RATING'
        else 'DID_NOT_PLAY' end as reason
    from observed
  )
  select gameweek.id, gameweek.state from gameweeks gameweek
  where gameweek.state in ('LOCKED','LIVE','FINAL')
    or (gameweek.state = 'SETTLED' and exists (
      select 1 from expected
      left join public.touchline_fantasy_player_fixture_scores score
        on score.player_id = expected.player_id and score.fixture_id = expected.fixture_id
      where expected.gameweek_id = gameweek.id
        and (expected.source_player_id is null or expected.source_synced_at is null
          or expected.source_status <> 'final' or expected.last_synced_at is null
          or not public.touchline_fantasy_fixture_is_final(expected.fixture_payload ->> 'status')
          or jsonb_typeof(expected.lineups_payload) is distinct from 'array'
          or expected.lineups_payload = '[]'::jsonb
          or expected.source_synced_at is distinct from expected.last_synced_at
          or score.id is null
          or row(score.gameweek_id,score.appearance_status,score.participation_status,score.rating,
            score.goals,score.hat_trick_multiplier,score.fantasy_contribution,score.reason_code,
            score.settlement_status,score.source_synced_at)
          is distinct from row(expected.gameweek_id,expected.appearance_status,expected.participation,
            expected.effective_rating,expected.goals,expected.multiplier,expected.contribution,
            expected.reason,'FINAL'::text,expected.source_synced_at))
    ))
  order by gameweek.gameweek_number, gameweek.id;
$function$;

-- CREATE OR REPLACE retains ownership/ACL; restate the existing deny-public/service-only boundary.
revoke all on function public.touchline_fantasy_reconcile_gameweek(uuid) from public, anon, authenticated;
revoke all on function public.touchline_fantasy_pending_gameweeks(uuid) from public, anon, authenticated;
grant execute on function public.touchline_fantasy_reconcile_gameweek(uuid) to service_role;
grant execute on function public.touchline_fantasy_pending_gameweeks(uuid) to service_role;
commit;
