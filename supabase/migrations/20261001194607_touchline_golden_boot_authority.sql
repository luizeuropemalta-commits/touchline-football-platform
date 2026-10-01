-- TouchLine Golden Boot authority. Local validation does not activate a producer or public badge.
-- Requires existing canonical football/editorial tables and service_role.
-- Normalized provider envelopes are supplied ONLY by the trusted server adapter;
-- this database cannot attest that arbitrary JSON came from Sportmonks HTTP.
-- Producer must capture source revision BEFORE canonical TS validation and AFTER,
-- require equality, then finish with that revision. No DTO eligible boolean.
-- No source-row FK/locking: an AFTER-trigger writer can already hold source rows
-- while waiting for the revision row. Order is revision SHARE -> own state.
-- Statement triggers intentionally invalidate globally, even zero-row updates.
-- Source writers must be owner/service_role: INVOKER trigger needs revision UPDATE.
-- Review that writer ACL assumption before a real migration; do not grant clients.
begin;
set local lock_timeout = '5s';

create table public.touchline_golden_boot_source_revision (
  singleton boolean primary key default true check(singleton),
  revision bigint not null check(revision >= 0)
);
insert into public.touchline_golden_boot_source_revision values(true,0);

create table public.touchline_golden_boot_snapshots (
  snapshot_id uuid primary key,
  competition_id uuid not null, season_id uuid not null,
  source_revision bigint not null,
  policy_version text not null check(policy_version='premier-single-regular-stage-v1'),
  effective_season text not null,
  stages_fetched_at timestamptz not null, scorers_fetched_at timestamptz not null,
  expires_at timestamptz not null,
  stage_evidence jsonb not null, scorer_evidence jsonb not null,
  leaders jsonb not null check(jsonb_typeof(leaders)='array' and jsonb_array_length(leaders)>0),
  created_at timestamptz not null default clock_timestamp(),
  check(expires_at <= least(stages_fetched_at,scorers_fetched_at)+interval '60 seconds')
);
create table public.touchline_golden_boot_state (
  competition_id uuid not null, season_id uuid not null,
  revision bigint not null check(revision>0), token uuid not null,
  phase text not null check(phase in ('pending','ready','unavailable')),
  snapshot_id uuid references public.touchline_golden_boot_snapshots(snapshot_id),
  reason text, finish_hash text,
  -- Watermarks survive failure/revocation and must never be reset by begin.
  newest_stages_fetch timestamptz, newest_scorers_fetch timestamptz,
  primary key(competition_id,season_id),
  check((phase<>'ready' or snapshot_id is not null)
    and (phase<>'unavailable' or snapshot_id is null))
);
create index touchline_golden_boot_snapshot_evidence_deadline
  on public.touchline_golden_boot_snapshots
  (competition_id,season_id,stages_fetched_at,scorers_fetched_at,expires_at);

-- Admission is separate from the immutable football evidence deadline. No
-- schedule/route is installed here. Before activation, wire terminal quota
-- completion and the bounded trusted producer; claim alone is not a scheduler.
create table public.touchline_golden_boot_worker (
  singleton boolean primary key default true check(singleton),
  generation bigint not null default 0 check(generation>=0),
  token uuid, competition_id uuid, season_id uuid,
  lease_until timestamptz, not_before timestamptz,
  completed boolean not null default false,
  failure_count integer not null default 0 check(failure_count between 0 and 10),
  cooldown_until timestamptz, completion_hash text, completion_receipt jsonb,
  check((token is null and generation=0 and competition_id is null and season_id is null and lease_until is null)
    or (token is not null and generation>0 and competition_id is not null and season_id is not null and lease_until is not null))
);
insert into public.touchline_golden_boot_worker(singleton) values(true);

create function public.assert_touchline_golden_boot_worker(p_comp uuid,p_season uuid,p_token uuid,p_generation bigint default null,p_require_live boolean default true)
returns void language plpgsql security invoker set search_path='' as $$
declare w public.touchline_golden_boot_worker%rowtype;
begin
  select * into strict w from public.touchline_golden_boot_worker where singleton for update;
  -- The pre-scheduler producer remains usable for isolated verification only.
  -- Once the first worker has claimed, no direct begin/finish bypass is allowed.
  if w.token is null then return; end if;
  if w.token is distinct from p_token or w.generation is distinct from p_generation
    or w.competition_id is distinct from p_comp or w.season_id is distinct from p_season
    then raise exception 'GB_WORKER_OWNERSHIP'; end if;
  if p_require_live is distinct from false and (w.completed or w.lease_until<=clock_timestamp())
    then raise exception 'GB_WORKER_EXPIRED'; end if;
end $$;

create function public.touchline_golden_boot_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'GB_IMMUTABLE_SNAPSHOT'; end $$;
create trigger golden_boot_immutable before update or delete on public.touchline_golden_boot_snapshots
for each row execute function public.touchline_golden_boot_immutable();

create function public.touchline_golden_boot_monotonic() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.revision<=old.revision then raise exception 'GB_REVISION_REGRESSION'; end if;
  if tg_table_name='touchline_golden_boot_state' then
    if new.competition_id<>old.competition_id or new.season_id<>old.season_id
      or (old.newest_stages_fetch is not null and (new.newest_stages_fetch is null or new.newest_stages_fetch<old.newest_stages_fetch))
      or (old.newest_scorers_fetch is not null and (new.newest_scorers_fetch is null or new.newest_scorers_fetch<old.newest_scorers_fetch))
      then raise exception 'GB_STATE_REGRESSION'; end if;
  end if;
  return new;
end $$;
create trigger golden_boot_monotonic before update on public.touchline_golden_boot_source_revision
for each row execute function public.touchline_golden_boot_monotonic();
create trigger golden_boot_monotonic before update on public.touchline_golden_boot_state
for each row execute function public.touchline_golden_boot_monotonic();

create function public.touchline_golden_boot_source_bump() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  update public.touchline_golden_boot_source_revision set revision=revision+1 where singleton;
  if not found then raise exception 'GB_SOURCE_REVISION_MISSING'; end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['football_competitions','football_seasons','football_players','football_clubs',
    'football_squad_members','touchline_card_publications','football_player_market_values','touchline_card_editorial_overrides']
  loop
    execute format('create trigger golden_boot_source_change after insert or update or delete or truncate on public.%I for each statement execute function public.touchline_golden_boot_source_bump()',t);
  end loop;
end $$;

create function public.touchline_golden_boot_editorial_season(p_name text) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare parts text[]; y integer; next_y text;
begin
  parts:=regexp_match(p_name,'^([0-9]{4})[-/]([0-9]{2}|[0-9]{4})$');
  if parts is null then return null; end if;
  y:=parts[1]::integer;
  if y<1000 or y>=9999 then return null; end if;
  next_y:=(y+1)::text;
  if parts[2]<>next_y and parts[2]<>right(next_y,2) then return null; end if;
  return parts[1]||'-'||right(next_y,2);
end $$;

-- Revalidate canonical identity/publication while source revision is held.
-- TS shared publication reader remains the full card-presentation policy seam;
-- finish additionally checks stored market-value provenance, not a caller flag.
create function public.touchline_golden_boot_bindings_valid(p_comp uuid,p_season uuid,p_label text,p_leaders jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
  select
    (select count(*)=1 from public.football_competitions c
      where c.id=p_comp and c.provider='sportmonks' and c.provider_competition_id='8')
    and (select count(*)=1 and bool_and(s.id=p_season and public.touchline_golden_boot_editorial_season(s.name)=p_label)
      from public.football_seasons s where s.competition_id=p_comp and s.provider='sportmonks' and s.is_current)
    and jsonb_typeof(p_leaders)='array' and jsonb_array_length(p_leaders) between 1 and 500
    and (select count(distinct x->>'player_id')=count(*) and count(distinct x->>'provider_player_id')=count(*)
      from jsonb_array_elements(p_leaders) x)
    and not exists (
      select 1 from jsonb_array_elements(p_leaders) x where not exists (
        select 1 from public.football_players p
        join public.football_clubs c on c.id=p.current_club_id
        join public.football_squad_members m on m.id=(x->>'membership_id')::uuid and m.player_id=p.id and m.club_id=c.id
        join public.touchline_card_publications pub on pub.player_id=p.id and pub.current_membership_id=m.id
        join public.football_player_market_values v on v.player_id=p.id
        where p.id=(x->>'player_id')::uuid and p.provider='sportmonks' and p.provider_player_id=x->>'provider_player_id'
          and c.id=(x->>'club_id')::uuid and c.provider='sportmonks' and c.provider_team_id=x->>'provider_team_id'
          and c.competition_id=p_comp and m.provider='sportmonks' and m.competition_id=p_comp and m.status='active'
          and (select count(*) from public.football_squad_members mm where mm.player_id=p.id
            and mm.provider='sportmonks' and mm.competition_id=p_comp and mm.status='active')=1
          and pub.competition_id=p_comp and pub.effective_season=p_label and pub.publication_status='published'
          and pub.last_reviewed_at is not null and pub.calculated_tier is not null and pub.calculated_nominal_price_gbp>=0
          and v.verified_season=p_label and v.market_value_eur>=0
          and ((v.status='verified' and v.confidence='verified') or
            (v.status='provisional' and v.confidence='provisional' and v.source='touchline_card_engine_provisional'
              and v.market_value_eur=1000000 and pub.internal_source='touchline_card_engine_provisional_defaults'
              and exists(select 1 from public.touchline_card_editorial_overrides o where o.player_id=p.id
                and o.field_key='marketValueEur' and o.status='provisional'
                and o.provenance_status='PROVISIONAL_MISSING_MARKET_VALUE'
                and (o.effective_value='1000000'::jsonb or o.effective_value->'value'='1000000'::jsonb)
                and o.last_verification_at is not null and o.next_verification_at is not null)))
      )
    )
$$;

create function public.begin_touchline_golden_boot_refresh(p_comp uuid,p_season uuid,p_token uuid,p_worker_generation bigint default null)
returns bigint language plpgsql security invoker set search_path='' as $$
declare r bigint; s public.touchline_golden_boot_state%rowtype;
begin
  if p_comp is null or p_season is null or p_token is null then raise exception 'GB_INVALID_SCOPE'; end if;
  select revision into strict r from public.touchline_golden_boot_source_revision where singleton for share;
  -- Own scope lock serializes first insertion as well as later refreshes.
  perform public.assert_touchline_golden_boot_worker(p_comp,p_season,p_token,p_worker_generation);
  perform pg_advisory_xact_lock(hashtextextended('golden-boot:'||p_comp::text||':'||p_season::text,0));
  select * into s from public.touchline_golden_boot_state where competition_id=p_comp and season_id=p_season for update;
  if found and s.token=p_token then return s.revision; end if;
  perform public.assert_touchline_golden_boot_worker(p_comp,p_season,p_token,p_worker_generation);
  insert into public.touchline_golden_boot_state(competition_id,season_id,revision,token,phase)
  values(p_comp,p_season,1,p_token,'pending')
  on conflict(competition_id,season_id) do update set revision=public.touchline_golden_boot_state.revision+1,
    token=excluded.token,phase='pending',reason=null,finish_hash=null
  returning revision into r;
  return r;
end $$;

create function public.try_begin_touchline_golden_boot_worker(p_comp uuid,p_season uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.touchline_golden_boot_worker%rowtype; r bigint; observed timestamptz;
begin
  if p_token is null or p_comp is null or p_season is null then raise exception 'GB_WORKER_SCOPE'; end if;
  select revision into strict r from public.touchline_golden_boot_source_revision where singleton for share;
  select * into strict w from public.touchline_golden_boot_worker where singleton for update;
  if (select count(*) from public.football_competitions where provider='sportmonks' and provider_competition_id='8')<>1
    or not exists(select 1 from public.football_competitions where id=p_comp and provider='sportmonks' and provider_competition_id='8')
    or (select count(*) from public.football_seasons where provider='sportmonks' and competition_id=p_comp and is_current)<>1
    or not exists(select 1 from public.football_seasons where id=p_season and provider='sportmonks' and competition_id=p_comp and is_current)
    then raise exception 'GB_WORKER_SCOPE'; end if;
  observed:=clock_timestamp();
  if w.token=p_token then return jsonb_build_object('acquired',false,'reason','duplicate'); end if;
  if w.token is not null and greatest(w.not_before,w.cooldown_until,
      case when not w.completed then w.lease_until+interval '60 seconds' end)>observed
    then return jsonb_build_object('acquired',false,'reason','not_due'); end if;
  update public.touchline_golden_boot_worker set generation=generation+1,token=p_token,
    competition_id=p_comp,season_id=p_season,lease_until=observed+interval '45 seconds',not_before=observed+interval '20 seconds',
    completed=false,completion_hash=null,completion_receipt=null
    where singleton returning * into w;
  perform public.begin_touchline_golden_boot_refresh(p_comp,p_season,p_token,w.generation);
  return jsonb_build_object('acquired',true,'token',p_token,'generation',w.generation::text,
    'competitionId',p_comp,'seasonId',p_season,'observedAtMs',ceil(extract(epoch from observed)*1000)::bigint,
    'leaseUntilMs',floor(extract(epoch from w.lease_until)*1000)::bigint);
end $$;

-- Trusted server passes only sanitized absolute cooldown metadata. No counting
-- of billable requests or re-anchoring cached provider timestamps occurs here.
create function public.complete_touchline_golden_boot_worker(
  p_token uuid,p_generation bigint,p_status text,p_quota_known boolean,p_cooldown_until timestamptz
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.touchline_golden_boot_worker%rowtype; r bigint; h text; failures integer;
  delay_seconds integer; next_time timestamptz; receipt jsonb; s public.touchline_golden_boot_state%rowtype;
begin
  if p_status is null or p_status not in ('stored','unavailable','unconfirmed')
    or (p_cooldown_until is not null and not isfinite(p_cooldown_until)) then raise exception 'GB_WORKER_COMPLETION'; end if;
  select revision into strict r from public.touchline_golden_boot_source_revision where singleton for share;
  select * into strict w from public.touchline_golden_boot_worker where singleton for update;
  if w.token is null or w.token is distinct from p_token or w.generation is distinct from p_generation
    then raise exception 'GB_WORKER_OWNERSHIP'; end if;
  h:=encode(sha256(convert_to(jsonb_build_array(p_status,p_quota_known,
    extract(epoch from p_cooldown_until))::text,'UTF8')),'hex');
  if w.completed then
    if w.completion_hash is distinct from h then raise exception 'GB_WORKER_REPLAY'; end if;
    return w.completion_receipt;
  end if;
  select * into strict s from public.touchline_golden_boot_state
    where competition_id=w.competition_id and season_id=w.season_id for share;
  if s.token is distinct from p_token or (p_status='stored' and s.phase<>'ready')
    or (p_status='unavailable' and s.phase<>'unavailable') then raise exception 'GB_WORKER_COMPLETION'; end if;
  failures:=case when p_status='stored' and p_quota_known is true then 0 else least(10,w.failure_count+1) end;
  delay_seconds:=case when failures=0 then 20 else least(300,30*power(2,least(failures,4))::integer) end;
  next_time:=greatest(w.not_before,w.cooldown_until,p_cooldown_until,
    clock_timestamp()+make_interval(secs=>delay_seconds));
  receipt:=jsonb_build_object('completed',true,'generation',w.generation::text,
    'notBeforeMs',ceil(extract(epoch from next_time)*1000)::bigint);
  update public.touchline_golden_boot_worker set completed=true,failure_count=failures,
    cooldown_until=greatest(w.cooldown_until,p_cooldown_until),not_before=next_time,
    completion_hash=h,completion_receipt=receipt where singleton;
  return receipt;
end $$;

-- A bigint must cross JSON transport as text; otherwise the JS SDK can round
-- the validation fence before the producer compares the two reads.
create function public.read_touchline_golden_boot_source_revision() returns text
language sql stable security invoker set search_path='' as $$
  select revision::text from public.touchline_golden_boot_source_revision where singleton
$$;

create function public.finish_touchline_golden_boot_refresh(
  p_comp uuid,p_season uuid,p_token uuid,p_revision bigint,
  p_stages jsonb,p_scorers jsonb,p_leaders jsonb,p_ttl_ms integer default 60000,p_failure text default null,
  p_worker_generation bigint default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r bigint; s public.touchline_golden_boot_state%rowtype; h text; stage jsonb; row_data jsonb;
  season_provider text; season_label text; sf timestamptz; tf timestamptz; deadline timestamptz;
  expected jsonb; supplied jsonb; snapshot uuid; canonical_leaders jsonb;
  previous_deadline timestamptz; rejection_reason text;
begin
  select revision into strict r from public.touchline_golden_boot_source_revision where singleton for share;
  perform public.assert_touchline_golden_boot_worker(p_comp,p_season,p_token,p_worker_generation,false);
  select * into strict s from public.touchline_golden_boot_state where competition_id=p_comp and season_id=p_season for update;
  if s.token is distinct from p_token then raise exception 'GB_SUPERSEDED_TOKEN'; end if;
  h:=encode(sha256(convert_to(jsonb_build_array(p_revision,p_stages,p_scorers,p_leaders,p_ttl_ms,p_failure)::text,'UTF8')),'hex');
  if s.phase<>'pending' then
    if s.finish_hash is distinct from h then raise exception 'GB_REPLAY_CONFLICT'; end if;
    return jsonb_build_object('phase',s.phase,'stateRevision',s.revision::text,
      'snapshot_id',s.snapshot_id,'reason',s.reason,'idempotent',true);
  end if;
  perform public.assert_touchline_golden_boot_worker(p_comp,p_season,p_token,p_worker_generation);
  if p_failure is not null then
    rejection_reason:=case when p_failure in ('PROVIDER_UNAVAILABLE','EVIDENCE_INVALID','CANONICAL_UNAVAILABLE')
      then p_failure else 'EVIDENCE_INVALID' end;
    -- State writes are outside the validation exception block. A database
    -- write failure is not a validation receipt or proof of committed revocation.
    perform public.assert_touchline_golden_boot_worker(p_comp,p_season,p_token,p_worker_generation);
    update public.touchline_golden_boot_state set phase='unavailable',snapshot_id=null,
      reason=rejection_reason,finish_hash=h,revision=revision+1
      where competition_id=p_comp and season_id=p_season returning * into s;
    return jsonb_build_object('phase',s.phase,'stateRevision',s.revision::text,
      'snapshot_id',null,'reason',s.reason,'idempotent',false);
  end if;
  -- Ownership and replay guards above cannot revoke a newer token. This block
  -- contains validation only: matching failures are sanitized, then a single
  -- revocation UPDATE below commits without depending on a second producer RPC.
  begin
  if r is distinct from p_revision then raise exception 'GB_SOURCE_CHANGED'; end if;
  if p_ttl_ms is null or p_ttl_ms<1 or p_ttl_ms>60000 then raise exception 'GB_TTL'; end if;
  select provider_season_id,public.touchline_golden_boot_editorial_season(name) into strict season_provider,season_label
    from public.football_seasons where id=p_season and provider='sportmonks' and competition_id=p_comp and is_current;
  if season_provider !~ '^[1-9][0-9]{0,19}$' or season_label is null then raise exception 'GB_SEASON'; end if;
  if p_stages->'ok' is distinct from 'true'::jsonb or p_scorers->'ok' is distinct from 'true'::jsonb
    or p_stages->>'provider' is distinct from 'sportmonks' or p_scorers->>'provider' is distinct from 'sportmonks'
    or p_stages#>>'{data,coverage}' is distinct from 'complete' or p_scorers#>>'{data,coverage}' is distinct from 'complete'
    or p_scorers#>>'{data,scopeStatus}' is distinct from 'complete'
    or jsonb_typeof(p_stages#>'{data,requestedSeasonId}') is distinct from 'string'
    or jsonb_typeof(p_scorers#>'{data,requestedSeasonId}') is distinct from 'string'
    or jsonb_typeof(p_stages#>'{data,leagueId}') is distinct from 'string'
    or p_stages#>>'{data,requestedSeasonId}' is distinct from season_provider
    or p_scorers#>>'{data,requestedSeasonId}' is distinct from season_provider
    or p_stages#>>'{data,leagueId}' is distinct from '8'
    or jsonb_typeof(p_stages#>'{data,rows}') is distinct from 'array'
    or jsonb_array_length(p_stages#>'{data,rows}')<>1
    or jsonb_typeof(p_scorers#>'{data,rows}') is distinct from 'array'
    or jsonb_array_length(p_scorers#>'{data,rows}') not between 1 and 500
    or jsonb_typeof(p_scorers#>'{data,pagesRead}') is distinct from 'number'
    or (p_scorers#>>'{data,pagesRead}') !~ '^[1-9][0-9]*$'
    or (p_scorers#>>'{data,pagesRead}')::numeric>10 then raise exception 'GB_EVIDENCE'; end if;
  stage:=p_stages#>'{data,rows,0}';
  if jsonb_typeof(stage->'id') is distinct from 'string' or (stage->>'id') !~ '^[1-9][0-9]{0,19}$'
    or jsonb_typeof(stage->'typeId') is distinct from 'string' or jsonb_typeof(stage->'leagueId') is distinct from 'string'
    or jsonb_typeof(stage->'seasonId') is distinct from 'string'
    or stage->>'typeId' is distinct from '223' or stage->>'leagueId' is distinct from '8'
    or stage->>'seasonId' is distinct from season_provider then raise exception 'GB_STAGE'; end if;
  foreach row_data in array array[p_stages,p_scorers] loop
    if jsonb_typeof(row_data->'fetchedAt') is distinct from 'string'
      or row_data->>'fetchedAt' is distinct from row_data#>>'{data,fetchedAt}'
      or row_data->>'fetchedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$'
      then raise exception 'GB_FETCH_TIME'; end if;
  end loop;
  sf:=(p_stages->>'fetchedAt')::timestamptz; tf:=(p_scorers->>'fetchedAt')::timestamptz;
  deadline:=least(sf,tf)+make_interval(secs=>p_ttl_ms::double precision/1000);
  -- Equal cached evidence cannot extend a formerly shorter issued lease,
  -- even after a failure cleared the mutable snapshot pointer.
  select min(a.expires_at) into previous_deadline
    from public.touchline_golden_boot_snapshots a
    where a.competition_id=p_comp and a.season_id=p_season
      and a.stages_fetched_at=sf and a.scorers_fetched_at=tf;
  if previous_deadline is not null then deadline:=least(deadline,previous_deadline); end if;
  if greatest(sf,tf)>clock_timestamp() or deadline<=clock_timestamp() then raise exception 'GB_EXPIRED'; end if;
  if sf<s.newest_stages_fetch or tf<s.newest_scorers_fetch then raise exception 'GB_FETCH_REGRESSION'; end if;
  for row_data in select value from jsonb_array_elements(p_scorers#>'{data,rows}') loop
    if jsonb_typeof(row_data->'providerRecordId') is distinct from 'string' or row_data->>'providerRecordId' !~ '^[1-9][0-9]{0,19}$'
      or jsonb_typeof(row_data->'providerPlayerId') is distinct from 'string' or row_data->>'providerPlayerId' !~ '^[1-9][0-9]{0,19}$'
      or jsonb_typeof(row_data->'providerTeamId') is distinct from 'string' or row_data->>'providerTeamId' !~ '^[1-9][0-9]{0,19}$'
      or jsonb_typeof(row_data->'leagueId') is distinct from 'string' or jsonb_typeof(row_data->'seasonId') is distinct from 'string'
      or jsonb_typeof(row_data->'stageId') is distinct from 'string'
      or row_data->>'leagueId' is distinct from '8' or row_data->>'seasonId' is distinct from season_provider
      or row_data->>'stageId' is distinct from stage->>'id'
      or jsonb_typeof(row_data->'goals') is distinct from 'number' or row_data->>'goals' !~ '^[0-9]+$'
      or (row_data->>'goals')::numeric>9007199254740991 then raise exception 'GB_SCORER_ROW'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_scorers#>'{data,rows}') x group by x->>'providerRecordId' having count(distinct x)>1)
    or exists(select 1 from jsonb_array_elements(p_scorers#>'{data,rows}') x group by x->>'providerPlayerId'
      having count(distinct jsonb_build_array(x->>'providerTeamId',x->'goals'))>1) then raise exception 'GB_CONFLICTING_DUPLICATE'; end if;
  with facts as(select distinct x->>'providerPlayerId' player,x->>'providerTeamId' team,(x->>'goals')::bigint goals
    from jsonb_array_elements(p_scorers#>'{data,rows}') x)
  select jsonb_agg(jsonb_build_array(player,team,goals) order by player) into expected
    from facts where goals>0 and goals=(select max(goals) from facts);
  if expected is null or jsonb_typeof(p_leaders) is distinct from 'array' then raise exception 'GB_NO_LEADERS'; end if;
  if exists(select 1 from jsonb_array_elements(p_leaders) x where
    jsonb_typeof(x->'player_id') is distinct from 'string' or jsonb_typeof(x->'club_id') is distinct from 'string'
    or jsonb_typeof(x->'membership_id') is distinct from 'string' or jsonb_typeof(x->'provider_player_id') is distinct from 'string'
    or jsonb_typeof(x->'provider_team_id') is distinct from 'string' or jsonb_typeof(x->'goals') is distinct from 'number'
    or x->>'goals' !~ '^[0-9]+$') then raise exception 'GB_LEADER_SHAPE'; end if;
  select jsonb_agg(jsonb_build_array(x->>'provider_player_id',x->>'provider_team_id',(x->>'goals')::bigint)
    order by x->>'provider_player_id') into supplied from jsonb_array_elements(p_leaders) x;
  if supplied is distinct from expected then raise exception 'GB_ALL_TIES_REQUIRED'; end if;
  if public.touchline_golden_boot_bindings_valid(p_comp,p_season,season_label,p_leaders) is not true then raise exception 'GB_BINDINGS'; end if;
  select jsonb_agg(jsonb_build_object('player_id',(x->>'player_id')::uuid,'club_id',(x->>'club_id')::uuid,
    'membership_id',(x->>'membership_id')::uuid,'provider_player_id',x->>'provider_player_id',
    'provider_team_id',x->>'provider_team_id','goals',(x->>'goals')::bigint) order by x->>'provider_player_id')
    into canonical_leaders from jsonb_array_elements(p_leaders) x;
  exception
    when raise_exception or data_exception or no_data_found or too_many_rows then
      -- Known policy failures plus malformed casts/calendar/shape errors only.
      -- Unexpected custom exceptions must remain operational failures.
      if sqlstate='P0001' and sqlerrm not in (
        'GB_SOURCE_CHANGED','GB_TTL','GB_SEASON','GB_EVIDENCE','GB_STAGE',
        'GB_FETCH_TIME','GB_EXPIRED','GB_FETCH_REGRESSION','GB_SCORER_ROW',
        'GB_CONFLICTING_DUPLICATE','GB_NO_LEADERS','GB_LEADER_SHAPE',
        'GB_ALL_TIES_REQUIRED','GB_BINDINGS'
      ) then raise; end if;
      rejection_reason:=case
        when sqlstate in ('P0002','P0003') or sqlerrm in ('GB_SOURCE_CHANGED','GB_SEASON','GB_BINDINGS')
        then 'CANONICAL_UNAVAILABLE' else 'EVIDENCE_INVALID' end;
  end;
  perform public.assert_touchline_golden_boot_worker(p_comp,p_season,p_token,p_worker_generation);
  if rejection_reason is not null then
    update public.touchline_golden_boot_state set phase='unavailable',snapshot_id=null,
      reason=rejection_reason,finish_hash=h,revision=revision+1
      where competition_id=p_comp and season_id=p_season returning * into s;
    return jsonb_build_object('phase',s.phase,'stateRevision',s.revision::text,
      'snapshot_id',null,'reason',s.reason,'idempotent',false);
  end if;
  snapshot:=gen_random_uuid();
  insert into public.touchline_golden_boot_snapshots values(snapshot,p_comp,p_season,r,'premier-single-regular-stage-v1',season_label,
    sf,tf,deadline,p_stages,p_scorers,canonical_leaders,clock_timestamp());
  perform public.assert_touchline_golden_boot_worker(p_comp,p_season,p_token,p_worker_generation);
  update public.touchline_golden_boot_state set phase='ready',snapshot_id=snapshot,reason=null,finish_hash=h,
    newest_stages_fetch=sf,newest_scorers_fetch=tf,revision=revision+1
    where competition_id=p_comp and season_id=p_season returning * into s;
  return jsonb_build_object('phase',s.phase,'stateRevision',s.revision::text,'snapshot_id',snapshot,'idempotent',false);
end $$;

create function public.read_touchline_golden_boot(p_comp uuid,p_season uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r bigint; s public.touchline_golden_boot_state%rowtype; a public.touchline_golden_boot_snapshots%rowtype;
  available boolean:=false; effective_revision text; player_ids jsonb:='[]'::jsonb;
begin
  select revision into strict r from public.touchline_golden_boot_source_revision where singleton for share;
  select * into s from public.touchline_golden_boot_state where competition_id=p_comp and season_id=p_season for share;
  if found and s.phase in ('pending','ready') and s.snapshot_id is not null then
    select * into strict a from public.touchline_golden_boot_snapshots where snapshot_id=s.snapshot_id;
    available:=a.competition_id=p_comp and a.season_id=p_season and a.source_revision=r and a.expires_at>clock_timestamp()
      and public.touchline_golden_boot_bindings_valid(p_comp,p_season,a.effective_season,a.leaders) is true;
  end if;
  -- Numeric BEFORE addition avoids bigint overflow. The low bit is a tombstone:
  -- expiry revokes without writing during navigation. Scope with no state uses
  -- state revision zero; first begin (revision>=1) strictly supersedes it.
  effective_revision:=(2*(coalesce(s.revision,0)::numeric+r::numeric)+(case when available then 0 else 1 end))::text;
  if available then
    select jsonb_agg(x->'player_id' order by x->>'player_id') into player_ids from jsonb_array_elements(a.leaders) x;
  end if;
  return jsonb_build_object('status',case when available then 'ready' else 'unavailable' end,
    'snapshotId',case when available then a.snapshot_id else null end,'revision',effective_revision,
    'competitionId',p_comp,'seasonId',p_season,'playerIds',player_ids,
    -- Public parser accepts a strict UTC instant, independent of caller/session
    -- timezone. Preserve database microseconds rather than round the deadline.
    'expiresAt',case when available then to_char(a.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') else null end,
    'freshnessAuthority','fetch-age-only');
end $$;

-- One read-only RPC for public-page server loaders. Resolve league/season on
-- the server; never accept an arbitrary client-supplied competition as current.
create function public.read_touchline_current_golden_boot() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare comp uuid; season uuid; ids uuid[]; authority jsonb;
begin
  perform revision from public.touchline_golden_boot_source_revision where singleton for share;
  if not found then return null; end if;
  select array_agg(id) into ids from public.football_competitions
    where provider='sportmonks' and provider_competition_id='8';
  if cardinality(ids) is distinct from 1 then return null; end if;
  comp:=ids[1];
  select array_agg(id) into ids from public.football_seasons
    where provider='sportmonks' and competition_id=comp and is_current;
  if cardinality(ids) is distinct from 1 then return null; end if;
  season:=ids[1];
  authority:=public.read_touchline_golden_boot(comp,season);
  -- Separate transport clock metadata from immutable revision payload. Never
  -- let application/browser wall-clock skew extend database-issued validity.
  return authority || jsonb_build_object('observedAtMs',ceil(extract(epoch from clock_timestamp())*1000)::bigint);
end $$;

alter table public.touchline_golden_boot_source_revision enable row level security;
alter table public.touchline_golden_boot_worker enable row level security;
revoke all on public.touchline_golden_boot_worker from public,anon,authenticated,service_role;
grant select,update on public.touchline_golden_boot_worker to service_role;
alter table public.touchline_golden_boot_state enable row level security;
alter table public.touchline_golden_boot_snapshots enable row level security;
revoke all on public.touchline_golden_boot_source_revision,public.touchline_golden_boot_state,public.touchline_golden_boot_snapshots from public,anon,authenticated,service_role;
grant select,update on public.touchline_golden_boot_source_revision to service_role;
grant select,insert,update on public.touchline_golden_boot_state to service_role;
grant select,insert on public.touchline_golden_boot_snapshots to service_role;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('touchline_golden_boot_immutable','touchline_golden_boot_monotonic','touchline_golden_boot_source_bump',
      'touchline_golden_boot_editorial_season','touchline_golden_boot_bindings_valid','begin_touchline_golden_boot_refresh',
      'assert_touchline_golden_boot_worker','try_begin_touchline_golden_boot_worker','complete_touchline_golden_boot_worker',
      'finish_touchline_golden_boot_refresh','read_touchline_golden_boot','read_touchline_golden_boot_source_revision',
      'read_touchline_current_golden_boot')
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
-- No producer schedule, consumer wiring or publicAwardEligible=true is created.
-- Before remote application: verify INVOKER source-writer ACLs and real
-- multi-session lock behavior. The mandatory producer calls the shared TS
-- publication parser between two equal source-revision reads; SQL bindings are
-- structural checks, NOT a second editorial parser. The finish fence protects
-- that validation. Never add an application caller that bypasses it.
-- DB wall-clock regression can make an expired immutable snapshot appear fresh
-- again with a LOWER effective revision. Consumer MUST retain its per-scope
-- greatest decimal revision/tombstone and reject lower revisions. The pure TS
-- consumer implements ordering; UI wiring must persist expiry with a local
-- timer and visibility recovery, including when the network is offline.
-- Pending may retain an immutable snapshot, but reads still require its ORIGINAL
-- expiry/source revision/bindings. Current-token validation rejection commits an
-- unavailable state and null pointer, returning an allowlisted reason. Superseded
-- tokens/replay conflicts cannot revoke a newer writer. A crash or operational
-- SQL failure cannot extend the old lease, nor proves that it was revoked.
-- Identical cached fetch times cannot extend an earlier issued deadline,
-- including after explicit failure clears the state pointer.
