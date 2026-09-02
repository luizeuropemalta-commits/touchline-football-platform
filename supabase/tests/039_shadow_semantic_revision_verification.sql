\set ON_ERROR_STOP on

create or replace function pg_temp.assert_source_revision_bump(
  p_source_key text,
  p_statement text,
  p_case_label text
)
returns void
language plpgsql
as $$
declare
  v_before bigint;
  v_after bigint;
begin
  select coalesce(revision, 0) into v_before
  from public.touchline_social_source_revisions
  where source_key = p_source_key;
  v_before := coalesce(v_before, 0);
  execute p_statement;
  select coalesce(revision, 0) into v_after
  from public.touchline_social_source_revisions
  where source_key = p_source_key;
  v_after := coalesce(v_after, 0);
  if v_after <= v_before then
    raise exception 'SHADOW_039_SOURCE_REVISION_DID_NOT_BUMP:%:%:%',
      p_case_label, p_source_key, p_statement;
  end if;
end;
$$;

do $$
declare
  v_clock_before bigint;
  v_clock_after bigint;
  v_checkpoint jsonb;
begin
  if current_setting('touchline.shadow_039_ack', true) is distinct from 'LOCAL_EMPTY_CLUSTER_ONLY'
     or current_database() is distinct from current_setting('touchline.shadow_039_database', true)
     or current_database() !~ '^touchline_social_shadow_039_[a-z0-9_]+$'
     or (inet_server_addr() is not null and inet_server_addr() <> inet '127.0.0.1') then
    raise exception 'TL_SOCIAL_039_SHADOW_LOCAL_IDENTITY_REQUIRED';
  end if;

  select revision into v_clock_before from public.touchline_social_source_clock where singleton;
  insert into public.football_competitions values ('10000000-0000-4000-8000-000000000001', 'sportmonks', '8', 'Competition');
  insert into public.football_seasons values ('10000000-0000-4000-8000-000000000002', 'sportmonks', '10000000-0000-4000-8000-000000000001', '26000', true, 'Season');
  insert into public.football_rounds values ('10000000-0000-4000-8000-000000000003', 'sportmonks', '10000000-0000-4000-8000-000000000002', 'GW');
  insert into public.football_clubs (
    id, provider, competition_id, provider_team_id, name
  ) values (
    '10000000-0000-4000-8000-000000000004',
    'sportmonks',
    '10000000-0000-4000-8000-000000000001',
    '19',
    'Home'
  );
  insert into public.football_clubs (
    id, provider, competition_id, provider_team_id, name
  ) values (
    '10000000-0000-4000-8000-000000000005',
    'sportmonks',
    '10000000-0000-4000-8000-000000000001',
    '20',
    'Away'
  );
  insert into public.football_players values ('10000000-0000-4000-8000-000000000006', 'sportmonks', '1006', 'Player');
  insert into public.football_squad_members values ('10000000-0000-4000-8000-000000000007', 'sportmonks', '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', 6, 'MID', true);
  insert into public.football_fixtures values ('10000000-0000-4000-8000-000000000008', 'sportmonks', '19722192', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', clock_timestamp(), 'NS');
  insert into public.football_fixture_lifecycle_events values ('10000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000008', 'LINEUP_AVAILABLE', clock_timestamp());
  insert into public.football_player_season_statistics values ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000006', 7.1);
  insert into public.touchline_player_fixture_score_settlements values ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000008', 7.1, 'FINAL');
  insert into public.touchline_card_publications values ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000006', 'PUBLISHED', 'ELITE');
  insert into public.football_player_market_values values ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000006', 1000000);
  insert into public.touchline_card_editorial_overrides values ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000006', '{"approved":true}');
  insert into public.touchline_formation_geometry_versions values ('4-2-3-1', '{"version":1}');
  insert into public.touchline_coach_ranking_snapshots values ('10000000-0000-4000-8000-000000000015', 'touchline-england', '{"version":1}');
  insert into public.touchline_coach_ranking_active_snapshots values ('touchline-england', '10000000-0000-4000-8000-000000000015');
  insert into public.touchline_card_ranking_snapshots values ('ranking-shadow-v1', 'touchline-england', '{"version":1}');
  insert into public.touchline_card_ranking_active_snapshots values ('touchline-england', 'ranking-shadow-v1');
  insert into public.football_fantasy_fixture_feeds (
    provider, provider_fixture_id, events_payload, last_synced_at
  ) values ('sportmonks', '19722200', '[]', clock_timestamp());

  select revision into v_clock_after from public.touchline_social_source_clock where singleton;
  if v_clock_after <= v_clock_before then raise exception 'SHADOW_039_SOURCE_CLOCK_DID_NOT_ADVANCE'; end if;
  if not exists (select 1 from public.touchline_social_source_revisions where source_key = 'competition:10000000-0000-4000-8000-000000000001')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'season:10000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'round:10000000-0000-4000-8000-000000000003')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'club:10000000-0000-4000-8000-000000000004')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'player:10000000-0000-4000-8000-000000000006')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'fixture:10000000-0000-4000-8000-000000000008')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'fixture-provider:19722192')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'formation:4-2-3-1')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'coach-ranking:touchline-england')
     or not exists (select 1 from public.touchline_social_source_revisions where source_key = 'card-ranking:touchline-england') then
    raise exception 'SHADOW_039_DEPENDENCY_REVISION_MAPPING_INCOMPLETE';
  end if;

  v_checkpoint := public.touchline_social_read_source_revision(array[
    'fixture-provider:19722192',
    'player:10000000-0000-4000-8000-000000000006',
    'formation:4-2-3-1',
    'coach-ranking:touchline-england',
    'card-ranking:touchline-england'
  ]);
  if not public.touchline_social_source_revision_is_current(
    v_checkpoint -> 'manifest', v_checkpoint ->> 'checksum'
  ) then raise exception 'SHADOW_039_CURRENT_SOURCE_MANIFEST_REJECTED'; end if;
  update public.touchline_card_ranking_snapshots
  set ranking_payload = '{"version":2}'
  where snapshot_id = 'ranking-shadow-v1';
  if public.touchline_social_source_revision_is_current(
    v_checkpoint -> 'manifest', v_checkpoint ->> 'checksum'
  ) then raise exception 'SHADOW_039_CARD_RANKING_STALE_MANIFEST_ACCEPTED'; end if;

  v_checkpoint := public.touchline_social_read_source_revision(array[
    'fixture-provider:19722192',
    'player:10000000-0000-4000-8000-000000000006',
    'formation:4-2-3-1',
    'coach-ranking:touchline-england',
    'card-ranking:touchline-england'
  ]);
  update public.touchline_card_publications set tier_key = 'DIAMOND'
  where player_id = '10000000-0000-4000-8000-000000000006';
  if public.touchline_social_source_revision_is_current(
    v_checkpoint -> 'manifest', v_checkpoint ->> 'checksum'
  ) then raise exception 'SHADOW_039_STALE_SOURCE_MANIFEST_ACCEPTED'; end if;
end;
$$;

-- Exercise every rendered relation independently. Each statement must advance
-- the precise old/current key instead of merely moving the global clock.
select pg_temp.assert_source_revision_bump(
  'competition:10000000-0000-4000-8000-000000000001',
  $q$update public.football_competitions set name = 'Competition v2' where id = '10000000-0000-4000-8000-000000000001'$q$,
  'football_competitions'
);
select pg_temp.assert_source_revision_bump(
  'season:10000000-0000-4000-8000-000000000002',
  $q$update public.football_seasons set name = 'Season v2' where id = '10000000-0000-4000-8000-000000000002'$q$,
  'football_seasons'
);
select pg_temp.assert_source_revision_bump(
  'round:10000000-0000-4000-8000-000000000003',
  $q$update public.football_rounds set name = 'GW v2' where id = '10000000-0000-4000-8000-000000000003'$q$,
  'football_rounds'
);
select pg_temp.assert_source_revision_bump(
  'club:10000000-0000-4000-8000-000000000004',
  $q$update public.football_clubs set name = 'Home v2' where id = '10000000-0000-4000-8000-000000000004'$q$,
  'football_clubs'
);
select pg_temp.assert_source_revision_bump(
  'player:10000000-0000-4000-8000-000000000006',
  $q$update public.football_players set display_name = 'Player v2' where id = '10000000-0000-4000-8000-000000000006'$q$,
  'football_players'
);
select pg_temp.assert_source_revision_bump(
  'player:10000000-0000-4000-8000-000000000006',
  $q$update public.football_squad_members set jersey_number = 16 where id = '10000000-0000-4000-8000-000000000007'$q$,
  'football_squad_members'
);
select pg_temp.assert_source_revision_bump(
  'fixture:10000000-0000-4000-8000-000000000008',
  $q$update public.football_fixtures set status = 'LIVE' where id = '10000000-0000-4000-8000-000000000008'$q$,
  'football_fixtures'
);
select pg_temp.assert_source_revision_bump(
  'fixture:10000000-0000-4000-8000-000000000008',
  $q$update public.football_fixture_lifecycle_events set event_type = 'LINEUP_CONFIRMED' where id = '10000000-0000-4000-8000-000000000009'$q$,
  'football_fixture_lifecycle_events'
);
select pg_temp.assert_source_revision_bump(
  'player:10000000-0000-4000-8000-000000000006',
  $q$update public.football_player_season_statistics set rating = 7.2 where id = '10000000-0000-4000-8000-000000000010'$q$,
  'football_player_season_statistics'
);
select pg_temp.assert_source_revision_bump(
  'fixture:10000000-0000-4000-8000-000000000008',
  $q$update public.touchline_player_fixture_score_settlements set official_match_rating = 7.2 where id = '10000000-0000-4000-8000-000000000011'$q$,
  'touchline_player_fixture_score_settlements'
);
select pg_temp.assert_source_revision_bump(
  'player:10000000-0000-4000-8000-000000000006',
  $q$update public.touchline_card_publications set publication_state = 'REVIEW_REQUIRED' where id = '10000000-0000-4000-8000-000000000012'$q$,
  'touchline_card_publications'
);
select pg_temp.assert_source_revision_bump(
  'player:10000000-0000-4000-8000-000000000006',
  $q$update public.football_player_market_values set amount_eur = 2000000 where id = '10000000-0000-4000-8000-000000000013'$q$,
  'football_player_market_values'
);
select pg_temp.assert_source_revision_bump(
  'player:10000000-0000-4000-8000-000000000006',
  $q$update public.touchline_card_editorial_overrides set override_payload = '{"approved":false}' where id = '10000000-0000-4000-8000-000000000014'$q$,
  'touchline_card_editorial_overrides'
);
select pg_temp.assert_source_revision_bump(
  'formation:4-2-3-1',
  $q$update public.touchline_formation_geometry_versions set geometry_payload = '{"version":2}' where formation_code = '4-2-3-1'$q$,
  'touchline_formation_geometry_versions'
);
select pg_temp.assert_source_revision_bump(
  'coach-ranking:touchline-england',
  $q$update public.touchline_coach_ranking_snapshots set payload = '{"version":2}' where id = '10000000-0000-4000-8000-000000000015'$q$,
  'touchline_coach_ranking_snapshots'
);
insert into public.touchline_coach_ranking_snapshots values (
  '10000000-0000-4000-8000-000000000016', 'touchline-england', '{"version":3}'
);
select pg_temp.assert_source_revision_bump(
  'coach-ranking:touchline-england',
  $q$update public.touchline_coach_ranking_active_snapshots set snapshot_id = '10000000-0000-4000-8000-000000000016' where league_key = 'touchline-england'$q$,
  'touchline_coach_ranking_active_snapshots'
);
select pg_temp.assert_source_revision_bump(
  'card-ranking:touchline-england',
  $q$update public.touchline_card_ranking_snapshots set ranking_payload = '{"version":3}' where snapshot_id = 'ranking-shadow-v1'$q$,
  'touchline_card_ranking_snapshots'
);
insert into public.touchline_card_ranking_snapshots values (
  'ranking-shadow-v2', 'touchline-england', '{"version":4}'
);
select pg_temp.assert_source_revision_bump(
  'card-ranking:touchline-england',
  $q$update public.touchline_card_ranking_active_snapshots set snapshot_id = 'ranking-shadow-v2' where league_key = 'touchline-england'$q$,
  'touchline_card_ranking_active_snapshots'
);
select pg_temp.assert_source_revision_bump(
  'fixture-provider:19722200',
  $q$update public.football_fantasy_fixture_feeds set events_payload = '[{"type":"goal"}]' where provider = 'sportmonks' and provider_fixture_id = '19722200'$q$,
  'football_fantasy_fixture_feeds_payload'
);

-- Identity moves invalidate both identities. Moving away from SportMonks must
-- still advance the last SportMonks key rather than silently preserving a
-- dispatchable manifest.
select pg_temp.assert_source_revision_bump(
  'fixture-provider:19722200',
  $q$update public.football_fantasy_fixture_feeds set provider_fixture_id = '19722201' where provider = 'sportmonks' and provider_fixture_id = '19722200'$q$,
  'fixture_feed_old_identity'
);
do $$
begin
  if not exists (
    select 1 from public.touchline_social_source_revisions
    where source_key = 'fixture-provider:19722201' and revision > 0
  ) then raise exception 'SHADOW_039_FIXTURE_FEED_NEW_IDENTITY_NOT_BUMPED'; end if;
end;
$$;
select pg_temp.assert_source_revision_bump(
  'fixture-provider:19722201',
  $q$update public.football_fantasy_fixture_feeds set provider = 'other' where provider = 'sportmonks' and provider_fixture_id = '19722201'$q$,
  'fixture_feed_provider_reclassification'
);
insert into public.football_players values (
  '10000000-0000-4000-8000-000000000017', 'sportmonks', '1017', 'Reclassified Player'
);
select pg_temp.assert_source_revision_bump(
  'player:10000000-0000-4000-8000-000000000017',
  $q$update public.football_players set provider = 'other' where id = '10000000-0000-4000-8000-000000000017'$q$,
  'generic_provider_reclassification'
);

select 'SHADOW_039_SEMANTIC_REVISION_ASSERTIONS_PASS' as result;
