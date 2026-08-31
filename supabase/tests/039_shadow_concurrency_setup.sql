\set ON_ERROR_STOP on

-- Disposable-shadow-only fixture for a real two-connection enqueue race.
-- The caller must run this after the exact 039 migration and destroy the
-- entire empty cluster afterwards; this file is never linked to shared QA.

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

create table public.shadow_039_concurrency_fixture (
  draft_id uuid primary key,
  artwork_intent_id uuid not null,
  caption_intent_id uuid not null,
  source_revision_checksum text not null
);
grant insert on public.shadow_039_concurrency_fixture to service_role;
grant select on public.shadow_039_concurrency_fixture to authenticated;

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

-- Seed renderer dependencies as the local shadow owner. The real service role
-- intentionally cannot write canonical player identity rows.
insert into public.football_players (id, provider, provider_player_id, display_name)
values
  ('20000000-0000-4000-8000-000000000001', 'sportmonks', '2001', 'Related Player'),
  ('20000000-0000-4000-8000-000000000002', 'sportmonks', '2002', 'Unrelated Player');

insert into public.football_competitions (id, provider, provider_competition_id, name)
values ('21000000-0000-4000-8000-000000000001', 'sportmonks', '8', 'Shadow Competition');
insert into public.football_seasons (
  id, provider, competition_id, provider_season_id, is_current, name
) values
  ('22000000-0000-4000-8000-000000000001', 'sportmonks', '21000000-0000-4000-8000-000000000001', '26001', true, 'Fixture Season'),
  ('22000000-0000-4000-8000-000000000002', 'sportmonks', '21000000-0000-4000-8000-000000000001', '26002', true, 'Unrelated Current Season');

set role service_role;
set request.jwt.claim.sub = '60277b78-1e65-4e2e-89f0-67e7b819ed24';

do $$
declare
  v_first_observed_at timestamptz := clock_timestamp() - interval '5 minutes';
  v_source_snapshot_at timestamptz := clock_timestamp() - interval '4 minutes';
  v_generated_at timestamptz := clock_timestamp() - interval '3 minutes';
  v_template_version text := 'touchline-lineup-feed-v1';
  v_source_version text := 'touchline-official-lineup-feed-v1';
  v_source_checksum text := 'sha256:' || repeat('1', 64);
  v_input_checksum text := 'sha256:' || repeat('1', 64);
  v_artifact_checksum text := 'sha256:' || repeat('2', 64);
  v_manifest_checksum text := 'sha256:' || repeat('3', 64);
  v_caption_checksum text := 'sha256:' || repeat('4', 64);
  v_source_revision jsonb;
  v_source_revision_manifest jsonb;
  v_source_revision_checksum text;
  v_claim jsonb;
  v_cycle jsonb;
  v_created jsonb;
  v_draft_id uuid;
  v_artwork_intent_id uuid;
  v_caption_intent_id uuid;
begin
  insert into public.football_fantasy_fixture_feeds (
    provider, provider_fixture_id, last_synced_at
  ) values ('sportmonks', '19722192', v_source_snapshot_at)
  on conflict (provider, provider_fixture_id) do update
  set last_synced_at = excluded.last_synced_at;

  v_source_revision := public.touchline_social_read_source_revision(
    array[
      'fixture-provider:19722192',
      'player:20000000-0000-4000-8000-000000000001',
      'season:22000000-0000-4000-8000-000000000001'
    ]
  );
  v_source_revision_manifest := v_source_revision -> 'manifest';
  v_source_revision_checksum := v_source_revision ->> 'checksum';

  v_cycle := public.touchline_social_claim_generation_cycle();
  if v_cycle ->> 'outcome' <> 'claimed' then
    raise exception 'SHADOW_039_CONCURRENCY_CYCLE_NOT_CLAIMED';
  end if;
  perform public.touchline_social_complete_generation_cycle(
    (v_cycle ->> 'leaseToken')::uuid, 'SUCCESS'
  );

  v_claim := public.touchline_social_claim_generation(
    '19722192', '19', v_template_version, v_first_observed_at, v_input_checksum,
    v_source_revision_manifest, v_source_revision_checksum
  );
  if v_claim ->> 'outcome' <> 'claimed' then
    raise exception 'SHADOW_039_CONCURRENCY_GENERATION_NOT_CLAIMED';
  end if;

  v_created := public.touchline_social_create_draft(jsonb_build_object(
    'publication_key',
      'instagram:INSTAGRAM_FEED:LINEUP:19722192:19:en-GB:'
      || 'tv=touchline-lineup-feed-v1:'
      || 'sv=touchline-official-lineup-feed-v1:r=1',
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
    'artifact_storage_key',
      'instagram/instagram_feed/lineup/19722192/19/en-GB/'
      || 'tv=touchline-lineup-feed-v1/'
      || 'sv=touchline-official-lineup-feed-v1/r=1/'
      || repeat('2', 64) || '.png',
    'artifact_etag', '"shadow-concurrency-etag-039"',
    'manifest_checksum', v_manifest_checksum,
    'artifact_checksum', v_artifact_checksum,
    'caption_checksum', v_caption_checksum
  ));
  v_draft_id := (v_created ->> 'draftId')::uuid;

  perform public.touchline_social_complete_generation(
    '19722192', '19', v_template_version, (v_claim ->> 'leaseToken')::uuid,
    'GENERATED', 'DRAFT_READY', v_draft_id, v_source_version, v_source_checksum
  );
  v_artwork_intent_id := (
    public.touchline_social_issue_review_intent(
      v_draft_id, 'ARTWORK', v_artifact_checksum, v_manifest_checksum,
      v_source_checksum, v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    ) ->> 'intentId'
  )::uuid;
  v_caption_intent_id := (
    public.touchline_social_issue_review_intent(
      v_draft_id, 'CAPTION', v_caption_checksum, v_manifest_checksum,
      v_source_checksum, v_source_revision_checksum,
      '60277b78-1e65-4e2e-89f0-67e7b819ed24'
    ) ->> 'intentId'
  )::uuid;
  insert into public.shadow_039_concurrency_fixture (
    draft_id, artwork_intent_id, caption_intent_id, source_revision_checksum
  ) values (
    v_draft_id, v_artwork_intent_id, v_caption_intent_id, v_source_revision_checksum
  );
end;
$$;

reset role;

select draft_id, artwork_intent_id, caption_intent_id, source_revision_checksum
from public.shadow_039_concurrency_fixture;
