-- QA-only MATCH_PREVIEW extension for the frozen 039 approval boundary and
-- frozen 040 LINEUP executor. This migration has no outbound delivery path.
-- It must be independently audited before any shared-QA apply.

begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

do $$
begin
  if pg_catalog.to_regclass('public.touchline_social_publication_drafts') is null
     or pg_catalog.to_regclass('public.touchline_social_executor_cycles') is null
     or pg_catalog.to_regclass('public.touchline_social_generation_jobs') is null
     or pg_catalog.to_regclass('public.touchline_social_match_preview_executor_cycles') is not null
     or pg_catalog.to_regclass('public.touchline_social_match_preview_generation_jobs') is not null
     or pg_catalog.to_regclass('public.touchline_social_match_preview_review_intents') is not null then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_041_SCHEMA_PRECONDITION_FAILED';
  end if;
end
$$;

-- MATCH_PREVIEW standings depend on every scoreable fixture in the current
-- competition/season, not merely the target fixture. Add one dedicated
-- aggregate semantic key without changing any 039/040 LINEUP key or trigger.
do $$
declare
  v_name text;
  v_count integer := 0;
begin
  for v_name in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.touchline_social_source_revisions'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%fixture-provider%card-ranking%'
  loop
    execute pg_catalog.format('alter table public.touchline_social_source_revisions drop constraint %I', v_name);
    v_count := v_count + 1;
  end loop;
  if v_count <> 1 then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_041_SOURCE_KEY_CONSTRAINT_DRIFT_%', v_count;
  end if;
end
$$;

alter table public.touchline_social_source_revisions
  add constraint touchline_social_source_revisions_041_source_key_check check (
    source_key ~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$'
  );

create or replace function public.touchline_social_source_revision_is_current(
  p_manifest jsonb,
  p_checksum text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_expected_checksum text;
begin
  if jsonb_typeof(p_manifest) is distinct from 'object'
     or public.touchline_social_jsonb_object_length(p_manifest) not between 1 and 128
     or coalesce(p_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or exists (
       select 1
       from pg_catalog.jsonb_each_text(p_manifest) entry(source_key, revision_text)
       where entry.source_key !~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$'
          or entry.revision_text !~ '^(0|[1-9][0-9]{0,18})$'
     ) then
    return false;
  end if;
  v_expected_checksum := 'sha256:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_manifest::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_expected_checksum is distinct from p_checksum then return false; end if;
  return not exists (
    select 1
    from pg_catalog.jsonb_each_text(p_manifest) entry(source_key, revision_text)
    left join public.touchline_social_source_revisions revision
      on revision.source_key = entry.source_key
    where coalesce(revision.revision, 0) is distinct from entry.revision_text::bigint
  );
exception when others then
  return false;
end;
$$;

create or replace function public.touchline_social_read_source_revision(
  p_source_keys text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[];
  v_manifest jsonb := '{}'::jsonb;
  v_checksum text;
  v_clock_revision bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  select coalesce(array_agg(source_key order by source_key), array[]::text[])
  into v_keys
  from (
    select distinct btrim(source_key) as source_key
    from unnest(coalesce(p_source_keys, array[]::text[])) source(source_key)
    where btrim(source_key) <> ''
  ) normalized;
  if coalesce(array_length(v_keys, 1), 0) > 128
     or exists (
       select 1 from unnest(v_keys) source_key
       where source_key !~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$'
     ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_KEYS_INVALID';
  end if;
  select clock.revision into v_clock_revision
  from public.touchline_social_source_clock clock
  where clock.singleton = true;
  if v_clock_revision is null then raise exception 'TL_SOCIAL_SOURCE_CLOCK_UNAVAILABLE'; end if;
  if coalesce(array_length(v_keys, 1), 0) > 0 then
    select pg_catalog.jsonb_object_agg(source_key, revision order by source_key)
    into v_manifest
    from (
      select source_key, coalesce(stored.revision, 0) as revision
      from unnest(v_keys) source(source_key)
      left join public.touchline_social_source_revisions stored using (source_key)
    ) current_revisions;
  end if;
  v_checksum := 'sha256:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_manifest::text, 'UTF8'), 'sha256'),
    'hex'
  );
  return pg_catalog.jsonb_build_object(
    'clockRevision', v_clock_revision,
    'manifest', v_manifest,
    'checksum', v_checksum
  );
end;
$$;

create or replace function public.touchline_social_041_track_league_table_dependency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb;
  v_keys text[] := array[]::text[];
begin
  if tg_op = 'UPDATE' and (
    v_new - array['created_at','updated_at','source_updated_at','source_synced_at','last_synced_at']::text[]
  ) is not distinct from (
    v_old - array['created_at','updated_at','source_updated_at','source_synced_at','last_synced_at']::text[]
  ) then
    return new;
  end if;
  foreach v_row in array array[v_old, v_new]
  loop
    if v_row is null or coalesce(v_row ->> 'provider', '') <> 'sportmonks'
       or coalesce(v_row ->> 'competition_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      continue;
    end if;
    v_keys := v_keys || (
      'league-table:' || lower(v_row ->> 'competition_id')
    );
  end loop;
  select coalesce(array_agg(source_key order by source_key), array[]::text[])
  into v_keys
  from (select distinct source_key from unnest(v_keys) source(source_key)) unique_keys;
  if coalesce(array_length(v_keys, 1), 0) = 0 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('touchline-social-source-revision', 0)
  );
  update public.touchline_social_source_clock
  set revision = revision + 1, updated_at = clock_timestamp()
  where singleton = true;
  if not found then raise exception 'TL_SOCIAL_SOURCE_CLOCK_UNAVAILABLE'; end if;
  insert into public.touchline_social_source_revisions(
    source_key, revision, last_reason_code, updated_at
  )
  select source_key, 1, 'RENDER_SOURCE_LEAGUE_TABLE_CHANGED', clock_timestamp()
  from unnest(v_keys) source(source_key)
  on conflict (source_key) do update
  set revision = public.touchline_social_source_revisions.revision + 1,
      last_reason_code = excluded.last_reason_code,
      updated_at = excluded.updated_at;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['football_fixtures','football_clubs','football_seasons']::text[]
  loop
    execute pg_catalog.format(
      'drop trigger if exists tls_social_041_league_table_revision on public.%I', v_table_name
    );
    execute pg_catalog.format(
      'create trigger tls_social_041_league_table_revision after insert or update or delete on public.%I for each row execute function public.touchline_social_041_track_league_table_dependency()',
      v_table_name
    );
  end loop;
end
$$;

revoke all on function public.touchline_social_041_track_league_table_dependency()
  from public, anon, authenticated, service_role;

-- 039 and 040 remain the LINEUP authority. 041 intentionally extends the
-- shared draft envelope and semantic-key grammar, then replaces one shared
-- approval dispatcher later in this file while preserving its LINEUP branch.
do $$
declare
  v_name text;
  v_content integer := 0;
  v_relation integer := 0;
  v_input integer := 0;
  v_render integer := 0;
begin
  for v_name in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.touchline_social_publication_drafts'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%content_type%LINEUP%FINAL_SCORE%'
      and pg_catalog.pg_get_constraintdef(oid) not like '%team_provider_id%'
      and pg_catalog.pg_get_constraintdef(oid) not like '%input_checksum%'
      and pg_catalog.pg_get_constraintdef(oid) not like '%render_path%'
  loop
    execute pg_catalog.format('alter table public.touchline_social_publication_drafts drop constraint %I', v_name);
    v_content := v_content + 1;
  end loop;
  for v_name in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.touchline_social_publication_drafts'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%content_type%LINEUP%team_provider_id IS NOT NULL%'
      and pg_catalog.pg_get_constraintdef(oid) like '%content_type%FINAL_SCORE%team_provider_id IS NULL%'
  loop
    execute pg_catalog.format('alter table public.touchline_social_publication_drafts drop constraint %I', v_name);
    v_relation := v_relation + 1;
  end loop;
  for v_name in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.touchline_social_publication_drafts'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%content_type%LINEUP%input_checksum%source_checksum%'
  loop
    execute pg_catalog.format('alter table public.touchline_social_publication_drafts drop constraint %I', v_name);
    v_input := v_input + 1;
  end loop;
  for v_name in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.touchline_social_publication_drafts'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%render_path%'
      and pg_catalog.pg_get_constraintdef(oid) like '%social-lineup?fixtureId=%'
      and pg_catalog.pg_get_constraintdef(oid) like '%social-final-score?fixtureId=%'
  loop
    execute pg_catalog.format('alter table public.touchline_social_publication_drafts drop constraint %I', v_name);
    v_render := v_render + 1;
  end loop;
  if v_content <> 1 or v_relation <> 1 or v_input <> 1 or v_render <> 1 then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_041_DRAFT_CONSTRAINT_DRIFT_%_%_%_%',
      v_content, v_relation, v_input, v_render;
  end if;
end
$$;

alter table public.touchline_social_publication_drafts
  add constraint touchline_social_drafts_041_content_type_check
    check (content_type in ('LINEUP', 'FINAL_SCORE', 'MATCH_PREVIEW')),
  add constraint touchline_social_drafts_041_relation_check
    check (
      (content_type = 'LINEUP' and team_provider_id is not null)
      or (content_type in ('FINAL_SCORE', 'MATCH_PREVIEW') and team_provider_id is null)
    ),
  add constraint touchline_social_drafts_041_input_check
    check (content_type not in ('LINEUP', 'MATCH_PREVIEW') or input_checksum = source_checksum),
  add constraint touchline_social_drafts_041_render_path_check
    check (
      render_path = case content_type
        when 'LINEUP' then '/visual-qa/social-lineup?fixtureId=' || fixture_provider_id
          || '&teamId=' || team_provider_id || '&locale=' || locale || '&revision=' || revision::text
        when 'FINAL_SCORE' then '/visual-qa/social-final-score?fixtureId=' || fixture_provider_id
          || '&locale=' || locale || '&revision=' || revision::text
        when 'MATCH_PREVIEW' then '/visual-qa/social-match-preview?fixtureId=' || fixture_provider_id
          || '&locale=' || locale || '&revision=' || revision::text
      end
    );

create table public.touchline_social_match_preview_executor_cycles (
  component text primary key check (component in ('SCHEDULER', 'RUNNER')),
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
  last_outcome text check (last_outcome is null or last_outcome in ('SUCCESS', 'FAILURE')),
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

create table public.touchline_social_match_preview_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  fixture_provider_id text not null check (fixture_provider_id ~ '^[1-9][0-9]{0,19}$'),
  content_type text not null check (content_type = 'MATCH_PREVIEW'),
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
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,160}$'),
  first_scheduled_at timestamptz not null default clock_timestamp(),
  last_scheduled_at timestamptz not null default clock_timestamp(),
  last_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (fixture_provider_id, content_type, template_version, input_checksum, source_revision_checksum),
  check (first_observed_at <= starts_at),
  check (
    (job_state = 'PENDING' and next_eligible_at is not null and lease_token is null
      and lease_expires_at is null and lease_heartbeat_at is null and generated_draft_id is null
      and completed_at is null and last_error_code is null)
    or (job_state = 'RUNNING' and next_eligible_at is null and lease_token is not null
      and lease_expires_at is not null and lease_heartbeat_at is not null
      and generated_draft_id is null and completed_at is null)
    or (job_state = 'RETRY_WAIT' and next_eligible_at is not null and lease_token is null
      and lease_expires_at is null and lease_heartbeat_at is null and generated_draft_id is null
      and completed_at is null and last_error_code is not null)
    or (job_state = 'COMPLETED' and next_eligible_at is null and lease_token is null
      and lease_expires_at is null and lease_heartbeat_at is null and generated_draft_id is not null
      and completed_at is not null and last_error_code is null)
    or (job_state in ('REVIEW_REQUIRED', 'SUPERSEDED') and next_eligible_at is null
      and lease_token is null and lease_expires_at is null and lease_heartbeat_at is null
      and generated_draft_id is null and completed_at is not null)
  )
);

create table public.touchline_social_match_preview_review_intents (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.touchline_social_publication_drafts(id) on delete restrict,
  review_kind text not null check (review_kind in ('ARTWORK', 'CAPTION')),
  actor_id uuid not null references public.touchline_social_owner_approvers(user_id) on delete restrict,
  expected_content_checksum text not null check (expected_content_checksum ~ '^sha256:[0-9a-f]{64}$'),
  expected_manifest_checksum text not null check (expected_manifest_checksum ~ '^sha256:[0-9a-f]{64}$'),
  expected_source_checksum text not null check (expected_source_checksum ~ '^sha256:[0-9a-f]{64}$'),
  expected_source_revision_checksum text not null check (expected_source_revision_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_snapshot_at timestamptz not null,
  generation_completed_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index touchline_social_match_preview_jobs_ready_idx
  on public.touchline_social_match_preview_generation_jobs (next_eligible_at, starts_at, id)
  where job_state in ('PENDING', 'RETRY_WAIT');

create or replace function public.touchline_social_041_guard_cycle_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare v_transition text := coalesce(current_setting('touchline.social_match_preview_transition', true), '');
begin
  if tg_op = 'DELETE' or v_transition not in ('claim_cycle', 'renew_cycle', 'complete_cycle') then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_CYCLE_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE' and new.component is distinct from old.component then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_CYCLE_IDENTITY_IMMUTABLE';
  end if;
  new.updated_at := clock_timestamp(); return new;
end
$$;

create trigger touchline_social_041_cycle_guard before insert or update or delete
on public.touchline_social_match_preview_executor_cycles for each row
execute function public.touchline_social_041_guard_cycle_mutation();

create or replace function public.touchline_social_041_guard_job_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare v_transition text := coalesce(current_setting('touchline.social_match_preview_transition', true), '');
begin
  if tg_op = 'DELETE' or v_transition not in ('enqueue', 'claim_job', 'renew_job', 'complete_job', 'recover_job') then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_JOB_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE' and row(
    new.fixture_provider_id, new.content_type, new.template_version, new.first_observed_at,
    new.starts_at, new.input_checksum, new.source_revision_manifest,
    new.source_revision_checksum, new.first_scheduled_at, new.created_at
  ) is distinct from row(
    old.fixture_provider_id, old.content_type, old.template_version, old.first_observed_at,
    old.starts_at, old.input_checksum, old.source_revision_manifest,
    old.source_revision_checksum, old.first_scheduled_at, old.created_at
  ) then raise exception 'TL_SOCIAL_MATCH_PREVIEW_JOB_IDENTITY_IMMUTABLE'; end if;
  new.updated_at := clock_timestamp(); return new;
end
$$;

create trigger touchline_social_041_job_guard before insert or update or delete
on public.touchline_social_match_preview_generation_jobs for each row
execute function public.touchline_social_041_guard_job_mutation();

create or replace function public.touchline_social_041_claim_cycle(p_component text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycle public.touchline_social_match_preview_executor_cycles%rowtype;
  v_now timestamptz := clock_timestamp(); v_token uuid := gen_random_uuid(); v_delay integer;
begin
  if coalesce(p_component, '') not in ('SCHEDULER', 'RUNNER') then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_CYCLE_CLAIM_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-041-executor:' || p_component, 0));
  select * into v_cycle from public.touchline_social_match_preview_executor_cycles
    where component = p_component for update;
  if v_cycle.component is null then
    perform set_config('touchline.social_match_preview_transition', 'claim_cycle', true);
    insert into public.touchline_social_match_preview_executor_cycles(component) values (p_component)
      returning * into v_cycle;
  end if;
  if v_cycle.lease_token is not null and v_cycle.lease_expires_at > v_now then
    return jsonb_build_object('ok', true, 'outcome', 'busy');
  end if;
  if v_cycle.lease_token is not null then
    v_delay := least(300, 10 * (2 ^ least(v_cycle.consecutive_failures + 1, 5)))::integer;
    perform set_config('touchline.social_match_preview_transition', 'complete_cycle', true);
    update public.touchline_social_match_preview_executor_cycles set
      lease_token = null, lease_expires_at = null, lease_heartbeat_at = null,
      next_eligible_at = v_now + pg_catalog.make_interval(secs => v_delay),
      consecutive_failures = least(consecutive_failures + 1, 1000),
      completed_count = completed_count + 1, timeout_recovery_count = timeout_recovery_count + 1,
      last_completed_at = v_now, last_failure_at = v_now, last_outcome = 'FAILURE',
      last_error_code = 'EXECUTOR_LEASE_EXPIRED', last_items_processed = 0
    where component = p_component;
    return jsonb_build_object('ok', true, 'outcome', 'recovered_timeout');
  end if;
  if v_cycle.next_eligible_at > v_now then return jsonb_build_object('ok', true, 'outcome', 'cooldown'); end if;
  perform set_config('touchline.social_match_preview_transition', 'claim_cycle', true);
  update public.touchline_social_match_preview_executor_cycles set
    lease_token = v_token, lease_expires_at = v_now + interval '2 minutes',
    lease_heartbeat_at = v_now, run_count = run_count + 1, last_started_at = v_now
  where component = p_component;
  return jsonb_build_object('ok', true, 'outcome', 'claimed', 'leaseToken', v_token);
end
$$;

create or replace function public.touchline_social_041_renew_cycle(p_component text, p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycle public.touchline_social_match_preview_executor_cycles%rowtype; v_now timestamptz := clock_timestamp();
begin
  if coalesce(p_component, '') not in ('SCHEDULER', 'RUNNER') or p_lease_token is null then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_CYCLE_RENEW_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-041-executor:' || p_component, 0));
  select * into v_cycle from public.touchline_social_match_preview_executor_cycles
    where component = p_component for update;
  if v_cycle.lease_token is distinct from p_lease_token or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_CYCLE_LEASE_INVALID'; end if;
  perform set_config('touchline.social_match_preview_transition', 'renew_cycle', true);
  update public.touchline_social_match_preview_executor_cycles set
    lease_expires_at = v_now + interval '2 minutes', lease_heartbeat_at = v_now
  where component = p_component;
  return jsonb_build_object('ok', true, 'outcome', 'renewed');
end
$$;

create or replace function public.touchline_social_041_complete_cycle(
  p_component text, p_lease_token uuid, p_outcome text, p_error_code text, p_items_processed integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycle public.touchline_social_match_preview_executor_cycles%rowtype;
  v_now timestamptz := clock_timestamp(); v_failures integer; v_delay integer;
begin
  if coalesce(p_component, '') not in ('SCHEDULER', 'RUNNER') or p_lease_token is null
     or coalesce(p_outcome, '') not in ('SUCCESS', 'FAILURE')
     or p_items_processed is null or p_items_processed not between 0 and 1000
     or (p_outcome = 'SUCCESS' and p_error_code is not null)
     or (p_outcome = 'FAILURE' and coalesce(p_error_code, '') !~ '^[A-Z0-9_:-]{1,160}$') then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_CYCLE_COMPLETE_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-041-executor:' || p_component, 0));
  select * into v_cycle from public.touchline_social_match_preview_executor_cycles
    where component = p_component for update;
  if v_cycle.lease_token is distinct from p_lease_token or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_CYCLE_LEASE_INVALID'; end if;
  v_failures := case when p_outcome = 'SUCCESS' then 0 else least(v_cycle.consecutive_failures + 1, 1000) end;
  v_delay := case when p_outcome = 'SUCCESS' then 10 else least(300, 10 * (2 ^ least(v_failures, 5)))::integer end;
  perform set_config('touchline.social_match_preview_transition', 'complete_cycle', true);
  update public.touchline_social_match_preview_executor_cycles set
    lease_token = null, lease_expires_at = null, lease_heartbeat_at = null,
    next_eligible_at = v_now + pg_catalog.make_interval(secs => v_delay),
    consecutive_failures = v_failures, completed_count = completed_count + 1,
    last_completed_at = v_now,
    last_success_at = case when p_outcome = 'SUCCESS' then v_now else last_success_at end,
    last_failure_at = case when p_outcome = 'FAILURE' then v_now else last_failure_at end,
    last_outcome = p_outcome, last_error_code = p_error_code, last_items_processed = p_items_processed
  where component = p_component;
  return jsonb_build_object('ok', true, 'outcome', lower(p_outcome));
end
$$;

create or replace function public.touchline_social_041_enqueue_job(
  p_scheduler_lease_token uuid, p_fixture_provider_id text, p_template_version text,
  p_first_observed_at timestamptz, p_starts_at timestamptz, p_input_checksum text,
  p_source_revision_manifest jsonb, p_source_revision_checksum text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycle public.touchline_social_match_preview_executor_cycles%rowtype;
  v_job public.touchline_social_match_preview_generation_jobs%rowtype;
  v_first_observed_at timestamptz;
begin
  if p_scheduler_lease_token is null or coalesce(p_fixture_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_template_version, '') !~ '^[A-Za-z0-9._-]{1,160}$'
     or p_first_observed_at is null or p_starts_at is null or p_first_observed_at > p_starts_at
     or coalesce(p_input_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or not public.touchline_social_source_revision_is_current(p_source_revision_manifest, p_source_revision_checksum) then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_JOB_INPUT_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-041-generation:' || p_fixture_provider_id || ':' || p_template_version, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-041-executor:SCHEDULER', 0));
  select * into v_cycle from public.touchline_social_match_preview_executor_cycles
    where component = 'SCHEDULER' for update;
  if v_cycle.lease_token is distinct from p_scheduler_lease_token or v_cycle.lease_expires_at <= clock_timestamp() then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_SCHEDULER_LEASE_INVALID'; end if;
  if not public.touchline_social_source_revision_is_current(p_source_revision_manifest, p_source_revision_checksum) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE'; end if;
  select least(
    p_first_observed_at,
    coalesce(min(first_observed_at), p_first_observed_at)
  ) into v_first_observed_at
  from public.touchline_social_match_preview_generation_jobs
  where fixture_provider_id = p_fixture_provider_id
    and content_type = 'MATCH_PREVIEW'
    and template_version = p_template_version;
  perform set_config('touchline.social_match_preview_transition', 'recover_job', true);
  update public.touchline_social_match_preview_generation_jobs set
    job_state = 'SUPERSEDED', reason_code = 'CANONICAL_SOURCE_REVISION_CHANGED', next_eligible_at = null,
    last_error_code = 'CANONICAL_SOURCE_REVISION_CHANGED', completed_at = clock_timestamp()
  where fixture_provider_id = p_fixture_provider_id and content_type = 'MATCH_PREVIEW'
    and template_version = p_template_version and job_state in ('PENDING', 'RETRY_WAIT')
    and (input_checksum <> p_input_checksum or source_revision_checksum <> p_source_revision_checksum);
  perform set_config('touchline.social_match_preview_transition', 'enqueue', true);
  insert into public.touchline_social_match_preview_generation_jobs(
    fixture_provider_id, content_type, template_version, first_observed_at, starts_at,
    input_checksum, source_revision_manifest, source_revision_checksum,
    job_state, reason_code, next_eligible_at
  ) values (
    p_fixture_provider_id, 'MATCH_PREVIEW', p_template_version, v_first_observed_at, p_starts_at,
    p_input_checksum, p_source_revision_manifest, p_source_revision_checksum,
    'PENDING', 'DRAFT_READY_FOR_GENERATION', clock_timestamp()
  ) on conflict (fixture_provider_id, content_type, template_version, input_checksum, source_revision_checksum)
  do update set last_scheduled_at = clock_timestamp() returning * into v_job;
  return jsonb_build_object('ok', true, 'outcome', case when v_job.attempt_count = 0 then 'queued' else 'noop_existing' end,
    'jobId', v_job.id, 'state', v_job.job_state);
end
$$;

create or replace function public.touchline_social_041_claim_job(p_runner_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycle public.touchline_social_match_preview_executor_cycles%rowtype;
  v_job public.touchline_social_match_preview_generation_jobs%rowtype;
  v_now timestamptz := clock_timestamp(); v_token uuid := gen_random_uuid();
begin
  if p_runner_lease_token is null then raise exception 'TL_SOCIAL_MATCH_PREVIEW_JOB_CLAIM_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-041-executor:RUNNER', 0));
  select * into v_cycle from public.touchline_social_match_preview_executor_cycles
    where component = 'RUNNER' for update;
  if v_cycle.lease_token is distinct from p_runner_lease_token or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_RUNNER_LEASE_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-041-job-queue', 0));
  perform set_config('touchline.social_match_preview_transition', 'recover_job', true);
  update public.touchline_social_match_preview_generation_jobs set
    job_state = case when attempt_count >= max_attempts then 'REVIEW_REQUIRED' else 'RETRY_WAIT' end,
    reason_code = case when attempt_count >= max_attempts then 'GENERATION_RETRY_EXHAUSTED' else 'GENERATION_LEASE_EXPIRED' end,
    next_eligible_at = case when attempt_count >= max_attempts then null else v_now + interval '30 seconds' end,
    lease_token = null, lease_expires_at = null, lease_heartbeat_at = null,
    last_error_code = 'GENERATION_LEASE_EXPIRED',
    completed_at = case when attempt_count >= max_attempts then v_now else null end
  where job_state = 'RUNNING' and lease_expires_at <= v_now;
  update public.touchline_social_match_preview_generation_jobs set
    job_state = 'SUPERSEDED', reason_code = 'CANONICAL_SOURCE_REVISION_CHANGED', next_eligible_at = null,
    last_error_code = 'CANONICAL_SOURCE_REVISION_CHANGED', completed_at = v_now
  where job_state in ('PENDING', 'RETRY_WAIT')
    and not public.touchline_social_source_revision_is_current(source_revision_manifest, source_revision_checksum);
  select * into v_job from public.touchline_social_match_preview_generation_jobs
  where job_state in ('PENDING', 'RETRY_WAIT') and next_eligible_at <= v_now
    and public.touchline_social_source_revision_is_current(source_revision_manifest, source_revision_checksum)
  order by starts_at, first_scheduled_at, id for update skip locked limit 1;
  if v_job.id is null then return jsonb_build_object('ok', true, 'outcome', 'empty'); end if;
  perform set_config('touchline.social_match_preview_transition', 'claim_job', true);
  update public.touchline_social_match_preview_generation_jobs set
    job_state = 'RUNNING', reason_code = 'GENERATION_IN_PROGRESS', attempt_count = attempt_count + 1,
    next_eligible_at = null, lease_token = v_token, lease_expires_at = v_now + interval '5 minutes',
    lease_heartbeat_at = v_now, last_started_at = v_now, last_error_code = null where id = v_job.id;
  return jsonb_build_object('ok', true, 'outcome', 'claimed', 'jobId', v_job.id, 'leaseToken', v_token,
    'fixtureId', v_job.fixture_provider_id, 'inputChecksum', v_job.input_checksum,
    'sourceRevisionChecksum', v_job.source_revision_checksum);
end
$$;

create or replace function public.touchline_social_041_renew_job(
  p_runner_lease_token uuid, p_job_id uuid, p_job_lease_token uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycle public.touchline_social_match_preview_executor_cycles%rowtype;
  v_job public.touchline_social_match_preview_generation_jobs%rowtype; v_now timestamptz := clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-041-executor:RUNNER', 0));
  select * into v_cycle from public.touchline_social_match_preview_executor_cycles where component = 'RUNNER' for update;
  if v_cycle.lease_token is distinct from p_runner_lease_token or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_RUNNER_LEASE_INVALID'; end if;
  select * into v_job from public.touchline_social_match_preview_generation_jobs where id = p_job_id for update;
  if v_job.job_state <> 'RUNNING' or v_job.lease_token is distinct from p_job_lease_token
     or v_job.lease_expires_at <= v_now
     or not public.touchline_social_source_revision_is_current(v_job.source_revision_manifest, v_job.source_revision_checksum) then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_JOB_LEASE_INVALID'; end if;
  perform set_config('touchline.social_match_preview_transition', 'renew_job', true);
  update public.touchline_social_match_preview_generation_jobs set
    lease_expires_at = v_now + interval '5 minutes', lease_heartbeat_at = v_now where id = p_job_id;
  return jsonb_build_object('ok', true, 'outcome', 'renewed');
end
$$;

create or replace function public.touchline_social_041_complete_job(
  p_runner_lease_token uuid, p_job_id uuid, p_job_lease_token uuid,
  p_outcome text, p_reason_code text, p_generated_draft_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cycle public.touchline_social_match_preview_executor_cycles%rowtype;
  v_job public.touchline_social_match_preview_generation_jobs%rowtype;
  v_now timestamptz := clock_timestamp(); v_state text;
begin
  if p_runner_lease_token is null or p_job_id is null or p_job_lease_token is null
     or coalesce(p_outcome, '') not in ('COMPLETED', 'REVIEW_REQUIRED', 'RETRY')
     or coalesce(p_reason_code, '') !~ '^[A-Z0-9_:-]{1,160}$'
     or (p_outcome = 'COMPLETED') <> (p_generated_draft_id is not null) then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_JOB_COMPLETE_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-041-executor:RUNNER', 0));
  select * into v_cycle from public.touchline_social_match_preview_executor_cycles where component = 'RUNNER' for update;
  if v_cycle.lease_token is distinct from p_runner_lease_token or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_RUNNER_LEASE_INVALID'; end if;
  select * into v_job from public.touchline_social_match_preview_generation_jobs where id = p_job_id for update;
  if v_job.job_state <> 'RUNNING' or v_job.lease_token is distinct from p_job_lease_token
     or v_job.lease_expires_at <= v_now then raise exception 'TL_SOCIAL_MATCH_PREVIEW_JOB_LEASE_INVALID'; end if;
  if p_outcome = 'COMPLETED' and (
    not public.touchline_social_source_revision_is_current(v_job.source_revision_manifest, v_job.source_revision_checksum)
    or not exists (
      select 1 from public.touchline_social_publication_drafts draft
      where draft.id = p_generated_draft_id and draft.content_type = 'MATCH_PREVIEW'
        and draft.fixture_provider_id = v_job.fixture_provider_id and draft.team_provider_id is null
        and draft.template_version = v_job.template_version and draft.input_checksum = v_job.input_checksum
        and draft.source_checksum = v_job.input_checksum
        and draft.source_revision_manifest = v_job.source_revision_manifest
        and draft.source_revision_checksum = v_job.source_revision_checksum
    )
  ) then raise exception 'TL_SOCIAL_MATCH_PREVIEW_JOB_DRAFT_MISMATCH'; end if;
  v_state := case when p_outcome = 'COMPLETED' then 'COMPLETED'
    when p_outcome = 'REVIEW_REQUIRED' or v_job.attempt_count >= v_job.max_attempts then 'REVIEW_REQUIRED'
    else 'RETRY_WAIT' end;
  perform set_config('touchline.social_match_preview_transition', 'complete_job', true);
  update public.touchline_social_match_preview_generation_jobs set job_state = v_state,
    reason_code = case when v_state = 'REVIEW_REQUIRED' and p_outcome = 'RETRY'
      then 'GENERATION_RETRY_EXHAUSTED' else p_reason_code end,
    next_eligible_at = case when v_state = 'RETRY_WAIT' then v_now + interval '30 seconds' else null end,
    lease_token = null, lease_expires_at = null, lease_heartbeat_at = null,
    generated_draft_id = case when v_state = 'COMPLETED' then p_generated_draft_id else null end,
    last_error_code = case when v_state in ('RETRY_WAIT', 'REVIEW_REQUIRED') then p_reason_code else null end,
    completed_at = case when v_state in ('COMPLETED', 'REVIEW_REQUIRED') then v_now else null end
  where id = p_job_id;
  return jsonb_build_object('ok', true, 'outcome', lower(v_state));
end
$$;

create or replace function public.touchline_social_041_assert_approval_gate(p_draft_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_draft public.touchline_social_publication_drafts%rowtype;
  v_cycle public.touchline_social_match_preview_executor_cycles%rowtype;
  v_job public.touchline_social_match_preview_generation_jobs%rowtype;
  v_count integer := 0; v_now timestamptz := clock_timestamp();
begin
  select * into v_draft from public.touchline_social_publication_drafts where id = p_draft_id;
  if v_draft.id is null or v_draft.content_type <> 'MATCH_PREVIEW' or v_draft.team_provider_id is not null
     or not public.touchline_social_source_revision_is_current(
       v_draft.source_revision_manifest, v_draft.source_revision_checksum
     ) then raise exception 'TL_SOCIAL_MATCH_PREVIEW_APPROVAL_DRAFT_INVALID'; end if;
  for v_cycle in select * from public.touchline_social_match_preview_executor_cycles
    where component in ('RUNNER', 'SCHEDULER') order by component for share
  loop
    v_count := v_count + 1;
    if v_cycle.lease_token is not null or v_cycle.last_outcome is distinct from 'SUCCESS'
       or v_cycle.consecutive_failures <> 0 or v_cycle.last_completed_at is null
       or v_cycle.last_success_at is distinct from v_cycle.last_completed_at
       or v_cycle.last_completed_at < v_now - interval '3 minutes'
       or v_cycle.completed_count <> v_cycle.run_count then
      raise exception 'TL_SOCIAL_MATCH_PREVIEW_APPROVAL_HEALTH_UNSAFE'; end if;
  end loop;
  if v_count <> 2 then raise exception 'TL_SOCIAL_MATCH_PREVIEW_APPROVAL_HEALTH_UNSAFE'; end if;
  select * into v_job from public.touchline_social_match_preview_generation_jobs
  where fixture_provider_id = v_draft.fixture_provider_id and content_type = 'MATCH_PREVIEW'
    and template_version = v_draft.template_version and input_checksum = v_draft.input_checksum
    and source_revision_checksum = v_draft.source_revision_checksum for share;
  if v_job.id is null or v_job.job_state <> 'COMPLETED'
     or v_job.generated_draft_id is distinct from v_draft.id
     or v_job.source_revision_manifest is distinct from v_draft.source_revision_manifest
     or v_job.completed_at is null then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_APPROVAL_JOB_UNSAFE'; end if;
end
$$;

create or replace function public.touchline_social_041_issue_review_intent(
  p_draft_id uuid, p_review_kind text, p_expected_content_checksum text,
  p_expected_manifest_checksum text, p_expected_source_checksum text,
  p_expected_source_revision_checksum text, p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_draft public.touchline_social_publication_drafts%rowtype;
  v_job public.touchline_social_match_preview_generation_jobs%rowtype; v_id uuid;
  v_lookup_fixture_provider_id text; v_lookup_template_version text;
begin
  if p_draft_id is null or coalesce(p_review_kind, '') not in ('ARTWORK', 'CAPTION')
     or coalesce(p_expected_content_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_manifest_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_source_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_source_revision_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or p_actor_id is null
     or not exists (
       select 1 from public.touchline_social_owner_approvers approver
       where approver.user_id = p_actor_id
     ) then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_INTENT_INPUT_INVALID'; end if;
  select fixture_provider_id, template_version
  into v_lookup_fixture_provider_id, v_lookup_template_version
  from public.touchline_social_publication_drafts
  where id = p_draft_id and content_type = 'MATCH_PREVIEW';
  if v_lookup_fixture_provider_id is null or v_lookup_template_version is null then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_INTENT_STALE'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-041-generation:' || v_lookup_fixture_provider_id || ':' || v_lookup_template_version, 0));
  select * into v_draft from public.touchline_social_publication_drafts where id = p_draft_id for update;
  if v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version
     or v_draft.content_type <> 'MATCH_PREVIEW' or v_draft.approval_state <> 'APPROVAL_REQUIRED'
     or v_draft.manifest_checksum <> p_expected_manifest_checksum
     or v_draft.source_checksum <> p_expected_source_checksum
     or v_draft.source_revision_checksum <> p_expected_source_revision_checksum
     or v_draft.input_checksum <> p_expected_source_checksum
     or (p_review_kind = 'ARTWORK' and (v_draft.artwork_approval_state <> 'APPROVAL_REQUIRED'
       or v_draft.artifact_checksum <> p_expected_content_checksum))
     or (p_review_kind = 'CAPTION' and (v_draft.caption_approval_state <> 'APPROVAL_REQUIRED'
       or v_draft.caption_checksum <> p_expected_content_checksum)) then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_INTENT_STALE'; end if;
  perform public.touchline_social_041_assert_approval_gate(p_draft_id);
  select * into v_job from public.touchline_social_match_preview_generation_jobs
    where generated_draft_id = p_draft_id and job_state = 'COMPLETED' for share;
  insert into public.touchline_social_match_preview_review_intents(
    draft_id, review_kind, actor_id, expected_content_checksum,
    expected_manifest_checksum, expected_source_checksum, expected_source_revision_checksum,
    source_snapshot_at, generation_completed_at, expires_at
  ) values (
    p_draft_id, p_review_kind, p_actor_id, p_expected_content_checksum,
    p_expected_manifest_checksum, p_expected_source_checksum, p_expected_source_revision_checksum,
    v_draft.source_snapshot_at, v_job.completed_at, clock_timestamp() + interval '2 minutes'
  ) returning id into v_id;
  return jsonb_build_object('ok', true, 'intentId', v_id);
end
$$;

create or replace function public.touchline_social_041_approve(
  p_intent_id uuid, p_draft_id uuid, p_review_kind text,
  p_expected_content_checksum text, p_expected_manifest_checksum text,
  p_expected_source_checksum text, p_expected_source_revision_checksum text, p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_draft public.touchline_social_publication_drafts%rowtype;
  v_intent public.touchline_social_match_preview_review_intents%rowtype;
  v_lookup_fixture_provider_id text; v_lookup_template_version text;
begin
  perform public.touchline_social_require_owner_actor(p_actor_id);
  if p_intent_id is null or p_draft_id is null or coalesce(p_review_kind, '') not in ('ARTWORK', 'CAPTION') then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_APPROVAL_INPUT_INVALID'; end if;
  select fixture_provider_id, template_version
  into v_lookup_fixture_provider_id, v_lookup_template_version
  from public.touchline_social_publication_drafts
  where id = p_draft_id and content_type = 'MATCH_PREVIEW';
  if v_lookup_fixture_provider_id is null or v_lookup_template_version is null then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_APPROVAL_STALE'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('touchline-social-source-revision', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-041-generation:' || v_lookup_fixture_provider_id || ':' || v_lookup_template_version, 0));
  select * into v_intent from public.touchline_social_match_preview_review_intents
    where id = p_intent_id for update;
  if v_intent.id is null or v_intent.consumed_at is not null or v_intent.expires_at <= clock_timestamp()
     or v_intent.draft_id <> p_draft_id or v_intent.review_kind <> p_review_kind
     or v_intent.actor_id <> p_actor_id or v_intent.expected_content_checksum <> p_expected_content_checksum
     or v_intent.expected_manifest_checksum <> p_expected_manifest_checksum
     or v_intent.expected_source_checksum <> p_expected_source_checksum
     or v_intent.expected_source_revision_checksum <> p_expected_source_revision_checksum then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_INTENT_INVALID'; end if;
  select * into v_draft from public.touchline_social_publication_drafts where id = p_draft_id for update;
  if v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version
     or v_draft.content_type <> 'MATCH_PREVIEW' or v_draft.approval_state <> 'APPROVAL_REQUIRED'
     or v_draft.manifest_checksum <> p_expected_manifest_checksum
     or v_draft.source_checksum <> p_expected_source_checksum
     or v_draft.source_revision_checksum <> p_expected_source_revision_checksum
     or v_draft.source_snapshot_at is distinct from v_intent.source_snapshot_at
     or v_draft.input_checksum <> p_expected_source_checksum
     or (p_review_kind = 'ARTWORK' and (v_draft.artwork_approval_state <> 'APPROVAL_REQUIRED'
       or v_draft.artifact_checksum <> p_expected_content_checksum))
     or (p_review_kind = 'CAPTION' and (v_draft.caption_approval_state <> 'APPROVAL_REQUIRED'
       or v_draft.caption_checksum <> p_expected_content_checksum)) then
    raise exception 'TL_SOCIAL_MATCH_PREVIEW_APPROVAL_STALE'; end if;
  perform public.touchline_social_041_assert_approval_gate(p_draft_id);
  perform set_config('touchline.social_transition',
    case when p_review_kind = 'ARTWORK' then 'approve_artwork' else 'approve_caption' end, true);
  if p_review_kind = 'ARTWORK' then
    update public.touchline_social_publication_drafts set
      artwork_approval_state = 'APPROVED', approved_artifact_checksum = artifact_checksum,
      artwork_approved_manifest_checksum = manifest_checksum, artwork_approved_at = clock_timestamp(),
      artwork_approved_by = p_actor_id,
      approval_state = case when caption_approval_state = 'APPROVED' then 'APPROVED' else 'APPROVAL_REQUIRED' end,
      approved_manifest_checksum = case when caption_approval_state = 'APPROVED' then manifest_checksum else null end
    where id = p_draft_id;
  else
    update public.touchline_social_publication_drafts set
      caption_approval_state = 'APPROVED', approved_caption_checksum = caption_checksum,
      caption_approved_manifest_checksum = manifest_checksum, caption_approved_at = clock_timestamp(),
      caption_approved_by = p_actor_id,
      approval_state = case when artwork_approval_state = 'APPROVED' then 'APPROVED' else 'APPROVAL_REQUIRED' end,
      approved_manifest_checksum = case when artwork_approval_state = 'APPROVED' then manifest_checksum else null end
    where id = p_draft_id;
  end if;
  update public.touchline_social_match_preview_review_intents set consumed_at = clock_timestamp()
    where id = p_intent_id;
  return jsonb_build_object('ok', true, 'draftId', p_draft_id, 'review', p_review_kind);
end
$$;

-- Preserve 040 as LINEUP authority while allowing its draft trigger to route
-- MATCH_PREVIEW approvals to the independent 041 authority.
create or replace function public.touchline_social_guard_executor_draft_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.artwork_approval_state = 'APPROVED' and old.artwork_approval_state is distinct from new.artwork_approval_state)
     or (new.caption_approval_state = 'APPROVED' and old.caption_approval_state is distinct from new.caption_approval_state) then
    if new.content_type = 'MATCH_PREVIEW' then
      perform public.touchline_social_041_assert_approval_gate(new.id);
    else
      perform public.touchline_social_assert_executor_approval_gate(new.id);
    end if;
  end if;
  return new;
end
$$;

alter table public.touchline_social_match_preview_executor_cycles enable row level security;
alter table public.touchline_social_match_preview_executor_cycles force row level security;
alter table public.touchline_social_match_preview_generation_jobs enable row level security;
alter table public.touchline_social_match_preview_generation_jobs force row level security;
alter table public.touchline_social_match_preview_review_intents enable row level security;
alter table public.touchline_social_match_preview_review_intents force row level security;

revoke all privileges on table public.touchline_social_match_preview_executor_cycles,
  public.touchline_social_match_preview_generation_jobs,
  public.touchline_social_match_preview_review_intents from public, anon, authenticated, service_role;
grant select on table public.touchline_social_match_preview_executor_cycles,
  public.touchline_social_match_preview_generation_jobs to service_role;

revoke all on function public.touchline_social_041_claim_cycle(text) from public, anon, authenticated;
revoke all on function public.touchline_social_041_renew_cycle(text, uuid) from public, anon, authenticated;
revoke all on function public.touchline_social_041_complete_cycle(text, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.touchline_social_041_enqueue_job(uuid, text, text, timestamptz, timestamptz, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.touchline_social_041_claim_job(uuid) from public, anon, authenticated;
revoke all on function public.touchline_social_041_renew_job(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.touchline_social_041_complete_job(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.touchline_social_041_assert_approval_gate(uuid) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_041_issue_review_intent(uuid, text, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_041_approve(uuid, uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.touchline_social_041_claim_cycle(text) to service_role;
grant execute on function public.touchline_social_041_renew_cycle(text, uuid) to service_role;
grant execute on function public.touchline_social_041_complete_cycle(text, uuid, text, text, integer) to service_role;
grant execute on function public.touchline_social_041_enqueue_job(uuid, text, text, timestamptz, timestamptz, text, jsonb, text) to service_role;
grant execute on function public.touchline_social_041_claim_job(uuid) to service_role;
grant execute on function public.touchline_social_041_renew_job(uuid, uuid, uuid) to service_role;
grant execute on function public.touchline_social_041_complete_job(uuid, uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.touchline_social_041_issue_review_intent(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.touchline_social_041_approve(uuid, uuid, text, text, text, text, text, uuid) to authenticated;

commit;
