\set ON_ERROR_STOP on

-- Execute only in a fresh disposable Supabase-compatible shadow after the
-- exact 039 forward migration. Every row below is enclosed in one transaction
-- and rolled back, so this test cannot seed a shared environment.
do $$
begin
  if current_setting('touchline.shadow_039_ack', true) is distinct from 'LOCAL_EMPTY_CLUSTER_ONLY'
     or current_database() is distinct from current_setting('touchline.shadow_039_database', true)
     or current_database() !~ '^touchline_social_shadow_039_[a-z0-9_]+$'
     or (inet_server_addr() is not null and inet_server_addr() <> inet '127.0.0.1') then
    raise exception 'TL_SOCIAL_039_SHADOW_LOCAL_IDENTITY_REQUIRED';
  end if;
end;
$$;

begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '60277b78-1e65-4e2e-89f0-67e7b819ed24',
  'authenticated',
  'authenticated',
  'admin@touchline.com.br',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
) on conflict (id) do nothing;

insert into public.touchline_platform_owner_accounts (user_id, normalized_email)
values (
  '60277b78-1e65-4e2e-89f0-67e7b819ed24',
  'admin@touchline.com.br'
) on conflict (user_id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'touchline_social_publication_drafts',
        'touchline_social_generation_reviews',
        'touchline_social_generation_cycles',
        'touchline_social_owner_approvers',
        'touchline_social_review_intents',
        'touchline_social_dispatch_attempts',
        'touchline_social_source_clock',
        'touchline_social_source_revisions'
      )
      and relation.relrowsecurity
      and relation.relforcerowsecurity
    group by namespace.nspname
    having count(*) = 8
  ) then
    raise exception 'SHADOW_039_FORCE_RLS_MISSING';
  end if;

  if has_table_privilege('anon', 'public.touchline_social_publication_drafts', 'SELECT')
     or has_table_privilege('authenticated', 'public.touchline_social_publication_drafts', 'SELECT')
     or has_table_privilege('service_role', 'public.touchline_social_publication_drafts', 'INSERT')
     or has_table_privilege('service_role', 'public.touchline_social_publication_drafts', 'UPDATE')
     or has_table_privilege('service_role', 'public.touchline_social_publication_drafts', 'DELETE')
     or not has_table_privilege('service_role', 'public.touchline_social_publication_drafts', 'SELECT') then
    raise exception 'SHADOW_039_ROLE_GRANTS_INVALID';
  end if;

  if has_function_privilege(
       'service_role',
       'public.touchline_social_approve_artwork(uuid,uuid,text,text,text,text,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.touchline_social_approve_caption(uuid,uuid,text,text,text,text,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.touchline_social_enqueue_dispatch(uuid,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.touchline_social_approve_artwork(uuid,uuid,text,text,text,text,uuid)',
       'EXECUTE'
     ) then
    raise exception 'SHADOW_039_OWNER_WORKER_CAPABILITIES_NOT_SEPARATED';
  end if;

  if pg_catalog.to_regprocedure(
       'public.touchline_social_enqueue_dispatch(uuid,text,text)'
     ) is not null then
    raise exception 'SHADOW_039_LEGACY_ENQUEUE_OVERLOAD_PRESENT';
  end if;
end;
$$;

-- Adding an identity to the generic platform-owner registry after migration
-- must not expand the frozen social-approval capability.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000040',
  'authenticated', 'authenticated', 'late-owner-039@touchline.invalid', '',
  clock_timestamp(), '{}', '{}', clock_timestamp(), clock_timestamp()
) on conflict (id) do nothing;
insert into public.touchline_platform_owner_accounts (user_id, normalized_email)
values ('00000000-0000-0000-0000-000000000040', 'late-owner-039@touchline.invalid')
on conflict (user_id) do nothing;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000040', true);
do $$
begin
  begin
    perform public.touchline_social_require_owner_actor(
      '00000000-0000-0000-0000-000000000040'
    );
    raise exception 'SHADOW_039_LATE_PLATFORM_OWNER_GAINED_SOCIAL_CAPABILITY';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_OWNER_ACTOR_REQUIRED' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '60277b78-1e65-4e2e-89f0-67e7b819ed24', true);

do $$
declare
  v_first_observed_at timestamptz := clock_timestamp() - interval '5 minutes';
  v_source_snapshot_at timestamptz := clock_timestamp() - interval '4 minutes';
  v_generated_at timestamptz := clock_timestamp() - interval '3 minutes';
  v_template_version text := 'touchline-lineup-feed-v1';
  v_source_version text := 'touchline-official-lineup-feed-v1';
  v_source_checksum text := 'sha256:' || repeat('5', 64);
  v_input_checksum text := 'sha256:' || repeat('5', 64);
  v_artifact_checksum text := 'sha256:' || repeat('2', 64);
  v_manifest_checksum text := 'sha256:' || repeat('3', 64);
  v_caption_checksum text := 'sha256:' || repeat('4', 64);
  v_source_revision jsonb;
  v_source_revision_manifest jsonb;
  v_source_revision_checksum text;
  v_publication_key text :=
    'instagram:INSTAGRAM_FEED:LINEUP:19722192:19:en-GB:'
    || 'tv=touchline-lineup-feed-v1:'
    || 'sv=touchline-official-lineup-feed-v1:r=1';
  v_storage_key text :=
    'instagram/instagram_feed/lineup/19722192/19/en-GB/'
    || 'tv=touchline-lineup-feed-v1/'
    || 'sv=touchline-official-lineup-feed-v1/r=1/'
    || repeat('2', 64) || '.png';
  v_claim jsonb;
  v_second_claim jsonb;
  v_create jsonb;
  v_create_again jsonb;
  v_complete jsonb;
  v_lease_token uuid;
  v_draft_id uuid;
  v_enqueue jsonb;
  v_enqueue_again jsonb;
  v_dispatch_claim jsonb;
  v_attempt public.touchline_social_dispatch_attempts%rowtype;
  v_cycle jsonb;
  v_artwork_intent uuid;
  v_caption_intent uuid;
  v_final_score_draft_id uuid;
begin
  insert into public.football_fantasy_fixture_feeds (
    provider, provider_fixture_id, last_synced_at
  ) values ('sportmonks', '19722192', v_source_snapshot_at)
  on conflict (provider, provider_fixture_id) do update
  set last_synced_at = excluded.last_synced_at;

  v_source_revision := public.touchline_social_read_source_revision(
    array['fixture-provider:19722192']
  );
  v_source_revision_manifest := v_source_revision -> 'manifest';
  v_source_revision_checksum := v_source_revision ->> 'checksum';

  v_cycle := public.touchline_social_claim_generation_cycle();
  if v_cycle ->> 'outcome' <> 'claimed' then
    raise exception 'SHADOW_039_GENERATION_CYCLE_NOT_CLAIMED';
  end if;
  if (public.touchline_social_claim_generation_cycle() ->> 'outcome') <> 'busy' then
    raise exception 'SHADOW_039_GENERATION_CYCLE_NOT_SINGLE_FLIGHT';
  end if;
  if (public.touchline_social_renew_generation_cycle((v_cycle ->> 'leaseToken')::uuid) ->> 'outcome') <> 'renewed' then
    raise exception 'SHADOW_039_GENERATION_CYCLE_NOT_RENEWED';
  end if;
  perform public.touchline_social_complete_generation_cycle((v_cycle ->> 'leaseToken')::uuid, 'SUCCESS');
  if (public.touchline_social_claim_generation_cycle() ->> 'outcome') <> 'cooldown' then
    raise exception 'SHADOW_039_GENERATION_CYCLE_COOLDOWN_MISSING';
  end if;

  begin
    perform public.touchline_social_claim_generation(
      '19722192', '19', v_template_version,
      clock_timestamp() - interval '119 seconds', v_input_checksum,
      v_source_revision_manifest, v_source_revision_checksum
    );
    raise exception 'SHADOW_039_UNSTABLE_SOURCE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_GENERATION_REVIEW_INPUT_INVALID' then raise; end if;
  end;

  v_claim := public.touchline_social_claim_generation(
    '19722192', '19', v_template_version, v_first_observed_at, v_input_checksum,
    v_source_revision_manifest, v_source_revision_checksum
  );
  if v_claim ->> 'outcome' <> 'claimed'
     or v_claim ->> 'state' <> 'GENERATING'
     or coalesce(v_claim ->> 'leaseToken', '') = '' then
    raise exception 'SHADOW_039_GENERATION_LEASE_NOT_CLAIMED';
  end if;
  v_lease_token := (v_claim ->> 'leaseToken')::uuid;

  v_second_claim := public.touchline_social_claim_generation(
    '19722192', '19', v_template_version, v_first_observed_at, v_input_checksum,
    v_source_revision_manifest, v_source_revision_checksum
  );
  if v_second_claim ->> 'outcome' <> 'busy'
     or (select count(*) from public.touchline_social_generation_reviews
         where fixture_provider_id = '19722192'
           and team_provider_id = '19'
           and template_version = v_template_version) <> 1 then
    raise exception 'SHADOW_039_GENERATION_SINGLE_FLIGHT_FAILED';
  end if;

  v_create := public.touchline_social_create_draft(jsonb_build_object(
    'publication_key', v_publication_key,
    'fixture_provider_id', '19722192',
    'team_provider_id', '19',
    'content_type', 'LINEUP',
    'placement', 'INSTAGRAM_FEED',
    'locale', 'en-GB',
    'revision', 1,
    'render_path', '/visual-qa/social-lineup?fixtureId=19722192&teamId=19&locale=en-GB&revision=1',
    'width', 1080,
    'height', 1350,
    'caption', 'Arsenal official line-up. COMING SOON • CURRENTLY IN TESTING',
    'first_observed_at', v_first_observed_at,
    'source_snapshot_at', v_source_snapshot_at,
    'generated_at', v_generated_at,
    'template_version', v_template_version,
    'source_version', v_source_version,
    'source_checksum', v_source_checksum,
    'source_revision_manifest', v_source_revision_manifest,
    'source_revision_checksum', v_source_revision_checksum,
    'input_checksum', v_input_checksum,
    'artifact_content_type', 'image/png',
    'artifact_byte_length', 4096,
    'artifact_storage_provider', 'SUPABASE_STORAGE',
    'artifact_storage_bucket', 'touchline-social-drafts',
    'artifact_storage_key', v_storage_key,
    'artifact_etag', '"shadow-etag-039"',
    'manifest_checksum', v_manifest_checksum,
    'artifact_checksum', v_artifact_checksum,
    'caption_checksum', v_caption_checksum
  ));
  if v_create ->> 'outcome' <> 'inserted' then
    raise exception 'SHADOW_039_DRAFT_NOT_INSERTED';
  end if;
  v_draft_id := (v_create ->> 'draftId')::uuid;

  v_create_again := public.touchline_social_create_draft(jsonb_build_object(
    'publication_key', v_publication_key,
    'fixture_provider_id', '19722192',
    'team_provider_id', '19',
    'content_type', 'LINEUP',
    'placement', 'INSTAGRAM_FEED',
    'locale', 'en-GB',
    'revision', 1,
    'render_path', '/visual-qa/social-lineup?fixtureId=19722192&teamId=19&locale=en-GB&revision=1',
    'width', 1080,
    'height', 1350,
    'caption', 'Arsenal official line-up. COMING SOON • CURRENTLY IN TESTING',
    'first_observed_at', v_first_observed_at,
    'source_snapshot_at', v_source_snapshot_at,
    'generated_at', v_generated_at,
    'template_version', v_template_version,
    'source_version', v_source_version,
    'source_checksum', v_source_checksum,
    'source_revision_manifest', v_source_revision_manifest,
    'source_revision_checksum', v_source_revision_checksum,
    'input_checksum', v_input_checksum,
    'artifact_content_type', 'image/png',
    'artifact_byte_length', 4096,
    'artifact_storage_provider', 'SUPABASE_STORAGE',
    'artifact_storage_bucket', 'touchline-social-drafts',
    'artifact_storage_key', v_storage_key,
    'artifact_etag', '"shadow-etag-039"',
    'manifest_checksum', v_manifest_checksum,
    'artifact_checksum', v_artifact_checksum,
    'caption_checksum', v_caption_checksum
  ));
  if v_create_again ->> 'outcome' <> 'noop_existing'
     or (v_create_again ->> 'draftId')::uuid <> v_draft_id then
    raise exception 'SHADOW_039_DRAFT_IDEMPOTENCY_FAILED';
  end if;

  begin
    perform public.touchline_social_complete_generation(
      '19722192', '19', v_template_version, v_lease_token,
      'GENERATED', 'DRAFT_READY', v_draft_id,
      v_source_version, 'sha256:' || repeat('f', 64)
    );
    raise exception 'SHADOW_039_GENERATION_IDENTITY_ACCEPTED_MISMATCH';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_GENERATION_DRAFT_IDENTITY_MISMATCH' then raise; end if;
  end;

  v_complete := public.touchline_social_complete_generation(
    '19722192', '19', v_template_version, v_lease_token,
    'GENERATED', 'DRAFT_READY', v_draft_id,
    v_source_version, v_source_checksum
  );
  if v_complete ->> 'state' <> 'GENERATED' then
    raise exception 'SHADOW_039_GENERATION_NOT_COMPLETED';
  end if;

  v_second_claim := public.touchline_social_claim_generation(
    '19722192', '19', v_template_version, v_first_observed_at, v_input_checksum,
    v_source_revision_manifest, v_source_revision_checksum
  );
  if v_second_claim ->> 'outcome' <> 'noop_current'
     or (v_second_claim ->> 'draftId')::uuid <> v_draft_id then
    raise exception 'SHADOW_039_UNCHANGED_INPUT_NOT_NOOP';
  end if;

  -- An official correction may create a new immutable revision. Reclaiming the
  -- same fixture/team lease is therefore allowed, but it may not overwrite the
  -- generated draft or its content.
  v_input_checksum := 'sha256:' || repeat('8', 64);
  v_claim := public.touchline_social_claim_generation(
    '19722192', '19', v_template_version, v_first_observed_at, v_input_checksum,
    v_source_revision_manifest, v_source_revision_checksum
  );
  if v_claim ->> 'outcome' <> 'claimed' then
    raise exception 'SHADOW_039_CORRECTION_RECLAIM_FAILED';
  end if;
  perform public.touchline_social_complete_generation(
    '19722192', '19', v_template_version, (v_claim ->> 'leaseToken')::uuid,
    'REVIEW_REQUIRED', 'OFFICIAL_LINEUP_CHANGED'
  );

  begin
    perform public.touchline_social_issue_review_intent(
      v_draft_id, 'ARTWORK', v_artifact_checksum, v_manifest_checksum,
      v_source_checksum, v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    );
    raise exception 'SHADOW_039_STALE_GENERATION_APPROVAL_ALLOWED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_GENERATION_NOT_CURRENT' then raise; end if;
  end;
  begin
    perform public.touchline_social_enqueue_dispatch(
      v_draft_id, 'TOUCHLINE_OFFICIAL_INSTAGRAM'
    );
    raise exception 'SHADOW_039_STALE_GENERATION_ENQUEUE_ALLOWED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_GENERATION_NOT_CURRENT' then raise; end if;
  end;

  v_second_claim := public.touchline_social_claim_generation(
    '19722192', '19', v_template_version, v_first_observed_at, v_input_checksum,
    v_source_revision_manifest, v_source_revision_checksum
  );
  if v_second_claim ->> 'outcome' <> 'cooldown' then
    raise exception 'SHADOW_039_REVIEW_RETRY_NOT_BOUNDED';
  end if;

  -- A further official correction invalidates the cooldown and must create a
  -- new immutable revision before approval can resume.
  v_input_checksum := 'sha256:' || repeat('9', 64);
  v_source_checksum := 'sha256:' || repeat('9', 64);
  v_artifact_checksum := 'sha256:' || repeat('b', 64);
  v_manifest_checksum := 'sha256:' || repeat('c', 64);
  v_caption_checksum := 'sha256:' || repeat('d', 64);
  v_publication_key :=
    'instagram:INSTAGRAM_FEED:LINEUP:19722192:19:en-GB:'
    || 'tv=touchline-lineup-feed-v1:'
    || 'sv=touchline-official-lineup-feed-v1:r=2';
  v_storage_key :=
    'instagram/instagram_feed/lineup/19722192/19/en-GB/'
    || 'tv=touchline-lineup-feed-v1/'
    || 'sv=touchline-official-lineup-feed-v1/r=2/'
    || repeat('b', 64) || '.png';
  v_claim := public.touchline_social_claim_generation(
    '19722192', '19', v_template_version, v_first_observed_at, v_input_checksum,
    v_source_revision_manifest, v_source_revision_checksum
  );
  if v_claim ->> 'outcome' <> 'claimed' then
    raise exception 'SHADOW_039_NEW_CORRECTION_NOT_CLAIMED';
  end if;
  v_create := public.touchline_social_create_draft(jsonb_build_object(
    'publication_key', v_publication_key,
    'fixture_provider_id', '19722192',
    'team_provider_id', '19',
    'content_type', 'LINEUP',
    'placement', 'INSTAGRAM_FEED',
    'locale', 'en-GB',
    'revision', 2,
    'render_path', '/visual-qa/social-lineup?fixtureId=19722192&teamId=19&locale=en-GB&revision=2',
    'width', 1080,
    'height', 1350,
    'caption', 'Arsenal corrected official line-up. COMING SOON • CURRENTLY IN TESTING',
    'first_observed_at', v_first_observed_at,
    'source_snapshot_at', v_source_snapshot_at,
    'generated_at', v_generated_at,
    'template_version', v_template_version,
    'source_version', v_source_version,
    'source_checksum', v_source_checksum,
    'source_revision_manifest', v_source_revision_manifest,
    'source_revision_checksum', v_source_revision_checksum,
    'input_checksum', v_input_checksum,
    'artifact_content_type', 'image/png',
    'artifact_byte_length', 4096,
    'artifact_storage_provider', 'SUPABASE_STORAGE',
    'artifact_storage_bucket', 'touchline-social-drafts',
    'artifact_storage_key', v_storage_key,
    'artifact_etag', '"shadow-etag-039-r2"',
    'manifest_checksum', v_manifest_checksum,
    'artifact_checksum', v_artifact_checksum,
    'caption_checksum', v_caption_checksum
  ));
  v_draft_id := (v_create ->> 'draftId')::uuid;
  perform public.touchline_social_complete_generation(
    '19722192', '19', v_template_version, (v_claim ->> 'leaseToken')::uuid,
    'GENERATED', 'DRAFT_READY', v_draft_id,
    v_source_version, v_source_checksum
  );

  v_artwork_intent := (
    public.touchline_social_issue_review_intent(
      v_draft_id, 'ARTWORK', v_artifact_checksum, v_manifest_checksum,
      v_source_checksum, v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    ) ->> 'intentId'
  )::uuid;
  v_caption_intent := (
    public.touchline_social_issue_review_intent(
      v_draft_id, 'CAPTION', v_caption_checksum, v_manifest_checksum,
      v_source_checksum, v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    ) ->> 'intentId'
  )::uuid;

  -- Generator health is rechecked at intent time; a stale global heartbeat
  -- cannot be used as a substitute for a current per-fixture revision.
  perform set_config('touchline.social_transition', 'complete_cycle', true);
  update public.touchline_social_generation_cycles
  set last_completed_at = clock_timestamp() - interval '3 minutes'
  where lease_name = 'lineup-draft-watcher';
  begin
    perform public.touchline_social_issue_review_intent(
      v_draft_id, 'ARTWORK', v_artifact_checksum, v_manifest_checksum,
      v_source_checksum, v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    );
    raise exception 'SHADOW_039_STALE_GENERATION_HEALTH_ACCEPTED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_GENERATION_HEALTH_UNSAFE' then raise; end if;
  end;
  perform set_config('touchline.social_transition', 'complete_cycle', true);
  update public.touchline_social_generation_cycles
  set last_completed_at = clock_timestamp()
  where lease_name = 'lineup-draft-watcher';

  -- The existing intents bind the prior exact successful cycle. Refresh them
  -- after the test-only health clock injection.
  v_artwork_intent := (
    public.touchline_social_issue_review_intent(
      v_draft_id, 'ARTWORK', v_artifact_checksum, v_manifest_checksum,
      v_source_checksum, v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    ) ->> 'intentId'
  )::uuid;
  v_caption_intent := (
    public.touchline_social_issue_review_intent(
      v_draft_id, 'CAPTION', v_caption_checksum, v_manifest_checksum,
      v_source_checksum, v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    ) ->> 'intentId'
  )::uuid;

  begin
    update public.touchline_social_publication_drafts
    set caption = 'mutated after generation'
    where id = v_draft_id;
    raise exception 'SHADOW_039_DIRECT_CONTENT_MUTATION_ALLOWED';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm not in ('TL_SOCIAL_DRAFT_CONTENT_IMMUTABLE', 'TL_SOCIAL_TRANSITION_RPC_REQUIRED') then
        raise;
      end if;
  end;

  perform public.touchline_social_approve_artwork(
    v_artwork_intent, v_draft_id,
    v_artifact_checksum, v_manifest_checksum, v_source_checksum,
    v_source_revision_checksum,
    '60277b78-1e65-4e2e-89f0-67e7b819ed24'
  );
  if (select approval_state from public.touchline_social_publication_drafts where id = v_draft_id)
     <> 'APPROVAL_REQUIRED' then
    raise exception 'SHADOW_039_ARTWORK_ONLY_APPROVED_DRAFT';
  end if;
  perform public.touchline_social_approve_caption(
    v_caption_intent, v_draft_id,
    v_caption_checksum, v_manifest_checksum, v_source_checksum,
    v_source_revision_checksum,
    '60277b78-1e65-4e2e-89f0-67e7b819ed24'
  );
  if (select approval_state from public.touchline_social_publication_drafts where id = v_draft_id)
     <> 'APPROVED' then
    raise exception 'SHADOW_039_DUAL_APPROVAL_NOT_ATOMIC';
  end if;
  begin
    perform public.touchline_social_approve_artwork(
      v_artwork_intent, v_draft_id,
      v_artifact_checksum, v_manifest_checksum, v_source_checksum,
      v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    );
    raise exception 'SHADOW_039_CONSUMED_INTENT_REPLAYED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_REVIEW_INTENT_INVALID' then raise; end if;
  end;

  v_create := public.touchline_social_create_draft(jsonb_build_object(
    'publication_key',
      'instagram:INSTAGRAM_FEED:FINAL_SCORE:19722192:fixture:en-GB:'
      || 'tv=touchline-final-score-feed-v1:'
      || 'sv=touchline-final-score-source-v1:r=1',
    'fixture_provider_id', '19722192',
    'team_provider_id', null,
    'content_type', 'FINAL_SCORE',
    'placement', 'INSTAGRAM_FEED',
    'locale', 'en-GB',
    'revision', 1,
    'render_path', '/visual-qa/social-final-score?fixtureId=19722192&locale=en-GB&revision=1',
    'width', 1080,
    'height', 1350,
    'caption', 'Full Time. COMING SOON • CURRENTLY IN TESTING',
    'first_observed_at', v_first_observed_at,
    'source_snapshot_at', v_source_snapshot_at,
    'generated_at', v_generated_at,
    'template_version', 'touchline-final-score-feed-v1',
    'source_version', 'touchline-final-score-source-v1',
    'source_checksum', 'sha256:' || repeat('e', 64),
    'source_revision_manifest', v_source_revision_manifest,
    'source_revision_checksum', v_source_revision_checksum,
    'input_checksum', 'sha256:' || repeat('e', 64),
    'artifact_content_type', 'image/png',
    'artifact_byte_length', 4096,
    'artifact_storage_provider', 'SUPABASE_STORAGE',
    'artifact_storage_bucket', 'touchline-social-drafts',
    'artifact_storage_key',
      'instagram/instagram_feed/final_score/19722192/fixture/en-GB/'
      || 'tv=touchline-final-score-feed-v1/'
      || 'sv=touchline-final-score-source-v1/r=1/'
      || repeat('e', 64) || '.png',
    'artifact_etag', '"shadow-final-score-etag-039"',
    'manifest_checksum', 'sha256:' || repeat('a', 64),
    'artifact_checksum', 'sha256:' || repeat('e', 64),
    'caption_checksum', 'sha256:' || repeat('f', 64)
  ));
  v_final_score_draft_id := (v_create ->> 'draftId')::uuid;
  begin
    perform public.touchline_social_enqueue_dispatch(
      v_final_score_draft_id, 'TOUCHLINE_OFFICIAL_INSTAGRAM'
    );
    raise exception 'SHADOW_039_FINAL_SCORE_ENQUEUE_ALLOWED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED' then raise; end if;
  end;

  v_enqueue := public.touchline_social_enqueue_dispatch(
    v_draft_id, 'TOUCHLINE_OFFICIAL_INSTAGRAM'
  );
  v_enqueue_again := public.touchline_social_enqueue_dispatch(
    v_draft_id, 'TOUCHLINE_OFFICIAL_INSTAGRAM'
  );
  if (v_enqueue ->> 'attemptGeneration')::integer <> 1
     or v_enqueue_again ->> 'outcome' <> 'already_pending'
     or (select count(*) from public.touchline_social_dispatch_attempts where draft_id = v_draft_id) <> 1 then
    raise exception 'SHADOW_039_CONCURRENT_ENQUEUE_NOT_SINGLE';
  end if;

  select * into v_attempt
  from public.touchline_social_dispatch_attempts
  where draft_id = v_draft_id and attempt_generation = 1;
  if row(
       v_attempt.artifact_content_type, v_attempt.artifact_byte_length,
       v_attempt.artifact_storage_provider, v_attempt.artifact_storage_bucket,
       v_attempt.artifact_storage_key, v_attempt.artifact_etag
     ) is distinct from row(
       'image/png'::text, 4096::bigint, 'SUPABASE_STORAGE'::text,
       'touchline-social-drafts'::text, v_storage_key, '"shadow-etag-039-r2"'::text
     ) then
    raise exception 'SHADOW_039_DISPATCH_LOCATOR_NOT_EXACT';
  end if;

  v_dispatch_claim := public.touchline_social_claim_dispatch(
    v_attempt.id, v_attempt.idempotency_key
  );
  begin
    perform public.touchline_social_complete_dispatch(
      v_attempt.id, v_attempt.idempotency_key,
      '00000000-0000-0000-0000-000000000099'::uuid,
      'FAILED', null, 'wrong-token', 'PRE_DISPATCH'
    );
    raise exception 'SHADOW_039_WRONG_CLAIM_TOKEN_ACCEPTED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_DISPATCH_CLAIM_EXPIRED' then raise; end if;
  end;
  perform public.touchline_social_complete_dispatch(
    v_attempt.id, v_attempt.idempotency_key, (v_dispatch_claim ->> 'claimToken')::uuid, 'FAILED', null,
    'render-export-not-started', 'PRE_DISPATCH'
  );
  begin
    perform public.touchline_social_complete_dispatch(
      v_attempt.id, v_attempt.idempotency_key,
      (v_dispatch_claim ->> 'claimToken')::uuid,
      'FAILED', null, 'replay', 'PRE_DISPATCH'
    );
    raise exception 'SHADOW_039_COMPLETION_REPLAY_ACCEPTED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_DISPATCH_NOT_IN_FLIGHT' then raise; end if;
  end;
  v_enqueue := public.touchline_social_enqueue_dispatch(
    v_draft_id, 'TOUCHLINE_OFFICIAL_INSTAGRAM'
  );
  if (v_enqueue ->> 'attemptGeneration')::integer <> 2 then
    raise exception 'SHADOW_039_RETRY_GENERATION_TWO_MISSING';
  end if;
  select * into v_attempt from public.touchline_social_dispatch_attempts
  where draft_id = v_draft_id and attempt_generation = 2;
  v_dispatch_claim := public.touchline_social_claim_dispatch(
    v_attempt.id, v_attempt.idempotency_key
  );
  perform public.touchline_social_complete_dispatch(
    v_attempt.id, v_attempt.idempotency_key, (v_dispatch_claim ->> 'claimToken')::uuid, 'FAILED', null,
    'render-export-not-started', 'PRE_DISPATCH'
  );
  v_enqueue := public.touchline_social_enqueue_dispatch(
    v_draft_id, 'TOUCHLINE_OFFICIAL_INSTAGRAM'
  );
  if (v_enqueue ->> 'attemptGeneration')::integer <> 3 then
    raise exception 'SHADOW_039_RETRY_GENERATION_THREE_MISSING';
  end if;
  select * into v_attempt from public.touchline_social_dispatch_attempts
  where draft_id = v_draft_id and attempt_generation = 3;
  v_dispatch_claim := public.touchline_social_claim_dispatch(
    v_attempt.id, v_attempt.idempotency_key
  );
  perform public.touchline_social_complete_dispatch(
    v_attempt.id, v_attempt.idempotency_key, (v_dispatch_claim ->> 'claimToken')::uuid, 'FAILED', null,
    'render-export-not-started', 'PRE_DISPATCH'
  );
  begin
    perform public.touchline_social_enqueue_dispatch(
      v_draft_id, 'TOUCHLINE_OFFICIAL_INSTAGRAM'
    );
    raise exception 'SHADOW_039_RETRY_BOUND_NOT_ENFORCED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_RETRY_EXHAUSTED' then raise; end if;
  end;

  -- Inject an expired claim only inside the disposable shadow so the recovery
  -- RPC is exercised without waiting two real minutes.
  alter table public.touchline_social_dispatch_attempts disable trigger touchline_social_dispatch_attempts_guard;
  update public.touchline_social_dispatch_attempts
  set state = 'IN_FLIGHT',
      error_code = null,
      failure_stage = null,
      completed_at = null,
      claim_token = '00000000-0000-0000-0000-000000000088'::uuid,
      claimed_at = clock_timestamp() - interval '3 minutes',
      claim_expires_at = clock_timestamp() - interval '1 minute'
  where id = v_attempt.id;
  alter table public.touchline_social_dispatch_attempts enable trigger touchline_social_dispatch_attempts_guard;
  if (public.touchline_social_recover_expired_dispatch(
        v_attempt.id, v_attempt.idempotency_key
      ) ->> 'state') <> 'DELIVERY_UNKNOWN' then
    raise exception 'SHADOW_039_EXPIRED_CLAIM_NOT_RECOVERED';
  end if;
  begin
    perform public.touchline_social_complete_dispatch(
      v_attempt.id, v_attempt.idempotency_key,
      '00000000-0000-0000-0000-000000000088'::uuid,
      'FAILED', null, 'late-completion', 'PRE_DISPATCH'
    );
    raise exception 'SHADOW_039_LATE_COMPLETION_AFTER_RECOVERY_ACCEPTED';
  exception when others then
    if sqlerrm <> 'TL_SOCIAL_DISPATCH_NOT_IN_FLIGHT' then raise; end if;
  end;
end;
$$;

reset role;

select 'SHADOW_039_APPROVAL_LEASE_RETRY_ASSERTIONS_PASS' as result;
rollback;
