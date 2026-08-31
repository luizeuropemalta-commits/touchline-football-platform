-- QA-only schema candidate for human-approved social publishing.
-- This prepares an immutable approval/outbox boundary. It does not connect to
-- Meta, store an Instagram secret or dispatch content.

begin;
set local lock_timeout = '5s';

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-schema-039', 0));

-- Supabase Storage has no historical revision retrieval contract. Social
-- artifacts therefore use a private bucket and a content-addressed object key.
-- The server-only adapter uploads with x-upsert=false and re-hashes downloaded
-- bytes before dispatch. ETag is only an additional conditional-read guard.
-- The bucket itself must be created first through the supported Storage API.
-- This migration never mutates storage schema metadata directly.

do $$
begin
  if not exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'touchline-social-drafts'
      and bucket.name = 'touchline-social-drafts'
      and bucket.public = false
      and bucket.file_size_limit = 12582912
      and bucket.allowed_mime_types @> array['image/png', 'image/jpeg']::text[]
      and bucket.allowed_mime_types <@ array['image/png', 'image/jpeg']::text[]
  ) then
    raise exception 'TL_SOCIAL_STORAGE_BUCKET_CONTRACT_MISMATCH';
  end if;
end;
$$;

do $$
begin
  if pg_catalog.to_regclass('public.touchline_platform_owner_accounts') is null then
    raise exception 'TL_SOCIAL_OWNER_REGISTRY_REQUIRED';
  end if;
  if exists (
    select 1
    from unnest(array[
      'football_competitions',
      'football_seasons',
      'football_rounds',
      'football_clubs',
      'football_players',
      'football_squad_members',
      'football_fixtures',
      'football_fantasy_fixture_feeds',
      'football_fixture_lifecycle_events',
      'football_player_season_statistics',
      'touchline_player_fixture_score_settlements',
      'touchline_card_publications',
      'football_player_market_values',
      'touchline_card_editorial_overrides',
      'touchline_formation_geometry_versions',
      'touchline_coach_ranking_snapshots',
      'touchline_coach_ranking_active_snapshots',
      'touchline_card_ranking_snapshots',
      'touchline_card_ranking_active_snapshots'
    ]::text[]) as dependency(table_name)
    where pg_catalog.to_regclass('public.' || dependency.table_name) is null
  ) then
    raise exception 'TL_SOCIAL_RENDER_SOURCE_DEPENDENCY_REQUIRED';
  end if;
  if pg_catalog.to_regclass('public.touchline_social_publication_drafts') is not null
     or pg_catalog.to_regclass('public.touchline_social_generation_reviews') is not null
     or pg_catalog.to_regclass('public.touchline_social_generation_cycles') is not null
     or pg_catalog.to_regclass('public.touchline_social_owner_approvers') is not null
     or pg_catalog.to_regclass('public.touchline_social_review_intents') is not null
     or pg_catalog.to_regclass('public.touchline_social_dispatch_attempts') is not null
     or pg_catalog.to_regclass('public.touchline_social_source_clock') is not null
     or pg_catalog.to_regclass('public.touchline_social_source_revisions') is not null then
    raise exception 'TL_SOCIAL_039_REQUIRES_FRESH_SCHEMA';
  end if;
end;
$$;

-- Freeze the already-approved platform-owner identities for this control plane.
-- The generic service-role owner-registration RPC cannot add social approvers
-- after this migration; changing this list requires another audited migration.
-- This exact QA manifest is the canonical persona already recorded in the
-- repository. Shared-QA apply remains prohibited until an independent
-- OWNER-only read proves the same UUID, normalized email and count.
do $$
declare
  v_expected_user_id constant uuid := '60277b78-1e65-4e2e-89f0-67e7b819ed24';
  v_expected_email constant text := 'admin@touchline.com.br';
begin
  if (select count(*) from public.touchline_platform_owner_accounts) <> 1
     or not exists (
       select 1
       from public.touchline_platform_owner_accounts owner_account
       join auth.users auth_user on auth_user.id = owner_account.user_id
       where owner_account.user_id = v_expected_user_id
         and owner_account.normalized_email = v_expected_email
         and lower(btrim(coalesce(auth_user.email, ''))) = v_expected_email
         and auth_user.email_confirmed_at is not null
     ) then
    raise exception 'TL_SOCIAL_OWNER_APPROVER_MANIFEST_MISMATCH';
  end if;
end;
$$;

create table public.touchline_social_owner_approvers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  normalized_email text not null unique,
  registered_at timestamptz not null,
  frozen_at timestamptz not null default clock_timestamp(),
  check (normalized_email = lower(btrim(normalized_email)))
);

insert into public.touchline_social_owner_approvers (user_id, normalized_email, registered_at)
select owner_account.user_id, owner_account.normalized_email, owner_account.registered_at
from public.touchline_platform_owner_accounts owner_account
where owner_account.user_id = '60277b78-1e65-4e2e-89f0-67e7b819ed24'
  and owner_account.normalized_email = 'admin@touchline.com.br';

do $$
begin
  if (select count(*) from public.touchline_social_owner_approvers) <> 1 then
    raise exception 'TL_SOCIAL_OWNER_APPROVER_SNAPSHOT_MISMATCH';
  end if;
end;
$$;

drop policy if exists touchline_social_drafts_service_read on storage.objects;
create policy touchline_social_drafts_service_read
on storage.objects for select to service_role
using (bucket_id = 'touchline-social-drafts');

drop policy if exists touchline_social_drafts_service_create on storage.objects;
create policy touchline_social_drafts_service_create
on storage.objects for insert to service_role
with check (bucket_id = 'touchline-social-drafts');

-- Every database row consumed by the social renderer participates in a
-- transactional semantic-revision manifest. The singleton clock detects a
-- multi-query read that crossed any dependency write; the per-entity rows
-- keep unrelated fixtures/clubs from invalidating each other.
create table public.touchline_social_source_clock (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.touchline_social_source_clock (singleton, revision)
values (true, 0);

create table public.touchline_social_source_revisions (
  source_key text primary key check (
    source_key ~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking):[A-Za-z0-9._-]{1,160}$'
  ),
  revision bigint not null default 1 check (revision > 0),
  last_reason_code text not null check (last_reason_code ~ '^[A-Z0-9_:-]{1,160}$'),
  updated_at timestamptz not null default clock_timestamp()
);

-- PostgreSQL exposes jsonb_object_keys(), but not a scalar
-- jsonb_object_length() helper. Keep the bounded-manifest constraint inside
-- the database without relying on a subquery (which CHECK constraints reject).
create or replace function public.touchline_social_jsonb_object_length(p_value jsonb)
returns integer
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select count(*)::integer
  from pg_catalog.jsonb_object_keys(p_value)
$$;

create table public.touchline_social_publication_drafts (
  id uuid primary key default gen_random_uuid(),
  publication_key text not null unique,
  fixture_provider_id text not null check (fixture_provider_id ~ '^[1-9][0-9]{0,19}$'),
  team_provider_id text check (team_provider_id is null or team_provider_id ~ '^[1-9][0-9]{0,19}$'),
  content_type text not null check (content_type in ('LINEUP', 'FINAL_SCORE')),
  placement text not null check (placement in ('INSTAGRAM_FEED', 'INSTAGRAM_STORY')),
  locale text not null check (locale in ('pt-BR', 'en-GB')),
  revision integer not null check (revision > 0),
  render_path text not null,
  width integer not null check (width = 1080),
  height integer not null,
  caption text not null check (position('COMING SOON • CURRENTLY IN TESTING' in caption) > 0),
  first_observed_at timestamptz not null,
  source_snapshot_at timestamptz not null,
  generated_at timestamptz not null,
  generation_latency_ms bigint generated always as (
    (extract(epoch from (generated_at - first_observed_at)) * 1000)::bigint
  ) stored,
  template_version text not null check (template_version ~ '^[A-Za-z0-9._-]{1,160}$'),
  source_version text not null check (source_version ~ '^[A-Za-z0-9._-]{1,160}$'),
  source_checksum text not null check (source_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_revision_manifest jsonb not null check (
    jsonb_typeof(source_revision_manifest) = 'object'
    and public.touchline_social_jsonb_object_length(source_revision_manifest) between 1 and 128
  ),
  source_revision_checksum text not null check (source_revision_checksum ~ '^sha256:[0-9a-f]{64}$'),
  input_checksum text not null check (input_checksum ~ '^sha256:[0-9a-f]{64}$'),
  artifact_content_type text not null check (artifact_content_type in ('image/png', 'image/jpeg')),
  artifact_byte_length bigint not null check (artifact_byte_length > 0),
  artifact_storage_provider text not null check (artifact_storage_provider = 'SUPABASE_STORAGE'),
  artifact_storage_bucket text not null check (artifact_storage_bucket = 'touchline-social-drafts'),
  artifact_storage_key text not null check (length(artifact_storage_key) between 32 and 1024),
  artifact_etag text check (
    artifact_etag is null
    or (length(artifact_etag) between 1 and 256 and artifact_etag !~ '[[:cntrl:]]')
  ),
  manifest_checksum text not null check (manifest_checksum ~ '^sha256:[0-9a-f]{64}$'),
  artifact_checksum text not null check (artifact_checksum ~ '^sha256:[0-9a-f]{64}$'),
  caption_checksum text not null check (caption_checksum ~ '^sha256:[0-9a-f]{64}$'),
  approval_state text not null default 'APPROVAL_REQUIRED'
    check (approval_state in ('APPROVAL_REQUIRED', 'APPROVED', 'CANCELLED')),
  artwork_approval_state text not null default 'APPROVAL_REQUIRED'
    check (artwork_approval_state in ('APPROVAL_REQUIRED', 'APPROVED')),
  caption_approval_state text not null default 'APPROVAL_REQUIRED'
    check (caption_approval_state in ('APPROVAL_REQUIRED', 'APPROVED')),
  approved_artifact_checksum text check (
    approved_artifact_checksum is null
    or approved_artifact_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  artwork_approved_manifest_checksum text check (
    artwork_approved_manifest_checksum is null
    or artwork_approved_manifest_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  artwork_approved_at timestamptz,
  artwork_approved_by uuid references auth.users(id) on delete restrict,
  approved_caption_checksum text check (
    approved_caption_checksum is null
    or approved_caption_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  caption_approved_manifest_checksum text check (
    caption_approved_manifest_checksum is null
    or caption_approved_manifest_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  caption_approved_at timestamptz,
  caption_approved_by uuid references auth.users(id) on delete restrict,
  approved_manifest_checksum text check (
    approved_manifest_checksum is null
    or approved_manifest_checksum ~ '^sha256:[0-9a-f]{64}$'
  ),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, revision),
  unique (artifact_storage_bucket, artifact_storage_key),
  check (
    (content_type = 'LINEUP' and team_provider_id is not null)
    or (content_type = 'FINAL_SCORE' and team_provider_id is null)
  ),
  check (source_snapshot_at >= first_observed_at),
  check (generated_at >= source_snapshot_at),
  check (content_type <> 'LINEUP' or input_checksum = source_checksum),
  check (
    publication_key = 'instagram:' || placement || ':' || content_type || ':'
      || fixture_provider_id || ':' || coalesce(team_provider_id, 'fixture') || ':'
      || locale || ':tv=' || template_version || ':sv=' || source_version
      || ':r=' || revision::text
  ),
  check (
    (placement = 'INSTAGRAM_FEED' and height = 1350)
    or (placement = 'INSTAGRAM_STORY' and height = 1920)
  ),
  check (
    render_path = case content_type
      when 'LINEUP' then '/visual-qa/social-lineup?fixtureId=' || fixture_provider_id
        || '&teamId=' || team_provider_id
        || '&locale=' || locale
        || '&revision=' || revision::text
      when 'FINAL_SCORE' then '/visual-qa/social-final-score?fixtureId=' || fixture_provider_id
        || '&locale=' || locale
        || '&revision=' || revision::text
    end
  ),
  check (
    artifact_storage_key = 'instagram/' || lower(placement) || '/'
      || lower(content_type) || '/' || fixture_provider_id || '/'
      || coalesce(team_provider_id, 'fixture') || '/' || locale || '/tv='
      || template_version || '/sv=' || source_version || '/r=' || revision::text || '/'
      || substring(artifact_checksum from 8)
      || case artifact_content_type when 'image/png' then '.png' else '.jpg' end
  ),
  check (
    (
      artwork_approval_state = 'APPROVED'
      and approved_artifact_checksum = artifact_checksum
      and artwork_approved_manifest_checksum = manifest_checksum
      and artwork_approved_at is not null
      and artwork_approved_by is not null
    )
    or (
      artwork_approval_state = 'APPROVAL_REQUIRED'
      and approved_artifact_checksum is null
      and artwork_approved_manifest_checksum is null
      and artwork_approved_at is null
      and artwork_approved_by is null
    )
  ),
  check (
    (
      caption_approval_state = 'APPROVED'
      and approved_caption_checksum = caption_checksum
      and caption_approved_manifest_checksum = manifest_checksum
      and caption_approved_at is not null
      and caption_approved_by is not null
    )
    or (
      caption_approval_state = 'APPROVAL_REQUIRED'
      and approved_caption_checksum is null
      and caption_approved_manifest_checksum is null
      and caption_approved_at is null
      and caption_approved_by is null
    )
  ),
  check (
    (
      approval_state = 'APPROVED'
      and artwork_approval_state = 'APPROVED'
      and caption_approval_state = 'APPROVED'
      and approved_artifact_checksum = artifact_checksum
      and approved_caption_checksum = caption_checksum
      and approved_manifest_checksum = manifest_checksum
      and cancelled_at is null
      and cancelled_by is null
    )
    or (
      approval_state = 'CANCELLED'
      and approved_manifest_checksum is null
      and cancelled_at is not null
      and cancelled_by is not null
    )
    or (
      approval_state = 'APPROVAL_REQUIRED'
      and approved_manifest_checksum is null
      and cancelled_at is null
      and cancelled_by is null
    )
  )
);

create table public.touchline_social_generation_reviews (
  id uuid primary key default gen_random_uuid(),
  fixture_provider_id text not null check (fixture_provider_id ~ '^[1-9][0-9]{0,19}$'),
  team_provider_id text not null check (team_provider_id ~ '^[1-9][0-9]{0,19}$'),
  content_type text not null check (content_type = 'LINEUP'),
  template_version text not null check (template_version ~ '^[A-Za-z0-9._-]{1,160}$'),
  review_state text not null check (review_state in ('REVIEW_REQUIRED', 'GENERATING', 'GENERATED')),
  reason_code text not null check (reason_code ~ '^[A-Z0-9_:-]{1,160}$'),
  first_observed_at timestamptz not null,
  last_checked_at timestamptz not null,
  input_checksum text not null check (input_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_revision_manifest jsonb not null check (
    jsonb_typeof(source_revision_manifest) = 'object'
    and public.touchline_social_jsonb_object_length(source_revision_manifest) between 1 and 128
  ),
  source_revision_checksum text not null check (source_revision_checksum ~ '^sha256:[0-9a-f]{64}$'),
  attempt_count integer not null check (attempt_count between 1 and 1000),
  next_eligible_at timestamptz,
  generated_draft_id uuid references public.touchline_social_publication_drafts(id) on delete restrict,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (fixture_provider_id, team_provider_id, content_type, template_version),
  check (last_checked_at >= first_observed_at),
  check (
    (review_state = 'REVIEW_REQUIRED' and generated_draft_id is null
      and lease_token is null and lease_expires_at is null and next_eligible_at is not null)
    or (review_state = 'GENERATING' and generated_draft_id is null
      and lease_token is not null and lease_expires_at is not null and next_eligible_at is null)
    or (review_state = 'GENERATED' and generated_draft_id is not null
      and lease_token is null and lease_expires_at is null and next_eligible_at is null)
  )
);

create table public.touchline_social_generation_cycles (
  lease_name text primary key check (lease_name = 'lineup-draft-watcher'),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_eligible_at timestamptz not null default '-infinity'::timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures between 0 and 1000),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_outcome text check (last_outcome is null or last_outcome in ('SUCCESS', 'FAILURE')),
  updated_at timestamptz not null default clock_timestamp(),
  check ((lease_token is null) = (lease_expires_at is null))
);

create table public.touchline_social_review_intents (
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

create table public.touchline_social_dispatch_attempts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  draft_revision integer not null check (draft_revision > 0),
  approved_artifact_checksum text not null check (approved_artifact_checksum ~ '^sha256:[0-9a-f]{64}$'),
  approved_caption_checksum text not null check (approved_caption_checksum ~ '^sha256:[0-9a-f]{64}$'),
  approved_manifest_checksum text not null check (approved_manifest_checksum ~ '^sha256:[0-9a-f]{64}$'),
  artifact_content_type text not null check (artifact_content_type in ('image/png', 'image/jpeg')),
  artifact_byte_length bigint not null check (artifact_byte_length > 0),
  artifact_storage_provider text not null check (artifact_storage_provider = 'SUPABASE_STORAGE'),
  artifact_storage_bucket text not null check (artifact_storage_bucket = 'touchline-social-drafts'),
  artifact_storage_key text not null check (length(artifact_storage_key) between 32 and 1024),
  artifact_etag text check (
    artifact_etag is null
    or (length(artifact_etag) between 1 and 256 and artifact_etag !~ '[[:cntrl:]]')
  ),
  attempt_generation integer not null check (attempt_generation between 1 and 3),
  idempotency_key text not null
    check (idempotency_key ~ '^sha256:[0-9a-f]{64}$'),
  state text not null check (state in ('PENDING', 'IN_FLIGHT', 'SENT', 'FAILED', 'DELIVERY_UNKNOWN', 'INVALIDATED')),
  connection_id text not null check (connection_id = 'TOUCHLINE_OFFICIAL_INSTAGRAM'),
  external_publication_id text,
  error_code text,
  failure_stage text check (failure_stage is null or failure_stage = 'PRE_DISPATCH'),
  claim_token uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  attempted_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  foreign key (draft_id, draft_revision)
    references public.touchline_social_publication_drafts(id, revision)
    on delete restrict,
  unique (draft_id, draft_revision, attempt_generation),
  check (
    (state = 'PENDING' and external_publication_id is null and error_code is null
      and failure_stage is null and claim_token is null and claimed_at is null
      and claim_expires_at is null and completed_at is null)
    or (state = 'IN_FLIGHT' and external_publication_id is null and error_code is null
      and failure_stage is null and claim_token is not null and claimed_at is not null
      and claim_expires_at > claimed_at and completed_at is null)
    or (state = 'SENT' and external_publication_id is not null and error_code is null
      and failure_stage is null and claim_token is null and claimed_at is null
      and claim_expires_at is null and completed_at is not null)
    or (state = 'FAILED' and external_publication_id is null and error_code is not null
      and failure_stage = 'PRE_DISPATCH' and claim_token is null and claimed_at is null
      and claim_expires_at is null and completed_at is not null)
    or (state = 'DELIVERY_UNKNOWN' and error_code is not null
      and failure_stage is null and claim_token is null and claimed_at is null
      and claim_expires_at is null and completed_at is not null)
    or (state = 'INVALIDATED' and external_publication_id is null and error_code is not null
      and failure_stage = 'PRE_DISPATCH' and claim_token is null and claimed_at is null
      and claim_expires_at is null and completed_at is not null)
  )
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
       where entry.source_key !~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking):[A-Za-z0-9._-]{1,160}$'
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
  -- One checkpoint must observe clock and per-key revisions from the same
  -- semantic instant. Writers take the matching exclusive fence.
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
       where source_key !~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking):[A-Za-z0-9._-]{1,160}$'
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

create or replace function public.touchline_social_bump_source_revisions(
  p_source_keys text[],
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[];
  v_review public.touchline_social_generation_reviews%rowtype;
begin
  select coalesce(array_agg(source_key order by source_key), array[]::text[])
  into v_keys
  from (
    select distinct btrim(source_key) as source_key
    from unnest(coalesce(p_source_keys, array[]::text[])) source(source_key)
    where btrim(source_key) <> ''
  ) normalized;
  if coalesce(array_length(v_keys, 1), 0) = 0 then return; end if;
  if coalesce(array_length(v_keys, 1), 0) > 128
     or coalesce(p_reason_code, '') !~ '^[A-Z0-9_:-]{1,160}$'
     or exists (
       select 1 from unnest(v_keys) source_key
       where source_key !~ '^(fixture-provider|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking):[A-Za-z0-9._-]{1,160}$'
     ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_BUMP_INVALID';
  end if;

  -- Global order: semantic-source fence -> generation -> draft -> attempt.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('touchline-social-source-revision', 0)
  );
  update public.touchline_social_source_clock
  set revision = revision + 1,
      updated_at = clock_timestamp()
  where singleton = true;
  if not found then raise exception 'TL_SOCIAL_SOURCE_CLOCK_UNAVAILABLE'; end if;
  insert into public.touchline_social_source_revisions (
    source_key, revision, last_reason_code, updated_at
  )
  select source_key, 1, p_reason_code, clock_timestamp()
  from unnest(v_keys) source(source_key)
  on conflict (source_key) do update
  set revision = public.touchline_social_source_revisions.revision + 1,
      last_reason_code = excluded.last_reason_code,
      updated_at = excluded.updated_at;

  for v_review in
    select review.*
    from public.touchline_social_generation_reviews review
    where review.content_type = 'LINEUP'
      and review.source_revision_manifest ?| v_keys
    order by review.fixture_provider_id, review.team_provider_id, review.template_version
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'touchline-social-generation:' || v_review.fixture_provider_id || ':'
        || v_review.team_provider_id || ':' || v_review.template_version,
      0
    ));
    select * into v_review
    from public.touchline_social_generation_reviews review
    where review.id = v_review.id
    for update;
    if v_review.id is null or not (v_review.source_revision_manifest ?| v_keys) then
      continue;
    end if;
    if v_review.generated_draft_id is not null then
      perform set_config('touchline.social_transition', 'invalidate_dispatch', true);
      update public.touchline_social_dispatch_attempts
      set state = 'INVALIDATED',
          error_code = 'SEMANTIC_SOURCE_REVISION_CHANGED',
          failure_stage = 'PRE_DISPATCH',
          completed_at = clock_timestamp()
      where draft_id = v_review.generated_draft_id
        and state = 'PENDING';
      update public.touchline_social_dispatch_attempts
      set state = 'DELIVERY_UNKNOWN',
          error_code = 'SEMANTIC_SOURCE_CHANGED_DURING_CLAIM',
          failure_stage = null,
          claim_token = null,
          claimed_at = null,
          claim_expires_at = null,
          completed_at = clock_timestamp()
      where draft_id = v_review.generated_draft_id
        and state = 'IN_FLIGHT';
    end if;
    perform set_config('touchline.social_transition', 'invalidate_source', true);
    update public.touchline_social_generation_reviews
    set review_state = 'REVIEW_REQUIRED',
        reason_code = p_reason_code,
        generated_draft_id = null,
        lease_token = null,
        lease_expires_at = null,
        next_eligible_at = clock_timestamp(),
        last_checked_at = clock_timestamp()
    where id = v_review.id;
  end loop;
end;
$$;

create or replace function public.touchline_social_track_render_dependency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_keys text[] := array[]::text[];
  v_row jsonb;
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
    if v_row is null then continue; end if;
    -- Evaluate OLD and NEW independently. A provider reclassification must
    -- still invalidate the previous SportMonks identity; using one coalesced
    -- provider value would silently lose that dependency.
    if coalesce(v_row ->> 'provider', 'sportmonks') is distinct from 'sportmonks' then
      continue;
    end if;
    case tg_table_name
      when 'football_fantasy_fixture_feeds' then
        v_keys := v_keys || ('fixture-provider:' || coalesce(v_row ->> 'provider_fixture_id', ''));
      when 'football_fixtures' then
        v_keys := v_keys || array[
          'fixture-provider:' || coalesce(v_row ->> 'provider_fixture_id', ''),
          'fixture:' || coalesce(v_row ->> 'id', '')
        ];
      when 'football_competitions' then
        v_keys := v_keys || ('competition:' || coalesce(v_row ->> 'id', ''));
      when 'football_seasons' then
        v_keys := v_keys || ('season:' || coalesce(v_row ->> 'id', ''));
      when 'football_rounds' then
        v_keys := v_keys || ('round:' || coalesce(v_row ->> 'id', ''));
      when 'football_clubs' then
        v_keys := v_keys || ('club:' || coalesce(v_row ->> 'id', ''));
      when 'football_players' then
        v_keys := v_keys || ('player:' || coalesce(v_row ->> 'id', ''));
      when 'football_squad_members' then
        v_keys := v_keys || array[
          'player:' || coalesce(v_row ->> 'player_id', ''),
          'club:' || coalesce(v_row ->> 'club_id', '')
        ];
      when 'touchline_card_publications', 'football_player_market_values', 'touchline_card_editorial_overrides' then
        v_keys := v_keys || ('player:' || coalesce(v_row ->> 'player_id', ''));
      when 'football_player_season_statistics' then
        v_keys := v_keys || ('player:' || coalesce(v_row ->> 'football_player_id', ''));
      when 'touchline_player_fixture_score_settlements' then
        v_keys := v_keys || array[
          'player:' || coalesce(v_row ->> 'football_player_id', ''),
          'fixture:' || coalesce(v_row ->> 'fixture_id', '')
        ];
      when 'football_fixture_lifecycle_events' then
        v_keys := v_keys || ('fixture:' || coalesce(v_row ->> 'fixture_id', ''));
      when 'touchline_formation_geometry_versions' then
        v_keys := v_keys || ('formation:' || coalesce(v_row ->> 'formation_code', ''));
      when 'touchline_coach_ranking_snapshots', 'touchline_coach_ranking_active_snapshots' then
        v_keys := v_keys || ('coach-ranking:' || coalesce(v_row ->> 'league_key', ''));
      when 'touchline_card_ranking_snapshots', 'touchline_card_ranking_active_snapshots' then
        v_keys := v_keys || ('card-ranking:' || coalesce(v_row ->> 'league_key', ''));
      else
        raise exception 'TL_SOCIAL_RENDER_SOURCE_DEPENDENCY_UNSUPPORTED_%', tg_table_name;
    end case;
  end loop;
  select coalesce(array_agg(source_key), array[]::text[])
  into v_keys
  from (
    select distinct btrim(source_key) as source_key
    from unnest(v_keys) source(source_key)
    where btrim(source_key) !~ ':$'
  ) normalized;
  perform public.touchline_social_bump_source_revisions(
    v_keys,
    'RENDER_SOURCE_' || upper(tg_table_name) || '_CHANGED'
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  v_table_name text;
  v_trigger_name text;
begin
  foreach v_table_name in array array[
    'football_competitions','football_seasons','football_rounds','football_clubs',
    'football_players','football_squad_members','football_fixtures',
    'football_fixture_lifecycle_events',
    'football_player_season_statistics','touchline_player_fixture_score_settlements',
    'touchline_card_publications','football_player_market_values',
    'touchline_card_editorial_overrides','touchline_formation_geometry_versions',
    'touchline_coach_ranking_snapshots','touchline_coach_ranking_active_snapshots',
    'touchline_card_ranking_snapshots','touchline_card_ranking_active_snapshots'
  ]::text[]
  loop
    v_trigger_name := 'tls_social_revision_' || v_table_name;
    execute pg_catalog.format('drop trigger if exists %I on public.%I', v_trigger_name, v_table_name);
    execute pg_catalog.format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.touchline_social_track_render_dependency()',
      v_trigger_name,
      v_table_name
    );
  end loop;
end;
$$;

create or replace function public.touchline_social_guard_draft_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transition text := coalesce(current_setting('touchline.social_transition', true), '');
begin
  if tg_op = 'DELETE' then
    raise exception 'TL_SOCIAL_DRAFT_DELETE_FORBIDDEN';
  end if;
  if tg_op = 'INSERT' then
    if v_transition <> 'create_draft' then
      raise exception 'TL_SOCIAL_DRAFT_CREATE_RPC_REQUIRED';
    end if;
    if new.approval_state <> 'APPROVAL_REQUIRED'
       or new.artwork_approval_state <> 'APPROVAL_REQUIRED'
       or new.caption_approval_state <> 'APPROVAL_REQUIRED'
       or new.approved_artifact_checksum is not null
       or new.artwork_approved_manifest_checksum is not null
       or new.artwork_approved_at is not null
       or new.artwork_approved_by is not null
       or new.approved_caption_checksum is not null
       or new.caption_approved_manifest_checksum is not null
       or new.caption_approved_at is not null
       or new.caption_approved_by is not null
       or new.approved_manifest_checksum is not null
       or new.cancelled_at is not null
       or new.cancelled_by is not null then
      raise exception 'TL_SOCIAL_DRAFT_MUST_START_UNAPPROVED';
    end if;
    return new;
  end if;

  if row(
    new.publication_key, new.fixture_provider_id, new.team_provider_id,
    new.content_type, new.placement, new.locale, new.revision,
    new.render_path, new.width, new.height, new.caption,
    new.first_observed_at, new.source_snapshot_at, new.generated_at,
    new.template_version, new.source_version, new.source_checksum,
    new.source_revision_manifest, new.source_revision_checksum, new.input_checksum,
    new.artifact_content_type, new.artifact_byte_length,
    new.artifact_storage_provider, new.artifact_storage_bucket,
    new.artifact_storage_key, new.artifact_etag,
    new.manifest_checksum, new.artifact_checksum, new.caption_checksum, new.created_at
  ) is distinct from row(
    old.publication_key, old.fixture_provider_id, old.team_provider_id,
    old.content_type, old.placement, old.locale, old.revision,
    old.render_path, old.width, old.height, old.caption,
    old.first_observed_at, old.source_snapshot_at, old.generated_at,
    old.template_version, old.source_version, old.source_checksum,
    old.source_revision_manifest, old.source_revision_checksum, old.input_checksum,
    old.artifact_content_type, old.artifact_byte_length,
    old.artifact_storage_provider, old.artifact_storage_bucket,
    old.artifact_storage_key, old.artifact_etag,
    old.manifest_checksum, old.artifact_checksum, old.caption_checksum, old.created_at
  ) then
    raise exception 'TL_SOCIAL_DRAFT_CONTENT_IMMUTABLE';
  end if;

  if row(
       new.approval_state, new.artwork_approval_state, new.caption_approval_state,
       new.approved_artifact_checksum, new.artwork_approved_manifest_checksum,
       new.artwork_approved_at, new.artwork_approved_by,
       new.approved_caption_checksum, new.caption_approved_manifest_checksum,
       new.caption_approved_at, new.caption_approved_by,
       new.approved_manifest_checksum, new.cancelled_at, new.cancelled_by
     )
     is distinct from
     row(
       old.approval_state, old.artwork_approval_state, old.caption_approval_state,
       old.approved_artifact_checksum, old.artwork_approved_manifest_checksum,
       old.artwork_approved_at, old.artwork_approved_by,
       old.approved_caption_checksum, old.caption_approved_manifest_checksum,
       old.caption_approved_at, old.caption_approved_by,
       old.approved_manifest_checksum, old.cancelled_at, old.cancelled_by
     ) then
    if v_transition not in ('approve_artwork', 'approve_caption', 'cancel') then
      raise exception 'TL_SOCIAL_TRANSITION_RPC_REQUIRED';
    end if;
  end if;

  if old.approval_state in ('APPROVED', 'CANCELLED')
     and new.approval_state is distinct from old.approval_state then
    raise exception 'TL_SOCIAL_TERMINAL_STATE_IMMUTABLE';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists touchline_social_publication_drafts_guard
  on public.touchline_social_publication_drafts;
create trigger touchline_social_publication_drafts_guard
before insert or update or delete on public.touchline_social_publication_drafts
for each row execute function public.touchline_social_guard_draft_mutation();

create or replace function public.touchline_social_guard_dispatch_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transition text := coalesce(current_setting('touchline.social_transition', true), '');
begin
  if tg_op = 'DELETE' then
    raise exception 'TL_SOCIAL_DISPATCH_DELETE_FORBIDDEN';
  end if;
  if tg_op = 'INSERT' and v_transition <> 'enqueue' then
    raise exception 'TL_SOCIAL_DISPATCH_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE' then
    if v_transition not in ('claim_dispatch', 'complete', 'invalidate_dispatch', 'recover_dispatch') then
      raise exception 'TL_SOCIAL_DISPATCH_RPC_REQUIRED';
    end if;
    if row(new.draft_id, new.draft_revision, new.approved_artifact_checksum,
           new.approved_caption_checksum,
           new.approved_manifest_checksum,
           new.artifact_content_type, new.artifact_byte_length,
           new.artifact_storage_provider, new.artifact_storage_bucket,
           new.artifact_storage_key, new.artifact_etag,
           new.attempt_generation,
           new.idempotency_key, new.connection_id, new.attempted_at)
       is distinct from
       row(old.draft_id, old.draft_revision, old.approved_artifact_checksum,
           old.approved_caption_checksum,
           old.approved_manifest_checksum,
           old.artifact_content_type, old.artifact_byte_length,
           old.artifact_storage_provider, old.artifact_storage_bucket,
           old.artifact_storage_key, old.artifact_etag,
           old.attempt_generation,
           old.idempotency_key, old.connection_id, old.attempted_at) then
      raise exception 'TL_SOCIAL_DISPATCH_IDENTITY_IMMUTABLE';
    end if;
    if v_transition = 'claim_dispatch'
       and (old.state <> 'PENDING' or new.state <> 'IN_FLIGHT'
         or new.claim_token is null or new.claimed_at is null
         or new.claim_expires_at <= new.claimed_at) then
      raise exception 'TL_SOCIAL_DISPATCH_CLAIM_TRANSITION_INVALID';
    end if;
    if v_transition = 'invalidate_dispatch'
       and not (
         (old.state = 'PENDING' and new.state = 'INVALIDATED')
         or (old.state = 'IN_FLIGHT' and new.state = 'DELIVERY_UNKNOWN')
       ) then
      raise exception 'TL_SOCIAL_DISPATCH_INVALIDATION_TRANSITION_INVALID';
    end if;
    if v_transition = 'complete'
       and (old.state <> 'IN_FLIGHT' or new.claim_token is not null
         or new.claimed_at is not null or new.claim_expires_at is not null) then
      raise exception 'TL_SOCIAL_DISPATCH_TERMINAL';
    end if;
    if v_transition = 'recover_dispatch'
       and (old.state <> 'IN_FLIGHT' or new.state <> 'DELIVERY_UNKNOWN'
         or new.claim_token is not null or new.claimed_at is not null
         or new.claim_expires_at is not null) then
      raise exception 'TL_SOCIAL_DISPATCH_RECOVERY_TRANSITION_INVALID';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists touchline_social_dispatch_attempts_guard
  on public.touchline_social_dispatch_attempts;
create trigger touchline_social_dispatch_attempts_guard
before insert or update or delete on public.touchline_social_dispatch_attempts
for each row execute function public.touchline_social_guard_dispatch_mutation();

create or replace function public.touchline_social_guard_generation_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transition text := coalesce(current_setting('touchline.social_transition', true), '');
begin
  if tg_op = 'DELETE' then raise exception 'TL_SOCIAL_GENERATION_REVIEW_DELETE_FORBIDDEN'; end if;
  if v_transition not in ('claim_generation', 'complete_generation', 'invalidate_source') then
    raise exception 'TL_SOCIAL_GENERATION_REVIEW_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE' then
    if row(new.fixture_provider_id, new.team_provider_id, new.content_type,
           new.template_version, new.first_observed_at, new.created_at)
       is distinct from
       row(old.fixture_provider_id, old.team_provider_id, old.content_type,
           old.template_version, old.first_observed_at, old.created_at) then
      raise exception 'TL_SOCIAL_GENERATION_REVIEW_IDENTITY_IMMUTABLE';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists touchline_social_generation_reviews_guard
  on public.touchline_social_generation_reviews;
create trigger touchline_social_generation_reviews_guard
before insert or update or delete on public.touchline_social_generation_reviews
for each row execute function public.touchline_social_guard_generation_review_mutation();

-- The persisted fixture feed is the operational source for the official team
-- sheet. A semantic change invalidates every generated revision for that
-- fixture in the same database transaction as the feed write. This closes the
-- gap where a global successful watcher cycle could otherwise leave an older
-- per-team draft dispatchable until its next bounded worker turn.
create or replace function public.touchline_social_invalidate_on_fixture_feed_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[] := array[]::text[];
begin
  if row(
       new.fixture_payload,
       new.lineups_payload,
       new.formations_payload,
       new.sidelined_payload,
       new.events_payload
     ) is not distinct from row(
       old.fixture_payload,
       old.lineups_payload,
       old.formations_payload,
       old.sidelined_payload,
       old.events_payload
     ) then
    return new;
  end if;

  if old.provider = 'sportmonks' then
    v_keys := v_keys || ('fixture-provider:' || old.provider_fixture_id);
  end if;
  if new.provider = 'sportmonks' then
    v_keys := v_keys || ('fixture-provider:' || new.provider_fixture_id);
  end if;
  perform public.touchline_social_bump_source_revisions(
    v_keys,
    'OFFICIAL_SOURCE_FEED_CHANGED'
  );
  return new;
end;
$$;

drop trigger if exists touchline_social_fixture_feed_invalidation
  on public.football_fantasy_fixture_feeds;
create trigger touchline_social_fixture_feed_invalidation
after update of fixture_payload, lineups_payload, formations_payload, sidelined_payload, events_payload
on public.football_fantasy_fixture_feeds
for each row execute function public.touchline_social_invalidate_on_fixture_feed_change();

drop trigger if exists touchline_social_fixture_feed_identity_revision
  on public.football_fantasy_fixture_feeds;
create trigger touchline_social_fixture_feed_identity_revision
after update of provider, provider_fixture_id
on public.football_fantasy_fixture_feeds
for each row execute function public.touchline_social_track_render_dependency();

drop trigger if exists touchline_social_fixture_feed_presence_revision
  on public.football_fantasy_fixture_feeds;
create trigger touchline_social_fixture_feed_presence_revision
after insert or delete on public.football_fantasy_fixture_feeds
for each row execute function public.touchline_social_track_render_dependency();

create or replace function public.touchline_social_guard_generation_cycle_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transition text := coalesce(current_setting('touchline.social_transition', true), '');
begin
  if tg_op = 'DELETE' then raise exception 'TL_SOCIAL_GENERATION_CYCLE_DELETE_FORBIDDEN'; end if;
  if v_transition not in ('claim_cycle', 'complete_cycle') then
    raise exception 'TL_SOCIAL_GENERATION_CYCLE_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE' and new.lease_name is distinct from old.lease_name then
    raise exception 'TL_SOCIAL_GENERATION_CYCLE_IDENTITY_IMMUTABLE';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists touchline_social_generation_cycles_guard
  on public.touchline_social_generation_cycles;
create trigger touchline_social_generation_cycles_guard
before insert or update or delete on public.touchline_social_generation_cycles
for each row execute function public.touchline_social_guard_generation_cycle_mutation();

create or replace function public.touchline_social_claim_generation_cycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.touchline_social_generation_cycles%rowtype;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-generation-cycle', 0));
  perform set_config('touchline.social_transition', 'claim_cycle', true);
  insert into public.touchline_social_generation_cycles (lease_name)
  values ('lineup-draft-watcher')
  on conflict (lease_name) do nothing;
  select * into v_cycle
  from public.touchline_social_generation_cycles
  where lease_name = 'lineup-draft-watcher'
  for update;
  if v_cycle.lease_token is not null and v_cycle.lease_expires_at > v_now then
    return jsonb_build_object('ok', true, 'outcome', 'busy', 'leaseExpiresAt', v_cycle.lease_expires_at);
  end if;
  if v_cycle.next_eligible_at > v_now then
    return jsonb_build_object('ok', true, 'outcome', 'cooldown', 'nextEligibleAt', v_cycle.next_eligible_at);
  end if;
  update public.touchline_social_generation_cycles
  set lease_token = v_token,
      lease_expires_at = v_now + interval '10 minutes',
      last_started_at = v_now
  where lease_name = 'lineup-draft-watcher';
  return jsonb_build_object(
    'ok', true, 'outcome', 'claimed', 'leaseToken', v_token,
    'leaseExpiresAt', v_now + interval '10 minutes'
  );
end;
$$;

create or replace function public.touchline_social_renew_generation_cycle(
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.touchline_social_generation_cycles%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_lease_token is null then
    raise exception 'TL_SOCIAL_GENERATION_CYCLE_RENEWAL_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-generation-cycle', 0));
  select * into v_cycle
  from public.touchline_social_generation_cycles
  where lease_name = 'lineup-draft-watcher'
  for update;
  if v_cycle.lease_token is distinct from p_lease_token
     or v_cycle.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_GENERATION_CYCLE_LEASE_INVALID';
  end if;
  perform set_config('touchline.social_transition', 'claim_cycle', true);
  update public.touchline_social_generation_cycles
  set lease_expires_at = v_now + interval '10 minutes'
  where lease_name = 'lineup-draft-watcher';
  return jsonb_build_object(
    'ok', true,
    'outcome', 'renewed',
    'leaseExpiresAt', v_now + interval '10 minutes'
  );
end;
$$;

create or replace function public.touchline_social_complete_generation_cycle(
  p_lease_token uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.touchline_social_generation_cycles%rowtype;
  v_failures integer;
  v_delay_seconds integer;
begin
  if p_lease_token is null or coalesce(p_outcome, '') not in ('SUCCESS', 'FAILURE') then
    raise exception 'TL_SOCIAL_GENERATION_CYCLE_COMPLETION_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-generation-cycle', 0));
  select * into v_cycle
  from public.touchline_social_generation_cycles
  where lease_name = 'lineup-draft-watcher'
  for update;
  if v_cycle.lease_token is distinct from p_lease_token
     or v_cycle.lease_expires_at <= clock_timestamp() then
    raise exception 'TL_SOCIAL_GENERATION_CYCLE_LEASE_INVALID';
  end if;
  v_failures := case when p_outcome = 'SUCCESS' then 0 else least(v_cycle.consecutive_failures + 1, 1000) end;
  v_delay_seconds := case
    when p_outcome = 'SUCCESS' then 10
    else least(300, 10 * (2 ^ least(v_failures, 5)))::integer
  end;
  perform set_config('touchline.social_transition', 'complete_cycle', true);
  update public.touchline_social_generation_cycles
  set lease_token = null,
      lease_expires_at = null,
      next_eligible_at = clock_timestamp() + pg_catalog.make_interval(secs => v_delay_seconds),
      consecutive_failures = v_failures,
      last_completed_at = clock_timestamp(),
      last_outcome = p_outcome
  where lease_name = 'lineup-draft-watcher';
  return jsonb_build_object('ok', true, 'outcome', lower(p_outcome), 'nextDelaySeconds', v_delay_seconds);
end;
$$;

create or replace function public.touchline_social_create_draft(p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing public.touchline_social_publication_drafts%rowtype;
  v_publication_key text := btrim(coalesce(p_draft ->> 'publication_key', ''));
begin
  if jsonb_typeof(p_draft) <> 'object'
     or v_publication_key = ''
     or coalesce(p_draft ->> 'manifest_checksum', '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_draft ->> 'artifact_checksum', '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_draft ->> 'caption_checksum', '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_draft ->> 'input_checksum', '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_draft ->> 'source_revision_checksum', '') !~ '^sha256:[0-9a-f]{64}$'
     or not public.touchline_social_source_revision_is_current(
       p_draft -> 'source_revision_manifest',
       p_draft ->> 'source_revision_checksum'
     )
     or (
       p_draft ->> 'content_type' = 'LINEUP'
       and p_draft ->> 'input_checksum' is distinct from p_draft ->> 'source_checksum'
     ) then
    raise exception 'TL_SOCIAL_DRAFT_CREATE_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  if not public.touchline_social_source_revision_is_current(
    p_draft -> 'source_revision_manifest',
    p_draft ->> 'source_revision_checksum'
  ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE';
  end if;
  if p_draft ->> 'content_type' = 'LINEUP' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'touchline-social-generation:' || (p_draft ->> 'fixture_provider_id') || ':'
        || (p_draft ->> 'team_provider_id') || ':' || (p_draft ->> 'template_version'),
      0
    ));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-publication:' || v_publication_key, 0
  ));
  perform set_config('touchline.social_transition', 'create_draft', true);
  insert into public.touchline_social_publication_drafts (
    publication_key, fixture_provider_id, team_provider_id, content_type,
    placement, locale, revision, render_path, width, height, caption,
    first_observed_at, source_snapshot_at, generated_at,
    template_version, source_version, source_checksum,
    source_revision_manifest, source_revision_checksum, input_checksum,
    artifact_content_type, artifact_byte_length,
    artifact_storage_provider, artifact_storage_bucket, artifact_storage_key,
    artifact_etag, manifest_checksum, artifact_checksum, caption_checksum
  ) values (
    v_publication_key,
    p_draft ->> 'fixture_provider_id',
    nullif(p_draft ->> 'team_provider_id', ''),
    p_draft ->> 'content_type',
    p_draft ->> 'placement',
    p_draft ->> 'locale',
    (p_draft ->> 'revision')::integer,
    p_draft ->> 'render_path',
    (p_draft ->> 'width')::integer,
    (p_draft ->> 'height')::integer,
    p_draft ->> 'caption',
    (p_draft ->> 'first_observed_at')::timestamptz,
    (p_draft ->> 'source_snapshot_at')::timestamptz,
    (p_draft ->> 'generated_at')::timestamptz,
    p_draft ->> 'template_version',
    p_draft ->> 'source_version',
    p_draft ->> 'source_checksum',
    p_draft -> 'source_revision_manifest',
    p_draft ->> 'source_revision_checksum',
    p_draft ->> 'input_checksum',
    p_draft ->> 'artifact_content_type',
    (p_draft ->> 'artifact_byte_length')::bigint,
    p_draft ->> 'artifact_storage_provider',
    p_draft ->> 'artifact_storage_bucket',
    p_draft ->> 'artifact_storage_key',
    nullif(p_draft ->> 'artifact_etag', ''),
    p_draft ->> 'manifest_checksum',
    p_draft ->> 'artifact_checksum',
    p_draft ->> 'caption_checksum'
  )
  on conflict (publication_key) do nothing
  returning id into v_id;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'draftId', v_id, 'outcome', 'inserted');
  end if;
  select * into v_existing
  from public.touchline_social_publication_drafts
  where publication_key = v_publication_key;
  if v_existing.id is null
     or v_existing.manifest_checksum <> p_draft ->> 'manifest_checksum'
     or v_existing.artifact_checksum <> p_draft ->> 'artifact_checksum'
     or v_existing.caption_checksum <> p_draft ->> 'caption_checksum'
     or v_existing.artifact_storage_key <> p_draft ->> 'artifact_storage_key'
     or v_existing.template_version <> p_draft ->> 'template_version'
     or v_existing.source_version <> p_draft ->> 'source_version'
     or v_existing.source_checksum <> p_draft ->> 'source_checksum'
     or v_existing.source_revision_manifest <> p_draft -> 'source_revision_manifest'
     or v_existing.source_revision_checksum <> p_draft ->> 'source_revision_checksum'
     or v_existing.input_checksum <> p_draft ->> 'input_checksum' then
    raise exception 'TL_SOCIAL_DRAFT_CREATE_IDENTITY_CONFLICT';
  end if;
  return jsonb_build_object('ok', true, 'draftId', v_existing.id, 'outcome', 'noop_existing');
end;
$$;

drop function if exists public.touchline_social_record_generation_review(text, text, text, timestamptz, text, text, uuid);
drop function if exists public.touchline_social_claim_generation(text, text, text, timestamptz);
drop function if exists public.touchline_social_claim_generation(text, text, text, timestamptz, text);

create or replace function public.touchline_social_claim_generation(
  p_fixture_provider_id text,
  p_team_provider_id text,
  p_template_version text,
  p_first_observed_at timestamptz,
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
  v_existing public.touchline_social_generation_reviews%rowtype;
  v_id uuid;
  v_lease_token uuid := gen_random_uuid();
  v_lease_expires_at timestamptz := clock_timestamp() + interval '5 minutes';
begin
  if coalesce(p_fixture_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_team_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_template_version, '') !~ '^[A-Za-z0-9._-]{1,160}$'
     or p_first_observed_at is null
     or p_first_observed_at > clock_timestamp() - interval '2 minutes'
     or coalesce(p_input_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or not public.touchline_social_source_revision_is_current(
       p_source_revision_manifest,
       p_source_revision_checksum
     ) then
    raise exception 'TL_SOCIAL_GENERATION_REVIEW_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  if not public.touchline_social_source_revision_is_current(
    p_source_revision_manifest,
    p_source_revision_checksum
  ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || p_fixture_provider_id || ':' || p_team_provider_id
      || ':' || p_template_version, 0
  ));
  select * into v_existing
  from public.touchline_social_generation_reviews
  where fixture_provider_id = p_fixture_provider_id
    and team_provider_id = p_team_provider_id
    and content_type = 'LINEUP'
    and template_version = p_template_version
  for update;
  if v_existing.id is not null
     and v_existing.first_observed_at is distinct from p_first_observed_at then
    raise exception 'TL_SOCIAL_GENERATION_FIRST_OBSERVED_MISMATCH';
  end if;
  if v_existing.id is not null
     and v_existing.review_state = 'GENERATING'
     and v_existing.lease_expires_at > clock_timestamp() then
    return jsonb_build_object(
      'ok', true, 'reviewId', v_existing.id, 'state', 'GENERATING',
      'outcome', 'busy', 'leaseExpiresAt', v_existing.lease_expires_at
    );
  end if;
  if v_existing.id is not null
     and v_existing.review_state = 'GENERATED'
     and v_existing.input_checksum = p_input_checksum
     and v_existing.source_revision_checksum = p_source_revision_checksum then
    return jsonb_build_object(
      'ok', true, 'reviewId', v_existing.id, 'state', 'GENERATED',
      'outcome', 'noop_current', 'draftId', v_existing.generated_draft_id
    );
  end if;
  if v_existing.id is not null
     and v_existing.review_state = 'REVIEW_REQUIRED'
     and v_existing.input_checksum = p_input_checksum
     and v_existing.source_revision_checksum = p_source_revision_checksum
     and v_existing.next_eligible_at > clock_timestamp() then
    return jsonb_build_object(
      'ok', true, 'reviewId', v_existing.id, 'state', 'REVIEW_REQUIRED',
      'outcome', 'cooldown', 'nextEligibleAt', v_existing.next_eligible_at
    );
  end if;
  if v_existing.id is not null
     and v_existing.review_state = 'GENERATED'
     and (
       v_existing.input_checksum is distinct from p_input_checksum
       or v_existing.source_revision_checksum is distinct from p_source_revision_checksum
     )
     and v_existing.generated_draft_id is not null then
    perform set_config('touchline.social_transition', 'invalidate_dispatch', true);
    update public.touchline_social_dispatch_attempts
    set state = 'INVALIDATED',
        error_code = 'OFFICIAL_SOURCE_REVISION_CHANGED',
        failure_stage = 'PRE_DISPATCH',
        completed_at = clock_timestamp()
    where draft_id = v_existing.generated_draft_id
      and state = 'PENDING';
    update public.touchline_social_dispatch_attempts
    set state = 'DELIVERY_UNKNOWN',
        error_code = 'OFFICIAL_SOURCE_CHANGED_DURING_CLAIM',
        failure_stage = null,
        claim_token = null,
        claimed_at = null,
        claim_expires_at = null,
        completed_at = clock_timestamp()
    where draft_id = v_existing.generated_draft_id
      and state = 'IN_FLIGHT';
  end if;
  perform set_config('touchline.social_transition', 'claim_generation', true);
  insert into public.touchline_social_generation_reviews (
    fixture_provider_id, team_provider_id, content_type, template_version,
    review_state, reason_code, first_observed_at, last_checked_at,
    input_checksum, source_revision_manifest, source_revision_checksum,
    attempt_count, next_eligible_at,
    generated_draft_id, lease_token, lease_expires_at
  ) values (
    p_fixture_provider_id, p_team_provider_id, 'LINEUP', p_template_version,
    'GENERATING', 'GENERATION_IN_PROGRESS', p_first_observed_at, clock_timestamp(),
    p_input_checksum, p_source_revision_manifest, p_source_revision_checksum,
    1, null,
    null, v_lease_token, v_lease_expires_at
  )
  on conflict (fixture_provider_id, team_provider_id, content_type, template_version)
  do update set
    review_state = 'GENERATING',
    reason_code = 'GENERATION_IN_PROGRESS',
    generated_draft_id = null,
    input_checksum = excluded.input_checksum,
    source_revision_manifest = excluded.source_revision_manifest,
    source_revision_checksum = excluded.source_revision_checksum,
    attempt_count = case
      when public.touchline_social_generation_reviews.input_checksum = excluded.input_checksum
       and public.touchline_social_generation_reviews.source_revision_checksum = excluded.source_revision_checksum
        then least(public.touchline_social_generation_reviews.attempt_count + 1, 1000)
      else 1
    end,
    next_eligible_at = null,
    lease_token = v_lease_token,
    lease_expires_at = v_lease_expires_at,
    last_checked_at = clock_timestamp()
  returning id into v_id;
  return jsonb_build_object(
    'ok', true, 'reviewId', v_id, 'state', 'GENERATING',
    'outcome', 'claimed', 'leaseToken', v_lease_token,
    'leaseExpiresAt', v_lease_expires_at
  );
end;
$$;

create or replace function public.touchline_social_complete_generation(
  p_fixture_provider_id text,
  p_team_provider_id text,
  p_template_version text,
  p_lease_token uuid,
  p_review_state text,
  p_reason_code text,
  p_generated_draft_id uuid default null,
  p_source_version text default null,
  p_source_checksum text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.touchline_social_generation_reviews%rowtype;
begin
  if coalesce(p_fixture_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_team_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_template_version, '') !~ '^[A-Za-z0-9._-]{1,160}$'
     or p_lease_token is null
     or coalesce(p_review_state, '') not in ('REVIEW_REQUIRED', 'GENERATED')
     or coalesce(p_reason_code, '') !~ '^[A-Z0-9_:-]{1,160}$'
     or (p_review_state = 'REVIEW_REQUIRED' and p_generated_draft_id is not null)
     or (p_review_state = 'REVIEW_REQUIRED' and (p_source_version is not null or p_source_checksum is not null))
     or (p_review_state = 'GENERATED' and (
       p_generated_draft_id is null
       or coalesce(p_source_version, '') !~ '^[A-Za-z0-9._-]{1,160}$'
       or coalesce(p_source_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     )) then
    raise exception 'TL_SOCIAL_GENERATION_COMPLETION_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || p_fixture_provider_id || ':' || p_team_provider_id
      || ':' || p_template_version, 0
  ));
  select * into v_existing
  from public.touchline_social_generation_reviews
  where fixture_provider_id = p_fixture_provider_id
    and team_provider_id = p_team_provider_id
    and content_type = 'LINEUP'
    and template_version = p_template_version
  for update;
  if v_existing.id is null
     or v_existing.review_state <> 'GENERATING'
     or v_existing.lease_token is distinct from p_lease_token
     or v_existing.lease_expires_at <= clock_timestamp() then
    raise exception 'TL_SOCIAL_GENERATION_LEASE_INVALID';
  end if;
  if not public.touchline_social_source_revision_is_current(
    v_existing.source_revision_manifest,
    v_existing.source_revision_checksum
  ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE';
  end if;
  if p_review_state = 'GENERATED' and not exists (
    select 1
    from public.touchline_social_publication_drafts draft
    where draft.id = p_generated_draft_id
      and draft.fixture_provider_id = p_fixture_provider_id
      and draft.team_provider_id = p_team_provider_id
      and draft.content_type = 'LINEUP'
      and draft.placement = 'INSTAGRAM_FEED'
      and draft.locale = 'en-GB'
      and draft.template_version = p_template_version
      and draft.source_version = p_source_version
      and draft.source_checksum = p_source_checksum
      and draft.source_revision_manifest = v_existing.source_revision_manifest
      and draft.source_revision_checksum = v_existing.source_revision_checksum
      and draft.input_checksum = v_existing.input_checksum
  ) then
    raise exception 'TL_SOCIAL_GENERATION_DRAFT_IDENTITY_MISMATCH';
  end if;
  perform set_config('touchline.social_transition', 'complete_generation', true);
  update public.touchline_social_generation_reviews
  set review_state = p_review_state,
      reason_code = p_reason_code,
      generated_draft_id = p_generated_draft_id,
      next_eligible_at = case
        when p_review_state = 'REVIEW_REQUIRED' then clock_timestamp() + pg_catalog.make_interval(
          secs => least(600, 30 * (2 ^ least(v_existing.attempt_count, 5)))::integer
        )
        else null
      end,
      lease_token = null,
      lease_expires_at = null,
      last_checked_at = clock_timestamp()
  where id = v_existing.id;
  return jsonb_build_object(
    'ok', true, 'reviewId', v_existing.id, 'state', p_review_state,
    'outcome', 'completed'
  );
end;
$$;

create or replace function public.touchline_social_renew_generation(
  p_fixture_provider_id text,
  p_team_provider_id text,
  p_template_version text,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.touchline_social_generation_reviews%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(p_fixture_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_team_provider_id, '') !~ '^[1-9][0-9]{0,19}$'
     or coalesce(p_template_version, '') !~ '^[A-Za-z0-9._-]{1,160}$'
     or p_lease_token is null then
    raise exception 'TL_SOCIAL_GENERATION_RENEWAL_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || p_fixture_provider_id || ':' || p_team_provider_id
      || ':' || p_template_version, 0
  ));
  select * into v_existing
  from public.touchline_social_generation_reviews
  where fixture_provider_id = p_fixture_provider_id
    and team_provider_id = p_team_provider_id
    and content_type = 'LINEUP'
    and template_version = p_template_version
  for update;
  if v_existing.id is null
     or v_existing.review_state <> 'GENERATING'
     or v_existing.lease_token is distinct from p_lease_token
     or v_existing.lease_expires_at <= v_now then
    raise exception 'TL_SOCIAL_GENERATION_LEASE_INVALID';
  end if;
  if not public.touchline_social_source_revision_is_current(
    v_existing.source_revision_manifest,
    v_existing.source_revision_checksum
  ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE';
  end if;
  perform set_config('touchline.social_transition', 'claim_generation', true);
  update public.touchline_social_generation_reviews
  set lease_expires_at = v_now + interval '5 minutes',
      last_checked_at = v_now
  where id = v_existing.id;
  return jsonb_build_object(
    'ok', true, 'outcome', 'renewed',
    'leaseExpiresAt', v_now + interval '5 minutes'
  );
end;
$$;

create or replace function public.touchline_social_require_owner_actor(
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authenticated_user_id uuid := auth.uid();
begin
  if p_actor_id is null
     or v_authenticated_user_id is null
     or v_authenticated_user_id is distinct from p_actor_id
     or not exists (
       select 1
       from public.touchline_social_owner_approvers owner_account
       where owner_account.user_id = v_authenticated_user_id
     ) then
    raise exception 'TL_SOCIAL_OWNER_ACTOR_REQUIRED';
  end if;
end;
$$;

create or replace function public.touchline_social_issue_review_intent(
  p_draft_id uuid,
  p_review_kind text,
  p_expected_content_checksum text,
  p_expected_manifest_checksum text,
  p_expected_source_checksum text,
  p_expected_source_revision_checksum text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.touchline_social_publication_drafts%rowtype;
  v_cycle public.touchline_social_generation_cycles%rowtype;
  v_current_generated_draft_id uuid;
  v_feed_snapshot_at timestamptz;
  v_intent_id uuid;
  v_now timestamptz := clock_timestamp();
  v_lookup_fixture_provider_id text;
  v_lookup_team_provider_id text;
  v_lookup_template_version text;
begin
  if p_draft_id is null
     or coalesce(p_review_kind, '') not in ('ARTWORK', 'CAPTION')
     or coalesce(p_expected_content_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_manifest_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_source_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_source_revision_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or p_actor_id is null
     or not exists (
       select 1 from public.touchline_social_owner_approvers approver
       where approver.user_id = p_actor_id
  ) then
    raise exception 'TL_SOCIAL_REVIEW_INTENT_INPUT_INVALID';
  end if;
  select fixture_provider_id, team_provider_id, template_version
  into v_lookup_fixture_provider_id, v_lookup_team_provider_id, v_lookup_template_version
  from public.touchline_social_publication_drafts
  where id = p_draft_id;
  if v_lookup_fixture_provider_id is null
     or v_lookup_team_provider_id is null
     or v_lookup_template_version is null then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || v_lookup_fixture_provider_id || ':'
      || v_lookup_team_provider_id || ':' || v_lookup_template_version,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-draft:' || p_draft_id::text, 0));
  select * into v_draft
  from public.touchline_social_publication_drafts
  where id = p_draft_id
  for update;
  if v_draft.id is null
     or v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version
     or v_draft.content_type <> 'LINEUP'
     or v_draft.approval_state <> 'APPROVAL_REQUIRED'
     or v_draft.manifest_checksum <> p_expected_manifest_checksum
     or v_draft.source_checksum <> p_expected_source_checksum
     or v_draft.source_revision_checksum <> p_expected_source_revision_checksum
     or v_draft.input_checksum <> p_expected_source_checksum
     or not public.touchline_social_source_revision_is_current(
       v_draft.source_revision_manifest,
       v_draft.source_revision_checksum
     )
     or (p_review_kind = 'ARTWORK' and (
       v_draft.artwork_approval_state <> 'APPROVAL_REQUIRED'
       or v_draft.artifact_checksum <> p_expected_content_checksum
     ))
     or (p_review_kind = 'CAPTION' and (
       v_draft.caption_approval_state <> 'APPROVAL_REQUIRED'
       or v_draft.caption_checksum <> p_expected_content_checksum
     )) then
    raise exception 'TL_SOCIAL_REVIEW_INTENT_STALE';
  end if;
  if v_draft.content_type = 'LINEUP' then
    select * into v_cycle
    from public.touchline_social_generation_cycles
    where lease_name = 'lineup-draft-watcher'
    for share;
    if v_cycle.lease_name is null
       or v_cycle.lease_token is not null
       or v_cycle.last_outcome is distinct from 'SUCCESS'
       or v_cycle.consecutive_failures <> 0
       or v_cycle.last_completed_at is null
       or v_cycle.last_completed_at < v_now - interval '2 minutes' then
      raise exception 'TL_SOCIAL_GENERATION_HEALTH_UNSAFE';
    end if;
    select generated_draft_id into v_current_generated_draft_id
    from public.touchline_social_generation_reviews
    where fixture_provider_id = v_draft.fixture_provider_id
      and team_provider_id = v_draft.team_provider_id
      and content_type = v_draft.content_type
      and template_version = v_draft.template_version
      and review_state = 'GENERATED'
    for share;
    if v_current_generated_draft_id is distinct from v_draft.id then
      raise exception 'TL_SOCIAL_GENERATION_NOT_CURRENT';
    end if;
    -- source_snapshot_at is audit provenance only. Polling may advance it
    -- without changing the semantic source checksum or immutable draft.
    v_feed_snapshot_at := v_draft.source_snapshot_at;
  else
    v_feed_snapshot_at := v_draft.source_snapshot_at;
  end if;

  insert into public.touchline_social_review_intents (
    draft_id, review_kind, actor_id,
    expected_content_checksum, expected_manifest_checksum, expected_source_checksum,
    expected_source_revision_checksum,
    source_snapshot_at, generation_completed_at, expires_at
  ) values (
    v_draft.id, p_review_kind, p_actor_id,
    p_expected_content_checksum, p_expected_manifest_checksum, p_expected_source_checksum,
    p_expected_source_revision_checksum,
    v_feed_snapshot_at, coalesce(v_cycle.last_completed_at, v_now), v_now + interval '15 seconds'
  ) returning id into v_intent_id;
  return jsonb_build_object('ok', true, 'intentId', v_intent_id, 'expiresAt', v_now + interval '15 seconds');
end;
$$;

create or replace function public.touchline_social_approve_artwork(
  p_intent_id uuid,
  p_draft_id uuid,
  p_expected_artifact_checksum text,
  p_expected_manifest_checksum text,
  p_expected_source_checksum text,
  p_expected_source_revision_checksum text,
  p_approved_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.touchline_social_publication_drafts%rowtype;
  v_intent public.touchline_social_review_intents%rowtype;
  v_cycle public.touchline_social_generation_cycles%rowtype;
  v_current_generated_draft_id uuid;
  v_feed_snapshot_at timestamptz;
  v_lookup_content_type text;
  v_lookup_fixture_provider_id text;
  v_lookup_team_provider_id text;
  v_lookup_template_version text;
begin
  perform public.touchline_social_require_owner_actor(p_approved_by);
  if p_intent_id is null or p_draft_id is null or p_approved_by is null
     or coalesce(p_expected_artifact_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_manifest_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_source_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_source_revision_checksum, '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'TL_SOCIAL_ARTWORK_APPROVAL_INPUT_INVALID';
  end if;
  select content_type, fixture_provider_id, team_provider_id, template_version
  into v_lookup_content_type, v_lookup_fixture_provider_id,
       v_lookup_team_provider_id, v_lookup_template_version
  from public.touchline_social_publication_drafts
  where id = p_draft_id;
  if v_lookup_content_type is null or v_lookup_fixture_provider_id is null
     or v_lookup_template_version is null then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  if v_lookup_content_type <> 'LINEUP' then raise exception 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED'; end if;
  if v_lookup_team_provider_id is null then raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || v_lookup_fixture_provider_id || ':'
      || v_lookup_team_provider_id || ':' || v_lookup_template_version,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-draft:' || p_draft_id::text, 0));
  select * into v_intent
  from public.touchline_social_review_intents
  where id = p_intent_id
  for update;
  if v_intent.id is null
     or v_intent.consumed_at is not null
     or v_intent.expires_at <= clock_timestamp()
     or v_intent.draft_id <> p_draft_id
     or v_intent.review_kind <> 'ARTWORK'
     or v_intent.actor_id <> p_approved_by
     or v_intent.expected_content_checksum <> p_expected_artifact_checksum
     or v_intent.expected_manifest_checksum <> p_expected_manifest_checksum
     or v_intent.expected_source_checksum <> p_expected_source_checksum
     or v_intent.expected_source_revision_checksum <> p_expected_source_revision_checksum then
    raise exception 'TL_SOCIAL_REVIEW_INTENT_INVALID';
  end if;
  select * into v_draft
  from public.touchline_social_publication_drafts
  where id = p_draft_id
  for update;
  if v_draft.id is null
     or v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version
     or v_draft.content_type is distinct from v_lookup_content_type then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  if v_draft.content_type <> 'LINEUP' then raise exception 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED'; end if;
  if v_draft.approval_state <> 'APPROVAL_REQUIRED' then raise exception 'TL_SOCIAL_DRAFT_NOT_APPROVABLE'; end if;
  if v_draft.artwork_approval_state <> 'APPROVAL_REQUIRED' then raise exception 'TL_SOCIAL_ARTWORK_ALREADY_APPROVED'; end if;
  if v_draft.artifact_checksum <> p_expected_artifact_checksum then raise exception 'TL_SOCIAL_STALE_ARTIFACT'; end if;
  if v_draft.manifest_checksum <> p_expected_manifest_checksum then raise exception 'TL_SOCIAL_STALE_MANIFEST'; end if;
  if v_draft.source_checksum <> p_expected_source_checksum
     or v_draft.source_revision_checksum <> p_expected_source_revision_checksum
     or not public.touchline_social_source_revision_is_current(
       v_draft.source_revision_manifest,
       v_draft.source_revision_checksum
     )
     or v_draft.input_checksum <> p_expected_source_checksum then
    raise exception 'TL_SOCIAL_STALE_SOURCE';
  end if;
  if v_draft.content_type = 'LINEUP' then
    select * into v_cycle
    from public.touchline_social_generation_cycles
    where lease_name = 'lineup-draft-watcher'
    for share;
    if v_cycle.lease_name is null
       or v_cycle.lease_token is not null
       or v_cycle.last_outcome is distinct from 'SUCCESS'
       or v_cycle.consecutive_failures <> 0
       or v_cycle.last_completed_at is distinct from v_intent.generation_completed_at
       or v_cycle.last_completed_at < clock_timestamp() - interval '2 minutes' then
      raise exception 'TL_SOCIAL_GENERATION_HEALTH_UNSAFE';
    end if;
    select generated_draft_id into v_current_generated_draft_id
    from public.touchline_social_generation_reviews
    where fixture_provider_id = v_draft.fixture_provider_id
      and team_provider_id = v_draft.team_provider_id
      and content_type = v_draft.content_type
      and template_version = v_draft.template_version
      and review_state = 'GENERATED'
    for share;
    if v_current_generated_draft_id is distinct from v_draft.id then
      raise exception 'TL_SOCIAL_GENERATION_NOT_CURRENT';
    end if;
    if v_intent.source_snapshot_at is distinct from v_draft.source_snapshot_at then
      raise exception 'TL_SOCIAL_OFFICIAL_SOURCE_REVISION_STALE';
    end if;
  end if;

  perform set_config('touchline.social_transition', 'approve_artwork', true);
  update public.touchline_social_publication_drafts
  set artwork_approval_state = 'APPROVED',
      approved_artifact_checksum = artifact_checksum,
      artwork_approved_manifest_checksum = manifest_checksum,
      artwork_approved_at = clock_timestamp(),
      artwork_approved_by = p_approved_by,
      approval_state = case when caption_approval_state = 'APPROVED' then 'APPROVED' else 'APPROVAL_REQUIRED' end,
      approved_manifest_checksum = case when caption_approval_state = 'APPROVED' then manifest_checksum else null end
  where id = p_draft_id;
  update public.touchline_social_review_intents
  set consumed_at = clock_timestamp()
  where id = v_intent.id;
  return jsonb_build_object(
    'ok', true,
    'draftId', p_draft_id,
    'revision', v_draft.revision,
    'review', 'ARTWORK',
    'approvedArtifactChecksum', p_expected_artifact_checksum,
    'approvedManifestChecksum', p_expected_manifest_checksum
  );
end;
$$;

create or replace function public.touchline_social_approve_caption(
  p_intent_id uuid,
  p_draft_id uuid,
  p_expected_caption_checksum text,
  p_expected_manifest_checksum text,
  p_expected_source_checksum text,
  p_expected_source_revision_checksum text,
  p_approved_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.touchline_social_publication_drafts%rowtype;
  v_intent public.touchline_social_review_intents%rowtype;
  v_cycle public.touchline_social_generation_cycles%rowtype;
  v_current_generated_draft_id uuid;
  v_feed_snapshot_at timestamptz;
  v_lookup_content_type text;
  v_lookup_fixture_provider_id text;
  v_lookup_team_provider_id text;
  v_lookup_template_version text;
begin
  perform public.touchline_social_require_owner_actor(p_approved_by);
  if p_intent_id is null or p_draft_id is null or p_approved_by is null
     or coalesce(p_expected_caption_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_manifest_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_source_checksum, '') !~ '^sha256:[0-9a-f]{64}$'
     or coalesce(p_expected_source_revision_checksum, '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'TL_SOCIAL_CAPTION_APPROVAL_INPUT_INVALID';
  end if;
  select content_type, fixture_provider_id, team_provider_id, template_version
  into v_lookup_content_type, v_lookup_fixture_provider_id,
       v_lookup_team_provider_id, v_lookup_template_version
  from public.touchline_social_publication_drafts
  where id = p_draft_id;
  if v_lookup_content_type is null or v_lookup_fixture_provider_id is null
     or v_lookup_template_version is null then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  if v_lookup_content_type <> 'LINEUP' then raise exception 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED'; end if;
  if v_lookup_team_provider_id is null then raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || v_lookup_fixture_provider_id || ':'
      || v_lookup_team_provider_id || ':' || v_lookup_template_version,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-draft:' || p_draft_id::text, 0));
  select * into v_intent
  from public.touchline_social_review_intents
  where id = p_intent_id
  for update;
  if v_intent.id is null
     or v_intent.consumed_at is not null
     or v_intent.expires_at <= clock_timestamp()
     or v_intent.draft_id <> p_draft_id
     or v_intent.review_kind <> 'CAPTION'
     or v_intent.actor_id <> p_approved_by
     or v_intent.expected_content_checksum <> p_expected_caption_checksum
     or v_intent.expected_manifest_checksum <> p_expected_manifest_checksum
     or v_intent.expected_source_checksum <> p_expected_source_checksum
     or v_intent.expected_source_revision_checksum <> p_expected_source_revision_checksum then
    raise exception 'TL_SOCIAL_REVIEW_INTENT_INVALID';
  end if;
  select * into v_draft
  from public.touchline_social_publication_drafts
  where id = p_draft_id
  for update;
  if v_draft.id is null
     or v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version
     or v_draft.content_type is distinct from v_lookup_content_type then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  if v_draft.content_type <> 'LINEUP' then raise exception 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED'; end if;
  if v_draft.approval_state <> 'APPROVAL_REQUIRED' then raise exception 'TL_SOCIAL_DRAFT_NOT_APPROVABLE'; end if;
  if v_draft.caption_approval_state <> 'APPROVAL_REQUIRED' then raise exception 'TL_SOCIAL_CAPTION_ALREADY_APPROVED'; end if;
  if v_draft.caption_checksum <> p_expected_caption_checksum then raise exception 'TL_SOCIAL_STALE_CAPTION'; end if;
  if v_draft.manifest_checksum <> p_expected_manifest_checksum then raise exception 'TL_SOCIAL_STALE_MANIFEST'; end if;
  if v_draft.source_checksum <> p_expected_source_checksum
     or v_draft.source_revision_checksum <> p_expected_source_revision_checksum
     or not public.touchline_social_source_revision_is_current(
       v_draft.source_revision_manifest,
       v_draft.source_revision_checksum
     )
     or v_draft.input_checksum <> p_expected_source_checksum then
    raise exception 'TL_SOCIAL_STALE_SOURCE';
  end if;
  if v_draft.content_type = 'LINEUP' then
    select * into v_cycle
    from public.touchline_social_generation_cycles
    where lease_name = 'lineup-draft-watcher'
    for share;
    if v_cycle.lease_name is null
       or v_cycle.lease_token is not null
       or v_cycle.last_outcome is distinct from 'SUCCESS'
       or v_cycle.consecutive_failures <> 0
       or v_cycle.last_completed_at is distinct from v_intent.generation_completed_at
       or v_cycle.last_completed_at < clock_timestamp() - interval '2 minutes' then
      raise exception 'TL_SOCIAL_GENERATION_HEALTH_UNSAFE';
    end if;
    select generated_draft_id into v_current_generated_draft_id
    from public.touchline_social_generation_reviews
    where fixture_provider_id = v_draft.fixture_provider_id
      and team_provider_id = v_draft.team_provider_id
      and content_type = v_draft.content_type
      and template_version = v_draft.template_version
      and review_state = 'GENERATED'
    for share;
    if v_current_generated_draft_id is distinct from v_draft.id then
      raise exception 'TL_SOCIAL_GENERATION_NOT_CURRENT';
    end if;
    if v_intent.source_snapshot_at is distinct from v_draft.source_snapshot_at then
      raise exception 'TL_SOCIAL_OFFICIAL_SOURCE_REVISION_STALE';
    end if;
  end if;

  perform set_config('touchline.social_transition', 'approve_caption', true);
  update public.touchline_social_publication_drafts
  set caption_approval_state = 'APPROVED',
      approved_caption_checksum = caption_checksum,
      caption_approved_manifest_checksum = manifest_checksum,
      caption_approved_at = clock_timestamp(),
      caption_approved_by = p_approved_by,
      approval_state = case when artwork_approval_state = 'APPROVED' then 'APPROVED' else 'APPROVAL_REQUIRED' end,
      approved_manifest_checksum = case when artwork_approval_state = 'APPROVED' then manifest_checksum else null end
  where id = p_draft_id;
  update public.touchline_social_review_intents
  set consumed_at = clock_timestamp()
  where id = v_intent.id;
  return jsonb_build_object(
    'ok', true,
    'draftId', p_draft_id,
    'revision', v_draft.revision,
    'review', 'CAPTION',
    'approvedCaptionChecksum', p_expected_caption_checksum,
    'approvedManifestChecksum', p_expected_manifest_checksum
  );
end;
$$;

create or replace function public.touchline_social_cancel_draft(
  p_draft_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.touchline_social_publication_drafts%rowtype;
  v_lookup_content_type text;
  v_lookup_fixture_provider_id text;
  v_lookup_team_provider_id text;
  v_lookup_template_version text;
begin
  perform public.touchline_social_require_owner_actor(p_actor_id);
  if p_draft_id is null or p_actor_id is null then raise exception 'TL_SOCIAL_CANCEL_INPUT_INVALID'; end if;
  select content_type, fixture_provider_id, team_provider_id, template_version
  into v_lookup_content_type, v_lookup_fixture_provider_id,
       v_lookup_team_provider_id, v_lookup_template_version
  from public.touchline_social_publication_drafts
  where id = p_draft_id;
  if v_lookup_content_type is null
     or v_lookup_fixture_provider_id is null
     or v_lookup_template_version is null
     or (v_lookup_content_type = 'LINEUP' and v_lookup_team_provider_id is null) then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  if v_lookup_content_type = 'LINEUP' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'touchline-social-generation:' || v_lookup_fixture_provider_id || ':'
        || v_lookup_team_provider_id || ':' || v_lookup_template_version,
      0
    ));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-draft:' || p_draft_id::text, 0));
  select * into v_draft
  from public.touchline_social_publication_drafts
  where id = p_draft_id
  for update;
  if v_draft.id is null
     or v_draft.content_type is distinct from v_lookup_content_type
     or v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  if v_draft.approval_state <> 'APPROVAL_REQUIRED' then raise exception 'TL_SOCIAL_DRAFT_NOT_CANCELLABLE'; end if;
  perform set_config('touchline.social_transition', 'cancel', true);
  update public.touchline_social_publication_drafts
  set approval_state = 'CANCELLED',
      cancelled_at = clock_timestamp(),
      cancelled_by = p_actor_id
  where id = p_draft_id;
  return jsonb_build_object('ok', true, 'draftId', p_draft_id, 'state', 'CANCELLED');
end;
$$;

-- A pre-audit candidate briefly exposed a three-argument overload. Drop that
-- obsolete identity explicitly so an earlier shadow attempt cannot leave a
-- callable dispatch path beside the canonical two-argument function.
drop function if exists public.touchline_social_enqueue_dispatch(uuid, text, text);

create or replace function public.touchline_social_enqueue_dispatch(
  p_draft_id uuid,
  p_connection_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.touchline_social_publication_drafts%rowtype;
  v_latest public.touchline_social_dispatch_attempts%rowtype;
  v_cycle public.touchline_social_generation_cycles%rowtype;
  v_current_generated_draft_id uuid;
  v_attempt_id uuid;
  v_attempt_generation integer := 1;
  v_idempotency_key text;
  v_lookup_content_type text;
  v_lookup_fixture_provider_id text;
  v_lookup_team_provider_id text;
  v_lookup_template_version text;
begin
  perform public.touchline_social_require_owner_actor(auth.uid());
  if p_draft_id is null
     or p_connection_id is distinct from 'TOUCHLINE_OFFICIAL_INSTAGRAM' then
    raise exception 'TL_SOCIAL_DISPATCH_INPUT_INVALID';
  end if;
  select content_type, fixture_provider_id, team_provider_id, template_version
  into v_lookup_content_type, v_lookup_fixture_provider_id,
       v_lookup_team_provider_id, v_lookup_template_version
  from public.touchline_social_publication_drafts
  where id = p_draft_id;
  if v_lookup_content_type is null or v_lookup_fixture_provider_id is null
     or v_lookup_template_version is null then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  if v_lookup_content_type <> 'LINEUP' then raise exception 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED'; end if;
  if v_lookup_team_provider_id is null then raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || v_lookup_fixture_provider_id || ':'
      || v_lookup_team_provider_id || ':' || v_lookup_template_version,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-draft:' || p_draft_id::text, 0));
  select * into v_draft
  from public.touchline_social_publication_drafts
  where id = p_draft_id
  for update;
  if v_draft.id is null
     or v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version
     or v_draft.content_type is distinct from v_lookup_content_type then
    raise exception 'TL_SOCIAL_DRAFT_NOT_FOUND';
  end if;
  if v_draft.content_type <> 'LINEUP' then raise exception 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED'; end if;
  if v_draft.source_checksum <> v_draft.input_checksum then
    raise exception 'TL_SOCIAL_STALE_SOURCE';
  end if;
  if not public.touchline_social_source_revision_is_current(
    v_draft.source_revision_manifest,
    v_draft.source_revision_checksum
  ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE';
  end if;
  if v_draft.content_type = 'LINEUP' then
    select generated_draft_id into v_current_generated_draft_id
    from public.touchline_social_generation_reviews
    where fixture_provider_id = v_draft.fixture_provider_id
      and team_provider_id = v_draft.team_provider_id
      and content_type = v_draft.content_type
      and template_version = v_draft.template_version
      and review_state = 'GENERATED'
    for share;
    if v_current_generated_draft_id is distinct from v_draft.id then
      raise exception 'TL_SOCIAL_GENERATION_NOT_CURRENT';
    end if;
    select * into v_cycle
    from public.touchline_social_generation_cycles
    where lease_name = 'lineup-draft-watcher'
    for share;
    if v_cycle.lease_name is null
       or v_cycle.lease_token is not null
       or v_cycle.last_outcome is distinct from 'SUCCESS'
       or v_cycle.consecutive_failures <> 0
       or v_cycle.last_completed_at is null
       or v_cycle.last_completed_at < clock_timestamp() - interval '2 minutes' then
      raise exception 'TL_SOCIAL_GENERATION_HEALTH_UNSAFE';
    end if;
  end if;
  if v_draft.approval_state <> 'APPROVED'
     or v_draft.artwork_approval_state <> 'APPROVED'
     or v_draft.caption_approval_state <> 'APPROVED'
     or v_draft.approved_artifact_checksum is null
     or v_draft.approved_artifact_checksum <> v_draft.artifact_checksum
     or v_draft.approved_caption_checksum is null
     or v_draft.approved_caption_checksum <> v_draft.caption_checksum
     or v_draft.artwork_approved_manifest_checksum <> v_draft.manifest_checksum
     or v_draft.caption_approved_manifest_checksum <> v_draft.manifest_checksum
     or v_draft.approved_manifest_checksum is null
     or v_draft.approved_manifest_checksum <> v_draft.manifest_checksum then
    raise exception 'TL_SOCIAL_DISPATCH_APPROVAL_MISMATCH';
  end if;
  v_idempotency_key := 'sha256:' || pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        v_draft.publication_key || ':' || v_draft.approved_manifest_checksum || ':'
          || v_draft.approved_artifact_checksum || ':'
          || v_draft.approved_caption_checksum || ':'
          || v_draft.artifact_storage_bucket || ':' || v_draft.artifact_storage_key || ':'
          || 'TOUCHLINE_OFFICIAL_INSTAGRAM',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into v_latest
  from public.touchline_social_dispatch_attempts attempt
  where attempt.draft_id = v_draft.id
    and attempt.draft_revision = v_draft.revision
  order by attempt.attempt_generation desc
  limit 1
  for update;

  if v_latest.id is not null then
    if v_latest.idempotency_key <> v_idempotency_key
       or v_latest.connection_id <> 'TOUCHLINE_OFFICIAL_INSTAGRAM'
       or v_latest.approved_artifact_checksum <> v_draft.approved_artifact_checksum
       or v_latest.approved_caption_checksum <> v_draft.approved_caption_checksum
       or v_latest.approved_manifest_checksum <> v_draft.approved_manifest_checksum
       or row(
         v_latest.artifact_content_type, v_latest.artifact_byte_length,
         v_latest.artifact_storage_provider, v_latest.artifact_storage_bucket,
         v_latest.artifact_storage_key, v_latest.artifact_etag
       ) is distinct from row(
         v_draft.artifact_content_type, v_draft.artifact_byte_length,
         v_draft.artifact_storage_provider, v_draft.artifact_storage_bucket,
         v_draft.artifact_storage_key, v_draft.artifact_etag
       ) then
      raise exception 'TL_SOCIAL_DISPATCH_IDENTITY_MISMATCH';
    end if;
    if v_latest.state = 'PENDING' then
      return jsonb_build_object(
        'ok', true,
        'attemptId', v_latest.id,
        'draftId', v_draft.id,
        'revision', v_draft.revision,
        'attemptGeneration', v_latest.attempt_generation,
        'idempotencyKey', v_idempotency_key,
        'outcome', 'already_pending'
      );
    end if;
    if v_latest.state = 'SENT' then raise exception 'TL_SOCIAL_ALREADY_SENT'; end if;
    if v_latest.state = 'IN_FLIGHT' then
      raise exception 'TL_SOCIAL_DISPATCH_IN_FLIGHT';
    end if;
    if v_latest.state = 'DELIVERY_UNKNOWN' then
      raise exception 'TL_SOCIAL_DELIVERY_RECONCILIATION_REQUIRED';
    end if;
    if v_latest.state = 'INVALIDATED' then
      raise exception 'TL_SOCIAL_DISPATCH_INVALIDATED';
    end if;
    if v_latest.state <> 'FAILED' or v_latest.failure_stage <> 'PRE_DISPATCH' then
      raise exception 'TL_SOCIAL_RETRY_NOT_SAFE';
    end if;
    if v_latest.attempt_generation >= 3 then raise exception 'TL_SOCIAL_RETRY_EXHAUSTED'; end if;
    v_attempt_generation := v_latest.attempt_generation + 1;
  end if;

  perform set_config('touchline.social_transition', 'enqueue', true);
  insert into public.touchline_social_dispatch_attempts (
    draft_id, draft_revision, approved_artifact_checksum, approved_caption_checksum,
    approved_manifest_checksum,
    artifact_content_type, artifact_byte_length,
    artifact_storage_provider, artifact_storage_bucket, artifact_storage_key,
    artifact_etag,
    attempt_generation, idempotency_key, state, connection_id
  ) values (
    v_draft.id, v_draft.revision, v_draft.approved_artifact_checksum,
    v_draft.approved_caption_checksum,
    v_draft.approved_manifest_checksum,
    v_draft.artifact_content_type, v_draft.artifact_byte_length,
    v_draft.artifact_storage_provider, v_draft.artifact_storage_bucket,
    v_draft.artifact_storage_key, v_draft.artifact_etag,
    v_attempt_generation, v_idempotency_key, 'PENDING', 'TOUCHLINE_OFFICIAL_INSTAGRAM'
  )
  on conflict (draft_id, draft_revision, attempt_generation) do nothing
  returning id into v_attempt_id;
  if v_attempt_id is null then
    select id into v_attempt_id
    from public.touchline_social_dispatch_attempts
    where draft_id = v_draft.id
      and draft_revision = v_draft.revision
      and attempt_generation = v_attempt_generation;
  end if;
  return jsonb_build_object(
    'ok', true,
    'attemptId', v_attempt_id,
    'draftId', v_draft.id,
    'revision', v_draft.revision,
    'attemptGeneration', v_attempt_generation,
    'idempotencyKey', v_idempotency_key,
    'outcome', 'created'
  );
end;
$$;

create or replace function public.touchline_social_claim_dispatch(
  p_attempt_id uuid,
  p_expected_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.touchline_social_dispatch_attempts%rowtype;
  v_draft public.touchline_social_publication_drafts%rowtype;
  v_cycle public.touchline_social_generation_cycles%rowtype;
  v_current_generated_draft_id uuid;
  v_lookup_draft_id uuid;
  v_lookup_fixture_provider_id text;
  v_lookup_team_provider_id text;
  v_lookup_template_version text;
  v_claim_token uuid := gen_random_uuid();
  v_claimed_at timestamptz := clock_timestamp();
  v_claim_expires_at timestamptz := clock_timestamp() + interval '2 minutes';
begin
  if p_attempt_id is null
     or coalesce(p_expected_idempotency_key, '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'TL_SOCIAL_DISPATCH_CLAIM_INPUT_INVALID';
  end if;
  select attempt.draft_id, draft.fixture_provider_id, draft.team_provider_id, draft.template_version
  into v_lookup_draft_id, v_lookup_fixture_provider_id, v_lookup_team_provider_id, v_lookup_template_version
  from public.touchline_social_dispatch_attempts attempt
  join public.touchline_social_publication_drafts draft on draft.id = attempt.draft_id
  where attempt.id = p_attempt_id;
  if v_lookup_draft_id is null
     or v_lookup_fixture_provider_id is null
     or v_lookup_team_provider_id is null
     or v_lookup_template_version is null then
    raise exception 'TL_SOCIAL_DISPATCH_NOT_FOUND';
  end if;
  -- Global dispatch order is generation -> draft -> attempt. Enqueue uses the
  -- compatible draft -> attempt suffix. The shared semantic-source fence is
  -- always first. This prevents both source/claim and
  -- enqueue/claim inverse-order deadlocks.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || v_lookup_fixture_provider_id || ':'
      || v_lookup_team_provider_id || ':' || v_lookup_template_version,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-draft:' || v_lookup_draft_id::text,
    0
  ));
  select * into v_draft
  from public.touchline_social_publication_drafts
  where id = v_lookup_draft_id
  for share;
  if v_draft.id is null
     or v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version then
    raise exception 'TL_SOCIAL_DISPATCH_APPROVAL_MISMATCH';
  end if;
  if not public.touchline_social_source_revision_is_current(
    v_draft.source_revision_manifest,
    v_draft.source_revision_checksum
  ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('touchline-social-dispatch:' || p_attempt_id::text, 0)
  );
  select * into v_attempt
  from public.touchline_social_dispatch_attempts
  where id = p_attempt_id
  for update;
  if v_attempt.id is null then raise exception 'TL_SOCIAL_DISPATCH_NOT_FOUND'; end if;
  if v_attempt.draft_id is distinct from v_lookup_draft_id then
    raise exception 'TL_SOCIAL_DISPATCH_IDENTITY_MISMATCH';
  end if;
  if v_attempt.state <> 'PENDING' then raise exception 'TL_SOCIAL_DISPATCH_NOT_PENDING'; end if;
  if v_attempt.idempotency_key <> p_expected_idempotency_key then
    raise exception 'TL_SOCIAL_DISPATCH_IDENTITY_MISMATCH';
  end if;
  if v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version
     or v_draft.revision <> v_attempt.draft_revision
     or v_draft.approval_state <> 'APPROVED'
     or v_draft.approved_manifest_checksum <> v_attempt.approved_manifest_checksum
     or v_draft.approved_artifact_checksum <> v_attempt.approved_artifact_checksum
     or v_draft.approved_caption_checksum <> v_attempt.approved_caption_checksum then
    raise exception 'TL_SOCIAL_DISPATCH_APPROVAL_MISMATCH';
  end if;
  if v_draft.content_type <> 'LINEUP' then raise exception 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED'; end if;
  if v_draft.content_type = 'LINEUP' then
    select * into v_cycle
    from public.touchline_social_generation_cycles
    where lease_name = 'lineup-draft-watcher'
    for share;
    if v_cycle.lease_name is null
       or v_cycle.lease_token is not null
       or v_cycle.last_outcome is distinct from 'SUCCESS'
       or v_cycle.consecutive_failures <> 0
       or v_cycle.last_completed_at is null
       or v_cycle.last_completed_at < clock_timestamp() - interval '2 minutes' then
      raise exception 'TL_SOCIAL_GENERATION_HEALTH_UNSAFE';
    end if;
    select generated_draft_id into v_current_generated_draft_id
    from public.touchline_social_generation_reviews
    where fixture_provider_id = v_draft.fixture_provider_id
      and team_provider_id = v_draft.team_provider_id
      and content_type = v_draft.content_type
      and template_version = v_draft.template_version
      and review_state = 'GENERATED'
    for share;
    if v_current_generated_draft_id is distinct from v_draft.id then
      raise exception 'TL_SOCIAL_GENERATION_NOT_CURRENT';
    end if;
  end if;
  perform set_config('touchline.social_transition', 'claim_dispatch', true);
  update public.touchline_social_dispatch_attempts
  set state = 'IN_FLIGHT',
      claim_token = v_claim_token,
      claimed_at = v_claimed_at,
      claim_expires_at = v_claim_expires_at
  where id = v_attempt.id;
  return jsonb_build_object(
    'ok', true,
    'attemptId', v_attempt.id,
    'draftId', v_attempt.draft_id,
    'revision', v_attempt.draft_revision,
    'idempotencyKey', v_attempt.idempotency_key,
    'claimToken', v_claim_token,
    'claimExpiresAt', v_claim_expires_at,
    'artifactStorageProvider', v_attempt.artifact_storage_provider,
    'artifactStorageBucket', v_attempt.artifact_storage_bucket,
    'artifactStorageKey', v_attempt.artifact_storage_key,
    'artifactEtag', v_attempt.artifact_etag,
    'artifactContentType', v_attempt.artifact_content_type,
    'artifactByteLength', v_attempt.artifact_byte_length,
    'artifactChecksum', v_attempt.approved_artifact_checksum,
    'manifestChecksum', v_attempt.approved_manifest_checksum,
    'outcome', 'claimed'
  );
end;
$$;

create or replace function public.touchline_social_complete_dispatch(
  p_attempt_id uuid,
  p_expected_idempotency_key text,
  p_claim_token uuid,
  p_result_state text,
  p_external_publication_id text default null,
  p_error_code text default null,
  p_failure_stage text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.touchline_social_dispatch_attempts%rowtype;
  v_draft public.touchline_social_publication_drafts%rowtype;
  v_current_generated_draft_id uuid;
  v_lookup_draft_id uuid;
  v_lookup_fixture_provider_id text;
  v_lookup_team_provider_id text;
  v_lookup_template_version text;
begin
  if p_attempt_id is null
     or coalesce(p_expected_idempotency_key, '') !~ '^sha256:[0-9a-f]{64}$'
     or p_claim_token is null
     or p_result_state is null
     or p_result_state not in ('SENT', 'FAILED', 'DELIVERY_UNKNOWN') then
    raise exception 'TL_SOCIAL_DISPATCH_COMPLETION_INPUT_INVALID';
  end if;
  if p_result_state = 'SENT' and length(btrim(coalesce(p_external_publication_id, ''))) = 0 then
    raise exception 'TL_SOCIAL_DISPATCH_EXTERNAL_ID_REQUIRED';
  end if;
  if p_result_state = 'FAILED' and length(btrim(coalesce(p_error_code, ''))) = 0 then
    raise exception 'TL_SOCIAL_DISPATCH_ERROR_REQUIRED';
  end if;
  if p_result_state = 'FAILED' and p_failure_stage is distinct from 'PRE_DISPATCH' then
    raise exception 'TL_SOCIAL_FAILED_MUST_BE_PRE_DISPATCH';
  end if;
  if p_result_state = 'DELIVERY_UNKNOWN'
     and length(btrim(coalesce(p_error_code, ''))) = 0 then
    raise exception 'TL_SOCIAL_DELIVERY_UNKNOWN_ERROR_REQUIRED';
  end if;
  if p_result_state <> 'FAILED' and p_failure_stage is not null then
    raise exception 'TL_SOCIAL_FAILURE_STAGE_INVALID';
  end if;

  select attempt.draft_id, draft.fixture_provider_id, draft.team_provider_id, draft.template_version
  into v_lookup_draft_id, v_lookup_fixture_provider_id, v_lookup_team_provider_id, v_lookup_template_version
  from public.touchline_social_dispatch_attempts attempt
  join public.touchline_social_publication_drafts draft on draft.id = attempt.draft_id
  where attempt.id = p_attempt_id;
  if v_lookup_draft_id is null
     or v_lookup_fixture_provider_id is null
     or v_lookup_team_provider_id is null
     or v_lookup_template_version is null then
    raise exception 'TL_SOCIAL_DISPATCH_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'touchline-social-source-revision', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-generation:' || v_lookup_fixture_provider_id || ':'
      || v_lookup_team_provider_id || ':' || v_lookup_template_version,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'touchline-social-draft:' || v_lookup_draft_id::text,
    0
  ));
  select * into v_draft
  from public.touchline_social_publication_drafts
  where id = v_lookup_draft_id
  for share;
  if v_draft.id is null
     or v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version then
    raise exception 'TL_SOCIAL_DISPATCH_APPROVAL_MISMATCH';
  end if;
  if not public.touchline_social_source_revision_is_current(
    v_draft.source_revision_manifest,
    v_draft.source_revision_checksum
  ) then
    raise exception 'TL_SOCIAL_SOURCE_REVISION_STALE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('touchline-social-dispatch:' || p_attempt_id::text, 0)
  );
  select * into v_attempt
  from public.touchline_social_dispatch_attempts
  where id = p_attempt_id
  for update;
  if v_attempt.id is null then raise exception 'TL_SOCIAL_DISPATCH_NOT_FOUND'; end if;
  if v_attempt.draft_id is distinct from v_lookup_draft_id then
    raise exception 'TL_SOCIAL_DISPATCH_IDENTITY_MISMATCH';
  end if;
  if v_attempt.state <> 'IN_FLIGHT' then raise exception 'TL_SOCIAL_DISPATCH_NOT_IN_FLIGHT'; end if;
  if v_attempt.idempotency_key <> p_expected_idempotency_key then
    raise exception 'TL_SOCIAL_DISPATCH_IDENTITY_MISMATCH';
  end if;
  if v_attempt.claim_token is distinct from p_claim_token
     or v_attempt.claim_expires_at is null
     or v_attempt.claim_expires_at <= clock_timestamp() then
    raise exception 'TL_SOCIAL_DISPATCH_CLAIM_EXPIRED';
  end if;
  if v_draft.fixture_provider_id is distinct from v_lookup_fixture_provider_id
     or v_draft.team_provider_id is distinct from v_lookup_team_provider_id
     or v_draft.template_version is distinct from v_lookup_template_version
     or v_draft.revision <> v_attempt.draft_revision
     or v_draft.approval_state <> 'APPROVED'
     or v_draft.approved_manifest_checksum <> v_attempt.approved_manifest_checksum
     or v_draft.approved_artifact_checksum <> v_attempt.approved_artifact_checksum
     or v_draft.approved_caption_checksum <> v_attempt.approved_caption_checksum then
    raise exception 'TL_SOCIAL_DISPATCH_APPROVAL_MISMATCH';
  end if;
  if v_draft.content_type <> 'LINEUP' then raise exception 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED'; end if;
  if v_draft.content_type = 'LINEUP' then
    select generated_draft_id into v_current_generated_draft_id
    from public.touchline_social_generation_reviews
    where fixture_provider_id = v_draft.fixture_provider_id
      and team_provider_id = v_draft.team_provider_id
      and content_type = v_draft.content_type
      and template_version = v_draft.template_version
      and review_state = 'GENERATED'
    for share;
    if v_current_generated_draft_id is distinct from v_draft.id then
      raise exception 'TL_SOCIAL_GENERATION_NOT_CURRENT';
    end if;
  end if;

  perform set_config('touchline.social_transition', 'complete', true);
  update public.touchline_social_dispatch_attempts
  set state = p_result_state,
      external_publication_id = case
        when p_result_state = 'SENT' then btrim(p_external_publication_id)
        else null
      end,
      error_code = case
        when p_result_state in ('FAILED', 'DELIVERY_UNKNOWN') then btrim(p_error_code)
        else null
      end,
      failure_stage = case
        when p_result_state = 'FAILED' then p_failure_stage
        else null
      end,
      claim_token = null,
      claimed_at = null,
      claim_expires_at = null,
      completed_at = clock_timestamp()
  where id = p_attempt_id;

  return jsonb_build_object(
    'ok', true,
    'attemptId', p_attempt_id,
    'state', p_result_state
  );
end;
$$;

create or replace function public.touchline_social_recover_expired_dispatch(
  p_attempt_id uuid,
  p_expected_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.touchline_social_dispatch_attempts%rowtype;
begin
  if p_attempt_id is null
     or coalesce(p_expected_idempotency_key, '') !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'TL_SOCIAL_DISPATCH_RECOVERY_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('touchline-social-dispatch:' || p_attempt_id::text, 0)
  );
  select * into v_attempt
  from public.touchline_social_dispatch_attempts
  where id = p_attempt_id
  for update;
  if v_attempt.id is null then raise exception 'TL_SOCIAL_DISPATCH_NOT_FOUND'; end if;
  if v_attempt.state <> 'IN_FLIGHT'
     or v_attempt.idempotency_key <> p_expected_idempotency_key
     or v_attempt.claim_expires_at is null
     or v_attempt.claim_expires_at > clock_timestamp() then
    raise exception 'TL_SOCIAL_DISPATCH_RECOVERY_NOT_DUE';
  end if;
  -- An expired claim is delivery-uncertain. Never turn it into a retryable
  -- failure because the future external side effect may already have occurred.
  perform set_config('touchline.social_transition', 'recover_dispatch', true);
  update public.touchline_social_dispatch_attempts
  set state = 'DELIVERY_UNKNOWN',
      error_code = 'CLAIM_LEASE_EXPIRED',
      failure_stage = null,
      claim_token = null,
      claimed_at = null,
      claim_expires_at = null,
      completed_at = clock_timestamp()
  where id = v_attempt.id;
  return jsonb_build_object(
    'ok', true,
    'attemptId', v_attempt.id,
    'state', 'DELIVERY_UNKNOWN',
    'outcome', 'reconciliation_required'
  );
end;
$$;

create index if not exists touchline_social_publication_drafts_fixture_idx
  on public.touchline_social_publication_drafts (fixture_provider_id, content_type, placement);
create index if not exists touchline_social_publication_drafts_approval_idx
  on public.touchline_social_publication_drafts (approval_state, created_at desc);
create index if not exists touchline_social_generation_reviews_state_idx
  on public.touchline_social_generation_reviews (review_state, last_checked_at desc);
create index if not exists touchline_social_generation_reviews_draft_idx
  on public.touchline_social_generation_reviews (generated_draft_id)
  where generated_draft_id is not null;
create index if not exists touchline_social_generation_reviews_retry_idx
  on public.touchline_social_generation_reviews (next_eligible_at)
  where review_state = 'REVIEW_REQUIRED';
create index if not exists touchline_social_generation_reviews_source_revision_idx
  on public.touchline_social_generation_reviews
  using gin (source_revision_manifest);
create index if not exists touchline_social_dispatch_attempts_draft_idx
  on public.touchline_social_dispatch_attempts (draft_id, attempted_at desc);
create index if not exists touchline_social_dispatch_attempts_claim_expiry_idx
  on public.touchline_social_dispatch_attempts (claim_expires_at)
  where state = 'IN_FLIGHT';
create index if not exists touchline_social_review_intents_draft_idx
  on public.touchline_social_review_intents (draft_id, created_at desc);
create index if not exists touchline_social_review_intents_expiry_idx
  on public.touchline_social_review_intents (expires_at)
  where consumed_at is null;
create unique index if not exists touchline_social_dispatch_external_publication_uidx
  on public.touchline_social_dispatch_attempts (external_publication_id)
  where external_publication_id is not null;

alter table public.touchline_social_publication_drafts enable row level security;
alter table public.touchline_social_publication_drafts force row level security;
alter table public.touchline_social_generation_reviews enable row level security;
alter table public.touchline_social_generation_reviews force row level security;
alter table public.touchline_social_generation_cycles enable row level security;
alter table public.touchline_social_generation_cycles force row level security;
alter table public.touchline_social_owner_approvers enable row level security;
alter table public.touchline_social_owner_approvers force row level security;
alter table public.touchline_social_review_intents enable row level security;
alter table public.touchline_social_review_intents force row level security;
alter table public.touchline_social_dispatch_attempts enable row level security;
alter table public.touchline_social_dispatch_attempts force row level security;
alter table public.touchline_social_source_clock enable row level security;
alter table public.touchline_social_source_clock force row level security;
alter table public.touchline_social_source_revisions enable row level security;
alter table public.touchline_social_source_revisions force row level security;

revoke all privileges on table public.touchline_social_publication_drafts from public, anon, authenticated, service_role;
revoke all privileges on table public.touchline_social_generation_reviews from public, anon, authenticated, service_role;
revoke all privileges on table public.touchline_social_generation_cycles from public, anon, authenticated, service_role;
revoke all privileges on table public.touchline_social_owner_approvers from public, anon, authenticated, service_role;
revoke all privileges on table public.touchline_social_review_intents from public, anon, authenticated, service_role;
revoke all privileges on table public.touchline_social_dispatch_attempts from public, anon, authenticated, service_role;
revoke all privileges on table public.touchline_social_source_clock from public, anon, authenticated, service_role;
revoke all privileges on table public.touchline_social_source_revisions from public, anon, authenticated, service_role;
grant select on table public.touchline_social_publication_drafts to service_role;
grant select on table public.touchline_social_generation_reviews to service_role;
grant select on table public.touchline_social_generation_cycles to service_role;
grant select on table public.touchline_social_owner_approvers to service_role;
grant select on table public.touchline_social_review_intents to service_role;
grant select on table public.touchline_social_dispatch_attempts to service_role;
grant select on table public.touchline_social_source_clock to service_role;
grant select on table public.touchline_social_source_revisions to service_role;

revoke all on function public.touchline_social_require_owner_actor(uuid) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_issue_review_intent(uuid, text, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_approve_artwork(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_approve_caption(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_cancel_draft(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_enqueue_dispatch(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_claim_dispatch(uuid, text) from public, anon, authenticated;
revoke all on function public.touchline_social_complete_dispatch(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.touchline_social_recover_expired_dispatch(uuid, text) from public, anon, authenticated;
revoke all on function public.touchline_social_claim_generation(text, text, text, timestamptz, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.touchline_social_complete_generation(text, text, text, uuid, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.touchline_social_renew_generation(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.touchline_social_claim_generation_cycle() from public, anon, authenticated;
revoke all on function public.touchline_social_renew_generation_cycle(uuid) from public, anon, authenticated;
revoke all on function public.touchline_social_complete_generation_cycle(uuid, text) from public, anon, authenticated;
revoke all on function public.touchline_social_create_draft(jsonb) from public, anon, authenticated;
revoke all on function public.touchline_social_invalidate_on_fixture_feed_change() from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_source_revision_is_current(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_jsonb_object_length(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_read_source_revision(text[]) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_bump_source_revisions(text[], text) from public, anon, authenticated, service_role;
revoke all on function public.touchline_social_track_render_dependency() from public, anon, authenticated, service_role;
grant execute on function public.touchline_social_require_owner_actor(uuid) to authenticated;
grant execute on function public.touchline_social_issue_review_intent(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.touchline_social_approve_artwork(uuid, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.touchline_social_approve_caption(uuid, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.touchline_social_cancel_draft(uuid, uuid) to authenticated;
grant execute on function public.touchline_social_enqueue_dispatch(uuid, text) to authenticated;
grant execute on function public.touchline_social_claim_dispatch(uuid, text) to service_role;
grant execute on function public.touchline_social_complete_dispatch(uuid, text, uuid, text, text, text, text) to service_role;
grant execute on function public.touchline_social_recover_expired_dispatch(uuid, text) to service_role;
grant execute on function public.touchline_social_claim_generation(text, text, text, timestamptz, text, jsonb, text) to service_role;
grant execute on function public.touchline_social_complete_generation(text, text, text, uuid, text, text, uuid, text, text) to service_role;
grant execute on function public.touchline_social_renew_generation(text, text, text, uuid) to service_role;
grant execute on function public.touchline_social_claim_generation_cycle() to service_role;
grant execute on function public.touchline_social_renew_generation_cycle(uuid) to service_role;
grant execute on function public.touchline_social_complete_generation_cycle(uuid, text) to service_role;
grant execute on function public.touchline_social_create_draft(jsonb) to service_role;
grant execute on function public.touchline_social_read_source_revision(text[]) to service_role;

comment on table public.touchline_social_publication_drafts is
  'QA-only immutable-source social drafts. Human approval is mandatory; no provider credentials are stored.';
comment on table public.touchline_social_dispatch_attempts is
  'QA-only future delivery audit. Every attempt copies an immutable content-addressed Storage bucket/key, optional ETag and approved SHA-256. A fenced two-minute claim lease is required; expiry becomes terminal DELIVERY_UNKNOWN rather than a retry that could duplicate an external side effect. The worker must fetch that exact key, conditionally match ETag when available, fully decode it and re-hash its bytes immediately before any future outbound delivery. Retries are bounded to three PRE_DISPATCH failures and reuse one stable idempotency key. No external request is implemented.';
comment on table public.touchline_social_generation_reviews is
  'QA-only fail-closed generation gate. Missing canonical cards or fixture facts remain REVIEW_REQUIRED in Admin; GENERATED binds the immutable draft revision. A semantic input checksum and bounded retry window prevent repeated rendering of unchanged data.';
comment on table public.touchline_social_generation_cycles is
  'QA-only durable singleton lease and cadence for the lineup DRAFT watcher. Multiple processes cannot amplify browser work.';
comment on table public.touchline_social_owner_approvers is
  'Immutable migration-time snapshot of social approvers. Generic service-role owner registration cannot expand this capability.';
comment on table public.touchline_social_review_intents is
  'Short-lived, one-use server attestations binding current source, generator health and exact content before an authenticated owner approval RPC can execute.';
comment on table public.touchline_social_source_clock is
  'Singleton transactional clock used only to detect renderer reads that crossed a semantic dependency write.';
comment on table public.touchline_social_source_revisions is
  'Per-entity semantic revision map. Draft approval and future dispatch remain fail-closed when any referenced revision changes.';

commit;
