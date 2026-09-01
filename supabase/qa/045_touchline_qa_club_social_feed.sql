-- QA-only first-party Club Social Feed / Timeline fan-out extending frozen 039-044.
-- References immutable approved drafts; it never duplicates media bytes and has no outbound delivery.
-- Local/shadow candidate only until independent audit and explicit QA apply authorisation.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
begin
  if pg_catalog.to_regclass('public.touchline_social_publication_drafts') is null
     or pg_catalog.to_regclass('public.touchline_social_ranking_generation_jobs') is null
     or pg_catalog.to_regclass('public.touchline_club_social_posts') is not null
     or pg_catalog.to_regclass('public.touchline_club_social_post_clubs') is not null
     or pg_catalog.to_regclass('public.touchline_club_social_tombstones') is not null
     or pg_catalog.to_regclass('public.touchline_club_social_fanout_jobs') is not null
     or pg_catalog.to_regclass('public.touchline_club_social_executor_cycles') is not null then
    raise exception 'TL_SOCIAL_CLUB_FEED_045_SCHEMA_PRECONDITION_FAILED';
  end if;
end
$$;

create table public.touchline_club_social_posts (
  id uuid primary key default gen_random_uuid(),
  source_draft_id uuid not null unique references public.touchline_social_publication_drafts(id) on delete restrict,
  canonical_scope_key text not null check (
    length(canonical_scope_key) between 1 and 720
    and canonical_scope_key ~ '^club-social:(INSTAGRAM_FEED|INSTAGRAM_STORY):[A-Z0-9_]+:[A-Za-z0-9:._=-]+$'
  ),
  content_type text not null check (content_type in (
    'LINEUP','FULL_TIME','GOAL_CONFIRMED','RED_CARD_CONFIRMED',
    'GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL','PLAYER_DUEL',
    'GAMEWEEK_HERO','TOP_PERFORMER','HAT_TRICK_HERO'
  )),
  source_checksum text not null check (source_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_revision_checksum text not null check (source_revision_checksum ~ '^sha256:[0-9a-f]{64}$'),
  manifest_checksum text not null check (manifest_checksum ~ '^sha256:[0-9a-f]{64}$'),
  artifact_checksum text not null check (artifact_checksum ~ '^sha256:[0-9a-f]{64}$'),
  timeline_copy text not null check (
    length(timeline_copy) between 1 and 2000
    and timeline_copy !~ '#'
    and timeline_copy !~* '(sportmonks|provider|(^|[^a-z])api([^a-z]|$)|instagram|swipe|coming soon|currently in testing)'
  ),
  timeline_copy_checksum text not null check (timeline_copy_checksum ~ '^sha256:[0-9a-f]{64}$'),
  channel text not null default 'CLUB_SOCIAL_FEED' check (channel = 'CLUB_SOCIAL_FEED'),
  published_at timestamptz not null,
  expires_at timestamptz not null,
  fanout_run_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at = published_at + interval '14 days')
);

create unique index touchline_club_social_posts_scope_key_unique
  on public.touchline_club_social_posts (canonical_scope_key);
create index touchline_club_social_posts_expiry_idx
  on public.touchline_club_social_posts (expires_at, id);

create table public.touchline_club_social_post_clubs (
  post_id uuid not null references public.touchline_club_social_posts(id) on delete cascade,
  club_id uuid not null references public.football_clubs(id) on delete restrict,
  provider_team_id text not null check (provider_team_id ~ '^[1-9][0-9]{0,19}$'),
  source_checksum text not null check (source_checksum ~ '^sha256:[0-9a-f]{64}$'),
  published_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (post_id, club_id),
  unique (post_id, provider_team_id),
  check (expires_at = published_at + interval '14 days')
);
create index touchline_club_social_post_clubs_feed_idx
  on public.touchline_club_social_post_clubs (provider_team_id, published_at desc, post_id desc);

create table public.touchline_club_social_tombstones (
  id uuid primary key default gen_random_uuid(),
  canonical_post_id uuid not null,
  source_draft_id uuid not null,
  canonical_scope_key text not null,
  source_checksum text not null check (source_checksum ~ '^sha256:[0-9a-f]{64}$'),
  channel text not null check (channel = 'CLUB_SOCIAL_FEED'),
  published_at timestamptz not null,
  deleted_at timestamptz not null,
  deletion_reason text not null check (deletion_reason in ('RETENTION_EXPIRED','SOURCE_SUPERSEDED')),
  lifecycle_run_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (canonical_post_id, deletion_reason),
  check (deleted_at >= published_at)
);

create table public.touchline_club_social_executor_cycles (
  component text primary key check (component in ('SCHEDULER','RUNNER')),
  lease_token uuid,
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  next_eligible_at timestamptz not null default '-infinity'::timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures between 0 and 1000),
  run_count bigint not null default 0 check (run_count >= 0),
  completed_count bigint not null default 0 check (completed_count between 0 and run_count),
  timeout_recovery_count bigint not null default 0 check (timeout_recovery_count >= 0),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_outcome text check (last_outcome is null or last_outcome in ('SUCCESS','FAILURE')),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,160}$'),
  last_items_processed integer not null default 0 check (last_items_processed between 0 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (lease_token is null and lease_expires_at is null and lease_heartbeat_at is null)
    or (lease_token is not null and lease_expires_at is not null and lease_heartbeat_at is not null)
  ),
  check (
    (last_outcome = 'SUCCESS' and last_error_code is null)
    or (last_outcome = 'FAILURE' and last_error_code is not null)
    or last_outcome is null
  )
);

create table public.touchline_club_social_fanout_jobs (
  id uuid primary key default gen_random_uuid(),
  source_draft_id uuid not null unique references public.touchline_social_publication_drafts(id) on delete restrict,
  target_provider_team_ids text[] not null,
  timeline_copy text not null check (length(timeline_copy) between 1 and 2000),
  timeline_copy_checksum text not null check (timeline_copy_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_checksum text not null check (source_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_revision_checksum text not null check (source_revision_checksum ~ '^sha256:[0-9a-f]{64}$'),
  job_state text not null check (job_state in ('PENDING','RUNNING','RETRY_WAIT','COMPLETED','REVIEW_REQUIRED','ARCHIVED')),
  reason_code text not null check (reason_code ~ '^[A-Z0-9_:-]{1,160}$'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  max_attempts integer not null default 5 check (max_attempts = 5),
  next_eligible_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  generated_post_id uuid references public.touchline_club_social_posts(id) on delete restrict,
  archived_post_id uuid,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,160}$'),
  first_scheduled_at timestamptz not null default clock_timestamp(),
  last_scheduled_at timestamptz not null default clock_timestamp(),
  last_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (coalesce(array_length(target_provider_team_ids, 1), 0) between 1 and 20),
  check (array_to_string(target_provider_team_ids, ',') ~ '^[1-9][0-9]{0,19}(,[1-9][0-9]{0,19}){0,19}$'),
  check (timeline_copy !~ '#' and timeline_copy !~* '(sportmonks|provider|(^|[^a-z])api([^a-z]|$)|instagram|swipe|coming soon|currently in testing)'),
  check (
    (job_state = 'PENDING' and next_eligible_at is not null and lease_token is null
      and lease_expires_at is null and lease_heartbeat_at is null and generated_post_id is null
      and archived_post_id is null and completed_at is null and last_error_code is null)
    or (job_state = 'RUNNING' and next_eligible_at is null and lease_token is not null
      and lease_expires_at is not null and lease_heartbeat_at is not null
      and generated_post_id is null and archived_post_id is null and completed_at is null)
    or (job_state = 'RETRY_WAIT' and next_eligible_at is not null and lease_token is null
      and lease_expires_at is null and lease_heartbeat_at is null and generated_post_id is null
      and archived_post_id is null and completed_at is null and last_error_code is not null)
    or (job_state = 'COMPLETED' and next_eligible_at is null and lease_token is null
      and lease_expires_at is null and lease_heartbeat_at is null and generated_post_id is not null
      and archived_post_id is null and completed_at is not null and last_error_code is null)
    or (job_state = 'REVIEW_REQUIRED' and next_eligible_at is null and lease_token is null
      and lease_expires_at is null and lease_heartbeat_at is null and generated_post_id is null
      and archived_post_id is null and completed_at is not null and last_error_code is not null)
    or (job_state = 'ARCHIVED' and next_eligible_at is null and lease_token is null
      and lease_expires_at is null and lease_heartbeat_at is null and generated_post_id is null
      and archived_post_id is not null and completed_at is not null and last_error_code is null)
  )
);
create index touchline_club_social_fanout_jobs_claim_idx
  on public.touchline_club_social_fanout_jobs (job_state, next_eligible_at, first_scheduled_at);

alter table public.touchline_club_social_posts enable row level security;
alter table public.touchline_club_social_posts force row level security;
alter table public.touchline_club_social_post_clubs enable row level security;
alter table public.touchline_club_social_post_clubs force row level security;
alter table public.touchline_club_social_tombstones enable row level security;
alter table public.touchline_club_social_tombstones force row level security;
alter table public.touchline_club_social_executor_cycles enable row level security;
alter table public.touchline_club_social_executor_cycles force row level security;
alter table public.touchline_club_social_fanout_jobs enable row level security;
alter table public.touchline_club_social_fanout_jobs force row level security;

revoke all on public.touchline_club_social_posts from public, anon, authenticated, service_role;
revoke all on public.touchline_club_social_post_clubs from public, anon, authenticated, service_role;
revoke all on public.touchline_club_social_tombstones from public, anon, authenticated, service_role;
revoke all on public.touchline_club_social_executor_cycles from public, anon, authenticated, service_role;
revoke all on public.touchline_club_social_fanout_jobs from public, anon, authenticated, service_role;

create or replace function public.touchline_social_045_claim_cycle(p_component text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_cycle public.touchline_club_social_executor_cycles%rowtype; v_token uuid;
begin
  if p_component not in ('SCHEDULER','RUNNER') then
    raise exception 'TL_SOCIAL_CLUB_FEED_CYCLE_FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-executor:' || p_component, 0));
  select * into v_cycle from public.touchline_club_social_executor_cycles where component = p_component for update;
  if v_cycle.lease_token is not null and v_cycle.lease_expires_at > v_now then
    return pg_catalog.jsonb_build_object('outcome','busy','leaseExpiresAt',v_cycle.lease_expires_at);
  end if;
  if v_cycle.next_eligible_at > v_now then
    return pg_catalog.jsonb_build_object('outcome','backoff','nextEligibleAt',v_cycle.next_eligible_at);
  end if;
  v_token := gen_random_uuid();
  update public.touchline_club_social_executor_cycles set
    lease_token=v_token, lease_expires_at=v_now + interval '2 minutes', lease_heartbeat_at=v_now,
    last_started_at=v_now, run_count=run_count+1,
    timeout_recovery_count=timeout_recovery_count + case when lease_token is not null then 1 else 0 end,
    updated_at=v_now where component=p_component;
  return pg_catalog.jsonb_build_object('outcome','claimed','leaseToken',v_token,'leaseExpiresAt',v_now + interval '2 minutes');
end
$$;

create or replace function public.touchline_social_045_renew_cycle(p_component text, p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-executor:' || p_component,0));
  update public.touchline_club_social_executor_cycles set lease_expires_at=v_now + interval '2 minutes',
    lease_heartbeat_at=v_now, updated_at=v_now
  where component=p_component and lease_token=p_lease_token and lease_expires_at > v_now;
  if not found then raise exception 'TL_SOCIAL_CLUB_FEED_CYCLE_LEASE_INVALID'; end if;
  return pg_catalog.jsonb_build_object('outcome','renewed','leaseExpiresAt',v_now + interval '2 minutes');
end
$$;

create or replace function public.touchline_social_045_complete_cycle(
  p_component text, p_lease_token uuid, p_outcome text, p_error_code text, p_items integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_failures integer;
begin
  if p_outcome not in ('SUCCESS','FAILURE')
     or coalesce(p_items,-1) not between 0 and 1000
     or (p_outcome='SUCCESS' and p_error_code is not null)
     or (p_outcome='FAILURE' and coalesce(p_error_code,'') !~ '^[A-Z0-9_:-]{1,160}$') then
    raise exception 'TL_SOCIAL_CLUB_FEED_CYCLE_COMPLETION_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-executor:' || p_component,0));
  select consecutive_failures into v_failures from public.touchline_club_social_executor_cycles
    where component=p_component and lease_token=p_lease_token and lease_expires_at > v_now for update;
  if not found then raise exception 'TL_SOCIAL_CLUB_FEED_CYCLE_LEASE_INVALID'; end if;
  update public.touchline_club_social_executor_cycles set
    lease_token=null, lease_expires_at=null, lease_heartbeat_at=null,
    consecutive_failures=case when p_outcome='SUCCESS' then 0 else least(v_failures+1,1000) end,
    next_eligible_at=case when p_outcome='SUCCESS' then v_now else v_now + make_interval(secs => least(300, 15 * power(2, least(v_failures,4))::integer)) end,
    completed_count=completed_count+1, last_completed_at=v_now,
    last_success_at=case when p_outcome='SUCCESS' then v_now else last_success_at end,
    last_failure_at=case when p_outcome='FAILURE' then v_now else last_failure_at end,
    last_outcome=p_outcome, last_error_code=p_error_code, last_items_processed=p_items, updated_at=v_now
  where component=p_component;
  return pg_catalog.jsonb_build_object('outcome','completed');
end
$$;

create or replace function public.touchline_social_045_expected_team_ids(p_draft_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare v_draft public.touchline_social_publication_drafts%rowtype; v_fixture public.football_fixtures%rowtype;
  v_fixture_teams text[]; v_subject_team text; v_league_teams text[];
begin
  select * into v_draft from public.touchline_social_publication_drafts where id=p_draft_id;
  if not found or v_draft.content_type in ('MATCH_PREVIEW','FINAL_SCORE') then return null; end if;
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
  elsif v_draft.content_type in ('FULL_TIME','GOAL_CONFIRMED','RED_CARD_CONFIRMED','PLAYER_DUEL') then
    return v_fixture_teams;
  elsif v_draft.content_type in ('GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL') then
    select array_agg(club.provider_team_id order by club.provider_team_id::numeric) into v_league_teams
    from public.football_clubs club where club.provider='sportmonks' and club.competition_id=v_fixture.competition_id;
    if coalesce(array_length(v_league_teams,1),0) <> 20 then return null; end if;
    return v_league_teams;
  elsif v_draft.content_type in ('GAMEWEEK_HERO','TOP_PERFORMER','HAT_TRICK_HERO') then
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

create or replace function public.touchline_social_045_enqueue_job(
  p_scheduler_lease_token uuid, p_draft_id uuid, p_target_team_ids text[],
  p_timeline_copy text, p_timeline_copy_checksum text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycle public.touchline_club_social_executor_cycles%rowtype; v_draft public.touchline_social_publication_drafts%rowtype;
  v_expected text[]; v_normalized text[]; v_expected_copy_checksum text; v_job public.touchline_club_social_fanout_jobs%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-executor:SCHEDULER',0));
  select * into v_cycle from public.touchline_club_social_executor_cycles where component='SCHEDULER' for update;
  if v_cycle.lease_token is distinct from p_scheduler_lease_token or v_cycle.lease_expires_at <= clock_timestamp() then
    raise exception 'TL_SOCIAL_CLUB_FEED_SCHEDULER_LEASE_INVALID';
  end if;
  select * into v_draft from public.touchline_social_publication_drafts where id=p_draft_id for share;
  if not found or v_draft.approval_state <> 'APPROVED'
     or v_draft.artwork_approval_state <> 'APPROVED' or v_draft.caption_approval_state <> 'APPROVED'
     or v_draft.approved_artifact_checksum is distinct from v_draft.artifact_checksum
     or v_draft.approved_caption_checksum is distinct from v_draft.caption_checksum
     or v_draft.approved_manifest_checksum is distinct from v_draft.manifest_checksum
     or not public.touchline_social_source_revision_is_current(v_draft.source_revision_manifest,v_draft.source_revision_checksum) then
    raise exception 'TL_SOCIAL_CLUB_FEED_DRAFT_NOT_CURRENT_APPROVED';
  end if;
  v_expected := public.touchline_social_045_expected_team_ids(p_draft_id);
  select array_agg(team_id order by team_id::numeric) into v_normalized from (
    select distinct btrim(team_id) as team_id from unnest(coalesce(p_target_team_ids,array[]::text[])) team_id
  ) normalized where team_id ~ '^[1-9][0-9]{0,19}$';
  if v_expected is null or v_normalized is distinct from v_expected
     or exists (select 1 from unnest(v_expected) team_id left join public.football_clubs club
       on club.provider='sportmonks' and club.provider_team_id=team_id
       group by team_id having count(club.id) <> 1) then
    raise exception 'TL_SOCIAL_CLUB_FEED_TARGETS_INVALID';
  end if;
  v_expected_copy_checksum := 'sha256:' || pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to('touchline-club-social-copy-v1' || E'\n' || p_timeline_copy,'UTF8'),'sha256'),'hex');
  if coalesce(p_timeline_copy,'')='' or length(p_timeline_copy)>2000 or p_timeline_copy ~ '#'
     or p_timeline_copy ~* '(sportmonks|provider|(^|[^a-z])api([^a-z]|$)|instagram|swipe|coming soon|currently in testing)'
     or p_timeline_copy_checksum is distinct from v_expected_copy_checksum then
    raise exception 'TL_SOCIAL_CLUB_FEED_COPY_INVALID';
  end if;
  insert into public.touchline_club_social_fanout_jobs (
    source_draft_id,target_provider_team_ids,timeline_copy,timeline_copy_checksum,
    source_checksum,source_revision_checksum,job_state,reason_code,next_eligible_at
  ) values (
    p_draft_id,v_expected,p_timeline_copy,p_timeline_copy_checksum,
    v_draft.source_checksum,v_draft.source_revision_checksum,'PENDING','APPROVED_DRAFT_READY',clock_timestamp()
  ) on conflict (source_draft_id) do update set last_scheduled_at=clock_timestamp()
    where touchline_club_social_fanout_jobs.target_provider_team_ids=excluded.target_provider_team_ids
      and touchline_club_social_fanout_jobs.timeline_copy_checksum=excluded.timeline_copy_checksum
      and touchline_club_social_fanout_jobs.source_checksum=excluded.source_checksum
      and touchline_club_social_fanout_jobs.source_revision_checksum=excluded.source_revision_checksum
  returning * into v_job;
  if not found then raise exception 'TL_SOCIAL_CLUB_FEED_JOB_IDENTITY_CONFLICT'; end if;
  return pg_catalog.jsonb_build_object('outcome','queued','jobId',v_job.id,'state',v_job.job_state);
end
$$;

create or replace function public.touchline_social_045_claim_job(p_runner_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz:=clock_timestamp(); v_cycle public.touchline_club_social_executor_cycles%rowtype;
  v_job public.touchline_club_social_fanout_jobs%rowtype; v_draft public.touchline_social_publication_drafts%rowtype; v_token uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-executor:RUNNER',0));
  select * into v_cycle from public.touchline_club_social_executor_cycles where component='RUNNER' for update;
  if v_cycle.lease_token is distinct from p_runner_lease_token or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_CLUB_FEED_RUNNER_LEASE_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-job-queue',0));
  update public.touchline_club_social_fanout_jobs set
    job_state=case when attempt_count>=max_attempts then 'REVIEW_REQUIRED' else 'RETRY_WAIT' end,
    reason_code=case when attempt_count>=max_attempts then 'FANOUT_RETRY_EXHAUSTED' else 'FANOUT_LEASE_EXPIRED' end,
    next_eligible_at=case when attempt_count>=max_attempts then null else v_now+interval '30 seconds' end,
    lease_token=null,lease_expires_at=null,lease_heartbeat_at=null,
    last_error_code='FANOUT_LEASE_EXPIRED',
    completed_at=case when attempt_count>=max_attempts then v_now else null end,
    updated_at=v_now
  where job_state='RUNNING' and lease_expires_at<=v_now;
  select * into v_job from public.touchline_club_social_fanout_jobs
    where job_state in ('PENDING','RETRY_WAIT') and next_eligible_at <= v_now
    order by first_scheduled_at,id for update skip locked limit 1;
  if not found then return pg_catalog.jsonb_build_object('outcome','empty'); end if;
  select * into v_draft from public.touchline_social_publication_drafts where id=v_job.source_draft_id for share;
  if not found or v_draft.approval_state <> 'APPROVED'
     or v_draft.source_checksum is distinct from v_job.source_checksum
     or v_draft.source_revision_checksum is distinct from v_job.source_revision_checksum
     or not public.touchline_social_source_revision_is_current(v_draft.source_revision_manifest,v_draft.source_revision_checksum) then
    update public.touchline_club_social_fanout_jobs set job_state='REVIEW_REQUIRED',reason_code='SOURCE_OR_APPROVAL_STALE',
      next_eligible_at=null,completed_at=v_now,last_error_code='SOURCE_OR_APPROVAL_STALE',updated_at=v_now where id=v_job.id;
    return pg_catalog.jsonb_build_object('outcome','review_required','jobId',v_job.id);
  end if;
  v_token:=gen_random_uuid();
  update public.touchline_club_social_fanout_jobs set job_state='RUNNING',reason_code='RUNNER_CLAIMED',
    attempt_count=attempt_count+1,next_eligible_at=null,lease_token=v_token,
    lease_expires_at=v_now+interval '2 minutes',lease_heartbeat_at=v_now,last_started_at=v_now,last_error_code=null,updated_at=v_now
    where id=v_job.id;
  return pg_catalog.jsonb_build_object('outcome','claimed','jobId',v_job.id,'leaseToken',v_token,
    'draftId',v_job.source_draft_id,'targetTeamIds',v_job.target_provider_team_ids,
    'timelineCopy',v_job.timeline_copy,'timelineCopyChecksum',v_job.timeline_copy_checksum);
end
$$;

create or replace function public.touchline_social_045_renew_job(
  p_runner_lease_token uuid,p_job_id uuid,p_job_lease_token uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz:=clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-executor:RUNNER',0));
  if not exists (select 1 from public.touchline_club_social_executor_cycles where component='RUNNER'
    and lease_token=p_runner_lease_token and lease_expires_at>v_now for update)
  then raise exception 'TL_SOCIAL_CLUB_FEED_RUNNER_LEASE_INVALID'; end if;
  update public.touchline_club_social_fanout_jobs set lease_expires_at=v_now+interval '2 minutes',lease_heartbeat_at=v_now,updated_at=v_now
    where id=p_job_id and job_state='RUNNING' and lease_token=p_job_lease_token and lease_expires_at>v_now;
  if not found then raise exception 'TL_SOCIAL_CLUB_FEED_JOB_LEASE_INVALID'; end if;
  return pg_catalog.jsonb_build_object('outcome','renewed');
end
$$;

create or replace function public.touchline_social_045_complete_job(
  p_runner_lease_token uuid,p_job_id uuid,p_job_lease_token uuid,p_outcome text,p_reason_code text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz:=clock_timestamp(); v_job public.touchline_club_social_fanout_jobs%rowtype;
  v_draft public.touchline_social_publication_drafts%rowtype; v_scope text; v_post_id uuid; v_old record; v_run_id uuid:=gen_random_uuid();
begin
  if p_outcome not in ('PUBLISHED','RETRY','REVIEW_REQUIRED')
     or coalesce(p_reason_code,'') !~ '^[A-Z0-9_:-]{1,160}$' then
    raise exception 'TL_SOCIAL_CLUB_FEED_JOB_COMPLETION_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-executor:RUNNER',0));
  if not exists (select 1 from public.touchline_club_social_executor_cycles where component='RUNNER'
    and lease_token=p_runner_lease_token and lease_expires_at>v_now for update) then
    raise exception 'TL_SOCIAL_CLUB_FEED_RUNNER_LEASE_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-lifecycle',0));
  select * into v_job from public.touchline_club_social_fanout_jobs where id=p_job_id for update;
  if not found or v_job.job_state<>'RUNNING' or v_job.lease_token is distinct from p_job_lease_token
     or v_job.lease_expires_at<=v_now then raise exception 'TL_SOCIAL_CLUB_FEED_JOB_LEASE_INVALID'; end if;
  if p_outcome='PUBLISHED' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-draft:'||v_job.source_draft_id::text,0));
    select * into v_draft from public.touchline_social_publication_drafts where id=v_job.source_draft_id for share;
    if not found or v_draft.approval_state<>'APPROVED'
       or v_draft.artwork_approval_state<>'APPROVED'
       or v_draft.caption_approval_state<>'APPROVED'
       or v_draft.approved_artifact_checksum is distinct from v_draft.artifact_checksum
       or v_draft.approved_caption_checksum is distinct from v_draft.caption_checksum
       or v_draft.approved_manifest_checksum is distinct from v_draft.manifest_checksum
       or v_draft.source_checksum is distinct from v_job.source_checksum
       or v_draft.source_revision_checksum is distinct from v_job.source_revision_checksum
       or public.touchline_social_045_expected_team_ids(v_draft.id) is distinct from v_job.target_provider_team_ids
       or not public.touchline_social_source_revision_is_current(v_draft.source_revision_manifest,v_draft.source_revision_checksum) then
      raise exception 'TL_SOCIAL_CLUB_FEED_SOURCE_STALE';
    end if;
    v_scope:=regexp_replace(regexp_replace(v_draft.publication_key,'^instagram:','club-social:'),':r=[0-9]+$','');
    for v_old in select * from public.touchline_club_social_posts where canonical_scope_key=v_scope for update loop
      insert into public.touchline_club_social_tombstones (
        canonical_post_id,source_draft_id,canonical_scope_key,source_checksum,channel,
        published_at,deleted_at,deletion_reason,lifecycle_run_id
      ) values (v_old.id,v_old.source_draft_id,v_old.canonical_scope_key,v_old.source_checksum,
        v_old.channel,v_old.published_at,v_now,'SOURCE_SUPERSEDED',v_run_id) on conflict do nothing;
      update public.touchline_club_social_fanout_jobs set
        job_state='ARCHIVED',reason_code='SOURCE_SUPERSEDED',archived_post_id=generated_post_id,
        generated_post_id=null,updated_at=v_now
      where generated_post_id=v_old.id and job_state='COMPLETED';
      delete from public.touchline_club_social_posts where id=v_old.id;
    end loop;
    insert into public.touchline_club_social_posts (
      source_draft_id,canonical_scope_key,content_type,source_checksum,source_revision_checksum,
      manifest_checksum,artifact_checksum,timeline_copy,timeline_copy_checksum,published_at,expires_at,fanout_run_id
    ) values (
      v_draft.id,v_scope,v_draft.content_type,v_draft.source_checksum,v_draft.source_revision_checksum,
      v_draft.manifest_checksum,v_draft.artifact_checksum,v_job.timeline_copy,v_job.timeline_copy_checksum,
      v_now,v_now+interval '14 days',v_run_id
    ) returning id into v_post_id;
    insert into public.touchline_club_social_post_clubs (
      post_id,club_id,provider_team_id,source_checksum,published_at,expires_at
    ) select v_post_id,club.id,club.provider_team_id,v_draft.source_checksum,v_now,v_now+interval '14 days'
      from unnest(v_job.target_provider_team_ids) team_id
      join public.football_clubs club on club.provider='sportmonks' and club.provider_team_id=team_id;
    if (select count(*) from public.touchline_club_social_post_clubs where post_id=v_post_id)
       <> array_length(v_job.target_provider_team_ids,1) then raise exception 'TL_SOCIAL_CLUB_FEED_FANOUT_INCOMPLETE'; end if;
    update public.touchline_club_social_fanout_jobs set job_state='COMPLETED',reason_code=p_reason_code,
      next_eligible_at=null,lease_token=null,lease_expires_at=null,lease_heartbeat_at=null,
      generated_post_id=v_post_id,completed_at=v_now,last_error_code=null,updated_at=v_now where id=v_job.id;
    return pg_catalog.jsonb_build_object('outcome','published','postId',v_post_id,'fanoutCount',array_length(v_job.target_provider_team_ids,1));
  elsif p_outcome='RETRY' and v_job.attempt_count < v_job.max_attempts then
    update public.touchline_club_social_fanout_jobs set job_state='RETRY_WAIT',reason_code=p_reason_code,
      next_eligible_at=v_now+make_interval(secs=>least(300,15*power(2,least(attempt_count-1,4))::integer)),
      lease_token=null,lease_expires_at=null,lease_heartbeat_at=null,last_error_code=p_reason_code,updated_at=v_now where id=v_job.id;
    return pg_catalog.jsonb_build_object('outcome','retry_wait');
  else
    update public.touchline_club_social_fanout_jobs set job_state='REVIEW_REQUIRED',reason_code=p_reason_code,
      next_eligible_at=null,lease_token=null,lease_expires_at=null,lease_heartbeat_at=null,
      completed_at=v_now,last_error_code=p_reason_code,updated_at=v_now where id=v_job.id;
    return pg_catalog.jsonb_build_object('outcome','review_required');
  end if;
end
$$;

create or replace function public.touchline_social_045_expire_posts(p_run_id uuid,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz:=clock_timestamp(); v_post record; v_count integer:=0;
begin
  if p_run_id is null or coalesce(p_limit,0) not between 1 and 100 then
    raise exception 'TL_SOCIAL_CLUB_FEED_RETENTION_INVALID';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-retention',0)) then
    return pg_catalog.jsonb_build_object('outcome','busy','deleted',0);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-045-lifecycle',0));
  for v_post in select * from public.touchline_club_social_posts
    where expires_at<=v_now order by expires_at,id for update skip locked limit p_limit
  loop
    insert into public.touchline_club_social_tombstones (
      canonical_post_id,source_draft_id,canonical_scope_key,source_checksum,channel,
      published_at,deleted_at,deletion_reason,lifecycle_run_id
    ) values (v_post.id,v_post.source_draft_id,v_post.canonical_scope_key,v_post.source_checksum,
      v_post.channel,v_post.published_at,v_now,'RETENTION_EXPIRED',p_run_id) on conflict do nothing;
    update public.touchline_club_social_fanout_jobs set
      job_state='ARCHIVED',reason_code='RETENTION_EXPIRED',archived_post_id=generated_post_id,
      generated_post_id=null,updated_at=v_now
    where generated_post_id=v_post.id and job_state='COMPLETED';
    delete from public.touchline_club_social_posts where id=v_post.id;
    v_count:=v_count+1;
  end loop;
  return pg_catalog.jsonb_build_object('outcome','completed','deleted',v_count);
end
$$;

create or replace function public.touchline_social_045_read_feed(
  p_team_provider_id text,p_limit integer default 6,p_before_published_at timestamptz default null,p_before_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_items jsonb; v_limit integer:=least(greatest(coalesce(p_limit,6),1),12);
begin
  if coalesce(p_team_provider_id,'') !~ '^[1-9][0-9]{0,19}$'
     or ((p_before_published_at is null) <> (p_before_id is null)) then
    raise exception 'TL_SOCIAL_CLUB_FEED_READ_INVALID';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'postId',feed.post_id,'contentType',feed.content_type,'copy',feed.timeline_copy,
    'sourceChecksum',feed.source_checksum,'publishedAt',feed.published_at,'expiresAt',feed.expires_at,
    'artifactBucket',feed.artifact_storage_bucket,'artifactKey',feed.artifact_storage_key,
    'artifactChecksum',feed.artifact_checksum,'width',feed.width,'height',feed.height
  ) order by feed.published_at desc,feed.post_id desc),'[]'::jsonb) into v_items from (
    select post.id post_id,post.content_type,post.timeline_copy,post.source_checksum,post.published_at,post.expires_at,
      draft.artifact_storage_bucket,draft.artifact_storage_key,draft.artifact_checksum,draft.width,draft.height
    from public.touchline_club_social_post_clubs ref
    join public.touchline_club_social_posts post on post.id=ref.post_id
    join public.touchline_social_publication_drafts draft on draft.id=post.source_draft_id
    where ref.provider_team_id=p_team_provider_id and post.expires_at>clock_timestamp()
      and draft.approval_state='APPROVED'
      and draft.approved_artifact_checksum=draft.artifact_checksum
      and draft.approved_caption_checksum=draft.caption_checksum
      and draft.approved_manifest_checksum=draft.manifest_checksum
      and public.touchline_social_source_revision_is_current(draft.source_revision_manifest,draft.source_revision_checksum)
      and (p_before_published_at is null or (post.published_at,post.id)<(p_before_published_at,p_before_id))
    order by post.published_at desc,post.id desc limit v_limit+1
  ) feed;
  return pg_catalog.jsonb_build_object('items',v_items,'limit',v_limit);
end
$$;

create or replace function public.touchline_social_045_admin_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycles jsonb; v_jobs jsonb; v_posts jsonb; v_job_count bigint; v_post_count bigint; v_tombstone_count bigint;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'component',cycle.component,
    'lease_token',case when cycle.lease_token is null then null else 'active' end,
    'lease_expires_at',cycle.lease_expires_at,'next_eligible_at',cycle.next_eligible_at,
    'consecutive_failures',cycle.consecutive_failures,'run_count',cycle.run_count,
    'completed_count',cycle.completed_count,'timeout_recovery_count',cycle.timeout_recovery_count,
    'last_started_at',cycle.last_started_at,'last_completed_at',cycle.last_completed_at,
    'last_success_at',cycle.last_success_at,'last_failure_at',cycle.last_failure_at,
    'last_outcome',cycle.last_outcome,'last_error_code',cycle.last_error_code,
    'last_items_processed',cycle.last_items_processed
  ) order by cycle.component),'[]'::jsonb) into v_cycles
  from public.touchline_club_social_executor_cycles cycle;

  select count(*) into v_job_count from public.touchline_club_social_fanout_jobs;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(job_row) order by job_row.last_scheduled_at desc),'[]'::jsonb)
    into v_jobs from (
      select id,source_draft_id,target_provider_team_ids,job_state,reason_code,attempt_count,
        next_eligible_at,completed_at,last_scheduled_at
      from public.touchline_club_social_fanout_jobs order by last_scheduled_at desc limit 50
    ) job_row;

  select count(*) into v_post_count from public.touchline_club_social_posts;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(post_row) order by post_row.published_at desc),'[]'::jsonb)
    into v_posts from (
      select id,content_type,published_at,expires_at
      from public.touchline_club_social_posts order by published_at desc limit 12
    ) post_row;
  select count(*) into v_tombstone_count from public.touchline_club_social_tombstones;

  return pg_catalog.jsonb_build_object(
    'cycles',v_cycles,'jobs',v_jobs,'jobCount',v_job_count,
    'posts',v_posts,'postCount',v_post_count,'tombstoneCount',v_tombstone_count
  );
end
$$;

insert into public.touchline_club_social_executor_cycles(component) values ('SCHEDULER'),('RUNNER');

revoke all on function public.touchline_social_045_claim_cycle(text) from public,anon,authenticated;
revoke all on function public.touchline_social_045_renew_cycle(text,uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_045_complete_cycle(text,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.touchline_social_045_expected_team_ids(uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_045_enqueue_job(uuid,uuid,text[],text,text) from public,anon,authenticated;
revoke all on function public.touchline_social_045_claim_job(uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_045_renew_job(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_045_complete_job(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.touchline_social_045_expire_posts(uuid,integer) from public,anon,authenticated;
revoke all on function public.touchline_social_045_read_feed(text,integer,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.touchline_social_045_admin_status() from public,anon,authenticated;

grant execute on function public.touchline_social_045_claim_cycle(text) to service_role;
grant execute on function public.touchline_social_045_renew_cycle(text,uuid) to service_role;
grant execute on function public.touchline_social_045_complete_cycle(text,uuid,text,text,integer) to service_role;
grant execute on function public.touchline_social_045_expected_team_ids(uuid) to service_role;
grant execute on function public.touchline_social_045_enqueue_job(uuid,uuid,text[],text,text) to service_role;
grant execute on function public.touchline_social_045_claim_job(uuid) to service_role;
grant execute on function public.touchline_social_045_renew_job(uuid,uuid,uuid) to service_role;
grant execute on function public.touchline_social_045_complete_job(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.touchline_social_045_expire_posts(uuid,integer) to service_role;
grant execute on function public.touchline_social_045_read_feed(text,integer,timestamptz,uuid) to service_role;
grant execute on function public.touchline_social_045_admin_status() to service_role;

commit;
