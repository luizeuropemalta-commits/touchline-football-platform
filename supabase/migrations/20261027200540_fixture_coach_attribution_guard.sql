-- Fixture-specific evidence and scoring. Installation never imports data,
-- modifies editorial identities/values/contracts, or activates a snapshot.
-- Existing normalized football_feed_revisions remain the attribution history.
-- This is an additive upgrade, not a bootstrap of the QA coach subsystem.
-- Prerequisites: QA013 contracts/immutable receipts; QA017 V2 unique key and
-- ranking tables; QA019 scoreable statuses; QA021 final statuses; QA037 the
-- approved points matrix; migration 20261026121254 observed feed history.
-- Those QA scripts are NOT imported/applied here. An incomplete installation
-- must stop before any ALTER and obtain a separately reviewed bootstrap.
do $$
declare v_dependency text;
begin
  foreach v_dependency in array array['football_competitions','football_seasons','football_clubs','football_fixtures',
    'football_fantasy_fixture_feeds','football_feed_revisions','touchline_coach_contracts','touchline_coach_fixture_points',
    'touchline_coach_ranking_snapshots','touchline_coach_ranking_active_snapshots'] loop
    if to_regclass('public.' || v_dependency) is null then
      raise exception using errcode='55000',message='TL_COACH_ATTRIBUTION_PREREQUISITE_MISSING',detail=v_dependency;
    end if;
  end loop;
  foreach v_dependency in array array['auth.jwt()','public.touchline_is_scoreable_fixture_status(text)',
    'public.touchline_is_final_fixture_status(text)','public.touchline_coach_points_v2(text,text)',
    'public.touchline_coach_final_points_are_immutable()','public.touchline_capture_feed_revision()',
    'public.touchline_protect_feed_revision()'] loop
    if to_regprocedure(v_dependency) is null then
      raise exception using errcode='55000',message='TL_COACH_ATTRIBUTION_PREREQUISITE_MISSING',detail=v_dependency;
    end if;
  end loop;
  if array[public.touchline_coach_points_v2('home','win'),public.touchline_coach_points_v2('home','draw'),
    public.touchline_coach_points_v2('home','loss'),public.touchline_coach_points_v2('away','win'),
    public.touchline_coach_points_v2('away','draw'),public.touchline_coach_points_v2('away','loss')]
      is distinct from array[3,1,-2,6,3,-1] then
    raise exception using errcode='55000',message='TL_COACH_ATTRIBUTION_PREREQUISITE_POINTS_MISMATCH';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.touchline_coach_fixture_points'::regclass
    and tgfoid='public.touchline_coach_final_points_are_immutable()'::regprocedure and not tgisinternal and tgenabled in ('O','A')) then
    raise exception using errcode='55000',message='TL_COACH_ATTRIBUTION_PREREQUISITE_IMMUTABILITY_MISSING';
  end if;
  if not exists (select 1 from pg_index index_row where index_row.indrelid='public.touchline_coach_fixture_points'::regclass
    and index_row.indisunique and index_row.indisvalid and index_row.indpred is null
    and (select array_agg(attribute.attname::text order by key.ordinality)
      from unnest(index_row.indkey) with ordinality key(attnum,ordinality)
      join pg_attribute attribute on attribute.attrelid=index_row.indrelid and attribute.attnum=key.attnum
      where key.ordinality<=index_row.indnkeyatts)=array['contract_id','fixture_id','scoring_version']) then
    raise exception using errcode='55000',message='TL_COACH_ATTRIBUTION_PREREQUISITE_V2_KEY_MISSING';
  end if;
end;
$$;
alter table public.touchline_coach_fixture_points
  add column source_feed_revision_id bigint references public.football_feed_revisions(id) on delete restrict,
  add column attribution_coach_provider_id text,
  add column attribution_checksum text;
alter table public.touchline_coach_ranking_snapshots
  add column attribution_revisions jsonb not null default '[]'::jsonb;
create index touchline_coach_contracts_provider_time_v2_idx
  on public.touchline_coach_contracts(coach_provider_id,started_at,ended_at)
  where scoring_version='coach_scoring_v2';

create function public.touchline_read_fixture_coach_evidence(p_fixture_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_fixture record;
  v_feed public.football_fantasy_fixture_feeds%rowtype;
  v_revision public.football_feed_revisions%rowtype;
  v_attribution jsonb;
  v_assignment jsonb;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;
  select fixture.*, competition.provider as competition_provider,
    competition.provider_competition_id, season.provider_season_id,
    home.provider as home_provider, home.provider_team_id as home_provider_id,
    away.provider as away_provider, away.provider_team_id as away_provider_id
  into v_fixture from public.football_fixtures fixture
  left join public.football_competitions competition on competition.id = fixture.competition_id
  left join public.football_seasons season on season.id = fixture.season_id and season.competition_id = fixture.competition_id
  left join public.football_clubs home on home.id = fixture.home_club_id
  left join public.football_clubs away on away.id = fixture.away_club_id
  where fixture.id = p_fixture_id for share of fixture;
  if v_fixture.id is null then
    raise exception using errcode = 'PCC01', message = 'TL_COACH_FIXTURE_EVIDENCE_MISSING';
  end if;
    select * into v_feed from public.football_fantasy_fixture_feeds
      where provider = v_fixture.provider and provider_fixture_id = v_fixture.provider_fixture_id for share;
    select * into v_revision from public.football_feed_revisions
      where feed_id = v_feed.id order by id desc limit 1;
    if v_feed.id is null or v_revision.id is null or v_revision.origin <> 'observed_import'
      or v_revision.source_synced_at > clock_timestamp()
      or v_revision.provider is distinct from v_fixture.provider
      or v_revision.provider_fixture_id is distinct from v_fixture.provider_fixture_id
      or v_revision.payload is distinct from jsonb_build_object('fixture', v_feed.fixture_payload,
        'lineups', v_feed.lineups_payload, 'formations', v_feed.formations_payload,
        'sidelined', v_feed.sidelined_payload, 'events', v_feed.events_payload) then
      raise exception using errcode = 'PCC01', message = 'TL_COACH_FIXTURE_EVIDENCE_MISSING';
    end if;
    v_attribution := v_revision.payload->'fixture'->'coachAttribution';
    if v_attribution->>'status' is distinct from 'complete'
      or v_attribution->>'source' is distinct from 'sportmonks.fixture.coaches'
      or jsonb_typeof(v_attribution->'assignments') is distinct from 'array' then
      raise exception using errcode = 'PCC02', message = 'TL_COACH_FIXTURE_EVIDENCE_INVALID';
    end if;
    if jsonb_array_length(v_attribution->'assignments') <> 2
      or (select count(distinct item->>'coachProviderId') from jsonb_array_elements(v_attribution->'assignments') item) <> 2
      or (select count(distinct item->>'clubProviderId') from jsonb_array_elements(v_attribution->'assignments') item) <> 2
      or (select count(distinct item->>'location') from jsonb_array_elements(v_attribution->'assignments') item
          where item->>'location' in ('home','away')) <> 2 then
      raise exception using errcode = 'PCC02', message = 'TL_COACH_FIXTURE_EVIDENCE_INVALID';
    end if;
    if v_fixture.provider <> 'sportmonks' or v_fixture.competition_provider is distinct from 'sportmonks'
      or v_fixture.provider_competition_id is distinct from '8'
      or v_fixture.home_provider is distinct from 'sportmonks' or v_fixture.away_provider is distinct from 'sportmonks'
      or coalesce(v_fixture.provider_fixture_id,'') !~ '^[1-9][0-9]{0,15}$'
      or coalesce(v_fixture.provider_competition_id,'') !~ '^[1-9][0-9]{0,15}$'
      or coalesce(v_fixture.provider_season_id,'') !~ '^[1-9][0-9]{0,15}$'
      or v_attribution->>'fixtureProviderId' is distinct from v_fixture.provider_fixture_id
      or v_attribution->>'competitionProviderId' is distinct from v_fixture.provider_competition_id
      or v_attribution->>'seasonProviderId' is distinct from v_fixture.provider_season_id
      or v_feed.fixture_payload->>'provider' is distinct from 'sportmonks'
      or v_feed.fixture_payload->>'providerId' is distinct from v_fixture.provider_fixture_id
      or v_feed.fixture_payload->>'competitionId' is distinct from v_fixture.provider_competition_id
      or v_feed.fixture_payload->>'seasonId' is distinct from v_fixture.provider_season_id
      or v_feed.fixture_payload->>'status' is distinct from v_fixture.status
      or v_feed.fixture_payload->'homeTeam'->>'providerId' is distinct from v_fixture.home_provider_id
      or v_feed.fixture_payload->'awayTeam'->>'providerId' is distinct from v_fixture.away_provider_id
      or v_feed.fixture_payload->'homeScore' is distinct from to_jsonb(v_fixture.home_score)
      or v_feed.fixture_payload->'awayScore' is distinct from to_jsonb(v_fixture.away_score) then
      raise exception using errcode = 'PCC03', message = 'TL_COACH_FIXTURE_IDENTITY_MISMATCH';
    end if;
    begin
      if v_fixture.starts_at is null or (v_feed.fixture_payload->>'startsAt')::timestamptz is distinct from v_fixture.starts_at then
        raise exception using errcode='PCC03', message='TL_COACH_FIXTURE_IDENTITY_MISMATCH';
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='PCC03', message='TL_COACH_FIXTURE_IDENTITY_MISMATCH';
    end;
    for v_assignment in select value from jsonb_array_elements(v_attribution->'assignments') loop
      if coalesce(v_assignment->>'coachProviderId','') !~ '^[1-9][0-9]{0,15}$'
        or coalesce(v_assignment->>'clubProviderId','') !~ '^[1-9][0-9]{0,15}$'
        or v_assignment->>'clubProviderId' is distinct from (case v_assignment->>'location'
          when 'home' then v_fixture.home_provider_id when 'away' then v_fixture.away_provider_id end) then
        raise exception using errcode = 'PCC03', message = 'TL_COACH_FIXTURE_IDENTITY_MISMATCH';
      end if;
    end loop;
  return jsonb_build_object('assignments', v_attribution->'assignments',
    'sourceRevisionId', v_revision.id, 'checksum', md5(v_revision.payload::text));
end;
$$;
revoke all on function public.touchline_read_fixture_coach_evidence(uuid) from public, anon, authenticated;
grant execute on function public.touchline_read_fixture_coach_evidence(uuid) to service_role;

-- One bounded server-side read, never a provider request. A future fixture
-- without a verified provisional receipt has no claimed current context.
create function public.touchline_read_verified_coach_current_fixture(p_contract_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_contract public.touchline_coach_contracts%rowtype;
  v_candidate record;
  v_evidence jsonb;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception using errcode='42501', message='TL_COACH_ADMIN_REQUIRED';
  end if;
  select * into v_contract from public.touchline_coach_contracts
    where id=p_contract_id and ended_at is null and scoring_version='coach_scoring_v2';
  if not found then return null; end if;
  for v_candidate in
    select fixture.*, points.fixture_context, points.source_feed_revision_id,
      points.attribution_checksum, points.touchline_points
    from public.touchline_coach_fixture_points points
    join public.football_fixtures fixture on fixture.id=points.fixture_id
    join public.football_competitions competition on competition.id=fixture.competition_id
    where points.contract_id=p_contract_id and points.scoring_version='coach_scoring_v2'
      and points.settlement_status='provisional' and points.attribution_coach_provider_id=v_contract.coach_provider_id
      and points.source_feed_revision_id is not null and points.attribution_checksum is not null
      and competition.provider='sportmonks' and competition.provider_competition_id='8'
      and fixture.starts_at>=greatest(v_contract.started_at,clock_timestamp()-interval '4 hours')
      and public.touchline_is_scoreable_fixture_status(fixture.status)
      and not public.touchline_is_final_fixture_status(fixture.status)
    order by fixture.starts_at,fixture.id limit 6
  loop
    begin
      v_evidence := public.touchline_read_fixture_coach_evidence(v_candidate.id);
      if (v_evidence->>'sourceRevisionId')::bigint=v_candidate.source_feed_revision_id
        and v_evidence->>'checksum'=v_candidate.attribution_checksum
        and exists (select 1 from jsonb_array_elements(v_evidence->'assignments') assignment
          where assignment->>'coachProviderId'=v_contract.coach_provider_id and assignment->>'location'=v_candidate.fixture_context)
        and exists (select 1 from public.touchline_coach_contracts current_contract where current_contract.id=p_contract_id
          and current_contract.coach_provider_id=v_contract.coach_provider_id and current_contract.ended_at is null
          and current_contract.scoring_version='coach_scoring_v2' and v_candidate.starts_at>=current_contract.started_at) then
        return jsonb_build_object('id',v_candidate.id,'provider_fixture_id',v_candidate.provider_fixture_id,
          'contractId',p_contract_id,'coachProviderId',v_contract.coach_provider_id,'context',v_candidate.fixture_context,
          'status',v_candidate.status,'starts_at',v_candidate.starts_at,'provisionalPoints',v_candidate.touchline_points,
          'sourceRevisionId',v_candidate.source_feed_revision_id,'checksum',v_candidate.attribution_checksum);
      end if;
    exception when sqlstate 'PCC01' or sqlstate 'PCC02' or sqlstate 'PCC03' then
      continue;
    end;
  end loop;
  return null;
end;
$$;
revoke all on function public.touchline_read_verified_coach_current_fixture(uuid) from public, anon, authenticated;
grant execute on function public.touchline_read_verified_coach_current_fixture(uuid) to service_role;

create function public.touchline_reconcile_verified_coach_fixture_points(
  p_fixture_id uuid default null, p_competition_coaches jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_season_id uuid;
  v_current_seasons integer;
  v_fixture record;
  v_evidence jsonb;
  v_assignment jsonb;
  v_club_id uuid;
  v_club_name text;
  v_context text;
  v_outcome text;
  v_points integer;
  v_settlement text;
  v_written integer;
  v_fixture_written integer;
  v_reconciled integer := 0;
  v_checked integer := 0;
  v_fixture_results jsonb;
  v_results jsonb := '[]';
  v_pending jsonb := '[]';
  v_revisions jsonb := '[]';
  v_fixture_ids jsonb := '[]';
  v_payload jsonb;
  v_unknown_coaches jsonb;
  v_checksum text;
  v_snapshot_id text;
  v_ranking jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'TL_COACH_ADMIN_REQUIRED';
  end if;
  if jsonb_typeof(p_competition_coaches) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'TL_COACH_CATALOGUE_INVALID';
  end if;
  select count(*), (array_agg(season.id))[1] into v_current_seasons, v_season_id
  from public.football_seasons season
  join public.football_competitions competition on competition.id = season.competition_id
  where season.is_current and competition.provider = 'sportmonks' and competition.provider_competition_id = '8';
  if v_current_seasons <> 1 then
    return jsonb_build_object('ok',false,'reconciled',0,'pending','[]'::jsonb,
      'ranking',jsonb_build_object('ok',false,'reason','season-unavailable'));
  end if;
  -- Serialize only this reconciler, not six whole tables. Row locks keep each
  -- consumed fixture/feed/contract stable; unrelated ingestion can continue.
  perform pg_advisory_xact_lock(hashtextextended('touchline-fixture-coaches:' || v_season_id::text, 0));
  for v_fixture in
    select fixture.* from public.football_fixtures fixture
    join public.football_competitions competition on competition.id=fixture.competition_id
    where competition.provider='sportmonks' and competition.provider_competition_id='8'
      and public.touchline_is_scoreable_fixture_status(fixture.status)
      and fixture.home_score is not null and fixture.away_score is not null
      and (fixture.season_id = v_season_id or exists (
        select 1 from public.touchline_coach_contracts contract
        where contract.scoring_version='coach_scoring_v2'
          and (p_fixture_id is null or fixture.id=p_fixture_id)
          and fixture.starts_at >= contract.started_at
          and (contract.ended_at is null or fixture.starts_at < contract.ended_at)
          and (contract.club_id in (fixture.home_club_id,fixture.away_club_id) or exists (
            -- Discovery hint only: the locked revision is verified below.
            select 1 from public.football_fantasy_fixture_feeds feed
            where feed.provider=fixture.provider and feed.provider_fixture_id=fixture.provider_fixture_id
              and feed.fixture_payload#>'{coachAttribution,assignments}' @>
                jsonb_build_array(jsonb_build_object('coachProviderId',contract.coach_provider_id))
          ))
      )) order by fixture.id for share of fixture
  loop
    -- Known evidence failures isolate one fixture. Infrastructure/SQL failures
    -- still abort atomically; never report uncertain writes as committed.
    begin
      v_fixture_written := 0;
      v_fixture_results := '[]';
      v_evidence := public.touchline_read_fixture_coach_evidence(v_fixture.id);
      perform 1 from public.touchline_coach_contracts contract
        where contract.scoring_version='coach_scoring_v2' and (
          (contract.coach_provider_id in (select item->>'coachProviderId' from jsonb_array_elements(v_evidence->'assignments') item)
            and v_fixture.starts_at>=contract.started_at and (contract.ended_at is null or v_fixture.starts_at<contract.ended_at))
          or exists (select 1 from public.touchline_coach_fixture_points points
            where points.contract_id=contract.id and points.fixture_id=v_fixture.id)
        ) order by contract.id for share;
      for v_assignment in select value from jsonb_array_elements(v_evidence->'assignments') loop
        v_context := v_assignment->>'location';
        v_club_id := case v_context when 'home' then v_fixture.home_club_id else v_fixture.away_club_id end;
        select name into v_club_name from public.football_clubs where id=v_club_id;
        v_outcome := case when v_fixture.home_score=v_fixture.away_score then 'draw'
          when (v_context='home' and v_fixture.home_score>v_fixture.away_score)
            or (v_context='away' and v_fixture.away_score>v_fixture.home_score) then 'win' else 'loss' end;
        v_points := public.touchline_coach_points_v2(v_context,v_outcome);
        if v_points is null then raise exception 'TL_COACH_CANONICAL_POINTS_UNAVAILABLE'; end if;
        v_settlement := case when public.touchline_is_final_fixture_status(v_fixture.status) then 'final' else 'provisional' end;
        -- Immutable final receipts are never reassigned or rewritten, including
        -- legacy receipts that predate attribution columns. Surface review for
        -- this fixture only while other verified fixtures continue to settle.
        if exists (
          select 1 from public.touchline_coach_fixture_points points
          join public.touchline_coach_contracts contract on contract.id=points.contract_id
          where points.fixture_id=v_fixture.id and points.scoring_version='coach_scoring_v2'
            and points.fixture_context=v_context
            and (contract.coach_provider_id is distinct from v_assignment->>'coachProviderId'
              or v_fixture.starts_at<contract.started_at or (contract.ended_at is not null and v_fixture.starts_at>=contract.ended_at)
              or points.attribution_coach_provider_id is not null and points.attribution_coach_provider_id is distinct from v_assignment->>'coachProviderId'
              or points.settlement_status='final' and (points.fixture_context is distinct from v_context or points.outcome is distinct from v_outcome
              or points.home_score is distinct from v_fixture.home_score or points.away_score is distinct from v_fixture.away_score
              or points.touchline_points is distinct from v_points))
        ) then raise exception using errcode='PCC05',message='TL_COACH_HISTORICAL_SETTLEMENT_REVIEW_REQUIRED'; end if;
        if p_fixture_id is null or p_fixture_id=v_fixture.id then
          insert into public.touchline_coach_fixture_points(contract_id,fixture_id,fixture_context,outcome,home_score,away_score,
            touchline_points,settlement_status,scoring_version,provider_source_updated_at,settled_at,updated_at,
            source_feed_revision_id,attribution_coach_provider_id,attribution_checksum)
          select contract.id,v_fixture.id,v_context,v_outcome,v_fixture.home_score,v_fixture.away_score,
            v_points,v_settlement,'coach_scoring_v2',v_fixture.source_updated_at,
            case when v_settlement='final' then v_now end,v_now,
            (v_evidence->>'sourceRevisionId')::bigint,v_assignment->>'coachProviderId',v_evidence->>'checksum'
          from public.touchline_coach_contracts contract
          -- club_id records the purchase; the coach follows their own matches.
          where contract.coach_provider_id=v_assignment->>'coachProviderId'
            and contract.scoring_version='coach_scoring_v2' and v_fixture.starts_at>=contract.started_at
            and (contract.ended_at is null or v_fixture.starts_at<contract.ended_at)
          on conflict(contract_id,fixture_id,scoring_version) do update set
            fixture_context=excluded.fixture_context,outcome=excluded.outcome,home_score=excluded.home_score,away_score=excluded.away_score,
            touchline_points=excluded.touchline_points,settlement_status=excluded.settlement_status,
            provider_source_updated_at=excluded.provider_source_updated_at,settled_at=excluded.settled_at,updated_at=excluded.updated_at,
            source_feed_revision_id=excluded.source_feed_revision_id,attribution_coach_provider_id=excluded.attribution_coach_provider_id,
            attribution_checksum=excluded.attribution_checksum
          where touchline_coach_fixture_points.settlement_status<>'final' and row(
            touchline_coach_fixture_points.fixture_context,touchline_coach_fixture_points.outcome,touchline_coach_fixture_points.home_score,
            touchline_coach_fixture_points.away_score,touchline_coach_fixture_points.touchline_points,touchline_coach_fixture_points.settlement_status,
            touchline_coach_fixture_points.attribution_coach_provider_id,touchline_coach_fixture_points.attribution_checksum,
            touchline_coach_fixture_points.source_feed_revision_id
          ) is distinct from row(excluded.fixture_context,excluded.outcome,excluded.home_score,excluded.away_score,excluded.touchline_points,
            excluded.settlement_status,excluded.attribution_coach_provider_id,excluded.attribution_checksum,excluded.source_feed_revision_id);
          get diagnostics v_written=row_count;
          v_fixture_written := v_fixture_written+v_written;
        end if;
        if v_fixture.season_id=v_season_id then
          v_fixture_results := v_fixture_results || jsonb_build_array(jsonb_build_object(
            'coach',v_assignment->>'coachProviderId','club',v_club_name,'context',v_context,'outcome',v_outcome,
            'points',v_points,'fixture',v_fixture.provider_fixture_id,'startsAt',v_fixture.starts_at));
        end if;
      end loop;
      v_reconciled := v_reconciled+v_fixture_written;
      v_checked := v_checked+1;
      v_results := v_results || v_fixture_results;
      if v_fixture.season_id=v_season_id then
        v_fixture_ids := v_fixture_ids || to_jsonb(v_fixture.provider_fixture_id);
        v_revisions := v_revisions || jsonb_build_array(jsonb_build_object('fixtureProviderId',v_fixture.provider_fixture_id,
          'sourceRevisionId',v_evidence->'sourceRevisionId','checksum',v_evidence->>'checksum'));
      end if;
    exception when sqlstate 'PCC01' or sqlstate 'PCC02' or sqlstate 'PCC03' or sqlstate 'PCC05' then
      v_pending := v_pending || jsonb_build_array(jsonb_build_object('fixtureProviderId',v_fixture.provider_fixture_id,'reason',sqlstate));
    end;
  end loop;

  -- Catalogue IDs permit presentation only. All nonzero results come from the
  -- fixture's own coach. A manager who changed clubs remains one historical ID.
  with results as (
    select * from jsonb_to_recordset(v_results) as r(coach text,club text,context text,outcome text,points integer,fixture text,"startsAt" timestamptz)
  ), identities as (
    select coach from results union select item->>'coach_provider_id' from jsonb_array_elements(p_competition_coaches) item
      where coalesce(item->>'coach_provider_id','') ~ '^[1-9][0-9]{0,15}$'
  ), totals as (
    select identity.coach,
      coalesce((select r.club from results r where r.coach=identity.coach order by r."startsAt" desc,r.fixture desc limit 1),
        (select club.name from jsonb_array_elements(p_competition_coaches) item join public.football_clubs club
          on club.provider='sportmonks' and club.provider_team_id=item->>'club_provider_id'
          where item->>'coach_provider_id'=identity.coach order by club.provider_team_id limit 1)) as club,
      coalesce(sum(r.points),0)::integer as points,
      count(*) filter(where r.outcome='win')::integer as wins,count(*) filter(where r.outcome='draw')::integer as draws,
      count(*) filter(where r.outcome='loss')::integer as losses,
      count(*) filter(where r.context='away' and r.outcome='win')::integer as away_wins,
      jsonb_build_object('wins',count(*) filter(where r.context='home' and r.outcome='win'),
        'draws',count(*) filter(where r.context='home' and r.outcome='draw'),'losses',count(*) filter(where r.context='home' and r.outcome='loss'),
        'touchlinePoints',coalesce(sum(r.points) filter(where r.context='home'),0)) as home,
      jsonb_build_object('wins',count(*) filter(where r.context='away' and r.outcome='win'),
        'draws',count(*) filter(where r.context='away' and r.outcome='draw'),'losses',count(*) filter(where r.context='away' and r.outcome='loss'),
        'touchlinePoints',coalesce(sum(r.points) filter(where r.context='away'),0)) as away
    from identities identity left join results r on r.coach=identity.coach group by identity.coach
  ), ranked as (select *,row_number() over(order by points desc,wins desc,away_wins desc,coach) as rank from totals)
  select coalesce(jsonb_agg(jsonb_build_object('rank',rank,'coachProviderId',coach,'clubName',club,'touchlinePoints',points,
    'wins',wins,'draws',draws,'losses',losses,'awayWins',away_wins,'home',home,'away',away,
    'tiebreaker','points,wins,awayWins,coachProviderId') order by rank),'[]'::jsonb) into v_payload from ranked;
  select coalesce(jsonb_agg(coach order by coach),'[]'::jsonb) into v_unknown_coaches from (
    select distinct item->>'coachProviderId' coach from jsonb_array_elements(v_payload) item
    where not exists(select 1 from jsonb_array_elements(p_competition_coaches) known where known->>'coach_provider_id'=item->>'coachProviderId')
  ) unknown_coaches;
  v_checksum := md5(v_season_id::text || ':coach_scoring_v2:fixture-attribution:' || v_fixture_ids::text || v_payload::text || v_revisions::text);
  v_snapshot_id := 'coach-v2:' || v_season_id::text || ':' || v_checksum;
  -- Private immutable candidate; incomplete/unknown identity never replaces the
  -- active public pointer. Verified contract settlements above remain committed.
  insert into public.touchline_coach_ranking_snapshots(snapshot_id,league_key,season_id,scoring_version,fixture_ids,
    generated_at,checksum,ranking_payload,attribution_revisions)
  values(v_snapshot_id,'touchline-england',v_season_id,'coach_scoring_v2',v_fixture_ids,v_now,v_checksum,v_payload,v_revisions)
  on conflict(snapshot_id) do nothing;
  if jsonb_array_length(v_pending)>0 then
    v_ranking := jsonb_build_object('ok',false,'reason','fixture-attribution-pending','snapshotId',v_snapshot_id);
  elsif jsonb_array_length(v_unknown_coaches)>0 then
    v_ranking := jsonb_build_object('ok',false,'reason','coach-editorial-identity-pending','snapshotId',v_snapshot_id,'pendingCoachIds',v_unknown_coaches);
  elsif jsonb_array_length(v_fixture_ids)=0 or jsonb_array_length(v_payload)=0 or exists(select 1 from jsonb_array_elements(v_payload) r where r->>'clubName' is null) then
    v_ranking := jsonb_build_object('ok',false,'reason','fixture-results-unavailable','snapshotId',v_snapshot_id);
  else
    insert into public.touchline_coach_ranking_active_snapshots(league_key,snapshot_id,activated_at,updated_at)
    values('touchline-england',v_snapshot_id,v_now,v_now)
    on conflict(league_key) do update set snapshot_id=excluded.snapshot_id,activated_at=excluded.activated_at,updated_at=excluded.updated_at
    where touchline_coach_ranking_active_snapshots.snapshot_id is distinct from excluded.snapshot_id;
    v_ranking := jsonb_build_object('ok',true,'snapshotId',v_snapshot_id,'checksum',v_checksum,
      'fixtures',jsonb_array_length(v_fixture_ids),'rows',jsonb_array_length(v_payload));
  end if;
  return jsonb_build_object('ok',v_ranking->>'ok'='true','reconciled',v_reconciled,'attributionFixturesChecked',v_checked,
    'scoringVersion','coach_scoring_v2','pending',v_pending,'ranking',v_ranking);
end;
$$;
revoke all on function public.touchline_reconcile_verified_coach_fixture_points(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.touchline_reconcile_verified_coach_fixture_points(uuid,jsonb) to service_role;
comment on function public.touchline_reconcile_verified_coach_fixture_points(uuid,jsonb) is
  'Fixture-aware V2 settlement and private ranking candidates. Missing/ambiguous/history-conflicting fixtures remain pending independently; known complete candidates may replace the active snapshot. Current catalogue never supplies historical assignments. No HTTP, contract, value or editorial mutation.';
