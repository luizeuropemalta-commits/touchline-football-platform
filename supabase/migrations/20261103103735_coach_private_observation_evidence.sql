-- Private names bound to an acknowledged import. No activation, publication,
-- current appointment, contract or scoring changes are performed here.
begin;
set local lock_timeout='5s';

alter table touchline_coaches_private.observations
  add column source_feed_revision_id bigint references public.football_feed_revisions(id) on delete restrict;

alter table touchline_coaches_private.candidates add column evidence_observed_at timestamptz;

create function touchline_coaches_private.stage_fixture_v2(
  p_fixture_id text,p_feed_id uuid,p_synced_at timestamptz,p_expected jsonb,p_projection jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare
  feed public.football_fantasy_fixture_feeds%rowtype;
  revision public.football_feed_revisions%rowtype;
  attribution jsonb; identity jsonb; assignment jsonb; clean jsonb:='[]';
  club uuid; obs uuid; label text; fingerprint text; staged integer:=0;
begin
  perform touchline_coaches_private.assert_editorial();
  -- Serialize candidate refreshes across fixtures; a replay cannot restore an
  -- older approval or split the pair of observations between transactions.
  perform pg_advisory_xact_lock(hashtextextended('touchline-coach-evidence',0));
  select * into feed from public.football_fantasy_fixture_feeds
    where id=p_feed_id and provider='sportmonks' and provider_fixture_id=p_fixture_id for share;
  if feed.id is null or feed.last_synced_at is distinct from p_synced_at
    or p_synced_at is null or p_synced_at>clock_timestamp()
    or p_expected is distinct from jsonb_build_object('fixture',feed.fixture_payload,
      'lineups',feed.lineups_payload,'formations',feed.formations_payload,
      'sidelined',feed.sidelined_payload,'events',feed.events_payload) then
    raise exception 'COACH_FEED_RECEIPT_MISMATCH' using errcode='22023';
  end if;
  select * into revision from public.football_feed_revisions where feed_id=feed.id order by id desc limit 1;
  if revision.id is null or revision.origin not in ('observed_import','existing_baseline')
    or (revision.origin='existing_baseline' and revision.source_synced_at>=p_synced_at)
    or revision.provider is distinct from 'sportmonks' or revision.provider_fixture_id is distinct from p_fixture_id
    or revision.source_synced_at>p_synced_at or revision.payload is distinct from p_expected then
    raise exception 'COACH_FEED_REVISION_MISMATCH' using errcode='22023';
  end if;
  attribution:=feed.fixture_payload->'coachAttribution';
  if feed.fixture_payload->>'provider' is distinct from 'sportmonks'
    or feed.fixture_payload->>'providerId' is distinct from p_fixture_id
    or feed.fixture_payload->>'competitionId' is distinct from '8'
    or attribution->>'status' is distinct from 'complete'
    or attribution->>'source' is distinct from 'sportmonks.fixture.coaches'
    or attribution->>'fixtureProviderId' is distinct from p_fixture_id
    or attribution->>'competitionProviderId' is distinct from '8'
    or attribution->>'seasonProviderId' is distinct from feed.fixture_payload->>'seasonId'
    or jsonb_typeof(attribution->'assignments') is distinct from 'array' then
    raise exception 'COACH_EVIDENCE_INVALID' using errcode='22023';
  end if;
  if jsonb_array_length(attribution->'assignments')<>2
    or jsonb_typeof(p_projection) is distinct from 'object'
    or (p_projection-array['version','source','fixtureProviderId','competitionProviderId','seasonProviderId','identities'])<>'{}'
    or p_projection->'version' is distinct from '1'::jsonb
    or p_projection->>'source' is distinct from attribution->>'source'
    or p_projection->>'fixtureProviderId' is distinct from p_fixture_id
    or p_projection->>'competitionProviderId' is distinct from '8'
    or p_projection->>'seasonProviderId' is distinct from attribution->>'seasonProviderId'
    or jsonb_typeof(p_projection->'identities') is distinct from 'array' then
    raise exception 'COACH_PROJECTION_INVALID' using errcode='22023';
  end if;
  if jsonb_array_length(p_projection->'identities')<>2
    or (select count(distinct a->>'coachProviderId') from jsonb_array_elements(attribution->'assignments') a)<>2
    or (select count(distinct a->>'clubProviderId') from jsonb_array_elements(attribution->'assignments') a)<>2
    or (select count(distinct a->>'location') from jsonb_array_elements(attribution->'assignments') a where a->>'location' in ('home','away'))<>2 then
    raise exception 'COACH_PROJECTION_INVALID' using errcode='22023';
  end if;
  -- Validate the complete pair before inserting either observation.
  for assignment in select a from jsonb_array_elements(attribution->'assignments') a order by a->>'location' loop
    if coalesce(assignment->>'coachProviderId','') !~ '^[1-9][0-9]{0,15}$'
      or coalesce(assignment->>'clubProviderId','') !~ '^[1-9][0-9]{0,15}$'
      or assignment->>'clubProviderId' is distinct from (case assignment->>'location'
        when 'home' then feed.fixture_payload#>>'{homeTeam,providerId}'
        when 'away' then feed.fixture_payload#>>'{awayTeam,providerId}' end)
      or (select count(*) from jsonb_array_elements(p_projection->'identities') i
        where i->>'coachProviderId'=assignment->>'coachProviderId'
          and i->>'clubProviderId'=assignment->>'clubProviderId' and i->>'location'=assignment->>'location')<>1 then
      raise exception 'COACH_PROJECTION_IDENTITY_MISMATCH' using errcode='22023';
    end if;
    select i into identity from jsonb_array_elements(p_projection->'identities') i
      where i->>'coachProviderId'=assignment->>'coachProviderId';
    if jsonb_typeof(identity) is distinct from 'object'
      or (identity-array['coachProviderId','clubProviderId','location','displayName'])<>'{}'
      or not (identity?'displayName') or jsonb_typeof(identity->'displayName') not in ('string','null') then
      raise exception 'COACH_PROJECTION_INVALID' using errcode='22023';
    end if;
    label:=identity->>'displayName';
    if label is not null and (char_length(label) not between 1 and 120 or label<>btrim(label)
      or label ~ '[[:cntrl:]<>@]' or label !~ '[[:alpha:]]'
      or label ~* '://|www\.|^coach[[:space:]]+[0-9]+$|api[_-]?token|sportmonks[.]com') then
      raise exception 'COACH_PROJECTION_NAME_INVALID' using errcode='22023';
    end if;
    clean:=clean||jsonb_build_array(jsonb_build_object('coachProviderId',identity->>'coachProviderId',
      'clubProviderId',identity->>'clubProviderId','location',identity->>'location','displayName',label));
  end loop;
  if not exists(select 1 from public.football_fixtures f
    join public.football_seasons s on s.id=f.season_id and s.competition_id=f.competition_id
    join public.football_competitions c on c.id=f.competition_id
    join public.football_clubs h on h.id=f.home_club_id
    join public.football_clubs a on a.id=f.away_club_id
    where f.provider='sportmonks' and f.provider_fixture_id=p_fixture_id
      and c.provider='sportmonks' and c.provider_competition_id='8'
      and s.provider='sportmonks' and s.provider_season_id=attribution->>'seasonProviderId'
      and h.provider='sportmonks' and h.provider_team_id=feed.fixture_payload#>>'{homeTeam,providerId}'
      and a.provider='sportmonks' and a.provider_team_id=feed.fixture_payload#>>'{awayTeam,providerId}') then
    raise exception 'COACH_CANONICAL_IDENTITY_MISMATCH' using errcode='22023';
  end if;
  -- Only this explicit ingestion boundary may attest a fresh identical import
  -- after a legacy baseline. A timestamp-only update never promotes evidence.
  -- The original baseline remains immutable, and the insert rolls back with
  -- the editorial transaction if either observation cannot be staged.
  if revision.origin='existing_baseline' then
    insert into public.football_feed_revisions(feed_id,provider,provider_fixture_id,origin,source_synced_at,payload)
      values(feed.id,'sportmonks',p_fixture_id,'observed_import',p_synced_at,p_expected)
      returning * into revision;
  end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('revisionId',revision.id,'identities',clean)::text,'UTF8')),'hex');
  for identity in select i from jsonb_array_elements(clean) i loop
    select c.id into strict club from public.football_clubs c join public.football_competitions l on l.id=c.competition_id
      where c.provider='sportmonks' and c.provider_team_id=identity->>'clubProviderId'
        and l.provider='sportmonks' and l.provider_competition_id='8';
    label:=identity->>'displayName';
    insert into touchline_coaches_private.observations(provider_id,club_id,team_id,source_kind,source_id,source_hash,
      observed_at,fixture_at,display_name,source_feed_revision_id)
      values(identity->>'coachProviderId',club,identity->>'clubProviderId','sportmonks.fixture.coaches',p_fixture_id,
        fingerprint,p_synced_at,nullif(feed.fixture_payload->>'startsAt','')::timestamptz,label,revision.id)
      on conflict(provider_id,team_id,source_hash) do nothing;
    select id into obs from touchline_coaches_private.observations where provider_id=identity->>'coachProviderId'
      and team_id=identity->>'clubProviderId' and source_hash=fingerprint;
    if exists(select 1 from touchline_coaches_private.current_assignments ca
      join touchline_coaches_private.identities i on i.id=ca.coach_id
      join touchline_coaches_private.publications cp on cp.id=ca.publication_id
      join touchline_coaches_private.observations co on co.id=cp.observation_id
      where ca.team_id=identity->>'clubProviderId' and i.provider_id=identity->>'coachProviderId'
        and (label is null or co.display_name=label))
      and not exists(select 1 from touchline_coaches_private.candidates candidate
        join touchline_coaches_private.observations candidate_observation on candidate_observation.id=candidate.observation_id
        where candidate.provider_id=identity->>'coachProviderId' and candidate.team_id=identity->>'clubProviderId'
          and candidate.status in ('pending','approved')
          and candidate_observation.display_name is distinct from label)
    then continue; end if;
    insert into touchline_coaches_private.candidates(provider_id,team_id,observation_id,evidence_observed_at)
      values(identity->>'coachProviderId',identity->>'clubProviderId',obs,p_synced_at)
      on conflict(provider_id,team_id) do update set observation_id=excluded.observation_id,
        evidence_observed_at=excluded.evidence_observed_at,
        revision=touchline_coaches_private.candidates.revision+
          case when touchline_coaches_private.candidates.observation_id<>excluded.observation_id then 1 else 0 end,
        status=case when touchline_coaches_private.candidates.observation_id=excluded.observation_id
          then touchline_coaches_private.candidates.status
          when touchline_coaches_private.candidates.status='ignored' then 'ignored' else 'pending' end,
        reviewed_observation_id=case when touchline_coaches_private.candidates.observation_id=excluded.observation_id
          then touchline_coaches_private.candidates.reviewed_observation_id else null end,
        updated_at=case when touchline_coaches_private.candidates.observation_id=excluded.observation_id
          then touchline_coaches_private.candidates.updated_at else now() end
      where excluded.evidence_observed_at>coalesce(touchline_coaches_private.candidates.evidence_observed_at,
        (select observed_at from touchline_coaches_private.observations where id=touchline_coaches_private.candidates.observation_id));
    staged:=staged+1;
  end loop;
  return staged;
end;
$$;

create function public.touchline_stage_coach_fixture_v2(p_fixture_id text,p_feed_id uuid,p_synced_at timestamptz,p_expected jsonb,p_projection jsonb)
returns integer language sql security invoker set search_path='' as $$
  select touchline_coaches_private.stage_fixture_v2(p_fixture_id,p_feed_id,p_synced_at,p_expected,p_projection)
$$;
revoke all on function touchline_coaches_private.stage_fixture_v2(text,uuid,timestamptz,jsonb,jsonb),
  public.touchline_stage_coach_fixture_v2(text,uuid,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function touchline_coaches_private.stage_fixture_v2(text,uuid,timestamptz,jsonb,jsonb),
  public.touchline_stage_coach_fixture_v2(text,uuid,timestamptz,jsonb,jsonb) to service_role;

-- Preserve all existing lease/reservation guards by calling the installed
-- function inside this transaction. Its write lock binds the returned receipt.
create function public.touchline_persist_recovery_feed_v2(p_fixture_id uuid,p_run_id uuid,p_feed jsonb,p_shirt_facts jsonb,p_reservation_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ready boolean; receipt jsonb;
begin
  ready:=public.touchline_persist_recovery_feed(p_fixture_id,p_run_id,p_feed,p_shirt_facts,p_reservation_id);
  select jsonb_build_object('id',id,'persistedAt',last_synced_at) into strict receipt
    from public.football_fantasy_fixture_feeds where provider='sportmonks' and provider_fixture_id=p_feed#>>'{fixture,providerId}';
  return jsonb_build_object('persisted',true,'reconciliationReady',ready,'receipt',receipt);
end;
$$;
revoke all on function public.touchline_persist_recovery_feed_v2(uuid,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.touchline_persist_recovery_feed_v2(uuid,uuid,jsonb,jsonb,uuid) to service_role;
commit;
