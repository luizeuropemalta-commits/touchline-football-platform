begin;

select public.touchline_assert_qa_fixture_target('xgxbwqxjssxxuihuwmgy');

select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-source-revision', 0));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-044-executor:SCHEDULER', 0));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('touchline-social-044-executor:RUNNER', 0));
lock table public.touchline_social_ranking_executor_cycles,
  public.touchline_social_ranking_generation_jobs,
  public.touchline_social_ranking_review_intents in access exclusive mode;
lock table public.touchline_social_publication_drafts in share row exclusive mode;

do $$
begin
  if exists (select 1 from public.touchline_social_ranking_generation_jobs)
     or exists (select 1 from public.touchline_social_ranking_review_intents)
     or exists (select 1 from public.touchline_social_ranking_executor_cycles
       where lease_token is not null or run_count > 0)
     or exists (select 1 from public.touchline_social_publication_drafts where content_type in (
       'GAMEWEEK_RANKING_PREVIEW','GAMEWEEK_RANKING_FINAL','PLAYER_DUEL',
       'GAMEWEEK_HERO','TOP_PERFORMER','HAT_TRICK_HERO'
     )) then
    raise exception 'TL_SOCIAL_044_ROLLBACK_NONEMPTY';
  end if;
end
$$;

-- Restore the exact 043 approval dispatcher.
create or replace function public.touchline_social_guard_executor_draft_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.artwork_approval_state = 'APPROVED'
        and old.artwork_approval_state is distinct from new.artwork_approval_state)
     or (new.caption_approval_state = 'APPROVED'
        and old.caption_approval_state is distinct from new.caption_approval_state) then
    if new.content_type in ('GOAL_CONFIRMED', 'RED_CARD_CONFIRMED') then
      perform public.touchline_social_043_assert_approval_gate(new.id);
    elsif new.content_type in ('FULL_TIME', 'FINAL_SCORE') then
      perform public.touchline_social_042_assert_approval_gate(new.id);
    elsif new.content_type = 'MATCH_PREVIEW' then
      perform public.touchline_social_041_assert_approval_gate(new.id);
    else
      perform public.touchline_social_assert_executor_approval_gate(new.id);
    end if;
  end if;
  return new;
end
$$;

drop function if exists public.touchline_social_044_enqueue_dispatch(uuid);
drop function if exists public.touchline_social_044_approve(uuid, uuid, text, text, text, text, text, uuid);
drop function if exists public.touchline_social_044_issue_review_intent(uuid, text, text, text, text, text, uuid);
drop function if exists public.touchline_social_044_assert_approval_gate(uuid);
drop function if exists public.touchline_social_044_complete_job(uuid, uuid, uuid, text, text, uuid);
drop function if exists public.touchline_social_044_renew_job(uuid, uuid, uuid);
drop function if exists public.touchline_social_044_claim_job(uuid);
drop function if exists public.touchline_social_044_enqueue_job(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, jsonb, text
);
drop function if exists public.touchline_social_044_complete_cycle(text, uuid, text, text, integer);
drop function if exists public.touchline_social_044_renew_cycle(text, uuid);
drop function if exists public.touchline_social_044_claim_cycle(text);
drop function if exists public.touchline_social_044_create_draft(jsonb);

drop table public.touchline_social_ranking_review_intents;
drop table public.touchline_social_ranking_generation_jobs;
drop table public.touchline_social_ranking_executor_cycles;
drop function if exists public.touchline_social_044_guard_job_mutation();
drop function if exists public.touchline_social_044_guard_cycle_mutation();

drop trigger if exists touchline_social_044_draft_identity_guard
  on public.touchline_social_publication_drafts;
drop function if exists public.touchline_social_044_guard_draft_identity();

alter table public.touchline_social_publication_drafts
  drop constraint touchline_social_drafts_044_object_key_check,
  drop constraint touchline_social_drafts_044_publication_key_check,
  drop constraint touchline_social_drafts_044_render_path_check,
  drop constraint touchline_social_drafts_044_placement_check,
  drop constraint touchline_social_drafts_044_input_check,
  drop constraint touchline_social_drafts_044_relation_check,
  drop constraint touchline_social_drafts_044_subject_player_id_check,
  drop constraint touchline_social_drafts_044_scope_id_check,
  drop constraint touchline_social_drafts_044_content_type_check,
  drop column subject_player_provider_id,
  drop column scope_provider_id,
  add constraint touchline_social_drafts_043_content_type_check
    check (content_type in ('LINEUP', 'MATCH_PREVIEW', 'FULL_TIME', 'FINAL_SCORE', 'GOAL_CONFIRMED', 'RED_CARD_CONFIRMED')),
  add constraint touchline_social_drafts_043_relation_check
    check (
      (content_type = 'LINEUP' and team_provider_id is not null and event_provider_id is null)
      or (content_type in ('MATCH_PREVIEW', 'FULL_TIME', 'FINAL_SCORE')
        and team_provider_id is null and event_provider_id is null)
      or (content_type in ('GOAL_CONFIRMED', 'RED_CARD_CONFIRMED')
        and team_provider_id is null and event_provider_id is not null)
    ),
  add constraint touchline_social_drafts_043_input_check
    check (content_type not in ('LINEUP', 'MATCH_PREVIEW', 'FULL_TIME', 'FINAL_SCORE', 'GOAL_CONFIRMED', 'RED_CARD_CONFIRMED')
      or input_checksum = source_checksum),
  add constraint touchline_social_drafts_043_placement_check
    check (
      (content_type in ('LINEUP', 'MATCH_PREVIEW', 'FULL_TIME') and placement = 'INSTAGRAM_FEED')
      or (content_type in ('FINAL_SCORE', 'GOAL_CONFIRMED', 'RED_CARD_CONFIRMED') and placement = 'INSTAGRAM_STORY')
    ),
  add constraint touchline_social_drafts_043_render_path_check
    check (render_path = case content_type
      when 'LINEUP' then '/visual-qa/social-lineup?fixtureId=' || fixture_provider_id
        || '&teamId=' || team_provider_id || '&locale=' || locale || '&revision=' || revision::text
      when 'FINAL_SCORE' then '/visual-qa/social-final-score?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'MATCH_PREVIEW' then '/visual-qa/social-match-preview?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'FULL_TIME' then '/visual-qa/social-full-time?fixtureId=' || fixture_provider_id
        || '&locale=' || locale || '&revision=' || revision::text
      when 'GOAL_CONFIRMED' then '/visual-qa/social-confirmed-event?fixtureId=' || fixture_provider_id
        || '&eventId=' || event_provider_id || '&locale=' || locale || '&revision=' || revision::text
      when 'RED_CARD_CONFIRMED' then '/visual-qa/social-confirmed-event?fixtureId=' || fixture_provider_id
        || '&eventId=' || event_provider_id || '&locale=' || locale || '&revision=' || revision::text
    end),
  add constraint touchline_social_drafts_043_publication_key_check
    check (publication_key = 'instagram:' || placement || ':' || content_type || ':'
      || fixture_provider_id || ':' || coalesce(event_provider_id, team_provider_id, 'fixture') || ':'
      || locale || ':tv=' || template_version || ':sv=' || source_version
      || ':r=' || revision::text),
  add constraint touchline_social_drafts_043_object_key_check
    check (artifact_storage_key = 'instagram/' || lower(placement) || '/'
      || lower(content_type) || '/' || fixture_provider_id || '/'
      || coalesce(event_provider_id, team_provider_id, 'fixture') || '/' || locale || '/tv='
      || template_version || '/sv=' || source_version || '/r=' || revision::text || '/'
      || substring(artifact_checksum from 8)
      || case artifact_content_type when 'image/png' then '.png' else '.jpg' end);

alter table public.touchline_social_source_revisions
  drop constraint touchline_social_source_revisions_044_source_key_check,
  add constraint touchline_social_source_revisions_043_source_key_check check (
    source_key ~ '^(fixture-provider|fixture-event|fixture|competition|season|round|club|player|formation|coach-ranking|card-ranking|league-table):[A-Za-z0-9._-]{1,160}$'
  );

commit;
