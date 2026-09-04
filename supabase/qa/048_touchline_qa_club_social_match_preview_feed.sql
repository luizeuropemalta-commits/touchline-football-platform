-- QA-only extension: route an approved immutable 041 MATCH_PREVIEW revision
-- to the internal Club Social Feed of the two fixture clubs. No media bytes
-- are duplicated and no external delivery capability is introduced.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

-- Freeze every 045 writer before changing the accepted content family.  The
-- source-revision lock is exclusive on purpose: enqueue/claim/complete take it
-- shared, so no writer can cross this migration boundary.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('touchline-social-source-revision', 0));
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('touchline-social-045-executor:SCHEDULER', 0));
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('touchline-social-045-executor:RUNNER', 0));
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('touchline-social-045-lifecycle', 0));

do $$
begin
  if pg_catalog.to_regclass('public.touchline_club_social_posts') is null
     or pg_catalog.to_regclass('public.touchline_club_social_fanout_jobs') is null
     or pg_catalog.to_regprocedure('public.touchline_social_045_expected_team_ids(uuid)') is null then
    raise exception 'TL_SOCIAL_048_SCHEMA_PRECONDITION_FAILED';
  end if;
  if exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.touchline_club_social_posts'::regclass
      and conname='touchline_club_social_posts_content_type_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%MATCH_PREVIEW%'
  ) then
    raise exception 'TL_SOCIAL_048_SCHEMA_PRECONDITION_FAILED';
  end if;
  if exists (
    select 1 from public.touchline_club_social_executor_cycles
    where lease_token is not null and lease_expires_at > clock_timestamp()
  ) then
    raise exception 'TL_SOCIAL_048_ACTIVE_LEASE';
  end if;
end
$$;

lock table public.touchline_club_social_executor_cycles in access exclusive mode;
lock table public.touchline_club_social_fanout_jobs in access exclusive mode;
lock table public.touchline_club_social_posts in access exclusive mode;

do $$
begin
  if exists (
    select 1 from public.touchline_club_social_executor_cycles
    where lease_token is not null and lease_expires_at > clock_timestamp()
  ) then
    raise exception 'TL_SOCIAL_048_ACTIVE_LEASE';
  end if;
end
$$;

alter table public.touchline_club_social_posts
  drop constraint touchline_club_social_posts_content_type_check,
  add constraint touchline_club_social_posts_content_type_check check (content_type in (
    'LINEUP','MATCH_PREVIEW','FULL_TIME','GOAL_CONFIRMED','RED_CARD_CONFIRMED',
    'GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL','PLAYER_DUEL',
    'GAMEWEEK_HERO','TOP_PERFORMER','HAT_TRICK_HERO'
  ));

create or replace function public.touchline_social_045_expected_team_ids(p_draft_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare v_draft public.touchline_social_publication_drafts%rowtype; v_fixture public.football_fixtures%rowtype;
  v_fixture_teams text[]; v_event_team text; v_subject_team text; v_league_teams text[];
begin
  select * into v_draft from public.touchline_social_publication_drafts where id=p_draft_id;
  if not found or v_draft.content_type='FINAL_SCORE' then return null; end if;
  select * into v_fixture from public.football_fixtures
    where provider='sportmonks' and provider_fixture_id=v_draft.fixture_provider_id;
  if not found then return null; end if;
  select array_agg(team_id order by team_id::numeric) into v_fixture_teams from (
    select club.provider_team_id as team_id from public.football_clubs club where club.id=v_fixture.home_club_id and club.provider='sportmonks'
    union all
    select club.provider_team_id from public.football_clubs club where club.id=v_fixture.away_club_id and club.provider='sportmonks'
  ) teams;
  if coalesce(array_length(v_fixture_teams,1),0) <> 2 or v_fixture_teams[1]=v_fixture_teams[2] then return null; end if;
  if v_draft.content_type='LINEUP' then
    if not v_draft.team_provider_id=any(v_fixture_teams) then return null; end if;
    return array[v_draft.team_provider_id];
  elsif v_draft.content_type in ('MATCH_PREVIEW','FULL_TIME','GOAL_CONFIRMED','RED_CARD_CONFIRMED','PLAYER_DUEL') then
    return v_fixture_teams;
  elsif v_draft.content_type in ('GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL') then
    select array_agg(club.provider_team_id order by club.provider_team_id::numeric) into v_league_teams
    from public.football_clubs club where club.provider='sportmonks' and club.competition_id=v_fixture.competition_id;
    if coalesce(array_length(v_league_teams,1),0) <> 20 then return null; end if;
    return v_league_teams;
  elsif v_draft.content_type='HAT_TRICK_HERO' then
    select event.provider_team_id into v_event_team
    from public.football_fixture_events event
    where event.provider='sportmonks' and event.fixture_id=v_fixture.id
      and event.provider_event_id=v_draft.event_provider_id;
    if coalesce(v_event_team,'') !~ '^[1-9][0-9]{0,19}$'
       or not v_event_team=any(v_fixture_teams) then return null; end if;
    return array[v_event_team];
  elsif v_draft.content_type in ('GAMEWEEK_HERO','TOP_PERFORMER') then
    select club.provider_team_id into v_subject_team from public.football_players player
    join public.football_clubs club on club.id=player.current_club_id
    where player.provider='sportmonks' and player.provider_player_id=v_draft.subject_player_provider_id
      and club.provider='sportmonks' and club.competition_id=v_fixture.competition_id;
    if coalesce(v_subject_team,'') !~ '^[1-9][0-9]{0,19}$' then return null; end if;
    return array[v_subject_team];
  end if;
  return null;
end
$$;

revoke all on function public.touchline_social_045_expected_team_ids(uuid) from public,anon,authenticated;
grant execute on function public.touchline_social_045_expected_team_ids(uuid) to service_role;

commit;
