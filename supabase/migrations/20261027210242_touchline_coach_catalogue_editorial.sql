-- England coach catalogue. Applying this file activates neither detection nor
-- public reads. No historical contract, score, card or manual price is changed.
create schema touchline_coaches_private;
revoke all on schema touchline_coaches_private from public, anon, authenticated, service_role;
grant usage on schema touchline_coaches_private to service_role;

create table touchline_coaches_private.configuration (
  singleton boolean primary key default true check (singleton),
  editorial_enabled boolean not null default false,
  public_enabled boolean not null default false,
  revision integer not null default 0 check (revision >= 0)
);
insert into touchline_coaches_private.configuration(singleton) values (true);
create table touchline_coaches_private.identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'sportmonks' check (provider = 'sportmonks'),
  provider_id text not null unique check (provider_id ~ '^[1-9][0-9]{0,15}$'),
  created_at timestamptz not null default now()
);
create table touchline_coaches_private.observations (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null check (provider_id ~ '^[1-9][0-9]{0,15}$'),
  club_id uuid not null references public.football_clubs(id),
  team_id text not null check (team_id ~ '^[1-9][0-9]{0,15}$'),
  source_kind text not null check (source_kind in ('legacy_seed_bootstrap', 'sportmonks.fixture.coaches')),
  source_id text not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz not null,
  fixture_at timestamptz,
  display_name text check (char_length(display_name) between 1 and 120 and display_name !~ '[[:cntrl:]<>@]'),
  nationality text,
  country_id text,
  country_code3 text not null default '',
  unique(provider_id, team_id, source_hash)
);
create table touchline_coaches_private.candidates (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  team_id text not null,
  observation_id uuid not null references touchline_coaches_private.observations(id),
  status text not null default 'pending' check (status in ('pending','approved','ignored','published')),
  revision integer not null default 1,
  reviewed_observation_id uuid references touchline_coaches_private.observations(id),
  updated_at timestamptz not null default now(),
  unique(provider_id, team_id)
);
create table touchline_coaches_private.publications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references touchline_coaches_private.identities(id),
  observation_id uuid not null references touchline_coaches_private.observations(id),
  classification jsonb not null,
  catalogue_revision integer not null check (catalogue_revision > 0),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index touchline_coach_publication_identity on touchline_coaches_private.publications(coach_id,catalogue_revision desc,id);
create table touchline_coaches_private.current_assignments (
  team_id text primary key,
  coach_id uuid not null unique references touchline_coaches_private.identities(id),
  publication_id uuid not null unique references touchline_coaches_private.publications(id)
);
create table touchline_coaches_private.audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  actor_id uuid not null references auth.users(id),
  action text not null,
  detail jsonb not null,
  created_at timestamptz not null default now()
);
create table touchline_coaches_private.commands (
  request_id uuid primary key,
  input jsonb not null,
  result jsonb not null
);
do $$ declare t text; begin
  foreach t in array array['configuration','identities','observations','candidates','publications','current_assignments','audit','commands'] loop
    execute format('alter table touchline_coaches_private.%I enable row level security',t);
    execute format('revoke all on touchline_coaches_private.%I from public, anon, authenticated, service_role',t);
  end loop;
end $$;
-- Deliberate deployment/configuration operation only, never exposed by the UI.
grant select, update(editorial_enabled, public_enabled) on touchline_coaches_private.configuration to service_role;

create function touchline_coaches_private.assert_editorial() returns void
language plpgsql stable security definer set search_path = '' as $$ begin
  if not coalesce((select editorial_enabled from touchline_coaches_private.configuration where singleton),false) then
    raise exception 'COACH_CATALOGUE_DISABLED' using errcode='55000';
  end if;
end $$;

create function touchline_coaches_private.entry(p touchline_coaches_private.publications) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id',i.id,'providerId',i.provider_id,'publicationId',p.id,
   'teamId',o.team_id,'name',o.display_name,'nationality',o.nationality,'countryId',o.country_id,
   'countryCode3',o.country_code3,'sourceKind',o.source_kind,'sourceId',o.source_id,
   'sourceHash',o.source_hash,'observedAt',o.observed_at,'publishedAt',p.created_at,
   'classification',p.classification)
 from touchline_coaches_private.identities i, touchline_coaches_private.observations o
 where i.id=p.coach_id and o.id=p.observation_id
$$;

create function touchline_coaches_private.read_catalogue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public_enabled from touchline_coaches_private.configuration where singleton),false) then
    raise exception 'COACH_CATALOGUE_DISABLED' using errcode='55000';
  end if;
  -- Activation must never expose a partial bootstrap as the England catalogue.
  if (select count(*) from touchline_coaches_private.current_assignments) <> 20 then
    raise exception 'COACH_CATALOGUE_INCOMPLETE' using errcode='55000';
  end if;
  return jsonb_build_object('revision',(select revision from touchline_coaches_private.configuration where singleton),
    'current',coalesce((select jsonb_agg(touchline_coaches_private.entry(p) order by a.team_id)
      from touchline_coaches_private.current_assignments a join touchline_coaches_private.publications p on p.id=a.publication_id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(touchline_coaches_private.entry(p) order by p.catalogue_revision,p.id)
      from touchline_coaches_private.publications p),'[]'::jsonb));
end $$;

create function touchline_coaches_private.read_editorial() returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  perform touchline_coaches_private.assert_editorial();
  return jsonb_build_object('revision',(select revision from touchline_coaches_private.configuration where singleton),
    'publicEnabled',(select public_enabled from touchline_coaches_private.configuration where singleton),
    'currentCount',(select count(*) from touchline_coaches_private.current_assignments),
    'candidates',coalesce((select jsonb_agg(row_data order by team_id,provider_id) from (
      select c.team_id,c.provider_id,jsonb_build_object('id',c.id,'revision',c.revision,'status',c.status,
        'providerId',c.provider_id,'teamId',c.team_id,'name',o.display_name,'clubName',fc.name,
        'sourceKind',o.source_kind,'sourceId',o.source_id,'sourceHash',o.source_hash,'observedAt',o.observed_at,
        'fixtureAt',o.fixture_at,'currentProviderId',i.provider_id,'currentName',co.display_name) row_data
      from touchline_coaches_private.candidates c join touchline_coaches_private.observations o on o.id=c.observation_id
      join public.football_clubs fc on fc.id=o.club_id
      left join touchline_coaches_private.current_assignments a on a.team_id=c.team_id
      left join touchline_coaches_private.identities i on i.id=a.coach_id
      left join touchline_coaches_private.publications cp on cp.id=a.publication_id
      left join touchline_coaches_private.observations co on co.id=cp.observation_id
    ) x),'[]'::jsonb));
end $$;

-- Read already-persisted normalized evidence, never a browser-supplied identity.
-- A fixture observation is only a review candidate, not a current appointment.
create function touchline_coaches_private.stage_fixture(p_fixture_id text) returns integer
language plpgsql security definer set search_path = '' as $$
declare f jsonb; a jsonb; raw_coach jsonb; club uuid; obs uuid; fingerprint text; staged integer:=0; fetched timestamptz; label text;
begin
  perform touchline_coaches_private.assert_editorial();
  select fixture_payload,last_synced_at into f,fetched from public.football_fantasy_fixture_feeds
    where provider='sportmonks' and provider_fixture_id=p_fixture_id;
  if f is null or f->>'providerId' is distinct from p_fixture_id or f->>'competitionId' is distinct from '8'
    or f#>>'{coachAttribution,status}' is distinct from 'complete'
    or f#>>'{coachAttribution,source}' is distinct from 'sportmonks.fixture.coaches'
    or f#>>'{coachAttribution,fixtureProviderId}' is distinct from p_fixture_id
    or f#>>'{coachAttribution,competitionProviderId}' is distinct from '8'
    or f#>>'{coachAttribution,seasonProviderId}' is distinct from f->>'seasonId'
    or jsonb_typeof(f#>'{coachAttribution,assignments}') is distinct from 'array'
    or jsonb_array_length(f#>'{coachAttribution,assignments}') <> 2 then return 0; end if;
  if (select count(distinct v->>'coachProviderId') from jsonb_array_elements(f#>'{coachAttribution,assignments}') v) <> 2
    or (select count(distinct v->>'clubProviderId') from jsonb_array_elements(f#>'{coachAttribution,assignments}') v) <> 2 then return 0; end if;
  fingerprint:=encode(sha256(convert_to(f::text,'UTF8')),'hex');
  for a in select value from jsonb_array_elements(f#>'{coachAttribution,assignments}') loop
    if coalesce(a->>'coachProviderId','') !~ '^[1-9][0-9]{0,15}$' or coalesce(a->>'clubProviderId','') !~ '^[1-9][0-9]{0,15}$' then
      raise exception 'COACH_EVIDENCE_INVALID' using errcode='22023';
    end if;
    select c.id into club from public.football_clubs c join public.football_competitions l on l.id=c.competition_id
      where c.provider='sportmonks' and c.provider_team_id=a->>'clubProviderId' and l.provider='sportmonks' and l.provider_competition_id='8';
    if club is null then continue; end if;
    raw_coach:=null;
    if jsonb_typeof(f#>'{source,raw,coaches}')='array' then
      select value into raw_coach from jsonb_array_elements(f#>'{source,raw,coaches}')
        where value->>'id'=a->>'coachProviderId' and value#>>'{meta,participant_id}'=a->>'clubProviderId'
          and value#>>'{meta,fixture_id}'=p_fixture_id and value#>>'{meta,coach_id}'=a->>'coachProviderId';
    end if;
    label:=nullif(btrim(coalesce(raw_coach->>'display_name',raw_coach->>'name','')),'');
    if char_length(label)>120 or label ~ '[[:cntrl:]<>@]' then label:=null; end if;
    insert into touchline_coaches_private.observations(provider_id,club_id,team_id,source_kind,source_id,source_hash,observed_at,fixture_at,display_name,country_id,nationality)
      values(a->>'coachProviderId',club,a->>'clubProviderId','sportmonks.fixture.coaches',p_fixture_id,fingerprint,fetched,
        nullif(f->>'startsAt','')::timestamptz,label,raw_coach->>'country_id',raw_coach#>>'{country,name}')
      on conflict(provider_id,team_id,source_hash) do nothing;
    select id into obs from touchline_coaches_private.observations where provider_id=a->>'coachProviderId' and team_id=a->>'clubProviderId' and source_hash=fingerprint;
    -- Known current identities do not generate a review item on every match.
    if exists(select 1 from touchline_coaches_private.current_assignments ca join touchline_coaches_private.identities i on i.id=ca.coach_id
       join touchline_coaches_private.publications cp on cp.id=ca.publication_id
       join touchline_coaches_private.observations co on co.id=cp.observation_id
       where ca.team_id=a->>'clubProviderId' and i.provider_id=a->>'coachProviderId'
         and (label is null or co.display_name=label)) then continue; end if;
    insert into touchline_coaches_private.candidates(provider_id,team_id,observation_id)
      values(a->>'coachProviderId',a->>'clubProviderId',obs)
      on conflict(provider_id,team_id) do update set observation_id=excluded.observation_id,
        revision=touchline_coaches_private.candidates.revision+1,
        status=case when touchline_coaches_private.candidates.status='approved' then 'pending' else touchline_coaches_private.candidates.status end,
        reviewed_observation_id=null,updated_at=now()
      where touchline_coaches_private.candidates.observation_id<>excluded.observation_id
        and (select observed_at from touchline_coaches_private.observations where id=excluded.observation_id)>
            (select observed_at from touchline_coaches_private.observations where id=touchline_coaches_private.candidates.observation_id);
    staged:=staged+1;
  end loop;
  return staged;
end $$;

-- Single serialized, optimistic, idempotent owner command. A new observation
-- invalidates prior approval. Publication and audit commit or roll back together.
create function touchline_coaches_private.command(p_request_id uuid,p_actor_id uuid,p_action text,p_candidate_id uuid,p_revision integer,p_reason text,p_bootstrap jsonb default null,p_catalogue_revision integer default null) returns jsonb
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
    elsif p_action='publish' then
      if c.status<>'approved' or c.reviewed_observation_id is distinct from c.observation_id or o.display_name is null then raise exception 'COACH_PUBLICATION_REFUSED' using errcode='22023'; end if;
      if not exists(select 1 from touchline_coaches_private.current_assignments where team_id=c.team_id) then
        raise exception 'COACH_COMPETITION_SCOPE_REFUSED' using errcode='22023'; end if;
      insert into touchline_coaches_private.identities(provider_id) values(c.provider_id) on conflict(provider_id) do nothing;
      select id into identity_id from touchline_coaches_private.identities where provider_id=c.provider_id;
      if exists(select 1 from touchline_coaches_private.current_assignments where coach_id=identity_id and team_id<>c.team_id) then
        raise exception 'COACH_ALREADY_ASSIGNED' using errcode='23505'; end if;
      select p.classification into classification from touchline_coaches_private.publications p where p.coach_id=identity_id order by p.catalogue_revision,p.id limit 1;
      if classification is null then
        classification:=jsonb_build_object('coachProviderId',c.provider_id,'tierKey','sapphire-blue','classificationReason','classification-pending',
          'classificationSource','approved-fallback','classificationVersion','coach-reputation-2026-08-v1','sourceLeagueId',null,'sourceLeagueName',null,
          'sourceClub',null,'sourceSeasonId',null,'finalPosition',null,'promotionType',null,'leagueStrength','unknown');
      end if;
      insert into touchline_coaches_private.publications(coach_id,observation_id,classification,actor_id,catalogue_revision) values(identity_id,o.id,classification,p_actor_id,cfg.revision+1) returning id into publication_id;
      insert into touchline_coaches_private.current_assignments values(c.team_id,identity_id,publication_id)
        on conflict(team_id) do update set coach_id=excluded.coach_id,publication_id=excluded.publication_id;
      update touchline_coaches_private.candidates set status='published',revision=revision+1,updated_at=now() where id=c.id;
    else raise exception 'COACH_INVALID_COMMAND' using errcode='22023'; end if;
  end if;
  update touchline_coaches_private.configuration set revision=revision+1 where singleton;
  receipt:=jsonb_build_object('requestId',p_request_id,'action',p_action,'candidateId',p_candidate_id,'revision',cfg.revision+1);
  insert into touchline_coaches_private.audit(request_id,actor_id,action,detail) values(p_request_id,p_actor_id,p_action,command_input||jsonb_build_object('publicationId',publication_id,'observationId',c.observation_id));
  insert into touchline_coaches_private.commands values(p_request_id,command_input,receipt);
  return receipt;
end $$;

create function public.touchline_read_coach_catalogue() returns jsonb language sql security invoker set search_path='' as $$ select touchline_coaches_private.read_catalogue() $$;
create function public.touchline_read_coach_editorial() returns jsonb language sql security invoker set search_path='' as $$ select touchline_coaches_private.read_editorial() $$;
create function public.touchline_stage_coach_fixture(p_fixture_id text) returns integer language sql security invoker set search_path='' as $$ select touchline_coaches_private.stage_fixture(p_fixture_id) $$;
create function public.touchline_coach_editorial_command(p_request_id uuid,p_actor_id uuid,p_action text,p_candidate_id uuid,p_revision integer,p_reason text,p_bootstrap jsonb default null,p_catalogue_revision integer default null) returns jsonb language sql security invoker set search_path='' as $$ select touchline_coaches_private.command(p_request_id,p_actor_id,p_action,p_candidate_id,p_revision,p_reason,p_bootstrap,p_catalogue_revision) $$;
revoke all on all functions in schema touchline_coaches_private from public,anon,authenticated,service_role;
grant execute on function touchline_coaches_private.read_catalogue(),touchline_coaches_private.read_editorial(),touchline_coaches_private.stage_fixture(text),touchline_coaches_private.command(uuid,uuid,text,uuid,integer,text,jsonb,integer) to service_role;
revoke all on function public.touchline_read_coach_catalogue(),public.touchline_read_coach_editorial(),public.touchline_stage_coach_fixture(text),public.touchline_coach_editorial_command(uuid,uuid,text,uuid,integer,text,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.touchline_read_coach_catalogue(),public.touchline_read_coach_editorial(),public.touchline_stage_coach_fixture(text),public.touchline_coach_editorial_command(uuid,uuid,text,uuid,integer,text,jsonb,integer) to service_role;
