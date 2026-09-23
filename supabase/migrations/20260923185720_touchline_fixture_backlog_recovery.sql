-- Durable bounded recovery; provider traffic is owned by the existing live lease.
create table public.touchline_fixture_recovery (
  fixture_id uuid primary key references public.football_fixtures(id),
  claimed_run_id uuid references public.football_data_sync_runs(id),
  last_attempt_at timestamptz not null,
  next_attempt_at timestamptz not null,
  attempt_count integer not null check (attempt_count between 1 and 8),
  state text not null check (state in ('pending','recovered','needs_review')),
  last_error_code text check (last_error_code ~ '^[a-z0-9_-]{1,64}$'),
  last_success_at timestamptz,
  ingestion_ready boolean not null default false,
  ingestion_feed_synced_at timestamptz
);
alter table public.touchline_fixture_recovery enable row level security;
alter table public.touchline_fixture_recovery force row level security;
revoke all on public.touchline_fixture_recovery from public, anon, authenticated;
grant select, insert, update on public.touchline_fixture_recovery to service_role;
create index touchline_fixture_recovery_due_idx on public.touchline_fixture_recovery(next_attempt_at, fixture_id) where state = 'pending';

-- Same complete-sheet boundary as the application: 11 unique starters in
-- distinct slots and 9 distinct substitutes per participant, no overlap.
create function public.touchline_recovery_feed_complete(p_fixture jsonb, p_lineups jsonb, p_events jsonb, p_synced timestamptz)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_synced is not null
    and coalesce(p_fixture->>'status','') ~* '^(ft([_ -].*)?|full[ -]?time|finished|after extra time|aet|after penalties|penalties finished)$'
    and jsonb_typeof(p_events) = 'array'
    and jsonb_typeof(p_lineups) = 'array'
    and p_fixture->'homeTeam'->>'providerId' <> p_fixture->'awayTeam'->>'providerId'
    and not exists (
      select 1 from (values (p_fixture->'homeTeam'->>'providerId'), (p_fixture->'awayTeam'->>'providerId')) team(id)
      where team.id is null or team.id !~ '^[1-9][0-9]*$' or (
        select count(*) = 20 and count(distinct member->>'playerId') = 20
          and bool_and(coalesce(member->>'playerId','') ~ '^[1-9][0-9]*$')
          and count(*) filter(where member->>'isStarter' = 'true') = 11
          and count(distinct member->>'formationPosition') filter(where member->>'isStarter' = 'true'
            and member->>'formationPosition' ~ '^([1-9]|1[01])$') = 11
          and count(*) filter(where member->>'isSubstitute' = 'true' and member->>'isStarter' is distinct from 'true') = 9
        from jsonb_array_elements(case when jsonb_typeof(p_lineups) = 'array' then p_lineups else '[]'::jsonb end) member
        where member->>'teamId' = team.id
      ) is not true
    );
$$;
revoke all on function public.touchline_recovery_feed_complete(jsonb,jsonb,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.touchline_recovery_feed_complete(jsonb,jsonb,jsonb,timestamptz) to service_role;

create function public.touchline_claim_fixture_recovery(p_season_id uuid, p_run_id uuid, p_now timestamptz, p_exclude text[] default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_fixture public.football_fixtures%rowtype; v_attempt integer;
begin
  -- Serialize with lease acquisition and other claims, including crash recovery.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-live-sync:sportmonks:live_scores',0));
  if p_now is null or not exists(select 1 from public.football_data_sync_runs r where r.id=p_run_id
    and r.provider='sportmonks' and r.sync_type='live_scores' and r.status='running'
    and r.started_at between clock_timestamp()-interval '10 minutes' and clock_timestamp()) then raise exception 'RECOVERY_LEASE_REQUIRED'; end if;
  if not exists(select 1 from public.football_seasons s join public.football_competitions c on c.id=s.competition_id
    where s.id=p_season_id and s.provider='sportmonks' and s.is_current
    and c.provider='sportmonks' and c.provider_competition_id='8') then raise exception 'RECOVERY_SEASON_REQUIRED'; end if;
  if (select count(*) from public.touchline_fixture_recovery where claimed_run_id=p_run_id) >= 2 then return null; end if;
  -- A crash after attempt 8 is not silently treated as recovery.
  update public.touchline_fixture_recovery q set state='needs_review',last_error_code='attempt_limit'
  from public.football_fixtures f where q.fixture_id=f.id and f.season_id=p_season_id
    and q.state='pending' and q.attempt_count>=8 and q.next_attempt_at<=p_now;
  select f.* into v_fixture from public.football_fixtures f
  join public.football_seasons s on s.id=f.season_id
  join public.football_competitions c on c.id=f.competition_id
  left join public.football_fantasy_fixture_feeds feed on feed.provider=f.provider and feed.provider_fixture_id=f.provider_fixture_id
  left join public.touchline_fixture_recovery q on q.fixture_id=f.id
  where f.provider='sportmonks' and f.provider_fixture_id ~ '^[1-9][0-9]*$'
    and f.season_id=p_season_id and f.competition_id=s.competition_id and c.provider='sportmonks' and c.provider_competition_id='8'
    and f.starts_at < p_now-interval '4 hours' and not (f.provider_fixture_id=any(coalesce(p_exclude,'{}')))
    and (q.fixture_id is null or (q.state='pending' and q.next_attempt_at<=p_now and q.attempt_count<8))
    and not (coalesce(f.status,'') ~* '^(ft([_ -].*)?|full[ -]?time|finished|after extra time|aet|after penalties|penalties finished)$'
      and coalesce(feed.fixture_payload->>'provider','')='sportmonks'
      and feed.fixture_payload->>'providerId'=f.provider_fixture_id
      and coalesce(public.touchline_recovery_feed_complete(feed.fixture_payload,feed.lineups_payload,feed.events_payload,feed.last_synced_at),false))
  order by q.last_attempt_at nulls first, f.starts_at, f.id limit 1 for update of f skip locked;
  if v_fixture.id is null then return null; end if;
  insert into public.touchline_fixture_recovery(fixture_id,claimed_run_id,last_attempt_at,next_attempt_at,attempt_count,state,last_error_code)
    values(v_fixture.id,p_run_id,p_now,p_now+interval '10 minutes',1,'pending','claimed')
  on conflict(fixture_id) do update set claimed_run_id=p_run_id,last_attempt_at=p_now,
    next_attempt_at=p_now+interval '10 minutes',attempt_count=public.touchline_fixture_recovery.attempt_count+1,last_error_code='claimed',ingestion_ready=false
  returning attempt_count into v_attempt;
  return jsonb_build_object('fixtureId',v_fixture.id,'providerFixtureId',v_fixture.provider_fixture_id,'attemptCount',v_attempt,'status',coalesce(v_fixture.status,''));
end;
$$;

create function public.touchline_finish_fixture_recovery(p_fixture_id uuid,p_run_id uuid,p_now timestamptz,p_outcome text,p_error_code text,p_next_attempt_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-live-sync:sportmonks:live_scores',0));
  if not exists(select 1 from public.football_data_sync_runs r where r.id=p_run_id
    and r.provider='sportmonks' and r.sync_type='live_scores' and r.status='running'
    and r.started_at between clock_timestamp()-interval '10 minutes' and clock_timestamp()) then raise exception 'RECOVERY_LEASE_REQUIRED'; end if;
  if p_outcome not in ('pending','recovered','needs_review') or p_error_code !~ '^[a-z0-9_-]{1,64}$'
    or p_now is null or p_next_attempt_at is null or p_next_attempt_at<p_now then raise exception 'RECOVERY_OUTCOME_INVALID'; end if;
  if p_outcome='recovered' and not exists(select 1 from public.football_fixtures f where f.id=p_fixture_id
    and coalesce(f.status,'') ~* '^(ft([_ -].*)?|full[ -]?time|finished|after extra time|aet|after penalties|penalties finished)$')
    then raise exception 'RECOVERY_CANONICAL_STATE_PENDING'; end if;
  if p_outcome='recovered' and not exists(select 1 from public.touchline_fixture_recovery q
    join public.football_fixtures f on f.id=q.fixture_id
    join public.football_fantasy_fixture_feeds feed on feed.provider=f.provider and feed.provider_fixture_id=f.provider_fixture_id
    where q.fixture_id=p_fixture_id and q.claimed_run_id=p_run_id and q.ingestion_ready
      and q.ingestion_feed_synced_at=feed.last_synced_at
      and coalesce(public.touchline_recovery_feed_complete(feed.fixture_payload,feed.lineups_payload,feed.events_payload,feed.last_synced_at),false))
    then raise exception 'RECOVERY_INGESTION_PENDING'; end if;
  update public.touchline_fixture_recovery set
    state=case when p_outcome='pending' and attempt_count>=8 then 'needs_review' else p_outcome end,
    last_error_code=case when p_outcome='pending' and attempt_count>=8 then 'attempt_limit' else p_error_code end,
    next_attempt_at=p_next_attempt_at,
    last_success_at=case when p_outcome='recovered' then p_now else last_success_at end
  where fixture_id=p_fixture_id and claimed_run_id=p_run_id and state='pending';
  if not found then raise exception 'RECOVERY_CLAIM_LOST'; end if;
end;
$$;
revoke all on function public.touchline_claim_fixture_recovery(uuid,uuid,timestamptz,text[]) from public,anon,authenticated;
revoke all on function public.touchline_finish_fixture_recovery(uuid,uuid,timestamptz,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.touchline_claim_fixture_recovery(uuid,uuid,timestamptz,text[]) to service_role;
grant execute on function public.touchline_finish_fixture_recovery(uuid,uuid,timestamptz,text,text,timestamptz) to service_role;

-- Fence and feed write share one transaction/lock; a stale worker cannot
-- pass a separate check and then overwrite the feed after a new lease starts.
create function public.touchline_persist_recovery_feed(p_fixture_id uuid,p_run_id uuid,p_feed jsonb,p_shirt_facts jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_fixture public.football_fixtures%rowtype; v_season text; v_home text; v_away text; v_written_at timestamptz := clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-live-sync:sportmonks:live_scores',0));
  if not exists(select 1 from public.touchline_fixture_recovery q join public.football_data_sync_runs r on r.id=q.claimed_run_id
    where q.fixture_id=p_fixture_id and q.claimed_run_id=p_run_id and q.state='pending'
      and r.provider='sportmonks' and r.sync_type='live_scores' and r.status='running'
      and r.started_at between clock_timestamp()-interval '10 minutes' and clock_timestamp()) then raise exception 'RECOVERY_CLAIM_LOST'; end if;
  select * into strict v_fixture from public.football_fixtures where id=p_fixture_id;
  select s.provider_season_id into v_season from public.football_seasons s join public.football_competitions c on c.id=s.competition_id
    where s.id=v_fixture.season_id and s.is_current and s.provider='sportmonks'
      and c.id=v_fixture.competition_id and c.provider='sportmonks' and c.provider_competition_id='8';
  if v_season is null or (p_feed->'fixture'->>'provider') is distinct from 'sportmonks'
    or (p_feed->'fixture'->>'providerId') is distinct from v_fixture.provider_fixture_id
    or (p_feed->'fixture'->>'competitionId') is distinct from '8'
    or (p_feed->'fixture'->>'seasonId') is distinct from v_season
    or jsonb_typeof(p_feed->'lineups') is distinct from 'array'
    or jsonb_typeof(p_feed->'events') is distinct from 'array'
    or jsonb_typeof(p_feed->'formations') is distinct from 'array'
    or jsonb_typeof(p_feed->'sidelined') is distinct from 'array' then raise exception 'RECOVERY_FEED_IDENTITY'; end if;
  -- Bind the ordered participants to permanent canonical clubs before any
  -- replacement or reconciliation. Optional normalized team metadata is not
  -- required, but missing/unmapped identities must go to review, not scores.
  select c.provider_team_id into v_home from public.football_clubs c
    where c.id=v_fixture.home_club_id and c.provider='sportmonks';
  select c.provider_team_id into v_away from public.football_clubs c
    where c.id=v_fixture.away_club_id and c.provider='sportmonks';
  if nullif(btrim(v_home),'') is null or nullif(btrim(v_away),'') is null or v_home=v_away
    or (p_feed->'fixture'->'homeTeam'->>'providerId') is distinct from v_home
    or (p_feed->'fixture'->'awayTeam'->>'providerId') is distinct from v_away
    then raise exception 'RECOVERY_FEED_PARTICIPANTS'; end if;
  if coalesce(v_fixture.status,'') ~* '^(ft([_ -].*)?|full[ -]?time|finished|after extra time|aet|after penalties|penalties finished)$'
    and coalesce(p_feed->'fixture'->>'status','') !~* '^(ft([_ -].*)?|full[ -]?time|finished|after extra time|aet|after penalties|penalties finished)$'
    then raise exception 'RECOVERY_STATE_REGRESSION'; end if;
  -- Readiness belongs to this exact replacement, never a previous successful
  -- write in the same claim. Exceptions roll this reset back with the feed.
  update public.touchline_fixture_recovery set ingestion_ready=false,ingestion_feed_synced_at=null
    where fixture_id=p_fixture_id and claimed_run_id=p_run_id;
  insert into public.football_fantasy_fixture_feeds(provider,provider_fixture_id,fixture_payload,lineups_payload,events_payload,formations_payload,sidelined_payload,last_synced_at)
    values('sportmonks',v_fixture.provider_fixture_id,p_feed->'fixture',p_feed->'lineups',p_feed->'events',p_feed->'formations',p_feed->'sidelined',v_written_at)
    on conflict(provider,provider_fixture_id) do update set fixture_payload=excluded.fixture_payload,lineups_payload=excluded.lineups_payload,
      events_payload=excluded.events_payload,formations_payload=excluded.formations_payload,sidelined_payload=excluded.sidelined_payload,last_synced_at=excluded.last_synced_at;
  -- The bounded public schedule deliberately excludes these old fixtures.
  -- Persist their canonical final state here, inside the exact lease fence.
  if coalesce(p_feed->'fixture'->>'status','') ~* '^(ft([_ -].*)?|full[ -]?time|finished|after extra time|aet|after penalties|penalties finished)$' then
    update public.football_fixtures set status=p_feed->'fixture'->>'status',
      home_score=coalesce((p_feed->'fixture'->>'homeScore')::integer,home_score),
      away_score=coalesce((p_feed->'fixture'->>'awayScore')::integer,away_score),
      source_updated_at=v_written_at where id=p_fixture_id;
  end if;
  if jsonb_typeof(p_shirt_facts)='array' and jsonb_array_length(p_shirt_facts)=40
    and to_regprocedure('public.touchline_card_engine_reconcile_official_lineup_shirts(text,timestamp with time zone,jsonb)') is not null then
    perform public.touchline_card_engine_reconcile_official_lineup_shirts(v_fixture.provider_fixture_id,v_written_at,p_shirt_facts);
    update public.touchline_fixture_recovery set ingestion_feed_synced_at=v_written_at,ingestion_ready=coalesce(public.touchline_recovery_feed_complete(
      p_feed->'fixture',p_feed->'lineups',p_feed->'events',v_written_at),false) where fixture_id=p_fixture_id and claimed_run_id=p_run_id;
    return true;
  end if;
  -- Feed is retained; caller must route this to explicit review, never success.
  return false;
end;
$$;
revoke all on function public.touchline_persist_recovery_feed(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.touchline_persist_recovery_feed(uuid,uuid,jsonb,jsonb) to service_role;
