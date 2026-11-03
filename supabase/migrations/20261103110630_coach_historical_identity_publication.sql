-- Publish approved fixture identity to catalogue history without changing any
-- current appointment. Gates, authority, optimistic revision, idempotency and
-- atomic audit are preserved. No points, prices, contracts or wallets change.
begin;
set local lock_timeout='5s';
create or replace function touchline_coaches_private.command(p_request_id uuid,p_actor_id uuid,p_action text,p_candidate_id uuid,p_revision integer,p_reason text,p_bootstrap jsonb default null,p_catalogue_revision integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c touchline_coaches_private.candidates; o touchline_coaches_private.observations; command_input jsonb; receipt jsonb;
  cfg touchline_coaches_private.configuration; identity_id uuid; publication_id uuid; classification jsonb; seed jsonb; club uuid; obs uuid;
begin
  perform touchline_coaches_private.assert_editorial();
  if p_request_id is null or p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id)
    or char_length(btrim(coalesce(p_reason,''))) not between 20 and 1000 then raise exception 'COACH_INVALID_COMMAND' using errcode='22023'; end if;
  command_input:=jsonb_build_object('actor',p_actor_id,'action',p_action,'candidate',p_candidate_id,'revision',p_revision,'reason',p_reason,'bootstrap',p_bootstrap,'catalogueRevision',p_catalogue_revision);
  select * into cfg from touchline_coaches_private.configuration where singleton for update;
  select result into receipt from touchline_coaches_private.commands where request_id=p_request_id and commands.input=command_input;
  if receipt is not null then return receipt; end if;
  if exists(select 1 from touchline_coaches_private.commands where request_id=p_request_id) then raise exception 'COACH_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  if p_catalogue_revision is distinct from cfg.revision then raise exception 'COACH_REVIEW_STALE' using errcode='40001'; end if;
  if p_action='bootstrap' then
    if cfg.public_enabled or exists(select 1 from touchline_coaches_private.publications) or p_candidate_id is not null
      or jsonb_typeof(p_bootstrap) is distinct from 'array' or jsonb_array_length(p_bootstrap)<>20
      or (select count(distinct value->>'providerId') from jsonb_array_elements(p_bootstrap))<>20
      or (select count(distinct value->>'teamId') from jsonb_array_elements(p_bootstrap))<>20 then
      raise exception 'COACH_BOOTSTRAP_REFUSED' using errcode='22023';
    end if;
    for seed in select value from jsonb_array_elements(p_bootstrap) loop
      select fc.id into club from public.football_clubs fc join public.football_competitions l on l.id=fc.competition_id
       where fc.provider='sportmonks' and fc.provider_team_id=seed->>'teamId' and l.provider='sportmonks' and l.provider_competition_id='8';
      if club is null or seed#>>'{classification,coachProviderId}' is distinct from seed->>'providerId'
        or seed#>>'{classification,classificationVersion}' is distinct from 'coach-reputation-2026-08-v1' then
        raise exception 'COACH_BOOTSTRAP_IDENTITY_INVALID' using errcode='22023'; end if;
      insert into touchline_coaches_private.identities(provider_id) values(seed->>'providerId') returning id into identity_id;
      insert into touchline_coaches_private.observations(provider_id,club_id,team_id,source_kind,source_id,source_hash,observed_at,display_name,nationality,country_id,country_code3)
        values(seed->>'providerId',club,seed->>'teamId','legacy_seed_bootstrap','live-coaches:2026-07-27',
          encode(sha256(convert_to(seed::text,'UTF8')),'hex'),(seed->>'observedAt')::timestamptz,seed->>'name',seed->>'nationality',seed->>'countryId',seed->>'countryCode3') returning id into obs;
      insert into touchline_coaches_private.publications(coach_id,observation_id,classification,actor_id,catalogue_revision)
        values(identity_id,obs,seed->'classification',p_actor_id,cfg.revision+1) returning id into publication_id;
      insert into touchline_coaches_private.current_assignments values(seed->>'teamId',identity_id,publication_id);
    end loop;
  else
    if p_bootstrap is not null then raise exception 'COACH_INVALID_COMMAND' using errcode='22023'; end if;
    select * into c from touchline_coaches_private.candidates where id=p_candidate_id for update;
    if c.id is null or c.revision is distinct from p_revision then raise exception 'COACH_REVIEW_STALE' using errcode='40001'; end if;
    select * into o from touchline_coaches_private.observations where id=c.observation_id;
    if p_action='approve' then
      if c.status<>'pending' or o.display_name is null then raise exception 'COACH_APPROVAL_REFUSED' using errcode='22023'; end if;
      update touchline_coaches_private.candidates set status='approved',reviewed_observation_id=observation_id,revision=revision+1,updated_at=now() where id=c.id;
    elsif p_action='ignore' then
      if c.status not in ('pending','approved') then raise exception 'COACH_DECISION_REFUSED' using errcode='22023'; end if;
      update touchline_coaches_private.candidates set status='ignored',reviewed_observation_id=null,revision=revision+1,updated_at=now() where id=c.id;
    elsif p_action='reopen' then
      if c.status not in ('ignored','published') then raise exception 'COACH_DECISION_REFUSED' using errcode='22023'; end if;
      update touchline_coaches_private.candidates set status='pending',reviewed_observation_id=null,revision=revision+1,updated_at=now() where id=c.id;
    elsif p_action in ('publish','publish_history') then
      if c.status<>'approved' or c.reviewed_observation_id is distinct from c.observation_id or o.display_name is null then raise exception 'COACH_PUBLICATION_REFUSED' using errcode='22023'; end if;
      -- A historical identity needs a reviewed official import, not a seed or
      -- a presumed current appointment. The observation/revision remain private.
      if p_action='publish_history' and (o.source_kind<>'sportmonks.fixture.coaches'
        or o.source_feed_revision_id is null or o.fixture_at is null or o.fixture_at>clock_timestamp()
        or o.provider_id is distinct from c.provider_id or o.team_id is distinct from c.team_id
        or not exists(select 1 from public.football_feed_revisions r
          where r.id=o.source_feed_revision_id and r.origin='observed_import'
            and r.provider='sportmonks' and r.provider_fixture_id=o.source_id
            and r.payload#>>'{fixture,coachAttribution,status}'='complete'
            and exists(select 1 from jsonb_array_elements(r.payload#>'{fixture,coachAttribution,assignments}') a
              where a->>'coachProviderId'=c.provider_id and a->>'clubProviderId'=c.team_id))) then
        raise exception 'COACH_HISTORICAL_EVIDENCE_REQUIRED' using errcode='22023';
      end if;
      if not exists(select 1 from touchline_coaches_private.current_assignments where team_id=c.team_id) then
        raise exception 'COACH_COMPETITION_SCOPE_REFUSED' using errcode='22023'; end if;
      insert into touchline_coaches_private.identities(provider_id) values(c.provider_id) on conflict(provider_id) do nothing;
      select id into identity_id from touchline_coaches_private.identities where provider_id=c.provider_id;
      if p_action='publish' and exists(select 1 from touchline_coaches_private.current_assignments where coach_id=identity_id and team_id<>c.team_id) then
        raise exception 'COACH_ALREADY_ASSIGNED' using errcode='23505'; end if;
      select p.classification into classification from touchline_coaches_private.publications p where p.coach_id=identity_id order by p.catalogue_revision,p.id limit 1;
      if classification is null then
        classification:=jsonb_build_object('coachProviderId',c.provider_id,'tierKey','sapphire-blue','classificationReason','classification-pending',
          'classificationSource','approved-fallback','classificationVersion','coach-reputation-2026-08-v1','sourceLeagueId',null,'sourceLeagueName',null,
          'sourceClub',null,'sourceSeasonId',null,'finalPosition',null,'promotionType',null,'leagueStrength','unknown');
      end if;
      insert into touchline_coaches_private.publications(coach_id,observation_id,classification,actor_id,catalogue_revision) values(identity_id,o.id,classification,p_actor_id,cfg.revision+1) returning id into publication_id;
      if p_action='publish' then
      insert into touchline_coaches_private.current_assignments values(c.team_id,identity_id,publication_id)
        on conflict(team_id) do update set coach_id=excluded.coach_id,publication_id=excluded.publication_id;
      end if;
      update touchline_coaches_private.candidates set status='published',revision=revision+1,updated_at=now() where id=c.id;
    else raise exception 'COACH_INVALID_COMMAND' using errcode='22023'; end if;
  end if;
  update touchline_coaches_private.configuration set revision=revision+1 where singleton;
  receipt:=jsonb_build_object('requestId',p_request_id,'action',p_action,'candidateId',p_candidate_id,'revision',cfg.revision+1);
  insert into touchline_coaches_private.audit(request_id,actor_id,action,detail) values(p_request_id,p_actor_id,p_action,command_input||jsonb_build_object('publicationId',publication_id,'observationId',c.observation_id));
  insert into touchline_coaches_private.commands values(p_request_id,command_input,receipt);
  return receipt;
end $$;

commit;
