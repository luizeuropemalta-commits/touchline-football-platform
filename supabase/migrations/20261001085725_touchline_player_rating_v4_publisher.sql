-- V4 publication only. Published V3 snapshots and their active pointer are not
-- rewritten by this migration. The compatibility score-total column stays zero.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.publish_touchline_card_ranking_snapshot(
  requested_snapshot_id text, requested_league_key text, requested_published_at timestamptz
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  candidate public.touchline_card_ranking_snapshots%rowtype;
  aggregate_row public.football_player_season_statistics%rowtype;
  player jsonb;
  canonical_competition uuid;
  canonical_season uuid;
  source_ids text[];
  aggregate_ids text[];
  snapshot_ids text[];
  union_ids text[] := array[]::text[];
  source_count integer;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using errcode='42501', message='TL_RANKING_ADMIN_REQUIRED';
  end if;
  if requested_league_key is distinct from 'touchline-england' then
    raise exception 'TL_RANKING_LEAGUE_INVALID';
  end if;
  select * into candidate from public.touchline_card_ranking_snapshots
    where snapshot_id=requested_snapshot_id and league_key=requested_league_key for update;
  if not found then raise exception 'TL_RANKING_SNAPSHOT_NOT_FOUND'; end if;
  if candidate.status <> 'audited' or candidate.source <> 'sportmonks-audited' then
    raise exception 'TL_RANKING_NOT_AUDITED';
  end if;
  if candidate.scoring_version is distinct from 'player_scoring_v4'
    or candidate.coverage_status not in ('complete','complete_for_scoring')
    or jsonb_typeof(candidate.fixture_ids) is distinct from 'array'
    or jsonb_typeof(candidate.expected_fixture_ids) is distinct from 'array'
    or jsonb_array_length(candidate.fixture_ids)=0
    or candidate.fixture_ids is distinct from candidate.expected_fixture_ids then
    raise exception 'TL_RANKING_FIXTURE_COVERAGE_INCOMPLETE';
  end if;
  if jsonb_typeof(candidate.ranking_payload->'players') is distinct from 'array'
    or jsonb_typeof(candidate.selection_payload->'players') is distinct from 'array' then
    raise exception 'TL_RANKING_PAYLOAD_INVALID';
  end if;
  -- No synthetic points sum: rankings already order cumulative raw totalRating.
  if candidate.total_score_points is distinct from 0
    or candidate.ranking_payload->'totalScorePoints' is distinct from '0'::jsonb
    or candidate.ranking_payload->>'scoringVersion' is distinct from candidate.scoring_version
    or candidate.ranking_payload->>'snapshotId' is distinct from candidate.snapshot_id
    or candidate.ranking_payload->>'seasonId' is distinct from candidate.season_id
    or candidate.ranking_payload->>'roundId' is distinct from candidate.round_id
    or candidate.ranking_payload->>'source' is distinct from candidate.source
    or candidate.ranking_payload->>'status' is distinct from 'audited'
    or candidate.ranking_payload->>'coverageStatus' is distinct from candidate.coverage_status
    or candidate.ranking_payload->'fixtureIds' is distinct from candidate.fixture_ids
    or candidate.ranking_payload->'expectedFixtureIds' is distinct from candidate.expected_fixture_ids
    or candidate.ranking_payload->>'checksum' is distinct from candidate.checksum
    or candidate.audit_report->>'checksum' is distinct from candidate.checksum
    or candidate.actual_player_count is distinct from candidate.expected_player_count
    or candidate.actual_player_count is distinct from jsonb_array_length(candidate.ranking_payload->'players')
    or coalesce(candidate.checksum,'')=''
    or candidate.audit_report->'passed' is distinct from 'true'::jsonb
    or candidate.selection_payload->'complete' is distinct from 'true'::jsonb
    or candidate.selection_payload->>'sourceSnapshotId' is distinct from candidate.snapshot_id
    or jsonb_array_length(candidate.selection_payload->'players')<>11 then
    raise exception 'TL_RANKING_PUBLICATION_BARRIER_FAILED';
  end if;
  if requested_published_at is null or candidate.audited_at is null or requested_published_at<candidate.audited_at then
    raise exception using errcode='22023', message='TL_RANKING_PUBLICATION_TIME_INVALID';
  end if;
  -- Exact canonical season/competition. IDs below are provider fixture IDs,
  -- whereas aggregates retain permanent internal fixture UUIDs.
  select s.id,c.id into strict canonical_season,canonical_competition
    from public.football_seasons s join public.football_competitions c on c.id=s.competition_id
    where s.id::text=candidate.season_id and s.provider='sportmonks'
      and c.provider='sportmonks' and c.provider_competition_id='8'
    for share of s,c;
  select array_agg(v order by v) into snapshot_ids from jsonb_array_elements_text(candidate.fixture_ids) v;
  if cardinality(snapshot_ids)<>(select count(distinct v) from unnest(snapshot_ids) v)
    or exists(select 1 from unnest(snapshot_ids) v where v !~ '^[0-9]+$')
    or (select count(distinct p->>'playerId') from jsonb_array_elements(candidate.ranking_payload->'players') p)<>candidate.actual_player_count
    or (select count(distinct p->>'providerPlayerId') from jsonb_array_elements(candidate.ranking_payload->'players') p)<>candidate.actual_player_count then
    raise exception 'TL_RANKING_SOURCE_IDENTITY_INVALID';
  end if;
  for player in select p from jsonb_array_elements(candidate.ranking_payload->'players') p order by p->>'playerId' loop
    if player->>'provider' is distinct from 'sportmonks' or player->'verified' is distinct from 'true'::jsonb
      or jsonb_typeof(player->'totalRating') is distinct from 'number'
      or (player->>'totalRating')::numeric<0
      or player ? 'touchlinePoints' or player ? 'roundPoints'
      or jsonb_typeof(player->'sourceFixtureIds') is distinct from 'array'
      or jsonb_array_length(player->'sourceFixtureIds')=0 then
      raise exception 'TL_RANKING_RAW_RATING_INVALID';
    end if;
    perform p.id from public.football_players p where p.id::text=player->>'playerId'
      and p.provider='sportmonks' and p.provider_player_id=player->>'providerPlayerId' for share of p;
    if not found then raise exception 'TL_RANKING_PLAYER_IDENTITY_INVALID'; end if;
    select a.* into strict aggregate_row from public.football_player_season_statistics a
      where a.football_player_id::text=player->>'playerId' and a.season_id=canonical_season
        and a.competition_id=canonical_competition and a.scoring_version='player_scoring_v4' for share of a;
    if aggregate_row.provider is distinct from 'sportmonks'
      or aggregate_row.provider_player_id is distinct from player->>'providerPlayerId'
      or aggregate_row.coverage_status not in ('complete','complete_for_scoring')
      or (candidate.coverage_status='complete' and aggregate_row.coverage_status<>'complete')
      or jsonb_typeof(aggregate_row.summary_payload->'totalRating') is distinct from 'number'
      or aggregate_row.summary_payload->'totalRating' is distinct from player->'totalRating'
      or aggregate_row.expected_fixture_count is distinct from aggregate_row.synchronized_fixture_count
      or aggregate_row.expected_fixture_count is distinct from jsonb_array_length(aggregate_row.aggregated_fixture_ids)
      or (select array_agg(v order by v) from jsonb_array_elements_text(aggregate_row.expected_fixture_ids) v)
        is distinct from (select array_agg(v order by v) from jsonb_array_elements_text(aggregate_row.aggregated_fixture_ids) v) then
      raise exception 'TL_RANKING_AGGREGATE_MISMATCH';
    end if;
    select array_agg(v order by v) into source_ids from jsonb_array_elements_text(player->'sourceFixtureIds') v;
    perform f.id from public.football_fixtures f where f.id::text in
      (select v from jsonb_array_elements_text(aggregate_row.aggregated_fixture_ids) v) order by f.id for share of f;
    select array_agg(f.provider_fixture_id order by f.provider_fixture_id),count(*) into aggregate_ids,source_count
      from public.football_fixtures f where f.id::text in
        (select v from jsonb_array_elements_text(aggregate_row.aggregated_fixture_ids) v)
        and f.provider='sportmonks' and f.season_id=canonical_season and f.competition_id=canonical_competition;
    if source_ids is distinct from aggregate_ids or source_count<>cardinality(source_ids)
      or source_count<>aggregate_row.expected_fixture_count
      or cardinality(source_ids)<>(select count(distinct v) from unnest(source_ids) v) then
      raise exception 'TL_RANKING_FIXTURE_SOURCE_MISMATCH';
    end if;
    perform st.id from public.touchline_player_fixture_score_settlements st
      where st.football_player_id=aggregate_row.football_player_id and st.scoring_version='player_scoring_v4'
        and st.fixture_id::text in (select v from jsonb_array_elements_text(aggregate_row.aggregated_fixture_ids) v)
      order by st.fixture_id for share of st;
    if (select count(*) from public.touchline_player_fixture_score_settlements st
      where st.football_player_id=aggregate_row.football_player_id and st.scoring_version='player_scoring_v4'
        and st.season_id=canonical_season and st.competition_id=canonical_competition
        and st.fixture_id::text in (select v from jsonb_array_elements_text(aggregate_row.aggregated_fixture_ids) v)
        and st.settlement_status='final' and st.ranking_coverage_status in ('complete','complete_for_scoring'))<>source_count then
      raise exception 'TL_RANKING_SETTLEMENT_INCOMPLETE';
    end if;
    -- Bind the cumulative rating to the actual eligible appearance ratings;
    -- this is not a converted-score total and does not fill the legacy column.
    if (select round(sum(st.rating),2) from public.touchline_player_fixture_score_settlements st
      where st.football_player_id=aggregate_row.football_player_id and st.scoring_version='player_scoring_v4'
        and st.fixture_id::text in (select v from jsonb_array_elements_text(aggregate_row.aggregated_fixture_ids) v)
        and st.appearance_status in ('started','substitute') and st.minutes_played>0)
      is distinct from (player->>'totalRating')::numeric then
      raise exception 'TL_RANKING_RAW_RATING_SUM_MISMATCH';
    end if;
    union_ids:=union_ids||source_ids;
  end loop;
  if snapshot_ids is distinct from (select array_agg(distinct v order by v) from unnest(union_ids) v) then
    raise exception 'TL_RANKING_FIXTURE_UNION_MISMATCH';
  end if;
  if (select count(distinct s->'player'->>'playerId') from jsonb_array_elements(candidate.selection_payload->'players') s)<>11
    or exists(select 1 from jsonb_array_elements(candidate.selection_payload->'players') s
      where not exists(select 1 from jsonb_array_elements(candidate.ranking_payload->'players') p where p=s->'player')) then
    raise exception 'TL_RANKING_SELECTION_SOURCE_MISMATCH';
  end if;
  update public.touchline_card_ranking_snapshots set status='published',published_at=requested_published_at
    where snapshot_id=candidate.snapshot_id;
  insert into public.touchline_card_ranking_active_snapshots(league_key,snapshot_id,activated_at,updated_at)
    values(requested_league_key,candidate.snapshot_id,requested_published_at,clock_timestamp())
    on conflict(league_key) do update set snapshot_id=excluded.snapshot_id,activated_at=excluded.activated_at,updated_at=excluded.updated_at
    where public.touchline_card_ranking_active_snapshots.snapshot_id is distinct from excluded.snapshot_id;
  return candidate.snapshot_id;
end;
$$;
revoke all on function public.publish_touchline_card_ranking_snapshot(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_touchline_card_ranking_snapshot(text,text,timestamptz) to service_role;
commit;
