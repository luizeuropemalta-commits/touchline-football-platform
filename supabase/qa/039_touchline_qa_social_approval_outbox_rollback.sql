-- QA-only rollback. Audit/outbox rows and stored media are evidence and may
-- never be dropped. The rollback fails closed unless all candidate state is
-- empty, including the private Storage bucket.
begin;
set local lock_timeout = '5s';
select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-schema-039', 0));

lock table public.touchline_social_dispatch_attempts in access exclusive mode;
lock table public.touchline_social_review_intents in access exclusive mode;
lock table public.touchline_social_generation_reviews in access exclusive mode;
lock table public.touchline_social_generation_cycles in access exclusive mode;
lock table public.touchline_social_publication_drafts in access exclusive mode;
lock table public.touchline_social_source_revisions in access exclusive mode;
lock table public.touchline_social_source_clock in access exclusive mode;

do $$
begin
  if exists (select 1 from public.touchline_social_dispatch_attempts limit 1)
     or exists (select 1 from public.touchline_social_review_intents limit 1)
     or exists (select 1 from public.touchline_social_generation_reviews limit 1)
     or exists (select 1 from public.touchline_social_generation_cycles limit 1)
     or exists (select 1 from public.touchline_social_publication_drafts limit 1) then
    raise exception 'TL_SOCIAL_ROLLBACK_REQUIRES_EMPTY_AUDIT_OUTBOX';
  end if;
  if exists (select 1 from storage.buckets where id = 'touchline-social-drafts') then
    raise exception 'TL_SOCIAL_ROLLBACK_REQUIRES_STORAGE_BUCKET_REMOVED_VIA_API';
  end if;
end;
$$;

drop trigger if exists touchline_social_dispatch_attempts_guard
  on public.touchline_social_dispatch_attempts;
drop trigger if exists touchline_social_publication_drafts_guard
  on public.touchline_social_publication_drafts;
drop trigger if exists touchline_social_generation_reviews_guard
  on public.touchline_social_generation_reviews;
drop trigger if exists touchline_social_generation_cycles_guard
  on public.touchline_social_generation_cycles;
drop trigger if exists touchline_social_fixture_feed_invalidation
  on public.football_fantasy_fixture_feeds;
drop trigger if exists touchline_social_fixture_feed_identity_revision
  on public.football_fantasy_fixture_feeds;
drop trigger if exists touchline_social_fixture_feed_presence_revision
  on public.football_fantasy_fixture_feeds;
do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'football_competitions','football_seasons','football_rounds','football_clubs',
    'football_players','football_squad_members','football_fixtures',
    'football_fixture_lifecycle_events','football_player_season_statistics',
    'touchline_player_fixture_score_settlements','touchline_card_publications',
    'football_player_market_values','touchline_card_editorial_overrides',
    'touchline_formation_geometry_versions','touchline_coach_ranking_snapshots',
    'touchline_coach_ranking_active_snapshots','touchline_card_ranking_snapshots',
    'touchline_card_ranking_active_snapshots'
  ]::text[]
  loop
    execute pg_catalog.format(
      'drop trigger if exists %I on public.%I',
      'tls_social_revision_' || v_table_name,
      v_table_name
    );
  end loop;
end;
$$;
drop function if exists public.touchline_social_claim_dispatch(uuid, text);
drop function if exists public.touchline_social_complete_dispatch(uuid, text, uuid, text, text, text, text);
drop function if exists public.touchline_social_recover_expired_dispatch(uuid, text);
drop function if exists public.touchline_social_enqueue_dispatch(uuid, text);
drop function if exists public.touchline_social_cancel_draft(uuid, uuid);
drop function if exists public.touchline_social_approve_caption(uuid, uuid, text, text, text, text, uuid);
drop function if exists public.touchline_social_approve_artwork(uuid, uuid, text, text, text, text, uuid);
drop function if exists public.touchline_social_issue_review_intent(uuid, text, text, text, text, text, uuid);
drop function if exists public.touchline_social_require_owner_actor(uuid);
drop function if exists public.touchline_social_complete_generation(text, text, text, uuid, text, text, uuid, text, text);
drop function if exists public.touchline_social_complete_generation_cycle(uuid, text);
drop function if exists public.touchline_social_renew_generation_cycle(uuid);
drop function if exists public.touchline_social_claim_generation_cycle();
drop function if exists public.touchline_social_renew_generation(text, text, text, uuid);
drop function if exists public.touchline_social_claim_generation(text, text, text, timestamptz, text, jsonb, text);
drop function if exists public.touchline_social_claim_generation(text, text, text, timestamptz, text);
drop function if exists public.touchline_social_claim_generation(text, text, text, timestamptz);
drop function if exists public.touchline_social_record_generation_review(text, text, text, timestamptz, text, text, uuid);
drop function if exists public.touchline_social_create_draft(jsonb);
drop function if exists public.touchline_social_guard_generation_review_mutation();
drop function if exists public.touchline_social_invalidate_on_fixture_feed_change();
drop function if exists public.touchline_social_track_render_dependency();
drop function if exists public.touchline_social_bump_source_revisions(text[], text);
drop function if exists public.touchline_social_read_source_revision(text[]);
drop function if exists public.touchline_social_source_revision_is_current(jsonb, text);
drop function if exists public.touchline_social_guard_generation_cycle_mutation();
drop function if exists public.touchline_social_guard_dispatch_mutation();
drop function if exists public.touchline_social_guard_draft_mutation();
drop table public.touchline_social_dispatch_attempts;
drop table public.touchline_social_review_intents;
drop table public.touchline_social_generation_reviews;
drop table public.touchline_social_generation_cycles;
drop table public.touchline_social_publication_drafts;
drop table public.touchline_social_owner_approvers;
drop table public.touchline_social_source_revisions;
drop table public.touchline_social_source_clock;
drop function if exists public.touchline_social_jsonb_object_length(jsonb);
drop policy if exists touchline_social_drafts_service_create on storage.objects;
drop policy if exists touchline_social_drafts_service_read on storage.objects;
commit;
