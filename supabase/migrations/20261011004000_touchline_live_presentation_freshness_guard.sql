-- Never advance the immutable Live pointer from an old score/event snapshot.
-- A successful guarded sync must refresh the source before publication.

begin;
set local lock_timeout = '5s';

create or replace function public.touchline_live_presentation_publish_current()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competition_id uuid;
  v_window_start timestamptz := date_trunc('minute', clock_timestamp()) - interval '4 hours';
  v_fixture_rows jsonb := '[]'::jsonb;
  v_fixture_ids text[] := '{}';
  v_player_id text;
  v_player_fixture_ids jsonb := '[]'::jsonb;
  v_coach_id text;
  v_coach_fixture_ids jsonb := '[]'::jsonb;
  v_live_score_payload jsonb;
  v_live_score_fetched_at timestamptz;
  v_live_score_digest text;
  v_payload jsonb;
  v_digest text;
  v_snapshot public.touchline_live_presentation_snapshots%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_LIVE_PRESENTATION_SERVICE_ONLY';
  end if;

  select competition.id into v_competition_id
    from public.football_competitions as competition
   where competition.provider = 'sportmonks'
     and competition.provider_competition_id = '8'
   limit 1;

  if v_competition_id is null then
    raise exception using errcode = 'P0001', message = 'TL_LIVE_PRESENTATION_COMPETITION_UNAVAILABLE';
  end if;

  select snapshot.payload, snapshot.fetched_at
    into v_live_score_payload, v_live_score_fetched_at
    from public.football_live_snapshots as snapshot
   where snapshot.snapshot_key = 'touchline-england-live';
  if not found
     or v_live_score_fetched_at is null
     or v_live_score_fetched_at < clock_timestamp() - interval '5 minutes'
     or v_live_score_fetched_at > clock_timestamp() + interval '1 minute'
     or jsonb_typeof(v_live_score_payload) is distinct from 'object'
     or jsonb_typeof(v_live_score_payload -> 'fixtures') is distinct from 'array'
     or jsonb_array_length(v_live_score_payload -> 'fixtures') > 240 then
    raise exception using errcode = 'P0001', message = 'TL_LIVE_PRESENTATION_SCORE_SNAPSHOT_UNAVAILABLE';
  end if;
  v_live_score_digest := md5(v_live_score_payload::text);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'fixtureId', fixture.provider_fixture_id,
      'startsAt', fixture.starts_at,
      'status', fixture.status
    ) order by fixture.starts_at asc nulls last, fixture.provider_fixture_id asc
  ), '[]'::jsonb),
  coalesce(array_agg(fixture.provider_fixture_id order by fixture.starts_at asc nulls last, fixture.provider_fixture_id asc), '{}')
    into v_fixture_rows, v_fixture_ids
    from (
      select source.provider_fixture_id, source.starts_at, source.status
        from public.football_fixtures as source
       where source.provider = 'sportmonks'
         and source.competition_id = v_competition_id
         and source.starts_at >= v_window_start
       order by source.starts_at asc nulls last, source.provider_fixture_id asc
       limit 240
    ) as fixture;

  select active.snapshot_id, snapshot.fixture_ids
    into v_player_id, v_player_fixture_ids
    from public.touchline_card_ranking_active_snapshots as active
    join public.touchline_card_ranking_snapshots as snapshot
      on snapshot.snapshot_id = active.snapshot_id
     and snapshot.league_key = active.league_key
   where active.league_key = 'touchline-england'
     and snapshot.source = 'sportmonks-audited'
     and snapshot.status = 'published'
     and snapshot.scoring_version = 'player_scoring_v4'
     and snapshot.coverage_status in ('complete', 'complete_for_scoring')
     and snapshot.actual_player_count = snapshot.expected_player_count
     and snapshot.fixture_ids = snapshot.expected_fixture_ids;
  if not found then
    v_player_id := null;
    v_player_fixture_ids := '[]'::jsonb;
  end if;

  select active.snapshot_id, snapshot.fixture_ids
    into v_coach_id, v_coach_fixture_ids
    from public.touchline_coach_ranking_active_snapshots as active
    join public.touchline_coach_ranking_snapshots as snapshot
      on snapshot.snapshot_id = active.snapshot_id
     and snapshot.league_key = active.league_key
   where active.league_key = 'touchline-england'
     and snapshot.scoring_version = 'coach_scoring_v2';
  if not found then
    v_coach_id := null;
    v_coach_fixture_ids := '[]'::jsonb;
  end if;

  v_payload := jsonb_build_object(
    'version', 1,
    'scopeKey', 'touchline-england',
    'windowStart', v_window_start,
    'playerRankingSnapshotId', v_player_id,
    'playerRankingFixtureIds', coalesce(v_player_fixture_ids, '[]'::jsonb),
    'coachRankingSnapshotId', v_coach_id,
    'coachRankingFixtureIds', coalesce(v_coach_fixture_ids, '[]'::jsonb),
    'liveScoreSnapshotDigest', v_live_score_digest,
    'liveScorePayload', v_live_score_payload,
    'fixtures', v_fixture_rows
  );
  v_digest := md5(v_payload::text);

  insert into public.touchline_live_presentation_snapshots(scope_key, content_digest, payload)
  values ('touchline-england', v_digest, v_payload)
  on conflict (scope_key, content_digest) do nothing;

  select * into v_snapshot
    from public.touchline_live_presentation_snapshots
   where scope_key = 'touchline-england' and content_digest = v_digest;

  insert into public.touchline_live_presentation_active_snapshots(scope_key, snapshot_id)
  values ('touchline-england', v_snapshot.id)
  on conflict (scope_key) do update
    set snapshot_id = excluded.snapshot_id,
        activated_at = case
          when public.touchline_live_presentation_active_snapshots.snapshot_id is distinct from excluded.snapshot_id
            then clock_timestamp()
          else public.touchline_live_presentation_active_snapshots.activated_at
        end,
        updated_at = clock_timestamp();

  return jsonb_build_object('snapshotId', v_snapshot.id, 'contentDigest', v_digest, 'payload', v_payload);
end;
$$;

comment on function public.touchline_live_presentation_publish_current() is
  'Service-role-only transaction. Reads fresh (<=5 minute) sanitized score/event data, canonical fixtures and active V4 player/V2 coach ranking snapshots; refuses stale input and never calls a provider.';

commit;
