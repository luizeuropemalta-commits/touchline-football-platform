import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/qa/039_touchline_qa_social_approval_outbox.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("../supabase/qa/039_touchline_qa_social_approval_outbox_rollback.sql", import.meta.url), "utf8");
const shadowBootstrap = readFileSync(new URL("../supabase/tests/039_shadow_local_bootstrap.sql", import.meta.url), "utf8");
const shadowConcurrency = readFileSync(new URL("../supabase/tests/039_shadow_concurrency_setup.sql", import.meta.url), "utf8");
const shadowRetry = readFileSync(new URL("../supabase/tests/039_shadow_retry_verification.sql", import.meta.url), "utf8");
const shadowVerifier = readFileSync(new URL("../scripts/qa/verify-touchline-social-shadow-039.mts", import.meta.url), "utf8");

test("social outbox candidate is QA-only, human-approved and contains no secret", () => {
  assert.match(migration, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(migration, /APPROVAL_REQUIRED/);
  assert.match(migration, /approved_artifact_checksum = artifact_checksum/);
  assert.match(migration, /approved_caption_checksum = caption_checksum/);
  assert.match(migration, /approved_manifest_checksum = manifest_checksum/);
  assert.match(migration, /COMING SOON • CURRENTLY IN TESTING/);
  assert.match(migration, /placement = 'INSTAGRAM_FEED' and height = 1350/);
  assert.match(migration, /placement = 'INSTAGRAM_STORY' and height = 1920/);
  assert.match(migration, /first_observed_at timestamptz not null/);
  assert.match(migration, /generated_at timestamptz not null/);
  assert.match(migration, /generation_latency_ms bigint generated always/);
  assert.match(migration, /source_snapshot_at >= first_observed_at/);
  assert.match(migration, /generated_at >= source_snapshot_at/);
  assert.doesNotMatch(migration, /access[_-]?token|client[_-]?secret|instagram[_-]?password|graph\.facebook/i);
  assert.doesNotMatch(migration + rollback, /https?:\/\/(?:www\.)?touchline\.com\.br|vxireiswggllwhbsmdcj/);
});

test("draft content and terminal states are immutable outside guarded RPC transitions", () => {
  assert.match(migration, /TL_SOCIAL_DRAFT_CONTENT_IMMUTABLE/);
  assert.match(migration, /TL_SOCIAL_TRANSITION_RPC_REQUIRED/);
  assert.match(migration, /TL_SOCIAL_TERMINAL_STATE_IMMUTABLE/);
  assert.match(migration, /TL_SOCIAL_DRAFT_DELETE_FORBIDDEN/);
  assert.match(migration, /TL_SOCIAL_DISPATCH_DELETE_FORBIDDEN/);
  assert.match(migration, /v_transition not in \('approve_artwork', 'approve_caption', 'cancel'\)/);
  assert.match(migration, /touchline_social_approve_artwork/);
  assert.match(migration, /touchline_social_approve_caption/);
  assert.match(migration, /touchline_social_cancel_draft/);
  assert.match(migration, /cancelled_at = clock_timestamp\(\)/);
  assert.match(migration, /cancelled_by = p_actor_id/);
  assert.match(migration, /TL_SOCIAL_STALE_ARTIFACT/);
  assert.match(migration, /TL_SOCIAL_STALE_CAPTION/);
  assert.match(migration, /TL_SOCIAL_STALE_MANIFEST/);
  assert.match(migration, /TL_SOCIAL_STALE_SOURCE/);
});

test("artwork and caption are approved independently and both bind the exact manifest", () => {
  assert.match(migration, /artwork_approval_state text not null default 'APPROVAL_REQUIRED'/);
  assert.match(migration, /caption_approval_state text not null default 'APPROVAL_REQUIRED'/);
  assert.match(migration, /artwork_approved_manifest_checksum = manifest_checksum/);
  assert.match(migration, /caption_approved_manifest_checksum = manifest_checksum/);
  assert.match(migration, /approval_state = case when caption_approval_state = 'APPROVED' then 'APPROVED'/);
  assert.match(migration, /approval_state = case when artwork_approval_state = 'APPROVED' then 'APPROVED'/);
  assert.match(migration, /v_draft\.artwork_approval_state <> 'APPROVED'/);
  assert.match(migration, /v_draft\.caption_approval_state <> 'APPROVED'/);
});

test("publication and dispatch identity include locale, source version and revision with SHA-256", () => {
  assert.match(migration, /locale \|\| ':tv=' \|\| template_version \|\| ':sv=' \|\| source_version[\s\S]*':r=' \|\| revision::text/);
  assert.match(migration, /manifest_checksum text not null/);
  assert.match(migration, /artifact_content_type text not null/);
  assert.match(migration, /artifact_byte_length bigint not null/);
  assert.match(migration, /artifact_storage_provider text not null check \(artifact_storage_provider = 'SUPABASE_STORAGE'\)/);
  assert.match(migration, /artifact_storage_bucket text not null check \(artifact_storage_bucket = 'touchline-social-drafts'\)/);
  assert.match(migration, /artifact_storage_key = 'instagram\/' \|\| lower\(placement\)/);
  assert.doesNotMatch(migration, /artifact_object_version|objectVersion/);
  assert.match(migration, /artifact_etag text check \([\s\S]*artifact_etag is null/);
  assert.match(migration, /unique \(artifact_storage_bucket, artifact_storage_key\)/);
  assert.match(migration, /render_path = case content_type/);
  assert.match(migration, /social-lineup\?fixtureId=' \|\| fixture_provider_id[\s\S]*&teamId=' \|\| team_provider_id[\s\S]*&locale=' \|\| locale[\s\S]*&revision=' \|\| revision::text/);
  assert.match(migration, /social-final-score\?fixtureId=' \|\| fixture_provider_id[\s\S]*&locale=' \|\| locale[\s\S]*&revision=' \|\| revision::text/);
  assert.doesNotMatch(migration, /render_path like '\/visual-qa\/social-%'/);
  assert.match(migration, /idempotency_key ~ '\^sha256:\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /extensions\.digest\([\s\S]*v_draft\.publication_key \|\| ':' \|\| v_draft\.approved_manifest_checksum[\s\S]*v_draft\.approved_artifact_checksum[\s\S]*v_draft\.approved_caption_checksum[\s\S]*v_draft\.artifact_storage_bucket \|\| ':' \|\| v_draft\.artifact_storage_key \|\| ':'[\s\S]*TOUCHLINE_OFFICIAL_INSTAGRAM[\s\S]*'sha256'/);
  assert.match(migration, /unique \(draft_id, draft_revision, attempt_generation\)/);
  assert.match(migration, /on conflict \(draft_id, draft_revision, attempt_generation\) do nothing/);
});

test("TypeScript and SQL use the same caption-bound dispatch identity", () => {
  const contract = readFileSync(new URL("../lib/touchlineArena/social-publication-contract.ts", import.meta.url), "utf8");
  assert.match(contract, /touchlineSocialDispatchIdempotencyKey[\s\S]*input\.publicationKey,[\s\S]*input\.manifestChecksum,[\s\S]*input\.artifactChecksum,[\s\S]*input\.captionChecksum,[\s\S]*input\.artifactBucket,[\s\S]*input\.artifactObjectKey,[\s\S]*input\.destinationKey/);
  assert.match(contract, /captionChecksum: input\.draft\.captionChecksum/);
  assert.match(migration, /v_draft\.publication_key \|\| ':' \|\| v_draft\.approved_manifest_checksum \|\| ':'[\s\S]*v_draft\.approved_artifact_checksum \|\| ':'[\s\S]*v_draft\.approved_caption_checksum \|\| ':'[\s\S]*v_draft\.artifact_storage_bucket \|\| ':' \|\| v_draft\.artifact_storage_key \|\| ':'[\s\S]*TOUCHLINE_OFFICIAL_INSTAGRAM/);
});

test("dispatch can be enqueued and completed only through guarded RPCs", () => {
  assert.match(migration, /TL_SOCIAL_DISPATCH_RPC_REQUIRED/);
  assert.match(migration, /touchline_social_enqueue_dispatch/);
  assert.match(migration, /touchline_social_complete_dispatch/);
  assert.match(migration, /TL_SOCIAL_DISPATCH_APPROVAL_MISMATCH/);
  assert.match(migration, /TL_SOCIAL_DISPATCH_IDENTITY_IMMUTABLE/);
  assert.match(migration, /TL_SOCIAL_DISPATCH_IDENTITY_MISMATCH/);
  assert.match(migration, /v_latest\.artifact_storage_key/);
  assert.match(migration, /v_draft\.artifact_storage_key/);
  assert.match(migration, /touchline_social_enqueue_dispatch\(uuid, text\)/);
  assert.match(migration, /p_connection_id is distinct from 'TOUCHLINE_OFFICIAL_INSTAGRAM'/);
  assert.match(migration, /drop function if exists public\.touchline_social_enqueue_dispatch\(uuid, text, text\)/);
  assert.doesNotMatch(migration, /create or replace function public\.touchline_social_enqueue_dispatch\(\s*p_draft_id uuid,\s*p_connection_id text,\s*p_/);
  assert.doesNotMatch(migration, /grant execute on function public\.touchline_social_enqueue_dispatch\(uuid, text, text\)/);
  assert.match(migration, /touchline_social_claim_dispatch/);
  assert.match(migration, /claim_token uuid/);
  assert.match(migration, /claim_expires_at timestamptz/);
  assert.match(migration, /'claimToken', v_claim_token/);
  assert.match(migration, /TL_SOCIAL_DISPATCH_CLAIM_EXPIRED/);
  assert.match(migration, /touchline_social_recover_expired_dispatch/);
  assert.match(migration, /CLAIM_LEASE_EXPIRED/);
  assert.match(migration, /state = 'DELIVERY_UNKNOWN'/);
  assert.match(migration, /if v_attempt\.state <> 'PENDING'/);
  assert.match(migration, /if v_attempt\.state <> 'IN_FLIGHT'/);
  assert.match(migration, /p_result_state not in \('SENT', 'FAILED', 'DELIVERY_UNKNOWN'\)/);
  assert.match(migration, /v_current_generated_draft_id is distinct from v_draft\.id/);
});

test("owner review capability is separated from the service-role generator", () => {
  assert.match(migration, /touchline_social_require_owner_actor/);
  assert.match(migration, /v_authenticated_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /touchline_social_owner_approvers/);
  assert.match(migration, /touchline_social_issue_review_intent/);
  assert.match(migration, /v_authenticated_user_id is distinct from p_actor_id/);
  assert.match(migration, /revoke all on function public\.touchline_social_approve_artwork\(uuid, uuid, text, text, text, text, uuid\) from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.touchline_social_approve_artwork\(uuid, uuid, text, text, text, text, uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.touchline_social_issue_review_intent\(uuid, text, text, text, text, text, uuid\) to service_role/);
  assert.match(migration, /grant execute on function public\.touchline_social_enqueue_dispatch\(uuid, text\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.touchline_social_(?:approve_artwork|approve_caption|cancel_draft|enqueue_dispatch)[^;]*to service_role/);
});

test("social approvers are frozen from one exact independently verifiable QA manifest", () => {
  assert.match(migration, /TL_SOCIAL_OWNER_APPROVER_MANIFEST_MISMATCH/);
  assert.match(migration, /select count\(\*\) from public\.touchline_platform_owner_accounts\) <> 1/);
  assert.match(migration, /v_expected_user_id constant uuid := '60277b78-1e65-4e2e-89f0-67e7b819ed24'/);
  assert.match(migration, /v_expected_email constant text := 'admin@touchline\.com\.br'/);
  assert.match(migration, /auth_user\.email_confirmed_at is not null/);
  assert.match(migration, /TL_SOCIAL_OWNER_APPROVER_SNAPSHOT_MISMATCH/);
});

test("semantic feed updates atomically invalidate generation and fenced dispatch", () => {
  assert.match(migration, /touchline_social_invalidate_on_fixture_feed_change/);
  assert.match(migration, /after update of fixture_payload, lineups_payload, formations_payload, sidelined_payload, events_payload/);
  assert.match(migration, /OFFICIAL_SOURCE_FEED_CHANGED/);
  assert.match(migration, /OFFICIAL_SOURCE_CHANGED_DURING_CLAIM/);
  assert.match(migration, /touchline_social_fixture_feed_identity_revision/);
  assert.match(migration, /after update of provider, provider_fixture_id/);
  assert.match(migration, /if old\.provider = 'sportmonks'/);
  assert.match(migration, /if new\.provider = 'sportmonks'/);
  assert.match(migration, /coalesce\(v_row ->> 'provider', 'sportmonks'\) is distinct from 'sportmonks'/);
  assert.match(migration, /review_state = 'REVIEW_REQUIRED'/);
  const invalidationStart = migration.indexOf("create or replace function public.touchline_social_invalidate_on_fixture_feed_change");
  const invalidationEnd = migration.indexOf("create or replace function public.touchline_social_guard_generation_cycle_mutation", invalidationStart);
  const invalidation = migration.slice(invalidationStart, invalidationEnd);
  assert.doesNotMatch(invalidation, /last_synced_at|updated_at/);
  for (const functionName of ["touchline_social_claim_dispatch", "touchline_social_complete_dispatch"]) {
    const start = migration.indexOf(`create or replace function public.${functionName}`);
    const end = migration.indexOf("\ncreate or replace function public.", start + 1);
    const block = migration.slice(start, end > start ? end : undefined);
    const generationLock = block.indexOf("touchline-social-generation:");
    const draftLock = block.indexOf("touchline-social-draft:");
    const dispatchLock = block.indexOf("touchline-social-dispatch:");
    assert.ok(
      generationLock >= 0 && generationLock < draftLock && draftLock < dispatchLock,
      `${functionName} must acquire generation, draft and dispatch identities in that order`,
    );
  }
  assert.match(rollback, /drop trigger if exists touchline_social_fixture_feed_invalidation/);
  assert.match(rollback, /drop trigger if exists touchline_social_fixture_feed_identity_revision/);
  assert.match(rollback, /drop function if exists public\.touchline_social_invalidate_on_fixture_feed_change\(\)/);
});

test("all draft workflows obey source to generation to draft lock order", () => {
  for (const functionName of [
    "touchline_social_issue_review_intent",
    "touchline_social_approve_artwork",
    "touchline_social_approve_caption",
    "touchline_social_cancel_draft",
    "touchline_social_enqueue_dispatch",
    "touchline_social_claim_dispatch",
    "touchline_social_complete_dispatch",
  ]) {
    const start = migration.indexOf(`create or replace function public.${functionName}`);
    const end = migration.indexOf("\ncreate or replace function public.", start + 1);
    const block = migration.slice(start, end > start ? end : undefined);
    const sourceLock = block.indexOf("touchline-social-source-revision");
    const generationLock = block.indexOf("touchline-social-generation:");
    const draftLock = block.indexOf("touchline-social-draft:");
    assert.ok(sourceLock >= 0, `${functionName} must acquire the semantic source fence`);
    assert.ok(
      sourceLock < generationLock && generationLock < draftLock,
      `${functionName} must acquire source, generation and draft locks in that order`,
    );
    const dispatchLock = block.indexOf("touchline-social-dispatch:");
    if (dispatchLock >= 0) {
      assert.ok(draftLock < dispatchLock, `${functionName} must acquire attempt identity last`);
    }
  }
});

test("failed delivery retries are bounded, pre-dispatch only and cannot duplicate an uncertain publication", () => {
  assert.match(migration, /attempt_generation between 1 and 3/);
  assert.match(migration, /failure_stage = 'PRE_DISPATCH'/);
  assert.match(migration, /TL_SOCIAL_FAILED_MUST_BE_PRE_DISPATCH/);
  assert.match(migration, /TL_SOCIAL_DELIVERY_RECONCILIATION_REQUIRED/);
  assert.match(migration, /TL_SOCIAL_RETRY_EXHAUSTED/);
  assert.match(migration, /v_attempt_generation := v_latest\.attempt_generation \+ 1/);
  assert.match(migration, /v_latest\.idempotency_key <> v_idempotency_key/);
  assert.match(migration, /touchline_social_dispatch_external_publication_uidx/);
});

test("tables are service-role only and direct updates remain unavailable", () => {
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all privileges[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on table public\.touchline_social_publication_drafts to service_role/);
  assert.match(migration, /touchline_social_create_draft\(p_draft jsonb\)/);
  assert.match(migration, /TL_SOCIAL_DRAFT_CREATE_RPC_REQUIRED/);
  assert.doesNotMatch(migration, /grant[^;]*insert[^;]*touchline_social_publication_drafts to service_role/i);
  assert.match(migration, /grant select on table public\.touchline_social_dispatch_attempts to service_role/);
  assert.match(migration, /grant select on table public\.touchline_social_generation_reviews to service_role/);
  assert.doesNotMatch(migration, /grant[^;]*update[^;]*touchline_social_publication_drafts/i);
  assert.doesNotMatch(migration, /grant[^;]*insert[^;]*touchline_social_dispatch_attempts/i);
});

test("disposable SQL shadow covers all source relations, reclassification and eight RLS tables", () => {
  const semanticShadow = readFileSync(
    new URL("../supabase/tests/039_shadow_semantic_revision_verification.sql", import.meta.url),
    "utf8",
  );
  for (const relation of [
    "football_fantasy_fixture_feeds",
    "football_competitions",
    "football_seasons",
    "football_rounds",
    "football_clubs",
    "football_players",
    "football_squad_members",
    "football_fixtures",
    "football_fixture_lifecycle_events",
    "football_player_season_statistics",
    "touchline_player_fixture_score_settlements",
    "touchline_card_publications",
    "football_player_market_values",
    "touchline_card_editorial_overrides",
    "touchline_formation_geometry_versions",
    "touchline_coach_ranking_snapshots",
    "touchline_coach_ranking_active_snapshots",
    "touchline_card_ranking_snapshots",
    "touchline_card_ranking_active_snapshots",
  ]) {
    assert.match(semanticShadow, new RegExp(`public\\.${relation}`));
  }
  assert.match(semanticShadow, /fixture_feed_provider_reclassification/);
  assert.match(semanticShadow, /generic_provider_reclassification/);
  assert.match(shadowRetry, /having count\(\*\) = 8/);
});

test("missing lineup assets enter an audited REVIEW_REQUIRED queue", () => {
  assert.match(migration, /create table public\.touchline_social_generation_reviews/);
  assert.match(migration, /TL_SOCIAL_039_REQUIRES_FRESH_SCHEMA/);
  assert.match(migration, /review_state in \('REVIEW_REQUIRED', 'GENERATING', 'GENERATED'\)/);
  assert.match(migration, /touchline_social_claim_generation/);
  assert.match(migration, /touchline_social_complete_generation/);
  assert.match(migration, /input_checksum text not null/);
  assert.match(migration, /noop_current/);
  assert.match(migration, /next_eligible_at/);
  assert.match(migration, /touchline_social_claim_generation_cycle/);
  assert.match(migration, /touchline_social_renew_generation_cycle/);
  assert.match(migration, /touchline_social_complete_generation_cycle/);
  assert.match(migration, /'outcome', 'created'/);
  assert.match(migration, /TL_SOCIAL_GENERATION_LEASE_INVALID/);
  assert.match(migration, /TL_SOCIAL_GENERATION_DRAFT_IDENTITY_MISMATCH/);
  assert.match(migration, /TL_SOCIAL_GENERATION_REVIEW_DELETE_FORBIDDEN/);
  assert.match(migration, /TL_SOCIAL_GENERATION_REVIEW_RPC_REQUIRED/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /grant execute on function public\.touchline_social_claim_generation/);
  assert.match(migration, /grant execute on function public\.touchline_social_complete_generation/);
  assert.doesNotMatch(migration, /grant execute on function public\.touchline_social_record_generation_review/);
  assert.doesNotMatch(migration, /grant[^;]*(?:insert|update|delete)[^;]*touchline_social_generation_reviews to service_role/i);
  assert.match(migration, /TL_SOCIAL_GENERATION_NOT_CURRENT/);
  assert.match(migration, /p_first_observed_at > clock_timestamp\(\) - interval '2 minutes'/);
  assert.match(migration, /TL_SOCIAL_CONTENT_TYPE_NOT_ENABLED/);
});

test("private Storage bucket is exact, content-addressed and only service-role policies exist", () => {
  assert.doesNotMatch(migration, /insert into storage\.buckets|update storage\.buckets|delete from storage\.buckets/i);
  assert.match(migration, /created first through the supported Storage API/);
  assert.match(migration, /allowed_mime_types @> array\['image\/png', 'image\/jpeg'\]/);
  assert.match(migration, /touchline_social_drafts_service_read[\s\S]*for select to service_role[\s\S]*bucket_id = 'touchline-social-drafts'/);
  assert.match(migration, /touchline_social_drafts_service_create[\s\S]*for insert to service_role[\s\S]*bucket_id = 'touchline-social-drafts'/);
  assert.doesNotMatch(migration, /on storage\.objects for (?:select|insert|update|delete) to (?:anon|authenticated)/i);
  assert.doesNotMatch(migration, /touchline_social_drafts[^;]*for (?:update|delete)/i);
});

test("the outbox copies the immutable artifact locator instead of a mutable render path", () => {
  assert.match(migration, /insert into public\.touchline_social_dispatch_attempts \([\s\S]*approved_caption_checksum,[\s\S]*artifact_storage_provider, artifact_storage_bucket, artifact_storage_key,[\s\S]*artifact_etag/);
  assert.match(migration, /v_draft\.artifact_storage_provider, v_draft\.artifact_storage_bucket,[\s\S]*v_draft\.artifact_storage_key, v_draft\.artifact_etag/);
  assert.match(migration, /worker must fetch that exact key[\s\S]*fully decode it and re-hash its bytes/i);
  assert.doesNotMatch(migration, /insert into public\.touchline_social_dispatch_attempts \([\s\S]{0,500}render_path/);
});

test("rollback preserves evidence by failing closed when audit or outbox is non-empty", () => {
  assert.match(rollback, /TL_SOCIAL_ROLLBACK_REQUIRES_EMPTY_AUDIT_OUTBOX/);
  assert.match(rollback, /exists \(select 1 from public\.touchline_social_dispatch_attempts/);
  assert.match(rollback, /exists \(select 1 from public\.touchline_social_publication_drafts/);
  assert.match(rollback, /exists \(select 1 from public\.touchline_social_generation_reviews/);
  assert.match(rollback, /exists \(select 1 from public\.touchline_social_generation_cycles/);
  assert.match(rollback, /lock table public\.touchline_social_dispatch_attempts in access exclusive mode/);
  assert.match(rollback, /TL_SOCIAL_ROLLBACK_REQUIRES_STORAGE_BUCKET_REMOVED_VIA_API/);
  assert.doesNotMatch(rollback, /delete from storage\.buckets/i);
  assert.match(rollback, /drop function if exists public\.touchline_social_complete_dispatch/);
  assert.match(rollback, /drop function if exists public\.touchline_social_claim_generation/);
  assert.match(rollback, /drop function if exists public\.touchline_social_complete_generation/);
  assert.doesNotMatch(rollback, /truncate|delete from public\.touchline_social_(?:dispatch_attempts|publication_drafts)/i);
});

test("shadow SQL refuses every non-local or unidentified database before mutation", () => {
  for (const source of [shadowBootstrap, shadowConcurrency]) {
    const guard = source.indexOf("TL_SOCIAL_039_SHADOW_LOCAL_IDENTITY_REQUIRED");
    const firstMutation = Math.min(...[
      source.indexOf("create role"),
      source.indexOf("create table"),
      source.indexOf("insert into"),
    ].filter((index) => index >= 0));
    assert.ok(guard >= 0 && guard < firstMutation);
    assert.match(source, /touchline\.shadow_039_ack/);
    assert.match(source, /LOCAL_EMPTY_CLUSTER_ONLY/);
    assert.match(source, /touchline_social_shadow_039_/);
    assert.match(source, /inet_server_addr\(\)/);
  }
});

test("disposable shadow proves negative guards, concurrent approvals and source-claim invalidation", () => {
  assert.match(shadowRetry, /SHADOW_039_UNSTABLE_SOURCE_ACCEPTED/);
  assert.match(shadowRetry, /SHADOW_039_STALE_GENERATION_HEALTH_ACCEPTED/);
  assert.match(shadowRetry, /SHADOW_039_CONSUMED_INTENT_REPLAYED/);
  assert.match(shadowRetry, /SHADOW_039_FINAL_SCORE_ENQUEUE_ALLOWED/);
  assert.match(shadowRetry, /SHADOW_039_WRONG_CLAIM_TOKEN_ACCEPTED/);
  assert.match(shadowRetry, /SHADOW_039_COMPLETION_REPLAY_ACCEPTED/);
  assert.match(shadowRetry, /touchline_social_recover_expired_dispatch/);
  assert.match(shadowVerifier, /Promise\.all\(\[\s*psqlText\(concurrencyDatabase, artworkApprovalSql\),\s*psqlText\(concurrencyDatabase, captionApprovalSql\)/);
  assert.match(shadowVerifier, /enqueueClaimLockOrder/);
  assert.match(shadowVerifier, /ENQUEUE_DID_NOT_HOLD_SOURCE_GENERATION_BEFORE_DRAFT/);
  assert.match(shadowVerifier, /CLAIM_DID_NOT_WAIT_FOR_GENERATION_AFTER_SOURCE/);
  assert.match(shadowVerifier, /hashtextextended\('touchline-social-source-revision'/);
  assert.match(shadowVerifier, /hashtextextended\('touchline-social-generation:19722192:19:touchline-lineup-feed-v1'/);
  assert.match(shadowVerifier, /hashtextextended\('touchline-social-draft:\$\{draftId\}'/);
  assert.match(shadowVerifier, /pg_catalog\.pg_cancel_backend\(\$\{blockerPid\}\)/);
  assert.doesNotMatch(shadowVerifier, /SHADOW_039_GENERATION_LOCK_ACQUIRED/);
  assert.match(shadowVerifier, /postLockOrderState/);
  assert.match(shadowVerifier, /sourceClaimRace/);
  assert.match(shadowVerifier, /fixtureSeasonIsolation/);
  assert.match(shadowVerifier, /UNRELATED_SEASON_INVALIDATED_DRAFT/);
  assert.match(shadowVerifier, /rollbackAuditGuard: "FAIL_CLOSED"/);
  assert.match(shadowVerifier, /rollbackBucketGuard: "FAIL_CLOSED"/);
  assert.match(shadowVerifier, /rollbackAuditDatabase, "supabase\/tests\/039_shadow_concurrency_setup\.sql"/);
  assert.match(shadowVerifier, /touchline_social_dispatch_attempts where draft_id = '\$\{rollbackAuditDraftId\}'/);
  assert.match(shadowVerifier, /TL_SOCIAL_SHADOW_ROLLBACK_AUDIT_NOT_ISOLATED/);
  assert.match(shadowVerifier, /delete from public\.touchline_social_generation_reviews/);
  assert.match(shadowVerifier, /delete from public\.touchline_social_generation_cycles/);
  assert.match(shadowVerifier, /TL_SOCIAL_SHADOW_ROLLBACK_AUDIT_GUARD_MUTATED_STATE/);
  assert.match(shadowVerifier, /REVIEW_REQUIRED\\\|\(INVALIDATED\|DELIVERY_UNKNOWN\)/);
});
