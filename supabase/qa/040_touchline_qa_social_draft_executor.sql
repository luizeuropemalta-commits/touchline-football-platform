-- QA-only durable scheduler/queue/runner control plane for social LINE-UP DRAFTs.
--
-- This migration is intentionally outside supabase/migrations. It is a local
-- candidate for independent audit and must never be applied implicitly to
-- Preview or Production. Migration 039 remains the approval/outbox authority.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
begin
  if pg_catalog.to_regclass('public.touchline_social_publication_drafts') is null
     or pg_catalog.to_regclass('public.touchline_social_generation_reviews') is null
     or pg_catalog.to_regclass('public.touchline_social_generation_cycles') is null
     or pg_catalog.to_regclass('public.touchline_social_executor_cycles') is not null
     or pg_catalog.to_regclass('public.touchline_social_generation_jobs') is not null then
    raise exception 'TL_SOCIAL_EXECUTOR_040_SCHEMA_PRECONDITION_FAILED';
  end if;
end
$$;

create table public.touchline_social_executor_cycles (
  component text primary key check (component in ('SCHEDULER', 'RUNNER')),
  lease_token uuid,
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  next_eligible_at timestamptz not null default '-infinity'::timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures between 0 and 1000),
  run_count bigint not null default 0 check (run_count >= 0),
  completed_count bigint not null default 0 check (completed_count >= 0 and completed_count <= run_count),
  timeout_recovery_count bigint not null default 0 check (timeout_recovery_count >= 0),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_outcome text check (last_outcome is null or last_outcome in ('SUCCESS', 'FAILURE')),
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,160}$'
  ),
  last_items_processed integer not null default 0 check (last_items_processed between 0 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (lease_token is null and lease_expires_at is null and lease_heartbeat_at is null)
    or (lease_token is not null and lease_expires_at is not null and lease_heartbeat_at is not null)
  ),
  check (last_completed_at is null or last_started_at is not null),
  check (last_success_at is null or last_completed_at is not null),
  check (last_failure_at is null or last_completed_at is not null),
  check (
    (last_outcome = 'SUCCESS' and last_error_code is null)
    or (last_outcome = 'FAILURE' and last_error_code is not null)
    or last_outcome is null
  )
);

create table public.touchline_social_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  fixture_provider_id text not null check (fixture_provider_id ~ '^[1-9][0-9]{0,19}$'),
  team_provider_id text not null check (team_provider_id ~ '^[1-9][0-9]{0,19}$'),
  content_type text not null check (content_type = 'LINEUP'),
  template_version text not null check (template_version ~ '^[A-Za-z0-9._-]{1,160}$'),
  first_observed_at timestamptz not null,
  starts_at timestamptz not null,
  input_checksum text not null check (input_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_revision_manifest jsonb not null check (
    jsonb_typeof(source_revision_manifest) = 'object'
    and public.touchline_social_jsonb_object_length(source_revision_manifest) between 1 and 128
  ),
  source_revision_checksum text not null check (source_revision_checksum ~ '^sha256:[0-9a-f]{64}$'),
  job_state text not null check (
    job_state in ('PENDING', 'RUNNING', 'RETRY_WAIT', 'COMPLETED', 'REVIEW_REQUIRED', 'SUPERSEDED')
  ),
  reason_code text not null check (reason_code ~ '^[A-Z0-9_:-]{1,160}$'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  max_attempts integer not null default 5 check (max_attempts = 5),
  next_eligible_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  generated_draft_id uuid references public.touchline_social_publication_drafts(id) on delete restrict,
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,160}$'
  ),
  first_scheduled_at timestamptz not null default clock_timestamp(),
  last_scheduled_at timestamptz not null default clock_timestamp(),
  last_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (
    fixture_provider_id,
    team_provider_id,
    content_type,
    template_version,
    input_checksum,
    source_revision_checksum
  ),
  check (first_observed_at <= starts_at + interval '24 hours'),
  check (last_scheduled_at >= first_scheduled_at),
  check (last_started_at is null or last_started_at >= first_scheduled_at),
  check (
    (job_state = 'PENDING'
      and next_eligible_at is not null
      and lease_token is null and lease_expires_at is null and lease_heartbeat_at is null
      and generated_draft_id is null and completed_at is null and last_error_code is null)
    or (job_state = 'RUNNING'
      and next_eligible_at is null
      and lease_token is not null and lease_expires_at is not null and lease_heartbeat_at is not null
      and generated_draft_id is null and completed_at is null)
    or (job_state = 'RETRY_WAIT'
      and next_eligible_at is not null
      and lease_token is null and lease_expires_at is null and lease_heartbeat_at is null
      and generated_draft_id is null and completed_at is null and last_error_code is not null)
    or (job_state = 'COMPLETED'
      and next_eligible_at is null
      and lease_token is null and lease_expires_at is null and lease_heartbeat_at is null
      and generated_draft_id is not null and completed_at is not null and last_error_code is null)
    or (job_state in ('REVIEW_REQUIRED', 'SUPERSEDED')
      and next_eligible_at is null
      and lease_token is null and lease_expires_at is null and lease_heartbeat_at is null
      and generated_draft_id is null and completed_at is not null)
  )
);

create index touchline_social_generation_jobs_ready_idx
  on public.touchline_social_generation_jobs (next_eligible_at, first_scheduled_at, id)
  where job_state in ('PENDING', 'RETRY_WAIT');

create index touchline_social_generation_jobs_lease_idx
  on public.touchline_social_generation_jobs (lease_expires_at)
  where job_state = 'RUNNING';

create index touchline_social_generation_jobs_fixture_idx
  on public.touchline_social_generation_jobs (
    fixture_provider_id, team_provider_id, template_version, created_at desc
  );

create or replace function public.touchline_social_guard_executor_cycle_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transition text := coalesce(current_setting('touchline.social_executor_transition', true), '');
begin
  if tg_op = 'DELETE' then raise exception 'TL_SOCIAL_EXECUTOR_CYCLE_DELETE_FORBIDDEN'; end if;
  if v_transition not in ('claim', 'renew', 'complete') then
    raise exception 'TL_SOCIAL_EXECUTOR_CYCLE_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE' and new.component is distinct from old.component then
    raise exception 'TL_SOCIAL_EXECUTOR_CYCLE_IDENTITY_IMMUTABLE';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger touchline_social_executor_cycles_guard
before insert or update or delete on public.touchline_social_executor_cycles
for each row execute function public.touchline_social_guard_executor_cycle_mutation();

create or replace function public.touchline_social_guard_generation_job_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transition text := coalesce(current_setting('touchline.social_executor_transition', true), '');
begin
  if tg_op = 'DELETE' then raise exception 'TL_SOCIAL_GENERATION_JOB_DELETE_FORBIDDEN'; end if;
  if v_transition not in ('enqueue', 'claim_job', 'renew_job', 'complete_job', 'recover_job') then
    raise exception 'TL_SOCIAL_GENERATION_JOB_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE' and row(
    new.fixture_provider_id,
    new.team_provider_id,
    new.content_type,
    new.template_version,
    new.first_observed_at,
    new.starts_at,
    new.input_checksum,
    new.source_revision_manifest,
    new.source_revision_checksum,
    new.first_scheduled_at,
    new.created_at
  ) is distinct from row(
    old.fixture_provider_id,
    old.team_provider_id,
    old.content_type,
    old.template_version,
    old.first_observed_at,
    old.starts_at,
    old.input_checksum,
    old.source_revision_manifest,
    old.source_revision_checksum,
    old.first_scheduled_at,
    old.created_at
  ) then
    raise exception 'TL_SOCIAL_GENERATION_JOB_IDENTITY_IMMUTABLE';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger touchline_social_generation_jobs_guard
before insert or update or delete on public.touchline_social_generation_jobs
for each row execute function public.touchline_social_guard_generation_job_mutation();

create or replace function public.touchline_social_claim_executor_cycle(p_component text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.touchline_social_executor_cycles%rowtype;
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
  v_recovery_delay integer;
begin
  if coalesce(p_component, '') not in ('SCHEDULER', 'RUNNER') then
    raise exception 'TL_SOCIAL_EXECUTOR_COMPONENT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-executor:' || p_component, 0
  ));
  perform set_config('touchline.social_executor_transition', 'claim', true);
  insert into public.touchline_social_executor_cycles (component)
  values (p_component)
  on conflict (component) do nothing;
  select * into v_cycle
  from public.touchline_social_executor_cycles
  where component = p_component
  for update;
  if v_cycle.lease_token is not null and v_cycle.lease_expires_at > v_now then
    return jsonb_build_object(
      'ok', true, 'outcome', 'busy', 'leaseExpiresAt', v_cycle.lease_expires_at
    );
  end if;
  if v_cycle.lease_token is not null and v_cycle.lease_expires_at <= v_now then
    v_recovery_delay := least(300, 10 * (2 ^ least(v_cycle.consecutive_failures + 1, 5)))::integer;
    update public.touchline_social_executor_cycles
    set lease_token = null,
        lease_expires_at = null,
        lease_heartbeat_at = null,
        next_eligible_at = v_now + pg_catalog.make_interval(secs => v_recovery_delay),
        consecutive_failures = least(consecutive_failures + 1, 1000),
        completed_count = completed_count + 1,
        timeout_recovery_count = timeout_recovery_count + 1,
        last_completed_at = v_now,
        last_failure_at = v_now,
        last_outcome = 'FAILURE',
        last_error_code = p_component || '_LEASE_EXPIRED',
        last_items_processed = 0
    where component = p_component;
    return jsonb_build_object(
      'ok', true, 'outcome', 'recovered_timeout',
      'nextEligibleAt', v_now + pg_catalog.make_interval(secs => v_recovery_delay)
    );
  end if;
  if v_cycle.next_eligible_at > v_now then
    return jsonb_build_object(
      'ok', true, 'outcome', 'cooldown', 'nextEligibleAt', v_cycle.next_eligible_at
    );
  end if;
  update public.touchline_social_executor_cycles
  set lease_token = v_token,
      lease_expires_at = v_now + interval '2 minutes',
      lease_heartbeat_at = v_now,
      run_count = run_count + 1,
      last_started_at = v_now
  where component = p_component;
  return jsonb_build_object(
    'ok', true, 'outcome', 'claimed', 'leaseToken', v_token,
    'leaseExpiresAt', v_now + interval '2 minutes'
  );
end;
$$;

create or replace function public.touchline_social_renew_executor_cycle(
  p_component text,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.touchline_social_executor_cycles%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(p_component, '') not in ('SCHEDULER', 'RUNNER') or p_lease_token is null then
    raise exception 'TL_SOCIAL_EXECUTOR_RENEWAL_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-executor:' || p_component, 0
  ));
  select * into v_cycle
  from public.touchline_social_executor_cycles
  where component = p_component
  for update;
  if v_cycle.lease_token is distinct from p_lease_token or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_EXECUTOR_LEASE_INVALID';
  end if;
  perform set_config('touchline.social_executor_transition', 'renew', true);
  update public.touchline_social_executor_cycles
  set lease_expires_at = v_now + interval '2 minutes',
      lease_heartbeat_at = v_now
  where component = p_component;
  return jsonb_build_object(
    'ok', true, 'outcome', 'renewed', 'leaseExpiresAt', v_now + interval '2 minutes'
  );
end;
$$;

create or replace function public.touchline_social_complete_executor_cycle(
  p_component text,
  p_lease_token uuid,
  p_outcome text,
  p_error_code text,
  p_items_processed integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.touchline_social_executor_cycles%rowtype;
  v_now timestamptz := clock_timestamp();
  v_failures integer;
  v_delay integer;
begin
  if coalesce(p_component, '') not in ('SCHEDULER', 'RUNNER')
     or p_lease_token is null
     or coalesce(p_outcome, '') not in ('SUCCESS', 'FAILURE')
     or p_items_processed is null or p_items_processed < 0 or p_items_processed > 1000
     or (p_outcome = 'SUCCESS' and p_error_code is not null)
     or (p_outcome = 'FAILURE' and coalesce(p_error_code, '') !~ '^[A-Z0-9_:-]{1,160}$') then
    raise exception 'TL_SOCIAL_EXECUTOR_COMPLETION_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-executor:' || p_component, 0
  ));
  select * into v_cycle
  from public.touchline_social_executor_cycles
  where component = p_component
  for update;
  if v_cycle.lease_token is distinct from p_lease_token or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_EXECUTOR_LEASE_INVALID';
  end if;
  v_failures := case
    when p_outcome = 'SUCCESS' then 0
    else least(v_cycle.consecutive_failures + 1, 1000)
  end;
  v_delay := case
    when p_outcome = 'SUCCESS' then 10
    else least(300, 10 * (2 ^ least(v_failures, 5)))::integer
  end;
  perform set_config('touchline.social_executor_transition', 'complete', true);
  update public.touchline_social_executor_cycles
  set lease_token = null,
      lease_expires_at = null,
      lease_heartbeat_at = null,
      next_eligible_at = v_now + pg_catalog.make_interval(secs => v_delay),
      consecutive_failures = v_failures,
      completed_count = completed_count + 1,
      last_completed_at = v_now,
      last_success_at = case when p_outcome = 'SUCCESS' then v_now else last_success_at end,
      last_failure_at = case when p_outcome = 'FAILURE' then v_now else last_failure_at end,
      last_outcome = p_outcome,
      last_error_code = p_error_code,
      last_items_processed = p_items_processed
  where component = p_component;
  return jsonb_build_object(
    'ok', true, 'outcome', lower(p_outcome), 'nextDelaySeconds', v_delay
  );
end;
$$;

create or replace function public.touchline_social_enqueue_generation_job(
  p_scheduler_lease_token uuid,
  p_fixture_provider_id text,
  p_team_provider_id text,
  p_template_version text,
  p_first_observed_at timestamptz,
  p_starts_at timestamptz,
  p_input_checksum text,
  p_source_revision_manifest jsonb,
  p_source_revision_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheduler public.touchline_social_executor_cycles%rowtype;
  v_job public.touchline_social_generation_jobs%rowtype;
begin
  if p_scheduler_lease_token is null
     or coalesce(p_fixture_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_team_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_template_version, '') !~ '^[A-Za-z0-9._-]{1,160}$'
     or p_first_observed_at is null
     or p_first_observed_at > clock_timestamp() - interval '2 minutes'
     or p_starts_at is null
     or coalesce(p_input_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or not public.touchline_social_source_revision_is_current(
       p_source_revision_manifest, p_source_revision_checksum
     ) then
    raise exception 'TL_SOCIAL_GENERATION_JOB_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || p_fixture_provider_id || ':' || p_team_provider_id
      || ':' || p_template_version,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-executor:SCHEDULER', 0
  ));
  select * into v_scheduler
  from public.touchline_social_executor_cycles
  where component = 'SCHEDULER'
  for update;
  if v_scheduler.lease_token is distinct from p_scheduler_lease_token
     or v_scheduler.lease_expires_at <= clock_timestamp() then
    raise exception 'TL_SOCIAL_SCHEDULER_LEASE_INVALID';
  end if;
  if not public.touchline_social_source_revision_is_current(
    p_source_revision_manifest, p_source_revision_checksum
  ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE';
  end if;
  perform set_config('touchline.social_executor_transition', 'enqueue', true);
  insert into public.touchline_social_generation_jobs (
    fixture_provider_id, team_provider_id, content_type, template_version,
    first_observed_at, starts_at, input_checksum,
    source_revision_manifest, source_revision_checksum,
    job_state, reason_code, next_eligible_at
  ) values (
    p_fixture_provider_id, p_team_provider_id, 'LINEUP', p_template_version,
    p_first_observed_at, p_starts_at, p_input_checksum,
    p_source_revision_manifest, p_source_revision_checksum,
    'PENDING', 'DRAFT_READY_FOR_GENERATION', clock_timestamp()
  )
  on conflict (
    fixture_provider_id, team_provider_id, content_type, template_version,
    input_checksum, source_revision_checksum
  ) do update set
    last_scheduled_at = clock_timestamp()
  returning * into v_job;
  return jsonb_build_object(
    'ok', true,
    'outcome', case when v_job.job_state = 'PENDING' and v_job.attempt_count = 0 then 'queued' else 'noop_existing' end,
    'jobId', v_job.id,
    'state', v_job.job_state
  );
end;
$$;

create or replace function public.touchline_social_claim_generation_job(
  p_runner_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runner public.touchline_social_executor_cycles%rowtype;
  v_job public.touchline_social_generation_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
begin
  if p_runner_lease_token is null then
    raise exception 'TL_SOCIAL_GENERATION_JOB_CLAIM_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-executor:RUNNER', 0
  ));
  select * into v_runner
  from public.touchline_social_executor_cycles
  where component = 'RUNNER'
  for update;
  if v_runner.lease_token is distinct from p_runner_lease_token
     or v_runner.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_RUNNER_LEASE_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation-job-queue', 0
  ));

  perform set_config('touchline.social_executor_transition', 'recover_job', true);
  update public.touchline_social_generation_jobs
  set job_state = case when attempt_count >= max_attempts then 'REVIEW_REQUIRED' else 'RETRY_WAIT' end,
      reason_code = case when attempt_count >= max_attempts then 'GENERATION_RETRY_EXHAUSTED' else 'GENERATION_LEASE_EXPIRED' end,
      next_eligible_at = case
        when attempt_count >= max_attempts then null
        else v_now + pg_catalog.make_interval(secs => least(600, 30 * (2 ^ least(attempt_count, 5)))::integer)
      end,
      lease_token = null,
      lease_expires_at = null,
      lease_heartbeat_at = null,
      last_error_code = 'GENERATION_LEASE_EXPIRED',
      completed_at = case when attempt_count >= max_attempts then v_now else null end
  where job_state = 'RUNNING'
    and lease_expires_at <= v_now;

  update public.touchline_social_generation_jobs
  set job_state = 'SUPERSEDED',
      reason_code = 'OFFICIAL_SOURCE_REVISION_CHANGED',
      next_eligible_at = null,
      last_error_code = 'OFFICIAL_SOURCE_REVISION_CHANGED',
      completed_at = v_now
  where job_state in ('PENDING', 'RETRY_WAIT')
    and not public.touchline_social_source_revision_is_current(
      source_revision_manifest, source_revision_checksum
    );

  select * into v_job
  from public.touchline_social_generation_jobs
  where job_state in ('PENDING', 'RETRY_WAIT')
    and next_eligible_at <= v_now
    and public.touchline_social_source_revision_is_current(
      source_revision_manifest, source_revision_checksum
    )
  order by starts_at asc, first_scheduled_at asc, id asc
  for update skip locked
  limit 1;

  if v_job.id is null then
    return jsonb_build_object('ok', true, 'outcome', 'empty');
  end if;
  perform set_config('touchline.social_executor_transition', 'claim_job', true);
  update public.touchline_social_generation_jobs
  set job_state = 'RUNNING',
      reason_code = 'GENERATION_IN_PROGRESS',
      attempt_count = attempt_count + 1,
      next_eligible_at = null,
      lease_token = v_token,
      lease_expires_at = v_now + interval '5 minutes',
      lease_heartbeat_at = v_now,
      last_started_at = v_now,
      last_error_code = null
  where id = v_job.id;
  return jsonb_build_object(
    'ok', true, 'outcome', 'claimed', 'jobId', v_job.id,
    'leaseToken', v_token, 'leaseExpiresAt', v_now + interval '5 minutes',
    'fixtureId', v_job.fixture_provider_id, 'teamId', v_job.team_provider_id,
    'templateVersion', v_job.template_version,
    'firstObservedAt', v_job.first_observed_at, 'startsAt', v_job.starts_at,
    'inputChecksum', v_job.input_checksum,
    'sourceRevisionManifest', v_job.source_revision_manifest,
    'sourceRevisionChecksum', v_job.source_revision_checksum
  );
end;
$$;

create or replace function public.touchline_social_renew_generation_job(
  p_runner_lease_token uuid,
  p_job_id uuid,
  p_job_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runner public.touchline_social_executor_cycles%rowtype;
  v_job public.touchline_social_generation_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_runner_lease_token is null or p_job_id is null or p_job_lease_token is null then
    raise exception 'TL_SOCIAL_GENERATION_JOB_RENEWAL_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-executor:RUNNER', 0
  ));
  select * into v_runner
  from public.touchline_social_executor_cycles
  where component = 'RUNNER'
  for update;
  if v_runner.lease_token is distinct from p_runner_lease_token
     or v_runner.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_RUNNER_LEASE_INVALID';
  end if;
  select * into v_job
  from public.touchline_social_generation_jobs
  where id = p_job_id
  for update;
  if v_job.job_state <> 'RUNNING'
     or v_job.lease_token is distinct from p_job_lease_token
     or v_job.lease_expires_at <= v_now
     or not public.touchline_social_source_revision_is_current(
       v_job.source_revision_manifest, v_job.source_revision_checksum
     ) then
    raise exception 'TL_SOCIAL_GENERATION_JOB_LEASE_INVALID';
  end if;
  perform set_config('touchline.social_executor_transition', 'renew_job', true);
  update public.touchline_social_generation_jobs
  set lease_expires_at = v_now + interval '5 minutes',
      lease_heartbeat_at = v_now
  where id = p_job_id;
  return jsonb_build_object(
    'ok', true, 'outcome', 'renewed', 'leaseExpiresAt', v_now + interval '5 minutes'
  );
end;
$$;

create or replace function public.touchline_social_complete_generation_job(
  p_runner_lease_token uuid,
  p_job_id uuid,
  p_job_lease_token uuid,
  p_outcome text,
  p_reason_code text,
  p_generated_draft_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runner public.touchline_social_executor_cycles%rowtype;
  v_job public.touchline_social_generation_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_state text;
begin
  if p_runner_lease_token is null or p_job_id is null or p_job_lease_token is null
     or coalesce(p_outcome, '') not in ('COMPLETED', 'REVIEW_REQUIRED', 'RETRY')
     or coalesce(p_reason_code, '') !~ '^[A-Z0-9_:-]{1,160}$'
     or (p_outcome = 'COMPLETED' and p_generated_draft_id is null)
     or (p_outcome <> 'COMPLETED' and p_generated_draft_id is not null) then
    raise exception 'TL_SOCIAL_GENERATION_JOB_COMPLETION_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-executor:RUNNER', 0
  ));
  select * into v_runner
  from public.touchline_social_executor_cycles
  where component = 'RUNNER'
  for update;
  if v_runner.lease_token is distinct from p_runner_lease_token
     or v_runner.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_RUNNER_LEASE_INVALID';
  end if;
  select * into v_job
  from public.touchline_social_generation_jobs
  where id = p_job_id
  for update;
  if v_job.job_state <> 'RUNNING'
     or v_job.lease_token is distinct from p_job_lease_token
     or v_job.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_GENERATION_JOB_LEASE_INVALID';
  end if;
  if p_outcome = 'COMPLETED' and (
    not public.touchline_social_source_revision_is_current(
      v_job.source_revision_manifest, v_job.source_revision_checksum
    )
    or not exists (
      select 1
      from public.touchline_social_generation_reviews review
      join public.touchline_social_publication_drafts draft
        on draft.id = review.generated_draft_id
      where review.fixture_provider_id = v_job.fixture_provider_id
        and review.team_provider_id = v_job.team_provider_id
        and review.content_type = v_job.content_type
        and review.template_version = v_job.template_version
        and review.review_state = 'GENERATED'
        and review.generated_draft_id = p_generated_draft_id
        and review.input_checksum = v_job.input_checksum
        and review.source_revision_manifest = v_job.source_revision_manifest
        and review.source_revision_checksum = v_job.source_revision_checksum
        and draft.source_checksum = v_job.input_checksum
        and draft.source_revision_manifest = v_job.source_revision_manifest
        and draft.source_revision_checksum = v_job.source_revision_checksum
    )
  ) then
    raise exception 'TL_SOCIAL_GENERATION_JOB_DRAFT_MISMATCH';
  end if;
  v_state := case
    when p_outcome = 'COMPLETED' then 'COMPLETED'
    when p_outcome = 'REVIEW_REQUIRED' or v_job.attempt_count >= v_job.max_attempts then 'REVIEW_REQUIRED'
    else 'RETRY_WAIT'
  end;
  perform set_config('touchline.social_executor_transition', 'complete_job', true);
  update public.touchline_social_generation_jobs
  set job_state = v_state,
      reason_code = case
        when v_state = 'REVIEW_REQUIRED' and p_outcome = 'RETRY' then 'GENERATION_RETRY_EXHAUSTED'
        else p_reason_code
      end,
      next_eligible_at = case
        when v_state = 'RETRY_WAIT' then v_now + pg_catalog.make_interval(
          secs => least(600, 30 * (2 ^ least(v_job.attempt_count, 5)))::integer
        )
        else null
      end,
      lease_token = null,
      lease_expires_at = null,
      lease_heartbeat_at = null,
      generated_draft_id = case when v_state = 'COMPLETED' then p_generated_draft_id else null end,
      last_error_code = case when v_state in ('RETRY_WAIT', 'REVIEW_REQUIRED') then p_reason_code else null end,
      completed_at = case when v_state in ('COMPLETED', 'REVIEW_REQUIRED') then v_now else null end
  where id = p_job_id;
  return jsonb_build_object('ok', true, 'outcome', lower(v_state), 'state', v_state);
end;
$$;

-- The route-level health check is only UX. These database guards are the
-- approval authority: every intent issuance and every approval transition
-- re-locks the two executor components and the exact completed job in one
-- transaction. A health/job change between intent and approval therefore
-- fails closed instead of becoming a TOCTOU bypass.
create or replace function public.touchline_social_assert_executor_approval_gate(
  p_draft_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.touchline_social_publication_drafts%rowtype;
  v_cycle public.touchline_social_executor_cycles%rowtype;
  v_job public.touchline_social_generation_jobs%rowtype;
  v_component_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if p_draft_id is null then
    raise exception 'TL_SOCIAL_EXECUTOR_APPROVAL_DRAFT_REQUIRED';
  end if;
  select * into v_draft
  from public.touchline_social_publication_drafts
  where id = p_draft_id;
  if v_draft.id is null or v_draft.content_type <> 'LINEUP'
     or v_draft.team_provider_id is null then
    raise exception 'TL_SOCIAL_EXECUTOR_APPROVAL_DRAFT_INVALID';
  end if;

  -- Canonical 040 lock order: executor_cycles, then generation_jobs.
  for v_cycle in
    select *
    from public.touchline_social_executor_cycles
    where component in ('RUNNER', 'SCHEDULER')
    order by component
    for share
  loop
    v_component_count := v_component_count + 1;
    if v_cycle.lease_token is not null
       or v_cycle.last_outcome is distinct from 'SUCCESS'
       or v_cycle.consecutive_failures <> 0
       or v_cycle.last_completed_at is null
       or v_cycle.last_success_at is distinct from v_cycle.last_completed_at
       or v_cycle.last_completed_at < v_now - interval '3 minutes'
       or v_cycle.completed_count <> v_cycle.run_count then
      raise exception 'TL_SOCIAL_EXECUTOR_APPROVAL_HEALTH_UNSAFE';
    end if;
  end loop;
  if v_component_count <> 2 then
    raise exception 'TL_SOCIAL_EXECUTOR_APPROVAL_HEALTH_UNSAFE';
  end if;

  select * into v_job
  from public.touchline_social_generation_jobs
  where fixture_provider_id = v_draft.fixture_provider_id
    and team_provider_id = v_draft.team_provider_id
    and content_type = v_draft.content_type
    and template_version = v_draft.template_version
    and input_checksum = v_draft.input_checksum
    and source_revision_checksum = v_draft.source_revision_checksum
  for share;
  if v_job.id is null
     or v_job.job_state <> 'COMPLETED'
     or v_job.generated_draft_id is distinct from v_draft.id
     or v_job.source_revision_manifest is distinct from v_draft.source_revision_manifest
     or v_job.completed_at is null then
    raise exception 'TL_SOCIAL_EXECUTOR_APPROVAL_JOB_UNSAFE';
  end if;
end;
$$;

create or replace function public.touchline_social_guard_executor_review_intent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touchline_social_assert_executor_approval_gate(new.draft_id);
  return new;
end;
$$;

create trigger touchline_social_040_review_intent_gate
before insert on public.touchline_social_review_intents
for each row execute function public.touchline_social_guard_executor_review_intent();

create or replace function public.touchline_social_guard_executor_draft_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.artwork_approval_state = 'APPROVED'
        and old.artwork_approval_state is distinct from new.artwork_approval_state)
     or (new.caption_approval_state = 'APPROVED'
        and old.caption_approval_state is distinct from new.caption_approval_state) then
    perform public.touchline_social_assert_executor_approval_gate(new.id);
  end if;
  return new;
end;
$$;

create trigger touchline_social_040_draft_approval_gate
before update on public.touchline_social_publication_drafts
for each row execute function public.touchline_social_guard_executor_draft_approval();

alter table public.touchline_social_executor_cycles enable row level security;
alter table public.touchline_social_executor_cycles force row level security;
alter table public.touchline_social_generation_jobs enable row level security;
alter table public.touchline_social_generation_jobs force row level security;

revoke all privileges on table public.touchline_social_executor_cycles
  from public, anon, authenticated, service_role;
revoke all privileges on table public.touchline_social_generation_jobs
  from public, anon, authenticated, service_role;
grant select on table public.touchline_social_executor_cycles to service_role;
grant select on table public.touchline_social_generation_jobs to service_role;

revoke all on function public.touchline_social_claim_executor_cycle(text)
  from public, anon, authenticated;
revoke all on function public.touchline_social_renew_executor_cycle(text, uuid)
  from public, anon, authenticated;
revoke all on function public.touchline_social_complete_executor_cycle(text, uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.touchline_social_enqueue_generation_job(uuid, text, text, text, timestamptz, timestamptz, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.touchline_social_claim_generation_job(uuid)
  from public, anon, authenticated;
revoke all on function public.touchline_social_renew_generation_job(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.touchline_social_complete_generation_job(uuid, uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.touchline_social_assert_executor_approval_gate(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_guard_executor_review_intent()
  from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_guard_executor_draft_approval()
  from public, anon, authenticated, service_role;

grant execute on function public.touchline_social_claim_executor_cycle(text) to service_role;
grant execute on function public.touchline_social_renew_executor_cycle(text, uuid) to service_role;
grant execute on function public.touchline_social_complete_executor_cycle(text, uuid, text, text, integer) to service_role;
grant execute on function public.touchline_social_enqueue_generation_job(uuid, text, text, text, timestamptz, timestamptz, text, jsonb, text) to service_role;
grant execute on function public.touchline_social_claim_generation_job(uuid) to service_role;
grant execute on function public.touchline_social_renew_generation_job(uuid, uuid, uuid) to service_role;
grant execute on function public.touchline_social_complete_generation_job(uuid, uuid, uuid, text, text, uuid) to service_role;

comment on table public.touchline_social_executor_cycles is
  'QA-only scheduler and runner heartbeats. Leases, timeout recovery, last success/failure and bounded retry are observable without storing credentials.';
comment on table public.touchline_social_generation_jobs is
  'QA-only immutable LINE-UP DRAFT queue. Jobs are keyed to exact source checksums, generate DRAFTs only and never approve, enqueue or dispatch externally.';

commit;
